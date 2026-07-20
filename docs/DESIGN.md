# Biography Desktop - 详细设计文档

> 从 Python/FastAPI Web 应用迁移为 Tauri + TypeScript 桌面应用
> 应用版本: 0.1.1 | 文档最后更新: 2026-07-20

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

---

## 十七、云端稳定版架构（Session Schema v2）

### 17.1 正式能力边界

- 正式构建仅注册 DeepSeek 与 OpenAI 两个 Chat Completions 适配器。
- Ollama、llama.cpp 与自定义兼容接口由 `VITE_ENABLE_EXPERIMENTAL_PROVIDERS` 控制；Rust 本地模型命令由默认关闭的 `local-model` feature 控制。
- 实验构建必须通过 `npm run tauri:build:experimental` 同时启用 Vite experimental mode、独立 Tauri CSP（放行 `localhost` 与 `127.0.0.1`）和 Cargo `local-model` feature；本地提供商不得强制要求 API Key。
- 稳定版仍只注册 DeepSeek/OpenAI 两个提供商，但二者的 Base URL 均可编辑，以支持用户自有代理或 OpenAI-compatible 网关。Base URL 留空时必须按当前提供商回退到官方地址；自定义地址会接收 API Key 与生成上下文，设置页必须明确提示这一边界。
- 自定义远程 Base URL 必须使用 HTTPS。HTTP 仅允许精确的 `localhost`、`127.0.0.1` 与 `::1` 回环主机（可带端口），用于本地代理和实验模型；请求层与设置页复用同一校验，并拒绝伪造 localhost、非 HTTP(S) 协议、URL 凭据、query 和 fragment。旧的不安全地址保留显示供用户修正，但不得发出请求。
- Web 模式仅用于开发调试；桌面版 API Key 存放在系统 keyring。云端模式会向所选提供商发送生成所需的世界观、角色和剧情文本。
- Tauri 运行时必须通过 Tauri 2 默认注入的 `window.__TAURI_INTERNALS__`（兼容显式启用的 `window.__TAURI__`）识别，并由存储、世界观与 API Key 服务共享同一个判断；不得因 `withGlobalTauri=false` 将正式包误判为 Web 模式。
- `app_settings` 与 SQLite `config` 表不得包含 API Key；读取旧版明文设置时必须忽略该字段，启动后仅将 keyring（Web 调试模式为专用 localStorage key）中的值注入内存 `settings/config`。
- 稳定构建读取旧 `app_config` 时，提供商必须经过 DeepSeek/OpenAI 白名单归一化；受支持提供商显式保存的 Base URL（包括空值）与模型应予保留。旧实验提供商不得覆盖当前稳定设置。仅存在旧 `app_config` 时可迁移带有明确 DeepSeek/OpenAI provider 的自定义端点和通用数值参数。
- 仅存在旧 `app_config` 时，迁移结果必须同时更新内存中的 `settings` 与 `config`，并写回 `app_settings`；界面展示、连接测试与游戏请求不得指向不同提供商。
- 设置保存按“安全存储 API Key → 持久化非敏感设置 → 发布 Store 状态”提交。任一步失败时不得留下已生效但未持久化的 Store 状态，并必须向用户显示可理解的错误。
- 设置页中的未保存 API Key 草稿必须绑定当前 provider 与规范化 Base URL 作用域；作用域变化或地址失效时立即清空草稿、连接测试结果和明文显示状态，但不得删除其他作用域已保存的 Keyring/Web 调试密钥。
- Tauri IPC 拒绝既可能是 `Error` 也可能是非空字符串；界面必须保留字符串诊断信息，不得统一降级为“未知错误”。

### 17.2 会话与世界观真值

`GameSession.schemaVersion` 固定为 `2`，并保存 `worldRef`：

```ts
interface WorldRef {
  name: string;
  source: 'builtin' | 'user';
  type: 'single' | 'directory';
}
```

序章、后续场景、问答和传记必须使用同一个 `worldRef`。schema v2 的显式 `worldRef` 是严格来源真值，加载失败时不得跨 `builtin/user` 或 `single/directory` 静默切换。只有旧会话归一化阶段可以按“世界列表识别 → 内置单文件 → 内置目录 → 用户世界”的顺序探测并生成最终 `worldRef`。SQLite 使用 `PRAGMA user_version` 事务迁移并持久化 `end_reason`、世界来源与类型；高于当前支持版本的数据库必须拒绝打开，禁止由旧代码降级写入。

