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
