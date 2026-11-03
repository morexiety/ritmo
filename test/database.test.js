const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../src/database');

let tmpDir;
let dbPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-'));
  dbPath = path.join(tmpDir, 'nested', 'ritmo.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('cria o arquivo do banco e a tabela tasks com os campos esperados', () => {
  const db = openDatabase(dbPath);
  const columns = db.prepare('PRAGMA table_info(tasks)').all();
  db.close();

  assert.ok(fs.existsSync(dbPath));
  assert.deepEqual(
    columns.map((c) => ({ name: c.name, type: c.type, notnull: c.notnull, pk: c.pk })),
    [
      { name: 'id', type: 'INTEGER', notnull: 0, pk: 1 },
      { name: 'title', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'completed', type: 'INTEGER', notnull: 1, pk: 0 },
      { name: 'created_at', type: 'TEXT', notnull: 1, pk: 0 },
    ],
  );
});

test('aplica padrões: completed = 0 e created_at preenchido', () => {
  const db = openDatabase(dbPath);
  const { lastInsertRowid } = db.prepare('INSERT INTO tasks (title) VALUES (?)').run('Estudar');
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(lastInsertRowid);
  db.close();

  assert.equal(task.title, 'Estudar');
  assert.equal(task.completed, 0);
  assert.match(task.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('gera ids únicos', () => {
  const db = openDatabase(dbPath);
  const insert = db.prepare('INSERT INTO tasks (title) VALUES (?)');
  const a = insert.run('A').lastInsertRowid;
  const b = insert.run('B').lastInsertRowid;
  db.close();

  assert.notEqual(a, b);
});

test('rejeita title ausente, vazio ou só com espaços', () => {
  const db = openDatabase(dbPath);

  assert.throws(() => db.prepare('INSERT INTO tasks (title) VALUES (NULL)').run(), /NOT NULL/);
  assert.throws(() => db.prepare("INSERT INTO tasks (title) VALUES ('')").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO tasks (title) VALUES ('   ')").run(), /CHECK/);
  db.close();
});

test('rejeita completed fora de 0 ou 1', () => {
  const db = openDatabase(dbPath);

  assert.throws(
    () => db.prepare("INSERT INTO tasks (title, completed) VALUES ('X', 2)").run(),
    /CHECK/,
  );
  db.close();
});

test('mantém os dados após fechar e reabrir o banco', () => {
  const first = openDatabase(dbPath);
  first.prepare('INSERT INTO tasks (title, completed) VALUES (?, ?)').run('Persistir', 1);
  first.close();

  const second = openDatabase(dbPath);
  const tasks = second.prepare('SELECT title, completed FROM tasks').all();
  second.close();

  assert.deepEqual(tasks.map((t) => ({ ...t })), [{ title: 'Persistir', completed: 1 }]);
});
