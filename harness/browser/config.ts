// harness/browser/config.ts — every knob is env-driven (see harness/stack/env.sh
// which exports HARNESS_* from stride-devops/local/.env; process.env wins, so CI
// can override). No hardcoded ports/passwords in specs.
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '.env') }); // optional local overrides

function req(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

export const config = {
  // Real admin-dashboard (prebuilt SPA container, same-origin nginx proxy to
  // auth-backend). Part of the default local stack — no vite dev server needed.
  baseUrl: req('HARNESS_DASHBOARD_BASE_URL', 'http://localhost:8081'),
  // Real auth-backend ingress (health gate).
  authBaseUrl: req('HARNESS_AUTH_BASE_URL', 'http://localhost:3001'),

  // Real MySQL of the stack — assertions query it directly over TCP.
  mysql: {
    host: req('HARNESS_MYSQL_HOST', '127.0.0.1'),
    port: Number(req('HARNESS_MYSQL_PORT', '3308')), // pitfall: NOT 3306 (see stack/README.md)
    user: req('HARNESS_MYSQL_USER', 'auth'),
    password: req('HARNESS_MYSQL_PASSWORD', 'auth_password'),
    database: req('HARNESS_MYSQL_DATABASE', 'auth'),
  },

  // Seeded admin (stride-devops/local/scripts/bootstrap.sh default).
  admin: {
    email: req('HARNESS_ADMIN_EMAIL', 'admin@example.com'),
    password: req('HARNESS_ADMIN_PASSWORD', 'MyPassword1!'),
  },
} as const;
