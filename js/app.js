// ============================================================
//  FoodCritic Fácil — delivery simples
//  Dados reais do Supabase · carrinho em localStorage · sem servidor
// ============================================================

const money = n => Number(n).toFixed(2).replace('.', ',');
const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const state = {
  view: 'inicio',
  loading: true,
  categories: [],
  stores: [],
  cuisine: null,   // category_id ou null
  city: null,      // string ou null
  restaurantId: null,
  cart: load('fc-cart', { rid: null, rname: null, whatsapp: null, items: [] }),
  address: load('fc-address', { name: '', phone: '', street: '', neighborhood: '' }),
  payment: null,
  needsChange: null,
  changeFor: '',
  order: load('fc-order', null),
  orderTicker: null,
};

const cartCount = () => state.cart.items.reduce((s, i) => s + i.qty, 0);
const cartTotal = () => state.cart.items.reduce((s, i) => s + i.qty * i.price, 0);
const qtyOf = id => state.cart.items.find(i => i.id === id)?.qty || 0;

function persistCart()    { save('fc-cart', state.cart); }
function persistAddress() { save('fc-address', state.address); }

function toast(msg, tone = 'success') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast ' + tone;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ---------- Init (Supabase) ----------
// ---------- Init (Supabase) ----------
(async function init() {
  // Categorias (opcional — se a tabela não existir, seguimos sem filtro de categoria)
  try {
    const { data, error } = await sb
      .from(APP.tables.categories)
      .select('id, name')
      .order('name');
    if (error) console.warn('categories:', error.message);
    state.categories = data || [];
  } catch (e) {
    console.warn('categories indisponível:', e?.message);
    state.categories = [];
  }

  // Lojas + itens de cardápio
  // 1ª tentativa: com join de categories
  // 2ª tentativa (fallback): sem join, se a 1ª falhar
  let storesRes = await sb
    .from(APP.tables.stores)
    .select('*, categories(id, name), menu_items(*)')
    .order('name');

  if (storesRes.error) {
    console.warn('stores com categories falhou, tentando sem o join:', storesRes.error.message);
    storesRes = await sb
      .from(APP.tables.stores)
      .select('*, menu_items(*)')
      .order('name');
  }

  if (storesRes.error) {
    console.error('stores:', storesRes.error);
    toast('Não foi possível carregar as lojas.', 'error');
    state.stores = [];
  } else {
    state.stores = (storesRes.data || []).map(s => ({
      ...s,
      cover: imgUrl(`stores/${s.id}.jpg`),
      menu_items: (s.menu_items || []).map(m => ({
        ...m,
        img: imgUrl(`menu_items/${m.id}.jpg`),
      })),
    }));
  }

  state.loading = false;
  render();
  updateNav();
  updateCartBadges();
})();

// ---------- Navegação ----------
function go(view, extra = {}) {
  Object.assign(state, extra);
  state.view = view;
  stopOrderTicker();
  if (view === 'pedido' && state.order) startOrderTicker();
  render();
  updateNav();
  window.scrollTo(0, 0);
}

function updateNav() {
  const map = {
    inicio: 'inicio', restaurante: 'inicio',
    carrinho: 'carrinho', entrega: 'carrinho', pagamento: 'carrinho',
    pedido: 'pedido',
  };
  const active = map[state.view] || 'inicio';
  document.querySelectorAll('.nav-btn[data-nav]').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === active);
  });
}

function updateCartBadges() {
  const n = cartCount();
  ['cart-badge-mobile', 'cart-badge-sidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = n; el.hidden = n === 0; }
  });
}

// ---------- Render ----------
function render() {
  const content = document.getElementById('view-content');
  const sidebar = document.getElementById('sidebar-right-content');
  if (!content) return;

  if (state.loading) {
    content.innerHTML = `<p class="empty-inline">Carregando...</p>`;
    return;
  }

  switch (state.view) {
    case 'inicio':      content.innerHTML = renderInicio(); break;
    case 'restaurante': content.innerHTML = renderRestaurante(); break;
    case 'carrinho':    content.innerHTML = renderCarrinho(); break;
    case 'entrega':     content.innerHTML = renderEntrega(); break;
    case 'pagamento':   content.innerHTML = renderPagamento(); break;
    case 'pedido':      content.innerHTML = renderPedido(); break;
    default:            content.innerHTML = renderInicio();
  }

  if (sidebar) sidebar.innerHTML = renderSidebar();
  updateCartBadges();
}

