/* app.js — boots the app, owns the shell (nav/theme/routing) */

const State = {
  user: null,
  page: 'home'
};

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'utensils' },
  { id: 'bills', label: 'Bills', icon: 'receipt' },
  { id: 'admin', label: 'Admin', icon: 'shield-check', adminOnly: true }
];

// ---------------------------------------------------------------- Theme

function initTheme() {
  const saved = localStorage.getItem('lunch_theme');
  const preferred = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', preferred);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lunch_theme', next);
  paintIcons();
}

// ---------------------------------------------------------------- Boot

async function boot() {
  initTheme();
  paintIcons();

  const orgName = CONFIG.ORG_NAME || 'Lunch Management';
  qs('#auth-org-name').textContent = orgName;
  qs('#sidebar-org-name').textContent = orgName;
  qs('#theme-toggle-side').addEventListener('click', toggleTheme);

  if (CONFIG.DEMO_MODE) mountDemoBanner();

  if (!CONFIG.DEMO_MODE && !SessionStore.token) {
    showAuthShell();
    return;
  }
  if (CONFIG.DEMO_MODE && !SessionStore.token) SessionStore.token = 'demo-token';

  try {
    const { user } = await apiCall('getMe', {});
    State.user = user;
    showAppShell();
  } catch (e) {
    SessionStore.token = '';
    showAuthShell();
  }
}

function mountDemoBanner() {
  const el = document.createElement('div');
  el.className = 'demo-banner';
  el.innerHTML = `
    <i data-lucide="flask-conical"></i>
    <span>Demo mode — sample data only, nothing is saved. Viewing as</span>
    <div class="demo-banner__switch">
      <button class="demo-role-btn is-active" data-role="User">Employee</button>
      <button class="demo-role-btn" data-role="Admin">Admin</button>
    </div>`;
  document.body.prepend(el);
  paintIcons();
  qsa('.demo-role-btn', el).forEach(btn => btn.addEventListener('click', async () => {
    qsa('.demo-role-btn', el).forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    DemoDB.role = btn.dataset.role;
    const { user } = await apiCall('getMe', {});
    State.user = user;
    if (qs('#view-app') && !qs('#view-app').classList.contains('hidden')) {
      renderNav();
      goToPage(State.page === 'admin' && DemoDB.role !== 'Admin' ? 'home' : State.page);
    }
  }));
}

// ---------------------------------------------------------------- Shells

function showAuthShell() {
  qs('#view-app').classList.add('hidden');
  qs('#view-auth').classList.remove('hidden');
  renderAuth('login');
}

function showAppShell() {
  qs('#view-auth').classList.add('hidden');
  qs('#view-app').classList.remove('hidden');
  renderNav();
  renderTopbar();
  const requested = (location.hash || '').replace('#', '');
  const valid = NAV_ITEMS.map(n => n.id).concat(['account']);
  goToPage(valid.indexOf(requested) !== -1 ? requested : 'home');
}

function renderTopbar() {
  qs('#topbar').innerHTML = `
    <div class="topbar__brand">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">${escapeHtml(CONFIG.ORG_NAME || 'Lunch')}</span>
    </div>
    <div class="topbar__actions">
      <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme"><i data-lucide="sun-moon"></i></button>
      <button class="avatar-btn" id="avatar-btn" aria-label="Account menu">${escapeHtml(initials(State.user.name))}</button>
    </div>`;
  paintIcons();
  qs('#theme-toggle').addEventListener('click', toggleTheme);
  qs('#avatar-btn').addEventListener('click', () => openAccountMenu());
}

function openAccountMenu() {
  openModal({
    title: State.user.name,
    bodyHtml: `
      <p class="muted" style="margin-top:-8px">${escapeHtml(State.user.email)} · ${escapeHtml(State.user.employeeId)}</p>
      <div class="stack">
        <button class="btn btn--ghost btn--full" id="menu-account"><i data-lucide="user-cog"></i> Account settings</button>
        <button class="btn btn--ghost btn--full" id="menu-logout"><i data-lucide="log-out"></i> Log out</button>
      </div>`
  });
  qs('#menu-account').addEventListener('click', () => { closeModal(); goToPage('account'); });
  qs('#menu-logout').addEventListener('click', doLogout);
}

