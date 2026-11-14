const sessions = new Map();
const TTL_MS = 10 * 60 * 1000;
function createEntry(id, user) {
  const entry = { id, userId: user?.id || null, userEmail: user?.email || '', status: 'pending', session: null, error: null, createdAt: Date.now(), readyAt: null };
  entry.timer = setTimeout(() => sessions.delete(id), TTL_MS).unref?.();
  sessions.set(id, entry); return entry;
}
function setReady(id, sessionText) { const e = sessions.get(id); if (!e) return; e.status = 'ready'; e.session = sessionText; e.readyAt = Date.now(); }
function setFailed(id, reason) { const e = sessions.get(id); if (!e) return; e.status = 'failed'; e.error = reason || 'Something went wrong while generating your session.'; }
function owns(id, user) { const e = sessions.get(id); return e && user && e.userId === user.id; }
function peekStatus(id, user) { const e = sessions.get(id); if (!e) return { status: 'not_found' }; if (!owns(id, user)) return { status: 'forbidden' }; return { status: e.status, error: e.error || null, createdAt: e.createdAt, expiresAt: e.createdAt + TTL_MS }; }
function consume(id, user) { const e = sessions.get(id); if (!e) return { status: 'not_found' }; if (!owns(id, user)) return { status: 'forbidden' }; if (e.status !== 'ready') return { status: e.status, error: e.error || null }; return { status: 'ready', session: e.session, expiresAt: e.createdAt + TTL_MS }; }
function active() { return [...sessions.values()].map(({ timer, session, ...e }) => ({ ...e, expiresAt: e.createdAt + TTL_MS, hasSession: !!session })); }
module.exports = { createEntry, setReady, setFailed, peekStatus, consume, active, TTL_MS };
