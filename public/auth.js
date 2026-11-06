const form = document.getElementById('auth-form');
const submitButton = form.querySelector('button[type="submit"]');
const errorBox = document.getElementById('error');

const MESSAGES = {
  'Invalid credentials': 'Usuário, e-mail ou senha incorretos.',
  'Username already taken': 'Este nome de usuário já está em uso.',
  'Email already registered': 'Este e-mail já está cadastrado.',
};

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

async function submit(event) {
  event.preventDefault();
  errorBox.hidden = true;
  submitButton.disabled = true;

  try {
    const res = await fetch(form.dataset.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    if (res.ok) {
      window.location.assign('/');
      return;
    }
    const error = await res.json().catch(() => ({}));
    if (MESSAGES[error.message]) {
      showError(MESSAGES[error.message]);
    } else if (res.status === 400) {
      showError('Verifique os dados informados.');
    } else {
      showError('Não foi possível concluir a operação.');
    }
  } catch {
    showError('Não foi possível conectar ao servidor.');
  } finally {
    submitButton.disabled = false;
  }
}

form.addEventListener('submit', submit);
