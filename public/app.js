const form = document.getElementById('task-form');
const input = document.getElementById('task-title');
const submitButton = form.querySelector('button');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty');
const errorBox = document.getElementById('error');
const statusBox = document.getElementById('status');

async function request(method, url, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function announce(message) {
  statusBox.textContent = message;
}

function clearStatus() {
  statusBox.textContent = '';
}

function renderTask(task) {
  const item = document.createElement('li');
  item.className = 'task';
  item.classList.toggle('done', task.completed);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `task-${task.id}`;
  checkbox.checked = task.completed;
  checkbox.addEventListener('change', () => toggleTask(task.id, checkbox));

  const label = document.createElement('label');
  label.htmlFor = checkbox.id;
  label.textContent = task.title;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'delete';
  removeButton.textContent = 'Excluir';
  removeButton.setAttribute('aria-label', `Excluir tarefa: ${task.title}`);
  removeButton.addEventListener('click', () => deleteTask(task.id, task.title));

  item.append(checkbox, label, removeButton);
  return item;
}

function render(tasks) {
  list.replaceChildren(...tasks.map(renderTask));
  empty.hidden = tasks.length > 0;
}

async function loadTasks() {
  try {
    render(await request('GET', '/api/tasks'));
  } catch {
    showError('Não foi possível carregar as tarefas.');
  }
}

async function addTask(event) {
  event.preventDefault();
  clearError();
  clearStatus();

  const title = input.value.trim();
  if (!title) {
    showError('Digite um título para a tarefa.');
    input.focus();
    return;
  }

  submitButton.disabled = true;
  input.value = '';
  try {
    const task = await request('POST', '/api/tasks', { title });
    announce(`Tarefa "${task.title}" adicionada.`);
    await loadTasks();
  } catch {
    input.value = title;
    showError('Não foi possível adicionar a tarefa.');
  } finally {
    submitButton.disabled = false;
    input.focus();
  }
}

async function toggleTask(id, checkbox) {
  clearError();
  clearStatus();
  try {
    const task = await request('PATCH', `/api/tasks/${id}`, { completed: checkbox.checked });
    announce(`Tarefa "${task.title}" ${task.completed ? 'concluída' : 'reaberta'}.`);
  } catch {
    checkbox.checked = !checkbox.checked;
    showError('Não foi possível atualizar a tarefa.');
  }
  await loadTasks();
}

async function deleteTask(id, title) {
  if (!window.confirm(`Excluir a tarefa "${title}"?`)) {
    return;
  }

  clearError();
  clearStatus();
  try {
    await request('DELETE', `/api/tasks/${id}`);
    announce(`Tarefa "${title}" excluída.`);
  } catch {
    showError('Não foi possível excluir a tarefa.');
  }
  await loadTasks();
  input.focus();
}

form.addEventListener('submit', addTask);
loadTasks();
