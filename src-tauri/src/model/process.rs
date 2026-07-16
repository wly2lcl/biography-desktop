use crate::model::types::ServerInfo;
use std::path::Path;
use std::process::{Child, Command};

/// Manages a running llama-server process
pub struct LlamaProcess {
    child: Option<Child>,
    port: u16,
    model_path: String,
    model_name: String,
}

impl LlamaProcess {
    /// Start llama-server with the given model
    pub fn start(
        binary_path: &str,
        model_path: &str,
        gpu_layers: u32,
        context_size: u32,
    ) -> Result<Self, String> {
        let port = Self::find_available_port()?;

        let model_name = Path::new(model_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        log::info!(
            "Starting llama-server on port {} with model: {}",
            port,
            model_name
        );

        let mut cmd = Command::new(binary_path);
        cmd.arg("--model")
            .arg(model_path)
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(port.to_string())
            .arg("--ctx-size")
            .arg(context_size.to_string())
            .arg("--n-gpu-layers")
            .arg(gpu_layers.to_string())
            .arg("--log-disable")
            .arg("--no-mmap");

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start llama-server: {}", e))?;

        log::info!("llama-server started with PID {}", child.id());

        Ok(Self {
            child: Some(child),
            port,
            model_path: model_path.to_string(),
            model_name,
        })
    }

    /// Wait for the server to be ready (health check)
    pub async fn wait_for_ready(&self, timeout_secs: u64) -> Result<(), String> {
        let start = std::time::Instant::now();
        let url = format!("http://127.0.0.1:{}/health", self.port);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        loop {
            if start.elapsed().as_secs() > timeout_secs {
                return Err(format!(
                    "llama-server did not start within {} seconds",
                    timeout_secs
                ));
            }

            if let Ok(resp) = client.get(&url).send().await {
                if resp.status().is_success() {
                    log::info!("llama-server is ready on port {}", self.port);
                    return Ok(());
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
    }

    /// Find an available port starting from 18080
    fn find_available_port() -> Result<u16, String> {
        for port in 18080..18100 {
            // Try to bind to the port
            if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
                return Ok(port);
            }
        }
        Err("No available port found in range 18080-18100".to_string())
    }

    pub fn port(&self) -> u16 {
        self.port
    }
    pub fn model_name(&self) -> &str {
        &self.model_name
    }
    pub fn pid(&self) -> u32 {
        self.child.as_ref().map(|c| c.id()).unwrap_or(0)
    }

    pub fn server_info(&self) -> ServerInfo {
        ServerInfo {
            pid: self.pid(),
            port: self.port,
            model_path: self.model_path.clone(),
            model_name: self.model_name.clone(),
            started_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl Drop for LlamaProcess {
    fn drop(&mut self) {
        if let Some(child) = &mut self.child {
            log::info!("Stopping llama-server (PID {})", child.id());
            #[cfg(unix)]
            {
                // Send SIGTERM first
                let _ = unsafe { libc::kill(child.id() as i32, libc::SIGTERM) };
            }
            #[cfg(windows)]
            {
                let _ = child.kill();
            }
            let _ = child.wait();
            log::info!("llama-server stopped");
        }
    }
}
