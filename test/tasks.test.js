const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildServer } = require('../src/server');

let tmpDir;
let dbPath;
let app;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-'));
  dbPath = path.join(tmpDir, 'ritmo.db');
  app = buildServer({ dbPath });
});

afterEach(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createTask(title) {
  return app.inject({ method: 'POST', url: '/api/tasks', payload: { title } });
}

test('POST cria tarefa com completed false e título sem espaços nas pontas', async () => {
  const res = await createTask('  Estudar Fastify  ');

  assert.equal(res.statusCode, 201);
  const task = res.json();
  assert.equal(typeof task.id, 'number');
  assert.equal(task.title, 'Estudar Fastify');
  assert.equal(task.completed, false);
  assert.ok(task.created_at);
});

test('POST rejeita título ausente, vazio, só com espaços ou não texto', async () => {
  const payloads = [{}, { title: '' }, { title: '   ' }, { title: 123 }, { title: null }];

  for (const payload of payloads) {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', payload });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }

  const noBody = await app.inject({ method: 'POST', url: '/api/tasks' });
  assert.equal(noBody.statusCode, 400);
});

test('GET lista as tarefas em ordem de criação', async () => {
  const empty = await app.inject({ method: 'GET', url: '/api/tasks' });
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.json(), []);

  await createTask('Primeira');
  await createTask('Segunda');

  const res = await app.inject({ method: 'GET', url: '/api/tasks' });
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

  const done = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, payload: { completed: true } });
  assert.equal(done.statusCode, 200);
  assert.equal(done.json().completed, true);

  const undone = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, payload: { completed: false } });
  assert.equal(undone.json().completed, false);
});

test('PATCH rejeita completed ausente ou não booleano', async () => {
  const { id } = (await createTask('Validar')).json();
  const payloads = [{}, { completed: 'true' }, { completed: 1 }, { completed: null }];

  for (const payload of payloads) {
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, payload });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }
});

test('DELETE remove a tarefa', async () => {
  const { id } = (await createTask('Apagar')).json();

  const res = await app.inject({ method: 'DELETE', url: `/api/tasks/${id}` });
  assert.equal(res.statusCode, 204);

  const list = await app.inject({ method: 'GET', url: '/api/tasks' });
  assert.deepEqual(list.json(), []);
});

test('PATCH e DELETE retornam 404 para id inexistente', async () => {
  const patch = await app.inject({ method: 'PATCH', url: '/api/tasks/999', payload: { completed: true } });
  assert.equal(patch.statusCode, 404);

  const del = await app.inject({ method: 'DELETE', url: '/api/tasks/999' });
  assert.equal(del.statusCode, 404);
});

test('PATCH e DELETE retornam 400 para id inválido', async () => {
  for (const id of ['abc', '0', '-1', '1.5']) {
    const patch = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, payload: { completed: true } });
    assert.equal(patch.statusCode, 400, `PATCH ${id}`);

    const del = await app.inject({ method: 'DELETE', url: `/api/tasks/${id}` });
    assert.equal(del.statusCode, 400, `DELETE ${id}`);
  }
});

test('tarefas continuam disponíveis após reiniciar o servidor', async () => {
  const { id } = (await createTask('Persistir')).json();
  await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, payload: { completed: true } });
  await app.close();

  app = buildServer({ dbPath });
  const res = await app.inject({ method: 'GET', url: '/api/tasks' });

  assert.deepEqual(
    res.json().map(({ id, title, completed }) => ({ id, title, completed })),
    [{ id, title: 'Persistir', completed: true }],
  );
});