旧版全量 JSON 导入不得直接伪装成 schema v2；缺少 `worldRef` 时必须保留 v1 标记，让统一归一化流程识别真实世界来源。玩家主动结束旅程时，`isActive=false` 与 `endReason=player_ended` 必须先进入 Store 并完成持久化，之后才能打开传记确认，避免结束保存与传记保存乱序覆盖。剧情结束面板的 `end` 选择必须保留引擎已经写入的 `story_ending`、`max_choices` 或 `max_history`；仅在旧数据没有结束原因时补为 `story_ending`，不得改写为玩家主动结束。

开始页的世界选择值必须使用 `source:type:filename` 组成的稳定身份，不能只使用文件名。内置世界与用户世界允许同名，二者必须都可被选择并向游戏引擎传入准确的 `WorldRef`。

### 17.3 数据安全

- 会话保存使用 `ON CONFLICT DO UPDATE`，不得用 `INSERT OR REPLACE` 重置 `created_at`。
- Store 必须统一跟踪所有会话持久化任务。恢复、全量导入或清理会话前，先取消并失效当前 LLM 请求，再等待已经进入存储层的会话写入结束；数据库变更执行期间禁止启动第二项数据操作，避免旧保存重新插入已经恢复或删除的会话。
- 数据库备份使用 SQLite 一致性快照；恢复前限制路径到备份目录并执行 `integrity_check`，再在事务内只恢复 `sessions` 会话表。备份中的 `config` 数据不得覆盖当前设置，当前 provider、模型、其他偏好与系统 keyring API Key 均保持不变。
- 恢复命令只有在会话事务未提交时才返回“数据库未替换”错误；事务提交后的附加库清理失败必须丢弃对应池连接，不能覆盖已经成功的恢复结果。
- 恢复后的会话列表、数据库信息和备份列表刷新必须使用会向上传播错误的严格读取。任一刷新失败时提示“恢复已完成，但界面刷新失败”，不得因界面层吞掉错误而显示完全成功；应用启动和普通设置页刷新仍可使用容错读取。
- Tauri 返回给前端的 `DatabaseInfo` 必须使用 `sessionCount`、`activeCount` 等 camelCase 字段，与 TypeScript 接口保持一致。
- 桌面端 JSON 导入/导出依赖 `tauri-plugin-dialog` 与 `tauri-plugin-fs`；启动器必须注册两者，Capability 仅开放 `open/save` 与所选文件的文本读写命令，不授予通配文件系统范围。
- 备份文件名必须包含不可碰撞标识；快照创建失败时清理未完成文件，连续或并发备份不得因秒级文件名重复而互相覆盖或失败。
- JSON 字段损坏必须显式返回“会话损坏”，不得静默清空历史。批量读取会话时逐条隔离损坏记录，保留并展示其他正常会话，同时向开始页返回损坏会话 ID 与数量；数据库或 IPC 整体失败仍按读取失败处理。
- 单个及批量世界文件读取/导出都必须 canonicalize 目标路径并验证其位于受管 `worlds` 目录内；目录内指向外部文件的符号链接不得被跟随。
- 用户世界的列表、读取、保存、删除、导入和导出统一使用 `AppDb.data_dir/worlds`，不得混用 Tauri bundle identifier 派生目录，否则 Windows/Linux 会与数据库和批量导出路径分叉。

### 17.4 云端 LLM 边界

