const fs = require('node:fs');
const path = require('node:path');
const Fastify = require('fastify');
const { openDatabase } = require('./database');
const { taskRoutes } = require('./tasks');
const { authRoutes, findSession } = require('./auth');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8', 'user'],
  '/login': ['login.html', 'text/html; charset=utf-8', 'guest'],
  '/register': ['register.html', 'text/html; charset=utf-8', 'guest'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/auth.js': ['auth.js', 'text/javascript; charset=utf-8'],
};

function buildServer({ dbPath, logger = false, secureCookies = process.env.NODE_ENV === 'production' } = {}) {
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false } } });
  const db = openDatabase(dbPath);

  app.decorate('db', db);
  app.decorateRequest('user', null);
  app.decorateRequest('session', null);
  app.addHook('onClose', async () => db.close());

  app.get('/health', async () => {
    db.prepare('SELECT 1').get();
    return { status: 'ok' };
  });

  app.register(authRoutes, { prefix: '/api/auth', secureCookies });
  app.register(taskRoutes, { prefix: '/api/tasks' });

  for (const [url, [file, type, access]] of Object.entries(STATIC_FILES)) {
    app.get(url, (request, reply) => {
      if (access) {
        const signedIn = findSession(db, request) !== null;
        if (access === 'user' && !signedIn) {
          return reply.redirect('/login');
        }
        if (access === 'guest' && signedIn) {
          return reply.redirect('/');
        }
      }
      return reply.type(type).send(fs.createReadStream(path.join(PUBLIC_DIR, file)));
    });
  }

  return app;
}

async function start() {
  const app = buildServer({ logger: true });
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';

  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildServer };
