/* api.js — talks to the Apps Script backend, or to an in-memory demo dataset */

const SessionStore = {
  KEY: 'lunch_session_token',
  get token() { return localStorage.getItem(SessionStore.KEY); },
  set token(v) { if (v) localStorage.setItem(SessionStore.KEY, v); else localStorage.removeItem(SessionStore.KEY); }
};

async function apiCall(action, payload) {
  payload = payload || {};
  if (CONFIG.DEMO_MODE) {
    await new Promise(r => setTimeout(r, 220 + Math.random() * 220)); // feel real
    return demoApiCall(action, payload);
  }

  // action/token are applied LAST so they can never be silently overwritten
  // by a same-named field in payload (this exact collision — a payload
  // "action" field clobbering the routing "action" — caused the
  // "Unknown action: add" bug; see js/home.js's use of "intent" instead).
  const body = Object.assign({}, payload, { action: action, token: SessionStore.token });
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight — see backend/Code.gs
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Could not reach the server. Check your connection and API_URL in js/config.js.');
  }
  let json;
  try { json = await res.json(); } catch (e) { throw new Error('The server returned an unexpected response.'); }
  if (!json.ok) throw new Error(json.error || 'Request failed.');
  return json.data;
}

/* ============================================================
   DEMO MODE — an in-memory stand-in for the whole backend so the
   real UI is fully explorable before you deploy anything.
   Mirrors the exact rules in backend/OrderService.gs so the demo
   behaves identically to the real system.
   ============================================================ */

const DemoDB = (function buildDemoDb() {
  const today = new Date();
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const sampleMeals = [
    { menuText: 'Chicken Biryani', price: 90 },
    { menuText: 'Beef Bhuna & Rice', price: 100 },
    { menuText: 'Fish Curry & Rice', price: 85 },
    { menuText: 'Mixed Vegetable & Rice', price: 70 },
    { menuText: 'Chicken Rezala & Rice', price: 95 },
    { menuText: 'Egg Curry & Rice', price: 65 }
  ];

  const db = {
    role: 'User',
    settings: {
      OrgName: CONFIG.ORG_NAME || 'Demo Office',
      WeeklyHolidays: 'Friday,Saturday',
      CutoffHours: '24',
      LunchServiceTime: '13:00',
      MaxBookableDate: fmtDate(monthEnd),
      CurrencySymbol: '৳',
      Currency: 'BDT'
    },
    overrides: {},  // dateStr -> { menuText, price, isHoliday, note } — this IS the menu, set per date
    orders: {},     // key `${userId}__${date}` -> { menuText, price, modality, status }
    payments: [],
    users: [
      { userId: 'U-DEMO-1', employeeId: 'EMP-104', name: 'You', email: 'demo.user@example.com', phone: '01700-000000', modality: 'Canteen', role: 'User', status: 'Approved', createdAt: fmtDate(today) },
      { userId: 'U-DEMO-2', employeeId: 'EMP-032', name: 'Nusrat Jahan', email: 'nusrat@example.com', phone: '01710-000000', modality: 'Parcel', role: 'User', status: 'Approved', createdAt: fmtDate(today) },
      { userId: 'U-DEMO-3', employeeId: 'EMP-091', name: 'Rakibul Islam', email: 'rakib@example.com', phone: '01720-000000', modality: 'Canteen', role: 'User', status: 'Approved', createdAt: fmtDate(today) },
      { userId: 'U-DEMO-4', employeeId: 'EMP-118', name: 'Tania Akter', email: 'tania@example.com', phone: '01730-000000', modality: 'Canteen', role: 'User', status: 'PendingApproval', createdAt: fmtDate(today) }
    ]
  };

  // Seed a realistic day-by-day menu for this whole month and a chunk of next
  // month, the way an admin would actually fill it in — one row per date, a
  // rotating sample meal with a slightly varying price, skipping weekly holidays.
  const weeklyHolidays = String(db.settings.WeeklyHolidays).split(',').map(s => s.trim());
  const seedStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const seedEnd = new Date(today.getFullYear(), today.getMonth() + 1, 20);
  let mi = 0;
  for (let d = new Date(seedStart); d <= seedEnd; d = addDaysLocal(d, 1)) {
    const wd = WEEKDAYS[d.getDay()];
    if (weeklyHolidays.indexOf(wd) !== -1) continue;
    const meal = sampleMeals[mi % sampleMeals.length];
    mi++;
    db.overrides[fmtDate(d)] = { menuText: meal.menuText, price: meal.price + (mi % 3 === 0 ? 10 : 0), isHoliday: false, note: '' };
  }

  // Seed a few realistic past bookings for "You" and other demo users this month.
  for (let i = 1; i <= 18; i++) {
    const d = addDaysLocal(new Date(today.getFullYear(), today.getMonth(), 1), i - 1);
    if (d > today) break;
    const info = computeDayInfoDemo(fmtDate(d), db);
    if (info.isHoliday || !info.menuSet || Math.random() < 0.15) continue;
    db.orders[`U-DEMO-1__${info.date}`] = { menuText: info.menuText, price: info.price, modality: 'Canteen', status: 'Active' };
    if (Math.random() < 0.8) db.orders[`U-DEMO-2__${info.date}`] = { menuText: info.menuText, price: info.price, modality: 'Parcel', status: 'Active' };
    if (Math.random() < 0.6) db.orders[`U-DEMO-3__${info.date}`] = { menuText: info.menuText, price: info.price, modality: 'Canteen', status: 'Active' };
  }

  db.payments.push({
    id: 'P-DEMO-1', userId: 'U-DEMO-1', month: monthKey(today.getFullYear(), today.getMonth()),
    amount: 400, method: 'bKash', accountNumber: '017XXXXXXXX', transactionId: '8N7K2R1QZP',
    proofFileUrl: '', note: '', status: 'Pending', submittedAt: new Date().toISOString(), adminNote: ''
  });

  return db;
})();