- `LlmProviderAdapter` 负责 URL、鉴权与流式协议差异。
- 错误使用结构化代码：认证、限流、超时、网络、服务端、非法响应、取消。
- SSE 解析必须覆盖 CRLF、跨 chunk、多个 `data:` 行、空行事件边界、EOF 剩余事件、`[DONE]` 与空响应体。成功响应必须出现 `[DONE]` 或非空 `finish_reason`；收到任一完成标记后必须立即停止并取消后续流读取，完成标记之后的挂起、断流或超时不得把完整响应误判为截断。只收到部分内容后异常 EOF 视为 `invalid_response`，不得保存，也不得自动重试并重复拼接已经展示的 token。
- Store 为每个云端请求持有 `AbortController`，并将 `AbortSignal` 贯穿游戏引擎与 LLM 客户端；开始替代请求、新旅程或跳过传记时必须先中止旧请求，迟到响应 ID 仅作为第二层状态隔离。
- 传记 Prompt、完整/未完待续语义和世界观加载统一由 `GameEngine.generateBiography()` 负责；Store 只承担请求隔离、流式展示和成功后的持久化，不得保留第二套生成逻辑。
- 玩家主动结束可以先在内存中显示结束状态，但只有持久化成功后才能进入传记确认；保存失败且用户未离开该会话时必须回滚为可继续状态，允许重试。
- 问答请求的历史上下文只包含提交前的既有消息，当前问题仅通过独立问题字段发送一次；成功后按 `maxQaHistory` 裁剪持久化消息条目。
- 问答流与剧情正文流必须在 UI 状态中明确区分。问答生成期间正文继续显示当前场景，流式回答只出现在问答面板；不得因复用全局 `streamedText` 临时把正文替换成问答内容。全局请求互斥仍保持不变，问答期间选择按钮可以继续禁用。
- 摘要属于选择处理事务的一部分：必须等待完成或确定性降级后再保存会话。
- 场景返回空 `choices` 且 `auto_continue=true` 时，引擎必须在同一次选择事务内继续生成，直至出现选择、自然结束或达到 `maxAutoContinue` 后注入安全选项；不得保存一个仍活跃但无法操作的空选项场景。自动续接计数只属于当前请求，取消或失败后不得污染下一次请求。

### 17.5 发布门禁

Pull Request 必须通过 TypeScript 构建、Vitest、覆盖率、Rust fmt、Clippy 与 Rust tests。正式 Release 仅在 Windows x64、macOS Intel/Apple Silicon、Linux x64 全部成功且签名策略满足时创建。Release 调用可复用质量工作流时必须显式跳过其桌面构建，只由 Release 自己执行一次四目标矩阵；不得依据被调用工作流的 `github.event_name` 判断调用方式，因为该上下文继承调用方事件。tag push 与手动稳定发布使用同一套签名凭据判定。Apple 与 Windows 的凭据完整性必须独立计算：Apple 凭据齐全时 macOS 产物应签名并公证，即使 Windows 凭据不足导致整个 Release 仍为 draft/prerelease；Windows 凭据齐全时同理生成已签名 Windows 产物。只有请求稳定发布且两组凭据都完整时，Release 才可成为正式稳定版。Windows 签名必须同时配置证书、SHA-256 和证书颁发方提供的时间戳 URL。Apple 签名与公证环境变量只能注入已确认 Apple 凭据完整的 macOS 签名步骤；未签名 macOS 构建必须完全省略这些变量，不能用空字符串占位，否则 Tauri 会把空 identity 解释为签名请求并调用 `codesign --sign ""`。Release 标签/手动版本必须与 `package.json`、Tauri 配置和 Cargo 包版本一致，禁止用新标签发布旧版本安装包。手动工作流创建尚不存在的标签时必须将 `target_commitish` 固定为本次工作流的 `github.sha`；如果同名轻量或附注标签已经存在，必须在构建前解析其最终提交并验证与 `github.sha` 相同，不一致时终止发布，避免把当前提交的安装包挂到另一个提交的标签下。

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

角色姓名在校验与提交前统一去除首尾空白，最终长度必须为 2–20 个字符；纯空白输入不得启用开始按钮。

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

稳定版的 DeepSeek 与 OpenAI 适配器统一使用 **OpenAI Chat Completions API** 协议；Ollama、llama.cpp 和自定义兼容接口只在显式实验构建中注册：
- 端点: `{baseUrl}/v1/chat/completions`
- Base URL 为空时：仅明确选择 DeepSeek/OpenAI 的配置分别回退到 `https://api.deepseek.com` 与 `https://api.openai.com/v1`；Ollama、llama.cpp、应用内置 llama.cpp 和自定义提供商必须返回配置错误，不得隐式请求任一云端官方地址
- 请求体: `{ model, messages, temperature, max_tokens, stream: true }`
- 响应: SSE 流式格式 `data: {"choices":[{"delta":{"content":"..."}}]}`
- 终止标记: `data: [DONE]`

