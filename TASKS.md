# Biography Desktop - 任务清单

> 最后更新: 2026-06-02

---

## 任务图例

- 🔲 待开始
- 🔨 进行中
- ✅ 已完成
- ⏸️ 已暂停
- ❌ 已取消

---

## Phase 1: 基础架构（预估 2 天）

### 1.1 项目初始化

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T001 | 创建 Tauri 项目（React + TypeScript） | P0 | ✅ | 30min | - | `npm create tauri-app@latest` |
| T002 | 安装前端依赖（zustand, dompurify, tailwindcss） | P0 | ✅ | 15min | - | |
| T003 | 配置 Rust 依赖（sqlx, serde_json, keyring） | P0 | ✅ | 30min | - | Cargo.toml |
| T004 | 配置 Tailwind CSS | P1 | ✅ | 20min | - | tailwind.config.ts |
| T005 | 配置 TypeScript 严格模式 | P1 | ✅ | 15min | - | tsconfig.json |
| T006 | 验证开发环境（npm run dev + npm run tauri dev） | P0 | ✅ | 30min | - | 确保双模式可运行 |

### 1.2 类型系统

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T010 | 定义 Choice 类型 | P0 | ✅ | 5min | - | src/types/models.ts |
| T011 | 定义 Scenario 类型 | P0 | ✅ | 5min | - | |
| T012 | 定义 PlayerState 类型 | P0 | ✅ | 10min | - | |
| T013 | 定义 GameSession 类型 | P0 | ✅ | 10min | - | |
| T014 | 定义 SystemProposal 类型 | P0 | ✅ | 5min | - | |
| T015 | 定义 WorldInfo 类型 | P0 | ✅ | 5min | - | |
| T016 | 定义 AppConfig 类型 | P0 | ✅ | 5min | - | |
| T017 | 定义 LLMConfig + LLMMessage 类型 | P0 | ✅ | 10min | - | src/services/llm.ts |
| T018 | 定义 SessionSummary 类型 | P0 | ✅ | 5min | - | 用于 `/sessions` 列表 |
| T019 | 定义 ChoiceResponse 类型 | P0 | ✅ | 5min | - | 选择响应（scenario + history） |

### 1.3 LLM 客户端

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T020 | 实现 `streamChat()` - 流式调用 | P0 | ✅ | 2h | - | AsyncGenerator |
| T020b | 实现 LLM 重试机制（指数退避） | P0 | ✅ | 1h | - | 替代 tenacity |
| T021 | 实现超时控制（AbortController） | P1 | ✅ | 30min | - | 已在 streamChat 内部实现 |
| T022 | ~~实现超时控制（AbortController）~~ | P1 | ❌ | - | - | 与 T021 重复 |
| T023 | 实现错误处理（HTTP 状态码映射） | P1 | ✅ | 1h | - | |
| T024 | ~~实现重试逻辑（指数退避）~~ | P2 | ❌ | - | - | 与 T020b 重复，已移除 |

### 1.4 Prompt 模板系统

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T030 | 移植 introduction_prompt | P0 | ✅ | 30min | - | 从 Python prompts.py |
| T031 | 移植 scenario_prompt | P0 | ✅ | 30min | - | |
| T032 | 移植 biography_prompt | P0 | ✅ | 30min | - | |
| T033 | 移植 qa_prompt | P0 | ✅ | 30min | - | |
| T034 | 移植 system_generation_prompt | P0 | ✅ | 30min | - | |
| T035 | 移植 summarization_prompt | P0 | ✅ | 30min | - | |
| T036 | 实现 `formatHistory()` | P0 | ✅ | 1h | - | |
| T037 | 实现 `formatLatestScene()` | P0 | ✅ | 30min | - | |
| T038 | 实现 `formatSummaryOnly()` | P0 | ✅ | 30min | - | |
| T039 | 实现 `formatQaHistory()` | P1 | ✅ | 30min | - | |
| T040 | 实现 `cleanLLMOutput()` | P0 | ✅ | 30min | - | 清理 thinking 标签 |
| T041 | 实现文件系统 Prompt 覆盖 | P2 | 🔲 | 1h | - | 可选功能 |

