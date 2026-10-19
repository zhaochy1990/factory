# harness/stack — 本地真实全栈的薄封装

这里**没有任何被复制的 compose 配置**。真正的栈配方住在 stride-devops 仓
（对我们只读）：`local/docker-compose.yml`、`local/up.sh`、`local/scripts/*`。
本目录只做三件事：解析路径/端口/凭据（`env.sh`）、转发起停命令、转发种子脚本。

| 脚本 | 作用 | 背后调用的 stride-devops/local 现物 |
|---|---|---|
| `up.sh` | 起栈（首次自动 bootstrap：JWT 密钥+auth 种子+client id 捕获） | `scripts/bootstrap.sh` / `up.sh` |
| `down.sh` | 停栈（`-v` 连数据卷一起清） | `docker compose down`（自动 source `../versions.env`） |
| `seed.sh` | 种子数据（赛事中心 fixtures，幂等；`--miniprogram-login` 顺带注册小程序登录应用） | `scripts/seed-race-center.py` / `scripts/enable-miniprogram-login.sh` |
| `mysql.sh` | 对本地栈 MySQL 跑 SQL（stdin） | `docker exec local-mysql-1 mysql …` |

`env.sh` 同时导出测试要用的变量（`HARNESS_MYSQL_PORT`、`HARNESS_DASHBOARD_BASE_URL`
等），全部读自 `stride-devops/local/.env`——**不要在测试里硬编码端口/密码**。

## 本地栈已知坑（都会踩到的）

1. **MySQL 不在 3306，在 3308**——本机另一个 compose 栈占了 3306，
   `local/.env` 里 `MYSQL_HOST_PORT=3308`（容器侧仍是 3306）。直连 DSN：
   `mysql://auth:***@127.0.0.1:3308/auth`（stride / coach_agent 库同实例）。
2. **stride-coach-api 宿主端口是 18888 不是 8888**——本机 Java 进程占了 8888
   （`local/.env` 里 `COACH_API_HOST_PORT=18888`）。**stride-devops 自己的
   `up.sh` 把健康检查硬编码在 :8888**，所以它最后一步可能报
   `stride-coach-api FAILED health check` 并非零退出——栈其实全绿。harness 的
   `up.sh` 会容忍该误报并按真实端口（18888）复检（坑已记录，stride-devops
   对 harness 只读所以不改它）。
3. **裸 `docker compose` 会报 `STRIDE_WORKER_IMAGE_TAG is missing`**——compose
   只自动加载 `.env` 不加载共享钉定清单 `../versions.env`。要么先
   `set -a; . ../versions.env; set +a`，要么走本目录的 `stack_compose` /
   stride-devops 的 `up.sh`。
4. **auth 登录限流是全局 20 次/60s**（docker 网络解析不出客户端 IP，限流桶
   全栈共享）——测试要复用会话（浏览器一条链路内只登录一次），别每个断言
   都真登录一遍（stride-devops/test/fixtures.ts 的 file-backed session cache
   就是为此而生）。
5. **镜像全部来自 Aliyun ACR 私库**——首次拉取需要
   `docker login crpi-62dr2n7q1cuj1elz.cn-shanghai.personal.cr.aliyuncs.com`。
6. **admin-dashboard / stride-web 的 OAuth client id 烤死在镜像 JS 里**，
   bootstrap 会读出来注册进 auth 库并回写 `.env`（`AUTH_CLIENT_ID` /
   `ADMIN_DASHBOARD_CLIENT_ID`）。种子管理员：`admin@example.com / MyPassword1!`
   （bootstrap 默认，`ADMIN_EMAIL/ADMIN_PASSWORD` 可覆盖）。
7. **小程序 logger（`utils/logger.ts` → `wx.getRealtimeLogManager`）只在
   线上/体验版生效，开发者工具里完全看不到，且 API 不可用时静默降级**——
   小程序自动化断言别依赖 logger 输出，要看 console（`[http] →/←` 前缀）
   或页面 data。

种子账号/入口速查：

- admin-dashboard：<http://localhost:8081>（`admin@example.com` / `MyPassword1!`）
- auth-backend：<http://localhost:3001/health>；stride-api：<http://localhost:3000/health>
- api-gateway（生产 Caddy 的本地镜像，auth/api 分流）：<http://localhost:8082>
- RabbitMQ UI：<http://localhost:15672>（guest/guest）
