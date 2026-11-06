const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = 'ritmo_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEYLEN = 64;
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const registerBody = {
  type: 'object',
  required: ['username', 'email', 'password'],
  properties: {
    username: { type: 'string', pattern: '^\\s*[A-Za-z0-9._-]{3,30}\\s*$' },
    email: { type: 'string', maxLength: 254, pattern: '^\\s*[^\\s@]+@[^\\s@]+\\.[^\\s@]+\\s*$' },
    password: { type: 'string', minLength: 8, maxLength: 128 },
  },
};

const loginBody = {
  type: 'object',
  required: ['identifier', 'password'],
  properties: {
    identifier: { type: 'string', minLength: 1, maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 128 },
  },
};

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const [algorithm, N, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt') {
    return false;
  }
  const expected = Buffer.from(hash, 'base64');
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, params);
  return crypto.timingSafeEqual(actual, expected);
}

let dummyHash;
function getDummyHash() {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readSessionToken(request) {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE && value.length > 0) {
      return value.join('=');
    }
  }
  return null;
}

function sessionCookie(value, maxAgeSeconds, secure) {
  const attributes = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
}

function findSession(db, request) {
  const token = readSessionToken(request);
  if (!token) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT s.id, s.csrf_token, u.id AS user_id, u.username, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString());
  return row ?? null;
}

function csrfMatches(received, expected) {
  if (typeof received !== 'string') {
    return false;
  }
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function requireAuth(request, reply) {
  const session = findSession(request.server.db, request);
  if (!session) {
    return reply
      .code(401)
      .send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
  }
  if (UNSAFE_METHODS.has(request.method) && !csrfMatches(request.headers['x-csrf-token'], session.csrf_token)) {
    return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Invalid CSRF token' });
  }
  request.session = session;
  request.user = { id: session.user_id, username: session.username, email: session.email };
}

function uniqueViolation(err) {
  const match = /UNIQUE constraint failed: users\.(username|email)/.exec(err.message);
  return match ? match[1] : null;
}

async function authRoutes(app, { secureCookies = false } = {}) {
  const { db } = app;

  function signIn(request, reply, user) {
    const previous = readSessionToken(request);
    if (previous) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(previous));
    }

    const now = Date.now();
    const token = crypto.randomBytes(32).toString('base64url');
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date(now).toISOString());
    db.prepare('INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(
      hashToken(token),
      user.id,
      csrfToken,
      new Date(now + SESSION_TTL_MS).toISOString(),
    );

    reply.header('set-cookie', sessionCookie(token, SESSION_TTL_MS / 1000, secureCookies));
    return { user: { id: user.id, username: user.username, email: user.email }, csrfToken };
  }

  app.post('/register', { schema: { body: registerBody } }, async (request, reply) => {
    const username = request.body.username.trim();
    const email = request.body.email.trim().toLowerCase();
    const passwordHash = await hashPassword(request.body.password);

    let user;
    try {
      user = db
        .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?) RETURNING id, username, email')
        .get(username, email, passwordHash);
    } catch (err) {
      const field = uniqueViolation(err);
      if (!field) {
        throw err;
      }
      const message = field === 'username' ? 'Username already taken' : 'Email already registered';
      return reply.code(409).send({ statusCode: 409, error: 'Conflict', message });
    }

    return reply.code(201).send(signIn(request, reply, user));
  });

  app.post('/login', { schema: { body: loginBody } }, async (request, reply) => {
    const identifier = request.body.identifier.trim();
    const user = db
      .prepare('SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?')
      .get(identifier, identifier.toLowerCase());

    const valid = await verifyPassword(request.body.password, user?.password_hash ?? (await getDummyHash()));
    if (!user || !valid) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials' });
    }

    return signIn(request, reply, user);
  });

  app.get('/me', { onRequest: requireAuth }, async (request) => {
    return { user: request.user, csrfToken: request.session.csrf_token };
  });

  app.post('/logout', { onRequest: requireAuth }, async (request, reply) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(request.session.id);
    reply.header('set-cookie', sessionCookie('', 0, secureCookies));
    return reply.code(204).send();
  });
}

module.exports = { authRoutes, requireAuth, findSession };
