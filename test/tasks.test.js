const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildServer } = require('../src/server');

let tmpDir;
let dbPath;
let app;
let alice;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-'));
  dbPath = path.join(tmpDir, 'ritmo.db');
  app = buildServer({ dbPath });
  alice = await signUp('alice');
});

afterEach(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function signUp(username) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, email: `${username}@example.com`, password: 'senha-segura' },
  });
  assert.equal(res.statusCode, 201);
  return { cookie: res.headers['set-cookie'].split(';')[0], csrfToken: res.json().csrfToken };
}

function api(method, url, payload, user = alice) {
  const headers = { cookie: user.cookie };
  if (method !== 'GET') {
    headers['x-csrf-token'] = user.csrfToken;
  }
  return app.inject({ method, url, payload, headers });
}

function createTask(title, user = alice) {
  return api('POST', '/api/tasks', { title }, user);
}

test('POST cria tarefa com completed false e título sem espaços nas pontas', async () => {
  const res = await createTask('  Estudar Fastify  ');

  assert.equal(res.statusCode, 201);
  const task = res.json();
  assert.equal(typeof task.id, 'number');
  assert.equal(task.title, 'Estudar Fastify');
  assert.equal(task.completed, false);
  assert.ok(task.created_at);
  assert.deepEqual(Object.keys(task).sort(), ['completed', 'created_at', 'id', 'title']);
});

test('POST rejeita título ausente, vazio, só com espaços ou não texto', async () => {
  const payloads = [{}, { title: '' }, { title: '   ' }, { title: 123 }, { title: null }];

  for (const payload of payloads) {
    const res = await api('POST', '/api/tasks', payload);
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }

  const noBody = await api('POST', '/api/tasks');
  assert.equal(noBody.statusCode, 400);
});

test('GET lista as tarefas em ordem de criação', async () => {
  const empty = await api('GET', '/api/tasks');
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.json(), []);

  await createTask('Primeira');
  await createTask('Segunda');

  const res = await api('GET', '/api/tasks');
  assert.deepEqual(
    res.json().map(({ title, completed }) => ({ title, completed })),
    [
      { title: 'Primeira', completed: false },
      { title: 'Segunda', completed: false },
    ],
  );
});

test('PATCH atualiza completed e devolve booleano', async () => {
  const { id } = (await createTask('Marcar')).json();

  const done = await api('PATCH', `/api/tasks/${id}`, { completed: true });
  assert.equal(done.statusCode, 200);
  assert.equal(done.json().completed, true);

  const undone = await api('PATCH', `/api/tasks/${id}`, { completed: false });
  assert.equal(undone.json().completed, false);
});

test('PATCH rejeita completed ausente ou não booleano', async () => {
  const { id } = (await createTask('Validar')).json();
  const payloads = [{}, { completed: 'true' }, { completed: 1 }, { completed: null }];

  for (const payload of payloads) {
    const res = await api('PATCH', `/api/tasks/${id}`, payload);
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }
});

test('DELETE remove a tarefa', async () => {
  const { id } = (await createTask('Apagar')).json();

  const res = await api('DELETE', `/api/tasks/${id}`);
  assert.equal(res.statusCode, 204);

  const list = await api('GET', '/api/tasks');
  assert.deepEqual(list.json(), []);
});

test('PATCH e DELETE retornam 404 para id inexistente', async () => {
  const patch = await api('PATCH', '/api/tasks/999', { completed: true });
  assert.equal(patch.statusCode, 404);

  const del = await api('DELETE', '/api/tasks/999');
  assert.equal(del.statusCode, 404);
});

test('PATCH e DELETE retornam 400 para id inválido', async () => {
  for (const id of ['abc', '0', '-1', '1.5']) {
    const patch = await api('PATCH', `/api/tasks/${id}`, { completed: true });
    assert.equal(patch.statusCode, 400, `PATCH ${id}`);

    const del = await api('DELETE', `/api/tasks/${id}`);
    assert.equal(del.statusCode, 400, `DELETE ${id}`);
  }
});