### 1.5 SSE 解析器

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T045 | 实现 `parseSSE()` AsyncGenerator | P0 | ✅ | 1h | - | src/utils/sse.ts |
| T046 | 实现 `escapeForSSE()` | P0 | ✅ | 15min | - | |
| T047 | 实现 `unescapeSSE()` | P0 | ✅ | 15min | - | |
| T048 | 实现 `parseLLMJSON()` 容错解析 | P0 | ✅ | 1h | - | 处理 thinking/markdown |
| T049 | 实现 `withRetry()` 通用重试函数 | P0 | ✅ | 1h | - | 指数退避 + jitter |
| T049b | 实现 `apiCall()` 前端重试 | P0 | ✅ | 30min | - | 2 次重试 + 4xx 不重试 |
| T049c | 实现 `loadSystemContext()` 工具函数 | P0 | ✅ | 15min | - | 根据 gameMode 返回系统上下文文本 |
| T049d | ~~实现 `loadSystemContext()` 工具函数~~ | P0 | ❌ | - | - | 与 T049c 重复 |
| T049e | ~~实现 `loadSystemContext()` 工具函数~~ | P0 | ❌ | - | - | 与 T049c 重复 |

### 1.6 单元测试

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T050 | SSE 解析器单元测试 | P1 | 🔲 | 1h | - | vitest |
| T051 | JSON 解析容错测试 | P1 | 🔲 | 1h | - | 各种 malformed 输入 |
| T052 | Prompt 格式化测试 | P1 | 🔲 | 1h | - | |
| T053 | 实现流式文本纯文本渲染组件 | P0 | ✅ | 1h | - | whitespace-pre-wrap + 打字光标 + 完成后 Markdown |

---

## Phase 2: 游戏引擎（预估 2 天）

### 2.1 状态管理

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T060 | 创建 Zustand store 骨架 | P0 | ✅ | 1h | - | src/store/gameStore.ts |
| T061 | 定义 Screen 类型和初始状态 | P0 | ✅ | 30min | - | |
| T062 | 实现 `setScreen` 动作 | P0 | ✅ | 15min | - | |
| T063 | 实现 `setError` 动作 | P0 | ✅ | 15min | - | |
| T064 | 实现 `appendStreamedText` 动作 | P0 | ✅ | 15min | - | |

### 2.2 游戏引擎核心

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T070 | 实现 GameEngine 类骨架 | P0 | ✅ | 1h | - | src/game/engine.ts |
| T071 | 实现 `startGame()` 基础模式 | P0 | ✅ | 2h | - | 流式 + 创建会话 |
| T072 | 实现 `startGame()` 系统模式 | P0 | ✅ | 1h | - | |
| T073 | 实现 `processChoice()` | P0 | ✅ | 2h | - | 核心循环 |
| T074 | 实现 `recordChoice()` | P0 | ✅ | 30min | - | |
| T075 | 实现 `resolveNextScenario()` | P0 | ✅ | 2h | - | LLM 调用 + 容错 |
| T075a | 实现流式场景 JSON 提取策略 | P0 | ✅ | 2h | - | 累积 + 后解析 |
| T075b | 实现 LLM JSON 解析失败 fallback | P0 | ✅ | 1h | - | 返回硬编码 3 选项场景 |
| T076 | 实现自动续接逻辑 | P0 | ✅ | 1h | - | max_auto_continue |
| T077 | 实现 `_ensureEndChoice()` | P0 | ✅ | 30min | - | 保证 ending 有 end 选项 |
| T078 | 实现 `_endingScenario()` | P0 | ✅ | 30min | - | 最大选择数结束 |
| T079 | 实现 `maybeSummarize()` 正常路径 | P1 | ✅ | 1h | - | history ≥ 15 触发摘要，**存在空 LLMConfig 问题** |
| T079b | 实现 `maybeSummarize()` 硬上限路径 | P1 | ✅ | 1h | - | history > 45 强制截断 + 降级 |
| T080 | 实现 `saveSession()` | P0 | ✅ | 30min | - | 调用存储层 |

### 2.3 系统方案生成

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T085 | 实现 `generateSystemProposals()` | P0 | ✅ | 2h | - | 流式 + 解析 |
| T086 | 实现 Proposal → Card 转换 | P1 | ✅ | 1h | - | |

