# Phase 9: llama.cpp 本地模型运行能力

> 将应用从"仅连接已运行的 LLM 服务"升级为"内置本地模型运行能力"，实现类似 LocalAI 的一键式体验。
> 创建日期: 2026-06-04 | 状态: 设计阶段

---

## 一、问题背景

### 当前状态（Phase 8）
- `llamacpp` 预设仅配置 `http://localhost:8080`
- **用户必须手动启动** `llama-server` 二进制文件
- 用户必须自行下载、管理 GGUF 模型文件
- 无模型选择 UI，无服务状态指示

### 目标状态（Phase 9）
- 应用**一键启动**本地模型服务
- 内置模型下载与管理
- 实时显示服务状态、模型信息
- Web 测试模式同样支持本地模型（通过本地代理）

---

## 二、架构设计

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Webview (Chromium)                     │  │
│  │                                                    │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  Model Manager UI                           │  │  │
│  │  │  - 模型列表 (已下载/可下载)                   │  │  │
│  │  │  - 下载进度条                                │  │  │
│  │  │  - 服务器状态指示器                          │  │  │
│  │  │  - 启动/停止/切换模型                        │  │  │
│  │  └──────────────────┬──────────────────────────┘  │  │
│  │                     │ IPC                         │  │
│  └─────────────────────┼─────────────────────────────┘  │
│                        │                                 │
│  ┌─────────────────────┼────────────────────────────┐  │
│  │           Tauri Core (Rust)                      │  │
│  │                        │                         │  │
│  │  ┌──────────────┐  ┌───┴───────┐  ┌───────────┐ │  │
│  │  │ Binary       │  │ Process   │  │ Model     │ │  │
│  │  │ Manager      │  │ Manager   │  │ Manager   │ │  │
│  │  │ (下载/验证)  │  │ (启动/停止)│  │ (下载/删) │ │  │
│  │  └──────────────┘  └─────┬─────┘  └─────┬─────┘ │  │
│  │                          │              │       │  │
│  │                    ┌─────┴──────┐  ┌────┴────┐  │  │
│  │                    │ llama-     │  │ ~/.local/│  │  │
│  │                    │ server     │  │ share/   │  │  │
│  │                    │ (子进程)   │  │ models/  │  │  │
│  │                    └────────────┘  └─────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                        │                                 │
│              localhost:随机端口 (内部通信)                │
└──────────────────────────────────────────────────────────┘
```

### 2.2 核心设计决策

| 决策点 | 方案 | 理由 |
|--------|------|------|
| llama.cpp 获取方式 | **按需下载**（首次使用时从 GitHub Releases 下载） | 避免安装包过大（llama.cpp 二进制 ~50MB） |
| 端口管理 | **动态分配**（OS 自动分配随机端口） | 避免端口冲突，多实例安全 |
| 模型存储 | 应用数据目录 `~/.local/share/biography-desktop/models/` | 统一管理，与世界观分离 |
| 进程生命周期 | Tauri `on_window_event` 清理 + Rust `Drop` | 应用退出时自动停止服务 |
| Web 模式支持 | 本地启动 llama-server，前端连接 `localhost:随机端口` | Web 测试与桌面模式一致 |

---

## 三、详细设计

### 3.1 Rust 侧模块设计

#### 3.1.1 新增文件结构

```
src-tauri/src/
├── main.rs              # 注册新的 commands
├── commands/
│   ├── mod.rs           # 新增 pub mod model;
│   ├── model.rs         # ⭐ 新增：模型服务管理 commands
│   └── ...
└── model/
    ├── mod.rs           # ⭐ 新增：模型管理核心模块
    ├── binary.rs        # llama.cpp 二进制管理（下载/验证）
    ├── process.rs       # llama-server 进程管理（启动/停止）
    ├── download.rs      # GGUF 模型下载管理
    └── types.rs         # 模型相关类型定义
```

#### 3.1.2 新增 Tauri Commands

```rust
// src-tauri/src/commands/model.rs

/// 获取 llama-server 二进制路径（自动下载）
#[tauri::command]
pub async fn ensure_binary() -> Result<String, String>;

/// 启动 llama-server 进程
#[tauri::command]
pub async fn start_server(model_path: String) -> Result<ServerInfo, String>;

/// 停止 llama-server 进程
#[tauri::command]
pub async fn stop_server() -> Result<(), String>;

/// 获取服务器状态
#[tauri::command]
pub async fn get_server_status() -> Result<ServerStatus, String>;

/// 列出可用的预配置模型
#[tauri::command]
pub async fn list_available_models() -> Result<Vec<ModelInfo>, String>;

