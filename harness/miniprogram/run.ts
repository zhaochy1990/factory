// harness/miniprogram/run.ts — miniprogram-automator 样板用例.
//
// 连本机微信开发者工具（自动化端口），打开 prepare.sh 生成的 .workspace
// 项目（ENV.DEV → 本地栈 api-gateway :8082），跑「启动 → 首页渲染」一条
// 真实用例：无 mock，后端 = 本地真实全栈。
//
// 证据链（console 在本 DevTools 构建不回传，见 README 已知坑）：
//   * 免密登录成功 → 取存储 access_token，用本地栈 RS256 公钥验签（iss/aud/exp）
//   * 落在 login 页 → UI「获取验证码」→ 真实 sms/send → 直查 Redis
//
// 输出 ../results/miniprogram-results.json 供 harness/report/generate.mjs 汇总。
// 退出码：0 全绿 / 1 failed / 2 blocked（环境阻塞，非用例失败）。
//
// 前置条件（见 harness/miniprogram/README.md）：
//   * 微信开发者工具已安装且「设置 → 安全设置 → 服务端口」已开启、已扫码登录
//   * 本地栈已起（harness/stack/up.sh），.workspace 已构建（prepare.sh）
import automator from 'miniprogram-automator';
import { execFileSync } from 'node:child_process';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// 兼容补丁（协议本身没问题，只是版本门禁过时）：
// 本机 DevTools 2.02.2608040 的 Tool.getInfo 返回 {version}（无 SDKVersion 字段），
// miniprogram-automator 0.12.1 的 checkVersion 会对 undefined 做 .split 直接崩。
// 协议调用（Tool.getInfo/App.logAdded/page.$ 等）实测全部正常，这里把 checkVersion
// 换成 no-op（connect()/launch() 内部会调用它）。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MiniProgramMod = require('miniprogram-automator/out/MiniProgram').default as {
  prototype: { checkVersion: () => Promise<void> };
};
MiniProgramMod.prototype.checkVersion = async () => undefined;

const WS = path.resolve(__dirname, '.workspace');
const RESULTS = path.resolve(__dirname, '../results/miniprogram-results.json');
const SHOT_DIR = path.resolve(__dirname, 'test-results');

const CLI_PATH =
  process.env.HARNESS_MP_CLI_PATH ||
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
// 注意端口语义：9420 是 DevTools 固定的 IDE HTTP server 端口（websocket 连它吃
// 404）；自动化协议端口是 `cli auto --auto-port <N>` 指定的那个，首个可用习惯用
// 9421。connect 快路径默认试 9421；launch 冷启动路径让 automator 自己挑空闲端口。
const PORT = Number(process.env.HARNESS_MP_AUTOMATOR_PORT || 9421);

// 启动后允许落在的页面：微信免密登录成功 → 教练首页（或 onboarding）；未绑定 →
// 登录页。三者都算「正常渲染」，白屏/卡死才算挂。
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

// miniprogram-automator 的类型是各模块独立 default export，这里用最小结构化
// 接口（鸭子类型）引用，避免 import 包内部路径——只用我们确实调用的成员。
interface MpElement {
  text(): Promise<string>;
}
interface MpInput {
  input(value: string): Promise<void>;
}
interface MpTappable {
  tap(): Promise<void>;
}
interface MpPage {
  path: string;
  $(selector: string): Promise<MpElement | null>;
}
interface MpProgram {
  currentPage(): Promise<MpPage | undefined>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  screenshot(options?: { path?: string }): Promise<string | void>;
  disconnect(): void;
  reLaunch(url: string): Promise<unknown>;
  callWxMethod(method: string, ...args: unknown[]): Promise<unknown>;
}

