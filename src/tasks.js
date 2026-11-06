const { requireAuth } = require('./auth');

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9][0-9]*$' } },
};

const createBody = {
  type: 'object',
  required: ['title'],
  properties: { title: { type: 'string', pattern: '\\S' } },
};

const updateBody = {
  type: 'object',
  required: ['completed'],
  properties: { completed: { type: 'boolean' } },
};

function toTask(row) {
  return { ...row, completed: row.completed === 1 };
}

function notFound(reply) {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Task not found' });
}

async function taskRoutes(app) {
  const { db } = app;

  app.addHook('onRequest', requireAuth);

  app.post('/', { schema: { body: createBody } }, async (request, reply) => {
    const row = db
      .prepare('INSERT INTO tasks (title, user_id) VALUES (?, ?) RETURNING id, title, completed, created_at')
      .get(request.body.title.trim(), request.user.id);
    return reply.code(201).send(toTask(row));
  });

  app.get('/', async (request) => {
    return db
      .prepare('SELECT id, title, completed, created_at FROM tasks WHERE user_id = ? ORDER BY id')
      .all(request.user.id)
      .map(toTask);
  });

  app.patch('/:id', { schema: { params: idParams, body: updateBody } }, async (request, reply) => {
    const row = db
      .prepare(
        'UPDATE tasks SET completed = ? WHERE id = ? AND user_id = ? RETURNING id, title, completed, created_at',
      )
      .get(request.body.completed ? 1 : 0, Number(request.params.id), request.user.id);
    return row ? toTask(row) : notFound(reply);
  });

  app.delete('/:id', { schema: { params: idParams } }, async (request, reply) => {
    const { changes } = db
      .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
      .run(Number(request.params.id), request.user.id);
    return changes ? reply.code(204).send() : notFound(reply);
  });
}

module.exports = { taskRoutes };
