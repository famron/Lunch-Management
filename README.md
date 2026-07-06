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
   - It creates all 8 sheets with headers, seeds default settings and a
     blank weekly menu, and — since no admin exists yet — prompts you for
     an admin name/email/password right there in the dialog.
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
2. **Admin → Menu & Pricing** — fill in each weekday's menu and price.
3. **Admin → Approvals** — approve real employees as they register.
4. Change the admin password from the account menu (top-right avatar).

---

## 5. How the booking rules work

Every date has one computed status, calculated identically on the server
(`OrderService.gs → computeDayInfo`) and mirrored in demo mode
(`api.js → computeDayInfoDemo`) — the UI never guesses independently:

- **Holiday** — the weekday is in "Weekly holidays", or a date override
  marks that specific date as a holiday. Always locked, never editable.
- **Cutoff** — a deadline is computed per date as
  `(that date's Lunch Service Time) − Cutoff Hours`. Past the deadline,
  the date locks — this is what makes "today" lock automatically once
  you're inside the notice window, without any special-cased logic.
- **Booking window** — dates after "Latest bookable date" are locked.
  Leave it at month-end to keep next month closed; move it forward when
  you're ready to open it.

Prices are **snapshotted onto the order** at booking time, so changing a
weekday's price later never rewrites historical bills.

Menu resolution per date: **date override → weekly template → (nothing)**.
Use overrides for one-off menu changes, special-event pricing, or ad-hoc
holidays (e.g., Eid, a national holiday) without touching the weekly
template.

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
| Admin | weekly holidays, per-weekday menu + price, date overrides/extra holidays, cutoff hours, lunch service time, booking-window limit, approve/reject/suspend users, print day's orders (custom heading + signature lines) |
| Home | month calendar, book/cancel with live lock state, past/holiday/cutoff-locked days shown with a lock, animated "stamp" on booking, per-day and monthly totals, menu-per-day |
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
