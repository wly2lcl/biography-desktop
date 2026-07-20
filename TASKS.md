# Biography Desktop - 任务清单

> 最后更新: 2026-07-20（准备 v0.1.1，手动 Release 改为从清单自动推导版本）

## Phase 10: 云端 API 稳定发布整改

> 正式版只支持 DeepSeek 与 OpenAI；本地与自定义提供商默认关闭。代码修改必须以本节设计为准。

| # | 任务 | 优先级 | 状态 |
|---|------|--------|------|
| T700 | Session schema v2 + WorldRef + 旧会话归一化 | P0 | ✅ |
| T701 | 修复后续场景、问答、摘要和传记的世界观来源 | P0 | ✅ |
| T702 | SQLite user_version 迁移、endReason/WorldRef 持久化与无损 upsert | P0 | ✅ |
| T703 | 一致性备份、完整性检查和事务恢复 | P0 | ✅ |
| T704 | DeepSeek/OpenAI adapter + 结构化 LLM 错误 | P0 | ✅ |
| T705 | SSE 边界、取消、超时与非法响应校验 | P0 | ✅ |
| T706 | 摘要 await、硬上限顺序和确定性降级 | P0 | ✅ |
| T707 | Store 请求去重与迟到响应隔离 | P1 | ✅ |
| T708 | 实验提供商与 Rust local-model feature 隔离 | P0 | ✅ |
| T709 | 隐私提示与无副作用连接测试 | P0 | ✅ |
| T710 | 主链路、迁移、备份、SSE 和竞态测试 | P0 | ✅ |
| T711 | CI 质量门禁与完整 Release 依赖 | P0 | ✅ |
| T712 | 结束旅程先发布 Store 状态，消除传记确认竞态 | P0 | ✅ |
| T713 | v1 全量导入保留迁移标记并恢复真实 WorldRef | P0 | ✅ |
| T714 | 稳定范围切换时保留无关游戏设置 | P1 | ✅ |
| T715 | 实验本地提供商无 Key 启动与独立 CSP/统一构建入口 | P1 | ✅ |
| T716 | SSE 按空行/EOF 聚合多行 data 字段 | P1 | ✅ |
| T717 | tag 与手动触发使用一致的签名稳定发布判定 | P0 | ✅ |
| T718 | 为上述复审问题补充回归测试与提交前质量审计 | P0 | ✅ |
| T719 | 设置持久化剔除 API Key，旧明文只迁移到内存/keyring 边界 | P0 | ✅ |
| T720 | 使用 Tauri 2 可靠运行时标记，确保正式包 API Key 进入 keyring | P0 | ✅ |
| T721 | Store 持有并传播 AbortController，离开流程时真实取消云端请求 | P0 | ✅ |
| T722 | 稳定版读取旧 app_config 时重新执行提供商类型白名单归一化 | P1 | ✅ |
| T723 | 为第二轮复审问题补充回归测试并重跑完整本地门禁 | P0 | ✅ |
| T724 | 旧云端配置迁移时同步 settings/config 并持久化单一真值 | P0 | ✅ |
| T725 | schema v2 WorldRef 严格按来源加载，兼容探测仅限旧会话归一化 | P0 | ✅ |
| T726 | 设置保存失败时保持 Store/持久化一致并显示钥匙串错误 | P0 | ✅ |
| T727 | 第三轮全工作区复审、回归测试与最终可提交审计 | P0 | ✅ |
| T728 | 修复空选项场景的同事务自动续接与请求级计数 | P0 | ✅ |
| T729 | 使用唯一备份文件名并清理失败快照 | P1 | ✅ |
| T730 | Release 标签与 npm/Tauri/Cargo 清单版本一致性门禁 | P0 | ✅ |
| T731 | 保留剧情/上限结束原因，只有主动结束写入 player_ended | P0 | ✅ |
| T732 | 要求 SSE 正常完成标记并拒绝内容后异常 EOF | P0 | ✅ |
| T733 | 使用 WorldRef 复合身份区分同名内置与用户世界 | P1 | ✅ |
| T734 | 批量会话逐条隔离损坏记录并向开始页显示恢复警告 | P1 | ✅ |
| T735 | 数据库恢复仅替换会话并保留当前设置与 keyring API Key | P0 | ✅ |
| T736 | SSE 收到完成标记后立即停止读取并清理底层 reader | P0 | ✅ |
| T737 | 手动 Release 新标签固定到工作流选择的提交 | P0 | ✅ |
| T738 | 区分恢复 IPC 失败与恢复后界面刷新失败提示 | P1 | ✅ |
| T739 | 第五轮全工作区复审、回归测试与最终可提交审计 | P0 | ✅ |
| T740 | DatabaseInfo IPC 使用前端约定的 camelCase 字段 | P1 | ✅ |
| T741 | 批量世界导出拒绝逃逸 worlds 目录的符号链接 | P0 | ✅ |
| T742 | 恢复提交后 DETACH 清理失败不得误报事务回滚 | P1 | ✅ |
| T743 | Windows/Linux 用户世界命令统一使用 AppDb 数据目录 | P1 | ✅ |
| T744 | 首页未就绪提示同时覆盖 API Key 与云端隐私确认 | P2 | ✅ |
| T745 | 会话持久化与恢复/导入/清理数据库操作互斥 | P0 | ✅ |
| T746 | 恢复后的严格刷新向上传播错误并显示准确提示 | P1 | ✅ |
| T747 | 手动 Release 校验既有标签最终提交与 github.sha 一致 | P0 | ✅ |
| T748 | 第六轮回归测试、完整门禁与全工作区复审 | P0 | ✅ |
| T749 | DeepSeek/OpenAI Base URL 可编辑，空值按提供商回退官方地址 | P1 | ✅ |
| T750 | 隔离问答流显示，问答期间正文保持当前场景 | P1 | ✅ |
| T751 | 自定义 Base URL 强制远程 HTTPS，仅允许回环 HTTP | P0 | ✅ |
| T752 | 保留实验提供商真实身份，禁止空 Base URL 回退 DeepSeek | P0 | ✅ |

