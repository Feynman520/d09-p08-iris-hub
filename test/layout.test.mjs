// IRIS Hub · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 네트워크 없이 도는 구조 시험: 메신저 저장소에서 옮겨 온 뒤(2026-11-13) 경로·순번·비밀 값 원칙이 그대로인지 본다.
// 실제 허브에 대는 검사는 `npm run verify:rls` 이다(이 시험이 그것을 대신하지 않는다).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

test('import 만으로는 아무 일도 하지 않고, 도구가 서로를 찾는다', async () => {
  const deploy = await import('../server/deploy.mjs');
  for (const name of ['readEnv', 'envFile', 'loadEnv', 'hubRef', 'runSql', 'messengerHubJson']) assert.equal(typeof deploy[name], 'function', name);
  const admin = await import('../scripts/lib/admin.mjs');
  for (const name of ['loadHub', 'serviceRoleKey', 'adminCreateUser', 'adminDeleteUser', 'adminSignIn', 'asUser']) assert.equal(typeof admin[name], 'function', name);
});

test('hub.json 과 hub-ref.json 이 같은 허브를 가리킨다', async () => {
  const { hubRef } = await import('../server/deploy.mjs');
  const { loadHub } = await import('../scripts/lib/admin.mjs');
  const ref = hubRef(); const hub = loadHub();
  assert.equal(hub.url, ref.url);
  assert.equal(hub.url, `https://${ref.ref}.supabase.co`);
  assert.equal(hub.schema, 1);
  assert.ok(typeof hub.anonKey === 'string' && hub.anonKey.length > 20);
});

test('hub.json 의 열쇠는 anon 이다(service role 열쇠를 저장소에 두지 않는다)', async () => {
  const { loadHub } = await import('../scripts/lib/admin.mjs');
  const parts = loadHub().anonKey.split('.');
  if (parts.length === 3) { // 옛 형식(JWT)일 때만 역할을 읽을 수 있다
    const role = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role;
    assert.equal(role, 'anon');
  } else assert.ok(!/^sb_secret_/.test(loadHub().anonKey));
});

test('마이그레이션 순번이 0001 부터 빈칸·중복 없이 이어진다', () => {
  const files = fs.readdirSync(path.join(root, 'server', 'migrations')).filter(f => f.endsWith('.sql')).sort();
  assert.ok(files.length >= 5);
  files.forEach((f, i) => assert.match(f, new RegExp(`^${String(i + 1).padStart(4, '0')}_[a-z0-9_]+\\.sql$`), f));
});

test('envFile: --env 가 가장 먼저, 그다음 IRIS_HUB_ENV, 옛 이름 IRIS_MESSENGER_ENV 도 읽는다', async () => {
  const { envFile } = await import('../server/deploy.mjs');
  const keep = { a: process.env.IRIS_HUB_ENV, b: process.env.IRIS_MESSENGER_ENV };
  try {
    process.env.IRIS_HUB_ENV = 'X:/hub.env'; process.env.IRIS_MESSENGER_ENV = 'X:/messenger.env';
    assert.equal(envFile('X:/given.env'), 'X:/given.env');
    assert.equal(envFile(), 'X:/hub.env');
    delete process.env.IRIS_HUB_ENV;
    assert.equal(envFile(), 'X:/messenger.env');
  } finally {
    for (const [k, v] of [['IRIS_HUB_ENV', keep.a], ['IRIS_MESSENGER_ENV', keep.b]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('messengerHubJson: 폴더 번호가 아니라 패키지 이름으로 옆 저장소를 찾는다', async () => {
  const { messengerHubJson } = await import('../server/deploy.mjs');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-hub-sib-'));
  try {
    assert.equal(messengerHubJson(base), null);
    fs.mkdirSync(path.join(base, 'P99-other', 'module'), { recursive: true });
    fs.writeFileSync(path.join(base, 'P99-other', 'package.json'), '{"name":"something-else"}');
    fs.writeFileSync(path.join(base, 'P99-other', 'module', 'hub.json'), '{}');
    fs.writeFileSync(path.join(base, 'stray.txt'), 'x');
    assert.equal(messengerHubJson(base), null);
    fs.mkdirSync(path.join(base, 'any-name', 'module'), { recursive: true });
    fs.writeFileSync(path.join(base, 'any-name', 'package.json'), '{"name":"iris-messenger"}');
    assert.equal(messengerHubJson(base), null, 'module/hub.json 이 없으면 찾지 않는다');
    fs.writeFileSync(path.join(base, 'any-name', 'module', 'hub.json'), '{}');
    assert.equal(messengerHubJson(base), path.join(base, 'any-name', 'module', 'hub.json'));
    // 복제본이 둘이면 어느 것도 고르지 않고 멈춘다(엉뚱한 사본을 고치지 않게).
    fs.mkdirSync(path.join(base, 'second-copy', 'module'), { recursive: true });
    fs.writeFileSync(path.join(base, 'second-copy', 'package.json'), '{"name":"iris-messenger"}');
    fs.writeFileSync(path.join(base, 'second-copy', 'module', 'hub.json'), '{}');
    assert.throws(() => messengerHubJson(base), /more than one iris-messenger repo/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('옆 폴더에 메신저 저장소가 있으면 그 module/hub.json 이 이 저장소 hub.json 과 글자까지 같다', async (t) => {
  const { messengerHubJsons } = await import('../server/deploy.mjs');
  const copies = messengerHubJsons();
  if (!copies.length) return t.skip('옆 폴더에 메신저 저장소 없음(허브 저장소만 받은 경우)');
  const mine = read('hub.json').replace(/\r\n/g, '\n');
  for (const p of copies) assert.equal(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), mine, p);
});

test('옛 경로(hub/server·module/hub.json)를 읽는 코드가 남아 있지 않다', () => {
  const code = ['server/deploy.mjs', 'server/ops/daily.mjs', 'server/ops/feedback.mjs', 'scripts/verify-rls.mjs', 'scripts/sql.mjs', 'scripts/lib/admin.mjs', '.github/workflows/keepalive.yml'];
  for (const f of code) {
    const text = read(...f.split('/'));
    assert.ok(!/hub[\\/]server/.test(text.replace(/hub\/server\/ 에서 이 저장소로 옮겼다/, '')), `${f}: hub/server`);
    if (f !== 'server/deploy.mjs') assert.ok(!/module\/hub\.json/.test(text), `${f}: module/hub.json`);
  }
});
