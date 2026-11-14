const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const DATA_FILE = path.join(__dirname, 'users.json');
const users = new Map();
const sessions = new Map();
const oauthStates = new Map();

try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  for (const user of Array.isArray(saved) ? saved : []) users.set(user.id, user);
} catch (_) {}
function persist() { fs.writeFileSync(DATA_FILE, JSON.stringify([...users.values()], null, 2)); }
function id() { return crypto.randomBytes(24).toString('hex'); }
function safeNext(value) { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/pair'; }
function config(provider) {
  const p = provider.toUpperCase();
  return { clientId: process.env[`${p}_CLIENT_ID`], clientSecret: process.env[`${p}_CLIENT_SECRET`], redirect: process.env[`${p}_REDIRECT_URI`] || `/auth/${provider}/callback` };
}
function baseUrl(req) { return `${req.protocol}://${req.get('host')}`; }
function callbackUrl(req, provider) { const c = config(provider).redirect; return c.startsWith('http') ? c : baseUrl(req) + c; }
function upsert(provider, profile) {
  const key = `${provider}:${profile.id || profile.email}`;
  let user = [...users.values()].find((u) => u.providerKey === key);
  if (!user) { user = { id: id(), provider, providerKey: key, createdAt: Date.now(), lastSeenAt: Date.now(), signIns: 0 }; users.set(user.id, user); }
  user.name = profile.name || profile.login || profile.email || 'Signed user';
  user.email = profile.email || '';
  user.avatar = profile.avatar || '';
  user.lastSeenAt = Date.now(); user.signIns = (user.signIns || 0) + 1;
  persist();
  return user;
}
function setSession(res, user) { const token = id(); sessions.set(token, { userId: user.id, createdAt: Date.now() }); res.cookie('xadon_auth', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 86400000 }); }
function current(req) { const s = sessions.get(req.cookies?.xadon_auth); return s ? users.get(s.userId) : null; }
function requireAuth(req, res, next) { const user = current(req); if (!user) return res.status(401).json({ error: 'Sign in with GitHub or Google first.' }); req.user = user; next(); }
function adminAllowed(req) { const user = current(req); if (!user) return false; const emails = String(process.env.ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); return (emails.length && emails.includes(String(user.email).toLowerCase())) || (process.env.ADMIN_KEY && req.get('x-admin-key') === process.env.ADMIN_KEY); }
function requireAdmin(req, res, next) { if (!adminAllowed(req)) return res.status(403).json({ error: 'Admin access required.' }); req.user = current(req); next(); }

async function providerProfile(provider, code, req) {
  const c = config(provider); const headers = { Accept: 'application/json', 'User-Agent': 'XADON-Pair-Site' };
  const tokenBody = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, code, redirect_uri: callbackUrl(req, provider) });
  if (provider === 'github') {
    const token = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody }).then((r) => r.json());
    if (!token.access_token) throw new Error('GitHub OAuth token exchange failed');
    const h = { ...headers, Authorization: `Bearer ${token.access_token}` };
    const u = await fetch('https://api.github.com/user', { headers: h }).then((r) => r.json());
    let email = u.email;
    if (!email) { const es = await fetch('https://api.github.com/user/emails', { headers: h }).then((r) => r.json()); email = es.find((e) => e.primary)?.email || es[0]?.email; }
    return { id: u.id, name: u.name || u.login, login: u.login, email, avatar: u.avatar_url };
  }
  const token = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody }).then((r) => r.json());
  if (!token.access_token) throw new Error('Google OAuth token exchange failed');
  return fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } }).then((r) => r.json()).then((u) => ({ id: u.sub, name: u.name, email: u.email, avatar: u.picture }));
}

function router() {
  const r = express.Router();
  r.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
  for (const provider of ['github', 'google']) {
    r.get(`/${provider}`, (req, res) => {
      const c = config(provider); if (!c.clientId || !c.clientSecret) return res.status(503).send(`Configure ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET first.`);
      const state = id(); oauthStates.set(state, { provider, next: safeNext(req.query.next), expires: Date.now() + 10 * 60 * 1000 });
      const url = provider === 'github' ? new URL('https://github.com/login/oauth/authorize') : new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams(provider === 'github' ? { client_id: c.clientId, redirect_uri: callbackUrl(req, provider), scope: 'read:user user:email', state } : { client_id: c.clientId, redirect_uri: callbackUrl(req, provider), response_type: 'code', scope: 'openid email profile', state, access_type: 'online' });
      res.redirect(url.toString());
    });
    r.get(`/${provider}/callback`, async (req, res) => {
      try { const entry = oauthStates.get(req.query.state); oauthStates.delete(req.query.state); if (!entry || entry.expires < Date.now() || entry.provider !== provider) throw new Error('OAuth state expired'); const user = upsert(provider, await providerProfile(provider, req.query.code, req)); setSession(res, user); res.redirect(entry.next); }
      catch (e) { res.status(400).send(`Sign-in failed: ${e.message}`); }
    });
  }
  r.get('/me', (req, res) => { const user = current(req); res.json({ authenticated: !!user, user: user ? { id: user.id, name: user.name, email: user.email, provider: user.provider } : null }); });
  r.post('/logout', (req, res) => { const token = req.cookies?.xadon_auth; sessions.delete(token); res.clearCookie('xadon_auth'); res.json({ ok: true }); });
  r.get('/admin', (req, res) => { if (!adminAllowed(req)) return res.status(403).send('Admin access required.'); res.sendFile(path.join(__dirname, 'views', 'admin.html')); });
  r.get('/admin/users', requireAdmin, (req, res) => res.json([...users.values()].map(({ providerKey, ...u }) => u)));
  return r;
}
function cleanup() { const now = Date.now(); for (const [k, v] of oauthStates) if (v.expires < now) oauthStates.delete(k); }
setInterval(cleanup, 60000).unref();
module.exports = { router: router(), requireAuth, requireAdmin, current, users };
