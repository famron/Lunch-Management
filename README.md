# Lunch Management System

A full office lunch booking, menu, and billing app.
**Backend:** Google Sheets + Google Apps Script (as a JSON API).
**Frontend:** static site for GitHub Pages (vanilla HTML/CSS/JS, no build step).

Open `frontend/index.html` in a browser right now — it runs in **demo mode**
with fake in-memory data, so you can see the whole design and flow before
deploying anything. A yellow banner lets you flip between the Employee and
Admin views. Nothing in demo mode is saved anywhere.

---

## 1. How it's organized

```
backend/                Apps Script project (copy into script.google.com)
  Code.gs                doGet/doPost + action router
  Utils.gs                sheet<->object helpers, hashing, dates, sanitizing
  SheetSetup.gs           creates all sheets + seeds defaults + first admin
  AuthService.gs          register / verify / login / sessions / password reset
  OrderService.gs         calendar rules, booking, per-user bill
  AdminService.gs         settings, menu, holidays, approvals, print, bill matrix
  BillService.gs          payment submission (+ optional proof upload), history
  appsscript.json         manifest (timezone, web app access)

frontend/               static site (GitHub Pages)
  index.html
  css/styles.css
  js/config.js            <-- the one file you edit
  js/{api,utils,app,auth,home,admin,bills}.js
  icons/, manifest.webmanifest
```

**How the two talk:** the frontend calls the Apps Script Web App URL with a
single `POST` per request, body `{ action: "...", token: "...", ...fields }`,
content-type `text/plain`. That content type is deliberate — it's the one
that lets a browser call an Apps Script Web App cross-origin without
tripping CORS preflight, which Apps Script doesn't handle well. Every
response is `{ ok: true, data }` or `{ ok: false, error }`.

---

## 2. Set up the backend (Google Sheet + Apps Script)

1. Create a new Google Sheet (any name, e.g. "Lunch Management Data").
2. **Extensions → Apps Script.** Delete the default empty `Code.gs`.
3. Create each file in `backend/` as its own script file with the *same
   name* (Apps Script lets you add `.gs` files via the `+` next to Files).
   Paste in the matching content. Also open **Project Settings** (gear icon)
   and paste `appsscript.json`'s content into the manifest (or enable
   "Show appsscript.json" first).
4. Go back to the Sheet. Reload it. A new menu appears: **🍱 Lunch System**.
   Click **Run setup / repair sheets**.
   - The first time you run any Apps Script action, Google will ask you to
     authorize permissions (Sheets, Drive, Mail, Script). This is expected —
     approve it under your own account.
   - It creates all 8 sheets with headers, seeds default settings, and —
     since no admin exists yet — prompts you for an admin name/email/password
     right there in the dialog. There's no menu to seed anymore: you fill
     each date in directly under Admin → Menu & Pricing (see below).
5. **Deploy → New deployment → type: Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**  ← important: not "Anyone with Google
     account". This app has its own email/password login, so the Apps
     Script deployment itself must not require a Google login.
   - Click Deploy, authorize again if asked, and copy the **Web app URL**.

> Whenever you edit the backend code later, you must **Deploy → Manage
> deployments → ✎ (edit) → New version** for the live URL to pick up the
> change. Saving the file alone does not update a deployed Web App.

---

## 3. Set up the frontend (GitHub Pages)

1. Push the `frontend/` folder to a GitHub repo (root of the repo, or a
   `/docs` folder — either works with GitHub Pages).
2. Open `frontend/js/config.js` and set:
   ```js
   const CONFIG = {
     API_URL: 'https://script.google.com/macros/s/AKfycb.../exec', // your Web app URL
     ORG_NAME: 'Your Office Name'
   };
   ```
3. In the repo settings, enable **GitHub Pages** for that folder/branch.
4. Open the published URL. Demo mode turns off automatically once `API_URL`
   is set to a real value.

---

## 4. First login

