const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'ritmo.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'sql', 'schema.sql');

function openDatabase(filename = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

function migrate(db) {
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
  if (taskColumns.length > 0 && !taskColumns.some((column) => column.name === 'user_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN user_id INTEGER REFERENCES users (id)');
  }
}

module.exports = { openDatabase, DEFAULT_DB_PATH };
