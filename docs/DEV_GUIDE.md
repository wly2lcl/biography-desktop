# Biography Desktop - 开发指南

> 从零开始构建 Tauri + TypeScript 桌面应用的完整步骤

---

## 一、环境准备

### 1.1 系统依赖

**所有平台：**
- Node.js ≥ 18
- Rust ≥ 1.75（通过 rustup 安装）

**Windows 额外需要：**
- Visual Studio Build Tools 2022（C++ 构建工具）
- WebView2（Windows 10/11 已内置）

**macOS 额外需要：**
- Xcode Command Line Tools
- `xcode-select --install`

**Linux (Debian/Ubuntu) 额外需要：**
```bash
sudo apt install -y \
  build-essential curl wget file \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

### 1.2 安装 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
rustup default stable
```

### 1.3 验证环境

```bash
node -v          # ≥ v18
npm -v           # ≥ 9
rustc --version  # ≥ 1.75
cargo --version  # ≥ 1.75
```

---

## 二、项目初始化

### 2.1 创建项目

```bash
cd /root/work
npm create tauri-app@latest biography-desktop
# 选择:
#   Template: React + TypeScript
#   Package manager: npm
cd biography-desktop
npm install
```

### 2.2 安装额外依赖

```bash
# 前端
npm install zustand dompurify @types/dompurify marked
npm install -D tailwindcss postcss autoprefixer @tailwindcss/typography

# 初始化 Tailwind
npx tailwindcss init -p
```

### 2.3 配置 Tailwind

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [typography],
} satisfies Config;
```

### 2.4 配置 Tauri

编辑 `src-tauri/tauri.conf.json`：

```json
{
  "productName": "传记生成器",
  "version": "0.1.0",
  "identifier": "com.biography.generator",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:1420",
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
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.deepseek.com https://api.openai.com http://localhost:*"
    }
  },
  "bundle": {
    "active": true,
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"],
    "targets": ["app", "dmg", "msi", "deb", "appimage"]
  }
}
```

---

## 三、开发顺序

### Phase 1: 基础架构（第 1-2 天）

```
□ 1.1 初始化 Tauri 项目 + 安装依赖
□ 1.2 配置 TypeScript 类型系统
□ 1.3 实现 LLM 客户端（统一流式 streamChat + streamChatText）
□ 1.4 实现 Prompt 模板管理
□ 1.5 实现 SSE 解析器
□ 1.6 实现 JSON 解析容错
□ 1.7 实现重试机制（指数退避）
```

### Phase 2: 游戏引擎（第 3-4 天）

```
□ 2.1 实现 Zustand 状态管理
□ 2.2 实现游戏状态机（start → game → biography）
□ 2.3 实现世界观加载
□ 2.4 实现选择处理逻辑
□ 2.5 实现自动续接逻辑
□ 2.6 实现历史摘要压缩
```

### Phase 3: UI 界面（第 5-6 天）

```
□ 3.1 StartScreen - 开始界面（+ 管理世界入口）
□ 3.2 SystemScreen - 系统选择界面
□ 3.3 GameScreen - 游戏主界面
□ 3.4 BiographyScreen - 传记界面
□ 3.5 SettingsScreen - 设置面板（LLM/高级/数据/关于 Tab）
□ 3.6 WorldManagerScreen - 世界观管理（列表/新建/编辑/导入/导出）
□ 3.7 LoadingOverlay - 加载遮罩
□ 3.8 ErrorModal - 错误弹窗
□ 3.9 ConfirmModal - 确认弹窗
□ 3.10 QAPanel - Q&A 面板
```

### Phase 4: 持久化（第 7 天）

```
□ 4.1 实现 Web Storage（localStorage）
□ 4.2 实现 Tauri SQLite 存储
□ 4.3 实现存储层环境切换
□ 4.4 实现断点续传
□ 4.5 实现 API Key 安全存储
```

### Phase 5: 数据与配置（第 8-9 天）

```
□ 5.1 打包世界观文件到 public/
□ 5.2 实现世界观解析（内置 + 用户目录）
□ 5.3 实现设置界面（LLM 设置 + 高级参数 + 数据管理 + 关于）
□ 5.4 实现世界观管理界面（列表/新建/编辑/导入/导出/删除）
□ 5.5 实现本地数据管理（备份/恢复/会话管理/全量导入导出）
□ 5.6 实现 Rust world commands（save/delete/export/import）
□ 5.7 实现 Rust data commands（backup/restore/clear/export/import）
```

### Phase 6: 测试与打包（第 10-11 天）

```
□ 6.1 单元测试（parser, sse, prompts）
□ 6.2 集成测试（完整游戏流程）
□ 6.3 设置界面测试（API Key 验证 + 测试连接）
□ 6.4 世界观管理测试（导入/导出/编辑/删除）
□ 6.5 数据备份/恢复测试
□ 6.6 Windows 打包测试
□ 6.7 macOS 打包测试
□ 6.8 Linux 打包测试
```

---

## 四、关键实现细节

### 4.1 流式场景生成（TypeScript）

这是最复杂的部分，需要处理：
1. 流式输出描述文本
2. 从累积文本中检测 JSON 字段
3. 解析完成的 JSON 并提取 `choices` 和 `ending`

```typescript
// src/services/llm.ts - 流式场景生成

