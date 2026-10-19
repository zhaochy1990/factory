# Factory（Lily 工作台）

AI 开发公司编排系统的 POC：CEO 只与 CTO agent 对话，CTO 编排 dev/qa coding agent 完成 设计→开票→开发→测试→验收 全闭环。设计与任务地图在 stride-devops#630（project:factory）。

## Language

**Lily**:
CTO agent，CEO 的唯一对话入口：brainstorm、产品文档、架构决策请批准、开票拆解、派活、验收（review PR 与测试报告）、合并、CI/CD 汇报。
_Avoid_: 助手、客服

**Dev / QA**:
干活的 coding agent（POC 各 1 个：dev1/qa1）。Dev 用 my-workflow 领票开发出 PR；QA 做无 mock 真实 E2E 并出测试报告。
_Avoid_: 员工、机器人

**Gateway（网关）**:
OpenClaw 常驻进程：持有企业微信长连接、按 bindings 路由会话、管理 agent 会话记账。

**Bot 模式**:
企业微信「智能体机器人」+ WSS 长连接的接入方式，免公网。
_Avoid_: 与 Agent 模式（自建应用回调，需公网）混称

**bindings**:
网关的路由规则——哪个聊天会话（通道 + peer）交给哪个 agent 处理。

**CLI backend**:
网关把回合交给外部 CLI 进程（claude-cli）执行的引擎形态；本仓三 agent 统一此引擎。

**配对码（pairing）**:
私聊准入机制：首次对话输一次性配对码，之后锁定会话。

**工作台**:
本系统整体。
_Avoid_: 平台（留给二期通用化再改称）
