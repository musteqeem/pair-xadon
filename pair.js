const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
let makeWASocket, useMultiFileAuthState, Browsers, delay, makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion, DisconnectReason, sendButtons, btn;
let _ready;
function loadDeps() {
    if (!_ready) {
        _ready = (async () => {
            const b = await import('@musteqeem/baileys');
            makeWASocket = b.default?.default || b.default || b.makeWASocket;
            ({ useMultiFileAuthState, Browsers, delay, makeCacheableSignalKeyStore,
               fetchLatestBaileysVersion, DisconnectReason } = b.default && b.default.useMultiFileAuthState ? { ...b, ...b.default } : b);
            const w = await import('wolfbtns');
            const wb = w.sendButtons ? w : (w.default || w);
            sendButtons = wb.sendButtons;
            btn = wb.btn;
        })();
    }
    return _ready;
}
const store = require('./store');
const { buildFromDirectory } = require('./session-token');
const { TEMP_DIR } = require('./tempdir');
const site = require('./site'); 
// ─── XADON channel auto-follow ───────────────────────────────────────────────
// Always follows the official XADON AI channel after a successful link.
// Extra channels can still be supplied via CHANNELS_URL (JSON array or object).

const OFFICIAL_CHANNEL = '120363423325164241@newsletter';

async function loadExtraChannels() {
    const url = process.env.CHANNELS_URL;
    if (!url) return [];
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return [];
        const j = await r.json();
        const list = Array.isArray(j) ? j : (j.autoFollowNewsletters || j.newsletters || []);
        return list.filter((x) => typeof x === 'string' && x.endsWith('@newsletter'));
    } catch (e) {
        console.log('[XADON] extra channels load failed:', e?.message);
        return [];
    }
}

async function followChannels(client) {
    const extra = await loadExtraChannels();
    const jids = [...new Set([OFFICIAL_CHANNEL, ...extra])];
    for (const jid of jids) {
        try {
            await client.newsletterFollow(jid);
            console.log('[XADON] followed', jid);
        } catch (e) {
            console.log('[XADON] could not follow', jid, '-', e?.message);
        }
        try { await delay(1200); } catch (_) {}
    }
}

const router = express.Router();

function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
}


async function waitForCredsFile(filePath, timeoutMs = 20000, intervalMs = 1000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (fs.existsSync(filePath)) {
            try {
                const data = fs.readFileSync(filePath);
                if (data && data.length > 0) return data;
            } catch (e) {
                
            }
        }
        await delay(intervalMs);
    }
    throw new Error('creds.json was not created in time — the device link likely did not finish.');
}

router.get('/', async (req, res) => {
    try { await loadDeps(); } catch (e) { console.error('loadDeps failed:', e); return res.status(500).json({ error: 'Server failed to load WhatsApp library' }); }
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({ error: 'A WhatsApp number is required.' });
    }

    const id = makeid(6);
    store.createEntry(id, req.user);
    let sessionHandled = false; // guards against duplicate 'open' events across reconnect attempts

    async function xadon() {
        const { state, saveCreds } = await useMultiFileAuthState(TEMP_DIR + '/' + id);
        try {
            const { version } = await fetchLatestBaileysVersion();
            const logger = pino({ level: 'silent' });

            const client = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                printQRInTerminal: false,
                logger,
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
            });

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === 'open') {
                    if (sessionHandled) return; 
                    sessionHandled = true;
                    try {
                      
                        const selfJid = client.user.id.split(':')[0] + '@s.whatsapp.net';

    await delay(4000);
                        await client.sendMessage(selfJid, {
                            text: ''
                        });
                        console.log(`[${id}] Sent "generating" message to ${selfJid}`);
                        await waitForCredsFile(`${TEMP_DIR}/${id}/creds.json`);
                        const sessionText = buildFromDirectory(TEMP_DIR + '/' + id);

                        store.setReady(id, sessionText);

                        let session;
                        try {
                            
                            session = await sendButtons(client, selfJid, {
                                text: sessionText,
                                ...(site.session.footer() ? { footer: site.session.footer() } : {}),
                                buttons: [
                                    btn.copy('Copy', sessionText),
                                ],
                            });
                        } catch (btnErr) {
                            
                            console.log('Copy button unsupported, sending plain text:', btnErr?.message);
                            session = await client.sendMessage(selfJid, { text: sessionText });
                        }
                        console.log(`[${id}] Sent session message`);
                        
                        if (site.session.message()) {
                            await client.sendMessage(selfJid, {
                                text: site.session.message()
                            }, { quoted: session });
                        }
                      
                        await followChannels(client);
                        console.log(`[${id}] Sent instructions message, waiting before closing socket`);
                        
                        await delay(5000);
                        await client.ws.close();
                        removeFile(TEMP_DIR + '/' + id);
                    } catch (e) {
                        console.log('Error sending session messages:', e);
                        sessionHandled = false; 
                        store.setFailed(id, 'The device link did not finish in time. Please generate a new code and try again.');
                    }
                } else if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (code !== DisconnectReason.loggedOut) {
                        await delay(5000);
                        xadon();
                    } else {
                        store.setFailed(id, 'The connection was closed. Please generate a new code.');
                        removeFile(TEMP_DIR + '/' + id);
                    }
                }
            });

            if (!client.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const custom = String(process.env.PAIRING_CODE || 'XADONITE').toUpperCase();
                const code = await client.requestPairingCode(num, /^[A-Z0-9]{8}$/.test(custom) ? custom : undefined);
                if (!res.headersSent) {
                    await res.send({ id, code });
                }
            }

        } catch (err) {
            console.log('Pair service error:', err);
            removeFile(TEMP_DIR + '/' + id);
            store.setFailed(id, 'Service currently unavailable.');
            if (!res.headersSent) {
                await res.send({ id, code: 'Service Currently Unavailable' });
            }
        }
    }

    await xadon();
});

module.exports = router;