协议解析由统一适配边界复用。稳定构建强制提供商类型为 DeepSeek/OpenAI，但允许为这两个适配器配置自有代理或兼容网关。正式 Tauri 构建的云端请求统一由 Rust transport 发出，因此稳定版 WebView CSP 的 `connect-src` 仅保留 `'self'`；实验构建为前端本地提供商额外放行 HTTPS 与三个回环 HTTP 主机。自定义端点的可信度由用户负责，界面需提醒其会接收密钥与生成上下文。

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
| 网络依赖 | 需要互联网 | 模型与二进制下载完成后可离线运行（实验功能） |
| 速度 | 快（GPU 集群） | 取决于本地硬件 |
| 隐私 | 请求发送至第三方 | 推理文本留在本机；下载资产仍会访问外部托管服务 |
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
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'"
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
        "INSERT INTO sessions
         (session_id, world, game_mode, system, player_name, 
          player_history, player_attributes, player_inventory,
          player_summary, player_qa_history, scenarios_json,
          is_active, biography, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(session_id) DO UPDATE SET updated_at=datetime('now')"
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
    description: '云端服务，费用与额度以服务商当前规则为准',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    description: '付费，稳定可靠',
  },
  // Ollama、llama.cpp 与自定义接口仅在实验构建开关启用时追加。
];
```

---

## 十、本地化功能设计

> **本项目无自建业务后端**。会话、世界观和配置管理在本机完成；稳定版叙事生成会调用用户选择的 DeepSeek/OpenAI 云端 API。以下设计涵盖设置界面、世界观管理和本地数据管理。

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

稳定版管理表单只创建和编辑单文件用户世界。编辑时必须先按原始
`filename` 加载 Markdown 内容，名称字段只读，保存时覆盖同一个文件；任何加载失败都不得
打开空表单或覆盖原文件。目录式用户世界可以预览、导出和删除，但目录创建/重命名/在线编辑
留在实验功能，避免把目录误写成同名 `.md` 文件。

```
┌─────────────────────────────────────────────────┐
│  新建世界观                          [保存] [取消] │
├─────────────────────────────────────────────────┤
│  名称:   [我的新世界                        ]     │
│  类型:   [单文件]                                  │
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
│  Markdown 文本编辑器                               │
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
- **目录式世界**：桌面端按文件边界合并为可审阅的 Markdown 文本导出
- **批量导出**：勾选多个用户世界 → 导出保留文件名键的 JSON；目录条目包含合并后的文本

#### 10.2.6 删除世界

- 内置世界不可删除（UI 置灰删除按钮）
- 用户世界删除需二次确认
- 当前活跃会话仍依赖的用户世界不得删除；其他删除确认需明确提示相关历史会话将无法继续或重新生成传记
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

- **备份**：通过 SQLite `VACUUM INTO` 创建包含已提交 WAL 数据的一致性快照，文件名使用时间戳与 UUID 避免同秒覆盖
- **恢复**：只能从受管备份列表选择 → 二次确认 → 完整性及 SQLite schema v2/v3 校验 → 在事务中仅替换 `sessions`；v2 备份的传记生成元数据按空值迁移，不得覆盖正在使用的数据库文件，当前设置与 API Key 始终保留
- **触发方式**：稳定版当前提供手动备份；自动备份需在容量与失败策略明确后单独启用
- **备份保留**：最多保留 10 个，超出自动清理最旧

#### 10.3.2 会话管理

“清理已结束会话”和“清理全部会话”都属于不可逆操作，前端必须在调用删除命令前显示包含影响范围的二次确认。

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
  ├─ 尝试 LLM 摘要除最后 summaryKeepLatest 条以外的历史 + 已有 summary
  ├─ 成功 → 只保留最后 summaryKeepLatest 条详细记录
  └─ 失败 → 生成确定性压缩文本后保留同样的尾部历史（不丢弃已摘要事件）
