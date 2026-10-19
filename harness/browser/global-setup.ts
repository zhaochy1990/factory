// Fail fast if the real local stack isn't up — the suite does NOT manage
// Docker itself (harness/stack/up.sh does) and never falls back to mocks.
import { config } from './config';

export default async function globalSetup(): Promise<void> {
  const checks: ReadonlyArray<readonly [string, string]> = [
    ['auth-backend', `${config.authBaseUrl}/health`],
    ['admin-dashboard', config.baseUrl],
  ];
  const failures: string[] = [];
  for (const [name, url] of checks) {
    try {
      const res = await fetch(url);
      if (!res.ok) failures.push(`${name}: ${url} -> HTTP ${res.status}`);
    } catch (err) {
      failures.push(`${name}: ${url} -> ${(err as Error).message}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      [
        'Local stack is not healthy — the browser suite refuses to run against anything else:',
        ...failures.map((f) => `  ${f}`),
        '',
        'Bring the real stack up first:  harness/stack/up.sh',
      ].join('\n'),
    );
  }
}