// —— 直查 Redis（真实 SMS 验证码落库证明；栈里 redis 容器 local-redis-1）——
const REDIS_PASSWORD = process.env.HARNESS_REDIS_PASSWORD || 'redis_password';
function redisKeyExists(key: string): boolean {
  try {
    const out = execFileSync(
      'docker',
      ['exec', 'local-redis-1', 'redis-cli', '-a', REDIS_PASSWORD, '--no-auth-warning', 'EXISTS', key],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.trim() === '1';
  } catch {
    return false;
  }
}

// —— 免密登录成功的硬证据：取小程序存储里的 access_token，用本地栈的 RS256
// 公钥（stride-devops/local/keys/public.pem，签发者=本地 auth-backend）验签 +
// 校验 iss/aud/exp。伪造/生产 token 都过不了这一关。
const MP_CLIENT_ID = process.env.HARNESS_WECHAT_MINIPROGRAM_CLIENT_ID || '';
function verifyLocalJwt(token: string): { ok: boolean; detail: string } {
  try {
    const pubPath = path.join(process.env.STRIDE_DEVOPS_DIR || '', 'local', 'keys', 'public.pem');
    const pub = createPublicKey(fs.readFileSync(pubPath));
    const [h, p, s] = token.split('.');
    const okSig = cryptoVerify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, Buffer.from(s, 'base64url'));
    if (!okSig) return { ok: false, detail: 'RS256 验签失败（非本地 auth-backend 签发）' };
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (claims.iss !== 'auth-service') return { ok: false, detail: `iss=${claims.iss}` };
    if (MP_CLIENT_ID && claims.aud !== MP_CLIENT_ID) return { ok: false, detail: `aud=${claims.aud}` };
    if (Number(claims.exp) * 1000 < Date.now()) return { ok: false, detail: 'token 已过期' };
    return { ok: true, detail: `iss=${claims.iss} aud=${claims.aud} sub=${String(claims.sub).slice(0, 8)}… 验签通过` };
  } catch (e) {
    return { ok: false, detail: `验签异常: ${(e as Error).message}` };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const startedAt = new Date().toISOString();

// automator 的 Transport 对每条命令有内建超时，DevTools 正在重编译（如
// prepare.sh 改写 project.config.json 触发热重载）时会短暂不应答，拒绝可能以
// unhandledRejection 冒出来直接杀进程。兜住：记录、让用例层重试，不崩。
let transportGlitch: string | null = null;
process.on('unhandledRejection', (reason) => {
  transportGlitch = String(reason);
  console.error('[mp] unhandledRejection（已兜住）:', String(reason).slice(0, 200));
});

// —— attach：connect 快路径优先，launch 冷启动兜底 ---------------------------
async function attachMp(): Promise<{ mp: MpProgram; how: string }> {
  try {
    const mp = ((await automator.connect({
      wsEndpoint: `ws://127.0.0.1:${PORT}`,
    })) as unknown) as MpProgram;
    return { mp, how: `connect ws://127.0.0.1:${PORT}` };
  } catch {
    /* fallthrough to launch */
  }
  const mp = ((await automator.launch({
    cliPath: CLI_PATH,
    projectPath: WS,
    timeout: 90_000,
  })) as unknown) as MpProgram;
  return { mp, how: 'launch(cli auto)' };
}

// —— M1 用例体 ----------------------------------------------------------------
async function runM1(mp: MpProgram, attachHow: string, consoleLines: string[]): Promise<CaseResult> {
  const t0 = Date.now();
  let page: MpPage | undefined;
  const steps = `automator ${attachHow} → 等首页渲染 → 断言页面路径+根节点渲染 → 网络证据（免密成功：token 本地公钥 RS256 验签 / 落 login：UI 获取验证码→Redis 直查）→ 截图`;
  const expected = '页面 ∈ {coach,login,onboarding} 且根节点渲染；token 由本地 auth-backend 签发（或 sms/send 落 Redis）；零生产域名';
  try {
    // 轮询页面栈直到 entry page 出现（DevTools 编译 + 冷启动/重编译要几秒）
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      page = await Promise.resolve(mp.currentPage()).catch(() => undefined);
      if (page && OK_PATHS.has(page.path)) break;
      await sleep(1_000);
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

    // 网络证据（真实用户流，非 mock），两条路按落点自动选：
    //  a) coach/onboarding（免密登录成功）→ 取存储里的 access_token，用本地栈
    //     RS256 公钥验签 + iss/aud/exp 校验 —— 证明 token 确实是本地真实
    //     auth-backend 通过 wx.login token_exchange 签发的。
    //  b) login 页（未绑定/首次）→ 「获取验证码」→ 真实 POST /api/auth/sms/send
    //     （127.0.0.1:8082 → 本地栈；SMS 测试模式验证码固定 123456），
    //     副作用直查 Redis：sms:code:<phone>:bind_phone 必须出现。
    let trafficActual = `（本次落在 ${page.path}，未触发网络断言，仅断言渲染）`;
    if (page.path !== 'pages/login/login') {
      const token = String(
        await Promise.resolve(mp.callWxMethod('getStorageSync', 'access_token')).catch(() => ''),
      );
      if (!token) throw new Error('已进首页但存储里没有 access_token — 免密登录状态可疑');
      const v = verifyLocalJwt(token);
      if (!v.ok) throw new Error(`access_token 验签失败：${v.detail}`);
      trafficActual = `免密登录 token 经本地栈 RS256 公钥验签 ✓（${v.detail}）`;
    } else {
      const phone = '139' + String(Date.now()).slice(-8); // 唯一号码，避开 cooldown/日限
      const phoneInput = await page.$('.login-input-phone');
      if (!phoneInput) throw new Error('login 页未找到手机号输入框 .login-input-phone');
      await (phoneInput as unknown as MpInput).input(phone);
      const codeBtn = await page.$('.login-code-btn');
      if (!codeBtn) throw new Error('login 页未找到「获取验证码」按钮 .login-code-btn');
      await (codeBtn as unknown as MpTappable).tap();
      await sleep(4_000); // 等 UI → 本地栈往返
      const codeKey = `sms:code:${phone}:bind_phone`;
      const cooldownKey = `sms:cooldown:${phone}`;
      if (!redisKeyExists(codeKey)) {
        throw new Error(`点「获取验证码」后 Redis 未见 ${codeKey} — 小程序↔本地栈链路没打通`);
      }
      trafficActual = `UI 获取验证码(${phone}) → Redis sms:code:…:bind_phone ✓，cooldown ${redisKeyExists(cooldownKey) ? '✓' : '✗'}（真实 /api/auth/sms/send 已落库）`;
    }
    // 防御性：若 console 通道有回传（别的 DevTools 版本），不得出现生产域名
    const prodHits = consoleLines.filter((l) => l.includes('stride-running.cn'));
    if (prodHits.length > 0) {
      throw new Error(`检测到生产域名请求（禁止）: ${prodHits.slice(0, 3).join(' | ')}`);
    }

    const shot = path.join(SHOT_DIR, 'm1-home.png');
    await Promise.resolve(mp.screenshot({ path: shot })).catch((e: Error) => {
      consoleLines.push(`(截图失败: ${e.message})`);
    });

    return {
      name: 'M1 启动 → 首页渲染（本地栈）',
      status: 'passed',
      steps,
      expected,
      actual: `attach=${attachHow}；page=${page.path}；rendered="${rendered}"；${trafficActual}`,
      evidence: `${path.relative(path.resolve(__dirname, '../..'), shot)}`,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    const shot = path.join(SHOT_DIR, 'm1-failure.png');
    await Promise.resolve(mp.screenshot({ path: shot })).catch(() => undefined);
    return {
      name: 'M1 启动 → 首页渲染（本地栈）',
      status: 'failed',
      steps,
      expected,
      actual: page ? `停在 ${page.path}` : '未取到页面',
      evidence: `${path.relative(path.resolve(__dirname, '../..'), shot)}；console 尾部: ${consoleLines.slice(-5).join(' ⏎ ').slice(0, 400)}`,
      error: (err as Error).message,
      durationMs: Date.now() - t0,
    };
  }
}

// —— main ----------------------------------------------------------------------
async function main(): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });

  const consoleLines: string[] = [];
  const finishedCases: CaseResult[] = [];

  if (!fs.existsSync(path.join(WS, 'project.config.json'))) {
    finishedCases.push({
      name: 'M1 启动 → 首页渲染（本地栈）',
      status: 'blocked',
      steps: 'attach → 等首页渲染 → 断言',
      expected: 'workspace 已构建',
      actual: '未执行',
      evidence: '—',
      error: `workspace 未构建：${WS} 缺 project.config.json — 先跑 harness/miniprogram/prepare.sh`,
      durationMs: 0,
    });
    writeResults({ suite: 'qa-harness/miniprogram', startedAt, finishedAt: new Date().toISOString(), cases: finishedCases });
    process.exitCode = 2;
    return;
  }

  // 最多两轮：DevTools 可能在 prepare.sh 触发的重编译窗口里短暂不应答
  // （timeout waiting for automator response），第二轮自然恢复。
  for (let attempt = 1; attempt <= 2; attempt++) {
    let mp: MpProgram | null = null;
    let attachHow = '';
    try {
      const attached = await attachMp();
      mp = attached.mp;
      attachHow = attached.how;
      try {
        mp.on('console', (msg) => {
          // automator console 消息形如 { type, args: [...] }（非官方类型化）
          const m = msg as { type?: string; args?: unknown[] };
          const args = Array.isArray(m.args) ? m.args : [];
          consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
        });
      } catch {
        /* console 通道不可用是已知坑，不影响证据链 */
      }
      const result = await runM1(mp, attachHow, consoleLines);
      // 传输层毛刺导致的失败且还有重试额度 → 等编译窗口过去再来一轮
      const glitchy = transportGlitch !== null || /timeout waiting for automator/.test(result.error ?? '');
      if (result.status === 'failed' && glitchy && attempt === 1) {
        console.error(`[mp] attempt ${attempt} 疑似撞上 DevTools 重编译窗口，12s 后重试`);
        try { mp.disconnect(); } catch { /* ignore */ }
        await sleep(12_000);
        transportGlitch = null;
        continue;
      }
      finishedCases.push(result);
      if (result.status !== 'passed') process.exitCode = 1;
      try { mp.disconnect(); } catch { /* ignore */ }
      break;
    } catch (err) {
      if (attempt === 1) {
        console.error(`[mp] attach 失败（${(err as Error).message}），10s 后重试一轮`);
        await sleep(10_000);
        continue;
      }
      finishedCases.push({
        name: 'M1 启动 → 首页渲染（本地栈）',
        status: 'blocked',
        steps: `attach（connect ws://127.0.0.1:${PORT} + launch 兜底）→ 等首页渲染 → 断言`,
        expected: 'DevTools 自动化端口可用且项目可打开',
        actual: '未执行（自动化未连通）',
        evidence: '—',
        error: `automator 接入失败：${(err as Error).message}`,
        durationMs: 0,
      });
      console.error('[mp] 手动开启步骤：微信开发者工具 → 设置 → 安全设置 → 开启「服务端口」；并确保 DevTools 已扫码登录。');
      process.exitCode = 2;
    }
  }

  writeResults({ suite: 'qa-harness/miniprogram', startedAt, finishedAt: new Date().toISOString(), cases: finishedCases });
}

function writeResults(payload: unknown): void {
  fs.writeFileSync(RESULTS, JSON.stringify(payload, null, 2));
  console.log(`[mp] results -> ${RESULTS}`);
}

main().catch((err) => {
  console.error('[mp] fatal:', err);
  process.exit(1);
});