Log in with the admin email/password you created during setup, then:
1. **Admin → Settings** — confirm weekly holidays, cutoff hours, lunch
   service time, currency symbol, and the latest bookable date.
2. **Admin → Menu & Pricing** — pick the month and fill in the menu + price
   for each date (price can, and usually will, differ day to day — there's
   no fixed weekly rate). Weekly-holiday dates are skipped automatically.
   Tick "One-off" to mark a specific date (e.g. Eid) as a holiday even
   though its weekday isn't normally one.
3. **Admin → Approvals** — approve real employees as they register.
4. Change the admin password from the account menu (top-right avatar).

---

## 5. How the booking rules work

Every date has one computed status, calculated identically on the server
(`OrderService.gs → computeDayInfo`) and mirrored in demo mode
(`api.js → computeDayInfoDemo`) — the UI never guesses independently:

- **Holiday** — the weekday is in "Weekly holidays", or that specific date
  is ticked "One-off" holiday. Always locked, never editable.
- **No menu published** — if a date has no menu/price entered at all, it
  locks automatically (reason `no-menu`). This exists so a day nobody has
  filled in yet can never be booked at a phantom ৳0 — it's a safeguard, not
  something you need to configure.
- **Cutoff** — a deadline is computed per date as
  `(that date's Lunch Service Time) − Cutoff Hours`. Past the deadline,
  the date locks — this is what makes "today" lock automatically once
  you're inside the notice window, without any special-cased logic.
- **Booking window** — dates after "Latest bookable date" are locked.
  Leave it at month-end to keep next month closed; move it forward when
  you're ready to open it.

Prices are **snapshotted onto the order** at booking time, so changing a
date's price later never rewrites historical bills.

There is no weekly recurring menu — every calendar date is its own row in
the `DateOverrides` sheet, filled in a month at a time from Admin → Menu &
Pricing. That sheet name is a historical artifact of an earlier revision;
it is now the single source of menu/price/holiday data, not an "override"
of anything else.

---

## 6. Security notes (read this before rolling it out)

- Passwords are stored as **SHA-256(password + per-user salt)**, not
  plaintext. This is reasonable for a small internal tool, but it is not
  bcrypt/scrypt/Argon2 — Apps Script has no built-in key-stretching hash.
  Don't reuse this for anything beyond an internal office tool.
- Every admin-only backend function re-checks the caller's role from the
  Sessions/Users sheets — the frontend hiding admin buttons is a UX nicety,
  not the actual security boundary.
- Cut-off/holiday/booking-window checks are enforced **server-side** in
  `handleSetEntry`, not just in the calendar UI — someone editing the page's
  JS can't book a locked day.
- Login has basic brute-force protection (5 failed attempts → 15-minute
  lock per account).
- Free-text fields (names, notes, menu text) are sanitized before being
  written to the Sheet so a value starting with `=`, `+`, `-`, or `@` can
  never be executed as a formula if you open the raw spreadsheet.
- Uploaded payment-proof screenshots are stored in a Drive folder named
  **"Lunch System Payment Proofs"**, shared as "anyone with the link can
  view" — this is what lets an admin open the link regardless of their own
  Google identity, but it does mean anyone who obtains a link could view
  that one file. Acceptable for internal payment proofs; tighten it in
  `BillService.gs → savePaymentProof` if you need stricter sharing.

---

## 7. Customizing the look

Everything visual is driven by CSS variables at the top of
`frontend/css/styles.css`:
```css
--ink, --paper, --turmeric, --tamarind, --chili   /* palette */
--font-display, --font-body, --font-mono          /* Space Grotesk / Inter / IBM Plex Mono */
```
Change the five color values and the whole app (light + dark) re-themes
consistently, including the charts (they read the same CSS variables at
draw time). The favicon/app icons are plain PNG/SVG in `frontend/icons/` —
regenerate them with any icon tool if you want a different mark.

---

## 8. Feature checklist

