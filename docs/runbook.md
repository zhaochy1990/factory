# Runbook · 底座搭建与日常操作（#635）

架构与决策见 [ADR-0001](adr/0001-poc-base-openclaw-wecom-claude-cli.md)。

## 首次搭建

```bash
scripts/gen-env.sh        # 生成 .env（GLM 配置自动从 ~/.claude/settings.json 同步；gh token 自动取）
scripts/up.sh             # 构建镜像 + 起网关 + 健康检查（http://127.0.0.1:18789/healthz）
scripts/smoke-glm.sh      # ★ T4 第一验证项：容器内 claude-cli 连 GLM（输出 GLM_OK 即通过）
scripts/apply-config.sh   # 应用种子配置（三 agent 花名册 / claude-cli 引擎 / 配对码 / 禁群聊）
```

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
