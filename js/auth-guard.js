// yerramazing — Auth Guard
// Include in <head> of private pages AFTER supabase-config.js and supabase-sync.js
// Requires: <style id="auth-hide">body{visibility:hidden}</style> in <head>

const ALLOWED_EMAILS = [
  'fatfatproductions@gmail.com',
  'stalavera125@gmail.com'
];

(async function authGuard() {
  // Determine login page path based on current location
  const depth = window.location.pathname.split('/').filter(Boolean).length;
  const prefix = depth > 1 ? '../' : '';
  const loginPage = prefix + 'login.html';

  try {
    // First try cached session, then wait for token refresh if needed
    let session = await getSession();

    if (!session || !session.user) {
      // Session may be refreshing — wait for auth state change (up to 3s)
      session = await new Promise((resolve) => {
        const sb = getSupabase();
        const timeout = setTimeout(() => resolve(null), 3000);
        sb.auth.onAuthStateChange((_event, s) => {
          clearTimeout(timeout);
          resolve(s);
        });
      });
    }

    if (!session || !session.user) {
      // Truly not logged in — redirect to login with return URL
      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      const redirect = depth > 1
        ? 'fitness/' + currentPage
        : currentPage;
      window.location.replace(loginPage + '?redirect=' + encodeURIComponent(redirect));
      return;
    }

    // Check email allowlist
    const email = (session.user.email || '').toLowerCase();
    if (!ALLOWED_EMAILS.includes(email)) {
      await signOut();
      window.location.replace(loginPage + '?error=denied');
      return;
    }

    // Authorized — reveal page
    document.body.style.visibility = 'visible';
    const hideStyle = document.getElementById('auth-hide');
    if (hideStyle) hideStyle.remove();

    // Inject floating sign-out button
    const btn = document.createElement('button');
    btn.id = 'auth-signout';
    btn.type = 'button';
    btn.textContent = 'Sign out';
    btn.setAttribute('aria-label', 'Sign out of ' + email);
    btn.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 10px);right:14px;z-index:9999;padding:6px 12px;min-height:32px;background:rgba(0,0,0,.7);color:#fff;border:none;border-radius:999px;font:600 11px/1 -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Signing out...';
      await signOut();
      window.location.replace(loginPage);
    });
    document.body.appendChild(btn);

  } catch (err) {
    console.error('Auth guard error:', err);
    window.location.replace(loginPage);
  }
})();