async function doLogout() {
  try { await apiCall('logout', {}); } catch (e) { /* ignore */ }
  SessionStore.token = '';
  State.user = null;
  closeModal();
  location.hash = '';
  showAuthShell();
  showToast('Logged out.', 'info');
}

// ---------------------------------------------------------------- Nav

function renderNav() {
  const isAdmin = State.user && State.user.role === 'Admin';
  const items = NAV_ITEMS.filter(n => !n.adminOnly || isAdmin);

  const navHtml = items.map(n => `
    <button class="nav-item" data-page="${n.id}" aria-label="${n.label}">
      <i data-lucide="${n.icon}"></i><span>${n.label}</span>
    </button>`).join('');

  qs('#sidebar-nav').innerHTML = navHtml;
  qs('#bottom-nav').innerHTML = navHtml;
  paintIcons();
  qsa('.nav-item').forEach(btn => btn.addEventListener('click', () => goToPage(btn.dataset.page)));
}

function goToPage(page) {
  State.page = page;
  location.hash = page;
  qsa('.nav-item').forEach(b => b.classList.toggle('is-active', b.dataset.page === page));
  qsa('.page').forEach(p => p.classList.add('hidden'));
  const el = qs('#page-' + page);
  if (el) el.classList.remove('hidden');

  if (page === 'home') renderHomePage();
  else if (page === 'bills') renderBillsPage();
  else if (page === 'admin') renderAdminPage();
  else if (page === 'account') renderAccountPage();
}

function renderAccountPage() {
  const u = State.user;
  qs('#page-account').innerHTML = `
    <div class="page-head"><h1>Account</h1><p>Your profile and login details.</p></div>
    <div class="card form-card">
      <div class="field"><label>Name</label><input value="${escapeHtml(u.name)}" disabled></div>
      <div class="field"><label>Employee ID</label><input value="${escapeHtml(u.employeeId)}" disabled></div>
      <div class="field"><label>Email</label><input value="${escapeHtml(u.email)}" disabled></div>
      <div class="field"><label>Phone</label><input id="acc-phone" value="${escapeHtml(u.phone)}"></div>
      <div class="field">
        <label>Lunch modality</label>
        <div class="segmented" id="acc-modality">
          <button type="button" class="${u.modality === 'Canteen' ? 'is-active' : ''}" data-v="Canteen">Canteen</button>
          <button type="button" class="${u.modality === 'Parcel' ? 'is-active' : ''}" data-v="Parcel">Parcel</button>
        </div>
      </div>
      <button class="btn btn--primary" id="acc-save"><i data-lucide="save"></i> Save changes</button>
    </div>
    <div class="card form-card">
      <h3 style="margin-top:0">Change password</h3>
      <div class="field"><label>Current password</label><input type="password" id="acc-cur-pass"></div>
      <div class="field"><label>New password</label><input type="password" id="acc-new-pass"></div>
      <button class="btn btn--secondary" id="acc-change-pass"><i data-lucide="lock"></i> Update password</button>
    </div>`;
  paintIcons();

  let modality = u.modality;
  qsa('#acc-modality button').forEach(b => b.addEventListener('click', () => {
    modality = b.dataset.v;
    qsa('#acc-modality button').forEach(x => x.classList.toggle('is-active', x === b));
  }));

  qs('#acc-save').addEventListener('click', async () => {
    try {
      await apiCall('updateProfile', { phone: qs('#acc-phone').value.trim(), modality });
      State.user.phone = qs('#acc-phone').value.trim();
      State.user.modality = modality;
      showToast('Profile updated.', 'success');
    } catch (e) { apiErrorToast(e); }
  });

  qs('#acc-change-pass').addEventListener('click', async () => {
    try {
      await apiCall('changePassword', { currentPassword: qs('#acc-cur-pass').value, newPassword: qs('#acc-new-pass').value });
      showToast('Password changed.', 'success');
      qs('#acc-cur-pass').value = ''; qs('#acc-new-pass').value = '';
    } catch (e) { apiErrorToast(e); }
  });
}

document.addEventListener('DOMContentLoaded', boot);
