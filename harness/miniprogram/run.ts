// harness/miniprogram/run.ts — miniprogram-automator 样板用例.
//
// 连本机微信开发者工具（自动化端口），打开 prepare.sh 生成的 .workspace
// 项目（ENV.DEV → 本地栈 api-gateway :8082），跑「启动 → 首页渲染」一条
// 真实用例：无 mock，后端 = 本地真实全栈；证据 = 模拟器截图 + console
// `[http]` 日志（证明请求打的是 127.0.0.1:8082，且零生产域名）。
//
// 输出 ../results/miniprogram-results.json 供 harness/report/generate.mjs 汇总。
//
// 前置条件（见 harness/miniprogram/README.md）：
//   * 微信开发者工具已安装且「设置 → 安全设置 → 服务端口」已开启
//   * DevTools 已登录（扫码）——自动化 CLI 需要登录态
//   * 本地栈已起（harness/stack/up.sh），.workspace 已构建（prepare.sh）
import automator from 'miniprogram-automator';
import fs from 'node:fs';
import path from 'node:path';

const WS = path.resolve(__dirname, '.workspace');
const RESULTS = path.resolve(__dirname, '../results/miniprogram-results.json');
const SHOT_DIR = path.resolve(__dirname, 'test-results');

const CLI_PATH =
  process.env.HARNESS_MP_CLI_PATH ||
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const PORT = Number(process.env.HARNESS_MP_AUTOMATOR_PORT || 9420);

// 启动后允许落在的页面：微信免密登录成功 → 教练首页；未绑定 → 登录页；
// 已绑定但档案未填 → onboarding。三者都算「正常渲染」，白屏/卡死才算挂。
const OK_PATHS = new Set([
  'pages/coach/coach',
  'pages/login/login',
  'pages/onboarding/onboarding',
]);

interface CaseResult {
  name: string;
  status: 'passed' | 'failed' | 'blocked';
  steps: string;
  expected: string;
  actual: string;
  evidence: string;
  error?: string;
  durationMs: number;
}

const startedAt = new Date().toISOString();

