/* bills.js — the Bills tab, split between a user view and an admin view */

const BillsState = { month: null, adminSection: 'overview' };

function currentMonthKey() { const n = new Date(); return monthKey(n.getFullYear(), n.getMonth()); }
function billsMonthLabel() { const [y, m] = BillsState.month.split('-').map(Number); return monthLabel(y, m - 1); }

function renderBillsPage() {
  if (!BillsState.month) BillsState.month = currentMonthKey();
  if (State.user.role === 'Admin') renderAdminBills();
  else renderUserBills();
}

function shiftBillMonth(delta) {
  const [y, m] = BillsState.month.split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  BillsState.month = monthKey(d.getFullYear(), d.getMonth());
  if (State.user.role === 'Admin') loadAdminBillsSection(); else loadUserBill();
}

/* ==================================================================
   USER VIEW
   ================================================================== */

async function renderUserBills() {
  qs('#page-bills').innerHTML = `
    <div class="page-head"><h1>Bills</h1><p>Your monthly lunch bill and payment status.</p></div>
    <div class="month-bar">
      <button class="icon-btn" id="bill-prev" aria-label="Previous month"><i data-lucide="chevron-left"></i></button>
      <h2 id="bill-month-label">${billsMonthLabel()}</h2>
      <button class="icon-btn" id="bill-next" aria-label="Next month"><i data-lucide="chevron-right"></i></button>
    </div>
    <div id="bill-summary"><div class="card skeleton-block"></div></div>
    <div id="bill-days"></div>
    <div id="bill-payments"></div>`;
  paintIcons();
  qs('#bill-prev').addEventListener('click', () => shiftBillMonth(-1));
  qs('#bill-next').addEventListener('click', () => shiftBillMonth(1));
  await loadUserBill();
}

async function loadUserBill() {
  if (qs('#bill-month-label')) qs('#bill-month-label').textContent = billsMonthLabel();
  try {
    const bill = await apiCall('getMyBill', { month: BillsState.month });
    renderUserBillSummary(bill);
    renderUserBillDays(bill);
    renderUserBillPayments(bill);
  } catch (e) { apiErrorToast(e); }
}

