/* auth.js — everything that happens before someone is logged in */

const AuthState = { pendingEmail: '' };

function renderAuth(panel) {
  const card = qs('#auth-card');
  if (panel === 'login') card.innerHTML = tplLogin();
  else if (panel === 'register') card.innerHTML = tplRegister();
  else if (panel === 'verify') card.innerHTML = tplVerify();
  else if (panel === 'forgot') card.innerHTML = tplForgot();
  else if (panel === 'reset') card.innerHTML = tplReset();
  paintIcons();
  wireAuth(panel);
}

function tplLogin() {
  return `
    <h2>Welcome back</h2>
    <p class="muted">Log in to book your lunch.</p>
    <form id="form-login" novalidate>
      <div class="field"><label>Email</label><input type="email" id="li-email" autocomplete="email" required></div>
      <div class="field"><label>Password</label><input type="password" id="li-pass" autocomplete="current-password" required></div>
      <button class="btn btn--primary btn--full" type="submit"><i data-lucide="log-in"></i> Log in</button>
    </form>
    <div class="auth-links">
      <a href="#" id="go-forgot">Forgot password?</a>
      <a href="#" id="go-register">Create an account</a>
    </div>`;
}

function tplRegister() {
  return `
    <h2>Create your account</h2>
    <p class="muted">You'll verify your email, then wait for admin approval.</p>
    <form id="form-register" novalidate>
      <div class="field"><label>Full name</label><input id="rg-name" required></div>
      <div class="field"><label>Employee ID</label><input id="rg-empid" required></div>
      <div class="field"><label>Email</label><input type="email" id="rg-email" autocomplete="email" required></div>
      <div class="field"><label>Phone</label><input type="tel" id="rg-phone" required></div>
      <div class="field">
        <label>Lunch modality</label>
        <div class="segmented" id="rg-modality">
          <button type="button" class="is-active" data-v="Canteen">Canteen</button>
          <button type="button" data-v="Parcel">Parcel</button>
        </div>
      </div>
      <div class="field"><label>Password</label><input type="password" id="rg-pass" autocomplete="new-password" minlength="8" required></div>
      <button class="btn btn--primary btn--full" type="submit"><i data-lucide="user-plus"></i> Register</button>
    </form>
    <div class="auth-links"><a href="#" id="go-login">Already have an account? Log in</a></div>`;
}

function tplVerify() {
  return `
    <h2>Verify your email</h2>
    <p class="muted">We sent a 6-digit code to <strong>${escapeHtml(AuthState.pendingEmail)}</strong>.</p>
    <form id="form-verify" novalidate>
      <div class="field"><label>Verification code</label><input id="vf-otp" inputmode="numeric" maxlength="6" required></div>
      <button class="btn btn--primary btn--full" type="submit"><i data-lucide="shield-check"></i> Verify</button>
    </form>
    <div class="auth-links"><a href="#" id="go-resend">Resend code</a><a href="#" id="go-login-2">Back to login</a></div>`;
}

function tplForgot() {
  return `
    <h2>Reset your password</h2>
    <p class="muted">Enter your email and we'll send a reset code.</p>
    <form id="form-forgot" novalidate>
      <div class="field"><label>Email</label><input type="email" id="fg-email" required></div>
      <button class="btn btn--primary btn--full" type="submit"><i data-lucide="mail"></i> Send reset code</button>
    </form>
    <div class="auth-links"><a href="#" id="go-login-3">Back to login</a></div>`;
}

function tplReset() {
  return `
    <h2>Enter your reset code</h2>
    <p class="muted">Sent to <strong>${escapeHtml(AuthState.pendingEmail)}</strong>.</p>
    <form id="form-reset" novalidate>
      <div class="field"><label>Reset code</label><input id="rs-otp" inputmode="numeric" maxlength="6" required></div>
      <div class="field"><label>New password</label><input type="password" id="rs-pass" minlength="8" required></div>
      <button class="btn btn--primary btn--full" type="submit"><i data-lucide="key-round"></i> Update password</button>
    </form>
    <div class="auth-links"><a href="#" id="go-login-4">Back to login</a></div>`;
}

