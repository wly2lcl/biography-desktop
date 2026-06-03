# Biography Desktop - 详细设计文档

> 从 Python/FastAPI Web 应用迁移为 Tauri + TypeScript 桌面应用
> 版本: 2.0.0 | 日期: 2026-05-28

---

## 一、项目定位

一个 **LLM 驱动的互动传记叙事桌面应用**。用户下载即用，无需后端服务器，API Key 本地存储，世界观文件打包进应用。

### 目标平台
- Windows 10/11 (`.exe` / `.msi`)
- macOS 12+ (`.app` / `.dmg`)
- Linux (`.deb` / `.AppImage`)

### 核心优势（vs 当前 Python Web 版）

| 维度 | Python Web 版 | Tauri 桌面版 |
|------|-------------|-------------|
| 部署 | 需要服务器 + 域名 | 用户下载 .exe/.dmg 即可用 |
| 体积 | 服务端 ~200MB | 客户端 ~10MB |
| API Key | 存服务端 .env | 存本地加密存储 |
| 隐私 | 数据经过服务器 | 直连 LLM，无中间层 |
| 离线世界观 | 服务端读取 | 打包进应用 |
| 调试 | 浏览器 DevTools | 浏览器 DevTools + Rust 日志 |

---

## 二、技术选型

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| TypeScript | 5.x | 类型安全 |
| React | 18.x | UI 框架 |
| Vite | 5.x | 构建工具 + HMR |
| Tailwind CSS | 3.x | 样式系统 |
| Zustand | 4.x | 状态管理 |
| DOMPurify | 3.x | XSS 防护 |

### 桌面端（Tauri）

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.x | 桌面壳框架 |
| Rust | 1.75+ | 原生后端 |
| sqlx | 0.7+ | 异步 SQLite |
| serde_json | 1.x | JSON 序列化 |
| keyring | 1.x | 安全存储 API Key |

---

## 三、架构设计

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Webview (Chromium)                     │  │
│  │                                                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │  │
│  │  │  UI Layer   │  │  Game State │  │  LLM Stream │ │  │
│  │  │  (React)    │  │  (Zustand)  │  │  (AsyncGen) │ │  │
│  │  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │  │
│  │         │                │                │        │  │
│  │  ┌──────┴────────────────┴────────────────┴──────┐ │  │
│  │  │           Business Logic Layer (TS)           │ │  │
│  │  │  prompts.ts | game.ts | world.ts | parser.ts  │ │  │
│  │  └────────────────────┬──────────────────────────┘ │  │
│  │                       │                            │  │
│  └───────────────────────┼────────────────────────────┘  │
│                          │ IPC                            │
│  ┌───────────────────────┼────────────────────────────┐  │
│  │           Tauri Core (Rust)                        │  │
│  │                       │                            │  │
│  │  ┌────────────┐  ┌────┴─────┐  ┌───────────────┐  │  │
│  │  │  SQLite DB │  │  File I/O│  │  Secure Store │  │  │
│  │  │  (sqlx)    │  │  (worlds)│  │  (keyring)    │  │  │
│  │  └────────────┘  └──────────┘  └───────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                          │                                │
│                    fetch() to LLM API                     │
│                (DeepSeek / OpenAI / Ollama)               │
└──────────────────────────────────────────────────────────┘
```

### 3.2 目录结构

```
biography-desktop/
├── src/                          # 前端 TypeScript 代码
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 根组件（路由/屏幕切换）
│   ├── types/
│   │   ├── models.ts             # 领域类型定义
│   │   └── prompts.ts            # Prompt 类型
│   ├── store/
│   │   ├── gameStore.ts          # 游戏状态（Zustand）
│   │   ├── sessionStore.ts       # 会话持久化
│   │   └── configStore.ts        # 配置（API Key, 世界）
│   ├── services/
│   │   ├── llm.ts                # LLM 调用（统一流式）
│   │   ├── prompts.ts            # Prompt 模板管理
│   │   ├── parser.ts             # SSE + JSON 解析
│   │   ├── world.ts              # 世界观数据
│   │   └── storage.ts            # 存储抽象（Tauri/localStorage）
│   ├── game/
│   │   ├── engine.ts             # 游戏引擎（状态机）
│   │   ├── choice.ts             # 选择处理
│   │   └── biography.ts          # 传记生成
│   ├── components/
│   │   ├── screens/
│   │   │   ├── StartScreen.tsx
│   │   │   ├── SystemScreen.tsx
│   │   │   ├── GameScreen.tsx
│   │   │   └── BiographyScreen.tsx
│   │   ├── common/
│   │   │   ├── LoadingOverlay.tsx
│   │   │   ├── ErrorModal.tsx
│   │   │   └── ConfirmModal.tsx
│   │   └── qa/
│   │       └── QAPanel.tsx
│   ├── utils/
│   │   ├── sse.ts                # SSE 工具函数
│   │   └── format.ts             # 文本格式化
│   └── styles/
│       └── globals.css           # Tailwind + 自定义样式
│
├── src-tauri/                    # Tauri Rust 核心
│   ├── src/
│   │   ├── main.rs               # Tauri 入口
│   │   ├── lib.rs                # 库导出
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── db.rs             # SQLite 操作（会话 CRUD）
│   │   │   ├── config.rs         # 配置读写（API Key）
│   │   │   └── world.rs          # 世界观文件读取
│   │   └── db/
│   │       ├── mod.rs
│   │       ├── migrations.rs     # 数据库迁移
│   │       └── models.rs         # 数据库模型
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri 配置
│   ├── build.rs
│   └── icons/                    # 应用图标
│
├── public/                       # 静态资源（打包进应用）
│   ├── worlds/
│   │   ├── wuxia_jianghu.md      # 武侠江湖世界观
│   │   └── world/                # 目录式世界
│   └── systems/
│       ├── experience_system.md
│       ├── gacha_system.md
│       └── quest_system.md
│
├── index.html                    # HTML 入口
├── vite.config.ts
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

---

## 四、数据模型（TypeScript）

### 4.1 领域类型

```typescript
// src/types/models.ts

export interface Choice {
  id: string;
  text: string;
  description?: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  choices: Choice[];
  context?: string;
}

export interface PlayerState {
  name: string;
  currentScenario: string;
  history: HistoryEntry[];
  attributes: Record<string, number>; // 勇气/智慧/魅力
  inventory: string[];
  summary: string;          // 旧章节压缩摘要
  qaHistory: QAMessage[];   // Q&A 对话历史
  createdAt: string;
}

export interface HistoryEntry {
  scenario: string;
  scenarioDescription: string;
  choice: string;
  choiceId: string;
}

export interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GameSession {
  sessionId: string;
  world: string;
  gameMode: 'basic' | 'system';
  system?: string;           // 系统设定文本
  player: PlayerState;
  scenarios: Scenario[];     // 仅保留最新 2 个
  isActive: boolean;
  biography?: string;
  createdAt: string;
}

export interface SystemProposal {
  id: string;
  title: string;
  description: string;
  abilities: string;
}

export interface WorldInfo {
  name: string;
  filename: string;
  description: string;
  preview?: string;
}

export interface SessionSummary {
  sessionId: string;
  world: string;
  playerName: string;
  isActive: boolean;
  historyLength: number;
  createdAt: string;
}

export interface ChoiceResponse {
  scenario: Scenario;
  sessionId: string;
  isActive: boolean;
  history: HistoryEntry[];
  historyLength: number;
}

export interface AppConfig {
  apiKey: string;
  baseUrl: string;          // 默认: https://api.deepseek.com
  model: string;            // 默认: deepseek-chat
  temperature: number;      // 默认: 0.8
  maxTokens: number;        // 默认: 4096
}
```

### 4.2 数据库表（SQLite）