```

`summaryKeepLatest` 必须小于 `summaryThreshold`；读取旧配置或导入异常配置时统一归一化为最多 `summaryThreshold - 1`，避免达到阈值却没有可摘要条目。

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
| `restore_database` | backup_path | String | 校验受管快照并事务替换 `sessions`，保留当前配置与 API Key | 高（需二次确认，失败回滚） |
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
| TypeScript 组件测试 | React DOM `act` + happy-dom | UI 组件渲染 |
| Rust 单元测试 | `cargo test` | Commands、数据库操作 |
| Web E2E 测试 | Playwright | 首次启动、示例旅程、设置与导出主流程 |
| Tauri 桌面冒烟 | 平台原生 CI + mock LLM | Keyring、SQLite、备份恢复与原生窗口启动 |
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
npm run dev          # Web 模式: http://localhost:8080
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
| Windows | NSIS `.exe` | 由 CI 产物验证 |
| macOS | `.app` + `.dmg` | 由 Intel / Apple Silicon CI 产物验证 |
| Linux | `.deb` + `.rpm` | 由 x64 CI 产物验证 |

### 16.4 Tauri 配置

```json
{
  "productName": "BiographyDesktop",
  "version": "0.1.1",
  "identifier": "com.biography.generator",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:8080",
    "frontendDist": "../dist"
  },
  "app": {
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
    "targets": ["app", "dmg", "nsis", "deb", "rpm"]
  }
}
```

---

## 十七、公开稳定产品化（Phase 11）

### 17.1 发布可靠性

- 错误状态使用 `AppError`，只有绑定了真实 `retryAction` 的错误才显示重试按钮。
- Rust 初始化失败不得 panic 退出；原生层把启动错误传给前端恢复页，允许查看诊断、打开数据目录或明确进入临时内存模式。
- 正式发布必须经过四目标构建、Windows 签名、macOS 签名与公证；缺少任一平台凭据时只能生成 draft/prerelease，但凭据完整的平台仍应生成可独立验收的签名产物。
- 手动 Release 不接受独立版本输入，必须从已提交的 `package.json` 自动推导 `v<version>`，并验证 Tauri/Cargo 清单一致；既有标签若指向其他提交必须在构建前失败，禁止工作流临时修改版本后发布不可复现产物。
- 应用内提供版本与更新入口。更新检查失败不阻塞启动，也不上传剧情、世界观或 API Key。
- 首版继续采用 BYOK，无账号、云同步、计费和业务后端。

### 17.2 架构边界

- `SessionRepository`、`SettingsRepository`、`WorldRepository` 和 `LlmGateway` 是业务层唯一允许依赖的基础设施接口；Web/Tauri 分别实现。
- Zustand 组合 `config/session/narrative/data/localModel` slices，对组件保持一个 `useGameStore` 入口。
- `AppSettings` 是 LLM 与游戏参数的唯一配置真值；API Key 独立从 Keyring/Web 开发存储加载，不进入通用 JSON 配置。
- 稳定构建仅注册 DeepSeek/OpenAI；实验 provider 通过独立模块和构建开关加载。
- 稳定前端 Store 必须使用不包含本地模型 IPC/事件字符串的运行时桩；实验构建才解析真实本地模型 slice，稳定产物检查必须扫描具体命令和下载事件，不能只依赖模块标记。
- Tauri 正式模式由 Rust 发起云端请求，Keyring 密钥不返回给 WebView；Web 开发模式保留浏览器 transport。

### 17.3 上下文与错误治理

- `ContextBudget` 在请求前估算世界观、系统设定、摘要、近期历史、问答与输出预留；不足时先摘要、再确定性裁剪，仍不足则返回 `context_overflow`。
- `AppError` 包含稳定错误码、用户文案、诊断 ID 和可选重试动作；日志与诊断包禁止包含 API Key，剧情正文默认脱敏。
- 系统模式开始游戏失败时，真实重试动作必须保留并复用角色、`WorldRef` 与已选系统方案；仅在成功开始或明确退出该流程后清理待启动参数。
- 请求指标只保存在本机，记录耗时、重试次数及粗略 token 用量，不承诺费用精确性。

### 17.4 产品体验

- 首次启动向导依次完成服务商选择、API Key、连接测试、隐私确认、示例世界选择。
- 无 API Key 用户可进入完全静态的示例旅程；示例不得写入真实会话或触发网络请求。
- 世界管理提供模板、Markdown 校验、预览、复制内置世界和导入诊断。
- 传记支持 TXT、Markdown 与 PDF 导出，并保存生成模型、时间和世界引用元数据。

### 17.5 验收门禁

- 保持现有 Session schema v2 与备份格式兼容。
- 前端、Rust、构建策略和发布元数据测试全部通过；关键 UI 流程行覆盖率目标 70%。
- 原生冒烟覆盖首次启动、Keyring、三次选择、重启恢复、备份恢复与传记导出。
- 签名、公证及干净系统安装/升级/卸载验证属于人工发布门禁，不得仅凭配置存在标记完成。

### 17.6 第七轮传输与密钥边界修复

- Rust LLM transport 禁止自动跟随 HTTP 重定向；任何 3xx 都作为 `invalid_response` 返回，避免 Authorization、Prompt 与剧情正文被重放到未经校验的目标。
- 请求取消覆盖 DNS、TLS、发送请求与等待响应头阶段；取消后立即丢弃网络 future，不等待全局超时。
- SSE 字节流使用增量 UTF-8 解码，跨 chunk 的多字节字符必须保留到完整后再解析；非法或 EOF 时仍不完整的 UTF-8 视为无效响应。
- 桌面 API Key 按作用域保存：DeepSeek/OpenAI 按 provider 隔离，实验 custom 再绑定规范化 Base URL；旧全局密钥只迁移到当前稳定 provider，不得迁移给 custom。
- 实验 Tauri 构建的 custom 请求经 Rust transport 发出；稳定 Rust 构建继续拒绝 custom，本地无密钥 provider 保持现有实验链路。
- `GameSession.biographyGeneration` 保存实际生成传记时的 provider、model 与 generatedAt；导出时间使用独立的 exportedAt，旧会话缺少元数据时才回退当前设置。
- `GameSession` 的 JSON schema 继续保持 v2；SQLite `PRAGMA user_version` 独立升级到 3，并通过可空 `biography_generation` JSON 列持久化上述元数据。数据库 v2 备份恢复时该列按空值处理，数据库 v3 完整往返，未来版本继续拒绝降级读取。

### 17.7 第八轮持久化与传输一致性修复

- 传记期望输出上限为 8192 token，但实际预留必须经过模型能力计算，至少为 Prompt 和安全边界保留 2048 token；不得因临时传记配置覆盖用户保存的上下文设置。
- Tauri 前端在动态加载 IPC 后再次检查取消状态；Rust transport 记录有界且会过期的预取消请求，使取消先于请求注册到达时仍不会发出网络请求。
- Rust 错误事件携带可选 HTTP 状态码和 `Retry-After` 毫秒值；429 同时支持 delta-seconds 与 HTTP-date，前端继续使用统一的结构化重试策略。
- 删除 API Key 必须绑定设置页当前草稿的 provider 与 Base URL 作用域，切换提供商后不得操作先前作用域。
- 复制内置世界必须由持久化边界生成唯一名称并使用无覆盖创建；默认依次使用 `name-copy.md`、`name-copy-2.md`，任何并发复制都不得覆盖用户内容。
- Base URL 的 HTTP 回环白名单按结构化主机判断，明确接受 `localhost`、`127.0.0.1` 与 IPv6 `::1`，其他 HTTP 主机继续拒绝。

### 17.8 第十轮 Web 密钥与诊断隐私修复

- Web 调试 transport 在请求边界按当前 provider 与规范化 Base URL 读取精确作用域密钥；显式草稿密钥优先，空草稿只允许读取当前作用域，不得回退到其他 provider 或 custom 地址。
- Tauri transport 继续由 Rust 从 Keyring 注入持久化密钥；上述 Web 解析不得把桌面密钥返回 WebView，也不得改变现有 IPC 载荷。
- 可分享诊断包只导出显式允许的日志字段和脱敏 context，不包含原始错误栈；Promise rejection 的自由文本 reason 视为敏感内容。原始日志只保留在本机，不自动上传。

### 17.9 第十一轮提交前收口边界

- Rust SSE 解析器必须增量处理行结束符。网络 chunk 以 `\r` 结尾时必须保留待定状态，直到下一 chunk 确认它是 CRLF 还是独立 CR；不得在单个 chunk 内全量替换换行符，从而把拆开的 CRLF 误判为事件空行。
- 启动失败后用户明确进入的临时模式只使用内存数据库。该模式不得展示磁盘数据库路径、大小或备份列表，也不得开放备份、恢复、全量导入、清理等会让用户误以为结果可跨重启保存的数据操作。
- CI 必须分别对默认配置与 `local-model` feature 执行 Rust Clippy 和 tests；稳定前端构建继续验证不含本地模型命令，实验前端构建必须实际编译，以覆盖 feature 对应的前端入口。
- 本轮冻结功能范围。完成上述修复、全量测试、稳定/实验构建、策略脚本和全工作区复审后，若不存在 P0/P1 问题即可提交；其他非阻塞改进登记到任务清单，不继续扩大本次改动。
