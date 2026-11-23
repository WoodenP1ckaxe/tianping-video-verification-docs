import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { startServer } from '../../server.js';

const dataDir = mkdtempSync(join(tmpdir(), 'tianping-login-enum-'));
const app = await startServer({
  port: 0,
  host: '127.0.0.1',
  dataDir,
  initialPassword: 'EnumTest1234',
  workerIntervalMs: 600_000,
});

async function attempt(baseUrl, account) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password: 'DefinitelyWrong1234' }),
  });
  const body = await response.json();
  return {
    status: response.status,
    code: body.error?.code,
    elapsedMs: Number((performance.now() - started).toFixed(3)),
  };
}

try {
  const baseUrl = `http://127.0.0.1:${app.address.port}`;
  const known = [];
  const unknown = [];
  for (let index = 1; index <= 5; index += 1) {
    known.push(await attempt(baseUrl, 'U001'));
    unknown.push(await attempt(baseUrl, `NOT-A-REAL-ACCOUNT-${index}`));
  }
  console.log(JSON.stringify({ known, unknown }, null, 2));
} finally {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
}
