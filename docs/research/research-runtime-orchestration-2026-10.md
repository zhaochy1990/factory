# 调研报告：coding agent 运行时与编排方案（2026-10-19）

> 为「AI 开发公司工作台」（CEO↔Lily CTO↔Dev/QA agents、多异构物理节点、手机入口、无 mock 真机 E2E）所做的选型调研。
> 由 wayfinder 建图会话的前置调研产出；建图后应链接到对应 research ticket。

## A. Coding Agent CLI 运行时查证

**1. Claude Code（Anthropic）**：存在且活跃。headless 打印模式（`claude -p`）、hooks、subagents、skills 均为官方特性（[SDK 总览](https://platform.claude.com/docs/en/cli-sdks-libraries/overview)、[Agent SDK 文档](https://code.claude.com/docs/en/agent-sdk/permissions)）；Agent SDK 有 [TypeScript](https://docs.claude.com/en/docs/claude-code/sdk/sdk-typescript) 与 [Python](https://github.com/anthropics/claude-agent-sdk-python)（SDK 本质是包装 Claude Code 二进制运行 agent loop）。2025 年起 Windows 原生支持（免 WSL，需 Git for Windows），三平台齐备（[官方 setup 文档](https://code.claude.com/docs/en/setup)）。计费：Pro/Max 订阅或 API 按量（也可走兼容端点）。关键点：**智谱官方提供 Anthropic 兼容接口，GLM Coding Plan 明确支持驱动 Claude Code**，配置方式即 `ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic` + 智谱 Key（[智谱官方接入文档](https://docs.bigmodel.cn/cn/guide/develop/claude)、[Claude API 兼容接口说明](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction)、[GLM Coding Plan 专页](https://bigmodel.cn/claude-code)）。

**2. Pi（badlogic/pi-mono，Mario Zechner）**：存在，极简 agent harness，仅 read/write/edit/bash 四工具，支持 extensions/skills/themes 与多种运行模式（[pi.dev](https://pi.dev)、[作者博客 2025-11](https://mariozechner.at/posts/2025-11-30-pi-coding-agent)）。provider 无关（15+ 提供商，[评测](https://petronellatech.com/blog/pi-dev-platform-review/)）；其 skills 与 Claude Code/Codex CLI 格式兼容（[作者 GitHub](https://github.com/badlogic)）。pi-sync 多机会话同步有提及但本次未直接证实细节（**未证实**）。

**3. OpenCode（sst）**：存在且活跃，client/server 架构（`opencode serve` 起 HTTP 服务，OpenAPI 规范，[server 文档](https://opencode.ai/docs/server)），官方 `@opencode/client` TS SDK（[SDK 文档](https://opencode.ai/docs/sdk)），75+ provider（[promptfoo 集成](https://www.promptfoo.dev/docs/providers/opencode-sdk)）。**直接读取 `.claude/skills/` 与 `~/.claude/skills/`，SKILL.md 格式与 Claude Code 完全兼容**（[skills 文档](https://opencode.ai/docs/skills)）。下载页提供 macOS/Windows(x64+ARM)/Linux 安装包（[下载页](https://opencode.ai/download)；注意终端文档同时提示需"现代终端模拟器"，Windows 终端体验弱于 mac/Linux）。社区反馈其 server/SDK 文档时有滞后（[Reddit](https://www.reddit.com/r/opencode/comments/1tkln6e/serverapisdk_rant)）。

**4. OpenAI Codex CLI / Google Gemini CLI**：Codex 有 `codex exec` 非交互模式与官方 GitHub Action（[官方文档](https://learn.chatgpt.com/docs/non-interactive-mode)、[codex-action](https://github.com/openai/codex-action)），主要绑定 OpenAI 账号（provider 不开放）。Gemini CLI 有 headless 模式可输出 JSON（[官方文档](https://google-gemini.github.io/gemini-cli/docs/cli/headless.html)）。

**5. 国产**：Qwen Code（阿里，fork 自 Gemini CLI，百炼 Coding Plan 有 china 区域，[阿里云文档](https://help.aliyun.com/zh/model-studio/qwen-code)）；iFlow CLI（阿里心流，融合 Claude Code 特性、开放平台免费模型，[GitHub](https://github.com/iflow-ai/iflow-cli/blob/main/README_CN.md)）；腾讯 CodeBuddy CLI 有**官方无头模式文档**，支持脚本/SDK/服务端集成（[codebuddy.cn/docs/cli/headless](https://www.codebuddy.cn/docs/cli/headless)）。

### 对比表

| 运行时 | 无头/SDK | 子代理/工具生态 | 三 OS | 国内可达 | 账号兼容 | License/成本 | CC skills 复用 |
|---|---|---|---|---|---|---|---|
| Claude Code | ★ -p + TS/Py SDK | ★ hooks/subagents/skills | Win/mac/Linux（Win 原生较新） | 可配 GLM 端点 | Anthropic；**GLM 官方兼容** | 订阅或 API；GLM 套餐低价 | 100% |
| OpenCode | ★ server+SDK 最适合分布式 | agent/plugin 生态 | 三平台（Win 终端体验一般） | 好（自选 provider） | 任意 provider（含 GLM/DeepSeek/Qwen） | 开源免费 | ★ 原生读 .claude/skills |
| Pi | 有多模式；SDK 较薄 | 精简，靠 extensions | mac/Linux 为主（Win 未证实） | 好 | 15+ provider，models.dev 元数据 | 开源免费 | 兼容 SKILL.md 格式 |
| Codex CLI | codex exec + Action | 中 | 三平台 | 差（OpenAI 账号） | OpenAI | 订阅/API | 不兼容 |
| Gemini CLI | headless JSON | MCP | 三平台 | 一般 | Google | 免费/按量 | 不兼容 |
| Qwen Code / iFlow / CodeBuddy | 有（-p / headless） | 中 | mac/Linux 为主 | ★ 国内最佳 | Qwen/iFlow/混元 | 免费~低价 | 部分（iFlow 对标 CC） |

## B. 编排系统查证

- **vibe-kanban（BloopAI）**：活跃，看板+worktree 本地并行编排，支持 Claude Code/Codex/Copilot/Gemini/Amp/Cursor/OpenCode/Droid/Qwen Code 等 10 种 agent（[GitHub](https://github.com/BloopAI/vibe-kanban)、[支持列表](https://vibekanban.com/docs/supported-coding-agents)）。**仅本地单机执行**（"Remote Access"只是远程访问 UI），GitHub 集成仅做 PR、不做 issues 同步（据 [docs/llms.txt](https://vibekanban.com/docs/llms.txt) 验证）→ 不满足多物理节点需求。
- **OpenHands**：活跃，Agent Canvas 定位"自托管常驻工程团队"、支持多 agent 并行（[GitHub](https://github.com/OpenHands/openhands)、[官网](https://www.openhands.dev)），但架构面向 Docker/云沙箱而非"异构裸机节点注册"，改造量大。
- **claude-squad**：tmux 会话管理多 agent 的本地工具（细节本次**未直接证实**，[awesome 列表](https://github.com/andyrewlee/awesome-agent-orchestrators)收录）。**Container Use（Dagger）**：MCP server，容器+worktree 隔离并行 agent、环境可持久化（[GitHub](https://github.com/dagger/container-use)、[InfoQ](https://www.infoq.com/news/2025/08/container-use)）——适合做 Dev agent 隔离层，非控制面。**Backlog.md**：Markdown 项目板、AI 一等公民（[GitHub](https://github.com/MrLesk/Backlog.md)），可当任务存储，非编排器。
- **Ruflo**：Claude Code/Codex 的多 agent harness（100+ agent/swarm/联邦跨机），增长极快（2026 年 ~53K–74K stars，[GitHub](https://github.com/ruvnet/ruflo)），功能爆炸但成熟度/文档质量存疑。
- **商用**：Devin（Cognition，2026-06 融资 $1B/估值 $26B）、GitHub Copilot coding agent（GitHub Actions 环境跑任务、assign issue 即开工）、Google Jules（[jules.google](https://jules.google)）、Factory droids（云+本地混合）（[2026 综述](https://resources.rework.com/tools/ai-agents/best-ai-coding-agents-2026)、[对比](https://macroscope.com/content/best-cloud-ai-coding-agents-2026)）——均无法在自有异构节点跑 QA、且国内付费/合规不便。
- 补充：**Claude Code 官方 Agent Teams**（一个 lead 会话协调多个 subagent 实例，[官方文档](https://code.claude.com/docs/en/agent-teams)）是"半现成"的单节点编排原语。

## C. 结论

**1. Runtime 首选：Claude Code（Agent SDK 驱动）+ GLM Coding Plan**。理由：`ANTHROPIC_BASE_URL` 指智谱兼容端点即可用现有 GLM 套餐（官方支持，国内直连）；headless + TS/Py SDK 是最成熟的编排入口；hooks/subagents/skills 生态最强，用户已有 skills（my-workflow 等）零成本复用；三 OS 支持。**备选：OpenCode**——`opencode serve` 的 server/SDK 架构天然适配"多节点各跑一个 server、控制面远程调用"，provider 完全无关（GLM/DeepSeek/Qwen 随意切换），且原生兼容 `~/.claude/skills`，是 GLM 政策变化时的 Plan B。国产 CLI（CodeBuddy/Qwen Code）可作为国内网络降级选项，但 skills/生态迁移有成本。

**2. 编排：无直接可用，需自建控制面**（vibe-kanban/OpenHands/Ruflo 均不满足"异构裸机节点 + 真机 QA + CEO 手机 IM"组合；可借鉴 vibe-kanban 的看板模型与 Container Use 的隔离）。最小架构组件：(1) CEO↔Lily 聊天桥（企业微信/微信 bot 或 Telegram，手机可达）；(2) Lily 控制面（Agent SDK 长驻进程，负责拆票/验收/合并）；(3) 任务源：GitHub Issues/Projects（天然是多节点共享状态）；(4) 节点 runner：各物理机一条命令启动的守护进程，向控制面注册能力标签（os/browser/miniprogram/device），长轮询/WebSocket 领任务，本地调 `claude -p`/Agent SDK；(5) Dev 隔离：git worktree（+可选 Container Use）；(6) QA 层：Playwright（浏览器）+ miniprogram-automator（小程序）+ Appium/maestro（手机 App）；(7) CI/CD：GitHub Actions。

**3. 风险与坑**：① Claude Code Windows 原生支持 2025 才落地，长尾 bug 多于 mac/Linux，建议 Win 节点预留 WSL 兜底；沙箱在 Windows 基本缺失（**未证实具体实现**），需依赖权限白名单+hook 审计；② GLM Anthropic 兼容端点对新版 Claude Code 特性（如新 tool 格式）可能有滞后，锁版本+灰度升级；③ GLM Coding Plan 有速率/用量上限，多 Dev 并发需监控与限流；④ 微信小程序 E2E 强依赖微信开发者工具，真机模式部分能力（wait/mock 等）官方明确不支持（[微信官方真机文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/remote.html)、[Mpx 文档](https://mpxjs.cn/guide/tool/e2e-test.html)），真机多机型覆盖需微信云测 MiniTest（[实践](https://juejin.cn/post/7661030491454898176)）；手机 App 无 mock E2E 需真机农场；⑤ 中国节点访问 GitHub/npm 需代理或镜像；⑥ CEO 用手机聊天需 IM 机器人长连接通道（企业微信回调或轮询），注意消息合规；⑦ token 成本随 QA agent 读长日志快速膨胀，需控制上下文与缓存。
