const Fastify = require('fastify');
const { openDatabase } = require('./database');

function buildServer({ dbPath, logger = false } = {}) {
  const app = Fastify({ logger });
  const db = openDatabase(dbPath);

  app.decorate('db', db);
  app.addHook('onClose', async () => db.close());

  app.get('/health', async () => {
    db.prepare('SELECT 1').get();
    return { status: 'ok' };
  });

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
