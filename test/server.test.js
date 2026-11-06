const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildServer } = require('../src/server');

test('servidor inicia com o banco conectado e mantém os dados após reiniciar', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const dbPath = path.join(tmpDir, 'ritmo.db');

  const app = buildServer({ dbPath });
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });

  app.db.prepare('INSERT INTO tasks (title) VALUES (?)').run('Sobreviver ao restart');
  await app.close();

  const restarted = buildServer({ dbPath });
  const { total } = restarted.db.prepare('SELECT COUNT(*) AS total FROM tasks').get();
  await restarted.close();

  assert.equal(total, 1);
});

test('serve a interface web com os tipos corretos', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-'));
  const app = buildServer({ dbPath: path.join(tmpDir, 'ritmo.db') });
  t.after(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const files = {
    '/login': 'text/html',
    '/register': 'text/html',
    '/styles.css': 'text/css',
    '/app.js': 'text/javascript',
    '/auth.js': 'text/javascript',
  };
  for (const [url, type] of Object.entries(files)) {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 200, url);
    assert.ok(res.headers['content-type'].startsWith(type), url);
  }
});

test('redireciona as páginas conforme a autenticação', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-'));
  const app = buildServer({ dbPath: path.join(tmpDir, 'ritmo.db') });
  t.after(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const anonymous = await app.inject({ method: 'GET', url: '/' });
  assert.equal(anonymous.statusCode, 302);
  assert.equal(anonymous.headers.location, '/login');

  const registered = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'ana', email: 'ana@example.com', password: 'senha-segura' },
  });
  const cookie = registered.headers['set-cookie'].split(';')[0];

  const home = await app.inject({ method: 'GET', url: '/', headers: { cookie } });
  assert.equal(home.statusCode, 200);
  assert.ok(home.headers['content-type'].startsWith('text/html'));

  for (const url of ['/login', '/register']) {
    const res = await app.inject({ method: 'GET', url, headers: { cookie } });
    assert.equal(res.statusCode, 302, url);
    assert.equal(res.headers.location, '/', url);
  }
});
