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

const ana = { username: 'Ana.Silva', email: 'Ana@Example.com', password: 'senha-segura' };

function register(payload = ana) {
  return app.inject({ method: 'POST', url: '/api/auth/register', payload });
}

function login(identifier, password = ana.password) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { identifier, password } });
}

function cookieOf(res) {
  return res.headers['set-cookie'].split(';')[0];
}

function me(cookie) {
  return app.inject({ method: 'GET', url: '/api/auth/me', headers: cookie ? { cookie } : {} });
}

test('cadastro cria a conta, inicia a sessão e guarda apenas o hash scrypt da senha', async () => {
  const res = await register({ ...ana, username: '  Ana.Silva ', email: ' Ana@Example.com ' });

  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.deepEqual(Object.keys(body).sort(), ['csrfToken', 'user']);
  assert.deepEqual(body.user, { id: body.user.id, username: 'Ana.Silva', email: 'ana@example.com' });
  assert.ok(body.csrfToken.length >= 32);

  const cookie = res.headers['set-cookie'];
  assert.match(cookie, /^ritmo_session=[\w-]{43}; /);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Max-Age=604800/);
  assert.doesNotMatch(cookie, /Secure/);

  const user = app.db.prepare('SELECT password_hash FROM users').get();
  assert.doesNotMatch(user.password_hash, /senha-segura/);
  assert.match(user.password_hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{88}$/);

  const session = app.db.prepare('SELECT id FROM sessions').get();
  assert.notEqual(session.id, cookieOf(res).split('=')[1]);
});

test('senhas iguais geram hashes diferentes (salt aleatório)', async () => {
  await register();
  await register({ username: 'bruno', email: 'bruno@example.com', password: ana.password });

  const [a, b] = app.db.prepare('SELECT password_hash FROM users').all();
  assert.notEqual(a.password_hash, b.password_hash);
});

test('rejeita e-mail ou username já cadastrados, sem diferenciar maiúsculas', async () => {
  assert.equal((await register()).statusCode, 201);

  const sameEmail = await register({ username: 'outra', email: 'ANA@example.COM', password: 'outra-senha' });
  assert.equal(sameEmail.statusCode, 409);
  assert.equal(sameEmail.json().message, 'Email already registered');

  const sameUsername = await register({ username: 'ana.SILVA', email: 'outra@example.com', password: 'outra-senha' });
  assert.equal(sameUsername.statusCode, 409);
  assert.equal(sameUsername.json().message, 'Username already taken');

  const { total } = app.db.prepare('SELECT COUNT(*) AS total FROM users').get();
  assert.equal(total, 1);
});

test('valida username, e-mail e senha no cadastro', async () => {
  const invalid = [
    {},
    { ...ana, username: undefined },
    { ...ana, username: 'ana@silva' },
    { ...ana, username: 'an' },
    { ...ana, username: 'a'.repeat(31) },
    { ...ana, username: 'ana silva' },
    { ...ana, email: undefined },
    { ...ana, email: 'ana' },
    { ...ana, email: 'ana@exemplo' },
    { ...ana, email: 'ana @example.com' },
    { ...ana, password: undefined },
    { ...ana, password: '1234567' },
    { ...ana, password: 'x'.repeat(129) },
  ];

  for (const payload of invalid) {
    const res = await register(payload);
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }
  assert.equal(app.db.prepare('SELECT COUNT(*) AS total FROM users').get().total, 0);
});

test('login aceita username ou e-mail, sem diferenciar maiúsculas', async () => {
  await register();

  for (const identifier of ['Ana.Silva', 'ana.silva', ' ANA.SILVA ', 'ana@example.com', 'ANA@EXAMPLE.COM']) {
    const res = await login(identifier);
    assert.equal(res.statusCode, 200, identifier);
    assert.equal(res.json().user.username, 'Ana.Silva');

    const session = await me(cookieOf(res));
    assert.equal(session.statusCode, 200, identifier);
    assert.equal(session.json().user.email, 'ana@example.com');
  }
});

test('credenciais incorretas retornam o mesmo erro genérico', async () => {
  await register();
  const attempts = [
    login('Ana.Silva', 'senha-errada'),
    login('ana@example.com', 'senha-errada'),
    login('ninguem', ana.password),
    login('ninguem@example.com', ana.password),
  ];

  for (const res of await Promise.all(attempts)) {
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), { statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials' });
    assert.equal(res.headers['set-cookie'], undefined);
  }
});

test('login e cadastro aceitam apenas corpo JSON', async () => {
  await register();
  const forms = [
    { 'content-type': 'text/plain', payload: JSON.stringify({ identifier: 'Ana.Silva', password: ana.password }) },
    { 'content-type': 'application/x-www-form-urlencoded', payload: `identifier=Ana.Silva&password=${ana.password}` },
  ];

  for (const { payload, ...headers } of forms) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers, payload });
    assert.ok([400, 415].includes(res.statusCode), headers['content-type']);
  }
});

test('/me devolve o usuário autenticado e mantém a sessão entre requisições e reinícios', async () => {
  const cookie = cookieOf(await register());

  const first = await me(cookie);
  const second = await me(cookie);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(second.json(), first.json());
  assert.equal(first.json().user.username, 'Ana.Silva');

  await app.close();
  app = buildServer({ dbPath });
  assert.equal((await me(cookie)).statusCode, 200);
});

test('/me exige sessão válida', async () => {
  assert.equal((await me()).statusCode, 401);
  assert.equal((await me('ritmo_session=inexistente')).statusCode, 401);
});

test('sessão expirada não é aceita', async () => {
  const cookie = cookieOf(await register());
  app.db.prepare('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());

  assert.equal((await me(cookie)).statusCode, 401);
});

test('logout invalida a sessão no servidor e limpa o cookie', async () => {
  const res = await register();
  const cookie = cookieOf(res);
  const { csrfToken } = res.json();

  const withoutCsrf = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  assert.equal(withoutCsrf.statusCode, 403);

  const out = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { cookie, 'x-csrf-token': csrfToken },
  });
  assert.equal(out.statusCode, 204);
  assert.match(out.headers['set-cookie'], /^ritmo_session=; .*Max-Age=0/);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 0);

  assert.equal((await me(cookie)).statusCode, 401);
  const tasks = await app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie } });
  assert.equal(tasks.statusCode, 401);
});

test('novo login substitui a sessão enviada na requisição', async () => {
  const oldCookie = cookieOf(await register());

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { cookie: oldCookie },
    payload: { identifier: 'Ana.Silva', password: ana.password },
  });

  assert.equal(res.statusCode, 200);
  assert.notEqual(cookieOf(res), oldCookie);
  assert.equal((await me(oldCookie)).statusCode, 401);
  assert.equal((await me(cookieOf(res))).statusCode, 200);
});

test('cookie recebe Secure quando secureCookies está ativo', async () => {
  await app.close();
  app = buildServer({ dbPath, secureCookies: true });

  const res = await register();
  assert.match(res.headers['set-cookie'], /; Secure$/);
});