### 2.4 传记生成

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T090 | 实现 `generateBiography()` 流式 | P0 | ✅ | 2h | - | |
| T091 | 实现传记文本格式化 | P1 | ✅ | 1h | - | markdown → HTML |
| T092 | 实现传记下载功能 | P1 | ✅ | 30min | - | Blob + download |

### 2.5 Q&A 系统

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T095 | 实现 `answerQuery()` 流式 | P1 | ✅ | 1h | - | 流式调用 + 等待完成后一次性返回 |
| T096 | 实现 Q&A 历史管理 | P1 | ✅ | 30min | - | max 20 entries |

---

## Phase 3: UI 界面（预估 2 天）

### 3.1 通用组件

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T100 | LoadingOverlay 组件 | P0 | ✅ | 1h | - | 含计时器 |
| T101 | ErrorModal 组件 | P0 | ✅ | 1h | - | 可含重试按钮 |
| T102 | ConfirmModal 组件 | P0 | ✅ | 1h | - | 确认对话框 |
| T103 | 定义 Tailwind 主题色 | P1 | ✅ | 30min | - | |
| T104 | 实现 CSS 样式迁移 | P1 | ✅ | 2h | - | static/css/style.css → Tailwind/全局样式 |

### 3.2 StartScreen

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T110 | 实现表单布局 | P0 | ✅ | 1h | - | 姓名 + 世界 + 模式 |
| T111 | 实现表单验证 | P0 | ✅ | 30min | - | 姓名 ≥ 2 字符 |
| T112 | 实现世界下拉选择 | P0 | ✅ | 1h | - | 动态加载 |
| T113 | 实现游戏模式下拉 | P0 | ✅ | 30min | - | basic / system |
| T114 | 实现断点续传卡片 | P1 | ✅ | 1h | - | 检测 localStorage |
| T115 | 实现 resumeGame 逻辑 | P1 | ✅ | 1h | - | 恢复会话 |

### 3.3 SystemScreen

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T120 | 实现卡片列表布局 | P0 | ✅ | 1h | - | 3 个系统方案 |
| T121 | 实现卡片选中效果 | P0 | ✅ | 30min | - | |
| T122 | 实现流式预览（生成中） | P0 | ✅ | 2h | - | 最后 200 字符 |
| T123 | 实现返回按钮 | P0 | ✅ | 15min | - | |
| T124 | 实现确认按钮（禁用逻辑） | P0 | ✅ | 30min | - | |

### 3.4 GameScreen

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T130 | 实现场景描述区域 | P0 | ✅ | 1h | - | 流式文本 |
| T131 | 实现选项按钮组 | P0 | ✅ | 1h | - | 点击处理 |
| T132 | 实现选项点击反馈 | P0 | ✅ | 1h | - | 高亮 + 禁用 |
| T133 | 实现历史面板 | P0 | ✅ | 1h | - | 侧边栏 |
| T134 | 实现结束旅程按钮 | P0 | ✅ | 30min | - | 触发确认弹窗 |
| T135 | 实现 Q&A 面板 | P1 | ✅ | 2h | - | 折叠/展开 |
| T136 | 实现 Q&A 消息列表 | P1 | ✅ | 1h | - | |
| T137 | 实现 Q&A 输入框 | P1 | ✅ | 30min | - | |

### 3.5 BiographyScreen

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T140 | 实现传记展示区域 | P0 | ✅ | 1h | - | DOMPurify 过滤 |
| T141 | 实现流式更新 | P0 | ✅ | 1h | - | 逐字更新 |
| T142 | 实现下载按钮 | P1 | ✅ | 30min | - | .txt 文件 |
| T143 | 实现新旅程按钮 | P0 | ✅ | 30min | - | 重置状态 |

---

## Phase 4: 持久化（预估 1 天）

### 4.1 存储层抽象

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T150 | 定义 StorageProvider 接口 | P0 | ✅ | 30min | - | src/services/storage.ts |
| T151 | 实现 WebStorage（localStorage） | P0 | ✅ | 2h | - | |
| T152 | 实现 TauriStorage（IPC 调用） | P0 | ✅ | 1h | - | |
| T153 | 实现环境自动切换 | P0 | ✅ | 30min | - | `isTauri()` 检测 |

