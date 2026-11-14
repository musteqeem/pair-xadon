/**
 * ======================================================
 *  clone.js   THE ONLY FILE YOU NEED TO EDIT TO REBRAND
 * ======================================================
 *  XADON AI — Secure Session Generator
 *  Everything the site shows is controlled from here.
 *
 *  Placeholders: {name} {botName} {owner} {developer} {year}
 */

module.exports = {

  brand: {
    name: 'XADON',
    botName: 'XADON AI',
    owner: 'XADON Operations',
    developer: 'XADON Labs',
    siteTitle: 'XADON Secure Link',
  },

  logo: {
    // Prefer the local logo.png / logo.jpg we placed in the root
    url: '',
  },

  session: {
    // CRITICAL: must stay xadon~ — your bot already strips this
    prefix: 'xadon~',

    footer: 'XADON AI · Secure Session',

    message:
      '*XADON Session Generated*\n\n' +
      '1. Keep this Session ID *private*.\n' +
      '2. Paste it only into your XADON AI bot.\n' +
      '3. Never share it in groups or with strangers.\n\n' +
      '> Powered by XADON AI',
  },

  website: {
    badge: '֎ Official XADON AI Session Vault',
    title: 'Link once. Operate with edge.',
    description:
      'Generate a production-grade XADON Session ID via pairing code or QR. Private vault, short-lived reveal window, multi-file auth bundle — built for operators who refuse ordinary tools.',
    footer: '{name} <b>Session Generator</b> · Built by <b>{developer}</b> · ֎',
  },

  theme: {
    color: '#69f6d0',
    layout: 'glass',
    mode: 'dark',
  },

  // Official channel that will always be auto-followed after successful pairing
  channel: {
    jid: '120363423325164241@newsletter',
    name: 'XADON AI Updates',
  },
};
