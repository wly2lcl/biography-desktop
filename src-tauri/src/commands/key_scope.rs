#[cfg(feature = "local-model")]
use sha2::{Digest, Sha256};
#[cfg(feature = "local-model")]
use std::fmt::Write;
use std::net::{Ipv4Addr, Ipv6Addr};
use url::{Host, Url};

pub(crate) const KEYRING_SERVICE: &str = "biography-desktop";
pub(crate) const LEGACY_KEY_ACCOUNT: &str = "api-key";

fn provider_default(provider: &str) -> Option<&'static str> {
    match provider {
        "deepseek" => Some("https://api.deepseek.com"),
        "openai" => Some("https://api.openai.com/v1"),
        _ => None,
    }
}

pub(crate) fn is_stable_provider(provider: &str) -> bool {
    matches!(provider, "deepseek" | "openai")
}

pub(crate) fn normalize_provider_base(provider: &str, base_url: &str) -> Result<String, String> {
    let candidate = if let Some(default) = provider_default(provider) {
        if base_url.trim().is_empty() {
            default
        } else {
            base_url.trim()
        }
    } else {
        #[cfg(feature = "local-model")]
        if provider == "custom" {
            if base_url.trim().is_empty() {
                return Err("自定义提供商必须填写 Base URL".to_string());
            }
            base_url.trim()
        } else {
            return Err(format!("实验桌面版不支持提供商：{provider}"));
        }
        #[cfg(not(feature = "local-model"))]
        return Err(format!("稳定版不支持提供商：{provider}"));
    };

    let parsed = Url::parse(candidate).map_err(|_| "Base URL 格式无效".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Base URL 仅支持 HTTP 或 HTTPS".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Base URL 不能包含用户名或密码".to_string());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Base URL 不能包含查询参数或片段".to_string());
    }
    let is_loopback = match parsed.host() {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(host)) => host == Ipv4Addr::LOCALHOST,
        Some(Host::Ipv6(host)) => host == Ipv6Addr::LOCALHOST,
        None => false,
    };
    if parsed.scheme() == "http" && !is_loopback {
        return Err("远程 Base URL 必须使用 HTTPS".to_string());
    }

    let mut normalized = parsed.as_str().trim_end_matches('/').to_string();
    if normalized.to_ascii_lowercase().ends_with("/v1") {
        normalized.truncate(normalized.len() - 3);
    }
    Ok(normalized)
}

pub(crate) fn resolve_endpoint(provider: &str, base_url: &str) -> Result<Url, String> {
    let normalized = normalize_provider_base(provider, base_url)?;
    Url::parse(&format!("{normalized}/v1/chat/completions"))
        .map_err(|_| "无法构造 Chat Completions 地址".to_string())
}

pub(crate) fn api_key_account(provider: &str, _base_url: &str) -> Result<String, String> {
    if is_stable_provider(provider) {
        return Ok(format!("api-key:{provider}"));
    }

    #[cfg(feature = "local-model")]
    if provider == "custom" {
        let normalized = normalize_provider_base(provider, _base_url)?;
        let digest = Sha256::digest(normalized.as_bytes());
        let mut encoded = String::with_capacity(digest.len() * 2);
        for byte in digest {
            write!(&mut encoded, "{byte:02x}").map_err(|error| error.to_string())?;
        }
        return Ok(format!("api-key:custom:{encoded}"));
    }

    Err(format!("当前构建不支持提供商：{provider}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_key_accounts_are_provider_scoped() {
        assert_eq!(api_key_account("deepseek", "").unwrap(), "api-key:deepseek");
        assert_eq!(api_key_account("openai", "").unwrap(), "api-key:openai");
    }

    #[test]
    fn http_is_limited_to_exact_loopback_hosts() {
        assert!(normalize_provider_base("openai", "http://localhost:8080").is_ok());
        assert!(normalize_provider_base("openai", "http://127.0.0.1:8080").is_ok());
        assert!(normalize_provider_base("openai", "http://[::1]:8080").is_ok());
        assert!(normalize_provider_base("openai", "http://localhost.evil:8080").is_err());
        assert!(normalize_provider_base("openai", "http://127.0.0.2:8080").is_err());
    }

    #[cfg(feature = "local-model")]
    #[test]
    fn custom_key_accounts_are_base_url_scoped() {
        let first = api_key_account("custom", "https://gateway.example.com/v1").unwrap();
        let equivalent = api_key_account("custom", "https://gateway.example.com/").unwrap();
        let other = api_key_account("custom", "https://other.example.com").unwrap();
        assert_eq!(first, equivalent);
        assert_ne!(first, other);
        assert!(api_key_account("custom", "").is_err());
    }

    #[cfg(not(feature = "local-model"))]
    #[test]
    fn stable_build_rejects_custom_provider() {
        assert!(resolve_endpoint("custom", "https://gateway.example.com").is_err());
        assert!(api_key_account("custom", "https://gateway.example.com").is_err());
    }
}