### Base URL 自定义修正

- [x] 稳定版 DeepSeek/OpenAI 的 Base URL 输入框保持可编辑。
- [x] Base URL 为空时，连接测试和所有生成请求按当前 provider 使用官方地址。
- [x] 保存和旧配置迁移保留受支持 provider 的自定义 Base URL。
- [x] 桌面 CSP、隐私提示和构建策略测试覆盖自定义端点。
- [x] 补充回归测试并重跑相关门禁。

### Base URL 传输安全修正

- [x] 远程自定义端点强制 HTTPS，仅允许 localhost、127.0.0.1 与 ::1 使用 HTTP。
- [x] 请求层与设置页复用统一 URL 校验，非法地址在 fetch 前失败。
- [x] 设置页对非法地址显示内联错误，并禁止保存与连接测试。
- [x] 收紧稳定/实验 CSP，删除裸 `http:` 放行并增加构建策略断言。
- [x] 补充回归测试并重跑完整前端门禁。
- [x] 仅 DeepSeek/OpenAI 允许空地址回退官方端点；实验与自定义提供商空地址在请求前失败。

### 问答流显示修正

- [x] Store 明确标记当前流是否属于问答。
- [x] 问答期间正文保持当前场景内容，回答只在问答面板流式显示。
- [x] 请求完成、失败、取消或新游戏时清理问答流标记。
- [x] 增加流显示回归测试并重跑相关门禁。

## Phase 11: 公开稳定产品化

> 目标是面向普通用户发布隐私优先的 DeepSeek/OpenAI BYOK 桌面产品。外部证书、公证和干净虚拟机验收不以代码完成代替。