### 4.2 Rust SQLite 实现

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T160 | 实现数据库初始化 | P0 | ✅ | 1h | - | CREATE TABLE |
| T161 | 实现 `save_session` command | P0 | ✅ | 2h | - | INSERT OR REPLACE |
| T162 | 实现 `get_session` command | P0 | ✅ | 1h | - | SELECT |
| T163 | 实现 `list_sessions` command | P1 | ✅ | 1h | - | 列表查询 |
| T164 | 实现 `delete_session` command | P1 | ✅ | 30min | - | DELETE |

### 4.3 配置存储

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T170 | 实现 `get_config` / `set_config` | P0 | ✅ | 1h | - | |
| T171 | 实现 API Key 安全存储 | P1 | ✅ | 1h | - | Tauri: keyring / Web: localStorage |
| T172 | 实现配置加载（启动时） | P0 | ✅ | 30min | - | |

---

## Phase 5: 数据与配置（预估 1 天）

### 5.1 世界观数据

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T180 | 迁移 wuxia_jianghu.md | P0 | ✅ | 30min | - | public/worlds/ |
| T181 | 迁移 world/ 目录 | P1 | ⏸️ | 1h | - | 可选，暂未迁移 |
| T182 | 实现世界观加载逻辑 | P0 | ✅ | 2h | - | 单文件 + 目录 |
| T183 | 实现优先级加载顺序 | P0 | ✅ | 1h | - | README > WORLD_OVERVIEW > ... |
| T184 | 实现字符数限制（50K） | P1 | ✅ | 30min | - | |

### 5.2 系统方案模板

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T190 | 迁移 experience_system.md | P2 | ✅ | 15min | - | public/systems/ |
| T191 | 迁移 gacha_system.md | P2 | ✅ | 15min | - | 参考用 |
| T192 | 迁移 quest_system.md | P2 | ✅ | 15min | - | 参考用 |

### 5.3 设置界面（SettingsScreen）

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T195 | 实现 SettingsScreen 骨架 + Tab 切换 | P0 | ✅ | 2h | - | LLM / 高级 / 数据 / 关于 |
| T196 | 实现 LLM 提供商预设选择 | P0 | ✅ | 1h | - | DeepSeek/OpenAI/Ollama/自定义 |
| T197 | 实现 API Key 输入 + 验证 + 显示/隐藏 | P0 | ✅ | 1h | - | keyring 集成 |
| T198 | 实现 LLM 参数滑块（model/temperature/maxTokens/timeout） | P0 | ✅ | 1h | - | 实时预览 |
| T199 | 实现「测试连接」按钮 | P0 | ✅ | 1h | - | 发送空请求验证 Key |
| T200 | 实现高级设置 Tab（14 项游戏参数） | P1 | ✅ | 2h | - | 数字输入 + 范围校验 |
| T201 | 实现关于 Tab（版本/许可证/依赖列表） | P2 | ✅ | 1h | - | 从 package.json 读取 |

### 5.4 世界观管理界面（WorldManagerScreen）

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T210 | 实现 WorldManagerScreen 列表骨架 | P0 | ✅ | 2h | - | 内置/用户世界分区 |
| T211 | 实现世界观列表加载 + 文件卡片 | P0 | ✅ | 2h | - | 区分单文件/目录式 |
| T212 | 实现新建世界（Markdown 编辑器） | P0 | ✅ | 3h | - | 单文件/目录式选择 |
| T213 | 实现编辑世界（加载 + 保存） | P0 | ✅ | 2h | - | 复用新建编辑器 |
| T214 | 实现删除世界（二次确认） | P0 | ✅ | 1h | - | 内置世界不可删 |
| T215 | 实现导入世界（拖拽 + 文件选择器） | P0 | ✅ | 3h | - | .md/.zip/文件夹 |
| T216 | 实现导出世界（单文件/目录打包） | P1 | ✅ | 2h | - | .md 或 .zip |
| T217 | 实现批量导出世界观 | P2 | 🔲 | 1h | - | 勾选 + zip |
| T218 | 实现「打开世界文件夹」按钮 | P1 | ✅ | 30min | - | Tauri shell |
| T219 | 实现 Rust save_world/delete_world commands | P0 | ✅ | 2h | - | 文件 I/O + 路径校验 |
| T220 | 实现 Rust export_world/import_world commands | P0 | ✅ | 3h | - | 文件读写 + zip 处理 |

