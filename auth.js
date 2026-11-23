// Neon Vigil OAuth starter for Cloudflare Pages (hexos, linked to Xer0Yootz/NV-).
// No build step. No secret keys in this file: only the Supabase URL and the
// public anon key from config.js are used in the browser. Never put the
// service_role / secret key here.
var supabaseClient = null;
function getClient() {
  if (supabaseClient) return supabaseClient;
  var cfg = window.NV_CONFIG || {};
  var status = document.getElementById('status');
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    if (status) status.textContent = 'Sign-in is not configured yet: add the Supabase anon key in config.js (see README).';
    return null;
  }
  supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nv-supabase-auth' }
  });
  return supabaseClient;
}
async function checkSessionAndRedirect(target) {
  var client = getClient();
  if (!client) return;
  var data = await client.auth.getSession();
  if (data && data.data && data.data.session) window.location.replace(target);
}
async function requireSession(loginPage) {
  var client = getClient();
  if (!client) return null;
  var data = await client.auth.getSession();
  if (!data || !data.data || !data.data.session) {
    window.location.replace(loginPage);
    return null;
  }
  return data.data.session.user;
}
async function signInWithGitHub() {
  var client = getClient();
  if (!client) return;
  var btn = document.getElementById('githubBtn');
  var status = document.getElementById('status');
  if (btn) btn.disabled = true;
  if (status) { status.textContent = 'Sending you to GitHub…'; status.style.color = '#32CD32'; }
  var result = await client.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.origin + '/hub.html' }
  });
  if (result && result.error && status) {
    status.textContent = 'GitHub sign-in error: ' + result.error.message;
    status.style.color = '';
    if (btn) btn.disabled = false;
  }
}
async function signInWithGoogle() {
  var client = getClient();
  if (!client) return;
  var btn = document.getElementById('googleBtn');
  var status = document.getElementById('status');
  if (btn) btn.disabled = true;
  if (status) { status.textContent = 'Sending you to Google…'; status.style.color = '#32CD32'; }
  var result = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/hub.html' }
  });
  if (result && result.error && status) {
    status.textContent = 'Google sign-in error: ' + result.error.message;
    status.style.color = '';
    if (btn) btn.disabled = false;
  }
}
async function signOut() {
  var client = getClient();
  if (client) await client.auth.signOut();
  window.location.replace('index.html');
}
// Email auth (Nov 22, 2026, User's): sign-up and sign-in on the landing page
// with ANY email, not just GitHub or Google. Same client (getClient), same
// #status surface, same hub redirect as the OAuth handlers above. Exposed as
// window.NVEmailAuth; the landing page wires its form to these.
async function nvEmailSignIn(email, password) {
  var status = document.getElementById('status');
  email = (email || '').trim();
  if (!email || !password) {
    if (status) { status.textContent = 'Enter your email and password.'; status.style.color = ''; }
    return;
  }
  var client = getClient();
  if (!client) return;
  var btn = document.getElementById('nvEmailSignInBtn');
  if (btn) btn.disabled = true;
  if (status) { status.textContent = 'Signing you in…'; status.style.color = '#32CD32'; }
  var result = await client.auth.signInWithPassword({ email: email, password: password });
  if (result && result.error) {
    if (status) {
      status.textContent = 'Email sign-in error: ' + result.error.message;
      status.style.color = '';
    }
    if (btn) btn.disabled = false;
    return;
  }
  window.location.replace(window.location.origin + '/hub.html');
}
async function nvEmailSignUp(email, password) {
  var status = document.getElementById('status');
  email = (email || '').trim();
  if (!email || !password) {
    if (status) { status.textContent = 'Enter your email and password.'; status.style.color = ''; }
    return;
  }
  var client = getClient();
  if (!client) return;
  var btn = document.getElementById('nvEmailSignUp');
  if (btn) btn.disabled = true;
  if (status) { status.textContent = 'Creating your account…'; status.style.color = '#32CD32'; }
  var result = await client.auth.signUp({
    email: email,
    password: password,
    options: { emailRedirectTo: window.location.origin + '/hub.html' }
  });
  if (result && result.error) {
    if (status) {
      status.textContent = 'Email sign-up error: ' + result.error.message;
      status.style.color = '';
    }
    if (btn) btn.disabled = false;
    return;
  }
  if (result && result.data && result.data.session) {
    window.location.replace(window.location.origin + '/hub.html');
    return;
  }
  // User created but no session: email confirmation is still pending.
  if (status) {
    status.textContent = 'Account created — check your email to confirm, then sign in.';
    status.style.color = '#32CD32';
  }
  if (btn) btn.disabled = false;
}
async function nvEmailMagicLink(email) {
  var status = document.getElementById('status');
  email = (email || '').trim();
  if (!email) {
    if (status) { status.textContent = 'Enter your email first.'; status.style.color = ''; }
    return;
  }
  var client = getClient();
  if (!client) return;
  var btn = document.getElementById('nvEmailMagic');
  if (btn) btn.disabled = true;
  if (status) { status.textContent = 'Sending your sign-in link…'; status.style.color = '#32CD32'; }
  var result = await client.auth.signInWithOtp({
    email: email,
    options: { emailRedirectTo: window.location.origin + '/hub.html' }
  });
  if (result && result.error) {
    if (status) {
      status.textContent = 'Email link error: ' + result.error.message;
      status.style.color = '';
    }
    if (btn) btn.disabled = false;
    return;
  }
  if (status) {
    status.textContent = 'Sign-in link sent — check your email.';
    status.style.color = '#32CD32';
  }
  if (btn) btn.disabled = false;
}
window.NVEmailAuth = {
  signIn: nvEmailSignIn,
  signUp: nvEmailSignUp,
  magicLink: nvEmailMagicLink
};
