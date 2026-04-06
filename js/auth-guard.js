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
    const session = await getSession();

    if (!session || !session.user) {
      // Not logged in — redirect to login with return URL
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

  } catch (err) {
    console.error('Auth guard error:', err);
    window.location.replace(loginPage);
  }
})();
