# Biography Desktop

> LLM 驱动的互动式传记叙事桌面应用

[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 简介

Biography Desktop 是一个**离线可用的桌面应用**，用户通过选择角色名称和世界观，由 AI 实时生成互动式小说剧情。玩家在关键节点做出选择影响命运走向，最终由 AI 撰写一篇完整的角色传记。

### 特性

- 🎭 **双模式游戏**：基础模拟 / 拥有"系统"的模拟（网文系统流）
- 📡 **实时流式输出**：AI 生成内容逐字显示，无需等待
- 🌍 **多世界观支持**：通过 Markdown 文件定义世界设定
- 💾 **断点续传**：自动保存游戏进度，随时继续
- 🔒 **隐私保护**：API Key 本地加密存储，数据不经过第三方服务器
- 🖥️ **跨平台**：Windows / macOS / Linux
- 📦 **轻量**：安装包约 10MB

### 截图

*(待添加)*

---

## 快速开始

### 下载

从 [Releases](https://github.com/your-org/biography-desktop/releases) 页面下载对应平台的安装包。

### 配置

1. 首次启动后进入设置
2. 选择 LLM 提供商（推荐 DeepSeek，免费）
3. 填入 API Key
4. 开始你的旅程

### 支持的 LLM 提供商

| 提供商 | 费用 | 推荐模型 |
|--------|------|---------|
| **DeepSeek** | 免费（新赠 $5） | `deepseek-chat` |
| **OpenAI** | 付费 | `gpt-4o-mini` |
| **Ollama** | 完全免费 | `qwen2.5` |

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
| [进度](STATUS.md) | 开发进度跟踪 |
| [任务清单](TASKS.md) | 详细任务列表和依赖关系 |

---

## 从 Python 版迁移

本项目从 Python/FastAPI Web 应用 [biography-generator](../biography-generator) 迁移而来。

主要变化：
- 后端从 Python 移至前端 TypeScript
- 数据库从 SQLAlchemy 移至 Rust + sqlx
- 部署从服务器移至桌面客户端
- API Key 从 .env 文件移至本地加密存储

---

## 许可证

MIT License