function wireAuth(panel) {
  if (panel === 'login') {
    qs('#go-register').addEventListener('click', e => { e.preventDefault(); renderAuth('register'); });
    qs('#go-forgot').addEventListener('click', e => { e.preventDefault(); renderAuth('forgot'); });
    qs('#form-login').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      setBusy(btn, true);
      try {
        const { token, user } = await apiCall('login', { email: qs('#li-email').value.trim(), password: qs('#li-pass').value });
        SessionStore.token = token;
        State.user = user;
        showAppShell();
        showToast(`Welcome back, ${user.name.split(' ')[0]}.`, 'success');
      } catch (err) { apiErrorToast(err); } finally { setBusy(btn, false); }
    });
  }

  if (panel === 'register') {
    let modality = 'Canteen';
    qsa('#rg-modality button').forEach(b => b.addEventListener('click', () => {
      modality = b.dataset.v;
      qsa('#rg-modality button').forEach(x => x.classList.toggle('is-active', x === b));
    }));
    qs('#go-login').addEventListener('click', e => { e.preventDefault(); renderAuth('login'); });
    qs('#form-register').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      setBusy(btn, true);
      try {
        const email = qs('#rg-email').value.trim();
        await apiCall('register', {
          name: qs('#rg-name').value.trim(), employeeId: qs('#rg-empid').value.trim(),
          email, phone: qs('#rg-phone').value.trim(), modality, password: qs('#rg-pass').value
        });
        AuthState.pendingEmail = email;
        renderAuth('verify');
        showToast('Registered — check your email for a code.', 'success');
      } catch (err) { apiErrorToast(err); } finally { setBusy(btn, false); }
    });
  }

  if (panel === 'verify') {
    qs('#go-login-2').addEventListener('click', e => { e.preventDefault(); renderAuth('login'); });
    qs('#go-resend').addEventListener('click', async e => {
      e.preventDefault();
      try { await apiCall('resendOtp', { email: AuthState.pendingEmail }); showToast('Code resent.', 'success'); }
      catch (err) { apiErrorToast(err); }
    });
    qs('#form-verify').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      setBusy(btn, true);
      try {
        await apiCall('verifyOtp', { email: AuthState.pendingEmail, otp: qs('#vf-otp').value.trim() });
        showToast('Email verified — awaiting admin approval.', 'success');
        renderAuth('login');
      } catch (err) { apiErrorToast(err); } finally { setBusy(btn, false); }
    });
  }

  if (panel === 'forgot') {
    qs('#go-login-3').addEventListener('click', e => { e.preventDefault(); renderAuth('login'); });
    qs('#form-forgot').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      setBusy(btn, true);
      try {
        const email = qs('#fg-email').value.trim();
        await apiCall('forgotPassword', { email });
        AuthState.pendingEmail = email;
        showToast('If that email is registered, a code is on its way.', 'info');
        renderAuth('reset');
      } catch (err) { apiErrorToast(err); } finally { setBusy(btn, false); }
    });
  }

  if (panel === 'reset') {
    qs('#go-login-4').addEventListener('click', e => { e.preventDefault(); renderAuth('login'); });
    qs('#form-reset').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      setBusy(btn, true);
      try {
        await apiCall('resetPassword', { email: AuthState.pendingEmail, otp: qs('#rs-otp').value.trim(), newPassword: qs('#rs-pass').value });
        showToast('Password updated — please log in.', 'success');
        renderAuth('login');
      } catch (err) { apiErrorToast(err); } finally { setBusy(btn, false); }
    });
  }
}

function setBusy(btn, busy) {
  btn.disabled = busy;
  btn.classList.toggle('is-busy', busy);
}