export interface ScenarioResult {
  title: string;
  description: string;
  choices: Choice[];
  autoContinue: boolean;
  ending?: { type: string; description: string };
}

export async function* streamScenario(
  prompt: string,
  config: LLMConfig
): AsyncGenerator<string> {
  // 直接流式输出所有 token
  // 最后解析完整文本获取 JSON
  const fullText: string[] = [];
  
  for await (const token of streamChat(
    [{ role: 'user', content: prompt }],
    config
  )) {
    fullText.push(token);
    yield token;  // 逐字输出
  }
  
  // 最后解析 JSON（通过 throw 或返回值传递）
  // 实际使用时，调用方需要单独处理最终结果
}
```

### 4.2 游戏引擎核心循环

```typescript
// src/game/engine.ts

import { useGameStore } from '../store/gameStore';
import { streamChat, streamChatText } from '../services/llm';
import { parseLLMJSON } from '../services/parser';
import { prompts } from '../services/prompts';

const MAX_CHOICES = 30;
const MAX_AUTO_CONTINUE = 5;

export class GameEngine {
  private autoCount = 0;

  async processChoice(
    sessionId: string,
    choiceId: string
  ): Promise<void> {
    const store = useGameStore.getState();
    const session = store.session!;
    const current = session.scenarios[session.scenarios.length - 1];

    // 1. 记录选择
    this.recordChoice(session, current, choiceId);

    // 2. 检查结束
    if (choiceId === 'end') {
      session.isActive = false;
      await this.saveSession(session);
      return;
    }

    // 3. 生成下一个场景
    const nextData = await this.resolveNextScenario(session, current);

    // 4. 处理结果
    this.applyNextScenario(session, nextData);
    await this.saveSession(session);
  }

  private async resolveNextScenario(
    session: GameSession,
    current: Scenario
  ): Promise<any> {
    // 检查最大选择数
    if (session.player.history.length >= MAX_CHOICES) {
      session.isActive = false;
      return this.endingScenario('legend');
    }

    // 检查自动续接限制
    if (this.autoCount >= MAX_AUTO_CONTINUE) {
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

    // 调用 LLM
    try {
      const config = useGameStore.getState().config!;
      const prompt = prompts.scenarioPrompt().format({
        worldContext: await this.loadWorld(session.world),
        systemContext: this.loadSystemContext(session),
        playerName: session.player.name,
        summary: this.formatSummary(session),
        latestScene: this.formatLatestScene(session),
        previousChoice: this.getPreviousChoice(session),
      });

      // 流式生成（UI 显示）
      let fullText = '';
      for await (const token of streamChat(
        [{ role: 'user', content: prompt }],
        config
      )) {
        fullText += token;
        useGameStore.getState().appendStreamedText(token);
      }

      // 解析 JSON
      return parseLLMJSON(fullText);
    } catch (error) {
      console.error('LLM failed:', error);
      return this.fallbackScenario(current);
    }
  }

  private applyNextScenario(session: GameSession, data: any): void {
    const nextScenario: Scenario = {
      id: crypto.randomUUID(),
      title: data.title || '新的篇章',
      description: data.description || '',
      choices: (data.choices || []).map((c: any) => ({
        id: c.id,
        text: c.text,
        description: c.description,
      })),
    };

    // 处理 ending
    if (data.ending?.type) {
      session.isActive = false;
      this.ensureEndChoice(nextScenario, data.ending);
    }

    // 自动续接
    if (!data.choices?.length && !data.ending) {
      this.autoCount++;
      if (this.autoCount >= MAX_AUTO_CONTINUE) {
        // 强制给出选择（已在 resolveNextScenario 处理）
        return;
      }
      // 自动记录并继续
      session.player.history.push({
        scenario: nextScenario.title,
        scenarioDescription: nextScenario.description,
        choice: '(故事继续)',
        choiceId: '__auto_continue__',
      });
      // 递归处理
      this.resolveNextScenario(session, nextScenario);
      return;
    }

    this.autoCount = 0;
    session.scenarios = [nextScenario];
    session.player.currentScenario = nextScenario.id;

    // 可能触发摘要
    this.maybeSummarize(session);
  }
}
```

### 4.3 Zustand 状态管理完整实现

```typescript
// src/store/gameStore.ts

import { create } from 'zustand';
import type { GameSession, Scenario, SystemProposal, AppConfig } from '../types/models';
import { GameEngine } from '../game/engine';
import { createStorage } from '../services/storage';

type Screen = 'start' | 'system' | 'game' | 'biography';

interface GameState {
  // 屏幕
  currentScreen: Screen;
  