/// 下载模型
#[tauri::command]
pub async fn download_model(model_id: String, app: tauri::AppHandle) -> Result<(), String>;

/// 取消模型下载
#[tauri::command]
pub async fn cancel_download() -> Result<(), String>;

/// 删除已下载的模型
#[tauri::command]
pub async fn delete_model(model_id: String) -> Result<(), String>;

/// 列出已下载的模型
#[tauri::command]
pub async fn list_downloaded_models() -> Result<Vec<DownloadedModel>, String>;

/// 获取模型目录路径
#[tauri::command]
pub async fn get_models_dir() -> Result<String, String>;
```

#### 3.1.3 核心类型定义

```rust
// src-tauri/src/model/types.rs

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ServerInfo {
    pub pid: u32,
    pub port: u16,
    pub model_path: String,
    pub model_name: String,
    pub started_at: String,
}

#[derive(serde::Serialize, Clone)]
pub struct ServerStatus {
    pub is_running: bool,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub model_name: Option<String>,
    pub context_size: Option<u32>,
    pub gpu_layers: Option<u32>,
}

#[derive(serde::Serialize, Clone)]
pub struct ModelInfo {
    pub id: String,              // "Qwen3-4B-Instruct-Q4_K_M"
    pub name: String,            // "Qwen3 4B Instruct"
    pub provider: String,        // "Qwen"
    pub size_gb: f64,            // 2.5
    pub quantization: String,    // "Q4_K_M"
    pub recommended: bool,       // true (推荐入门模型)
    pub download_url: String,    // HuggingFace 直链
    pub min_ram_gb: u32,         // 8
}

#[derive(serde::Serialize, Clone)]
pub struct DownloadedModel {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub file_size: u64,
    pub downloaded_at: String,
}
```

#### 3.1.4 进程管理核心

```rust
// src-tauri/src/model/process.rs

use std::process::{Child, Command};
use std::sync::Mutex;
use tokio::sync::Mutex as AsyncMutex;

/// 全局 llama-server 进程管理器
pub struct LlamaProcess {
    child: Option<Child>,
    port: u16,
    model_path: String,
}

impl LlamaProcess {
    /// 查找可用端口并启动 llama-server
    pub async fn start(binary_path: &str, model_path: &str, gpu_layers: u32) -> Result<Self, String> {
        let port = Self::find_available_port().await?;
        
        let mut cmd = Command::new(binary_path);
        cmd.arg("--model")
           .arg(model_path)
           .arg("--host")
           .arg("127.0.0.1")
           .arg("--port")
           .arg(port.to_string())
           .arg("--ctx-size")
           .arg("4096")
           .arg("--n-gpu-layers")
           .arg(gpu_layers.to_string())
           .arg("--log-disable");
        
        let child = cmd.spawn()
            .map_err(|e| format!("Failed to start llama-server: {}", e))?;
        
        // 等待服务就绪（轮询健康检查）
        Self::wait_for_ready(port, 30).await?;
        
        Ok(Self {
            child: Some(child),
            port,
            model_path: model_path.to_string(),
        })
    }
    
    /// 查找可用端口（从 18080 开始）
    async fn find_available_port() -> Result<u16, String> {
        for port in 18080..18100 {
            if tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
                .await
                .is_ok()
            {
                return Ok(port);
            }
        }
        Err("No available port found".to_string())
    }
    
    /// 等待服务就绪（健康检查）
    async fn wait_for_ready(port: u16, timeout_secs: u32) -> Result<(), String> {
        let url = format!("http://127.0.0.1:{}/health", port);
        // ... 轮询 HTTP 健康检查
    }
}

impl Drop for LlamaProcess {
    fn drop(&mut self) {
        if let Some(child) = &mut self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
```

#### 3.1.5 全局状态管理

```rust
// 在 main.rs 中管理全局进程状态

use crate::model::process::LlamaProcess;
use std::sync::Arc;
use tokio::sync::Mutex;

struct AppState {
    db: AppDb,
    llama_process: Arc<Mutex<Option<LlamaProcess>>>,
}

// 应用退出时自动清理
tauri::Builder::default()
    .setup(|app| {
        let handle = app.handle().clone();
        app.on_window_event(move |_, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // 清理 llama-server 进程
                let rt = tokio::runtime::Handle::current();
                rt.block_on(async {
                    let state = handle.state::<AppState>();
                    let mut proc = state.llama_process.lock().await;
                    if let Some(p) = proc.take() {
                        drop(p); // Drop impl handles cleanup
                    }
                });
            }
        });
        Ok(())
    })
