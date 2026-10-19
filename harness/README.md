# harness — qa1 的本地真实栈 E2E harness（POC）

浏览器（Playwright）+ 微信小程序模拟器（miniprogram-automator）对**本地真实
全栈**（真实 Go 后端 + 真实 MySQL/Redis/RabbitMQ，docker compose 起、ACR 钉定
镜像）做无 mock E2E；断言直查库；结果渲染成 qa1 Markdown 报告。

```
harness/
├── run.sh          ← 一条命令全绿（起栈 → 浏览器用例 → 报告）
├── stack/          本地栈薄封装（up/down/seed/mysql；真配方在 stride-devops/local）
├── browser/        Playwright 样板：admin 真实登录 + 直查 MySQL 会话断言
├── miniprogram/    小程序自动化样板：.workspace 拷贝 + automator 启动→首页渲染
├── report/         报告生成器（generate.mjs）+ 模板（template.md）
└── results/        结果 JSON + 生成的报告（gitignored）
```

## 一条命令

```bash
source ~/.nvm/nvm.sh && nvm use 24   # host 默认 node16 太老，用 nvm 24
harness/run.sh                       # 栈 + 浏览器用例 + 报告（目标：全绿）
harness/run.sh --with-mp             # 加跑小程序（需要 DevTools 服务端口，见下）
```

产物：`harness/results/report-<时间戳>.md`（结论 / 环境+无 mock checklist 五项 /
用例明细（名称|步骤|期望|实际|证据）/ 回归冒烟 / 建议）。

## 前置条件

- **nvm node 24**（harness 依赖较新 node；host 默认 v16 跑不动）
- **Docker Desktop**，且已 `docker login crpi-…aliyuncs.com`（ACR 私库镜像）
- stride-devops / running 两仓在本机（`STRIDE_DEVOPS_DIR` / `RUNNING_DIR` 可覆盖，
  默认 `../stride/{stride-devops,running}`，相对 factory 仓）
- 小程序用例另需：微信开发者工具已装 + 已扫码登录 + 「设置 → 安全设置 →
  服务端口」已开（默认自动化端口 9420）；未开会判 **blocked** 而非挂死，
  手动开启步骤见 `miniprogram/README.md`

## 用例清单（样板即契约）

| ID | 面 | 用例 | 断言 |
|---|---|---|---|
| B1 | browser | 管理员表单登录 → 总览主页 | URL 跳 `/`、总览标题、真实 `/api/auth/login` 200、截图 |
| B2 | browser | 登录会话直查 MySQL | `auth_users` 种子管理员 + `auth_refresh_tokens` 本次登录新增未吊销行 |
| M1 | miniprogram | 启动 → 首页渲染（本地栈） | 页面 ∈ {coach,login,onboarding}、根节点渲染、`[http]` 日志全打 127.0.0.1:8082 且零生产域名、模拟器截图 |

## 已知坑（速查，详见各子目录 README）

1. **本地测试 DSN 是 3308 不是 3306**（本机另一 compose 栈占了 3306；
   `stride-devops/local/.env: MYSQL_HOST_PORT=3308`）。harness 一律从
   `local/.env` 读端口/凭据（`stack/env.sh`），测试里不硬编码。
2. **stride-coach-api 宿主端口 18888**（8888 被本机 Java 进程占用）。
3. **裸 `docker compose` 会缺 `*_IMAGE_TAG`**——compose 不自动加载共享钉定清单
   `stride-devops/../versions.env`，走 `stack/env.sh` 的 `stack_compose`。
4. **auth 登录全局限流 20 次/60s**（docker 网络无客户端 IP）——一条链路一次
   真登录；反复重跑测试可能撞限流，等 1 分钟即可。
5. **小程序 logger 不可依赖**：`wx.getRealtimeLogManager` 只在线上/体验版生效、
   工具里不可见、不可用时静默降级——断言走 console `[http]` 日志/页面 data。
6. **running 仓只读**：小程序本地 e2e 用 `.workspace` 拷贝（`prepare.sh` 里
   rsync + 仅在拷贝上把 `CURRENT_ENV` 切 `ENV.DEV` + tsc 重编译），running 仓
   一个字节不动；`.js` 是 gitignore 编译产物，别提交。
7. **镜像 client id 烤死在 SPA bundle 里**：bootstrap 已把 admin-dashboard 的
   烤死 id 注册进 auth 库并回写 `local/.env`（harness 经
   `HARNESS_ADMIN_DASHBOARD_CLIENT_ID` 透传给登录用例）。

## 与 qa1 的对接

qa1 对 PR 分支跑回归 = 同一条命令（PR 分支代码经 running 仓构建镜像后起栈，
或经 `docker-compose.override.yml` 换本地镜像——栈配方归 stride-devops 管）。
用例结果 JSON（`results/*.json`）与报告模板都在仓里，qa1 报告格式以
`report/template.md` 为准。
