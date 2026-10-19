# Runbook · 底座搭建与日常操作（#635）

架构与决策见 [ADR-0001](adr/0001-poc-base-openclaw-wecom-claude-cli.md)。

## 首次搭建

```bash
scripts/gen-env.sh        # 生成 .env（GLM 配置自动从 ~/.claude/settings.json 同步；gh token 自动取）
scripts/up.sh             # 构建镜像 + 起网关 + 健康检查（http://127.0.0.1:18789/healthz）
# 全新状态卷时网关会因 gateway.mode 未设而阻塞，停机直改配置文件再启动：
docker compose stop openclaw-gateway
docker compose run --rm --no-deps --entrypoint sh openclaw-gateway -c \
  'python3 -c "import json;p=\"/home/node/.openclaw/openclaw.json\";c=json.load(open(p));c[\"gateway\"]={\"mode\":\"local\",\"bind\":\"0.0.0.0\"};json.dump(c,open(p,\"w\"),indent=2)"'
docker compose start openclaw-gateway
scripts/smoke-glm.sh      # ★ T4 第一验证项：容器内 claude-cli 连 GLM（输出 GLM_OK 即通过）
docker compose exec openclaw-gateway openclaw plugins install @wecom/wecom-openclaw-plugin
scripts/apply-config.sh   # 应用种子配置（三 agent 花名册 / claude-cli 引擎 / wecom 路由→lily / 配对码 / 禁群聊）
```

## 实测踩坑（2026-10-19 首次拉通，血泪版）

- **Dockerfile 三坑**：基础镜像 npm ≥11.16 的 allowScripts 白名单会拦 claude-code postinstall（须 `--allow-scripts=@anthropic-ai/claude-code`）；`WORKDIR` 勿动（入口相对路径 `openclaw.mjs`，原始值 `/app`）；git/gh 用 `apt-get || apk` 双兜底。
- **config 写入必须在网关容器内**（`docker compose exec`）：CLI 单独容器 PID 命名空间不同，共享状态所有权校验直接拒绝；compose 里 openclaw-cli 服务已加 `pid: service:openclaw-gateway`。
- **状态库被「离线维护」卡死时**：停网关 → `docker compose run --rm --no-deps --entrypoint node openclaw-gateway dist/index.js doctor --fix` → 再启动。
- **本版（2026.10.5）agents 是 `agents.entries` 按 id 的 map**（不是文档的 `agents.list` 数组）；entry 上的 `default` 是 legacy 标记会被校验拒写——用 **bindings 显式路由**（wecom→lily）替代默认 agent 机制；替换 entries 会触发「丢 main」守卫，`scripts/apply-config.sh` 做合并（main 保留）。
- **`config set --batch-file` 吃纯 JSON 数组**（`[{path,value}]`），不吃 JSON5 注释、不吃整份配置对象。
- **channels.wecom 在插件安装前是 unknown channel**，先装插件再应用种子。
- claude-cli 对 `glm-5.3-flash` 报 unrecognized model（上下文窗口按 200k 兜底）——无害告警，POC 忽略。

## 企业微信接入（需要超管手工步骤）

1. 手机/网页企业微信管理后台 → **智能化专区 → 智能机器人** → 创建机器人（**必须超管账号**，非超管的加密 userid 会破坏 bindings 路由）。
2. 机器人配置页开启 **API 模式 → 长连接**，取得 **BotID** 与 **Secret**。
3. 填入 `.env` 的 `WECOM_BOT_ID` / `WECOM_BOT_SECRET`，然后：

```bash
scripts/configure-wecom.sh
```

4. 手机企业微信「通讯录 → 智能机器人」找到机器人发第一条消息 → 按提示走**配对码**：

```bash
docker compose run --rm --no-deps openclaw-cli pairing approve wecom <CODE>
```

## 日常

```bash
docker compose logs openclaw-gateway --tail 50   # 看日志
docker compose run --rm --no-deps openclaw-cli <命令>  # 任意 openclaw CLI
docker compose run --rm --no-deps openclaw-cli dashboard --no-open  # 控制台 URL
scripts/up.sh    # 重启/升级后拉起（保留 openclaw-state 卷）
```

## 已知约束（全部来自实证，动前先读）

- **版本锁定**：升级 = 换镜像 tag + `docker compose build`；wecom 插件与内核版本强耦合（兼容表：内核 ≥2026.3.22 → 插件 ≥2026.3.24），升级前查插件 releases，**勿开自动升级**。
- **Mac 勿休眠**：每机器人仅 1 条 WSS 长连接，休眠断连、新连顶旧连。
- **24h 窗口**：Lily 只能在你会话来消息后 24h 内主动推送；窗口外攒摘要补报（Lily 契约已内置）。
- **密钥**：一切在 `.env`（600 权限、gitignore）；GLM key 源头是本机 `~/.claude/settings.json`。
- **持久化**：`openclaw-state` 卷 = /home/node/.openclaw（会话/配置/凭证）；迁移到云 = 换机器 + 挂同一卷数据 + 重配 DNS。
- **安全**：宿主端口仅 `127.0.0.1:18789`；Gateway 永不暴露公网（ADR-0001）。

## 尚待实测核对（首次跑通时逐项确认）

- [ ] `openclaw.seed.json5` 各键名与当前版本一致（`openclaw config get` 对照）
- [ ] agents `model` 引用串（sonnet/haiku 档位名）随 env 映射生效到 glm-5.3 / glm-5.3-flash
- [ ] `~/.claude/skills` 只读挂载后 claude-cli 能发现 skills（my-workflow 等）
- [ ] GH_TOKEN 在容器内 gh 可用；agents 的 git 署名（config/gitconfig）生效
- [ ] wecom 插件 Bot 模式流式回复在手机端体验
- **claude-cli backend 派生的 Claude Code 不继承容器 env**（报「Not logged in」）：凭证必须写进容器内 `~/.claude/settings.json`（与本机同构的原生方式），已挂 `claude-home` 持久卷 + `scripts/init-claude-auth.sh` 从 .env 同步（.env 改动后需重跑）。
- **运维纪律：Lily 回合中勿重启网关**（`docker compose exec openclaw-gateway openclaw agents list` 前先看有没有活回合）——重启会打断长回合触发 restart-recovery 重跑，恢复跑可能撑爆 CLI JSONL 20000 行上限（526s 后判死），把后续消息全堵在 lane 里。超长回合本身也是雷：已给 Lily 立「单回复 ≤300 字、长产出落票」规矩。
- **报错可见性**：`scripts/error-watchdog.sh`（nohup 常驻）盯网关日志，lane task error / cli terminal failure / fallback / start blocked / 配对请求 命中即推 CEO 企业微信（5 分钟防抖）。网关重启后需确认它还活着（`ps aux | grep error-watchdog`）。
- **种子配置不含 channels 段**（0630 事故：apply-config 用空凭证覆盖真实 botId/secret 导致通道消失、消息黑洞）——企业微信凭证唯一入口是 `scripts/configure-wecom.sh`。
