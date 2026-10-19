#!/usr/bin/env node
// harness/report/generate.mjs — 把用例结果 JSON 渲染成 qa1 Markdown 报告。
//
// 依赖零 npm 包（node:fs + 模板字符串），模板在 harness/report/template.md。
//
// 输入（harness/results/，均由 harness/run.sh 产出）：
//   env.json                — commit shas、fixture 版本、无 mock checklist、冒烟健康检查
//   browser-results.json    — Playwright JSON reporter 输出
//   miniprogram-results.json — harness/miniprogram/run.ts 输出（可缺省）
//
// 用法：node harness/report/generate.mjs [resultsDir]  （默认 harness/results）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(HERE, '../results');
const template = fs.readFileSync(path.resolve(HERE, 'template.md'), 'utf8');

const readJson = (f) => {
  const p = path.join(resultsDir, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

// ---- inputs ----------------------------------------------------------------
const env = readJson('env.json') ?? {};
const browser = readJson('browser-results.json');
const miniprogram = readJson('miniprogram-results.json');

// ---- flatten playwright results --------------------------------------------
function flattenPlaywright(json) {
  const specs = [];
  const walk = (suites) => {
    for (const s of suites ?? []) {
      if (s.specs?.length) specs.push(...s.specs);
      if (s.suites?.length) walk(s.suites);
    }
  };
  walk(json?.suites ?? []);
  return specs.map((spec) => {
    const run = spec.tests?.[0]?.results?.[0] ?? {};
    const status = spec.ok ? 'passed' : run.status === 'skipped' ? 'skipped' : 'failed';
    // Playwright 把注解挂在 tests[0].annotations 与 results[0].annotations 两处
    // （内容相同）——合并去重。
    const ann = {};
    const seen = new Set();
    for (const a of [...(spec.tests?.[0]?.annotations ?? []), ...(run.annotations ?? [])]) {
      const key = `${a.type}|${a.description}`;
      if (!a.description || seen.has(key)) continue;
      seen.add(key);
      ann[a.type] = (ann[a.type] ? ann[a.type] + '\n' : '') + a.description;
    }
    return {
      suite: 'browser',
      name: spec.title,
      status,
      steps: ann.steps ?? '(见 spec)',
      expected: ann.expected ?? '(见 spec)',
      actual: status === 'passed' ? ann.actual ?? '通过' : (run.error?.message ?? ann.actual ?? '失败').split('\n')[0],
      evidence:
        ann.evidence ??
        ((spec.tests?.[0]?.results?.[0]?.attachments ?? [])
          .map((a) => a.name)
          .join(', ') || '—'),
      durationMs: run.duration ?? 0,
      error: run.error?.message?.split('\n').slice(0, 3).join(' ⏎ '),
    };
  });
}

const browserCases = browser ? flattenPlaywright(browser) : [];
const mpCases = miniprogram?.cases ?? [];

const allCases = [...browserCases, ...mpCases.map((c) => ({ suite: 'miniprogram', ...c }))];
const passed = allCases.filter((c) => c.status === 'passed').length;
const failed = allCases.filter((c) => c.status === 'failed').length;
const blocked = allCases.filter((c) => c.status === 'blocked').length;
const skipped = allCases.filter((c) => c.status === 'skipped').length;

// ---- conclusion --------------------------------------------------------------
let conclusion;
if (allCases.length === 0) {
  conclusion = '⚠️ 无用例结果——harness 尚未完整执行（检查 harness/results/）。';
} else if (failed === 0 && blocked === 0 && skipped === 0) {
  conclusion = `✅ **全绿**：${passed}/${allCases.length} 用例通过（浏览器 ${browserCases.filter((c) => c.status === 'passed').length} + 小程序 ${mpCases.filter((c) => c.status === 'passed').length}），全部打本地真实栈、零 mock。`;
} else if (failed === 0) {
  conclusion = `🟡 **基本通过**：${passed}/${allCases.length} 通过，${blocked} blocked（环境阻塞，非用例失败：见用例明细与建议）。`;
} else {
  conclusion = `🔴 **不通过**：${failed} failed / ${passed} passed${blocked ? ` / ${blocked} blocked` : ''}。失败明细见下表。`;
}

// ---- no-mock checklist -------------------------------------------------------
const nm = env.noMock ?? {};
const mpOk = nm.miniprogram === true || nm.miniprogram === 'true';
const check = (ok, label) => `- [${ok ? 'x' : ' '}] ${label}`;
const checklist = [
  check(nm.realBackend, '后端为真实容器（docker compose 起、ACR 钉定镜像，非进程/stub mock）'),
  check(nm.realDatastore, '断言直查真实 MySQL（127.0.0.1:3308 TCP，非内存假库）'),
  check(nm.realHttp, '浏览器用例打真实 HTTP（无 Playwright route/interception mock）'),
  check(mpOk, mpOk ? '小程序用例打本地 api-gateway :8082（无 mock 层）' : `小程序用例打本地 api-gateway（本次未绿：${String(nm.miniprogram)}）`),
  check(nm.noProd, '全程零生产域名/零生产数据（日志断言 stride-running.cn 零命中）'),
].join('\n');

// ---- cases table --------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const statusIcon = { passed: '✅', failed: '❌', blocked: '🚧', skipped: '⏭️' };
const casesTable =
  allCases.length === 0
    ? '_（无结果）_'
    : [
        '| # | 状态 | 名称 | 步骤 | 期望 | 实际 | 证据 |',
        '|---|---|---|---|---|---|---|',
        ...allCases.map(
          (c, i) =>
            `| ${i + 1} | ${statusIcon[c.status] ?? '·'} ${c.status} | ${esc(c.name)} | ${esc(c.steps)} | ${esc(c.expected)} | ${esc(c.error ? `${c.actual} — ${c.error}` : c.actual)} | ${esc(c.evidence)} |`,
        ),
      ].join('\n');

// ---- regression smoke ----------------------------------------------------------
const regression =
  env.regression && env.regression.length
    ? [
        '| 冒烟点 | 结果 |',
        '|---|---|',
        ...env.regression.map((r) => `| ${esc(r.name)} | ${r.ok ? '✅ ok' : `❌ ${esc(r.detail ?? 'fail')}`} |`),
      ].join('\n')
    : '_（本次未记录冒烟健康检查）_';

// ---- suggestions -----------------------------------------------------------------
const suggestions = [...(env.suggestions ?? [])];
if (blocked > 0) suggestions.push('小程序用例 blocked：开启 DevTools「设置 → 安全设置 → 服务端口」并确保已扫码登录，然后 `harness/miniprogram/prepare.sh && cd harness/miniprogram && npm test`。');
if (failed > 0) suggestions.push('失败用例先看用例明细错误列；单跑复现：`cd harness/browser && npx playwright test --reporter=list`。');
if (suggestions.length === 0) suggestions.push('无——保持 harness/run.sh 一键全绿；PR 分支回归直接跑同一条命令。');
const suggestionsMd = suggestions.map((s) => `- ${s}`).join('\n');

// ---- render ----------------------------------------------------------------------
const runId = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const out = template
  .replaceAll('{{RUN_ID}}', runId)
  .replaceAll('{{GENERATED_AT}}', new Date().toISOString())
  .replaceAll('{{STARTED_AT}}', env.startedAt ?? '—')
  .replaceAll('{{FINISHED_AT}}', env.finishedAt ?? '—')
  .replaceAll('{{RUNNING_SHA}}', env.runningSha ?? '—')
  .replaceAll('{{DEVOPS_SHA}}', env.devopsSha ?? '—')
  .replaceAll('{{HARNESS_SHA}}', env.harnessSha ?? '—')
  .replaceAll('{{FIXTURE_VERSION}}', env.fixtureVersion ?? '—')
  .replaceAll('{{STACK_DESC}}', env.stackDesc ?? 'stride-devops/local docker compose 全栈（真实 Go 后端 + MySQL/Redis/RabbitMQ）')
  .replaceAll('{{NO_MOCK_CHECKLIST}}', checklist)
  .replaceAll('{{CASES_TABLE}}', casesTable)
  .replaceAll('{{REGRESSION}}', regression)
  .replaceAll('{{CONCLUSION}}', conclusion)
  .replaceAll('{{SUGGESTIONS}}', suggestionsMd);

const outFile = path.join(resultsDir, `report-${runId}.md`);
fs.writeFileSync(outFile, out);
console.log(`[report] ${outFile}`);
console.log(`[report] ${conclusion}`);