| # | 任务 | 优先级 | 状态 |
|---|------|--------|------|
| T800 | 更新 DESIGN/TASKS/STATUS/README，统一版本、产物和发布边界 | P0 | ✅ |
| T801 | `AppError` 与真实重试动作，移除伪重试按钮 | P0 | ✅ |
| T802 | Rust 启动错误可恢复，禁止数据库/目录初始化直接 panic | P0 | ✅ |
| T803 | 补充 MIT LICENSE、版本与安装包说明 | P0 | ✅ |
| T804 | 应用内版本与 Release 更新入口 | P1 | ✅ |
| T805 | Web UI 闭环与 Tauri 通道 mock 冒烟；真实原生 E2E 待签名包 | P0 | 🔨 |
| T806 | 签名、公证、安装/升级/卸载人工发布清单 | P0 | ✅ |
| T810 | 类型化 Session/Settings/World/Llm/Data 基础设施接口 | P1 | ✅ |
| T811 | Store 分片渐进拆分（已拆 localModel） | P1 | 🔨 |
| T812 | SettingsScreen 与 Rust data commands 按领域拆分（前端 Data/About/LocalModel 已拆） | P1 | 🔨 |
| T813 | `AppSettings` 成为配置单一真值，兼容清理旧 `app_config` | P0 | ✅ |
| T814 | 稳定构建仅加载 DeepSeek/OpenAI adapter | P0 | ✅ |
| T820 | Rust LLM transport 与请求 ID 流式事件，密钥不返回 WebView | P0 | ✅ |
| T821 | `ContextBudget`、模型能力与确定性上下文裁剪 | P0 | ✅ |
| T822 | 本地诊断包、隐私脱敏与请求用量指标 | P1 | ✅ |
| T830 | 首次启动配置向导 | P1 | ✅ |
| T831 | 无网络、无 API Key 的静态示例旅程 | P1 | ✅ |
| T832 | 世界模板、校验、预览、复制与导入诊断 | P1 | ✅ |
| T833 | 传记 Markdown/PDF 与生成元数据导出 | P1 | ✅ |
| T840 | UI 覆盖率与完整质量门禁 | P0 | ✅ |
| T841 | 四平台签名安装包人工验收 | P0 | ⏸️ |
| T842 | 禁止 Rust LLM 重定向并覆盖响应头前取消 | P0 | ✅ |
| T843 | Rust SSE 增量 UTF-8 解码与异常字节校验 | P0 | ✅ |
| T844 | DeepSeek/OpenAI/custom API Key 按 provider/Base URL 隔离 | P0 | ✅ |
| T845 | 设置持久化清理失败时回滚 app_settings | P1 | ✅ |
| T846 | 保存并导出实际传记生成 provider/model/time 元数据 | P1 | ✅ |
| T847 | 第七轮完整门禁与全工作区复审 | P0 | ✅ |
| T848 | SQLite v3 持久化传记生成元数据并兼容 v2/v3 备份 | P0 | ✅ |
| T849 | 修复 Tauri LLM 预取消竞态及 HTTP 状态/Retry-After 传递 | P0 | ✅ |
| T850 | 修复密钥删除作用域、传记预算、世界复制覆盖与 IPv6 回环校验 | P1 | ✅ |
| T851 | 第八轮完整门禁与全工作区复审 | P0 | ✅ |
| T852 | 设置页 API Key 草稿按 provider/Base URL 作用域隔离 | P0 | ✅ |
| T853 | 稳定前端 Store 排除本地模型 IPC/事件实现并强化产物检查 | P0 | ✅ |
| T854 | 系统模式开始失败后保留参数并提供真实重试 | P1 | ✅ |
| T855 | 第九轮完整门禁与全工作区复审 | P0 | ✅ |
| T856 | Web 请求边界按 provider/Base URL 读取精确作用域密钥 | P0 | ✅ |
| T857 | 诊断包排除原始错误栈并脱敏 Promise rejection reason | P0 | ✅ |
| T858 | 第十轮回归测试、完整门禁与全工作区复审 | P0 | ✅ |
| T859 | 修复 Rust SSE 在网络 chunk 恰好拆分 CRLF 时的事件边界误判 | P0 | ✅ |
| T860 | 临时内存模式禁用会被误认为持久化的数据管理操作 | P0 | ✅ |
| T861 | CI 编译并测试默认与 `local-model` 两套 Rust feature | P1 | ✅ |
| T862 | 第十一轮完整门禁、全工作区复审与最终可提交审计 | P0 | ✅ |
| T863 | 未签名 macOS Release 完全省略 Apple 签名环境变量 | P0 | ✅ |
| T864 | 构建策略检查覆盖签名/未签名 macOS 分支隔离 | P1 | ✅ |
| T865 | Apple/Windows 凭据独立判定并按平台生成签名产物 | P0 | ✅ |
| T866 | 平台签名元数据、工作流分支与稳定发布门禁回归测试 | P0 | ✅ |
| T867 | 将 npm/Tauri/Cargo、锁文件、前端版本与文档统一升级到 0.1.1 | P0 | ✅ |
| T868 | 手动 Release 从已提交 manifest 自动推导标签并移除版本输入 | P0 | ✅ |

### 第四轮提交前复审修复

- [x] 修复结束原因覆盖、截断流、同名世界和损坏会话静默失败。
- [x] 补充前端/Rust 回归测试，并重新审查全部未提交内容。

### 第五轮提交前复审修复

- [x] 恢复备份时只替换会话，保留当前设置和系统 keyring API Key。
- [x] SSE 在 `[DONE]` 或 `finish_reason` 后立即停止读取，不受后续断流或超时影响。
- [x] 手动 Release 创建的新标签指向本次工作流的 `github.sha`。
- [x] 恢复成功后的刷新错误不得误报为数据库未替换。
- [x] 数据库信息 IPC 的会话计数字段与前端 camelCase 类型保持一致。

### 第十一轮提交前收口

