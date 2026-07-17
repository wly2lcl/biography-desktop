use futures::StreamExt;
use reqwest::{redirect::Policy, RequestBuilder, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{Duration, Instant, SystemTime};
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::{watch, Mutex};

use super::config::read_api_key;
use super::key_scope::{is_stable_provider, resolve_endpoint};

const PRE_CANCEL_TTL: Duration = Duration::from_secs(300);
const MAX_PRE_CANCELLED: usize = 256;

#[derive(Default)]
struct RequestRegistry {
    active: HashMap<String, watch::Sender<bool>>,
    pre_cancelled: HashMap<String, Instant>,
}

#[derive(Default)]
pub struct LlmTransportState {
    requests: Mutex<RequestRegistry>,
}

fn prune_pre_cancelled(registry: &mut RequestRegistry) {
    registry
        .pre_cancelled
        .retain(|_, created_at| created_at.elapsed() < PRE_CANCEL_TTL);
}

fn register_request(
    registry: &mut RequestRegistry,
    request_id: &str,
    cancel_tx: watch::Sender<bool>,
) -> bool {
    prune_pre_cancelled(registry);
    if registry.pre_cancelled.remove(request_id).is_some() {
        true
    } else {
        registry.active.insert(request_id.to_string(), cancel_tx);
        false
    }
}

fn mark_request_cancelled(
    registry: &mut RequestRegistry,
    request_id: String,
) -> Result<(), String> {
    prune_pre_cancelled(registry);
    if let Some(sender) = registry.active.get(&request_id) {
        sender.send(true).map_err(|error| error.to_string())?;
        return Ok(());
    }
    if registry.pre_cancelled.len() >= MAX_PRE_CANCELLED {
        if let Some(oldest) = registry
            .pre_cancelled
            .iter()
            .min_by_key(|(_, created_at)| *created_at)
            .map(|(request_id, _)| request_id.clone())
        {
            registry.pre_cancelled.remove(&oldest);
        }
    }
    registry.pre_cancelled.insert(request_id, Instant::now());
    Ok(())
}

#[derive(Debug)]
struct TransportError {
    code: String,
    message: String,
    status: Option<u16>,
    retry_after_ms: Option<u64>,
}

impl TransportError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            status: None,
            retry_after_ms: None,
        }
    }

    fn http(
        code: &str,
        message: impl Into<String>,
        status: u16,
        retry_after_ms: Option<u64>,
    ) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            status: Some(status),
            retry_after_ms,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStreamRequest {
    request_id: String,
    provider: String,
    base_url: String,
    model: String,
    messages: Vec<LlmMessage>,
    temperature: f64,
    max_tokens: u64,
    timeout: u64,
    #[serde(default)]
    ephemeral_api_key: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum LlmStreamEvent {
    Token {
        request_id: String,
        content: String,
    },
    Completed {
        request_id: String,
    },
    Error {
        request_id: String,
        code: String,
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<u16>,
        #[serde(skip_serializing_if = "Option::is_none")]
        retry_after_ms: Option<u64>,
    },
}

fn api_key(
    provider: &str,
    base_url: &str,
    ephemeral: Option<&str>,
) -> Result<Option<String>, String> {
    if let Some(key) = ephemeral.map(str::trim).filter(|key| !key.is_empty()) {
        return Ok(Some(key.to_string()));
    }
    let key = read_api_key(provider, base_url)?;
    if key.is_none() && is_stable_provider(provider) {
        return Err("尚未配置 API Key".to_string());
    }
    Ok(key)
}

fn build_client(timeout_ms: u64) -> Result<reqwest::Client, TransportError> {
    reqwest::Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_millis(timeout_ms.max(1)))
        .build()
        .map_err(|error| TransportError::new("network", error.to_string()))
}

fn map_send_error(error: reqwest::Error) -> TransportError {
    if error.is_timeout() {
        TransportError::new("timeout", "LLM 请求超时")
    } else {
        TransportError::new("network", error.to_string())
    }
}

