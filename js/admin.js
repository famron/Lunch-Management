/* admin.js — everything under the Admin tab */

const AdminState = { section: 'settings', overridesMonth: null };
const AdminUsersState = { filter: 'PendingApproval' };

const ADMIN_SECTIONS = [
  { id: 'settings', label: 'Settings', icon: 'sliders-horizontal' },
  { id: 'menu', label: 'Menu & Pricing', icon: 'utensils' },
  { id: 'users', label: 'Approvals', icon: 'users' },
  { id: 'print', label: 'Print Orders', icon: 'printer' }
];

function renderAdminPage() {
  qs('#page-admin').innerHTML = `
    <div class="page-head"><h1>Admin</h1><p>Configure rules, menus, approvals, and printing.</p></div>
    <div class="tabs" id="admin-tabs">
      ${ADMIN_SECTIONS.map(s => `<button class="tab-btn ${s.id === AdminState.section ? 'is-active' : ''}" data-s="${s.id}"><i data-lucide="${s.icon}"></i>${s.label}</button>`).join('')}
    </div>
    <div id="admin-section-body"><div class="card skeleton-block"></div></div>`;
  paintIcons();
  qsa('#admin-tabs .tab-btn').forEach(b => b.addEventListener('click', () => { AdminState.section = b.dataset.s; renderAdminPage(); }));
  loadAdminSection();
}

function loadAdminSection() {
  if (AdminState.section === 'settings') renderSettingsSection();
  else if (AdminState.section === 'menu') renderMenuSection();
  else if (AdminState.section === 'users') renderUsersSection();
  else if (AdminState.section === 'print') renderPrintSection();
}

/* ---------------------------------------------------------- Settings */

async function renderSettingsSection() {
  let settings;
  try { ({ settings } = await apiCall('adminGetSettings', {})); } catch (e) { return apiErrorToast(e); }
  const holidays = String(settings.WeeklyHolidays || '').split(',').map(s => s.trim()).filter(Boolean);

  qs('#admin-section-body').innerHTML = `
    <div class="card form-card">
      <h3 style="margin-top:0">General</h3>
      <div class="field"><label>Organization name</label><input id="st-org" value="${escapeHtml(settings.OrgName || '')}"></div>
      <div class="field"><label>Currency symbol</label><input id="st-currency" value="${escapeHtml(settings.CurrencySymbol || '৳')}" style="max-width:100px"></div>
    </div>
    <div class="card form-card">
      <h3 style="margin-top:0">Weekly holidays</h3>
      <p class="muted">Days the canteen is closed every week — these are always locked for booking.</p>
      <div class="chip-group" id="st-holidays">
        ${WEEKDAYS.map(d => `<button type="button" class="chip ${holidays.indexOf(d) !== -1 ? 'is-active' : ''}" data-d="${d}">${d}</button>`).join('')}
      </div>
    </div>
    <div class="card form-card">
      <h3 style="margin-top:0">Booking rules</h3>
      <div class="field"><label>Minimum notice before lunch service</label>
        <div class="input-suffix"><input type="number" id="st-cutoff" min="0" value="${Number(settings.CutoffHours) || 24}"><span>hours</span></div>
      </div>
      <div class="field"><label>Lunch service time</label><input type="time" id="st-servicetime" value="${escapeHtml(settings.LunchServiceTime || '13:00')}"></div>
      <div class="field"><label>Latest bookable date</label><input type="date" id="st-maxdate" value="${escapeHtml(settings.MaxBookableDate || '')}"></div>
      <p class="muted">Keep this at the end of the current month to keep next month closed; move it forward whenever you're ready to open new bookings.</p>
    </div>
    <button class="btn btn--primary" id="st-save"><i data-lucide="save"></i> Save settings</button>`;
  paintIcons();

  qsa('#st-holidays .chip').forEach(c => c.addEventListener('click', () => c.classList.toggle('is-active')));
  qs('#st-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget; setBusy(btn, true);
    try {
      const chosen = qsa('#st-holidays .chip.is-active').map(c => c.dataset.d).join(',');
      await apiCall('adminSaveSettings', {
        settings: {
          OrgName: qs('#st-org').value.trim(), CurrencySymbol: qs('#st-currency').value.trim() || '৳',
          WeeklyHolidays: chosen, CutoffHours: Number(qs('#st-cutoff').value) || 0,
          LunchServiceTime: qs('#st-servicetime').value || '13:00', MaxBookableDate: qs('#st-maxdate').value
        }
      });
      showToast('Settings saved.', 'success');
    } catch (err) { apiErrorToast(err); } finally { setBusy(btn, false); }
  });
}