- [x] SSE 解析保留跨网络 chunk 的 CRLF 状态，禁止把拆开的 `\r`/`\n` 误判为空事件边界。
- [x] 临时内存模式明确禁用备份、恢复、导入、清理等持久化数据操作，且不展示磁盘数据库信息。
- [x] CI 对默认与 `local-model` feature 分别执行 Clippy 和 Rust tests，并验证稳定/实验前端构建。
- [x] 冻结功能范围，完成全部本地门禁和全工作区复审；未发现新的 P0/P1 阻塞项，可以提交。
- [x] 批量世界导出与单文件操作使用相同的 canonical 路径边界。
- [x] 恢复事务已提交后，附加库清理失败只丢弃连接，不得误报数据库未替换。
- [x] 所有用户世界命令与批量导出使用同一个 `AppDb.data_dir/worlds`。
- [x] 首页未就绪提示准确区分云端配置与隐私确认。
- [x] 补充回归测试并重新审查全部未提交内容。

### macOS 未签名 Release 修复

- [x] 将已签名 macOS 构建拆为独立步骤，仅在该步骤注入 Apple 签名与公证变量。
- [x] 未签名 macOS、Windows 和 Linux 构建不设置任何空 Apple 签名变量。
- [x] 构建策略脚本静态验证两个分支，并重跑发布元数据与配置门禁。

### Release 平台签名状态拆分

- [x] Apple 凭据完整时独立签名并公证 macOS，不再受 Windows 凭据是否存在影响。
- [x] Windows 凭据完整时独立签名 Windows，不再受 Apple 凭据是否存在影响。
- [x] 只有用户请求稳定发布且两组签名凭据均完整时才创建正式 Release；否则保持 draft/prerelease。
- [x] 发布元数据和构建策略测试覆盖 Apple-only、Windows-only、全部凭据及无凭据四种组合。

### v0.1.1 自动版本 Release

- [x] npm、Tauri、Cargo、锁文件、前端版本显示和文档统一升级到 0.1.1。
- [x] 手动 Release 移除版本输入，从已提交的 `package.json` 自动生成 `v0.1.1`。
- [x] 保留三份清单一致性、tag push 版本匹配和既有标签提交校验。
- [x] 发布元数据、构建策略、316 项前端测试、覆盖率、稳定/实验构建及两套 Rust 门禁通过。

### 第六轮提交前复审修复

- [x] 数据库恢复、导入和清理必须等待已经开始的会话写入完成，并阻止重复数据操作。
- [x] 恢复后的严格刷新失败必须向上传播，不得误报为完全恢复成功。
- [x] 手动 Release 使用既有标签时必须校验标签最终提交与本次工作流提交一致。
- [x] 补充竞态与发布策略测试，重跑完整门禁并重新审查全部未提交内容。

### 第七轮提交前复审修复

- [x] 禁止 Rust transport 跟随重定向，并让取消覆盖等待响应头阶段。
- [x] 增量解码跨 chunk UTF-8，拒绝非法或不完整字节流。
- [x] 稳定 provider 与实验 custom 使用隔离的 Keyring/localStorage 作用域。
- [x] 修复设置写入成功、旧配置清理失败时未回滚的问题。
- [x] 传记导出使用实际生成时的 provider、model 与时间。
- [x] 补充回归测试、重跑完整门禁并复审全部未提交内容。

### 第八轮提交前复审修复

- [x] SQLite user_version 升级至 3，传记生成元数据覆盖保存、读取、导入导出和 v2/v3 备份恢复。
- [x] 取消在动态 IPC 加载和 Rust 请求注册竞态中均立即生效，不得产生迟到网络请求或 token。
- [x] Rust LLM 错误事件向前端保留 HTTP 状态及 Retry-After。
- [x] 切换提供商后仅删除当前 API Key 作用域；小上下文窗口仍能生成传记。
- [x] 复制内置世界使用原子无覆盖命名；IPv6 回环 HTTP 与前端安全规则一致。
- [x] 补充回归测试、重跑完整门禁并复审全部未提交内容。

### 第十轮提交前复审修复