### 5.5 本地数据管理

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T230 | 实现数据管理 Tab 骨架 | P0 | ✅ | 1h | - | 数据库信息 + 操作按钮 |
| T231 | 实现数据库信息展示（大小/会话数/路径） | P0 | ✅ | 1h | - | get_database_info |
| T232 | 实现备份数据库 | P0 | ✅ | 2h | - | 复制 + 时间戳 |
| T233 | 实现恢复数据库（二次确认） | P0 | ✅ | 2h | - | 替换 + 重启连接 |
| T234 | 实现备份列表 + 删除备份 | P1 | ✅ | 1h | - | 最多 10 个 |
| T235 | 实现会话管理界面（筛选/搜索/继续/删除） | P1 | ✅ | 2h | - | 独立页面或弹窗 |
| T236 | 实现清理已结束会话 | P1 | ✅ | 1h | - | clear_ended_sessions |
| T237 | 实现清理全部会话（危险操作确认） | P1 | ✅ | 1h | - | clear_all_sessions |
| T238 | 实现完整数据导出（JSON + 世界观） | P2 | 🔲 | 3h | - | export_full_data，**后端为空实现** |
| T239 | 实现完整数据导入（含冲突处理） | P2 | 🔲 | 3h | - | import_full_data，**后端为空实现** |
| T240 | 实现 Rust 备份/恢复/数据管理 commands | P0 | ✅ | 4h | - | SQLite 操作 + 文件 I/O |

---

## Phase 6: 测试与打包（预估 2 天）

### 6.1 测试

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T300 | 完整游戏流程测试 | P0 | 🔲 | 2h | - | start → choice → end → bio |
| T301 | 断点续传测试 | P0 | 🔲 | 1h | - | 保存 → 关闭 → 恢复 |
| T302 | 流式输出测试 | P0 | 🔲 | 1h | - | Token 逐字到达 |
| T303 | LLM 错误恢复测试 | P1 | 🔲 | 1h | - | 超时、无效 JSON |
| T303b | LLM JSON 解析失败降级测试 | P1 | 🔲 | 1h | - | 验证返回 fallback 场景 |
| T303c | 历史摘要双路径测试 | P1 | 🔲 | 1h | - | 正常 + 硬上限 + 降级 |
| T304 | 跨平台构建测试 | P0 | 🔲 | 2h | - | Windows + macOS + Linux |
| T305 | Rust Commands 单元测试 | P1 | 🔲 | 2h | - | `cargo test` 测试 CRUD |
| T306 | 世界观路径安全检查测试 | P1 | 🔲 | 30min | - | 阻止 `../` 穿越 |
| T307 | Tauri CSP 安全配置验证 | P1 | 🔲 | 30min | - | 对齐 Python 安全头 |
| T308 | SSE 协议适配测试 | P0 | 🔲 | 1h | - | 验证 OpenAI SSE 解析正确 |
| T309 | 设置界面测试 | P1 | 🔲 | 1h | - | API Key 验证 + 测试连接 |
| T310 | 世界观管理测试（导入/导出/编辑/删除） | P1 | 🔲 | 2h | - | 文件 I/O + 格式校验 |
| T311 | 数据备份/恢复测试 | P1 | 🔲 | 1h | - | 备份完整性和恢复一致性 |
| T312 | 全量数据导入导出测试 | P2 | 🔲 | 2h | - | 含冲突处理 |

### 6.2 打包

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T320 | 配置应用图标 | P1 | 🔲 | 1h | - | 512x512 PNG，**需验证是否存在** |
| T321 | 配置应用信息 | P1 | ✅ | 30min | - | 名称、版本、描述 |
| T322 | Windows 打包（.exe/.msi） | P0 | 🔲 | 1h | - | |
| T323 | macOS 打包（.app/.dmg） | P0 | 🔲 | 1h | - | |
| T324 | Linux 打包（.deb/.AppImage） | P0 | 🔲 | 1h | - | |
| T325 | 打包产物验证 | P0 | 🔲 | 2h | - | 各平台安装测试 |