function renderUserBillSummary(bill) {
  qs('#bill-summary').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><span class="stat-card__label">Total this month</span><span class="stat-card__value">${money(bill.total, bill.currency)}</span></div>
      <div class="stat-card"><span class="stat-card__label">Paid (verified)</span><span class="stat-card__value stat-card__value--good">${money(bill.verifiedPaid, bill.currency)}</span></div>
      <div class="stat-card"><span class="stat-card__label">Pending review</span><span class="stat-card__value">${money(bill.pendingClaims, bill.currency)}</span></div>
      <div class="stat-card stat-card--accent"><span class="stat-card__label">Due</span><span class="stat-card__value">${money(bill.due, bill.currency)}</span></div>
    </div>
    <button class="btn btn--primary section-action" id="pay-open" ${bill.due <= 0 ? 'disabled' : ''}><i data-lucide="banknote"></i> Submit payment</button>`;
  paintIcons();
  if (bill.due > 0) qs('#pay-open').addEventListener('click', () => openPaymentModal(bill));
}

function renderUserBillDays(bill) {
  qs('#bill-days').innerHTML = `
    <div class="card">
      <h3 style="margin-top:0">Daily breakdown</h3>
      ${bill.days.length ? `<div class="table-scroll"><table class="edit-table">
        <thead><tr><th>Date</th><th>Menu</th><th>Amount</th></tr></thead>
        <tbody>${bill.days.map(d => `<tr><td>${niceDate(d.date)}</td><td>${escapeHtml(d.menuText)}</td><td class="num">${money(d.amount, bill.currency)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="muted">No bookings this month yet.</p>'}
    </div>`;
}

function renderUserBillPayments(bill) {
  qs('#bill-payments').innerHTML = `
    <div class="card">
      <h3 style="margin-top:0">Your payment submissions</h3>
      ${bill.payments.length ? bill.payments.map(p => `
        <div class="payment-row">
          <div><strong>${money(p.amount, bill.currency)}</strong> <span class="muted">via ${escapeHtml(p.method)}</span></div>
          <span class="badge badge--${p.status.toLowerCase()}">${p.status}</span>
        </div>
        ${p.adminNote ? `<p class="muted payment-row__note">Admin note: ${escapeHtml(p.adminNote)}</p>` : ''}
      `).join('') : '<p class="muted">No payments submitted for this month.</p>'}
    </div>`;
}

function openPaymentModal(bill) {
  openModal({
    title: 'Submit payment',
    bodyHtml: `
      <div class="field"><label>Amount</label><input type="number" min="1" id="pay-amount" value="${bill.due > 0 ? bill.due : ''}"></div>
      <div class="field"><label>Payment method</label>
        <select id="pay-method">
          <option>bKash</option><option>Nagad</option><option>Rocket</option><option>Bank Transfer</option><option>Cash</option><option>Other</option>
        </select>
      </div>
      <div class="field"><label>Account / wallet number</label><input id="pay-account" placeholder="e.g. 017XXXXXXXX"></div>
      <div class="field"><label>Transaction ID</label><input id="pay-txn"></div>
      <div class="field"><label>Note <span class="muted">(optional)</span></label><input id="pay-note"></div>
      <div class="field"><label>Payment proof screenshot <span class="muted">(optional, under 4MB)</span></label><input type="file" accept="image/*" id="pay-proof"></div>
      <button class="btn btn--primary btn--full" id="pay-submit"><i data-lucide="send"></i> Submit for verification</button>`
  });
  paintIcons();
  qs('#pay-submit').addEventListener('click', async (e) => {
    const btn = e.currentTarget; setBusy(btn, true);
    try {
      let proofBase64 = null, proofFileName = null, proofMimeType = null;
      const file = qs('#pay-proof').files[0];
      if (file) {
        if (file.size > 4 * 1024 * 1024) throw new Error('Proof image must be under 4MB.');
        proofBase64 = await fileToBase64(file);
        proofFileName = file.name; proofMimeType = file.type;
      }
      await apiCall('submitPayment', {
        month: BillsState.month, amount: Number(qs('#pay-amount').value), method: qs('#pay-method').value,
        accountNumber: qs('#pay-account').value.trim(), transactionId: qs('#pay-txn').value.trim(),
        note: qs('#pay-note').value.trim(), proofBase64, proofFileName, proofMimeType
      });
      closeModal();
      showToast('Payment submitted for verification.', 'success');
      loadUserBill();
    } catch (err) { apiErrorToast(err); setBusy(btn, false); }
  });
}

/* ==================================================================
   ADMIN VIEW
   ================================================================== */

const BILLS_ADMIN_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'bar-chart-3' },
  { id: 'userwise', label: 'User-wise', icon: 'users' },
  { id: 'daywise', label: 'Day-wise', icon: 'calendar-days' },
  { id: 'payments', label: 'Payments', icon: 'banknote' }
];

function renderAdminBills() {
  qs('#page-bills').innerHTML = `
    <div class="page-head"><h1>Bills</h1><p>Review totals and verify payments.</p></div>
    <div class="tabs" id="bills-admin-tabs">
      ${BILLS_ADMIN_SECTIONS.map(s => `<button class="tab-btn ${s.id === BillsState.adminSection ? 'is-active' : ''}" data-s="${s.id}"><i data-lucide="${s.icon}"></i>${s.label}</button>`).join('')}
    </div>
    <div class="month-bar month-bar--compact">
      <button class="icon-btn" id="bill-prev" aria-label="Previous month"><i data-lucide="chevron-left"></i></button>
      <span id="bill-month-label">${billsMonthLabel()}</span>
      <button class="icon-btn" id="bill-next" aria-label="Next month"><i data-lucide="chevron-right"></i></button>
    </div>
    <div id="admin-bills-body"><div class="card skeleton-block"></div></div>`;
  paintIcons();
  qsa('#bills-admin-tabs .tab-btn').forEach(b => b.addEventListener('click', () => { BillsState.adminSection = b.dataset.s; renderAdminBills(); }));
  qs('#bill-prev').addEventListener('click', () => shiftBillMonth(-1));
  qs('#bill-next').addEventListener('click', () => shiftBillMonth(1));
  loadAdminBillsSection();
}

function loadAdminBillsSection() {
  if (qs('#bill-month-label')) qs('#bill-month-label').textContent = billsMonthLabel();
  if (BillsState.adminSection === 'overview') renderBillsOverview();
  else if (BillsState.adminSection === 'userwise') renderBillsUserwise();
  else if (BillsState.adminSection === 'daywise') renderBillsDaywise();
  else if (BillsState.adminSection === 'payments') renderBillsPayments();
}

let _donutChart = null, _barsChart = null;

async function renderBillsOverview() {
  try {
    const stats = await apiCall('adminGetPaymentStats', {});
    qs('#admin-bills-body').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><span class="stat-card__label">Due this month</span><span class="stat-card__value">${money(stats.currentMonth.due, stats.currency)}</span></div>
        <div class="stat-card"><span class="stat-card__label">Verified paid</span><span class="stat-card__value stat-card__value--good">${money(stats.currentMonth.paid, stats.currency)}</span></div>
        <div class="stat-card"><span class="stat-card__label">Pending review</span><span class="stat-card__value">${money(stats.currentMonth.pending, stats.currency)}</span></div>
      </div>
      <div class="chart-grid">
        <div class="card chart-card"><h3>This month</h3><div class="chart-wrap"><canvas id="chart-donut"></canvas></div></div>
        <div class="card chart-card"><h3>Last 6 months</h3><div class="chart-wrap"><canvas id="chart-bars"></canvas></div></div>
      </div>`;
    drawBillCharts(stats);
  } catch (e) { apiErrorToast(e); }
}

function drawBillCharts(stats) {
  if (!window.Chart) return;
  const styles = getComputedStyle(document.documentElement);
  const turmeric = styles.getPropertyValue('--turmeric').trim();
  const tamarind = styles.getPropertyValue('--tamarind').trim();
  const chili = styles.getPropertyValue('--chili').trim();
  const textColor = styles.getPropertyValue('--text').trim();

  if (_donutChart) _donutChart.destroy();
  const unpaid = Math.max(0, stats.currentMonth.due - stats.currentMonth.paid - stats.currentMonth.pending);
  _donutChart = new Chart(qs('#chart-donut'), {
    type: 'doughnut',
    data: { labels: ['Paid', 'Pending review', 'Unpaid'], datasets: [{ data: [stats.currentMonth.paid, stats.currentMonth.pending, unpaid], backgroundColor: [tamarind, turmeric, chili], borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Inter' } } } }, cutout: '66%' }
  });

  if (_barsChart) _barsChart.destroy();
  _barsChart = new Chart(qs('#chart-bars'), {
    type: 'bar',
    data: {
      labels: stats.series.map(s => s.month),
      datasets: [
        { label: 'Due', data: stats.series.map(s => s.due), backgroundColor: chili + '4D', borderRadius: 6, maxBarThickness: 28 },
        { label: 'Paid', data: stats.series.map(s => s.paid), backgroundColor: tamarind, borderRadius: 6, maxBarThickness: 28 }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: textColor, font: { family: 'Inter' } } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { ticks: { color: textColor }, grid: { color: 'rgba(128,128,128,.15)' } }
      }
    }
  });
}

async function renderBillsUserwise() {
  try {
    const data = await apiCall('adminGetBillMatrix', { month: BillsState.month });
    const label = billsMonthLabel();
    qs('#admin-bills-body').innerHTML = `
      <div class="card">
        <div class="row-between"><h3 style="margin:0">User-wise bill — ${label}</h3><span class="muted">Total: ${money(data.grandTotal, data.currency)}</span></div>
        <div class="field"><label>Print heading</label><input id="uw-heading" value="${escapeHtml(CONFIG.ORG_NAME)} — User-wise Lunch Bill — ${label}"></div>
        <div class="table-scroll"><table class="edit-table">
          <thead><tr><th>Name</th><th>Employee ID</th><th>Days</th><th>Total</th></tr></thead>
          <tbody>${data.userWise.map(u => `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.employeeId)}</td><td class="num">${u.days}</td><td class="num">${money(u.total, data.currency)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No data.</td></tr>'}</tbody>
          <tfoot><tr><td colspan="3">Grand total</td><td class="num">${money(data.grandTotal, data.currency)}</td></tr></tfoot>
        </table></div>
        <button class="btn btn--primary" id="uw-print"><i data-lucide="printer"></i> Print</button>
      </div>`;
    paintIcons();
    qs('#uw-print').addEventListener('click', () => {
      renderPrintDocument({
        heading: qs('#uw-heading').value.trim(), subheading: 'Grand total: ' + money(data.grandTotal, data.currency),
        columns: ['Name', 'Employee ID', 'Days', 'Total'],
        rows: data.userWise.map(u => [u.name, u.employeeId, u.days, money(u.total, data.currency)]),
        signatures: ['Prepared by', 'Approved by']
      });
      window.print();
    });
  } catch (e) { apiErrorToast(e); }
}

async function renderBillsDaywise() {
  try {
    const data = await apiCall('adminGetBillMatrix', { month: BillsState.month });
    const label = billsMonthLabel();
    qs('#admin-bills-body').innerHTML = `
      <div class="card">
        <div class="row-between"><h3 style="margin:0">Day-wise bill — ${label}</h3><span class="muted">Total: ${money(data.grandTotal, data.currency)}</span></div>
        <div class="field"><label>Print heading</label><input id="dw-heading" value="${escapeHtml(CONFIG.ORG_NAME)} — Day-wise Lunch Bill — ${label}"></div>
        <div class="table-scroll"><table class="edit-table">
          <thead><tr><th>Date</th><th>Meals</th><th>Total</th></tr></thead>
          <tbody>${data.dayWise.map(d => `<tr><td>${niceDate(d.date)}</td><td class="num">${d.count}</td><td class="num">${money(d.total, data.currency)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No data.</td></tr>'}</tbody>
          <tfoot><tr><td>Grand total</td><td></td><td class="num">${money(data.grandTotal, data.currency)}</td></tr></tfoot>
        </table></div>
        <button class="btn btn--primary" id="dw-print"><i data-lucide="printer"></i> Print</button>
      </div>`;
    paintIcons();
    qs('#dw-print').addEventListener('click', () => {
      renderPrintDocument({
        heading: qs('#dw-heading').value.trim(), subheading: 'Grand total: ' + money(data.grandTotal, data.currency),
        columns: ['Date', 'Meals', 'Total'],
        rows: data.dayWise.map(d => [niceDate(d.date), d.count, money(d.total, data.currency)]),
        signatures: ['Prepared by', 'Approved by']
      });
      window.print();
    });
  } catch (e) { apiErrorToast(e); }
}

function renderBillsPayments() {
  qs('#admin-bills-body').innerHTML = `
    <div class="chip-group" id="pay-filter">
      ${['Pending', 'Verified', 'Rejected'].map(s => `<button type="button" class="chip ${s === 'Pending' ? 'is-active' : ''}" data-s="${s}">${s}</button>`).join('')}
    </div>
    <div id="admin-payment-list" class="stack"><div class="card skeleton-block"></div></div>`;
  qsa('#pay-filter .chip').forEach(c => c.addEventListener('click', () => {
    qsa('#pay-filter .chip').forEach(x => x.classList.remove('is-active'));
    c.classList.add('is-active');
    loadAdminPayments(c.dataset.s);
  }));
  loadAdminPayments('Pending');
}

async function loadAdminPayments(status) {
  try {
    const { payments } = await apiCall('adminListPayments', { status });
    const root = qs('#admin-payment-list');
    if (!payments.length) { root.innerHTML = '<p class="muted">No payments here.</p>'; return; }
    root.innerHTML = payments.map(p => `
      <div class="card payment-review">
        <div class="row-between">
          <div><strong>${escapeHtml(p.name)}</strong> <span class="muted">${escapeHtml(p.month)}</span></div>
          <span class="badge badge--${p.status.toLowerCase()}">${p.status}</span>
        </div>
        <p class="muted">${money(p.amount)} via ${escapeHtml(p.method)} · Txn: ${escapeHtml(p.transactionId || '—')}${p.accountNumber ? ' · Acc: ' + escapeHtml(p.accountNumber) : ''}</p>
        ${p.note ? `<p class="muted">Note: ${escapeHtml(p.note)}</p>` : ''}
        ${p.proofFileUrl ? `<a href="${p.proofFileUrl}" target="_blank" rel="noopener" class="btn btn--ghost btn--sm"><i data-lucide="image"></i> View proof</a>` : ''}
        ${p.status === 'Pending' ? `
          <div class="modal-actions">
            <button class="btn btn--danger btn--sm" data-reject-pay="${p.id}"><i data-lucide="x"></i> Reject</button>
            <button class="btn btn--primary btn--sm" data-verify-pay="${p.id}"><i data-lucide="check"></i> Mark verified</button>
          </div>` : (p.adminNote ? `<p class="muted">Admin note: ${escapeHtml(p.adminNote)}</p>` : '')}
      </div>`).join('');
    paintIcons();
    qsa('[data-verify-pay]').forEach(b => b.addEventListener('click', () => verifyPayment(b.dataset.verifyPay, 'Verified')));
    qsa('[data-reject-pay]').forEach(b => b.addEventListener('click', () => verifyPayment(b.dataset.rejectPay, 'Rejected')));
  } catch (e) { apiErrorToast(e); }
}

async function verifyPayment(paymentId, status) {
  try {
    await apiCall('adminVerifyPayment', { paymentId, status });
    showToast('Payment ' + status.toLowerCase() + '.', 'success');
    const activeChip = qs('#pay-filter .chip.is-active');
    loadAdminPayments(activeChip ? activeChip.dataset.s : 'Pending');
  } catch (e) { apiErrorToast(e); }
}