async fn send_request(
    builder: RequestBuilder,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<Response, TransportError> {
    if *cancel_rx.borrow() {
        return Err(TransportError::new("cancelled", "请求已取消"));
    }
    let send = builder.send();
    tokio::pin!(send);
    loop {
        tokio::select! {
            response = &mut send => return response.map_err(map_send_error),
            changed = cancel_rx.changed() => {
                match changed {
                    Ok(()) if *cancel_rx.borrow() => {
                        return Err(TransportError::new("cancelled", "请求已取消"));
                    }
                    Ok(()) => {}
                    Err(_) => return send.await.map_err(map_send_error),
                }
            }
        }
    }
}

fn parse_retry_after(value: Option<&reqwest::header::HeaderValue>) -> Option<u64> {
    let value = value?.to_str().ok()?.trim();
    if let Ok(seconds) = value.parse::<u64>() {
        return Some(seconds.saturating_mul(1000));
    }
    let retry_at = httpdate::parse_http_date(value).ok()?;
    Some(
        retry_at
            .duration_since(SystemTime::now())
            .unwrap_or_default()
            .as_millis()
            .min(u64::MAX as u128) as u64,
    )
}

fn decode_utf8_chunk(pending: &mut Vec<u8>, bytes: &[u8], eof: bool) -> Result<String, String> {
    pending.extend_from_slice(bytes);
    match std::str::from_utf8(pending) {
        Ok(text) => {
            let decoded = text.to_string();
            pending.clear();
            Ok(decoded)
        }
        Err(error) if error.error_len().is_none() => {
            let valid_up_to = error.valid_up_to();
            let decoded = String::from_utf8(pending[..valid_up_to].to_vec())
                .map_err(|_| "流式响应包含无效 UTF-8".to_string())?;
            pending.drain(..valid_up_to);
            if eof && !pending.is_empty() {
                return Err("流式响应以不完整 UTF-8 字符结束".to_string());
            }
            Ok(decoded)
        }
        Err(_) => Err("流式响应包含无效 UTF-8".to_string()),
    }
}

fn take_sse_events(buffer: &mut String, flush: bool) -> Vec<String> {
    let mut normalized = String::with_capacity(buffer.len());
    let mut chars = buffer.chars().peekable();
    while let Some(character) = chars.next() {
        if character != '\r' {
            normalized.push(character);
            continue;
        }

        match chars.peek() {
            Some('\n') => {
                chars.next();
                normalized.push('\n');
            }
            Some(_) => normalized.push('\n'),
            None if flush => normalized.push('\n'),
            None => normalized.push('\r'),
        }
    }
    *buffer = normalized;
    let mut events = Vec::new();
    while let Some(index) = buffer.find("\n\n") {
        let raw = buffer[..index].to_string();
        buffer.drain(..index + 2);
        let data = raw
            .lines()
            .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
            .collect::<Vec<_>>()
            .join("\n");
        if !data.is_empty() {
            events.push(data);
        }
    }
    if flush && !buffer.trim().is_empty() {
        let raw = std::mem::take(buffer);
        let data = raw
            .lines()
            .filter_map(|line| line.strip_prefix("data:").map(str::trim_start))
            .collect::<Vec<_>>()
            .join("\n");
        if !data.is_empty() {
            events.push(data);
        }
    }
    events
}

fn parse_event(data: &str) -> Result<(Option<String>, bool), String> {
    if data.trim() == "[DONE]" {
        return Ok((None, true));
    }
    let value: Value =
        serde_json::from_str(data).map_err(|error| format!("无效 SSE JSON：{error}"))?;
    let choice = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first());
    let content = choice
        .and_then(|item| item.get("delta"))
        .and_then(|delta| delta.get("content"))
        .and_then(Value::as_str)
        .filter(|content| !content.is_empty())
        .map(str::to_string);
    let completed = choice
        .and_then(|item| item.get("finish_reason"))
        .and_then(Value::as_str)
        .is_some_and(|reason| !reason.is_empty());
    Ok((content, completed))
}

fn send_event(channel: &Channel<LlmStreamEvent>, event: LlmStreamEvent) -> Result<(), String> {
    channel.send(event).map_err(|error| error.to_string())
}