```sql
-- sessions 表（对应 Python 的 game_sessions）
CREATE TABLE sessions (
    session_id      TEXT PRIMARY KEY,
    world           TEXT NOT NULL,
    game_mode       TEXT NOT NULL DEFAULT 'basic',
    system          TEXT,
    player_name     TEXT NOT NULL,
    player_history  JSON NOT NULL DEFAULT '[]',
    player_attributes JSON NOT NULL DEFAULT '{}',
    player_inventory  JSON NOT NULL DEFAULT '[]',
    player_summary  TEXT NOT NULL DEFAULT '',
    player_qa_history JSON NOT NULL DEFAULT '[]',
    scenarios_json  JSON NOT NULL DEFAULT '[]',
    is_active       INTEGER NOT NULL DEFAULT 1,
    biography       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- config 表（存储用户配置）
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_sessions_is_active ON sessions(is_active);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
```

---

## 五、核心业务流程

### 5.1 游戏启动（流式）

```
用户输入姓名 + 选择世界
         │
         ▼
   选择游戏模式
         │
    ┌────┴────┐
    │         │
  basic     system
    │         │
    │    POST /chat/completions (stream)
    │    ◄── AsyncGenerator: 3 个系统方案
    │         │
    │    用户选择一个系统
    │         │
    ▼         ▼
   POST /chat/completions (stream)
         │
         │  ◄── AsyncGenerator: 逐字输出序章
         │  ◄── 解析 JSON: { prologue, title, description, choices }
         │
         ▼
   创建 GameSession → 存 SQLite
         │
         ▼
   渲染游戏主界面
```

### 5.2 SSE 流式解析（TypeScript）

```typescript
// src/utils/sse.ts

export interface SSEEvent {
  event: string | null;  // 'complete' | 'error' | null
  data: string;
}

export async function* parseSSE(
  response: Response
): AsyncGenerator<SSEEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastEvent: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        lastEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        yield { event: lastEvent, data: line.slice(6) };
      }
    }
  }
}

// 换行符转义/还原
export function escapeForSSE(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export function unescapeSSE(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
}
```

### 5.3 游戏状态机（Zustand）

```typescript
// src/store/gameStore.ts
import { create } from 'zustand';
import type { GameSession, Scenario, SystemProposal } from '../types/models';

type Screen = 'start' | 'system' | 'game' | 'biography';

interface GameState {
  // 屏幕状态
  currentScreen: Screen;
  
  // 游戏数据
  session: GameSession | null;
  currentScenario: Scenario | null;
  systemProposals: SystemProposal[];
  selectedSystem: SystemProposal | null;
  
  // 流式状态
  isStreaming: boolean;
  streamedText: string;
  
  // UI 状态
  isLoading: boolean;
  loadingText: string;
  error: string | null;
  showConfirmEnd: boolean;
  
  // 动作
  setScreen: (screen: Screen) => void;
  startBasicGame: () => Promise<void>;
  generateSystemProposals: () => Promise<void>;
  selectSystem: (proposal: SystemProposal) => void;
  startSystemGame: () => Promise<void>;
  makeChoice: (choiceId: string) => Promise<void>;
  generateBiography: () => Promise<void>;
  endGame: () => void;
  newGame: () => void;
  setError: (error: string | null) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  // 初始状态
  currentScreen: 'start',
  session: null,
  currentScenario: null,
  systemProposals: [],
  selectedSystem: null,
  isStreaming: false,
  streamedText: '',
  isLoading: false,
  loadingText: '',
  error: null,
  showConfirmEnd: false,

  // 动作实现...
  setScreen: (screen) => set({ currentScreen: screen }),
  // ... 详见实现文档
}));
```

---

## 六、Prompt 系统

### 6.1 Prompt 模板（与 Python 版完全一致）

| Prompt | 用途 | 输出格式 |
|--------|------|---------|
| `introduction_prompt` | 游戏序章 | JSON: `{prologue, title, description, choices[]}` |
| `scenario_prompt` | 场景生成 | JSON: `{title, description, choices[], auto_continue, ending}` |
| `biography_prompt` | 传记生成 | 纯文本（2000-4000字） |
| `qa_prompt` | Q&A 问答 | 纯文本 |
| `system_generation_prompt` | 系统方案 | JSON Array: `[{id, title, description, abilities}]` |
| `summarization_prompt` | 历史摘要 | 纯文本（200-400字） |

### 6.2 上下文格式化

```typescript
// 历史格式化为 LLM 可读文本
function formatHistory(history: HistoryEntry[], summary?: string): string {
  const parts: string[] = [];
  
  if (summary) {
    parts.push(`【故事概要】\n${summary}\n`);
  }
  
  if (!history.length) {
    parts.push('（尚无经历，故事即将开始）');
  } else {
    parts.push('【近期经历】');
    history.forEach((event, i) => {
      parts.push(`── 第${i + 1}章 ──`);
      parts.push(`场景：${event.scenario}`);
      if (event.scenarioDescription) {
        const desc = event.scenarioDescription.slice(0, 200);
        parts.push(`详情：${desc}${event.scenarioDescription.length > 200 ? '…' : ''}`);
      }
      parts.push(`你的选择：${event.choice}`);
      parts.push('');
    });
  }
  
  return parts.join('\n');
}
```

---

## 七、LLM 客户端设计

### 7.1 流式调用（统一架构）

> **所有 LLM 内容生成均走流式**，不保留非流式 `chat()` 函数。
> 所有场景统一使用 `streamChat()` 逐字实时渲染，不封装任何"等待完成再返回"的变体。

#### OpenAI 兼容协议

所有提供商（DeepSeek / OpenAI / Ollama / llama.cpp）统一使用 **OpenAI Chat Completions API** 协议：
- 端点: `{baseUrl}/v1/chat/completions`
- 请求体: `{ model, messages, temperature, max_tokens, stream: true }`
- 响应: SSE 流式格式 `data: {"choices":[{"delta":{"content":"..."}}]}`
- 终止标记: `data: [DONE]`

这意味着**任何兼容 OpenAI API 的本地/远程服务**均可直接接入，无需额外适配层。

#### llama.cpp 本地模型支持（Phase 8）

llama.cpp 的 `llama-server` 原生提供 OpenAI 兼容接口，接入方式与 Ollama 完全一致：

```bash
# 启动 llama.cpp 服务
./llama-server -m models/Qwen3-8B.gguf --port 8080 --host 0.0.0.0
```

**与云端提供商的差异**：

| 特性 | 云端 (DeepSeek/OpenAI) | 本地 (llama.cpp) |
|------|----------------------|-----------------|
| 端点 | `https://api.*.com/v1` | `http://localhost:8080/v1` |
| API Key | 必须 | 不需要（可留空） |
| 网络依赖 | 需要互联网 | 完全离线 |
| 速度 | 快（GPU 集群） | 取决于本地硬件 |
| 隐私 | 请求发送至第三方 | 100% 本地处理 |
| 模型选择 | 固定可用模型 | 用户自选 GGUF 模型 |

**Authorization header 处理**：
当 `apiKey` 为空时，不发送 `Authorization` header（llama.cpp 默认不验证 key）：

```typescript
// src/services/llm.ts
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
};
if (config.apiKey) {
  headers['Authorization'] = `Bearer ${config.apiKey}`;
}
```

```typescript
// src/services/llm.ts

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;      // 默认: https://api.deepseek.com
  model: string;        // 默认: deepseek-chat
  temperature: number;  // 默认: 0.8
  maxTokens: number;    // 默认: 4096
  timeout: number;      // 默认: 120000ms
}

/** 唯一流式调用入口 — 逐字 yield，所有场景直接消费 */
export async function* streamChat(
  messages: LLMMessage[],
  config: LLMConfig
): AsyncGenerator<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: '请求失败' } }));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**使用场景**（全部用 `streamChat()`）：

| 场景 | 渲染方式 |
|------|---------|
| 游戏序章 | 逐字追加到场景描述区 |
| 场景生成 | 逐字追加 + 结束后 parseLLMJSON 提取 choices |
| 传记生成 | 逐字追加到传记展示区 |
| 系统方案 | 逐字追加到预览区 + 结束后解析 JSON |
| Q&A 回答 | 逐字追加到对话区（短内容同样实时显示） |
| 历史摘要 | 逐字累积后写入 player.summary（后台运行，无需 UI 展示） |
```