test('tarefas e sessão continuam disponíveis após reiniciar o servidor', async () => {
  const { id } = (await createTask('Persistir')).json();
  await api('PATCH', `/api/tasks/${id}`, { completed: true });
  await app.close();

  app = buildServer({ dbPath });
  const res = await api('GET', '/api/tasks');

  assert.deepEqual(
    res.json().map(({ id, title, completed }) => ({ id, title, completed })),
    [{ id, title: 'Persistir', completed: true }],
  );
});

test('rotas de tarefas exigem autenticação', async () => {
  const { id } = (await createTask('Protegida')).json();
  const requests = [
    { method: 'GET', url: '/api/tasks' },
    { method: 'POST', url: '/api/tasks', payload: { title: 'Intrusa' } },
    { method: 'PATCH', url: `/api/tasks/${id}`, payload: { completed: true } },
    { method: 'DELETE', url: `/api/tasks/${id}` },
  ];

  for (const request of requests) {
    for (const cookie of [undefined, 'ritmo_session=token-invalido']) {
      const res = await app.inject({ ...request, headers: cookie ? { cookie } : {} });
      assert.equal(res.statusCode, 401, `${request.method} ${cookie}`);
      assert.equal(res.json().message, 'Authentication required');
    }
  }

  const list = (await api('GET', '/api/tasks')).json();
  assert.deepEqual(list.map(({ title, completed }) => ({ title, completed })), [{ title: 'Protegida', completed: false }]);
});

test('requisições que alteram dados exigem o token CSRF da sessão', async () => {
  const bob = await signUp('bob');
  const { id } = (await createTask('Segura')).json();
  const requests = [
    { method: 'POST', url: '/api/tasks', payload: { title: 'Forjada' } },
    { method: 'PATCH', url: `/api/tasks/${id}`, payload: { completed: true } },
    { method: 'DELETE', url: `/api/tasks/${id}` },
  ];

  for (const request of requests) {
    for (const token of [undefined, 'errado', bob.csrfToken]) {
      const headers = { cookie: alice.cookie, ...(token ? { 'x-csrf-token': token } : {}) };
      const res = await app.inject({ ...request, headers });
      assert.equal(res.statusCode, 403, `${request.method} ${token}`);
    }
  }

  const list = (await api('GET', '/api/tasks')).json();
  assert.deepEqual(list.map(({ title, completed }) => ({ title, completed })), [{ title: 'Segura', completed: false }]);
});

test('cada usuário acessa somente as próprias tarefas', async () => {
  const bob = await signUp('bob');
  const aliceTask = (await createTask('Da Alice')).json();
  const bobTask = (await createTask('Do Bob', bob)).json();

  assert.deepEqual((await api('GET', '/api/tasks')).json().map((t) => t.title), ['Da Alice']);
  assert.deepEqual((await api('GET', '/api/tasks', undefined, bob)).json().map((t) => t.title), ['Do Bob']);

  const patch = await api('PATCH', `/api/tasks/${aliceTask.id}`, { completed: true }, bob);
  assert.equal(patch.statusCode, 404);
  const del = await api('DELETE', `/api/tasks/${aliceTask.id}`, undefined, bob);
  assert.equal(del.statusCode, 404);

  const [stillThere] = (await api('GET', '/api/tasks')).json();
  assert.equal(stillThere.id, aliceTask.id);
  assert.equal(stillThere.completed, false);

  const own = await api('DELETE', `/api/tasks/${bobTask.id}`, undefined, bob);
  assert.equal(own.statusCode, 204);
  assert.equal((await api('GET', '/api/tasks')).json().length, 1);
});

test('tarefas sem dono (anteriores à autenticação) não são expostas', async () => {
  const { lastInsertRowid } = app.db.prepare('INSERT INTO tasks (title) VALUES (?)').run('Antiga');
  const id = Number(lastInsertRowid);

  assert.deepEqual((await api('GET', '/api/tasks')).json(), []);
  assert.equal((await api('PATCH', `/api/tasks/${id}`, { completed: true })).statusCode, 404);
  assert.equal((await api('DELETE', `/api/tasks/${id}`)).statusCode, 404);

  const row = app.db.prepare('SELECT title, completed, user_id FROM tasks WHERE id = ?').get(id);
  assert.deepEqual({ ...row }, { title: 'Antiga', completed: 0, user_id: null });
});
