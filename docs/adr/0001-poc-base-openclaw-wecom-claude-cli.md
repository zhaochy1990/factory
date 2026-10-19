---
status: accepted
date: 2026-10-19
decided-by: devops#632
---

# 0001 · POC 底座：OpenClaw + 企业微信 Bot 模式 + claude-cli 引擎

CEO 只经企业微信与 CTO agent（Lily）对话，Lily 编排 dev1/qa1 两个 coding agent 干活（设计与任务地图 stride-devops#630，POC 切片 #602）。我们决定：消息与编排底座用 **OpenClaw**（自建控制面判定为重复造轮子）；企业微信接入用**官方插件的 Bot 模式**（WSS 长连接，免公网免穿透）；三个 agent（Lily/dev1/qa1）引擎统一用 **claude-cli backend 连 GLM 的 Anthropic 兼容端点**（Lily 强档、dev/qa flash 档，差异只在 env）；整体跑在本地 **Mac 的 Docker** 里。

## Considered Options

- **编排**：自建 Go/TS 控制面 + 企业微信自建应用回调——被拒：2026-10 调研（`docs/research/`）证实 OpenClaw 的多 agent / bindings / 委派 / CLI backend 已覆盖需求，而自建应用回调强制公网入口；商用 Devin/Factory 与开源 vibe-kanban / OpenHands / Ruflo 均不满足「异构节点 + 真机 QA + 国内 IM」。
- **Lily 引擎**：OpenClaw 内置 agent loop + 官方 zai provider——被拒：内置 loop 官方定位是「兼容兜底 runtime」；不能原生加载 Claude Code skills（Lily 第一份实战 #637 主持设计 grilling，依赖 wayfinder/grilling skills）；且 dev/qa 因 my-workflow 必须用 claude-cli，选内置会造成双引擎分裂。
- **部署**：Mac 本机直装——被拒（用户拍板 Docker：清理/删除干净，迁云=换机器跑镜像）。备选引擎 OpenCode 的接入路径为 **ACP 协议**（内置 CLI backend 只有 claude-cli 与 google-gemini-cli）。

## Consequences

- **版本组合锁定**：OpenClaw 与 wecom 插件按官方兼容表选配并锁死，关闭自动升级（#631 实证 2026.6→9.x 内核升级五次打断插件）。
- **企业微信侧**：机器人必须**超管账号**创建（非超管的加密 userid 会破坏 bindings 精确路由）；私聊准入=**配对码（pairing）**；**群聊 POC 禁用**（交互卡片/@成员是插件 open issue）。
- **主动性边界**：Bot 模式主动推送受「会话先有来消息 + 24h」窗口限制，POC 取**回应式汇报**口径；插件 cron 需 Agent 模式，二期再补。
- **T4 第一验证项**：claude-cli 子进程注入 GLM 端点 env（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`）的机制——优先实测容器 env 继承；不行则注册薄 CLI backend 插件传 env；最坏仅 Lily 降级 zai provider（dev/qa 不受影响）。
- **Docker 约束**：Claude Code 凭证与配置必须在**持久化容器 home 卷**内；每机器人仅 1 条 WSS 长连接，新连顶旧连（Mac 勿休眠）。
- **模型分层**：`config/models.yaml`（role→model 默认 + 任务级覆盖），经 env 注入 backend 进程；GLM key 走 `.credentials.local` 惯例，不进仓。
