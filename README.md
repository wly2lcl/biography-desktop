# Biography Desktop

> LLM 驱动的互动式传记叙事桌面应用

[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 简介

Biography Desktop 是一个**本地保存会话、通过云端 AI 生成内容的桌面应用**。用户选择角色名称和世界观，由 AI 实时生成互动式小说剧情；玩家在关键节点做出选择影响命运走向，最终由 AI 撰写角色传记。稳定版生成剧情时需要联网。

### 特性

- 🎭 **双模式游戏**：基础模拟 / 拥有"系统"的模拟（网文系统流）
- 📡 **实时流式输出**：AI 生成内容逐字显示，无需等待
- 🌍 **多世界观支持**：通过 Markdown 文件定义世界设定
- 💾 **断点续传**：自动保存游戏进度，随时继续
- 🔒 **本地密钥存储**：桌面版 API Key 通过系统 keyring 保存；使用云端模型时，角色名、世界观和剧情历史会发送给所选模型提供商
- ☁️ **云端稳定版**：当前正式支持 DeepSeek 与 OpenAI；Ollama、llama.cpp 和自定义兼容接口作为实验功能保留，正式构建默认关闭
- 🖥️ **跨平台**：Windows / macOS / Linux
- 📦 **轻量**：安装包约 10MB
- 🌐 **可扩展架构**：支持文件系统 Prompt 覆盖、错误日志、数据迁移脚本

### 截图

*(待添加)*

---

## 快速开始

### 下载

从 [Releases](https://github.com/wly2lcl/biography-desktop/releases) 页面下载对应平台的安装包。

### 配置

1. 首次启动后进入设置
2. 选择云端 LLM 提供商（DeepSeek 或 OpenAI；费用与额度以服务商规则为准）
3. 填入 API Key；如需代理或兼容网关可填写 Base URL，留空则使用所选服务商官方地址
4. 开始你的旅程

### 支持的 LLM 提供商

| 提供商 | 费用 | 推荐模型 | 网络 |
|--------|------|---------|------|
| **DeepSeek** | 按提供商当前规则计费 | `deepseek-chat` | 云端、正式支持 |
| **OpenAI** | 按提供商当前规则计费 | `gpt-4o-mini` | 云端、正式支持 |
| **Ollama** | 本地运行 | `qwen2.5` | 实验功能 |
| **llama.cpp** | 本地运行 | 自选 GGUF 模型 | 实验功能 |

> **隐私提示**：云端模式会把生成所需的文本上下文发送给所选模型提供商或你配置的 Base URL。自定义地址也会接收 API Key；远程地址必须使用 HTTPS，HTTP 仅支持 `localhost`、`127.0.0.1` 与 `::1` 本机回环端点。仅应使用可信端点。Web 模式仅用于开发调试，API Key 会落入浏览器存储，不作为正式交付方式。
>
> 本地模型代码仍保留，但需完成下载完整性校验、平台兼容和性能验证后才会重新进入正式版本。

---

## 开发

### 环境要求

- Node.js ≥ 18
- Rust ≥ 1.75（通过 [rustup](https://rustup.rs/) 安装）
- 平台特定依赖详见 [开发指南](docs/DEV_GUIDE.md)

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# Web 模式（浏览器调试）
npm run dev

# 桌面模式（原生窗口 + DevTools）
npm run tauri dev
```

### 构建

```bash
# Web 版
npm run build

# 桌面版
npm run tauri build
```

---

## 文档

| 文档 | 说明 |
|------|------|
| [详细设计](docs/DESIGN.md) | 架构、数据模型、API、业务流程 |
| [开发指南](docs/DEV_GUIDE.md) | 环境配置、开发步骤、调试技巧 |
| [Phase 9 设计](docs/PHASE9_LOCAL_MODEL.md) | 本地 llama.cpp 模型运行能力架构方案 |
| [进度](STATUS.md) | 开发进度跟踪 |
| [任务清单](TASKS.md) | 详细任务列表和依赖关系 |

---

## 技术架构

| 层 | 技术 |
|------|------|
| **前端** | React 18 + TypeScript + Zustand + Tailwind CSS |
| **桌面** | Tauri 2（Rust + WebKit） |
| **存储** | SQLite（sqlx）+ localStorage（Web 模式） |
| **安全** | keyring（API Key 加密存储）+ CSP 策略 |
| **测试** | Vitest（265 个单元与本地 mock 集成测试）+ Rust（45 项独立测试） |
| **CI/CD** | GitHub Actions（Windows/macOS/Linux 自动构建） |

### 项目进度

- ✅ 云端 API 稳定版本地质量门禁已通过（会话 v2、数据库迁移、主流程测试和发布门禁）
- 🚧 本地模型功能默认关闭，后续单独验证
- ✅ Linux 打包完成（.deb + .rpm）
- ✅ CI/CD 工作流配置完成
- ✅ 当前依赖下已验证 265 项前端测试、66.79% 全局行覆盖率，以及稳定/实验前端和 Tauri 无打包生产构建。上一轮 45 项 Rust 独立测试及 Rust feature 门禁通过
- ⚠️ 正式稳定发布仍需远端四目标构建以及 Windows/macOS 签名、公证门禁
- ✅ 首页导航栏已添加（设置/世界按钮）
- ✅ Phase 10 云端稳定发布整改与本地提交门禁完成（详见 [TASKS.md](TASKS.md)）

详见 [进度文档](STATUS.md) 和 [任务清单](TASKS.md)。

---

## 许可证

MIT License