// ---------- Início ----------
function renderInicio() {
  const { cuisine, city, categories, stores } = state;

  const cities = [...new Set(stores.map(s => s.city).filter(Boolean))];
  const hasCities = cities.length > 0;

  const list = stores.filter(s => {
    if (cuisine !== null && s.category_id !== cuisine) return false;
    if (city && s.city !== city) return false;
    return true;
  });

  return `
    <header class="facil-header">
      <p class="logo-small">FoodCritic Fácil</p>
      <h1 class="page-title-facil">Olá! O que você quer comer?</h1>
    </header>

    ${hasCities ? `
      <h2 class="section-title-lg">Escolha sua cidade</h2>
      <div class="city-grid">
        ${cities.map(c => `
          <button class="city-btn ${city === c ? 'active' : ''}"
                  onclick="setCity('${esc(c)}')">
            <i class="fas fa-map-marker-alt"></i> ${esc(c)}
          </button>
        `).join('')}
      </div>
    ` : ''}

    <h2 class="section-title-lg">Categorias</h2>
    <div class="cat-chips">
      <button class="chip ${cuisine === null ? 'active' : ''}" onclick="setCuisine(null)">Todas</button>
      ${categories.map(c => `
        <button class="chip ${cuisine === c.id ? 'active' : ''}"
                onclick="setCuisine(${c.id})">${esc(c.name)}</button>
      `).join('')}
    </div>

    <h2 class="section-title-lg">Restaurantes</h2>
    ${list.length === 0 ? `<p class="empty-inline">Nenhum restaurante encontrado.</p>` : ''}
    <div class="rest-list">
      ${list.map(storeCard).join('')}
    </div>
  `;
}

function storeCard(s) {
  const items = s.menu_items || [];
  const catName = s.categories?.name || '';
  return `
    <button class="rest-card-facil" onclick="openStore(${s.id})">
      <img src="${s.cover}" alt="" onerror="this.style.visibility='hidden'">
      <div class="rest-info">
        <h3>${esc(s.name)}</h3>
        ${catName ? `<p>${esc(catName)}</p>` : ''}
        ${s.city ? `<p class="muted-small">${esc(s.city)}</p>` : ''}
        <p class="muted-small">${items.length} ${items.length === 1 ? 'item' : 'itens'} no cardápio</p>
        ${s.delivery_time ? `<p class="muted-small">Entrega em ${esc(s.delivery_time)}</p>` : ''}
        ${s.delivery_fee != null ? `<p class="muted-small">Taxa R$ ${money(s.delivery_fee)}</p>` : ''}
        ${s.open === false ? `<p class="closed-label">Fechado agora</p>` : ''}
      </div>
    </button>
  `;
}

