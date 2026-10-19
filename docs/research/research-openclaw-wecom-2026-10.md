# 调研报告：OpenClaw 通道与编排能力（2026-10-19）

> 为「Lily 工作台」POC 的消息入口层选型：OpenClaw vs 自建企业微信应用回调。由 wayfinder 建图会话前置调研产出。

## 1. 项目现状

- 仓库：[github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)，约 392k stars / 82.5k forks，11 万+ commits，活跃度极高。2025 年 11 月发布（前身 Clawdbot → Moltbot，作者 Peter Steinberger/@steipete）。
- 治理：已交由独立的 **OpenClaw Foundation（美国 501(c)(3) 非营利）** 管理，捐赠方含 Amazon、OpenAI、Red Hat 等，无付费层/托管服务。**License：MIT**。
- 版本采用日期制（如 `2026.3.28`），无传统语义化 release 号。

## 2. 消息通道（对 NAT 部署最关键）

官方 20+ 通道（[docs.openclaw.ai/channels](https://docs.openclaw.ai/channels)）：Telegram（内置、推荐首选）、WhatsApp、Discord、Slack、Signal、iMessage、Teams、Google Chat、Matrix、LINE、QQ bot、飞书 Feishu、SMS(Twilio)、WebChat（内置）等。

**微信/企业微信均支持，但为外部插件**：

- 微信：社区插件 `openclaw-weixin`（外部，未核实成熟度）。
- **企业微信：[WecomTeam/wecom-openclaw-plugin](https://github.com/WecomTeam/wecom-openclaw-plugin)——由企业微信团队自己开发维护的"官方"插件**。两种模式：
  - **Bot 模式（智能体机器人，默认）：`wss://openws.work.weixin.qq.com` WebSocket 长连接，仅需 botId+secret，无需公网 IP/域名——完美适配 NAT 后的 Mac**；
  - Agent 模式（对应自建应用）：HTTP webhook 回调（XML+AES），需要公网入口。
  - 要求 OpenClaw ≥ 2026.3.28，`npx -y @wecom/wecom-openclaw-cli install` 安装。支持文本/图/语音/文件、Markdown、流式回复、模板卡片、群聊白名单、多账号。

其他通道：Telegram bot 为出站长轮询/WS（无需公网）；Slack 支持 Socket Mode（无需公网）或 HTTP 回调；iMessage 走本地 stdio；Signal 走本地 signal-cli；Twilio SMS 需 webhook（需公网）。**中国大陆网络：Telegram/WhatsApp/Discord/Signal 均不可直连；企业微信/微信/QQ/飞书正常可达。**

官方 iOS/Android App（2026-06 发布）扫码配对连接自建 Gateway，走私有 relay（[docs.openclaw.ai/platforms/ios](https://docs.openclaw.ai/platforms/ios)）；国内可达性未证实。

## 3. Agent 运行时

- **可插拔 harness 架构**（[agent runtimes](https://docs.openclaw.ai/concepts/agent-runtimes)）：内置自研 agent loop，另有插件 harness（codex/copilot/muse）；**CLI backends 可跑外部 CLI 进程（`claude-cli`、`opencode`）**（[docs.openclaw.ai/gateway/cli-backends](https://docs.openclaw.ai/gateway/cli-backends)）；**ACP agents** 可经 Agent Client Protocol 接 Claude Code、OpenCode、Gemini CLI、Cursor 等（[docs.openclaw.ai/tools/acp-agents](https://docs.openclaw.ai/tools/acp-agents)）→ **作为薄网关驱动 `claude -p`/`opencode` 完全可行**。
- **模型**：provider 目录含 Anthropic、OpenAI、国产厂商及 **Z.AI (GLM) 官方 provider**（[docs.openclaw.ai/providers/zai](https://docs.openclaw.ai/providers/zai)）：`@openclaw/zai-provider` 插件 + `ZAI_API_KEY`，`zai/glm-5.3` 为 Coding Plan 默认，走 OpenAI 兼容端点（可自定义 baseUrl）。Anthropic 兼容端点未作为官方方式文档化（理论上可改 baseUrl，未证实）。子进程跑 Claude Code 时模型由 CLI 自身经 Anthropic 兼容端点连 GLM，与 OpenClaw 无关。
- **多 agent**：`agents.entries` 定义多 agent（各自 workspace、`AGENTS.md/SOUL.md` 人格、独立模型、独立 sqlite 会话库），`bindings` 将「通道+账号+对话 peer」路由到指定 agent；`agents team create` 一键建 coordinator/researcher 等团队（[multi-agent 文档](https://docs.openclaw.ai/concepts/multi-agent)）。**子 agent 派生**：`subagents.allowAgents` + `delegationMode`，`tools.agentToAgent` 控制互访，sandbox 可按 agent 容器隔离。→ **「Lily 拆票派 dev/QA」编排可行**。

## 4. 扩展能力

Skills ✓；**cron/Automations**（持久化任务、定时唤醒、结果投递到聊天通道）✓；多会话+每 agent SQLite 持久记忆 ✓；Web Control UI 管理界面 + WebChat ✓。

## 5. 安全事件与基线

2026 年 1 月底爆发公网暴露浪潮：Censys 追踪实例一周内从约 1,000 涨至 21,000+；多家安全厂商披露漏洞（含 1-click RCE 演示），社区出现 900+ 恶意 skills；2026.1.29 版修复。现行基线（[docs.openclaw.ai/gateway/security](https://docs.openclaw.ai/gateway/security)）：Gateway 默认仅绑 loopback、未知 DM 需配对码、群组 allowlist、`openclaw security audit` 自检；核心信任模型"一 Gateway 一信任边界"，不适合多租户对抗场景。**教训：绝不把 Gateway 端口暴露公网即可规避主要攻击面。**

## 6. 替代品速览

NanoClaw（主打安全）、ZeroClaw（Rust 轻量）、PicoClaw、Hermes Agent、OpenFang、Nanobot、memU（记忆）；Microsoft Scout 企业网关（宣布中）。均远小于 OpenClaw 生态，且**无一有企业微信官方插件**。

## 结论

**不需要为 OpenClaw 换通道**：企业微信通道已由企业微信团队官方提供插件，Bot 模式长连接免公网免穿透，比自建回调（必须公网入口）更贴合 Mac NAT 部署约束；「Lily 派活给 dev/QA 子进程」恰是 OpenClaw 多 agent + CLI/ACP backend 的强项。

**推荐路径**：Mac 上装 OpenClaw（Gateway 只绑 loopback）→ 装 WeCom 插件 Bot 模式 → 建 Lily 主 agent + dev/qa agent（bindings 路由、subagents 派生，干活交给 `claude-cli` backend 连 GLM Anthropic 端点）。自建回调仅在「必须用自建应用（通讯录、审批、应用内工作台）」时才有不可替代性；Bot 模式不够再补 Agent 模式（需公网中转）。

**风险**：插件较新（2026.3 后）；Bot 模式≠自建应用，消息能力与可见范围有差异（需实测：单聊/群聊可见性、卡片能力、配额）；需盯 OpenClaw 安全更新、Gateway 永不暴露公网。
