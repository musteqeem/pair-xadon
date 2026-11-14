const fs = require('fs');
const path = require('path');

// HARD-CODED — must match what XADON AI bot expects and strips
const PREFIX = 'xadon~';

function collectFiles(dir, root = dir, output = {}) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) collectFiles(file, root, output);
    else if (stat.isFile()) output[path.relative(root, file)] = fs.readFileSync(file).toString('base64');
  }
  return output;
}

/**
 * Builds the official XADON multi-file session token:
 *   xadon~ + base64url( JSON({ version:2, type:'xadon-auth', files:{...} }) )
 * This is exactly what the XADON AI bot imports via session-id.js
 */
function buildFromDirectory(dir) {
  const payload = {
    version: 2,
    type: 'xadon-auth',
    files: collectFiles(dir),
  };
  return PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decode(input) {
  const value = String(input || '').trim();
  const raw = value.replace(/^xadon(?:~|:)?/i, '');
  try {
    const text = Buffer.from(raw, 'base64url').toString('utf8');
    const payload = JSON.parse(text);
    if (!payload || payload.type !== 'xadon-auth' || !payload.files) {
      throw new Error('Invalid XADON bundle');
    }
    return payload;
  } catch (_) {
    // Legacy single-file base64 creds fallback
    try {
      const creds = Buffer.from(raw, 'base64').toString('utf8');
      JSON.parse(creds);
      return {
        version: 1,
        type: 'legacy-creds',
        files: { 'creds.json': Buffer.from(creds).toString('base64') },
      };
    } catch (e2) {
      throw new Error('Invalid session token');
    }
  }
}

module.exports = { PREFIX, buildFromDirectory, decode };