  // 数据
  session: GameSession | null;
  currentScenario: Scenario | null;
  systemProposals: SystemProposal[];
  selectedSystem: SystemProposal | null;
  config: AppConfig | null;
  
  // 流式
  isStreaming: boolean;
  streamedText: string;
  
  // UI
  isLoading: boolean;
  loadingText: string;
  error: string | null;
  showConfirmEnd: boolean;
  
  // 引擎
  engine: GameEngine;
  storage: ReturnType<typeof createStorage>;
  
  // 动作
  setScreen: (screen: Screen) => void;
  setConfig: (config: AppConfig) => Promise<void>;
  loadWorlds: () => Promise<void>;
  startBasicGame: (name: string, world: string) => Promise<void>;
  generateSystemProposals: (name: string, world: string) => Promise<void>;
  selectSystem: (proposal: SystemProposal) => void;
  startSystemGame: () => Promise<void>;
  makeChoice: (choiceId: string) => Promise<void>;
  generateBiography: () => Promise<void>;
  endGame: () => void;
  newGame: () => void;
  setError: (error: string | null) => void;
  appendStreamedText: (text: string) => void;
  checkResume: () => Promise<void>;
  resumeGame: (sessionId: string) => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
  currentScreen: 'start',
  session: null,
  currentScenario: null,
  systemProposals: [],
  selectedSystem: null,
  config: null,
  isStreaming: false,
  streamedText: '',
  isLoading: false,
  loadingText: '',
  error: null,
  showConfirmEnd: false,
  engine: new GameEngine(),
  storage: createStorage(),

  setScreen: (screen) => set({ currentScreen: screen }),
  
  setConfig: async (config) => {
    await get().storage.setConfig('app', JSON.stringify(config));
    set({ config });
  },

  loadWorlds: async () => {
    // 从打包的世界观文件加载
    // 详见 world.ts 实现
  },

  startBasicGame: async (name, world) => {
    set({ isLoading: true, loadingText: '正在构建世界...', streamedText: '' });
    try {
      const config = get().config!;
      const engine = get().engine;
      const storage = get().storage;
      
      const session = await engine.startGame(name, world, 'basic', null, config);
      await storage.saveSession(session);
      
      set({
        session,
        currentScenario: session.scenarios[0],
        currentScreen: 'game',
        isLoading: false,
      });
    } catch (err) {
      set({ 
        error: err instanceof Error ? err.message : '开始游戏失败',
        isLoading: false,
      });
    }
  },

  // ... 其他动作实现
}));
```

---

## 五、Rust 侧实现

### 5.1 依赖（Cargo.toml）

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.7", features = ["runtime-tokio", "sqlite", "macros"] }
tokio = { version = "1", features = ["full"] }
keyring = "2"
```

### 5.2 数据库初始化

```rust
// src-tauri/src/db/mod.rs

use sqlx::SqlitePool;

pub async fn init_db(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sessions (
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
        )"
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )"
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC)")
        .execute(pool)
        .await?;

    Ok(())
}
```

### 5.3 Tauri Commands 注册