```

### 3.2 预配置模型列表

```rust
// src-tauri/src/model/download.rs

/// 预配置的可下载模型（针对传记应用优化）
pub const AVAILABLE_MODELS: &[ModelInfo] = &[
    ModelInfo {
        id: "qwen3-4b-instruct-q4_k_m",
        name: "Qwen3 4B Instruct (Q4_K_M)",
        provider: "Alibaba Qwen",
        size_gb: 2.8,
        quantization: "Q4_K_M",
        recommended: true,  // ⭐ 推荐入门模型（体积小、质量好）
        download_url: "https://huggingface.co/Qwen/Qwen3-4B-Instruct-GGUF/resolve/main/qwen3-4b-instruct-q4_k_m.gguf",
        min_ram_gb: 8,
    },
    ModelInfo {
        id: "qwen3-8b-instruct-q4_k_m",
        name: "Qwen3 8B Instruct (Q4_K_M)",
        provider: "Alibaba Qwen",
        size_gb: 5.4,
        quantization: "Q4_K_M",
        recommended: false,
        download_url: "https://huggingface.co/Qwen/Qwen3-8B-Instruct-GGUF/resolve/main/qwen3-8b-instruct-q4_k_m.gguf",
        min_ram_gb: 16,
    },
    ModelInfo {
        id: "llama-3.2-3b-instruct-q4_k_m",
        name: "Llama 3.2 3B Instruct (Q4_K_M)",
        provider: "Meta",
        size_gb: 2.0,
        quantization: "Q4_K_M",
        recommended: false,
        download_url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        min_ram_gb: 8,
    },
    // 更多模型可后续扩展...
];
```

### 3.3 前端 UI 设计

#### 3.3.1 Settings Screen 新增 "本地模型" Tab

```
┌────────────────────────────────────────────────────────────┐
│  设置                                         [取消] [保存] │
├────────────────────────────────────────────────────────────┤
│  [LLM] [高级] [本地模型] [数据] [关于]                      │
├────────────────────────────────────────────────────────────┤
│  本地模型                                                    │
│                                                             │
│  ┌─ 服务器状态 ────────────────────────────────────────┐   │
│  │  🟢 运行中 · Qwen3 4B · 端口 18082                 │   │
│  │  [停止服务]                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ 已下载模型 ────────────────────────────────────────┐   │
│  │  ● Qwen3 4B Instruct    2.8 GB  [切换] [删除]       │   │
│  │    Qwen3 8B Instruct    5.4 GB  [下载]              │   │
│  │    Llama 3.2 3B         2.0 GB  [下载]              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  GPU 加速: [━━━━●━━━━] 35 层 (0=纯CPU, 999=全部GPU)         │
│  上下文大小: 4096 tokens                                    │
└────────────────────────────────────────────────────────────┘
```

#### 3.3.2 模型下载进度 UI

```
┌─ 下载中 ────────────────────────────────────────────────┐
│  Qwen3 8B Instruct                                      │
│  ████████████░░░░░░░░░░░░ 45% (2.4 GB / 5.4 GB)        │
│  下载速度: 12.5 MB/s · 预计剩余: 2 分钟                 │
│  [取消下载]                                              │
└──────────────────────────────────────────────────────────┘
```

#### 3.3.3 前端 store 扩展

```typescript
// src/store/gameStore.ts 新增状态

interface LocalModelState {
  // 服务器状态
  isServerRunning: boolean;
  serverPort: number | null;
  serverModel: string | null;
  serverPid: number | null;
  
  // 模型列表
  downloadedModels: DownloadedModel[];
  availableModels: AvailableModel[];
  
  // 下载状态
  downloadingModel: string | null;
  downloadProgress: number;
  downloadSpeed: string;
  
  // 操作
  startServer: (modelPath: string) => Promise<void>;
  stopServer: () => Promise<void>;
  downloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  refreshModels: () => Promise<void>;
}
```

### 3.4 二进制管理策略

#### 3.4.1 平台适配

```rust
// src-tauri/src/model/binary.rs

fn get_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    }
}

fn get_download_url() -> String {
    let os = if cfg!(target_os = "windows") {
        "win-amd64"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "macos-arm64"
        } else {
            "macos-x64"
        }
    } else {
        "linux-x64"
    };
    format!(
        "https://github.com/ggerganov/llama.cpp/releases/download/b{}/llama-{}.zip",
        LLAMA_BUILD_NUMBER, os
    )
}