---

## 生产发布阻塞问题（2026-06-02 审查发现）

| # | 问题 | 优先级 | 状态 | 文件 | 说明 |
|---|------|--------|------|------|------|
| P0-001 | npm 依赖安全漏洞 | Critical | 🔲 | package.json | vitest CVE-1120011 (CVSS 9.8), vite 路径穿越, esbuild 泄露 |
| P0-002 | 测试覆盖率为 0% | Critical | 🔲 | 全项目 | vitest 已配置但无测试文件 |
| P0-003 | import_full_data 为空实现 | Critical | 🔲 | src-tauri/src/commands/data.rs:200-206 | 返回硬编码成功消息 |
| P0-004 | export_full_data 为空实现 | Critical | 🔲 | src-tauri/src/commands/data.rs | 返回硬编码成功消息 |
| P0-005 | maybeSummarize 空 LLMConfig | High | 🔲 | src/game/engine.ts:396-408 | 传入空 apiKey/baseUrl/model |
| P0-006 | API Key Web 模式明文存储 | High | 🔲 | src/services/config.ts:83-85 | localStorage 明文存储 |

---

## 建议改进（推荐发布前解决）

### 代码质量 (P1)

| # | 任务 | 优先级 | 状态 | 预估 | 文件 | 说明 |
|---|------|--------|------|------|------|------|
| P1-001 | 完善错误处理分类 | P1 | 🔲 | 2h | src/store/gameStore.ts:315-320 | 区分网络/认证/解析错误，提供针对性提示 |
| P1-002 | 流式 JSON 解析增强容错 | P1 | 🔲 | 2h | src/components/common/StreamedText.tsx:73-171 | 添加边界测试和降级处理 |
| P1-006 | 类型定义与数据库一致性检查 | P1 | 🔲 | 1h | src/types/models.ts + src-tauri/src/commands/db.rs:31 | currentScenario 等字段对齐 |
| P1-007 | LLM 重试策略按错误类型区分 | P1 | 🔲 | 1h | src/services/retry.ts:34-38 | 添加 HTTP 状态码判断和错误类型枚举 |
| P1-009 | maybeSummarize 并发锁保护 | P1 | 🔲 | 1h | src/game/engine.ts:379-420 | 添加摘要状态锁或 async mutex |
| P1-010 | 版本号动态读取统一维护 | P1 | 🔲 | 30min | package.json/Cargo.toml/SettingsScreen.tsx | 从 package.json 动态读取 |

### 用户体验 (P1)

| # | 任务 | 优先级 | 状态 | 预估 | 文件 | 说明 |
|---|------|--------|------|------|------|------|
| P1-003 | 世界观缓存自动清理机制 | P1 | 🔲 | 1h | src/services/world.ts:12-19 | 添加 TTL 过期或 LRU 淘汰，防止内存泄漏 |
| P1-004 | 准备并验证应用图标 | P1 | 🔲 | 1h | src-tauri/tauri.conf.json:30-35 | 检查 public/icons/ 下各尺寸图标是否存在 |
| P1-005 | SettingsScreen 数据管理功能实现 | P1 | 🔲 | 3h | src/components/screens/SettingsScreen.tsx:499-507 | 实现完整备份/恢复/清理功能（替换 alert 占位符） |
| P1-008 | 替换原生 confirm 为 ConfirmModal | P1 | 🔲 | 1h | src/components/screens/StartScreen.tsx:285 | 统一应用内确认对话框风格 |

### 长期优化 (P2)