async fn run_stream(
    request: &LlmStreamRequest,
    channel: &Channel<LlmStreamEvent>,
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<(), TransportError> {
    let endpoint = resolve_endpoint(&request.provider, &request.base_url)
        .map_err(|message| TransportError::new("invalid_config", message))?;
    let key = api_key(
        &request.provider,
        &request.base_url,
        request.ephemeral_api_key.as_deref(),
    )
    .map_err(|message| TransportError::new("authentication", message))?;
    let client = build_client(request.timeout)?;
    let messages = request
        .messages
        .iter()
        .map(|message| json!({ "role": message.role, "content": message.content }))
        .collect::<Vec<_>>();
    let mut builder = client.post(endpoint).json(&json!({
        "model": request.model,
        "messages": messages,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
        "stream": true
    }));
    if let Some(key) = key {
        builder = builder.bearer_auth(key);
    }
    let response = send_request(builder, &mut cancel_rx).await?;

    if !response.status().is_success() {
        let status = response.status();
        let code = match status.as_u16() {
            401 | 403 => "authentication",
            429 => "rate_limit",
            value if value >= 500 => "server",
            _ => "invalid_response",
        };
        let retry_after_ms = if status.as_u16() == 429 {
            parse_retry_after(response.headers().get(reqwest::header::RETRY_AFTER))
        } else {
            None
        };
        return Err(TransportError::http(
            code,
            format!("模型服务返回 HTTP {status}"),
            status.as_u16(),
            retry_after_ms,
        ));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut utf8_pending = Vec::new();
    let mut received_content = false;
    let mut completed = false;

    while !completed {
        tokio::select! {
            changed = cancel_rx.changed() => {
                if changed.is_ok() && *cancel_rx.borrow() {
                    return Err(TransportError::new("cancelled", "请求已取消"));
                }
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        let decoded = decode_utf8_chunk(&mut utf8_pending, &bytes, false)
                            .map_err(|message| TransportError::new("invalid_response", message))?;
                        buffer.push_str(&decoded);
                        for data in take_sse_events(&mut buffer, false) {
                            let (content, done) = parse_event(&data)
                                .map_err(|message| TransportError::new("invalid_response", message))?;
                            if let Some(content) = content {
                                received_content = true;
                                send_event(channel, LlmStreamEvent::Token {
                                    request_id: request.request_id.clone(),
                                    content,
                                }).map_err(|message| TransportError::new("cancelled", message))?;
                            }
                            if done { completed = true; break; }
                        }
                    }
                    Some(Err(error)) => {
                        let code = if received_content {
                            "invalid_response"
                        } else if error.is_timeout() {
                            "timeout"
                        } else {
                            "network"
                        };
                        let message = if received_content {
                            "流式响应在完成标记前中断".to_string()
                        } else {
                            error.to_string()
                        };
                        return Err(TransportError::new(code, message));
                    }
                    None => {
                        let decoded = decode_utf8_chunk(&mut utf8_pending, &[], true)
                            .map_err(|message| TransportError::new("invalid_response", message))?;
                        buffer.push_str(&decoded);
                        for data in take_sse_events(&mut buffer, true) {
                            let (content, done) = parse_event(&data)
                                .map_err(|message| TransportError::new("invalid_response", message))?;
                            if let Some(content) = content {
                                received_content = true;
                                send_event(channel, LlmStreamEvent::Token {
                                    request_id: request.request_id.clone(),
                                    content,
                                }).map_err(|message| TransportError::new("cancelled", message))?;
                            }
                            completed |= done;
                        }
                        break;
                    }
                }
            }
        }
    }

    if !received_content {
        return Err(TransportError::new("invalid_response", "模型返回了空响应"));
    }
    if !completed {
        return Err(TransportError::new(
            "invalid_response",
            "流式响应在完成标记前结束",
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn stream_llm(
    state: State<'_, LlmTransportState>,
    request: LlmStreamRequest,
    on_event: Channel<LlmStreamEvent>,
) -> Result<(), String> {
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let cancelled_before_start = {
        let mut registry = state.requests.lock().await;
        register_request(&mut registry, &request.request_id, cancel_tx)
    };
    if cancelled_before_start {
        return send_event(
            &on_event,
            LlmStreamEvent::Error {
                request_id: request.request_id,
                code: "cancelled".to_string(),
                message: "请求已取消".to_string(),
                status: None,
                retry_after_ms: None,
            },
        );
    }
    let result = run_stream(&request, &on_event, cancel_rx).await;
    state
        .requests
        .lock()
        .await
        .active
        .remove(&request.request_id);

    match result {
        Ok(()) => send_event(
            &on_event,
            LlmStreamEvent::Completed {
                request_id: request.request_id,
            },
        ),
        Err(error) => send_event(
            &on_event,
            LlmStreamEvent::Error {
                request_id: request.request_id,
                code: error.code,
                message: error.message,
                status: error.status,
                retry_after_ms: error.retry_after_ms,
            },
        ),
    }
}

#[tauri::command]
pub async fn cancel_llm_request(
    state: State<'_, LlmTransportState>,
    request_id: String,
) -> Result<(), String> {
    let mut registry = state.requests.lock().await;
    mark_request_cancelled(&mut registry, request_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::oneshot;
    use tokio::time::{sleep, timeout};

    #[test]
    fn endpoint_security_matches_frontend_policy() {
        assert_eq!(
            resolve_endpoint("openai", "").unwrap().as_str(),
            "https://api.openai.com/v1/chat/completions"
        );
        assert!(resolve_endpoint("deepseek", "http://example.com").is_err());
        assert!(resolve_endpoint("deepseek", "http://localhost:8080").is_ok());
        assert!(resolve_endpoint("ollama", "http://localhost:11434").is_err());
        assert!(resolve_endpoint("openai", "https://user:pass@example.com").is_err());
    }

    #[test]
    fn cancellation_before_registration_is_consumed_without_activating_request() {
        let mut registry = RequestRegistry::default();
        mark_request_cancelled(&mut registry, "early".to_string()).unwrap();
        let (cancel_tx, _cancel_rx) = watch::channel(false);
        assert!(register_request(&mut registry, "early", cancel_tx));
        assert!(!registry.active.contains_key("early"));
        assert!(!registry.pre_cancelled.contains_key("early"));
    }

    #[test]
    fn retry_after_supports_seconds_http_dates_and_invalid_values() {
        use reqwest::header::HeaderValue;

        assert_eq!(
            parse_retry_after(Some(&HeaderValue::from_static("2"))),
            Some(2000)
        );
        let future = httpdate::fmt_http_date(SystemTime::now() + Duration::from_secs(60));
        let parsed = parse_retry_after(Some(&HeaderValue::from_str(&future).unwrap())).unwrap();
        assert!((58_000..=60_000).contains(&parsed));
        assert_eq!(
            parse_retry_after(Some(&HeaderValue::from_static("invalid"))),
            None
        );
    }

    #[test]
    fn sse_parser_handles_crlf_chunks_and_eof_remainder() {
        let mut buffer =
            "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\r\n\r\n".to_string();
        let events = take_sse_events(&mut buffer, false);
        assert_eq!(events.len(), 1);
        assert_eq!(
            parse_event(&events[0]).unwrap(),
            (Some("你".to_string()), false)
        );

        buffer.push_str("data: [DONE]");
        assert_eq!(take_sse_events(&mut buffer, true), vec!["[DONE]"]);
    }

    #[test]
    fn sse_parser_preserves_crlf_split_across_network_chunks() {
        let mut buffer =
            "data: {\"choices\":[{\"delta\":\r\ndata: {\"content\":\"你\"}}]}\r".to_string();

        assert!(take_sse_events(&mut buffer, false).is_empty());
        assert!(buffer.ends_with('\r'));

        buffer.push_str("\n\r\n");
        let events = take_sse_events(&mut buffer, false);
        assert_eq!(events.len(), 1);
        assert_eq!(
            parse_event(&events[0]).unwrap(),
            (Some("你".to_string()), false)
        );
        assert!(buffer.is_empty());
    }

    #[test]
    fn utf8_decoder_preserves_multibyte_characters_across_chunks() {
        let mut pending = Vec::new();
        let bytes = "你好".as_bytes();
        let mut decoded = String::new();
        for byte in bytes {
            decoded.push_str(&decode_utf8_chunk(&mut pending, &[*byte], false).unwrap());
        }
        decoded.push_str(&decode_utf8_chunk(&mut pending, &[], true).unwrap());
        assert_eq!(decoded, "你好");
        assert!(pending.is_empty());
    }

    #[test]
    fn utf8_decoder_rejects_invalid_and_incomplete_sequences() {
        let mut invalid = Vec::new();
        assert!(decode_utf8_chunk(&mut invalid, &[0xff], false).is_err());

        let mut incomplete = Vec::new();
        assert!(decode_utf8_chunk(&mut incomplete, &[0xe4, 0xbd], false).is_ok());
        assert!(decode_utf8_chunk(&mut incomplete, &[], true).is_err());
    }

    #[tokio::test]
    async fn http_client_does_not_follow_redirects() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0_u8; 2048];
            let _ = socket.read(&mut request).await.unwrap();
            socket
                .write_all(
                    b"HTTP/1.1 307 Temporary Redirect\r\nLocation: /unexpected\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await
                .unwrap();
            timeout(Duration::from_millis(150), listener.accept())
                .await
                .is_err()
        });

        let response = build_client(2_000)
            .unwrap()
            .post(format!("http://{address}/start"))
            .bearer_auth("secret")
            .body("private narrative")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::TEMPORARY_REDIRECT);
        assert!(
            server.await.unwrap(),
            "redirect target received a second request"
        );
    }

    #[tokio::test]
    async fn cancellation_interrupts_waiting_for_response_headers() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (accepted_tx, accepted_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            let (_socket, _) = listener.accept().await.unwrap();
            let _ = accepted_tx.send(());
            sleep(Duration::from_secs(2)).await;
        });
        let (cancel_tx, mut cancel_rx) = watch::channel(false);
        let cancel = tokio::spawn(async move {
            accepted_rx.await.unwrap();
            cancel_tx.send(true).unwrap();
        });

        let result = send_request(
            build_client(5_000)
                .unwrap()
                .get(format!("http://{address}/delayed")),
            &mut cancel_rx,
        )
        .await;
        assert!(matches!(result, Err(ref error) if error.code == "cancelled"));
        cancel.await.unwrap();
        server.abort();
    }
}
