const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildServer } = require('../src/server');

const publicDir = path.join(__dirname, '..', 'public');
const appSource = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.classList = { toggle: () => {} };
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  dispatch(type, event = {}) {
    const handlers = this.listeners[type] || [];
    return Promise.all(handlers.map((handler) => handler({ preventDefault() {}, ...event })));
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelector(selector) {
    return this.children.find((child) => child.tagName === selector.toUpperCase()) || null;
  }

  focus() {}
}

let tmpDir;
let server;
let requests;
let confirmMessages;
let confirmAnswer;
let pending;
let ui;
let session;
let navigations;

async function fakeFetch(url, options) {
  requests.push({ method: options.method, url });
  pending += 1;
  try {
    const res = await server.inject({
      method: options.method,
      url,
      headers: { ...options.headers, cookie: session.cookie },
      payload: options.body,
    });
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      json: async () => JSON.parse(res.body),
    };
  } finally {
    pending -= 1;
  }
}

async function settle() {
  do {
    await new Promise(setImmediate);
  } while (pending > 0);
}

function loadApp() {
  const form = new FakeElement('form');
  form.append(new FakeElement('input'), new FakeElement('button'));
  const elements = {
    'task-form': form,
    'task-title': form.children[0],
    'task-list': new FakeElement('ul'),
    empty: new FakeElement('p'),
    error: new FakeElement('p'),
    status: new FakeElement('p'),
    'current-user': new FakeElement('span'),
    logout: new FakeElement('button'),
  };

  const context = vm.createContext({
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: (tag) => new FakeElement(tag),
    },
    window: {
      confirm: (message) => {
        confirmMessages.push(message);
        return confirmAnswer;
      },
      location: { assign: (url) => navigations.push(url) },
    },
    fetch: fakeFetch,
  });
  vm.runInContext(appSource, context);
  return elements;
}

function taskItems() {
  return ui['task-list'].children.map((item) => {
    const [checkbox, label, removeButton] = item.children;
    return { checkbox, title: label.textContent, removeButton };
  });
}

async function addTaskViaForm(title) {
  ui['task-title'].value = title;
  await ui['task-form'].dispatch('submit');
}

function countTasks() {
  return server.db.prepare('SELECT COUNT(*) AS total FROM tasks').get().total;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritmo-'));
  server = buildServer({ dbPath: path.join(tmpDir, 'ritmo.db') });
  requests = [];
  confirmMessages = [];
  confirmAnswer = true;
  pending = 0;
  navigations = [];
  const res = await server.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'ana', email: 'ana@example.com', password: 'senha-segura' },
  });
  session = { cookie: res.headers['set-cookie'].split(';')[0] };
  ui = loadApp();
  await settle();
});

afterEach(async () => {
  await server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('index.html possui região de status acessível', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const region = html.match(/<p[^>]*id="status"[^>]*>/);
  assert.ok(region, 'elemento #status ausente');
  assert.match(region[0], /role="status"/);
  assert.match(region[0], /aria-live="polite"/);
});

test('cancelar a exclusão não envia DELETE e preserva a tarefa', async () => {
  await addTaskViaForm('Manter esta');
  confirmAnswer = false;
  requests = [];

  await taskItems()[0].removeButton.dispatch('click');

  assert.deepEqual(confirmMessages, ['Excluir a tarefa "Manter esta"?']);
  assert.deepEqual(requests, []);
  assert.equal(countTasks(), 1);
  assert.deepEqual(taskItems().map((t) => t.title), ['Manter esta']);
  assert.equal(ui.status.textContent, 'Tarefa "Manter esta" adicionada.');
});

test('confirmar a exclusão remove a tarefa e anuncia o resultado', async () => {
  await addTaskViaForm('Remover esta');

  await taskItems()[0].removeButton.dispatch('click');

  assert.equal(confirmMessages.length, 1);
  assert.ok(requests.some((r) => r.method === 'DELETE' && /^\/api\/tasks\/\d+$/.test(r.url)));
  assert.equal(countTasks(), 0);
  assert.equal(taskItems().length, 0);
  assert.equal(ui.status.textContent, 'Tarefa "Remover esta" excluída.');
  assert.equal(ui.error.hidden, true);
});

test('anuncia criação, conclusão e reabertura', async () => {
  await addTaskViaForm('  Estudar  ');
  assert.equal(ui.status.textContent, 'Tarefa "Estudar" adicionada.');

  let [task] = taskItems();
  task.checkbox.checked = true;
  await task.checkbox.dispatch('change');
  assert.equal(ui.status.textContent, 'Tarefa "Estudar" concluída.');

  [task] = taskItems();
  assert.equal(task.checkbox.checked, true);
  task.checkbox.checked = false;
  await task.checkbox.dispatch('change');
  assert.equal(ui.status.textContent, 'Tarefa "Estudar" reaberta.');
});

test('falha na exclusão mantém a mensagem de erro e não anuncia sucesso', async () => {
  await addTaskViaForm('Já removida');
  server.db.prepare('DELETE FROM tasks').run();

  await taskItems()[0].removeButton.dispatch('click');

  assert.equal(ui.error.hidden, false);
  assert.equal(ui.error.textContent, 'Não foi possível excluir a tarefa.');
  assert.equal(ui.status.textContent, '');
});

test('exibe o usuário autenticado ao carregar a página', () => {
  assert.equal(ui['current-user'].textContent, 'ana');
  assert.deepEqual(requests.map((r) => `${r.method} ${r.url}`), ['GET /api/auth/me', 'GET /api/tasks']);
});

test('sair encerra a sessão e volta para o login', async () => {
  await ui.logout.dispatch('click');

  assert.ok(requests.some((r) => r.method === 'POST' && r.url === '/api/auth/logout'));
  assert.equal(server.db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 0);
  assert.deepEqual(navigations, ['/login']);
});

test('redireciona para o login quando a sessão deixa de ser válida', async () => {
  await addTaskViaForm('Qualquer');
  server.db.prepare('DELETE FROM sessions').run();

  const [task] = taskItems();
  task.checkbox.checked = true;
  await task.checkbox.dispatch('change');

  assert.ok(navigations.length > 0);
  assert.ok(navigations.every((url) => url === '/login'));
});