- [x] Web 调试请求在空草稿时使用当前精确作用域的已保存密钥，显式草稿仍优先。
- [x] 可分享诊断包不导出原始 stack，并将 rejection reason 作为敏感字段脱敏。
- [x] 补充隔离与隐私回归测试，重跑完整门禁并复审全部未提交内容。

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
| T041 | 实现文件系统 Prompt 覆盖 | P2 | ✅ | 1h | - | Tauri read_file/write_file + 路径安全验证 |

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
| T050 | SSE 解析器单元测试 | P1 | ✅ | 1h | - | vitest + edge cases 17 tests |
| T051 | JSON 解析容错测试 | P1 | ✅ | 1h | - | 各种 malformed 输入，18 edge case tests |
| T052 | Prompt 格式化测试 | P1 | ✅ | 1h | - | 22 tests（format/formatHistory/formatSummaryOnly 等） |
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
| T161 | 实现 `save_session` command | P0 | ✅ | 2h | - | ON CONFLICT 无损 upsert，保留 created_at |
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
| T181 | 迁移 world/ 目录 | P1 | ❌ | - | - | 无需迁移，单文件已足够 |
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
| T217 | 实现批量导出世界观 | P2 | ✅ | 1h | - | 勾选 + zip，Rust export_worlds + 前端多选 |
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
| T238 | 实现完整数据导出（JSON + 世界观） | P2 | ✅ | 3h | - | export_full_data Rust + 前端对接（Tauri save + web blob fallback） |
| T239 | 实现完整数据导入（含冲突处理） | P2 | ✅ | 3h | - | import_full_data Rust + 前端对接（Tauri open + web file input fallback） |
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
| T306 | 世界观路径安全检查测试 | P1 | ✅ | 30min | - | 阻止 `../` 穿越，Rust 6 个函数均加检查 |
| T307 | Tauri CSP 安全配置验证 | P1 | ✅ | 30min | - | 已收紧 localhost:* → 具体端口 |
| T308 | SSE 协议适配测试 | P0 | 🔲 | 1h | - | 验证 OpenAI SSE 解析正确 |
| T309 | 设置界面测试 | P1 | 🔲 | 1h | - | API Key 验证 + 测试连接 |
| T310 | 世界观管理测试（导入/导出/编辑/删除） | P1 | 🔲 | 2h | - | 文件 I/O + 格式校验 |
| T311 | 数据备份/恢复测试 | P1 | 🔲 | 1h | - | 备份完整性和恢复一致性 |
| T312 | 全量数据导入导出测试 | P2 | 🔲 | 2h | - | 含冲突处理 |

### 6.2 打包

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T320 | 配置应用图标 | P1 | ✅ | 1h | - | 图标已验证存在，tauri build 自动打包 |
| T322 | Windows 打包（.exe/.msi） | P0 | ✅ | 1h | - | CI/CD 工作流已配置，GitHub Actions 自动构建 |
| T323 | macOS 打包（.app/.dmg） | P0 | ✅ | 1h | - | CI/CD 工作流已配置，GitHub Actions 自动构建+签名 |
| T324 | Linux 打包（.deb/.AppImage） | P0 | ✅ | 1h | - | ✅ 本地 .deb 6.1MB + .rpm 6.1MB 打包成功 |
| T325 | 打包产物验证 | P0 | ✅ | 2h | - | ✅ .deb 验证通过（含二进制/图标/desktop 文件） |

---

## 生产发布阻塞问题（2026-06-02 审查发现）

| # | 问题 | 优先级 | 状态 | 文件 | 说明 |
|---|------|--------|------|------|------|
| P0-001 | npm 依赖安全漏洞 | Critical | ✅ | package.json | vite→6.4.3, vitest→4.1.8，漏洞已修复 |
| P0-002 | 测试覆盖率为 0% | Critical | ✅ | 全项目 | 新增 25 个单元测试（parser/retry/sse），覆盖率从 0%→有覆盖 |
| P0-003 | import_full_data 为空实现 | Critical | ✅ | src-tauri/src/commands/data.rs:200-206 | 已实现完整 JSON 解析 + 事务导入 |
| P0-004 | export_full_data 为空实现 | Critical | ✅ | src-tauri/src/commands/data.rs | 已实现完整会话数据导出 |
| P0-005 | maybeSummarize 空 LLMConfig | High | ✅ | src/game/engine.ts:379-430 | 已传入实际 LLMConfig + 并发锁保护 |
| P0-006 | API Key Web 模式明文存储 | High | ✅ | src/services/config.ts:83-85 | 已添加安全警告提示 |

---

## 建议改进（推荐发布前解决）

### 代码质量 (P1)

| # | 任务 | 优先级 | 状态 | 预估 | 文件 | 说明 |
|---|------|--------|------|------|------|------|
| P1-001 | 完善错误处理分类 | P1 | ✅ | 2h | src/store/gameStore.ts:315-320 | 区分网络/认证/解析/超时/限流错误，提供中文提示 |
| P1-002 | 流式 JSON 解析增强容错 | P1 | ⏸️ | 2h | src/components/common/StreamedText.tsx:73-171 | 已有基础容错，边界测试待补充 |
| P1-006 | 类型定义与数据库一致性检查 | P1 | ⏸️ | 1h | src/types/models.ts + src-tauri/src/commands/db.rs:31 | currentScenario 等字段已对齐大部分 |
| P1-007 | LLM 重试策略按错误类型区分 | P1 | ✅ | 1h | src/services/retry.ts:34-38 | 已添加 HTTP 状态码判断和 429/5xx 区分 |
| P1-009 | maybeSummarize 并发锁保护 | P1 | ✅ | 1h | src/game/engine.ts:379-430 | 已添加 summarizing 状态锁 |
| P1-010 | 版本号动态读取统一维护 | P1 | ✅ | 30min | package.json/Cargo.toml/SettingsScreen.tsx | 已从 npm_package_version 动态注入 |