```rust
// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use sqlx::SqlitePool;
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    // 获取应用数据目录
    let data_dir = tauri::Manager::path(&app).app_data_dir().unwrap();
    std::fs::create_dir_all(&data_dir).unwrap();
    
    let db_path = data_dir.join("biography.db");
    let pool = SqlitePool::connect(db_path.to_str().unwrap()).await.unwrap();
    
    db::init_db(&pool).await.unwrap();

    tauri::Builder::default()
        .manage(pool)
        .invoke_handler(tauri::generate_handler![
            commands::db::save_session,
            commands::db::get_session,
            commands::db::list_sessions,
            commands::db::delete_session,
            commands::config::get_config,
            commands::config::set_config,
            commands::world::load_world,
            commands::world::list_worlds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri");
}
```

---

## 六、调试技巧

### 6.1 前端调试

```bash
npm run tauri dev
# 打开 DevTools: Ctrl+Shift+I (Windows/Linux) 或 Cmd+Option+I (macOS)
```

- **Console**: `console.log()` 直接输出
- **Network**: fetch 请求可见（LLM API 调用）
- **Sources**: TypeScript 断点（有 sourcemap）
- **Application**: 查看 localStorage

### 6.2 Rust 调试

```bash
# Rust 侧日志输出到终端
RUST_LOG=debug npm run tauri dev
```

```rust
// 在 Rust 代码中
use log::{info, warn, error};

info!("Saving session: {}", session_id);
warn!("Database error: {}", e);
```

### 6.3 生产版调试

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "withDebug": true  // 生产版也带 DevTools
  }
}
```

---

## 七、常见问题

### Q1: Rust 编译太慢？

```bash
# 使用 mold 链接器（Linux）
sudo apt install mold
export RUSTFLAGS="-C link-arg=-fuse-ld=mold"

# 增加并行编译
export CARGO_BUILD_JOBS=$(nproc)
```

### Q2: Tauri 开发模式下前端热更新不生效？

确保 `vite.config.ts` 中 `server.port` 与 `tauri.conf.json` 中 `devUrl` 一致（默认 1420）。

### Q3: Windows 打包失败？

安装 Visual Studio Build Tools 2022，确保勾选了 "C++ build tools"。

### Q4: macOS 打包后 Gatekeeper 拦截？

需要代码签名和公证：
```bash
# 需要 Apple Developer 证书
npm run tauri build -- -- --target universal-apple-darwin
```

### Q5: 如何从 Python 版迁移世界观文件？

```bash
# 1. 复制世界观文件
cp -r /root/work/biography-generator/worlds/* /root/work/biography-desktop/public/worlds/

# 2. 复制系统方案模板（参考用）
cp -r /root/work/biography-generator/systems/* /root/work/biography-desktop/public/systems/

# 3. 验证文件完整性
ls public/worlds/
```

### Q6: 如何处理旧的 SQLite 数据库？

如果用户从 Python 版迁移，数据库表结构兼容（相同的列名和类型）。只需将旧的 `.db` 文件复制到 Tauri 应用数据目录：

```bash
# macOS
cp ~/Library/Application\ Support/biography-generator/biography_generator.db \
   ~/Library/Application\ Support/com.biography.generator/biography.db
```

---

## 八、性能基准要求

| 指标 | 目标值 | 测试方法 |
|------|--------|---------|
| **首字节延迟 (TTFB)** | < 3s | 从用户点击到第一个 token 显示 |
| **流式更新延迟** | < 100ms/token | Token 到达后 UI 更新时间 |
| **内存占用（空闲）** | < 100MB | 任务管理器监控 |
| **内存占用（游戏）** | < 200MB | 含 30 条历史记录 |
| **应用启动时间** | < 2s | 双击到窗口显示 |
| **SQLite 查询延迟** | < 10ms | 会话加载时间 |
| **打包大小** | < 15MB | 安装包大小 |
| **世界观加载** | < 500ms | 50K 字符 Markdown 解析 |

**性能优化措施**：
- 流式输出使用 `requestAnimationFrame` 批量更新（避免逐 token 重渲染）
- 世界观文件打包后通过 `fetch()` 直接读取，无需文件系统开销
- SQLite 使用 WAL 模式提高并发读写性能
- 历史记录超过 20 条时使用虚拟滚动

---

## 九、代码规范

### TypeScript

```json
// tsconfig.json 关键配置
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### Rust

```toml
# Cargo.toml
[lints.clippy]
pedantic = "warn"
```

运行检查：
```bash
npm run lint           # ESLint + TypeScript
cargo clippy           # Rust lint
cargo fmt              # Rust format
```
