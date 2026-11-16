// ============================================================
//  ESTADO DE AUTENTICAÇÃO
// ============================================================
async function checkAuthState() {
  const { data: { session } } = await sb.auth.getSession();
  const onAuthPage = /(login|register)\.html/.test(location.pathname);

  if (session && onAuthPage)   location.href = 'index.html';
  if (!session && !onAuthPage) location.href = 'login.html';
}
checkAuthState();

// ============================================================
//  LOGIN
// ============================================================
async function fazerLogin() {
  const btn = document.querySelector('.btn-auth-primary');
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;

  if (!email || !password) {
    return toast('Preencha e-mail e senha.', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    toast('Erro: ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Entrar com e-mail';
    return;
  }
  location.href = 'index.html';
}

// ============================================================
//  CADASTRO
// ============================================================
async function fazerCadastro() {
  const btn = document.querySelector('.btn-auth-primary');
  const name = $('reg-name').value.trim();
  const email = $('reg-email').value.trim();
  const password = $('reg-password').value;

  if (!name || !email || !password) {
    return toast('Preencha todos os campos.', 'error');
  }
  if (password.length < 6) {
    return toast('A senha precisa ter pelo menos 6 caracteres.', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';

  // role vai para o trigger handle_new_user em profiles
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: name, role: 'user' } },
  });

  if (error) {
    toast('Erro: ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Criar conta';
    return;
  }

  toast('Conta criada! Faça login.', 'success');
  setTimeout(() => { location.href = 'login.html'; }, 1500);
}

// ============================================================
//  TOAST (usado em login/register)
// ============================================================
function toast(msg, type = 'info') {
  const c = $('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}