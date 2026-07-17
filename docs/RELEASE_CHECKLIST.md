# Biography Desktop 发布验收清单

> 本清单用于公开稳定版。工作流配置通过不等于人工验收完成。

## 自动门禁

- [ ] npm、Tauri 与 Cargo 版本一致，标签为 `v<version>`。
- [ ] TypeScript、Vitest 覆盖率、Rust fmt/Clippy/tests 全部通过。
- [ ] Windows x64、macOS Intel、macOS Apple Silicon、Linux x64 四目标均生成产物。
- [ ] 稳定包仅开放 DeepSeek/OpenAI，实验 Rust commands 未注册。
- [ ] Release 在任一目标失败时不创建；签名凭据不足时只能生成 draft/prerelease。

## Windows 干净环境

- [ ] 在未安装开发工具的 Windows 10 和 Windows 11 虚拟机安装 NSIS `.exe`。
- [ ] SmartScreen/签名属性显示预期发布者，时间戳有效。
- [ ] 首次启动、Keyring、三次选择、关闭恢复、备份恢复、传记导出均成功。
- [ ] 从上一稳定版原位升级后会话与设置保持不变。
- [ ] 卸载后程序文件移除；用户数据仅在用户确认时删除。

## macOS 干净环境

- [ ] Intel 与 Apple Silicon 分别验证 `.dmg` 安装。
- [ ] `codesign --verify --deep --strict` 和 `spctl --assess` 通过。
- [ ] 公证 ticket stapled，首次启动不出现“无法验证开发者”。
- [ ] Keychain、三次选择、关闭恢复、备份恢复和导出均成功。
- [ ] 从上一稳定版升级后数据兼容。

## Linux 干净环境

- [ ] Ubuntu/Debian 验证 `.deb`，Fedora/RHEL 系验证 `.rpm`。
- [ ] 缺少 WebKit/系统依赖时安装器给出可理解诊断。
- [ ] SQLite、世界管理、备份恢复和导出均成功。

## 发布与回滚

- [ ] Release notes 明确隐私边界、模型提供商、破坏性变化和已知问题。
- [ ] GitHub Release 校验和与实际产物一致，下载链接可用。
- [ ] 应用“检查新版本”入口指向正确 Releases 页面。
- [ ] 保留上一稳定版安装包；发现数据损坏或启动阻塞时撤下 latest 并标记问题版本。
- [ ] 完成人工验收后才把 draft/prerelease 转为正式稳定版。
