// ============================================================
//  ESTADO
// ============================================================
const state = {
  user: null,
  profile: null,
  stores: [],
  categories: [],
  activeCategory: null,   // null = "Todas"
  avatarBust: 0,
};

// ============================================================
//  INIT
// ============================================================
(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = 'login.html');

  state.user = session.user;

  await loadProfile();
  await loadCategories();
  await loadStores();
  renderCategoryChips();
  bindSearch();
  bindGlobalUX();
})();

// ============================================================
//  PERFIL
// ============================================================
async function loadProfile() {
  const { data, error } = await sb
    .from(APP.tables.profiles)
    .select('id, full_name, role')
    .eq('id', state.user.id)
    .maybeSingle();

  if (error) console.error('loadProfile:', error);

  state.profile = data || {
    id: state.user.id,
    full_name: state.user.email.split('@')[0],
    role: 'user',
  };
  renderProfile();
}

function renderProfile() {
  const name = state.profile.full_name || state.user.email.split('@')[0];
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ff5a36&color=fff`;
  const src = avatarUrl(state.user.id, state.avatarBust);
  const roleLabel = state.profile.role === 'owner' ? '🏪 Dono de loja' : '👤 Usuário';

  $('greeting-text').textContent = `Onde comer hoje, ${name}?`;
  ['profile-name', 'sidebar-name'].forEach(id => { $(id).textContent = name; });
  ['profile-email', 'sidebar-email'].forEach(id => { $(id).textContent = state.user.email; });

  ['profile-avatar', 'sidebar-avatar'].forEach(id => {
    const el = $(id);
    el.onerror = () => { el.onerror = null; el.src = fallback; };
    el.src = src;
  });

  const roleEl = $('profile-role');
  if (roleEl) roleEl.textContent = roleLabel;
}

function openEditProfileModal() {
  $('edit-name-input').value = state.profile.full_name || '';
  $('edit-avatar-file').value = '';
  const preview = $('edit-avatar-preview');
  preview.src = avatarUrl(state.user.id, state.avatarBust);
  preview.onerror = () => {
    preview.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.profile.full_name || 'U')}&background=ff5a36&color=fff`;
  };
  openModal('edit-profile-modal');
}

function previewAvatarFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => { $('edit-avatar-preview').src = ev.target.result; };
  r.readAsDataURL(f);
}

async function saveProfile() {
  const name = $('edit-name-input').value.trim();
  const file = $('edit-avatar-file').files[0];

  if (!name) return toast('Informe o nome.', 'error');

  const btn = document.querySelector('#edit-profile-modal .btn-primary');
  setLoading(btn, true, 'Salvar');

  try {
    if (file) {
      const path = `avatars/${state.user.id}.jpg`;
      const { error: upErr } = await sb.storage
        .from(APP.buckets.images)
        .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });

      if (upErr) {
        console.warn('upload avatar:', upErr.message);
        toast('Foto não pôde ser enviada (bucket indisponível). Nome será salvo.', 'info');
      } else {
        state.avatarBust = Date.now();
      }
    }

    const { error } = await sb
      .from(APP.tables.profiles)
      .update({ full_name: name })
      .eq('id', state.user.id);

    if (error) throw error;

    state.profile.full_name = name;
    renderProfile();
    closeModal('edit-profile-modal');
    toast('Perfil atualizado!', 'success');
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  } finally {
    setLoading(btn, false, 'Salvar');
  }
}

// ============================================================
//  CATEGORIAS
// ============================================================
async function loadCategories() {
  const { data = [], error } = await sb
    .from(APP.tables.categories)
    .select('id, name')
    .order('name');
  if (error) return console.error('loadCategories:', error);
  state.categories = data;
}

function renderCategoryChips() {
  const box = $('category-filters');
  if (!box) return;

  const allChip = `
    <button class="chip ${state.activeCategory === null ? 'active' : ''}"
            onclick="setCategory(null, this)">Todas</button>`;

  const catChips = state.categories.map(c => `
    <button class="chip ${state.activeCategory === c.id ? 'active' : ''}"
            onclick="setCategory(${c.id}, this)">${esc(c.name)}</button>
  `).join('');

  box.innerHTML = allChip + catChips;
}