### 用户体验 (P1)

| # | 任务 | 优先级 | 状态 | 预估 | 文件 | 说明 |
|---|------|--------|------|------|------|------|
| P1-003 | 世界观缓存自动清理机制 | P1 | ✅ | 1h | src/services/world.ts:12-19 | 已添加 cleanupExpired() 含 TTL+LRU 淘汰 |
| P1-004 | 准备并验证应用图标 | P1 | ✅ | 1h | src-tauri/tauri.conf.json:30-35 | 图标文件已存在（32x32/128x128/icns/ico/png） |
| P1-005 | SettingsScreen 数据管理功能实现 | P1 | ✅ | 3h | src/components/screens/SettingsScreen.tsx:499-507 | 已实现备份/清理/清理全部 Tauri IPC 调用 |
| P1-008 | 替换原生 confirm 为 ConfirmModal | P1 | ✅ | 1h | src/components/screens/StartScreen.tsx:285 | 已使用 ConfirmModal 组件替换 |
| P1-011 | 系统能力实质化到玩家状态 | P1 | ⏸️ | 4h | src/store/gameStore.ts:418-424 | 改用 LLM 上下文传递而非关键字解析: system abilities 作为完整文本通过 `loadSystemContext` 传入 LLM，由 LLM 动态理解 |
| P1-012 | 修复流式序章显示 undefined | P1 | ✅ | 1h | src/game/engine.ts + StreamedText.tsx | data.prologue 缺失导致 undefined 拼接 + abilities 提取定位错误 |

### 长期优化 (P2)

| # | 任务 | 优先级 | 状态 | 预估 | 文件 | 说明 |
|---|------|--------|------|------|------|------|
| P2-001 | 世界观内容智能截断 | P2 | ✅ | 2h | src/services/world.ts:76-79 | 已实现 heading 边界智能截断替代硬截断 |
| P2-002 | Q&A 历史持久化分页 | P2 | ✅ | 2h | src/services/storage.ts | 已实现 localStorage 分页存储 + Tauri 从 session 提取 |
| P2-005 | Python 版数据迁移脚本 | P2 | ✅ | 2h | scripts/migrate_from_python.py | 已实现列映射/冲突处理/统计报告 |
| P2-006 | Rust 代码单元测试 | P2 | ✅ | 4h | src-tauri/src/**/*.rs | 默认及 `local-model` 各 60 个独立测试覆盖数据库、备份恢复、导入、世界观与 LLM 传输核心逻辑 |
| P2-007 | 错误日志上报机制 | P2 | ✅ | 2h | src/services/errorLogger.ts | 已实现 localStorage 持久日志 + 自动捕获 unhandled error |
| P2-008 | CSP 配置收紧 | P2 | ✅ | 30min | src-tauri/tauri.conf.json:24 | 仅允许 HTTPS 与明确的本机回环 HTTP 端点 |

---

## 任务统计

| 状态 | 数量 | 占比 |
|------|------|------|
| 🔲 待开始 | 12 | 3.8% |
| 🔨 进行中 | 3 | 0.9% |
| ✅ 已完成 | 295 | 93.1% |
| ⏸️ 已暂停 | 4 | 1.3% |
| ❌ 已取消 | 3 | 0.9% |
| **总计** | **317** | **100%** |

### 预估工作量

| 类别 | 时间 |
|------|------|
| Phase 1: 基础架构 | 2 天 ✅ |
| Phase 2: 游戏引擎 | 2 天 ✅ |
| Phase 3: UI 界面 | 2 天 ✅ |
| Phase 4: 持久化 | 1 天 ✅ |
| Phase 5: 数据与配置（含设置/世界管理/数据管理） | 2 天 ✅（100% 完成） |
| Phase 6: 测试与打包 | 2 天（前端测试 ✅ 316 tests / Rust 默认及实验各 61 tests / Linux 打包 ✅ / Windows CI/CD ✅ / macOS CI/CD ✅） |
| P0 阻塞问题修复 | ~1 天 ✅ |
| P1 建议改进 | ~2 天（8/10 完成） |
| P2 长期优化 | ~2.5 天（7/8 完成） |
| **实际完成** | **约 16-17 天** |
| **剩余工作量** | **Phase 8: ~0.5 天（7 项代码任务）+ 4 项集成测试** |

---

## Phase 7: 传记生成改进（预估 0.5 天）