| # | 任务 | 优先级 | 状态 | 预估 | 文件 | 说明 |
|---|------|--------|------|------|------|------|
| P2-001 | 世界观内容智能截断 | P2 | 🔲 | 2h | src/services/world.ts:76-79 | 实现智能摘要而非硬截断 50K 字符 |
| P2-002 | Q&A 历史持久化分页 | P2 | 🔲 | 2h | src/types/settings.ts:17 | 内存限制外增加数据库分页存储 |
| P2-003 | 国际化 (i18n) 支持 | P2 | 🔲 | 4h | 所有 UI 组件 | 界面文字提取为多语言资源文件 |
| P2-004 | 离线模式首次引导提示 | P2 | 🔲 | 1h | StartScreen | 用户首次启动时明确离线使用说明 |
| P2-005 | Python 版数据迁移脚本 | P2 | 🔲 | 2h | 新文件 | 自动化迁移 Python 版会话数据 |
| P2-006 | Rust 代码单元测试 | P2 | 🔲 | 4h | src-tauri/src/**/*.rs | 所有 Rust 命令和数据库操作测试 |
| P2-007 | 错误日志上报机制 | P2 | 🔲 | 2h | 全局 | 错误本地 console.log 外增加远程上报 |
| P2-008 | CSP 配置收紧 | P2 | 🔲 | 30min | src-tauri/tauri.conf.json:24 | 限制 http://localhost:* 为特定端口 |

---

## 任务统计

| 状态 | 数量 | 占比 |
|------|------|------|
| 🔲 待开始 | 39 | 23% |
| 🔨 进行中 | 0 | 0% |
| ✅ 已完成 | 128 | 74% |
| ⏸️ 已暂停 | 1 | 1% |
| ❌ 已取消 | 5 | 3% |
| **总计** | **173** | **100%** |

### 预估工作量

| 类别 | 时间 |
|------|------|
| Phase 1: 基础架构 | 2 天 ✅ |
| Phase 2: 游戏引擎 | 2 天 ✅ |
| Phase 3: UI 界面 | 2 天 ✅ |
| Phase 4: 持久化 | 1 天 ✅ |
| Phase 5: 数据与配置（含设置/世界管理/数据管理） | 2 天（85% 完成） |
| Phase 6: 测试与打包 | 2 天（0% 完成） |
| P0 阻塞问题修复 | ~1 天 |
| P1 建议改进 | ~2 天 |
| P2 长期优化 | ~2.5 天（可选，非发布必需） |
| **实际完成** | **约 7-8 天** |
| **剩余工作量** | **约 5-6 天（含 P1）/ 7.5-8.5 天（含 P2）** |

---

## 任务依赖图

```
Phase 1 (基础架构) ✅
├── T001-T006 项目初始化 ✅
│   └── T010-T020b 类型系统 + LLM 客户端（统一流式） ✅
│       ├── T021 streamChatText() 便捷封装 ✅
│       ├── T022-T023 超时 + 错误处理 ✅
│       ├── T030-T041 Prompt 模板 ✅（T041 可选）
│       ├── T045-T049c SSE 解析器 + 工具函数 ✅
│       └── T050-T052 单元测试 🔲
│
Phase 2 (游戏引擎) ✅
├── T060-T064 Zustand store ← Phase 1 ✅
│   ├── T070-T080 游戏引擎核心 ✅
│   ├── T085-T086 系统方案生成 ✅
│   ├── T090-T092 传记生成 ✅
│   └── T095-T096 Q&A 系统（流式） ✅
│
Phase 3 (UI 界面) ✅
├── T100-T104 通用组件 ← Phase 1 ✅
│   ├── T110-T115 StartScreen（+ 管理世界入口） ✅
│   ├── T120-T124 SystemScreen ✅
│   ├── T130-T137 GameScreen ✅
│   └── T140-T143 BiographyScreen ✅
│
Phase 4 (持久化) ✅
├── T150-T153 存储层抽象 ← Phase 1 ✅
│   ├── T160-T164 Rust SQLite ✅
│   └── T170-T172 配置存储 ✅
│
Phase 5 (数据与配置) ~85%
├── T180-T184 世界观数据 ← Phase 1 ✅（T181 可选暂停）
│   ├── T190-T192 系统方案模板 ✅
│   ├── T195-T201 设置界面（LLM/高级/数据/关于） ✅
│   ├── T210-T220 世界观管理（列表/新建/编辑/导入/导出/Rust commands） ✅（T217 待开始）
│   └── T230-T240 本地数据管理（备份/恢复/会话管理/全量导入导出/Rust commands） ~85%（T238/T239 待开始）
│
Phase 6 (测试与打包) 🔲
├── T300-T312 测试 ← Phase 2-5 🔲
│   └── T320-T325 打包 🔲
```