function setCategory(categoryId, btn) {
  state.activeCategory = categoryId;
  document.querySelectorAll('#category-filters .chip')
    .forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderStores();
}

// ============================================================
//  LOJAS
// ============================================================
async function loadStores() {
  const { data = [], error } = await sb
    .from(APP.tables.stores)
    .select(`id, name, created_at, category_id,
             categories (id, name),
             menu_items (id, name, description, price)`)
    .order('name');

  if (error) return console.error('loadStores:', error);

  state.stores = data;
  renderStores();
}

function renderStores() {
  const term = ($('search-input')?.value || '').toLowerCase().trim();

  let list = !term
    ? state.stores
    : state.stores.filter(s =>
        s.name.toLowerCase().includes(term) ||
        (s.menu_items || []).some(m => m.name.toLowerCase().includes(term))
      );

  if (state.activeCategory !== null) {
    list = list.filter(s => s.category_id === state.activeCategory);
  }

  const html = list.length === 0
    ? `<div style="grid-column:1/-1;text-align:center;padding:40px;">
         <p class="text-light">Nenhuma loja encontrada.</p></div>`
    : list.map(storeCard).join('');

  ['home-list', 'explore-list'].forEach(id => {
    if ($(id)) $(id).innerHTML = html;
  });
}

function storeCard(s) {
  const cover = imgUrl(`stores/${s.id}.jpg`);
  const items = s.menu_items || [];
  const categoryName = s.categories?.name || 'Sem categoria';
  const preview = items.slice(0, 3).map(m => esc(m.name)).join(' · ')
    || 'Sem itens cadastrados';

  return `
    <div class="rest-card" onclick="openStore(${s.id})">
      <img class="rest-cover" src="${cover}" alt=""
           onerror="this.style.display='none'">
      <div class="rest-content">
        <div class="rest-header"><h3>${esc(s.name)}</h3></div>
        <div class="rest-category">${esc(categoryName)}</div>
        <p class="text-light">
          ${items.length} ${items.length === 1 ? 'item' : 'itens'} no cardápio
        </p>
        <div class="rest-dishes-text">${preview}</div>
      </div>
    </div>`;
}

function openStore(id) {
  const s = state.stores.find(x => x.id === id);
  if (!s) return;

  const categoryName = s.categories?.name || 'Sem categoria';
  const count = (s.menu_items || []).length;

  $('store-modal-name').textContent = s.name;
  $('store-modal-meta').textContent =
    `${categoryName} · ${count} ${count === 1 ? 'item' : 'itens'} no cardápio`;

  const menu = $('store-modal-menu');
  if (!s.menu_items?.length) {
    menu.innerHTML = `<p class="text-light">Esta loja ainda não tem itens.</p>`;
  } else {
    menu.innerHTML = s.menu_items.map(m => {
      const thumb = imgUrl(`menu_items/${m.id}.jpg`);
      return `
        <div class="menu-item-row">
          <img class="menu-thumb" src="${thumb}" alt=""
               onerror="this.style.display='none'">
          <div style="flex:1;min-width:0;">
            <strong>${esc(m.name)}</strong>
            ${m.description ? `<p class="text-light">${esc(m.description)}</p>` : ''}
          </div>
          <span class="menu-item-price">
            R$ ${Number(m.price || 0).toFixed(2).replace('.', ',')}
          </span>
        </div>`;
    }).join('');
  }
  openModal('store-modal');
}

// ============================================================
//  UX GLOBAL
// ============================================================
function bindSearch() {
  const i = $('search-input');
  if (i) i.addEventListener('input', renderStores);
}

function bindGlobalUX() {
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', e => {
      if (e.target === o) closeModal(o.id);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active')
        .forEach(m => closeModal(m.id));
    }
  });
}

function switchView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`view-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function openModal(id) {
  $(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).classList.remove('active');
  document.body.style.overflow = '';
}

async function logout() {
  await sb.auth.signOut();
  location.href = 'login.html';
}

// ============================================================
//  HELPERS
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

function setLoading(btn, on, txt = 'Salvar') {
  if (!btn) return;
  btn.disabled = on;
  btn.innerHTML = on ? '<i class="fas fa-spinner fa-spin"></i> ...' : txt;
}