/* utils.js — small shared helpers used by every page module */

// ---- Dates -----------------------------------------------------------
// IMPORTANT: never use `.toISOString().slice(0,10)` for calendar dates — it
// converts to UTC first and can shift the date by one day depending on the
// viewer's timezone. Always build/format dates from local Y/M/D components.

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateLocal(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysLocal(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(year, monthIdx) { return `${MONTH_NAMES[monthIdx]} ${year}`; }
function monthKey(year, monthIdx) { return `${year}-${String(monthIdx + 1).padStart(2, '0')}`; }
function niceDate(dateStr) {
  const d = parseDateLocal(dateStr);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}

// ---- Formatting --------------------------------------------------------

function money(amount, symbol) {
  const n = Number(amount) || 0;
  const rounded = Math.round(n * 100) / 100;
  const opts = { minimumFractionDigits: rounded % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 };
  return (symbol || '৳') + rounded.toLocaleString('en-US', opts);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ---- Icons ---------------------------------------------------------------

function paintIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
}

// ---- Toasts ----------------------------------------------------------

function showToast(message, type) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast--${type || 'info'}`;
  const icon = type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-circle' : 'info';
  el.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  paintIcons();
  requestAnimationFrame(() => el.classList.add('toast--in'));
  setTimeout(() => {
    el.classList.remove('toast--in');
    setTimeout(() => el.remove(), 250);
  }, 3800);
}

function apiErrorToast(err) {
  showToast(err && err.message ? err.message : 'Something went wrong.', 'error');
}

// ---- Modal -------------------------------------------------------------

function openModal({ title, bodyHtml, wide }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal-card ${wide ? 'modal-card--wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || '')}">
        <div class="modal-head">
          <h3>${escapeHtml(title || '')}</h3>
          <button class="icon-btn" id="modal-close" aria-label="Close"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    </div>`;
  paintIcons();
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  requestAnimationFrame(() => root.querySelector('.modal-backdrop').classList.add('modal-backdrop--in'));
}

function closeModal() {
  const root = document.getElementById('modal-root');
  const bd = root.querySelector('.modal-backdrop');
  if (!bd) return;
  bd.classList.remove('modal-backdrop--in');
  setTimeout(() => { root.innerHTML = ''; }, 200);
}

// ---- Misc ----------------------------------------------------------------

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

// ---- Printing -----------------------------------------------------------
// Populates the hidden #print-root, which only becomes visible under the
// @media print rules in styles.css (see "Print styles" section there).

function renderPrintDocument({ heading, subheading, columns, rows, signatures }) {
  const root = document.getElementById('print-root');
  root.innerHTML = `
    <div class="print-doc">
      <h1>${escapeHtml(heading || '')}</h1>
      ${subheading ? `<p class="print-doc__sub">${escapeHtml(subheading)}</p>` : ''}
      <table>
        <thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length}">No data</td></tr>`}</tbody>
      </table>
      <div class="print-doc__signatures">
        ${(signatures || []).map(s => `<div class="print-doc__sig"><span class="print-doc__sig-line"></span><span>${escapeHtml(s)}</span></div>`).join('')}
      </div>
      <p class="print-doc__footer">Generated ${new Date().toLocaleString()}</p>
    </div>`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}