### 7.2 JSON 解析（容错）

```typescript
// src/services/parser.ts

export function parseLLMJSON(raw: string): any {
  // 1. 清理思考标签
  let cleaned = raw
    .replace(/<thinking>.*?<\/thinking>/gs, '')
    .replace(/<reasoning>.*?<\/reasoning>/gs, '')
    .replace(/<answer>.*?<\/answer>/gs, '')
    // 2. 清理 Markdown 代码块
    .replace(/```(?:json)?\s*/g, '')
    .replace(/\s*```/g, '')
    .trim();

  // 3. 直接解析
  try {
    return JSON.parse(cleaned);
  } catch { /* 继续尝试 */ }

  // 4. 查找 JSON 数组
  const arrayMatch = cleaned.match(/\[.*\]/s);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch { /* 继续 */ }
  }

  // 5. 查找 JSON 对象
  const objectMatch = cleaned.match(/\{.*\}/s);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch { /* 继续 */ }
  }

  throw new Error('Failed to parse LLM response as valid JSON');
}
```

### 7.3 SSE 协议差异（Python 版 vs 桌面版）

**这是架构迁移中最关键的差异点**，必须正确处理：

| 特性 | Python Web 版 | Tauri 桌面版 |
|------|-------------|-------------|
| **SSE 来源** | FastAPI 服务端（自定义格式） | OpenAI/DeepSeek API（标准 SSE） |
| **完成标记** | `\x00MARKER\x00<JSON>\x00` | OpenAI `data: [DONE]` |
| **数据格式** | `data: <原始文本>\n\n` | `data: {"choices":[{"delta":{"content":"..."}}]}\n\n` |
| **事件类型** | `event: complete` / `event: error` | 无事件类型，仅 `data:` 行 |
| **换行转义** | 后端转义 `\n` → `\\n` | 不需要（JSON 内嵌转义） |

**桌面版 SSE 解析流程**：

```
OpenAI SSE Stream:
  data: {"choices":[{"delta":{"content":"你"}}]}
  data: {"choices":[{"delta":{"content":"好"}}]}
  data: [DONE]
  
  ↓ 解析为:
  "你" → yield
  "好" → yield
  [DONE] → 结束流
  
  ↓ 累积完整文本:
  "你好"
  
  ↓ 调用 parseLLMJSON("你好") → 提取 JSON
```

**完成判断逻辑**（桌面版无需自定义 marker）：

```typescript
// 场景生成：累积全部 token 后解析 JSON
async function* streamScenarioWithParse(
  prompt: string,
  config: LLMConfig
): AsyncGenerator<string> {
  let fullText = '';
  
  for await (const token of streamChat(
    [{ role: 'user', content: prompt }],
    config
  )) {
    fullText += token;
    yield token;  // 逐字输出给 UI
  }
  
  // 流结束后解析完整文本
  const result = parseLLMJSON(fullText);
  return result;  // 通过返回值传递（或 throw）
}

// Biography 流式：无 JSON 解析，纯文本
async function* streamBiography(
  prompt: string,
  config: LLMConfig
): AsyncGenerator<string> {
  for await (const token of streamChat(
    [{ role: 'user', content: prompt }],
    config
  )) {
    yield token;
  }
}
```

**Biography `[DONE]` 标记处理**：

```typescript
// streamChat 内部已处理 [DONE]（返回时跳过）
// 调用方无需特殊处理
for await (const token of streamChat(messages, config)) {
  // token 永远不会是 [DONE]
  yield token;
}
```

### 7.4 流式场景 JSON 提取策略

LLM 流式输出 JSON 时，每个 token 是 JSON 的一个字符。桌面版需要在流结束后解析完整文本：

```typescript
// 方案：累积 + 后解析（简单可靠）
async function generateAndStreamScenario(
  prompt: string,
  config: LLMConfig,
  onToken: (token: string) => void  // UI 回调
): Promise<ScenarioData> {
  let fullText = '';
  
  for await (const token of streamChat(
    [{ role: 'user', content: prompt }],
    config
  )) {
    fullText += token;
    onToken(token);  // 逐字更新 UI
  }
  
  return parseLLMJSON(fullText);
}

// 使用示例
const data = await generateAndStreamScenario(
  prompt,
  config,
  (token) => appendToDescription(token)  // UI 实时更新
);
// data 包含 { title, description, choices, ending }
```

**与 Python 版 `in_description` 状态机对比**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| Python: `in_description` 状态机 | 可在流中实时提取 description | 复杂、易出错、依赖 JSON 格式 |
| 桌面版: 累积 + 后解析 | 简单、可靠、容错性强 | UI 显示的是原始 JSON 流（含 `{`, `"`, `:` 等字符） |

**优化方案**：桌面版可以在累积过程中尝试实时提取 description，但流结束后仍以完整解析为准：

```typescript
async function* streamScenarioWithRealtimeExtract(
  prompt: string,
  config: LLMConfig
): AsyncGenerator<{ type: 'token'; content: string } | { type: 'complete'; data: ScenarioData }> {
  let fullText = '';
  let inDescription = false;
  
  for await (const token of streamChat(
    [{ role: 'user', content: prompt }],
    config
  )) {
    fullText += token;
    
    // 尝试检测 description 字段开始
    if (!inDescription && fullText.includes('"description"')) {
      inDescription = true;
    }
    
    if (inDescription) {
      yield { type: 'token', content: token };  // 只输出 description 内容
    }
  }
  
  // 最终解析
  const data = parseLLMJSON(fullText);
  yield { type: 'complete', data };
}
```

### 7.5 LLM 重试机制（替代 tenacity）

Python 版使用 `tenacity` 库实现指数退避重试。桌面版 TypeScript 实现：

```typescript
// src/services/retry.ts

export interface RetryOptions {
  maxAttempts: number;       // 默认: 3
  initialDelayMs: number;    // 默认: 1000
  maxDelayMs: number;        // 默认: 10000
  jitterMs: number;          // 默认: 2000
  retryableErrors: string[]; // 默认: ['ETIMEDOUT', 'ECONNRESET', 'Rate limit']
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    jitterMs: 2000,
    retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'Rate limit', '429'],
    ...options,
  };

  let lastError: Error;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // 检查是否可重试
      const message = error instanceof Error ? error.message : String(error);
      const isRetryable = opts.retryableErrors.some(e => message.includes(e));
      
      if (!isRetryable || attempt === opts.maxAttempts) {
        throw lastError;
      }
      
      // 指数退避 + jitter
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(2, attempt - 1),
        opts.maxDelayMs
      ) + Math.random() * opts.jitterMs;
      
      console.warn(`LLM retry attempt ${attempt}/${opts.maxAttempts} after ${delay}ms:`, message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw lastError!;
}

// 使用示例
const response = await withRetry(
  () => streamChat(messages, config),
  { maxAttempts: 3, initialDelayMs: 1000 }
);
```

**重试策略**：

| 错误类型 | 是否重试 | 说明 |
|---------|---------|------|
| 网络超时 | ✅ | ETIMEDOUT, ECONNRESET |
| LLM 429 | ❌ |  Rate limit（Python tenacity 不重试 429，转换为 LLMRateLimitError） |
| LLM 5xx | ✅ | 服务器错误 |
| LLM 401 | ❌ | 认证失败（API Key 错误） |
| LLM 400 | ❌ | 请求格式错误 |
| JSON 解析失败 | ❌ | 降级方案处理 |

### 7.6 前端 API 调用重试

Python 版 `apiCall` 有 2 次重试逻辑。桌面版等效实现：

```typescript
// src/services/api.ts

export async function apiCall<T>(
  endpoint: string,
  method: string = 'GET',
  data: any = null,
  retries: number = 2
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (data) options.body = JSON.stringify(data);

  let lastError: Error;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, options);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      
      // 客户端错误（4xx）不重试
      const message = error instanceof Error ? error.message : '';
      if (/40[0-4]|422/.test(message)) {
        throw error;
      }
      
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000;  // 1s, 2s
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw lastError!;
}
```

### 7.7 Tauri 安全头对齐

Python Web 版的安全头需要在 Tauri CSP 中对齐：

| Python 安全头 | Tauri 等效配置 | 状态 |
|-------------|---------------|------|
| `X-Request-ID` | 不需要（桌面端无多租户） | ✅ 可省略 |
| `X-Content-Type-Options: nosniff` | Tauri 默认启用 | ✅ 自动 |
| `X-Frame-Options: DENY` | Tauri 不允许 iframe | ✅ 自动 |
| `Referrer-Policy: same-origin` | CSP `referrer` 策略 | ✅ 可配置 |
| `Content-Security-Policy` | `tauri.conf.json` CSP | ✅ 必须配置 |
| CORS 中间件 | 不需要（无跨域） | ✅ 可省略 |

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.deepseek.com https://api.openai.com http://localhost:*; font-src 'self' data:; frame-ancestors 'none'"
    }
  }
}
```

---

## 八、存储层设计

### 8.0b 桌面端配置差异说明

桌面端不需要 Python Web 版的以下配置项（由 Tauri/Rust 处理或不需要）：

| Python 配置项 | 桌面端处理方式 |
|-------------|---------------|
| `database_url` | Rust sqlx 直接管理 SQLite 路径 |
| `database_echo` | 开发模式通过 `RUST_LOG` 控制 |
| `log_level` | structlog → Rust `env_logger` |
| `cors_allowed_origins` | 桌面端无跨域需求 |
| `worlds_dir` | 打包进 `public/worlds/` 资源目录 |

桌面端仅需用户配置：API Key、Base URL、Model、Temperature、MaxTokens、Timeout。

### 8.1 抽象接口

```typescript
// src/services/storage.ts