function computeDayInfoDemo(dateStr, db) {
  db = db || DemoDB;
  const dateObj = parseDateLocal(dateStr);
  const wd = WEEKDAYS[dateObj.getDay()];
  const weeklyHolidays = String(db.settings.WeeklyHolidays || '').split(',').map(s => s.trim()).filter(Boolean);
  const entry = db.overrides[dateStr];

  let isHoliday = weeklyHolidays.indexOf(wd) !== -1;
  let menuText = '';
  let price = 0;

  if (entry) {
    if (entry.isHoliday) isHoliday = true;
    if (entry.menuText) menuText = entry.menuText;
    if (entry.price !== null && entry.price !== undefined) price = entry.price;
  }
  const menuSet = !!(menuText && String(menuText).trim());

  const [hh, mm] = String(db.settings.LunchServiceTime || '13:00').split(':').map(Number);
  const serviceDateTime = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), hh || 13, mm || 0);
  const cutoffHours = Number(db.settings.CutoffHours || 24);
  const deadline = new Date(serviceDateTime.getTime() - cutoffHours * 3600 * 1000);
  const maxBookable = db.settings.MaxBookableDate ? parseDateLocal(db.settings.MaxBookableDate) : null;

  let locked = false, reason = '';
  const now = new Date();
  if (isHoliday) { locked = true; reason = 'holiday'; }
  else if (!menuSet) { locked = true; reason = 'no-menu'; }
  else if (now > deadline) { locked = true; reason = 'cutoff'; }
  else if (maxBookable && dateObj > maxBookable) { locked = true; reason = 'beyond-booking-window'; }

  return { date: dateStr, weekday: wd, isHoliday, menuText, price, menuSet, deadline: deadline.toISOString(), locked, reason };
}

function demoCurrentUser() {
  const base = DemoDB.users[0];
  return Object.assign({}, base, { role: DemoDB.role, status: 'Approved' });
}

