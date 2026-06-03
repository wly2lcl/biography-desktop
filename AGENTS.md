# AGENTS.md

## 项目概览

Tauri 2 桌面应用（React + TS + Rust + SQLite），LLM 驱动互动传记叙事。
从 Python Web 版迁移而来，纯本地运行，无后端。

## 开发原则

**代码修改前，先修改对应文档**（DESIGN.md / DEV_GUIDE.md / TASKS.md / STATUS.md / 本文件），保持代码与文档一致。

## 关键命令

```bash
npm test          # vitest, happy-dom 环境, @ 别名
npx tsc --noEmit  # 严格模式: noUnusedLocals, noUnusedParameters, noImplicitReturns
npm run dev       # Vite Web 模式 (localhost:8080, 0.0.0.0)
npm run tauri dev # 原生窗口 + DevTools
npm run build     # tsc && vite build (tauri build 的前置步骤)
```

## 架构要点

### 双层存储（自动检测）
- `src/services/storage.ts` 通过 `window.__TAURI__` 检测运行环境
- Tauri 环境 → SQLite (IPC calls to Rust commands)
- Web 环境 → localStorage (浏览器调试用)
- Web 模式下 **SQLite 功能不可用**，所有持久化走 localStorage

### 屏幕路由
- `src/App.tsx` 通过 Zustand `currentScreen` 切换: `'start' | 'system' | 'game' | 'biography'`
- Settings 和 WorldManager 是覆盖层模态框，不走 screen 路由

### 核心数据流
```
用户选择 → gameStore.makeChoice() → engine.processChoice() → LLM → 新场景 → gameStore 更新 → UI 渲染
```

- `src/game/engine.ts` — 游戏状态机（场景生成、选择处理、摘要压缩、自动续接）
- `src/store/gameStore.ts` — 唯一 Zustand store，所有状态和动作的集中入口
- `src/services/prompts.ts` — 6 个 LLM prompt 模板，与 Python 版保持一致

### 传记生成（Phase 7 改进）
- `EndReason` 类型区分 4 种结束原因: `player_ended | story_ending | max_choices | max_history`
- 玩家主动结束触发**两步确认弹窗**: 确认结束 → 确认是否生成传记
- `isComplete` 逻辑: 仅 `player_ended` 为 false（生成"未完待续"传记），其余为 true
- 向后兼容: 无 `endReason` 的旧会话默认 `isComplete = true`

### Rust 侧
- `src-tauri/src/main.rs` — 26 个 Tauri commands 注册
- 数据库: `~/.local/share/biography-desktop/biography.db` (Linux) / `AppData/Roaming` (Win) / `Library/Application Support` (macOS)
- `sqlx` 使用 `runtime-tokio`，SQLite 通过 `SqlitePool` 管理

### 世界观加载
- 内置世界: `public/worlds/` (打包进应用)
- 用户世界: 应用数据目录下的 `worlds/` 文件夹
- 缓存: 5 分钟 TTL + LRU 淘汰，最大 20 条
- 50K 字符截断，按 markdown heading 边界智能截断

## 测试

```bash
npm test              # 运行全部测试
npx vitest run src/services/prompts.test.ts  # 运行单个测试文件
```

- 环境: happy-dom, globals: true
- 匹配: `src/**/*.test.ts`, `src/**/*.test.tsx`
- 测试覆盖率: 98 项通过 (81 原有 + 17 Phase 7)

## CI/CD

- `.github/workflows/ci.yml` — push/PR 到 master 时触发 Windows/macOS/Linux 构建
- `.github/workflows/release.yml` — push tag `v*` 或手动触发正式 release
- CI 不运行测试（仅构建验证）

## TS 严格模式注意事项

- `noUnusedLocals: true` — 导入但未使用的类型会报错
- `noUnusedParameters: true` — 未使用的函数参数会报错
- `noImplicitReturns: true` — 函数必须所有路径都有返回值
- 类型修改后记得检查是否有未使用的 import（如 `EndReason` 仅用于赋值不需导入）

## i18n

- `src/i18n/locales/zh-CN.json` — 唯一语言文件
- `.gitignore` 排除所有 locale JSON 但保留 zh-CN

## GitHub 凭据

- Token 存储在 `.github/GH_TOKEN`（已加入 .gitignore）
- 推送: `git push "https://$(cat .github/GH_TOKEN)@github.com/wly2lcl/biography-desktop.git" master`