### 7.1 类型与引擎

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T400 | 新增 `EndReason` 类型定义 | P0 | ✅ | 5min | - | src/types/models.ts |
| T401 | `GameSession` 增加 `endReason` 字段 | P0 | ✅ | 5min | - | src/types/models.ts |
| T402 | `processChoice()` 设置 `endReason` | P0 | ✅ | 30min | - | src/game/engine.ts:player_ended |
| T403 | `applyNextScenario()` 设置自然结束 `endReason` | P0 | ✅ | 30min | - | src/game/engine.ts:story_ending |

### 7.2 状态管理与传记生成

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T410 | `endGame()` 改为可选生成传记 | P0 | ✅ | 30min | - | src/store/gameStore.ts |
| T411 | 新增 `showConfirmBio` 状态 | P0 | ✅ | 15min | - | src/store/gameStore.ts |
| T412 | 新增 `skipBiography()` 动作 | P0 | ✅ | 15min | - | src/store/gameStore.ts |
| T413 | `generateBiography()` 传入 `isComplete` | P0 | ✅ | 30min | - | 根据 endReason 判断 |

### 7.3 提示词模板

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T420 | `biographyPrompt()` 增加 `isComplete` 参数 | P0 | ✅ | 30min | - | src/services/prompts.ts |
| T421 | 注入"未完待续"约束指令 | P0 | ✅ | 30min | - | isComplete=false 时追加 |
| T422 | `formatHistoryForBiography()` 增加 `isComplete` | P0 | ✅ | 15min | - | 非完整时追加状态提示 |

### 7.4 UI 流程

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T430 | 两步确认流程（结束 → 生成传记） | P0 | ✅ | 1h | - | src/App.tsx |
| T431 | 结束面板文案根据 endReason 区分 | P0 | ✅ | 30min | - | src/components/screens/GameScreen.tsx |
| T432 | 新增 i18n 文案（8 条） | P1 | ✅ | 15min | - | src/i18n/locales/zh-CN.json |

---

## Phase 8: llama.cpp 本地模型支持（预估 0.5 天）

### 8.1 类型与配置

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T500 | `llmProvider` 类型新增 `'llamacpp'` 选项 | P0 | ✅ | 5min | - | src/types/settings.ts |
| T501 | `PRESET_PROVIDERS` 新增 llama.cpp 预设 | P0 | ✅ | 5min | - | src/services/config.ts, `http://localhost:8080` |
| T502 | 默认配置新增 llamacpp 分支 | P0 | ✅ | 5min | - | DEFAULT_SETTINGS, 空 apiKey |

### 8.2 LLM 客户端改动

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T510 | `streamChat()` 空 apiKey 时不发 Authorization header | P0 | ✅ | 10min | - | src/services/llm.ts:39 |

### 8.3 设置 UI

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T520 | SettingsScreen 新增 llama.cpp 选项 | P0 | ✅ | 10min | - | 自动渲染（PRESET_PROVIDERS 迭代） |
| T521 | 选择 llama.cpp 时隐藏/禁用 API Key 输入框 | P1 | ✅ | 15min | - | 自动显示"无需 API Key"提示 |

### 8.4 测试

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T530 | llama.cpp 连接测试验证 | P1 | 🔲 | 30min | - | 需本地 llama-server 运行 |

---

## Phase 9: llama.cpp 本地模型运行能力（预估 3 天）

> 从"仅连接已运行的 LLM 服务"升级为"内置本地模型运行能力"，实现类似 LocalAI 的一键式体验。
> 详见: [docs/PHASE9_LOCAL_MODEL.md](docs/PHASE9_LOCAL_MODEL.md)

### 9.1 Rust 基础设施

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T600 | 新增 `src-tauri/src/model/` 模块结构 | P0 | ✅ | 30min | - | binary.rs / process.rs / download.rs / types.rs |
| T601 | 实现 llama.cpp 二进制下载与验证 | P0 | ✅ | 2h | - | GitHub Releases 自动下载，SHA256 校验 |
| T602 | 实现 llama-server 进程管理（启动/停止） | P0 | ✅ | 3h | - | 动态端口分配，健康检查，Drop 清理 |
| T603 | 实现 Tauri Commands（model.rs） | P0 | ✅ | 2h | - | ensure_binary/start_server/stop_server/get_server_status 等 |
| T604 | 新增 `AppState.llama_process` 全局状态 | P0 | ✅ | 30min | - | Arc<Mutex<Option<LlamaProcess>>> |
| T605 | 应用退出自动清理进程 | P0 | ✅ | 1h | - | on_window_event + Drop 双保险 |
| T606 | 新增 `models` 数据库表 | P0 | ✅ | 30min | - | 跟踪已下载模型元数据 |

