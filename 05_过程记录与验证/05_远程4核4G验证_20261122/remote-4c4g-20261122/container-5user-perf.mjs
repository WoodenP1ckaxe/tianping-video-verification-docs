import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const baseUrl = 'http://127.0.0.1:8080';
const iterations = Number(process.env.PERF_ITERATIONS || 10);

class Client {
  constructor() {
    this.cookie = '';
    this.csrf = '';
  }

  async request(path, options = {}) {
    const method = options.method || 'GET';
    const headers = {
      ...(this.cookie ? { Cookie: this.cookie } : {}),
      ...(this.csrf && !['GET', 'HEAD'].includes(method)
        ? { 'X-CSRF-Token': this.csrf }
        : {}),
      'Content-Type': 'application/json',
    };
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';', 1)[0];
    return response;
  }

  async json(path, options = {}, expected = 200) {
    const response = await this.request(path, options);
    const payload = await response.json();
    assert.equal(
      response.status,
      expected,
      `${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(payload)}`,
    );
    return payload;
  }

  async loginAndChange(account, initialPassword, newPassword) {
    let response = await this.request('/api/auth/login', {
      method: 'POST',
      body: { account, password: initialPassword },
    });
    let payload = await response.json();
    if (response.status === 401 && newPassword) {
      response = await this.request('/api/auth/login', {
        method: 'POST',
        body: { account, password: newPassword },
      });
      payload = await response.json();
    }
    assert.equal(response.status, 200, JSON.stringify(payload));
    this.csrf = payload.csrfToken;
    if (payload.user.mustChangePassword) {
      const changed = await this.request('/api/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: initialPassword,
          newPassword,
        },
      });
      const body = await changed.json();
      assert.equal(changed.status, 200, JSON.stringify(body));
    }
    return payload.user;
  }
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

const admin = new Client();
await admin.loginAndChange('U000', 'Perf4C4G1234', 'PerfAdmin1234');
const users = [];
for (let index = 1; index <= 5; index += 1) {
  const id = `U10${index}`;
  const accountPassword = `PerfUser${index}1234`;
  const created = await admin.request('/api/accounts', {
    method: 'POST',
    body: {
      id,
      name: `性能检验员${index}`,
      role: 'inspector',
      status: '启用',
      initialPassword: 'PerfUser1234',
    },
  });
  assert.ok([201, 409].includes(created.status), `create ${id}: ${created.status}`);
  const client = new Client();
  await client.loginAndChange(id, 'PerfUser1234', accountPassword);
  users.push({ id, client });
}

const targets = [
  { name: 'list', path: '/api/records?page=1&pageSize=50' },
  { name: 'conclusionFilter', path: '/api/records?conclusion=%E9%80%9A%E8%BF%87&page=1&pageSize=50' },
  { name: 'state', path: '/api/state' },
];
const samples = Object.fromEntries(targets.map((target) => [target.name, []]));
samples.detail = [];
const errors = [];
const started = performance.now();

await Promise.all(users.map(async ({ id, client }, userIndex) => {
  for (let index = 0; index < iterations; index += 1) {
    const currentTargets = [
      ...targets,
      { name: 'detail', path: `/api/records/PERF-0000${userIndex + 3}` },
    ];
    for (const target of currentTargets) {
      const requestStarted = performance.now();
      try {
        const response = await client.request(target.path);
        await response.arrayBuffer();
        if (response.status !== 200) {
          errors.push(`${id} ${target.name}: HTTP ${response.status}`);
        }
        samples[target.name].push(performance.now() - requestStarted);
      } catch (error) {
        errors.push(`${id} ${target.name}: ${error.message}`);
      }
    }
  }
}));
const elapsedMs = performance.now() - started;
const totalRequests = Object.values(samples).reduce((sum, values) => sum + values.length, 0);

console.log(JSON.stringify({
  ok: errors.length === 0,
  users: users.length,
  iterations,
  totalRequests,
  errors,
  elapsedMs: Math.round(elapsedMs),
  requestsPerSecond: Math.round((totalRequests / elapsedMs) * 1000 * 10) / 10,
  latencyMs: Object.fromEntries(Object.entries(samples).map(([name, values]) => [
    name,
    {
      count: values.length,
      median: Math.round(percentile(values, 0.5)),
      p95: Math.round(percentile(values, 0.95)),
      max: Math.round(Math.max(...values)),
    },
  ])),
}, null, 2));