async function main(): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });

  const cases: CaseResult[] = [];
  const consoleLines: string[] = [];

  let mp: import('miniprogram-automator').MiniProgram | null = null;
  const t0 = Date.now();
  let blocked: string | null = null;

  try {
    if (!fs.existsSync(path.join(WS, 'project.config.json'))) {
      throw new Error(`workspace 未构建：${WS} 缺 project.config.json — 先跑 harness/miniprogram/prepare.sh`);
    }
    // automator.launch: 通过 DevTools CLI 打开 workspace 项目并接管自动化端口。
    mp = await automator.launch({
      cliPath: CLI_PATH,
      projectPath: WS,
      port: PORT,
      timeout: 60_000,
    });
  } catch (err) {
    blocked = `automator.launch 失败：${(err as Error).message}`;
  }

  if (!mp) {
    cases.push({
      name: 'M1 启动 → 首页渲染（本地栈）',
      status: 'blocked',
      steps: 'automator.launch(cli, .workspace, port ' + PORT + ') → 等 entry page 渲染 → 断言页面/网络',
      expected: 'DevTools 模拟器打开小程序，首页（coach/login/onboarding 之一）渲染，HTTP 全部打 127.0.0.1:8082',
      actual: '未执行（自动化未连通）',
      evidence: '—',
      error: blocked ?? 'unknown',
      durationMs: Date.now() - t0,
    });
    writeResults({ suite: 'qa-harness/miniprogram', startedAt, finishedAt: new Date().toISOString(), cases });
    console.error(`[mp] BLOCKED: ${blocked}`);
    console.error('[mp] 手动开启步骤：微信开发者工具 → 设置 → 安全设置 → 开启「服务端口」；并确保 DevTools 已扫码登录。');
    process.exitCode = 2; // blocked ≠ failed：报告里单独呈现
    return;
  }

  try {
    mp.on('console', (msg) => {
      const line = typeof msg.args?.[1] === 'string' ? `${msg.args?.[0]} ${msg.args[1]}` : String(msg.args?.[0] ?? '');
      consoleLines.push(line);
    });
  } catch (e) {
    consoleLines.push(`(console 订阅失败: ${(e as Error).message})`);
  }

  // ---- M1: 启动 → 首页渲染 -------------------------------------------------
  const m1start = Date.now();
  let page: import('miniprogram-automator').Page | null = null;
  try {
    // 轮询页面栈直到 entry page 出现（DevTools 编译 + 冷启动要几秒）
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      page = await mp.currentPage().catch(() => null);
      if (page && OK_PATHS.has(page.path)) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    if (!page || !OK_PATHS.has(page.path)) {
      throw new Error(
        page ? `45s 内页面停在 ${page.path}（不在预期集合，疑似白屏/卡启动）` : '45s 内未取到当前页面（模拟器未完成启动）',
      );
    }

    // 页面有真实渲染内容（根节点 + 标题文案）
    let rendered = '';
    if (page.path === 'pages/coach/coach') {
      const title = await page.$('.top-bar__title');
      rendered = title ? (await title.text()) || '(空)' : '';
      if (!rendered) throw new Error('coach 页根节点 .top-bar__title 未渲染');
    } else if (page.path === 'pages/login/login') {
      const title = await page.$('.login-title');
      rendered = title ? (await title.text()) || '(空)' : '';
      if (!rendered) throw new Error('login 页 .login-title 未渲染');
    } else {
      const root = await page.$('view');
      if (!root) throw new Error('onboarding 页无 view 渲染');
      rendered = 'onboarding 根节点已渲染';
    }

    // 网络证据：小程序真实发起过 HTTP；全部打本地栈，零生产域名
    await new Promise((r) => setTimeout(r, 2_000)); // 给 [http] ← 响应日志一点时间
    const httpLines = consoleLines.filter((l) => l.includes('[http]'));
    const localHits = httpLines.filter((l) => l.includes('127.0.0.1:8082'));
    const prodHits = httpLines.filter((l) => l.includes('stride-running.cn'));
    if (httpLines.length === 0) {
      throw new Error('console 未见任何 [http] 日志 — 小程序没有发起真实网络请求');
    }
    if (prodHits.length > 0) {
      throw new Error(`检测到生产域名请求（禁止）: ${prodHits.slice(0, 3).join(' | ')}`);
    }
    if (localHits.length === 0) {
      throw new Error(`[http] 日志存在但没有一条打 127.0.0.1:8082（ENV 指错？）: ${httpLines.slice(0, 3).join(' | ')}`);
    }

    const shot = path.join(SHOT_DIR, 'm1-home.png');
    await mp.screenshot({ path: shot }).catch((e: Error) => {
      consoleLines.push(`(截图失败: ${e.message})`);
    });

    cases.push({
      name: 'M1 启动 → 首页渲染（本地栈）',
      status: 'passed',
      steps: 'automator.launch(.workspace) → 等首页渲染 → 断言页面路径+根节点 → 校验 [http] 日志全部打 127.0.0.1:8082 → 截图',
      expected: '页面 ∈ {coach,login,onboarding}；根节点渲染；HTTP 打本地 api-gateway 且零生产域名',
      actual: `page=${page.path}；rendered="${rendered}"；[http]×${httpLines.length}（本地 ${localHits.length} / 生产 0）`,
      evidence: `${path.relative(path.resolve(__dirname, '../..'), shot)}；console [http] 首条: ${localHits[0]?.slice(0, 120) ?? ''}`,
      durationMs: Date.now() - m1start,
    });
  } catch (err) {
    const shot = path.join(SHOT_DIR, 'm1-failure.png');
    await mp.screenshot({ path: shot }).catch(() => undefined);
    cases.push({
      name: 'M1 启动 → 首页渲染（本地栈）',
      status: 'failed',
      steps: 'automator.launch(.workspace) → 等首页渲染 → 断言页面路径+根节点 → 校验 [http] 日志 → 截图',
      expected: '页面 ∈ {coach,login,onboarding}；根节点渲染；HTTP 打本地 api-gateway 且零生产域名',
      actual: page ? `停在 ${page.path}` : '未取到页面',
      evidence: `${path.relative(path.resolve(__dirname, '../..'), shot)}；console 尾部: ${consoleLines.slice(-5).join(' ⏎ ').slice(0, 400)}`,
      error: (err as Error).message,
      durationMs: Date.now() - m1start,
    });
    process.exitCode = 1;
  } finally {
    // 断开连接但保留 DevTools 运行（下次连更快）；不要 close() 整个 IDE。
    await mp.disconnect().catch(() => undefined);
  }

  writeResults({ suite: 'qa-harness/miniprogram', startedAt, finishedAt: new Date().toISOString(), cases });
}

function writeResults(payload: unknown): void {
  fs.writeFileSync(RESULTS, JSON.stringify(payload, null, 2));
  console.log(`[mp] results -> ${RESULTS}`);
}

main().catch((err) => {
  console.error('[mp] fatal:', err);
  process.exit(1);
});