export interface StorageProvider {
  // 会话 CRUD
  saveSession(session: GameSession): Promise<void>;
  getSession(sessionId: string): Promise<GameSession | null>;
  listSessions(activeOnly?: boolean): Promise<GameSession[]>;
  deleteSession(sessionId: string): Promise<boolean>;
  
  // 配置
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;
}

// 工厂函数：自动选择实现
export function createStorage(): StorageProvider {
  // @ts-ignore - Tauri 环境变量
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return createTauriStorage();
  }
  return createWebStorage();
}
```

### 8.2 Web 实现（localStorage）

```typescript
class WebStorage implements StorageProvider {
  private prefix = 'bio_';
  
  async saveSession(session: GameSession): Promise<void> {
    localStorage.setItem(`${this.prefix}session_${session.sessionId}`, JSON.stringify(session));
  }
  
  async getSession(sessionId: string): Promise<GameSession | null> {
    const raw = localStorage.getItem(`${this.prefix}session_${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  }
  
  async listSessions(activeOnly?: boolean): Promise<GameSession[]> {
    const sessions: GameSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${this.prefix}session_`)) {
        const session = JSON.parse(localStorage.getItem(key)!);
        if (!activeOnly || session.isActive) {
          sessions.push(session);
        }
      }
    }
    return sessions.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  
  async deleteSession(sessionId: string): Promise<boolean> {
    const key = `${this.prefix}session_${sessionId}`;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      return true;
    }
    return false;
  }
  
  async getConfig(key: string): Promise<string | null> {
    return localStorage.getItem(`${this.prefix}config_${key}`);
  }
  
  async setConfig(key: string, value: string): Promise<void> {
    localStorage.setItem(`${this.prefix}config_${key}`, value);
  }
}
```

### 8.3 Tauri 实现（SQLite）

```typescript
// src/services/tauriStorage.ts
import { invoke } from '@tauri-apps/api/core';
import type { GameSession, StorageProvider } from './storage';

class TauriStorage implements StorageProvider {
  async saveSession(session: GameSession): Promise<void> {
    await invoke('save_session', { session });
  }
  
  async getSession(sessionId: string): Promise<GameSession | null> {
    return await invoke('get_session', { sessionId });
  }
  
  async listSessions(activeOnly?: boolean): Promise<GameSession[]> {
    return await invoke('list_sessions', { activeOnly });
  }
  
  async deleteSession(sessionId: string): Promise<boolean> {
    return await invoke('delete_session', { sessionId });
  }
  
  async getConfig(key: string): Promise<string | null> {
    return await invoke('get_config', { key });
  }
  
  async setConfig(key: string, value: string): Promise<void> {
    await invoke('set_config', { key, value });
  }
}
```

### 8.4 Rust 侧实现

```rust
// src-tauri/src/commands/db.rs
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

