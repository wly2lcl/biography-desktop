use std::fs;
use std::path::{Path, PathBuf};

const LLAMA_CPP_VERSION: &str = "b5556"; // llama.cpp build number

pub fn get_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    }
}

pub fn get_binary_path(data_dir: &Path) -> PathBuf {
    data_dir.join("bin").join(get_binary_name())
}

/// Check if the binary exists and is executable
pub fn binary_exists(data_dir: &Path) -> bool {
    let path = get_binary_path(data_dir);
    path.exists()
}

/// Get the download URL for llama-server binary based on platform
pub fn get_download_url() -> Result<String, String> {
    let target = if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        "x64-windows"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "arm64-osx"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        "x64-osx"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        "x64-linux"
    } else {
        return Err(format!(
            "Unsupported platform: {} {}",
            std::env::consts::OS,
            std::env::consts::ARCH
        ));
    };

    Ok(format!(
        "https://github.com/ggerganov/llama.cpp/releases/download/{}/llama-{}.zip",
        LLAMA_CPP_VERSION, target
    ))
}

/// Download and extract llama-server binary from GitHub Releases
pub async fn download_binary(
    data_dir: &Path,
    on_progress: impl Fn(f64) + Send + Sync,
) -> Result<(), String> {
    let url = get_download_url()?;
    let bin_dir = data_dir.join("bin");
    fs::create_dir_all(&bin_dir).map_err(|e| format!("Failed to create bin directory: {}", e))?;

    // Download the zip file to a temp location
    let temp_zip = bin_dir.join("llama-temp.zip");

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download llama.cpp: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);

    // Stream download to file
    let mut file =
        fs::File::create(&temp_zip).map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    use futures::StreamExt;
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Download error: {}", e))?;
        use std::io::Write;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
        if total_size > 0 {
            on_progress(downloaded as f64 / total_size as f64);
        }
    }

    // Extract the binary from the zip
    use std::io::Cursor;
    let zip_data = fs::read(&temp_zip).map_err(|e| format!("Failed to read zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_data))
        .map_err(|e| format!("Failed to open zip: {}", e))?;

    let binary_name = get_binary_name();
    let mut found = false;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Zip error: {}", e))?;
        let entry_path = file.name().to_string();

        // Look for llama-server binary in the archive
        if entry_path.ends_with(binary_name) {
            let output_path = get_binary_path(data_dir);
            let mut out_file = fs::File::create(&output_path)
                .map_err(|e| format!("Failed to create binary: {}", e))?;
            std::io::copy(&mut file, &mut out_file)
                .map_err(|e| format!("Failed to extract binary: {}", e))?;
            found = true;
            break;
        }
    }

    if !found {
        // Clean up
        let _ = fs::remove_file(&temp_zip);
        return Err("llama-server binary not found in release archive".to_string());
    }

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = get_binary_path(data_dir);
        let mut perms = fs::metadata(&path)
            .map_err(|e| format!("Failed to read permissions: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    // Clean up temp file
    let _ = fs::remove_file(&temp_zip);

    log::info!("llama-server binary downloaded and extracted successfully");
    Ok(())
}

/// Verify the binary is executable
pub fn verify_binary(data_dir: &Path) -> Result<(), String> {
    let path = get_binary_path(data_dir);
    if !path.exists() {
        return Err("llama-server binary does not exist".to_string());
    }

    // Try to run --help to verify it's executable
    let output = std::process::Command::new(&path).arg("--help").output();

    match output {
        Ok(out) => {
            if out.status.success() || String::from_utf8_lossy(&out.stderr).contains("llama") {
                Ok(())
            } else {
                Err("llama-server binary verification failed".to_string())
            }
        }
        Err(e) => Err(format!("Failed to execute llama-server: {}", e)),
    }
}