| Area | Included |
|---|---|
| Admin | weekly holidays, per-**date** menu + price (a full month at a time), one-off holiday marking, cutoff hours, lunch service time, booking-window limit, approve/reject/suspend users, print day's orders (custom heading + signature lines) |
| Home | today's menu shown up top (book/cancel right there), month calendar, book/cancel with live lock state, past/holiday/no-menu/cutoff-locked days shown with a lock, animated "stamp" on booking, per-day and monthly totals |
| Bills | user: monthly total/paid/due, per-day breakdown, submit payment (bKash/Nagad/Rocket/Bank/Cash/Other + optional proof screenshot), status once verified; admin: user-wise & day-wise tables with print, payment verification queue, paid-vs-due charts |
| Accounts | register (employee ID, name, email, phone, modality) → email OTP verification → admin approval → email+password login, forgot/reset password, change password |
| Shell | responsive mobile→desktop, bottom nav on small screens / sidebar on large, light & dark mode, PWA-style icons/manifest |

### Small additions beyond the original spec (flagged, not hidden)
- **Forgot/reset password** — a login system needs a recovery path.
- **bKash / Nagad / Rocket** as payment methods alongside bank transfer,
  since that's how most Bangladeshi offices actually settle small payments.
- **Optional payment-proof screenshot upload** — a typed transaction ID
  alone is easy to fabricate; an attached screenshot gives the admin real
  evidence when verifying.
- **Admin email notifications** on new signups and payment/status changes,
  so approvals don't get missed.
- **Demo mode** in the frontend so the UI is explorable before any backend
  is deployed.

### Deliberately out of scope
Multiple menu *choices* per day (it's one fixed menu, opt in/out), a native
mobile app, and offline support — none of these were asked for, and adding
them would meaningfully increase complexity for little benefit here. Happy
to build any of them next if you want them.

---

## 9. Troubleshooting

- **"Missing sheet" errors** → run **🍱 Lunch System → Run setup / repair
  sheets** again from the Sheet's menu; it's safe to re-run any time.
- **Frontend says it can't reach the server** → check `API_URL` in
  `config.js`, and confirm the deployment's access is "Anyone" (not
  "Anyone with Google account").
- **Code changes don't seem to take effect** → you need a **new
  deployment version** (see step 2 above), not just a saved file.
- **Times look off by a few hours** → confirm the Apps Script project's
  timezone is `Asia/Dhaka` (Project Settings → General settings), matching
  `appsscript.json`.

---

## 10. Changelog

**Revision 2** (this version):
- Pricing is now **per-date**, not a weekly recurring rate — Admin → Menu
  & Pricing is a month grid, one row per calendar day, saved in one request.
- Calendar cells no longer show price (it varies per day now); a **Today's
  Menu** card sits above the grid instead, with its own book/cancel action.
- Fixed a real bug: booking lunch could show "Unknown action: add". A
  request-body field was accidentally named `action` in two different
  places at once (the API's routing key, and the book/cancel flag) and one
  silently overwrote the other. The book/cancel field is now called
  `intent`, and `js/api.js` also applies `action`/`token` last when
  building a request so this class of collision can't recur.
- Registering again with an email that's registered but never verified no
  longer dead-ends on "already registered" — it refreshes the pending
  registration and sends a fresh code. A **"Verify email"** link on the
  login screen also gives a path back to verification any time, even
  days later, without needing to remember to do it right away.
- Fixed a mobile layout bug where the month label could force the whole
  page wider than the viewport (needing a horizontal swipe to see Friday/
  Saturday) — a classic flexbox min-width issue, now constrained to
  truncate instead.
- Home now uses a two-column layout on laptop/desktop (calendar + legend on
  the left, Today's Menu pinned on the right) instead of stacking
  everything in one column, so it fits without a vertical scroll on most
  screens.
- Added spacing below a couple of buttons that sat flush against the next
  card (Submit Payment, Save Settings).