fn get_binary_path(data_dir: &Path) -> PathBuf {
    data_dir.join("bin").join(get_binary_name())
}
```

#### 3.4.2 下载与验证流程

```
检查 binary 是否存在
       │
       ├─ 存在 → 验证版本 → 版本不匹配 → 下载新版本
       │              ↓
       │          版本匹配 → 直接使用
       │
       └─ 不存在 → 从 GitHub Releases 下载
                  ↓
              解压到 ~/.local/share/biography-desktop/bin/
                  ↓
              chmod +x (Linux/macOS)
                  ↓
              验证可执行
```

### 3.5 Web 模式支持

Web 模式下，应用同样需要启动本地 llama-server。流程与 Tauri 模式相同，但通过不同的方式暴露：

```typescript
// src/services/localModel.ts

// Web 模式：通过独立的本地 HTTP API 管理
// 在开发时可启动一个独立的 Rust/Node 代理进程

export async function startLocalModel(modelPath: string) {
  // Web 模式需要单独运行的本地代理服务
  // 默认连接 http://localhost:18888（独立代理进程）
  const response = await fetch('http://localhost:18888/api/start', {
    method: 'POST',
    body: JSON.stringify({ model_path: modelPath }),
  });
  return response.json();
}
```

**Web 测试模式方案**：
- 开发时可手动启动一个 llama-server 或使用 Node.js 代理
- 代理进程监听 `localhost:18888`，转发到 llama-server
- 生产模式下，Tauri 直接管理进程

### 3.6 LLM 客户端集成

```typescript
// src/services/llm.ts 新增本地模式支持

export async function* streamChat(
  messages: LLMMessage[],
  config: LLMConfig
): AsyncGenerator<string> {
  // 本地模式：自动获取内部端口
  let baseUrl = config.baseUrl;
  
  if (config.llmProvider === 'llamacpp_local') {
    // 从 store 获取当前运行的服务器端口
    const store = useGameStore.getState();
    if (store.isServerRunning && store.serverPort) {
      baseUrl = `http://127.0.0.1:${store.serverPort}`;
    } else {
      throw new Error('本地模型服务未启动。请先在设置中启动模型服务。');
    }
  }
  
  // ... 其余逻辑不变
}
```

---

## 四、新增 Rust 依赖

```toml
# src-tauri/Cargo.toml

[dependencies]
# 新增依赖
tokio-util = "0.7"          # 异步 I/O 工具
futures = "0.3"             # 异步流
rand = "0.8"                # 随机端口选择
sha2 = "0.10"               # 模型文件校验
```

---

## 五、数据库变更

```sql
-- 新增 models 表（跟踪已下载模型）
CREATE TABLE models (
    model_id        TEXT PRIMARY KEY,
    model_name      TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    file_size       INTEGER NOT NULL,
    downloaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_used       TEXT
);
```

---

## 六、CSP 配置更新

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.deepseek.com https://api.openai.com http://localhost:* https://huggingface.co; font-src 'self' data:; frame-ancestors 'none'"
    }
  }
}
```

新增 `https://huggingface.co` 以支持模型下载。

---

## 七、安全考量

| 风险 | 缓解措施 |
|------|---------|
| 恶意模型文件 | 仅从预配置的 HuggingFace URL 下载 |
| 端口冲突 | 动态分配，从 18080 开始扫描 |
| 进程残留 | `Drop` + `on_window_event` 双保险清理 |
| 磁盘空间 | 下载前检查可用空间，显示警告 |
| 二进制篡改 | 下载后验证 SHA256 校验和 |

---

## 八、预估工作量

| 模块 | 预估时间 | 复杂度 |
|------|---------|--------|
| Rust 进程管理核心 | 4h | 中 |
| 二进制下载与验证 | 3h | 中 |
| 模型下载管理 | 3h | 中 |
| Tauri Commands | 2h | 低 |
| 前端 UI（状态/列表/下载） | 4h | 中 |
| Store 集成 | 2h | 低 |
| LLM 客户端适配 | 1h | 低 |
| 测试与调试 | 3h | 中 |
| **总计** | **~22h** | |

---

## 九、分阶段实施计划

### Phase 9.1: 基础设施（Rust 侧）
- 二进制下载与验证
- 进程启动/停止/状态
- Tauri Commands

### Phase 9.2: 模型管理
- 预配置模型列表
- 模型下载（带进度）
- 模型列表/删除

### Phase 9.3: 前端 UI
- Settings "本地模型" Tab
- 服务器状态指示器
- 模型选择/下载进度 UI

### Phase 9.4: 集成与测试
- LLM 客户端适配
- 端到端流程测试
- Web 模式兼容