/* ------------------------------------------------------- Menu & Pricing */

async function renderMenuSection() {
  if (!AdminState.overridesMonth) { const n = new Date(); AdminState.overridesMonth = monthKey(n.getFullYear(), n.getMonth()); }
  let template;
  try { ({ template } = await apiCall('adminGetMenuTemplate', {})); } catch (e) { return apiErrorToast(e); }

  qs('#admin-section-body').innerHTML = `
    <div class="card form-card">
      <h3 style="margin-top:0">Weekly menu & price</h3>
      <p class="muted">The default menu for each weekday. Use date overrides below for one-off changes or extra holidays.</p>
      <div class="table-scroll">
        <table class="edit-table">
          <thead><tr><th>Day</th><th>Menu</th><th>Price</th></tr></thead>
          <tbody id="menu-template-rows">
            ${template.map(t => `<tr data-day="${t.day}">
              <td>${t.day}</td>
              <td><input class="mt-menu" value="${escapeHtml(t.menuText)}"></td>
              <td><input class="mt-price" type="number" min="0" value="${t.price}"></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button class="btn btn--primary" id="menu-save"><i data-lucide="save"></i> Save weekly menu</button>
    </div>
    <div class="card form-card">
      <div class="row-between"><h3 style="margin:0">Date overrides & extra holidays</h3>
        <button class="btn btn--secondary btn--sm" id="override-add"><i data-lucide="plus"></i> Add</button>
      </div>
      <div class="month-bar month-bar--compact">
        <button class="icon-btn" id="ov-prev" aria-label="Previous month"><i data-lucide="chevron-left"></i></button>
        <span id="ov-month-label"></span>
        <button class="icon-btn" id="ov-next" aria-label="Next month"><i data-lucide="chevron-right"></i></button>
      </div>
      <div id="override-list"></div>
    </div>`;
  paintIcons();

  qs('#menu-save').addEventListener('click', saveMenuTemplate);
  qs('#override-add').addEventListener('click', () => openOverrideModal(null));
  qs('#ov-prev').addEventListener('click', () => shiftOverridesMonth(-1));
  qs('#ov-next').addEventListener('click', () => shiftOverridesMonth(1));
  await loadOverridesForMonth();
}

async function saveMenuTemplate() {
  const rows = qsa('#menu-template-rows tr');
  const template = rows.map(r => ({ day: r.dataset.day, menuText: r.querySelector('.mt-menu').value.trim(), price: Number(r.querySelector('.mt-price').value) || 0 }));
  try { await apiCall('adminSaveMenuTemplate', { template }); showToast('Weekly menu saved.', 'success'); } catch (e) { apiErrorToast(e); }
}

function shiftOverridesMonth(delta) {
  const [y, m] = AdminState.overridesMonth.split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  AdminState.overridesMonth = monthKey(d.getFullYear(), d.getMonth());
  loadOverridesForMonth();
}

let _overridesCache = [];
async function loadOverridesForMonth() {
  const [y, m] = AdminState.overridesMonth.split('-').map(Number);
  qs('#ov-month-label').textContent = monthLabel(y, m - 1);
  const start = fmtDate(new Date(y, m - 1, 1));
  const end = fmtDate(new Date(y, m, 0));
  try {
    const { overrides } = await apiCall('adminGetDateOverrides', { startDate: start, endDate: end });
    _overridesCache = overrides;
    const list = qs('#override-list');
    if (!overrides.length) { list.innerHTML = '<p class="muted">No overrides this month.</p>'; return; }
    list.innerHTML = overrides.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(o => `
      <button type="button" class="override-row" data-date="${o.date}">
        <span class="override-row__date">${niceDate(o.date)}</span>
        <span class="override-row__info">${o.isHoliday ? '<span class="badge badge--holiday">Holiday</span>' : ''} ${escapeHtml(o.menuText || '')}${o.price != null ? ' · ' + money(o.price) : ''}</span>
        <i data-lucide="chevron-right"></i>
      </button>`).join('');
    paintIcons();
    qsa('.override-row').forEach(row => row.addEventListener('click', () => {
      openOverrideModal(_overridesCache.find(x => x.date === row.dataset.date));
    }));
  } catch (e) { apiErrorToast(e); }
}

function openOverrideModal(existing) {
  openModal({
    title: existing ? 'Edit override — ' + niceDate(existing.date) : 'Add date override',
    bodyHtml: `
      <div class="field"><label>Date</label><input type="date" id="ov-date" value="${existing ? existing.date : ''}" ${existing ? 'disabled' : ''}></div>
      <div class="field"><label>Menu text <span class="muted">(blank keeps the weekly default)</span></label><input id="ov-menu" value="${escapeHtml(existing ? existing.menuText : '')}"></div>
      <div class="field"><label>Price <span class="muted">(blank keeps the weekly default)</span></label><input type="number" min="0" id="ov-price" value="${existing && existing.price != null ? existing.price : ''}"></div>
      <label class="checkbox-row"><input type="checkbox" id="ov-holiday" ${existing && existing.isHoliday ? 'checked' : ''}> Mark as holiday (blocks booking that day)</label>
      <div class="field"><label>Note <span class="muted">(admin-only)</span></label><input id="ov-note" value="${escapeHtml(existing ? existing.note : '')}"></div>
      <div class="modal-actions">
        ${existing ? '<button class="btn btn--danger" id="ov-delete"><i data-lucide="trash-2"></i> Remove</button>' : '<span></span>'}
        <button class="btn btn--primary" id="ov-save"><i data-lucide="save"></i> Save</button>
      </div>`
  });
  qs('#ov-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget; setBusy(btn, true);
    try {
      await apiCall('adminSaveDateOverride', {
        date: qs('#ov-date').value, menuText: qs('#ov-menu').value.trim(),
        price: qs('#ov-price').value, isHoliday: qs('#ov-holiday').checked, note: qs('#ov-note').value.trim()
      });
      closeModal(); showToast('Override saved.', 'success'); loadOverridesForMonth();
    } catch (err) { apiErrorToast(err); setBusy(btn, false); }
  });
  if (existing) qs('#ov-delete').addEventListener('click', async () => {
    try { await apiCall('adminDeleteDateOverride', { date: existing.date }); closeModal(); showToast('Override removed.', 'info'); loadOverridesForMonth(); }
    catch (err) { apiErrorToast(err); }
  });
}

/* ----------------------------------------------------------- Approvals */

function labelForStatus(s) { return { PendingApproval: 'Pending', Approved: 'Approved', Rejected: 'Rejected', Suspended: 'Suspended' }[s] || s; }

function renderUsersSection() {
  qs('#admin-section-body').innerHTML = `
    <div class="chip-group" id="user-filter">
      ${['PendingApproval', 'Approved', 'Rejected', 'Suspended'].map(s => `<button type="button" class="chip ${AdminUsersState.filter === s ? 'is-active' : ''}" data-s="${s}">${labelForStatus(s)}</button>`).join('')}
    </div>
    <div id="user-list" class="stack"><div class="card skeleton-block"></div></div>`;
  qsa('#user-filter .chip').forEach(c => c.addEventListener('click', () => { AdminUsersState.filter = c.dataset.s; renderUsersSection(); }));
  loadUserList();
}

async function loadUserList() {
  try {
    const { users } = await apiCall('adminListUsers', { status: AdminUsersState.filter });
    const root = qs('#user-list');
    if (!users.length) { root.innerHTML = '<p class="muted">No users in this list.</p>'; return; }
    root.innerHTML = users.map(u => `
      <div class="card user-row">
        <div class="user-row__avatar">${escapeHtml(initials(u.name))}</div>
        <div class="user-row__info">
          <strong>${escapeHtml(u.name)}</strong>
          <span class="muted">${escapeHtml(u.employeeId)} · ${escapeHtml(u.email)} · ${escapeHtml(u.modality)}</span>
        </div>
        <div class="user-row__actions">${userActionButtons(u)}</div>
      </div>`).join('');
    paintIcons();
    qsa('[data-approve]').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.approve, 'Approved')));
    qsa('[data-reject]').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.reject, 'Rejected')));
    qsa('[data-suspend]').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.suspend, 'Suspended')));
    qsa('[data-reinstate]').forEach(b => b.addEventListener('click', () => setUserStatus(b.dataset.reinstate, 'Approved')));
  } catch (e) { apiErrorToast(e); }
}

function userActionButtons(u) {
  if (u.status === 'PendingApproval') return `
    <button class="btn btn--primary btn--sm" data-approve="${u.userId}"><i data-lucide="check"></i> Approve</button>
    <button class="btn btn--ghost btn--sm" data-reject="${u.userId}"><i data-lucide="x"></i> Reject</button>`;
  if (u.status === 'Approved') return `<button class="btn btn--ghost btn--sm" data-suspend="${u.userId}"><i data-lucide="ban"></i> Suspend</button>`;
  return `<button class="btn btn--secondary btn--sm" data-reinstate="${u.userId}"><i data-lucide="rotate-ccw"></i> Reinstate</button>`;
}

async function setUserStatus(userId, status) {
  try { await apiCall('adminSetUserStatus', { userId, status }); showToast('User updated.', 'success'); loadUserList(); }
  catch (e) { apiErrorToast(e); }
}

/* ------------------------------------------------------- Print orders */

async function renderPrintSection() {
  const todayStr = fmtDate(new Date());
  let org = CONFIG.ORG_NAME || 'Our Office';
  try { org = (await apiCall('adminGetSettings', {})).settings.OrgName || org; } catch (e) { /* use fallback */ }

  qs('#admin-section-body').innerHTML = `
    <div class="card form-card">
      <div class="field"><label>Date</label><input type="date" id="pr-date" value="${todayStr}"></div>
      <div class="field"><label>Heading</label><input id="pr-heading" value="${escapeHtml(org)} — Lunch Order List"></div>
      <div class="field"><label>Signature line(s) <span class="muted">(comma-separated)</span></label><input id="pr-signatures" value="Prepared by, Approved by"></div>
      <button class="btn btn--secondary" id="pr-load"><i data-lucide="list"></i> Load orders</button>
    </div>
    <div id="pr-preview"></div>`;
  paintIcons();
  qs('#pr-load').addEventListener('click', loadPrintPreview);
  qs('#pr-date').addEventListener('change', loadPrintPreview);
  await loadPrintPreview();
}

let _printPreviewData = null;
async function loadPrintPreview() {
  const date = qs('#pr-date').value;
  try {
    const data = await apiCall('adminGetDayOrders', { date });
    _printPreviewData = data;
    qs('#pr-preview').innerHTML = `
      <div class="card">
        <div class="row-between"><h3 style="margin:0">${niceDate(date)}</h3><span class="muted">${data.list.length} booked · ${money(data.total, data.currency)}</span></div>
        <p class="muted">Canteen: ${data.counts.Canteen || 0} · Parcel: ${data.counts.Parcel || 0}</p>
        <div class="table-scroll">
          <table class="edit-table">
            <thead><tr><th>#</th><th>Name</th><th>Employee ID</th><th>Modality</th></tr></thead>
            <tbody>${data.list.map((x, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.employeeId)}</td><td>${escapeHtml(x.modality)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No bookings for this day.</td></tr>'}</tbody>
          </table>
        </div>
        <button class="btn btn--primary" id="pr-print"><i data-lucide="printer"></i> Print</button>
      </div>`;
    paintIcons();
    qs('#pr-print').addEventListener('click', () => printDayOrders(date));
  } catch (e) { apiErrorToast(e); }
}

function printDayOrders(date) {
  const data = _printPreviewData;
  const heading = qs('#pr-heading').value.trim();
  const sigs = qs('#pr-signatures').value.split(',').map(s => s.trim()).filter(Boolean);
  renderPrintDocument({
    heading,
    subheading: niceDate(date) + ' · ' + data.list.length + ' meals · ' + money(data.total, data.currency),
    columns: ['#', 'Name', 'Employee ID', 'Modality'],
    rows: data.list.map((x, i) => [i + 1, x.name, x.employeeId, x.modality]),
    signatures: sigs
  });
  window.print();
}