async function demoApiCall(action, body) {
  const db = DemoDB;

  switch (action) {
    case 'register':
      return { userId: 'U-NEW', message: 'Demo mode: check your email for a 6-digit verification code (use 123456).' };
    case 'verifyOtp':
      if (String(body.otp) !== '123456') throw new Error('Incorrect code. (Hint: use 123456 in demo mode.)');
      return { message: 'Email verified. Your account is now awaiting admin approval.' };
    case 'resendOtp':
      return { message: 'A new code has been sent. (Demo mode: it is always 123456.)' };
    case 'login':
      return { token: 'demo-token', user: demoCurrentUser() };
    case 'logout':
      return { message: 'Logged out.' };
    case 'forgotPassword':
      return { message: 'If that email is registered, a reset code has been sent.' };
    case 'resetPassword':
      return { message: 'Password updated — please log in.' };

    case 'getMe':
      return { user: demoCurrentUser() };
    case 'updateProfile':
      Object.assign(db.users[0], body.phone ? { phone: body.phone } : {}, body.modality ? { modality: body.modality } : {});
      return { message: 'Profile updated.' };
    case 'changePassword':
      return { message: 'Password changed.' };

    case 'getCalendar': {
      const days = [];
      let cur = parseDateLocal(body.startDate);
      const end = parseDateLocal(body.endDate);
      while (cur <= end) {
        const info = computeDayInfoDemo(fmtDate(cur), db);
        const order = db.orders[`U-DEMO-1__${info.date}`];
        info.ordered = !!(order && order.status === 'Active');
        info.amount = order ? order.price : info.price;
        days.push(info);
        cur = addDaysLocal(cur, 1);
      }
      return { days, currency: db.settings.CurrencySymbol };
    }
    case 'setEntry': {
      const info = computeDayInfoDemo(body.date, db);
      if (info.locked) {
        const msgs = { holiday: 'This day is a holiday.', 'no-menu': 'The menu for this day has not been published yet.', cutoff: 'The cut-off time for this day has passed.', 'beyond-booking-window': 'This date is not open for booking yet.' };
        throw new Error(msgs[info.reason] || 'This date is locked.');
      }
      const key = `U-DEMO-1__${body.date}`;
      if (body.intent === 'cancel') {
        delete db.orders[key];
        return { message: 'Lunch cancelled for ' + body.date + '.', ordered: false };
      }
      db.orders[key] = { menuText: info.menuText, price: info.price, modality: db.users[0].modality, status: 'Active' };
      return { message: 'Lunch booked for ' + body.date + '.', ordered: true, amount: info.price };
    }
    case 'getMyBill': {
      const days = Object.keys(db.orders).filter(k => k.startsWith('U-DEMO-1__') && k.split('__')[1].startsWith(body.month))
        .map(k => ({ date: k.split('__')[1], menuText: db.orders[k].menuText, amount: db.orders[k].price }))
        .sort((a, b) => a.date < b.date ? -1 : 1);
      const total = days.reduce((s, d) => s + d.amount, 0);
      const payments = db.payments.filter(p => p.userId === 'U-DEMO-1' && p.month === body.month);
      const verifiedPaid = payments.filter(p => p.status === 'Verified').reduce((s, p) => s + p.amount, 0);
      const pendingClaims = payments.filter(p => p.status === 'Pending').reduce((s, p) => s + p.amount, 0);
      return { month: body.month, total, verifiedPaid, pendingClaims, due: Math.max(0, total - verifiedPaid), currency: db.settings.CurrencySymbol, days, payments };
    }
    case 'submitPayment':
      db.payments.push({
        id: newDemoId('P'), userId: 'U-DEMO-1', month: body.month, amount: Number(body.amount) || 0,
        method: body.method, accountNumber: body.accountNumber || '', transactionId: body.transactionId || '',
        proofFileUrl: body.proofBase64 ? '#' : '', note: body.note || '', status: 'Pending', submittedAt: new Date().toISOString(), adminNote: ''
      });
      return { message: 'Payment submitted for verification.' };
    case 'getMyPayments':
      return { payments: db.payments.filter(p => p.userId === 'U-DEMO-1').sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)) };

    case 'adminGetSettings':
      return { settings: db.settings };
    case 'adminSaveSettings':
      Object.assign(db.settings, body.settings || {});
      return { message: 'Settings saved.' };
    case 'adminGetDateOverrides': {
      let rows = Object.keys(db.overrides).map(d => Object.assign({ date: d }, db.overrides[d]));
      if (body.startDate && body.endDate) rows = rows.filter(r => r.date >= body.startDate && r.date <= body.endDate);
      return { overrides: rows };
    }
    case 'adminSaveMonthMenu': {
      (body.days || []).forEach(d => {
        const hasContent = !!(d.menuText && String(d.menuText).trim()) || (d.price !== null && d.price !== undefined && d.price !== '') || !!d.isHoliday;
        if (!hasContent) { delete db.overrides[d.date]; return; }
        db.overrides[d.date] = {
          menuText: d.menuText || '',
          price: (d.price === '' || d.price == null) ? null : Number(d.price),
          isHoliday: !!d.isHoliday,
          note: (db.overrides[d.date] && db.overrides[d.date].note) || ''
        };
      });
      return { message: 'Monthly menu saved.' };
    }
    case 'adminSaveDateOverride':
      db.overrides[body.date] = { menuText: body.menuText || '', price: (body.price === '' || body.price == null) ? null : Number(body.price), isHoliday: !!body.isHoliday, note: body.note || '' };
      return { message: 'Saved override for ' + body.date + '.' };
    case 'adminDeleteDateOverride':
      delete db.overrides[body.date];
      return { message: 'Override removed.' };
    case 'adminListUsers': {
      let users = db.users.slice();
      if (body.status) users = users.filter(u => u.status === body.status);
      return { users };
    }
    case 'adminSetUserStatus': {
      const u = db.users.find(x => x.userId === body.userId);
      if (u) u.status = body.status;
      return { message: 'User status updated.' };
    }
    case 'adminGetDayOrders': {
      const list = db.users.filter(u => db.orders[`${u.userId}__${body.date}`]).map(u => {
        const o = db.orders[`${u.userId}__${body.date}`];
        return { name: u.name, employeeId: u.employeeId, modality: o.modality, amount: o.price };
      });
      const counts = { Canteen: 0, Parcel: 0 };
      list.forEach(x => counts[x.modality] = (counts[x.modality] || 0) + 1);
      return { date: body.date, list, counts, total: list.reduce((s, x) => s + x.amount, 0), currency: db.settings.CurrencySymbol };
    }
    case 'adminGetBillMatrix': {
      const byUser = {}, byDay = {};
      Object.keys(db.orders).forEach(k => {
        const [uid, date] = k.split('__');
        if (!date.startsWith(body.month)) return;
        const o = db.orders[k];
        const u = db.users.find(x => x.userId === uid) || { name: 'Unknown', employeeId: '' };
        if (!byUser[uid]) byUser[uid] = { userId: uid, name: u.name, employeeId: u.employeeId, days: 0, total: 0 };
        byUser[uid].days++; byUser[uid].total += o.price;
        if (!byDay[date]) byDay[date] = { date, count: 0, total: 0 };
        byDay[date].count++; byDay[date].total += o.price;
      });
      const userWise = Object.values(byUser).sort((a, b) => a.name.localeCompare(b.name));
      const dayWise = Object.values(byDay).sort((a, b) => a.date < b.date ? -1 : 1);
      return { month: body.month, userWise, dayWise, grandTotal: userWise.reduce((s, u) => s + u.total, 0), currency: db.settings.CurrencySymbol };
    }
    case 'adminListPayments': {
      let rows = db.payments.slice();
      if (body.status) rows = rows.filter(p => p.status === body.status);
      return { payments: rows.map(p => Object.assign({}, p, { name: (db.users.find(u => u.userId === p.userId) || {}).name || 'Unknown' })).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)) };
    }
    case 'adminVerifyPayment': {
      const p = db.payments.find(x => x.id === body.paymentId);
      if (p) { p.status = body.status; p.adminNote = body.adminNote || ''; }
      return { message: 'Payment updated.' };
    }
    case 'adminGetPaymentStats': {
      const dueByMonth = {}, paidByMonth = {};
      Object.keys(db.orders).forEach(k => { const date = k.split('__')[1]; const m = date.slice(0, 7); dueByMonth[m] = (dueByMonth[m] || 0) + db.orders[k].price; });
      db.payments.filter(p => p.status === 'Verified').forEach(p => paidByMonth[p.month] = (paidByMonth[p.month] || 0) + p.amount);
      const months = Object.keys(dueByMonth).sort().slice(-6);
      const series = months.map(m => ({ month: m, due: dueByMonth[m] || 0, paid: paidByMonth[m] || 0 }));
      const thisMonth = fmtDate(new Date()).slice(0, 7);
      const pendingThisMonth = db.payments.filter(p => p.month === thisMonth && p.status === 'Pending').reduce((s, p) => s + p.amount, 0);
      return { series, currentMonth: { month: thisMonth, due: dueByMonth[thisMonth] || 0, paid: paidByMonth[thisMonth] || 0, pending: pendingThisMonth }, currency: db.settings.CurrencySymbol };
    }
    default:
      throw new Error('Unknown demo action: ' + action);
  }
}

function newDemoId(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 10); }
