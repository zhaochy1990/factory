// QA e2e browser sample — REAL stack, no mocks:
//   * browser = Playwright chromium against the prebuilt admin-dashboard
//     container (:8081) whose nginx proxies /api/* to the real auth-backend;
//   * datastore = the stack's real MySQL over TCP (mysql2, see db.ts);
//   * identity = the bootstrap-seeded admin (admin@example.com / MyPassword1!).
//
// Two cases:
//   1. 真实表单登录进总览主页（UI 断言 + 登录请求确实打到真实后端）
//   2. 登录会话直查 MySQL：auth_refresh_tokens 出现本次登录的行（会话审计）
import { test, expect, request } from '@playwright/test';
import path from 'node:path';
import { config } from '../config';
import { query, closeDb } from '../db';

test.describe('qa-harness/browser · admin 登录（真实栈）', () => {
  test.describe.configure({ mode: 'serial' });

  test('B1 管理员表单登录 → 总览主页', async ({ page }, testInfo) => {
    testInfo.annotations.push({
      type: 'steps',
      description: `1. 打开 ${config.baseUrl}/login 2. 填入种子管理员邮箱/密码 3. 提交真实登录表单 4. 等待跳转主页并断言总览标题`,
    });
    testInfo.annotations.push({
      type: 'expected',
      description: 'URL 跳转到 / 且出现「总览/Dashboard」标题；POST /api/auth/login 返回 200（真实 auth-backend，非 mock）',
    });

    // 记录登录请求的真实响应（证明打到真实后端，而不是 route mock）
    const loginResponses: number[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/api/auth/login')) loginResponses.push(res.status());
    });

    await page.goto('/login');
    await page.fill('input[type=email]', config.admin.email);
    await page.fill('input[type=password]', config.admin.password);
    await page.click('button[type=submit]');

    await page.waitForURL(`${config.baseUrl}/`, { timeout: 15_000 });
    const heading = page.locator('h1').first();
    await expect(heading).toHaveText(/总览|Dashboard/, { timeout: 10_000 });

    // 登录必须真的成功打到后端（同源 nginx → auth-backend）
    expect(loginResponses.length, '应观察到 POST /api/auth/login').toBeGreaterThanOrEqual(1);
    expect(loginResponses.every((s) => s === 200), `登录响应码 ${loginResponses}`).toBe(true);

    // 证据：总览页截图
    const shot = path.join(testInfo.outputDir, 'b1-dashboard.png');
    await page.screenshot({ path: shot, fullPage: true });
    await testInfo.attach('总览主页截图', { path: shot, contentType: 'image/png' });
    testInfo.annotations.push({
      type: 'actual',
      description: `登录 200 ×${loginResponses.length}；跳转 / 成功；标题「${await heading.textContent()}」`,
    });
    testInfo.annotations.push({ type: 'evidence', description: `附件 b1-dashboard.png` });
  });

  test('B2 登录会话直查 MySQL（auth_refresh_tokens）', async ({ request: _unused }, testInfo) => {
    testInfo.annotations.push({
      type: 'steps',
      description: '1. 记录起始时间 T 2. 经 :8081 同源代理做一次真实 /api/auth/login 3. 直连 MySQL 查 auth_refresh_tokens 4. 断言 T 之后新增未吊销会话行',
    });
    testInfo.annotations.push({
      type: 'expected',
      description: 'auth.users 存在种子管理员(role=admin)；auth.auth_refresh_tokens 出现 created_at≥T 且 revoked=0 的行（登录会话留痕）',
    });
    void _unused;

    const loginStart = new Date();
    // 起一次真实的 HTTP 登录（走 admin-dashboard 同源 nginx → auth-backend）。
    // X-Client-Id 必填：用 admin-dashboard 镜像烤死的 client id（bootstrap 已
    // 注册进 auth 库并回写 local/.env，由 harness/stack/env.sh 导出）。
    const clientId = process.env.HARNESS_ADMIN_DASHBOARD_CLIENT_ID;
    expect(
      clientId,
      'HARNESS_ADMIN_DASHBOARD_CLIENT_ID 未设置 — 先跑 harness/stack/up.sh（bootstrap 会回写 local/.env）',
    ).toBeTruthy();
    const ctx = await request.newContext({ baseURL: config.baseUrl });
    const res = await ctx.post('/api/auth/login', {
      headers: { 'X-Client-Id': clientId as string },
      data: { email: config.admin.email, password: config.admin.password },
    });
    expect(res.ok(), `login HTTP ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { access_token: string; refresh_token?: string };
    expect(body.access_token).toBeTruthy();
    await ctx.dispose();

    // —— 直查真实 MySQL（127.0.0.1:3308，无任何 mock）——
    const users = await query<{ id: string; email: string; role: string }>(
      `SELECT id, email, role FROM auth_users WHERE email = ? LIMIT 1`,
      [config.admin.email],
    );
    expect(users.length, 'auth_users 应有种子管理员').toBe(1);
    expect(users[0].role).toBe('admin');

    const sessions = await query<{
      id: string;
      created_at: string;
      revoked: number;
      scopes: string;
    }>(
      `SELECT r.id, r.created_at, r.revoked, r.scopes
         FROM auth_refresh_tokens r
         JOIN auth_users u ON u.id = r.user_id
        WHERE u.email = ?
          AND r.created_at >= ?
          AND r.revoked = 0
        ORDER BY r.created_at DESC`,
      [config.admin.email, loginStart.toISOString().slice(0, 19).replace('T', ' ')],
    );
    expect(
      sessions.length,
      '本次登录应在 auth_refresh_tokens 留下未吊销会话行',
    ).toBeGreaterThanOrEqual(1);

    testInfo.annotations.push({
      type: 'actual',
      description: `auth_users[role=admin] ok；新增会话行 ${sessions.length} 条（id=${sessions[0].id.slice(0, 8)}…, revoked=0）`,
    });
    testInfo.annotations.push({
      type: 'evidence',
      description: `MySQL 直查 DSN ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}，表 auth_refresh_tokens/auth_users`,
    });

    await closeDb();
  });
});
