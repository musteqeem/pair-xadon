require('dotenv').config();
const express = require('express');
const app = express();
__path = process.cwd();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const auth = require('./auth');
const store = require('./store');
const port = process.env.PORT || 8000;

const qrRouter = require('./qr');
const pairRouter = require('./pair');
const sessionRouter = require('./session');
const site = require('./site');

require('events').EventEmitter.defaultMaxListeners = 500;

app.set('trust proxy', 1);
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/health', (_, res) => res.json({ ok: true, service: 'xadon-pair', version: '2.1.0', time: Date.now() }));

app.use('/auth', auth.router);
app.use('/qr', auth.requireAuth, qrRouter);
app.use('/code', auth.requireAuth, pairRouter);
app.use('/session', auth.requireAuth, sessionRouter);
app.get('/admin/sessions', auth.requireAdmin, (req, res) => res.json(store.active()));

// User session history (active entries belonging to the signed-in user)
app.get('/api/history', auth.requireAuth, (req, res) => {
  const all = store.active();
  const mine = all.filter((e) => e.userId === req.user.id);
  res.json({ sessions: mine });
});

app.get('/brand-logo', (req, res) => {
  if (!site.logoFile) return res.status(404).end();
  res.sendFile(site.logoFile);
});

// Animated welcome (entry)
app.get('/', (req, res) => {
  // Skip animation if already visited this session (cookie)
  if (req.cookies?.xadon_seen) {
    return res.type('html').send(site.render('main'));
  }
  res.cookie('xadon_seen', '1', { maxAge: 6 * 3600 * 1000, sameSite: 'lax' });
  res.type('html').send(site.render('welcome'));
});

app.get('/home', (req, res) => {
  res.type('html').send(site.render('main'));
});

app.use('/pair', (req, res) => {
  if (!auth.current(req)) return res.redirect('/auth/login?next=/pair');
  res.type('html').send(site.render('pair'));
});

app.get('/deploy', (req, res) => {
  // Deploy page is public (user pastes their own session); still looks premium
  res.type('html').send(site.render('deploy'));
});

app.get('/manus-routes.json', (_, res) =>
  res.json({
    routes: [
      { path: '/', title: 'Welcome' },
      { path: '/home', title: 'Home' },
      { path: '/pair', title: 'Pair' },
      { path: '/deploy', title: 'Auto-Deploy' },
      { path: '/auth/login', title: 'Login' },
      { path: '/auth/admin', title: 'Admin' },
    ],
  })
);

// Fallback → main
app.use((req, res) => {
  res.type('html').send(site.render('main'));
});

app.listen(port, () => {
  console.log(`XADON Pair Site v2.1 ready on http://localhost:${port}`);
});

module.exports = app;