#[tauri::command]
pub async fn save_session(
    db: State<SqlitePool>,
    session: Value,
) -> Result<(), String> {
    let session_id = session["sessionId"].as_str().ok_or("Missing sessionId")?;
    
    sqlx::query(
        "INSERT OR REPLACE INTO sessions 
         (session_id, world, game_mode, system, player_name, 
          player_history, player_attributes, player_inventory,
          player_summary, player_qa_history, scenarios_json,
          is_active, biography, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    )
    .bind(session_id)
    .bind(&session["world"])
    .bind(&session["gameMode"])
    .bind(&session["system"])
    .bind(&session["player"]["name"])
    .bind(session["player"]["history"].to_string())
    .bind(session["player"]["attributes"].to_string())
    .bind(session["player"]["inventory"].to_string())
    .bind(&session["player"]["summary"])
    .bind(session["player"]["qaHistory"].to_string())
    .bind(session["scenarios"].to_string())
    .bind(session["isActive"])
    .bind(&session["biography"])
    .execute(&*db.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_session(
    db: State<SqlitePool>,
    session_id: String,
) -> Result<Option<Value>, String> {
    let row: Option<(String, String, String, String, String, String, String, String, String, String, String, bool, Option<String>, String)> = 
        sqlx::query_as(
            "SELECT session_id, world, game_mode, system, player_name,
                    player_history, player_attributes, player_inventory,
                    player_summary, player_qa_history, scenarios_json,
                    is_active, biography, created_at
             FROM sessions WHERE session_id = ?"
        )
        .bind(&session_id)
        .fetch_optional(&*db.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    // Convert to JSON Value...
    // (实现省略，详见开发文档)
    
    Ok(None) // 占位
}
```

---

## 九、配置管理

### 9.1 默认配置

```typescript
// src/services/config.ts

export const DEFAULT_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.8,
  maxTokens: 4096,
  timeout: 120000,
};

export const PRESET_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek（推荐）',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    description: '免费，新用户赠 $5 额度',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    description: '付费，稳定可靠',
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5',
    description: '完全免费，本地运行',
  },
];
```

---

## 十、本地化功能设计

> **本项目无后端**，所有功能本地完成。以下设计涵盖：设置界面、世界观管理、本地数据管理。

### 10.1 设置界面

**入口**：全局导航栏右上角 ⚙️ 图标 → `SettingsScreen`（Modal 或独立页面）

**Tab 布局**：

| Tab | 功能 |
|-----|------|
| **LLM 设置** | API Key、提供商预设、模型、温度、最大 Token、超时 |
| **高级设置** | 游戏参数滑块（max_choices、temperature 等 14 项配置） |
| **数据管理** | 数据库备份/恢复、会话批量清理、导入导出存档 |
| **关于** | 版本号、许可证、Open Source 依赖列表 |

#### 10.1.1 LLM 设置

```
┌─────────────────────────────────────────────────┐
│  LLM 提供商设置                                    │
│  ┌─────────────────────────────────────────────┐│
│  │ ● DeepSeek（推荐） ○ OpenAI ○ Ollama ○ 自定义 ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  API Key: [••••••••••••••••] [👁️ 显示] [📋 粘贴] │
│  Base URL: [https://api.deepseek.com         ]   │
│  模型:     [deepseek-chat                   ▼]   │
│                                                  │
│  温度:     [━━━━●━━━━] 0.8  (0.0 ~ 2.0)          │
│  最大Token:[━━━━●━━━━] 4096 (256 ~ 32768)        │
│  超时:     [━━━━●━━━━] 120s (10s ~ 300s)         │
│                                                  │
│  [💡 测试连接]  ← 发送空请求验证 Key 有效性          │
└─────────────────────────────────────────────────┘
```

#### 10.1.2 高级设置（14 项游戏参数）

| 参数 | 控件 | 默认 | 范围 |
|------|------|------|------|
| `max_choices` | 数字输入 | 30 | 3-100 |
| `max_auto_continue` | 数字输入 | 5 | 1-20 |
| `summary_threshold` | 数字输入 | 15 | 5+ |
| `summary_keep_latest` | 数字输入 | 10 | 3+ |
| `max_history_hard_cap` | 只读显示 | 45 | threshold×3 |
| `max_qa_history` | 数字输入 | 20 | - |
| `max_scenarios_in_memory` | 数字输入 | 2 | - |
| `world_cache_ttl` | 数字输入+单位 | 300s | - |
| `world_cache_max_size` | 数字输入 | 20 | - |
| `world_max_chars` | 数字输入 | 50000 | - |
| `max_sessions_in_list` | 数字输入 | 50 | 1-200 |
| `llm_request_timeout` | 数字输入 | 120 | ≥10s |
| `llm_max_retries` | 数字输入 | 3 | 0-10 |
| `temperature` | 已在 LLM Tab | 0.8 | 0.0-2.0 |

#### 10.1.3 数据管理

```
┌─────────────────────────────────────────────────┐
│  数据库管理                                       │
│  ┌─────────────────────────────────────────────┐│
│  │ 📊 数据库路径: ~/.local/share/.../biography.db││
│  │ 📊 数据库大小: 12.3 MB                        ││
│  │ 📊 会话数量: 23 (活跃: 3)                      ││
│  │                                              ││
│  │ [📦 导出数据库] [📥 导入数据库]                ││
│  │                                              ││
│  │ [🗑️ 清理已结束会话] [🗑️ 清理全部会话]           ││
│  │                                              ││
│  │ ⚠️ 清理操作不可恢复，建议先导出备份              ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

#### 10.1.4 设置持久化

```typescript
// src/types/settings.ts

export interface AppSettings {
  // LLM
  llmProvider: 'deepseek' | 'openai' | 'ollama' | 'llamacpp' | 'custom';
  apiKey: string;           // Tauri: keyring / Web: localStorage
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  
  // 游戏参数
  maxChoices: number;
  maxAutoContinue: number;
  summaryThreshold: number;
  summaryKeepLatest: number;
  maxQaHistory: number;
  maxScenariosInMemory: number;
  worldCacheTTL: number;
  worldCacheMaxSize: number;
  worldMaxChars: number;
  maxSessionsInList: number;
  llmMaxRetries: number;
}
```

### 10.2 世界观管理界面

**入口**：StartScreen 下拉框旁「管理世界」按钮 → `WorldManagerScreen`

**数据存储**：用户世界观文件存储在 `AppData` 目录（非 `public/`），与打包内置世界分离。

#### 10.2.1 目录结构

```
~/.local/share/biography-desktop/worlds/
├── wuxia_jianghu.md          # 用户自建或导入的世界
├── fantasy_epic/             # 目录式世界
│   ├── README.md
│   ├── GEOGRAPHY.md
│   └── ...
└── (用户自定义)
```

#### 10.2.2 世界观列表

```
┌─────────────────────────────────────────────────────────────────┐
│  世界观管理                                      [+ 新建] [📥 导入]│
├─────────────────────────────────────────────────────────────────┤
│  📁 内置世界 (打包资源，只读)                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🌏 武侠江湖 · 天武风云录          [预览]                       ││
│  │    刀光剑影的武侠世界...                                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  📁 用户世界                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🌍 我的修仙世界              [编辑] [导出] [删除]               ││
│  │    一个修仙与凡人并存的大世界...   单文件 · 23KB               ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ 🌍 赛博朋克 2077             [编辑] [导出] [删除]               ││
│  │    夜之城的故事...              目录式 · 4个文件 · 67KB        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [📂 打开世界文件夹]                                              │
└─────────────────────────────────────────────────────────────────┘
```

#### 10.2.3 新建/编辑世界

```
┌─────────────────────────────────────────────────┐
│  新建世界观                          [保存] [取消] │
├─────────────────────────────────────────────────┤
│  名称:   [我的新世界                        ]     │
│  类型:   [○ 单文件  ● 目录式]                     │
│  描述:   [一个充满魔法与剑的世界...           ]   │
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ # 世界概述                                     │
│  │ 这是一个...                                   │
│  │                                               │
│  │ ## 地理环境                                    │
│  │ ...                                           │
│  │                                               │
│  │                                               │
│  └─────────────────────────────────────────────┘│
│  Markdown 编辑器 (支持预览、撤销/重做、语法高亮)     │
└─────────────────────────────────────────────────┘
```

#### 10.2.4 导入世界

- **拖拽导入**：支持拖拽 `.md` 文件或 `.zip` 压缩包
- **文件选择器**：选择 `.md` 文件或文件夹
- **导入逻辑**：
  - 单 `.md` 文件 → 存入用户世界目录，以文件名命名
  - 目录 → 整体复制，检查 README.md 或首个文件作为世界名
  - `.zip` → 解压后按目录规则处理
  - 重名提示：覆盖 / 重命名 / 跳过
- **格式校验**：检查 Markdown 有效性、字符数限制（50K 截断警告）

#### 10.2.5 导出世界

- **单文件世界**：直接导出 `.md` 文件
- **目录式世界**：打包为 `.zip` 导出
- **批量导出**：勾选多个世界 → 打包为 `biography-worlds-export-{date}.zip`

#### 10.2.6 删除世界

- 内置世界不可删除（UI 置灰删除按钮）
- 用户世界删除需二次确认
- 删除后自动清理缓存

#### 10.2.7 世界观类型定义

```typescript
// src/types/world.ts

export interface WorldMeta {
  name: string;           // 世界显示名称
  filename: string;       // 文件名或目录名
  type: 'single' | 'directory';
  description: string;    // 首段预览
  isBuiltIn: boolean;     // 是否为打包内置世界
  fileSize: number;       // 字节数（目录则为总大小）
  fileCount: number;      // 文件数（单文件为 1）
  lastModified: string;   // 最后修改时间
}
```

#### 10.2.8 Tauri Commands（世界观管理扩展）

```rust
// src-tauri/src/commands/world.rs 扩展
#[tauri::command]
pub async fn save_world(world_name: String, content: String) -> Result<(), String>;
#[tauri::command]
pub async fn delete_world(world_name: String) -> Result<(), String>;
#[tauri::command]
pub async fn export_world(world_name: String) -> Result<String, String>; // 返回文件路径
#[tauri::command]
pub async fn import_world(source_path: String, dest_name: String) -> Result<(), String>;
#[tauri::command]
pub async fn open_worlds_folder() -> Result<(), String>; // 打开系统文件管理器
```

### 10.3 本地数据管理

#### 10.3.1 数据库备份与恢复

```
┌─────────────────────────────────────────────────┐
│  备份管理                                         │
├─────────────────────────────────────────────────┤
│  当前数据库: ~/.local/share/.../biography.db      │
│  大小: 12.3 MB · 23 个会话                        │
│                                                  │
│  最近备份:                                        │
│  📦 backup-2025-05-28.db          [恢复] [删除]   │
│  📦 backup-2025-05-20.db          [恢复] [删除]   │
│                                                  │
│  [📦 立即备份]                                    │
│  📁 备份目录: ~/.local/share/.../biography-backups│
│  [📂 打开备份文件夹]                               │
└─────────────────────────────────────────────────┘
```

- **备份**：复制 `biography.db` 到备份目录，加时间戳
- **恢复**：选择备份文件 → 二次确认 → 关闭数据库 → 替换 → 重开
- **自动备份**：每次重大操作（开始新游戏、生成传记完成）前自动备份
- **备份保留**：最多保留 10 个，超出自动清理最旧

#### 10.3.2 会话管理

```
┌─────────────────────────────────────────────────────────────────┐
│  会话管理                                              [🗑️ 批量清理]│
├─────────────────────────────────────────────────────────────────┤
│  状态筛选: [全部 ▼]  搜索: [                  ]                    │
├─────────────────────────────────────────────────────────────────┤
│  ☐ 🟢 活跃 · 张三 · 武侠江湖 · 12章 · 2025-05-28   [继续] [删除] │
│  ☐ 🟢 活跃 · 李四 · 修仙世界 · 5章  · 2025-05-27   [继续] [删除] │
│  ☐ ⚪ 结束 · 王五 · 武侠江湖 · 传记已生成           [查看] [删除] │
│  ☐ ⚪ 结束 · 赵六 · 赛博朋克 · 传记已生成           [查看] [删除] │
│  ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

#### 10.3.3 数据导入导出格式

```typescript
// 完整数据导出格式（JSON + SQLite + 世界观打包）

export interface FullExport {
  version: '1.0';
  exportedAt: string;
  appVersion: string;
  
  // 设置
  settings: Partial<AppSettings>;  // 不含 API Key
  
  // 世界观
  worlds: WorldExport[];
  
  // 会话
  sessions: SessionExport[];
}

export interface WorldExport {
  meta: WorldMeta;
  content: string | DirectoryEntry[];  // 单文件=内容，目录=文件数组
}

export interface DirectoryEntry {
  path: string;   // 相对路径
  content: string;
}

export interface SessionExport {
  session: GameSession;
  biographyFile?: string;  // 传记文本
}
```

#### 10.3.4 Tauri Commands（数据管理扩展）

```rust
// src-tauri/src/commands/data.rs 新增
#[tauri::command]
pub async fn backup_database() -> Result<String, String>;          // 返回备份路径
#[tauri::command]
pub async fn restore_database(backup_path: String) -> Result<(), String>;
#[tauri::command]
pub async fn list_backups() -> Result<Vec<BackupMeta>, String>;
#[tauri::command]
pub async fn delete_backup(backup_path: String) -> Result<(), String>;
#[tauri::command]
pub async fn export_full_data(export_path: String) -> Result<(), String>;
#[tauri::command]
pub async fn import_full_data(import_path: String) -> Result<(), String>;
#[tauri::command]
pub async fn clear_ended_sessions() -> Result<usize, String>;      // 返回清理数量
#[tauri::command]
pub async fn clear_all_sessions() -> Result<(), String>;
#[tauri::command]
pub async fn open_backups_folder() -> Result<(), String>;
#[tauri::command]
pub async fn get_database_info() -> Result<DatabaseInfo, String>;
```

---

## 十一、UI 设计

### 11.1 六屏架构

| 屏幕 | 用途 | 组件 |
|------|------|------|
| `StartScreen` | 输入角色名、选世界、选模式 | 表单 + 断点续传卡片 + 管理世界入口 |
| `SystemScreen` | 选择系统方案（system 模式） | 卡片列表 + 流式预览 |
| `GameScreen` | 主游戏界面 | 场景描述 + 选项按钮 + 历史面板 + Q&A |
| `BiographyScreen` | 传记展示 | 格式化文本 + 下载按钮 |
| `SettingsScreen` | 设置面板 | LLM / 高级 / 数据管理 / 关于 Tab |
| `WorldManagerScreen` | 世界观管理 | 列表 + 新建/编辑/导入/导出/删除 |

### 11.2 流式 UI 反馈 — 样式不丢失策略

> **核心原则：流式过程中保持文本可读、样式一致，结束后再应用完整 Markdown 渲染。**

**问题场景**：LLM 逐字输出时，Markdown 标记可能处于未闭合状态：
```
你走进一间**古老的图书馆  ← `**` 未闭合，浏览器会尝试渲染但样式断裂
```

**解决方案：两阶段渲染**

| 阶段 | 渲染方式 | 样式保证 |
|------|---------|---------|
| **流式进行中** | 纯文本 `whitespace-pre-wrap` + 容器样式 | 字体、颜色、间距由 CSS 控制，不受 Markdown 断裂影响 |
| **流式完成后** | 全量 Markdown → HTML + DOMPurify | 完整解析，样式正确 |

```tsx
// src/components/screens/GameScreen.tsx — 场景描述区

import DOMPurify from 'dompurify';
import { marked } from 'marked';

function ScenarioDescription({
  streamedText,
  isStreaming,
}: {
  streamedText: string;
  isStreaming: boolean;
}) {
  if (isStreaming) {
    // 流式阶段：纯文本 + 预格式化，样式由容器 CSS 控制
    return (
      <div className="prose prose-lg max-w-none
                     text-slate-200 leading-relaxed
                     whitespace-pre-wrap break-words
                     animate-pulse-subtle">  {/* subtle cursor effect */}
        {streamedText}
        <span className="inline-block w-0.5 h-5 bg-amber-400 ml-0.5 animate-blink" />  {/* 打字光标 */}
      </div>
    );
  }

  // 流式完成后：完整 Markdown 渲染
  const html = DOMPurify.sanitize(marked.parse(streamedText) as string);
  return (
    <div
      className="prose prose-lg prose-invert max-w-none
                 prose-headings:text-amber-300
                 prose-p:text-slate-200
                 prose-strong:text-slate-100
                 prose-em:text-slate-300"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

**各区域渲染策略**：

```
┌─────────────────────────────────────────────────────────┐
│ 场景描述区域                                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [流式中] 纯文本 whitespace-pre-wrap                  │ │
│ │            字体/颜色由 .prose 容器 CSS 控制           │ │
│ │            打字光标动画提示生成中                     │ │
│ │ [完成后] 完整 Markdown → HTML + DOMPurify           │ │
│ │            Tailwind @tailwindcss/typography 样式     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ 传记区域                                                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 同场景描述区域策略                                    │ │
│ │ 完成后额外渲染「下载 .txt」按钮                       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ Q&A 对话区                                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [流式中] 纯文本 + 打字光标                           │ │
│ │ [完成后] Markdown → HTML                             │ │
│ │ 用户消息：始终纯文本（不解析 Markdown）               │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ 系统方案预览区                                            │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [流式中] 纯文本 monospace（等宽字体显示 JSON 原始流）  │ │
│ │ [完成后] 解析 JSON → 渲染为结构化卡片                 │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**性能优化**：
- 流式过程中使用 `requestAnimationFrame` 批量更新 DOM，避免逐 token 触发重渲染
- 文本超过 2000 字符时使用虚拟滚动（仅渲染可视区域 + buffer）
- Markdown 解析仅在流式完成后执行一次，不在流中实时解析

---

## 十二、游戏引擎规则

### 12.1 状态转换

```
start ──(basic)──▶ game
start ──(system)─▶ system ──(select)──▶ game
game  ──(choice)──▶ game              (循环)
game  ──(end)─────▶ biography
game  ──(max_choices)─▶ biography     (自动结束)
biography ──(new)──▶ start
any   ──(⚙️ settings)──▶ settings ──(back)──▶ any
any   ──(🌍 worlds)──▶ world-manager ──(back)──▶ any
```

### 12.2 关键规则与完整配置参数

| 配置项 | 默认值 | 范围 | 说明 |
|--------|--------|------|------|
| `max_choices` | 30 | 3-100 | 最大选择次数（含自动续接），达到后自动结束游戏 |
| `max_auto_continue` | 5 | 1-20 | 最大连续自动推进次数，超过后强制给出选择 |
| `summary_threshold` | 15 | 5+ | 触发历史摘要压缩的条目数阈值 |
| `summary_keep_latest` | 10 | 3+ | 摘要后保留的最近详细条目数 |
| `max_history_hard_cap` | 45 | threshold×3 | 历史硬上限（threshold × 3），超过强制截断 |
| `max_tokens` | 4096 | 256-32768 | LLM 单次最大输出 token 数 |
| `temperature` | 0.8 | 0.0-2.0 | LLM 创意度控制 |
| `llm_request_timeout` | 120s | ≥10s | LLM API 请求超时 |
| `llm_max_retries` | 3 | 0-10 | LLM 调用最大重试次数 |
| `max_qa_history` | 20 | - | Q&A 对话历史最大条目数（保留最近 20 条） |
| `max_scenarios_in_memory` | 2 | - | 内存中保留的场景数（超出则丢弃最旧） |
| `world_cache_ttl` | 300s | - | 世界观文件缓存有效期（5 分钟） |
| `world_cache_max_size` | 20 | - | 世界观缓存最大条目数（LRU 淘汰） |
| `world_max_chars` | 50000 | - | 世界观加载最大字符数（超出截断） |
| `max_sessions_in_list` | 50 | 1-200 | 会话列表最大返回条数 |

### 12.3 自动续接逻辑

```typescript
// 当 LLM 返回 choices=[] 时
if (!data.choices || data.choices.length === 0) {
  autoCount++;
  if (autoCount >= MAX_AUTO_CONTINUE) {
    // 强制给出选择
    return {
      title: current.title,
      description: current.description,
      choices: [
        { id: 'a', text: '继续前行', description: '沿着命运指引的方向前进' },
        { id: 'b', text: '另寻他路', description: '选择一条不同的道路' },
      ],
      autoContinue: false,
      ending: null,
    };
  }
  // 自动记录并继续
  history.push({
    scenario: data.title,
    scenarioDescription: data.description,
    choice: '(故事继续)',
    choiceId: '__auto_continue__',  // 特殊 ID，用于区分自动续接
  });
}
```

**`__auto_continue__` 特殊 choice_id 处理**：
- 用于区分玩家主动选择和系统自动推进
- 前端在历史记录中显示为 `(故事继续)`
- 不计入玩家实际选择次数（用于成就/统计）

### 12.4 历史摘要压缩（双路径逻辑）

游戏过程中历史不断累积，为避免超出 LLM 上下文窗口，实现**双路径摘要机制**：

```
正常路径：history ≥ 15 条
  ├─ 旧章节（前 history.length-10 条）→ LLM 摘要 → 合并到 player.summary
  └─ 新章节（后 10 条）→ 保留详细记录

硬上限路径：history > 45 条（threshold × 3）
  ├─ 尝试 LLM 摘要前 history.length-15 条 + 已有 summary → 合并为新 summary
  ├─ 成功 → 只保留最后 15 条详细记录
  └─ 失败 → 降级为直接截断，保留最后 15 条（不丢失游戏进度）
```

**注意**：Python 原版硬上限路径使用 `history[:-threshold]` 选择旧章节，而非 `history[-threshold:]`。桌面版 TS 实现使用 `history.slice(0, -threshold)` 对应此逻辑。

### 12.4b Prompt 文件系统覆盖机制

Python 版 `PromptManager` 支持从 `prompts/` 目录加载自定义 prompt 模板：

```python
class PromptManager:
    def __init__(self, prompts_dir: Optional[str] = None) -> None:
        self._dir = prompts_dir or self._default_dir()  # → prompts/
    
    def _load(self, name: str, fallback: str) -> str:
        """Try filesystem first, fall back to built-in."""
        path = os.path.join(self._dir, name)
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        return fallback
```

桌面版可将此功能移植为用户可编辑的 prompt 目录，或暂时简化为硬编码。

### 12.4c LLM 输出清理正则

```typescript
function cleanLLMOutput(text: string): string {
  return text
    .replace(/<thinking>.*?<\/thinking>/gs, '')
    .replace(/<reasoning>.*?<\/reasoning>/gs, '')
    .replace(/<answer>.*?<\/answer>/gs, '')
    .replace(/```(?:json)?\s*/g, '')
    .replace(/\s*```/g, '')
    .trim();
}
```

### 12.4d World 仓库辅助函数

| 函数 | 用途 |
|------|------|
| `_read_file(path)` | 读取单个 .md 文件内容 |
| `_read_lines(path, n)` | 读取文件前 n 行 |
| `_load_directory(dir, maxChars)` | 按优先级加载目录中所有 .md 文件，超限截断 |
| `_append_until_limit(parts, content, label, limit, current)` | 追加内容直到达到字符限制 |

### 12.4e Session 仓库辅助函数

| 函数 | 用途 |
|------|------|
| `_model_to_domain(model)` | 将 SQLAlchemy ORM 对象转换为 Pydantic GameSession |
| `get_or_raise(session_id)` | 获取会话，不存在则抛出 SessionNotFoundError |

### 12.4f Game 服务辅助函数

| 函数 | 用途 |
|------|------|
| `list_sessions(activeOnly?, limit?)` | 列出会话，按创建时间倒序 |
| `delete_session(session_id)` | 删除会话 |
| `query(session_id, question)` | 回答玩家问题 |
| `_record_choice(session, current, choice_id)` | 记录玩家选择到历史 |
| `_load_world_or_raise(world)` | 加载世界观，不存在则抛异常 |

### 12.4g Main 辅助函数

| 函数 | 用途 |
|------|------|
| `_ensure_env_file()` | 自动从 .env.example 创建 .env |
| `add_security_headers` 中间件 | 生成 request_id，绑定 structlog，添加安全头 |
| 静态文件挂载 | 挂载 `static/` 目录到 `/static` |

### 12.4h CSS 样式文件

`static/css/style.css` 包含所有屏幕布局、卡片样式、按钮状态、加载动画、模态框、Q&A 面板等样式。桌面版迁移时需转换为 Tailwind CSS 或保留为全局样式。

### 12.5 LLM JSON 解析失败降级方案

当 LLM 返回无效 JSON 时（约 30% 概率，尤其是复杂场景），不中断游戏，返回硬编码 fallback 场景：

```typescript
async function resolveNextScenario(): Promise<ScenarioData> {
  try {
    const data = await callLLM(...);
    return parseLLMJSON(data);  // 可能抛出异常
  } catch {
    // LLM 解析失败降级方案
    return {
      title: '命运的转折',
      description: '世界在你面前展开新的篇章……',
      choices: [
        { id: 'a', text: '继续前进', description: '勇敢面对未知' },
        { id: 'b', text: '停下来思考', description: '谨慎考虑下一步' },
        { id: 'c', text: '寻求帮助', description: '寻找同伴的建议' },
      ],
      autoContinue: false,
      ending: null,
    };
  }
}
```

**降级触发条件**：
- LLM 返回包含 thinking 标签但无有效 JSON
- LLM 返回纯文本而非 JSON
- LLM 返回格式错误的 JSON（括号不匹配等）
- OpenAI API 返回非 2xx 状态码

### 12.6 限速器说明（桌面端已移除）

Python Web 版使用内存 Token Bucket 限速器保护 LLM API 调用。桌面版每个用户实例独立运行，不需要服务端限速，但前端增加了**请求冷却时间**防止用户快速连续点击：

```typescript
// 前端冷却时间
const COOLDOWN = {
  startGame: 5000,      // 5 秒
  makeChoice: 3000,     // 3 秒
  generateBiography: 5000,
};
```

---

## 十三、世界观数据格式

### 13.1 单文件世界

```markdown
# 武侠江湖 — 天武风云录

## 世界概述
这是一个刀光剑影、快意恩仇的武侠世界...

## 地理环境
### 中原
- **应天府** — 天子脚下...
...
```

### 13.2 目录式世界

```
worlds/
└── fantasy_world/
    ├── README.md          # 世界概述（优先读取）
    ├── WORLD_OVERVIEW.md  # 世界概览
    ├── GEOGRAPHY.md       # 地理
    ├── COSMOLOGY.md       # 宇宙观
    ├── RACES/
    │   ├── humans.md
    │   └── elves.md
    ├── CLASSES/
    │   ├── warriors.md
    │   └── mages.md
    └── ...
```

### 13.3 加载优先级

```
1. README.md
2. WORLD_OVERVIEW.md
3. COSMOLOGY.md
4. GEOGRAPHY.md
5. 其他所有 .md 文件（按字母顺序）
```

最大字符限制：50,000 字符（超出截断）

### 13.4 世界观缓存机制（仅 Web 版需要）

桌面端世界观文件打包进资源，无需文件系统缓存。但 Web 版（如果保留）需要实现：

```typescript
// 世界观缓存策略
class WorldCache {
  private cache = new Map<string, { content: string; timestamp: number }>();
  private readonly TTL = 300_000;  // 5 分钟
  private readonly MAX_SIZE = 20;   // 最大条目数

  get(name: string): string | null {
    const entry = this.cache.get(name);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(name);  // 过期删除
      return null;
    }
    return entry.content;
  }

  set(name: string, content: string): void {
    if (this.cache.size >= this.MAX_SIZE) {
      // LRU 淘汰：删除最早添加的条目
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(name, { content, timestamp: Date.now() });
  }
}
```

### 13.5 世界观路径安全检查

防止 `../` 路径穿越攻击（主要保护 Web 版，桌面端打包文件无需此检查）：

```typescript
function isSafeWorldName(name: string): boolean {
  // 仅允许字母、数字、连字符、下划线和 CJK 字符
  return !!(
    name &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.startsWith('.')
  );
}
```

---

## 十四、安全设计

### 14.1 API Key 存储

| 模式 | 存储方式 |
|------|---------|
| Web | localStorage（明文） |
| Tauri | OS keychain（加密） |

### 14.2 Tauri 安全配置

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.deepseek.com https://api.openai.com http://localhost:*"
    }
  }
}
```

### 14.3 XSS 防护

- 所有用户输入通过 DOMPurify 过滤
- `textContent` 优先于 `innerHTML`
- 传记渲染使用 `DOMPurify.sanitize()`

### 14.4 Tauri IPC 安全（命令白名单）

仅暴露必要的 Rust 命令给前端，所有命令需显式注册：

```rust
// src-tauri/src/main.rs - 命令白名单
.invoke_handler(tauri::generate_handler![
    // 会话管理
    commands::db::save_session,
    commands::db::get_session,
    commands::db::list_sessions,
    commands::db::delete_session,
    // 配置管理
    commands::config::get_config,
    commands::config::set_config,
    // 世界观数据
    commands::world::load_world,
    commands::world::list_worlds,
    commands::world::save_world,
    commands::world::delete_world,
    commands::world::export_world,
    commands::world::import_world,
    commands::world::open_worlds_folder,
    // 数据管理
    commands::data::backup_database,
    commands::data::restore_database,
    commands::data::list_backups,
    commands::data::delete_backup,
    commands::data::export_full_data,
    commands::data::import_full_data,
    commands::data::clear_ended_sessions,
    commands::data::clear_all_sessions,
    commands::data::open_backups_folder,
    commands::data::get_database_info,
])
```

**命令权限矩阵**：

| 命令 | 输入 | 输出 | 副作用 | 安全级别 |
|------|------|------|--------|---------|
| `save_session` | JSON | void | 写入 SQLite | 中（用户数据） |
| `get_session` | session_id | JSON | 无 | 低（只读） |
| `list_sessions` | active_only? | JSON[] | 无 | 低（只读） |
| `delete_session` | session_id | bool | 删除记录 | 高（破坏性） |
| `get_config` | key | string\|null | 无 | 低（只读） |
| `set_config` | key, value | void | 写入 SQLite | 中（配置数据） |
| `load_world` | world_name | string | 读文件 | 低（只读+路径检查） |
| `list_worlds` | 无 | JSON[] | 扫描目录 | 低（只读） |
| `save_world` | name, content | void | 写入文件 | 中（用户数据） |
| `delete_world` | world_name | void | 删除文件 | 高（破坏性） |
| `export_world` | world_name | path | 读+打包 | 低（只读） |
| `import_world` | src, dest | void | 写入文件 | 中（需格式校验） |
| `open_worlds_folder` | 无 | void | 打开文件夹 | 低 |
| `backup_database` | 无 | path | 复制文件 | 低（只读） |
| `restore_database` | backup_path | void | 替换数据库 | 高（破坏性） |
| `list_backups` | 无 | BackupMeta[] | 无 | 低（只读） |
| `delete_backup` | backup_path | void | 删除备份 | 中（破坏性） |
| `export_full_data` | export_path | void | 读+打包导出 | 低（只读） |
| `import_full_data` | import_path | void | 导入+覆盖 | 高（破坏性） |
| `clear_ended_sessions` | 无 | count | 批量删除 | 高（破坏性） |
| `clear_all_sessions` | 无 | void | 全量删除 | 高（破坏性） |
| `open_backups_folder` | 无 | void | 打开文件夹 | 低 |
| `get_database_info` | 无 | DatabaseInfo | 无 | 低（只读） |

**安全规则**：
- `load_world` 执行路径安全检查（`is_safe_world_name`）
- `delete_session` 仅删除用户自己的会话
- API Key 通过 OS keychain 存储，不直接暴露给 IPC

### 14.5 测试框架选型

| 层级 | 工具 | 用途 |
|------|------|------|
| TypeScript 单元测试 | Vitest | 解析器、SSE、Prompt 格式化 |
| TypeScript 组件测试 | React Testing Library | UI 组件渲染 |
| Rust 单元测试 | `cargo test` | Commands、数据库操作 |
| Tauri E2E 测试 | Playwright + Tauri driver | 完整游戏流程 |
| 类型检查 | `tsc --noEmit` + `rustc` | 编译时类型安全 |

---

## 十五、测试策略

### 15.1 单元测试

| 模块 | 测试内容 |
|------|---------|
| `parser.ts` | JSON 解析容错（thinking 标签、markdown 围栏） |
| `sse.ts` | SSE 行解析、转义/还原 |
| `prompts.ts` | Prompt 格式化、历史压缩 |
| `engine.ts` | 状态转换、自动续接逻辑 |

### 15.2 集成测试

| 场景 | 测试内容 |
|------|---------|
| 完整游戏流程 | 开始 → 选择 → 结束 → 传记 |
| 断点续传 | 保存 → 关闭 → 恢复 |
| 流式输出 | Token 逐字到达、完成事件解析 |
| 错误恢复 | LLM 超时 → 重试 → 降级 |

---

## 十六、构建与打包

### 16.1 开发

```bash
npm install
npm run dev          # Web 模式: http://localhost:5173
npm run tauri dev    # 桌面模式: 原生窗口 + DevTools
```

### 16.2 生产构建

```bash
# Web 版
npm run build        # → dist/

# 桌面版
npm run tauri build  # → src-tauri/target/release/bundle/
```

### 16.3 打包产物

| 平台 | 产物 | 大小 |
|------|------|------|
| Windows | `.exe` + `.msi` | ~8MB |
| macOS | `.app` + `.dmg` | ~12MB |
| Linux | `.deb` + `.AppImage` | ~10MB |

### 16.4 Tauri 配置

```json
{
  "productName": "传记生成器",
  "version": "1.0.0",
  "identifier": "com.biography.generator",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "withDebug": true,
    "windows": [
      {
        "title": "传记生成器",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "center": true
      }
    ]
  },
  "bundle": {
    "active": true,
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
    "targets": ["app", "dmg", "msi", "deb", "appimage"]
  }
}
```
