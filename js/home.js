/* home.js — the calendar-driven entry & history tab */

const HomeState = { year: null, monthIdx: null, daysByDate: {}, currency: '৳' };

function buildMonthGrid(year, monthIdx) {
  const firstOfMonth = new Date(year, monthIdx, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, monthIdx, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

async function renderHomePage() {
  const now = new Date();
  if (HomeState.year == null) { HomeState.year = now.getFullYear(); HomeState.monthIdx = now.getMonth(); }

  qs('#page-home').innerHTML = `
    <div class="page-head"><h1>Home</h1><p>Book today's — or any upcoming — lunch.</p></div>
    <div class="month-bar">
      <button class="icon-btn" id="home-prev" aria-label="Previous month"><i data-lucide="chevron-left"></i></button>
      <h2 id="home-month-label"></h2>
      <button class="icon-btn" id="home-next" aria-label="Next month"><i data-lucide="chevron-right"></i></button>
      <button class="btn btn--ghost btn--sm" id="home-today">Today</button>
    </div>
    <div class="calendar" id="home-calendar">
      <div class="calendar-grid">${'<div class="cal-cell cal-cell--skeleton"></div>'.repeat(35)}</div>
    </div>
    <div class="legend">
      <span><i class="legend-dot legend-dot--booked"></i> Booked</span>
      <span><i class="legend-dot legend-dot--open"></i> Open</span>
      <span><i class="legend-dot legend-dot--locked"></i> Locked</span>
      <span><i class="legend-dot legend-dot--holiday"></i> Holiday</span>
    </div>`;
  paintIcons();

  qs('#home-prev').addEventListener('click', () => shiftMonth(-1));
  qs('#home-next').addEventListener('click', () => shiftMonth(1));
  qs('#home-today').addEventListener('click', () => {
    const n = new Date();
    HomeState.year = n.getFullYear(); HomeState.monthIdx = n.getMonth();
    loadHomeMonth();
  });

  await loadHomeMonth();
}

function shiftMonth(delta) {
  HomeState.monthIdx += delta;
  if (HomeState.monthIdx < 0) { HomeState.monthIdx = 11; HomeState.year--; }
  if (HomeState.monthIdx > 11) { HomeState.monthIdx = 0; HomeState.year++; }
  loadHomeMonth();
}

async function loadHomeMonth() {
  qs('#home-month-label').textContent = monthLabel(HomeState.year, HomeState.monthIdx);
  const start = fmtDate(new Date(HomeState.year, HomeState.monthIdx, 1));
  const end = fmtDate(new Date(HomeState.year, HomeState.monthIdx + 1, 0));
  try {
    const { days, currency } = await apiCall('getCalendar', { startDate: start, endDate: end });
    HomeState.currency = currency;
    HomeState.daysByDate = {};
    days.forEach(d => HomeState.daysByDate[d.date] = d);
    renderCalendarGrid();
  } catch (err) { apiErrorToast(err); }
}

function renderCalendarGrid() {
  const cells = buildMonthGrid(HomeState.year, HomeState.monthIdx);
  const todayStr = fmtDate(new Date());
  let html = '<div class="calendar-grid">';
  WEEKDAYS_SHORT.forEach(w => html += `<div class="cal-weekday">${w}</div>`);

  cells.forEach(d => {
    if (!d) { html += '<div class="cal-cell cal-cell--empty" aria-hidden="true"></div>'; return; }
    const dateStr = fmtDate(d);
    const info = HomeState.daysByDate[dateStr];
    if (!info) { html += '<div class="cal-cell cal-cell--empty"></div>'; return; }

    const classes = ['cal-cell'];
    if (info.isHoliday) classes.push('cal-cell--holiday');
    else if (info.locked) classes.push('cal-cell--locked');
    else classes.push('cal-cell--open');
    if (info.ordered) classes.push('cal-cell--booked');
    if (dateStr === todayStr) classes.push('cal-cell--today');

    let indicator;
    if (info.isHoliday) indicator = '<span class="cal-cell__tag">Holiday</span>';
    else if (info.ordered) indicator = '<span class="stamp-mark" aria-hidden="true"><i data-lucide="check"></i></span>';
    else if (info.locked) indicator = '<span class="cal-cell__lock" aria-hidden="true"><i data-lucide="lock"></i></span>';
    else indicator = `<span class="cal-cell__price">${money(info.price, HomeState.currency)}</span>`;

    html += `
      <button type="button" class="${classes.join(' ')}" data-date="${dateStr}">
        <span class="cal-cell__num">${d.getDate()}</span>
        ${indicator}
      </button>`;
  });

  html += '</div>';
  qs('#home-calendar').innerHTML = html;
  paintIcons();
  qsa('.cal-cell[data-date]').forEach(btn => btn.addEventListener('click', () => openDayModal(btn.dataset.date)));
}

function lockReasonText(reason) {
  if (reason === 'cutoff') return 'The cut-off time has passed for this day.';
  if (reason === 'beyond-booking-window') return 'This date is not open for booking yet.';
  return 'This date is locked.';
}

function openDayModal(dateStr) {
  const info = HomeState.daysByDate[dateStr];
  if (!info) return;
  const canAct = !info.locked;

  let actionHtml;
  if (info.isHoliday) {
    actionHtml = `<div class="locked-note"><i data-lucide="calendar-off"></i> No lunch service — office holiday.</div>`;
  } else if (info.ordered) {
    actionHtml = canAct
      ? `<button class="btn btn--danger btn--full" id="day-cancel"><i data-lucide="x-circle"></i> Cancel booking</button>`
      : `<div class="locked-note"><i data-lucide="lock"></i> ${lockReasonText(info.reason)}</div>`;
  } else {
    actionHtml = canAct
      ? `<button class="btn btn--primary btn--full" id="day-book"><i data-lucide="check-circle-2"></i> Book lunch</button>`
      : `<div class="locked-note"><i data-lucide="lock"></i> ${lockReasonText(info.reason)}</div>`;
  }

  openModal({
    title: niceDate(dateStr),
    bodyHtml: `
      <div class="day-detail">
        <div class="day-detail__menu"><i data-lucide="utensils-crossed"></i><span>${escapeHtml(info.menuText || 'Menu not set yet')}</span></div>
        <div class="day-detail__price">${money(info.ordered ? info.amount : info.price, HomeState.currency)}</div>
        ${actionHtml}
      </div>`
  });

  if (qs('#day-book')) qs('#day-book').addEventListener('click', () => submitDayEntry(dateStr, 'add'));
  if (qs('#day-cancel')) qs('#day-cancel').addEventListener('click', () => submitDayEntry(dateStr, 'cancel'));
}

async function submitDayEntry(dateStr, action) {
  const btn = qs('#day-book') || qs('#day-cancel');
  if (btn) setBusy(btn, true);
  try {
    const res = await apiCall('setEntry', { date: dateStr, action });
    HomeState.daysByDate[dateStr].ordered = (action === 'add');
    if (action === 'add') HomeState.daysByDate[dateStr].amount = res.amount;
    closeModal();
    renderCalendarGrid();
    if (action === 'add') { flashBookedStamp(dateStr); showToast(res.message, 'success'); }
    else showToast(res.message, 'info');
  } catch (err) {
    apiErrorToast(err);
    if (btn) setBusy(btn, false);
  }
}

function flashBookedStamp(dateStr) {
  const cell = qs(`.cal-cell[data-date="${dateStr}"]`);
  const stamp = cell && cell.querySelector('.stamp-mark');
  if (!stamp) return;
  stamp.classList.add('stamp-mark--pop');
  setTimeout(() => stamp.classList.remove('stamp-mark--pop'), 650);
}