// ---------- Restaurante ----------
function renderRestaurante() {
  const r = state.stores.find(x => x.id === state.restaurantId);
  if (!r) return `<p class="empty-inline">Restaurante não encontrado.</p>`;

  const isOpen = r.open !== false;

  return `
    <button class="btn-back-facil" onclick="go('inicio')">
      <i class="fas fa-arrow-left"></i> Voltar
    </button>

    <img class="cover-img" src="${r.cover}" alt="" onerror="this.style.visibility='hidden'">
    <h1 class="page-title-facil">${esc(r.name)}</h1>
    <span class="status-pill ${isOpen ? 'open' : 'closed'}">
      <i class="fas fa-${isOpen ? 'check-circle' : 'times-circle'}"></i>
      ${isOpen ? 'Aberto agora' : 'Fechado agora'}
    </span>
    ${r.categories?.name ? `<p class="muted">${esc(r.categories.name)}</p>` : ''}
    ${r.city ? `<p class="muted">${esc(r.city)}</p>` : ''}

    <h2 class="section-title-lg">Escolha seu prato</h2>
    ${(r.menu_items || []).length === 0 ? `<p class="empty-inline">Esta loja ainda não tem itens.</p>` : ''}
    ${(r.menu_items || []).map(d => {
      const q = qtyOf(d.id);
      return `
        <div class="dish-card-facil">
          <img src="${d.img}" alt="" onerror="this.style.visibility='hidden'">
          <div class="dish-body-facil">
            <strong>${esc(d.name)}</strong>
            ${d.description ? `<p class="muted small">${esc(d.description)}</p>` : ''}
            <span class="dish-price-facil">R$ ${money(d.price || 0)}</span>
            <div class="dish-actions-facil">
              ${q === 0 ? `
                <button class="btn-big btn-big-primary btn-big-sm"
                        onclick="addToCart(${r.id}, ${d.id})" ${!isOpen ? 'disabled' : ''}>
                  <i class="fas fa-plus"></i> Adicionar
                </button>
              ` : `
                <div class="qty-control">
                  <button onclick="changeQty(${d.id}, -1)" aria-label="Tirar um">−</button>
                  <span>${q}</span>
                  <button onclick="changeQty(${d.id}, 1)" aria-label="Pôr mais um">+</button>
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// ---------- Carrinho ----------
function renderCarrinho() {
  if (state.cart.items.length === 0) {
    return `
      <button class="btn-back-facil" onclick="go('inicio')">
        <i class="fas fa-arrow-left"></i> Voltar
      </button>
      <h1 class="page-title-facil">Meu carrinho</h1>
      <div class="empty-box">
        <i class="fas fa-shopping-bag"></i>
        <p>Seu carrinho está vazio.</p>
        <button class="btn-big btn-big-primary btn-big-block" onclick="go('inicio')">
          <i class="fas fa-utensils"></i> Escolher comida
        </button>
      </div>
    `;
  }

  return `
    <button class="btn-back-facil" onclick="go('restaurante', { restaurantId: ${state.cart.rid} })">
      <i class="fas fa-arrow-left"></i> Voltar
    </button>
    <h1 class="page-title-facil">Meu carrinho</h1>
    <p class="muted" style="margin-bottom:16px;">${esc(state.cart.rname)}</p>

    ${state.cart.items.map(i => `
      <div class="cart-item-facil">
        <div class="cart-item-info">
          <strong>${esc(i.name)}</strong>
          <span class="price">R$ ${money(i.price * i.qty)}</span>
        </div>
        <div class="qty-control">
          <button onclick="changeQty(${i.id}, -1)" aria-label="Tirar um">−</button>
          <span>${i.qty}</span>
          <button onclick="changeQty(${i.id}, 1)" aria-label="Pôr mais um">+</button>
        </div>
      </div>
    `).join('')}

    <div class="total-bar">
      <span>Total</span>
      <strong>R$ ${money(cartTotal())}</strong>
    </div>

    <button class="btn-big btn-big-primary btn-big-block" onclick="go('entrega')">
      <i class="fas fa-arrow-right"></i> Continuar
    </button>
  `;
}

// ---------- Endereço ----------
function renderEntrega() {
  if (state.cart.items.length === 0) return renderCarrinho();
  const a = state.address;

  return `
    <button class="btn-back-facil" onclick="go('carrinho')">
      <i class="fas fa-arrow-left"></i> Voltar
    </button>
    <h1 class="page-title-facil">Onde vamos entregar?</h1>

    <form onsubmit="submitEntrega(event)">
      <div class="field-facil">
        <label>Seu nome</label>
        <input name="name" value="${esc(a.name)}" autocomplete="name" required>
      </div>
      <div class="field-facil">
        <label>Telefone</label>
        <input name="phone" type="tel" value="${esc(a.phone)}" autocomplete="tel" required>
      </div>
      <div class="field-facil">
        <label>Rua e número</label>
        <input name="street" value="${esc(a.street)}" autocomplete="street-address" required>
      </div>
      <div class="field-facil">
        <label>Bairro</label>
        <input name="neighborhood" value="${esc(a.neighborhood)}" required>
      </div>

      <button type="submit" class="btn-big btn-big-primary btn-big-block">
        <i class="fas fa-arrow-right"></i> Continuar
      </button>
    </form>
  `;
}

function submitEntrega(e) {
  e.preventDefault();
  const f = e.target;
  const address = {
    name: f.name.value.trim(),
    phone: f.phone.value.trim(),
    street: f.street.value.trim(),
    neighborhood: f.neighborhood.value.trim(),
  };
  if (!address.name || !address.phone || !address.street || !address.neighborhood)
    return toast('Preencha todos os campos', 'error');
  state.address = address;
  persistAddress();
  go('pagamento');
}

// ---------- Pagamento ----------
function renderPagamento() {
  if (state.cart.items.length === 0) return renderCarrinho();

  const PAY = [
    { id: 'dinheiro', label: 'Dinheiro',          icon: 'fa-money-bill-wave' },
    { id: 'pix',      label: 'Pix',               icon: 'fa-qrcode' },
    { id: 'cartao',   label: 'Cartão na entrega', icon: 'fa-credit-card' },
  ];

  return `
    <button class="btn-back-facil" onclick="go('entrega')">
      <i class="fas fa-arrow-left"></i> Voltar
    </button>
    <h1 class="page-title-facil">Como você quer pagar?</h1>

    ${PAY.map(p => `
      <button class="pay-option ${state.payment === p.id ? 'active' : ''}"
              onclick="selectPayment('${p.id}')">
        <i class="fas ${p.icon}"></i>
        <span>${p.label}</span>
        ${state.payment === p.id ? '<i class="fas fa-check-circle check-icon"></i>' : ''}
      </button>
    `).join('')}

    ${state.payment === 'dinheiro' ? `
      <div class="change-box">
        <p class="change-title">Precisa de troco?</p>
        <div class="change-row">
          <button class="city-btn ${state.needsChange === 'nao' ? 'active' : ''}"
                  onclick="setChange('nao')">
            <i class="fas fa-check"></i> Não
          </button>
          <button class="city-btn ${state.needsChange === 'sim' ? 'active' : ''}"
                  onclick="setChange('sim')">
            <i class="fas fa-coins"></i> Sim
          </button>
        </div>
        ${state.needsChange === 'sim' ? `
          <div class="field-facil" style="margin-top:16px; margin-bottom:0;">
            <label>Troco para quanto? (R$)</label>
            <input type="text" inputmode="decimal" placeholder="Ex.: 50,00"
                   value="${esc(state.changeFor)}"
                   oninput="updateChangeFor(this.value)">
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div class="total-bar">
      <span>Total</span>
      <strong>R$ ${money(cartTotal())}</strong>
    </div>

    <button class="btn-big btn-big-primary btn-big-block" onclick="confirmarPedido()">
      <i class="fas fa-check"></i> Confirmar pedido
    </button>
  `;
}

function selectPayment(id) {
  state.payment = id;
  if (id !== 'dinheiro') { state.needsChange = null; state.changeFor = ''; }
  render();
}

function setChange(v) { state.needsChange = v; if (v === 'nao') state.changeFor = ''; render(); }
function updateChangeFor(v) { state.changeFor = v; }

function confirmarPedido() {
  if (!state.payment) return toast('Escolha como vai pagar', 'error');
  if (state.payment === 'dinheiro' && state.needsChange === null)
    return toast('Responda se precisa de troco', 'error');

  const change = state.payment === 'dinheiro' && state.needsChange === 'sim'
    ? parseFloat(state.changeFor.replace(',', '.')) || 0
    : null;

  if (state.payment === 'dinheiro' && state.needsChange === 'sim' && change <= 0)
    return toast('Digite para quanto precisa de troco', 'error');

  const store = state.stores.find(s => s.id === state.cart.rid);
  const PAY_LABEL = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão na entrega' };

  state.order = {
    id: 'FC' + Math.floor(1000 + Math.random() * 9000),
    restaurantId: state.cart.rid,
    restaurantName: state.cart.rname,
    whatsapp: store?.whatsapp || store?.phone || null,
    items: state.cart.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    total: cartTotal(),
    address: { ...state.address },
    payment: PAY_LABEL[state.payment],
    changeFor: change,
    createdAt: Date.now(),
  };
  save('fc-order', state.order);

  state.cart = { rid: null, rname: null, whatsapp: null, items: [] };
  persistCart();

  go('pedido');
}

// ---------- Pedido ----------
const STEPS = [
  { label: 'Recebido',          desc: 'O restaurante recebeu seu pedido',  icon: 'fa-inbox',      at: 0 },
  { label: 'Preparando',        desc: 'Estão fazendo sua comida',          icon: 'fa-utensils',   at: 12 },
  { label: 'Saiu para entrega', desc: 'O entregador está a caminho',       icon: 'fa-motorcycle', at: 30 },
  { label: 'Entregue',          desc: 'Bom apetite!',                      icon: 'fa-check',      at: 60 },
];

function currentStep(order) {
  const sec = (Date.now() - order.createdAt) / 1000;
  let step = 0;
  STEPS.forEach((s, i) => { if (sec >= s.at) step = i; });
  return step;
}

function renderPedido() {
  if (!state.order) {
    return `
      <button class="btn-back-facil" onclick="go('inicio')">
        <i class="fas fa-arrow-left"></i> Voltar
      </button>
      <h1 class="page-title-facil">Meu pedido</h1>
      <div class="empty-box">
        <i class="fas fa-receipt"></i>
        <p>Você ainda não fez um pedido.</p>
        <button class="btn-big btn-big-primary btn-big-block" onclick="go('inicio')">
          <i class="fas fa-utensils"></i> Ver restaurantes
        </button>
      </div>
    `;
  }

  const o = state.order;
  const step = currentStep(o);
  const finished = step === STEPS.length - 1;

  return `
    <button class="btn-back-facil" onclick="go('inicio')">
      <i class="fas fa-arrow-left"></i> Início
    </button>
    <h1 class="page-title-facil">Acompanhe seu pedido</h1>
    <p class="muted" style="margin-bottom:16px;">Pedido ${o.id} · ${esc(o.restaurantName)}</p>

    <div class="timeline-facil">
      ${STEPS.map((s, i) => {
        const done = i < step;
        const cur = i === step;
        return `
          <div>
            <div class="timeline-step-facil ${done ? 'done' : ''} ${cur ? 'current' : ''}">
              <div class="step-dot"><i class="fas ${done ? 'fa-check' : s.icon}"></i></div>
              <div class="step-text">
                <strong>${s.label}</strong>
                <span>${s.desc}</span>
              </div>
            </div>
            ${i < STEPS.length - 1 ? `<div class="step-line ${done ? 'done' : ''}"></div>` : ''}
          </div>
        `;
      }).join('')}
    </div>

    ${finished ? `
      <div class="success-box">
        <i class="fas fa-check-circle"></i>
        <span>Pedido entregue. Bom apetite!</span>
      </div>
    ` : ''}

    ${o.whatsapp ? `
      <a href="https://wa.me/${o.whatsapp}" target="_blank" rel="noreferrer"
         class="btn-big btn-big-ghost btn-big-block" style="margin-bottom:20px;">
        <i class="fab fa-whatsapp" style="color:#25d366; font-size:22px;"></i>
        Falar com o restaurante
      </a>
    ` : ''}

    <h2 class="section-title-lg">Resumo</h2>
    ${o.items.map(i => `
      <div class="summary-row">
        <span>${i.qty}× ${esc(i.name)}</span>
        <strong>R$ ${money(i.price * i.qty)}</strong>
      </div>
    `).join('')}
    <div class="summary-row summary-total">
      <span>Total</span>
      <strong>R$ ${money(o.total)}</strong>
    </div>
    <div class="summary-meta">
      <div>Pagamento: ${esc(o.payment)}</div>
      ${o.changeFor ? `<div>Troco para R$ ${money(o.changeFor)}</div>` : ''}
      <div>Entrega em: ${esc(o.address.street)}</div>
    </div>

    ${finished ? `
      <button class="btn-big btn-big-primary btn-big-block" style="margin-top:24px;"
              onclick="novoPedido()">
        <i class="fas fa-redo"></i> Fazer outro pedido
      </button>
    ` : ''}
  `;
}

function startOrderTicker() {
  stopOrderTicker();
  if (state.view !== 'pedido' || !state.order) return;
  state.orderTicker = setInterval(() => {
    if (state.view === 'pedido') render();
  }, 1000);
}

function stopOrderTicker() {
  if (state.orderTicker) { clearInterval(state.orderTicker); state.orderTicker = null; }
}

function novoPedido() {
  state.order = null;
  localStorage.removeItem('fc-order');
  go('inicio', { city: null, cuisine: null });
}

// ---------- Ações ----------
function setCuisine(id) { state.cuisine = id; render(); }
function setCity(c) { state.city = state.city === c ? null : c; render(); }

function openStore(id) {
  state.restaurantId = id;
  go('restaurante');
}

function addToCart(storeId, itemId) {
  const store = state.stores.find(s => s.id === storeId);
  if (!store) return;
  if (state.cart.rid !== storeId) {
    state.cart = { rid: storeId, rname: store.name, whatsapp: store.whatsapp || null, items: [] };
  }
  const item = store.menu_items.find(m => m.id === itemId);
  if (!item) return;
  const existing = state.cart.items.find(i => i.id === itemId);
  if (existing) existing.qty++;
  else state.cart.items.push({ id: item.id, name: item.name, price: Number(item.price) || 0, qty: 1 });
  persistCart();
  toast('Adicionado ao carrinho');
  render();
}

function changeQty(itemId, delta) {
  const item = state.cart.items.find(i => i.id === itemId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart.items = state.cart.items.filter(i => i.id !== itemId);
  if (state.cart.items.length === 0)
    state.cart = { rid: null, rname: null, whatsapp: null, items: [] };
  persistCart();
  render();
}

// ---------- Sidebar direita (desktop) ----------
function renderSidebar() {
  // Se está na tela de pedido e tem pedido ativo, mostra status
  if (state.view === 'pedido' && state.order) {
    const step = currentStep(state.order);
    const s = STEPS[step];
    return `
      <div class="sidebar-section">
        <h3 class="sidebar-title">Pedido atual</h3>
        <p class="sidebar-sub">${esc(state.order.restaurantName)}</p>
        <div class="sidebar-status">
          <i class="fas ${s.icon}"></i>
          <strong>${s.label}</strong>
        </div>
        <p class="sidebar-hint">${s.desc}</p>
      </div>
    `;
  }

  const count = cartCount();
  const total = cartTotal();

  if (count === 0) {
    return `
      <div class="sidebar-section">
        <h3 class="sidebar-title">Seu carrinho</h3>
        <p class="sidebar-empty">Ainda está vazio.</p>
        <button class="btn-big btn-big-primary btn-big-block" style="margin-top:16px;"
                onclick="go('inicio')">
          <i class="fas fa-utensils"></i> Escolher comida
        </button>
      </div>
    `;
  }

  return `
    <div class="sidebar-section">
      <h3 class="sidebar-title">Seu carrinho</h3>
      <p class="sidebar-sub">${esc(state.cart.rname)}</p>
      <div class="sidebar-items">
        ${state.cart.items.map(i => `
          <div class="sidebar-item">
            <span>${i.qty}× ${esc(i.name)}</span>
            <strong>R$ ${money(i.price * i.qty)}</strong>
          </div>
        `).join('')}
      </div>
      <div class="sidebar-total">
        <span>Total</span>
        <strong>R$ ${money(total)}</strong>
      </div>
      <button class="btn-big btn-big-primary btn-big-block" style="margin-top:16px;"
              onclick="go('carrinho')">
        Ver carrinho <i class="fas fa-arrow-right"></i>
      </button>
    </div>
  `;
}