# harness/miniprogram — 微信小程序自动化样板（miniprogram-automator）

用官方 `miniprogram-automator` 连**本机微信开发者工具**的自动化端口，打开
running 仓小程序的本地 workspace 拷贝，对**本地真实全栈**跑「启动 → 首页渲染」。
无 mock：后端是 stride-devops/local 的 api-gateway（127.0.0.1:8082），断言靠
页面渲染 + console `[http]` 日志 + 模拟器截图。

## 为什么有个 .workspace 拷贝（而不是直接开 running 项目）

- running 仓对 harness **只读**，不能改；
- running 的 `constants/config.ts` 默认 `CURRENT_ENV = ENV.STAGING`（生产 API），
  本地 e2e 绝不能打生产；
- 小程序的 `.js` 是 gitignore 的编译产物，且正式构建走 `tsc`（stride-devops
  local README：用 `frontend/node_modules` 里的 tsc）。

所以 `prepare.sh`：rsync 源码到 `.workspace/`（gitignored）→ 只在拷贝里把
`CURRENT_ENV` 改成 `ENV.DEV` → 用 running/frontend 的 tsc 重编译。DevTools
打开的是这份拷贝，running 仓一个字节都不动。

## 用法

```bash
harness/stack/up.sh                                   # 1) 本地真实栈
harness/miniprogram/prepare.sh                        # 2) 构建 .workspace（ENV.DEV）
cd harness/miniprogram && npm install && npm test     # 3) 跑用例（launch DevTools）
```

结果写 `harness/results/miniprogram-results.json`（blocked/failed 也会写，
供报告生成器呈现）；截图在 `harness/miniprogram/test-results/`。

## 前置条件（缺一会被判定 blocked，不会卡死硬试）

1. **微信开发者工具**已装在 `/Applications/wechatwebdevtools.app`（本机已装）。
2. **服务端口已开启**：DevTools → 设置 → 安全设置 → 服务端口 开启
   （自动化 CLI 走它；端口即 `HARNESS_MP_AUTOMATOR_PORT`，默认 9420）。
   探测：`lsof -nP -iTCP:9420 -sTCP:LISTEN` 有监听即已开。
3. **DevTools 已扫码登录**（自动化命令需要登录态；未登录时 cli 会弹码等待）。
4. 项目 appid `wx001942f3d26787c2` 与本地栈 auth 已用
   `harness/stack/seed.sh --miniprogram-login` 注册（`enable-miniprogram-login.sh`
   需要 stride-devops/local/.env 里有 `WECHAT_MINIPROGRAM_APPID/_APP_SECRET`）。
   未注册时 wx.login 免密换 token 会失败 → 用例会落在 login 页（仍算渲染
   通过，但登录链路不算绿）。

## 已知坑

- **logger 不可依赖**：小程序 `utils/logger.ts` 走 `wx.getRealtimeLogManager`
  （微信实时日志），**只在正式/体验版生效，开发者工具里完全看不到**，API
  不可用时还静默降级——断言要看 `console.log`（`[http] →/←` 前缀）或页面
  data，不要等 logger。
- `automator.launch` 会复用已运行的 DevTools 实例并占用服务端口；结束用
  `disconnect()`（保留 IDE），别 `close()` 把用户开着的工具整个关掉。
- 模拟器里 `wx.login` 的 code 是真实的（依赖 DevTools 登录身份）；auth-backend
  做 code2session 需要能出网访问微信 API + 小程序 app 的 secret 配置正确。
- 首页判定集合 `{coach, login, onboarding}`：未绑定微信账号落在 login，
  免密成功但档案未填落在 onboarding——这三种都是真实启动路径，不是失败。