### 9.2 模型管理

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T610 | 预配置模型列表（Qwen3 4B/8B, Llama 3.2 3B） | P0 | ✅ | 1h | - | HuggingFace GGUF 直链 |
| T611 | 实现模型下载（带进度回调） | P0 | ✅ | 2h | - | reqwest 流式下载 + 进度事件 |
| T612 | 实现模型删除 | P1 | ✅ | 30min | - | 删除文件 + 数据库记录 |
| T613 | 实现模型列表查询 | P1 | ✅ | 30min | - | 已下载 + 可下载 |

### 9.3 前端 UI

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T620 | SettingsScreen 新增"本地模型"Tab | P0 | ✅ | 2h | - | 服务器状态 + 模型列表 + 下载进度 |
| T621 | 服务器状态指示器（运行中/已停止/错误） | P0 | ✅ | 1h | - | 红绿黄三色状态灯 |
| T622 | 模型下载进度 UI | P0 | ✅ | 1h | - | 进度条 + 速度 + 剩余时间 |
| T623 | GPU 层数滑块配置 | P1 | ✅ | 30min | - | 0=纯CPU, 999=全部GPU |
| T624 | 前端 store 扩展（LocalModelState） | P0 | ✅ | 1h | - | isServerRunning/downloadProgress 等 |

### 9.4 集成与测试

| # | 任务 | 优先级 | 状态 | 预估 | 实际 | 备注 |
|---|------|--------|------|------|------|------|
| T630 | LLM 客户端适配（自动获取内部端口） | P0 | ✅ | 1h | - | llamacpp_local 模式 |
| T631 | 新增 `llamacpp_local` 预设提供商 | P0 | ✅ | 15min | - | 自动路由到内部端口 |
| T632 | CSP 配置更新（huggingface.co） | P0 | ✅ | 15min | - | tauri.conf.json |
| T633 | Web 模式兼容（本地代理） | P2 | ✅ | 2h | - | 可选的 localhost:18888 代理 |
| T634 | 端到端流程测试 | P1 | ✅ | 2h | - | 下载→启动→对话→停止 |

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
│       └── T050-T052 单元测试 ✅（vitest 25 tests）
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
Phase 5 (数据与配置) ✅ 100%
├── T180-T184 世界观数据 ← Phase 1 ✅（T181 可选暂停）
│   ├── T190-T192 系统方案模板 ✅
│   ├── T195-T201 设置界面（LLM/高级/数据/关于） ✅
│   ├── T210-T220 世界观管理（列表/新建/编辑/导入/导出/Rust commands） ✅（T217 P2 可选）
│   └── T230-T240 本地数据管理（备份/恢复/会话管理/全量导入导出/Rust commands） ✅（T238/T239 已实现）

Phase 6 (测试与打包) ~90%
├── T300-T312 测试 ← Phase 2-5（TS 测试 ✅ 265 tests / 本地 mock 集成 ✅ / Rust 测试 ✅ 45 tests / 真实云端 smoke 需受保护手动工作流）
│   └── T320-T325 打包（图标 ✅ / Linux .deb+.rpm ✅ / Windows CI/CD ✅ / macOS CI/CD ✅ / 产物验证 ✅）

Phase 7 (传记生成改进) ✅ 100%
├── T400-T403 类型 + 引擎（EndReason + 结束原因记录） ✅
│   ├── T410-T413 状态管理（endGame 拆分 + showConfirmBio + skipBiography） ✅
│   ├── T420-T422 提示词模板（isComplete 参数 + 未完待续指令） ✅
│   └── T430-T432 UI 流程（两步确认 + 文案区分 + i18n） ✅

Phase 8 (llama.cpp 本地模型支持) ✅ 100%
├── T500-T502 类型 + 配置（新增 llamacpp preset） ✅
│   ├── T510 LLM 客户端空 apiKey 处理 ✅
│   ├── T520 SettingsScreen UI 新增选项 ✅
│   └── T521 API Key 输入框优化 ✅ 自动显示"无需 API Key"提示

Phase 9 (llama.cpp 本地模型运行能力) ✅ 100%
├── T600-T606 Rust 基础设施（二进制/进程/状态管理） ← Phase 8 ✅
│   ├── T610-T613 模型管理（下载/删除/列表） ← T600 ✅
│   ├── T620-T624 前端 UI（Tab/状态/进度/GPU配置） ← T610 ✅
│   └── T630-T634 集成与测试（LLM适配/CSP/Web兼容） ← T620 ✅
```

> **注**: 
> - Phase 8 剩余 1 项集成测试（T530）待完成
> - Phase 9 为全新功能设计，详见 `docs/PHASE9_LOCAL_MODEL.md`
> - Phase 10 Base URL 传输安全与问答流显示修正已完成；265 项前端测试、66.79% 全局行覆盖率及稳定/实验前端与 Tauri 无打包构建门禁通过，上一轮 45 项 Rust 测试结果保持有效
