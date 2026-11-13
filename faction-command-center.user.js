// ==UserScript==
// @name         Faction Command Center
// @namespace    faction-command-center
// @version      1.7.0
// @author       IvyLara [4393901]
// @homepageURL  https://www.torn.com/profiles.php?XID=4393901
// @supportURL   https://www.torn.com/profiles.php?XID=4393901
// @updateURL    https://raw.githubusercontent.com/Ivylara198/faction-command-center/main/faction-command-center.user.js
// @downloadURL  https://raw.githubusercontent.com/Ivylara198/faction-command-center/main/faction-command-center.user.js
// @copyright    2026, IvyLara [4393901]. All rights reserved. Do not redistribute or modify without permission.
// @description  Type a command, get faction info (members, chain, war, vault, armoury, war pay...). Alerts to your own Discord webhook. Works in Tampermonkey and Torn PDA. Your API key and webhook stay on your device only.
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @connect      discord.com
// @connect      discordapp.com
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
 * PRIVACY / HOW IT WORKS
 * - Your API key and Discord webhook are saved with GM_setValue, i.e. inside Tampermonkey
 *   on THIS device/browser. They are never sent anywhere except:
 *     * the API key -> api.torn.com (to fetch your faction data)
 *     * the webhook -> the Discord webhook URL you typed (to post results)
 * - There is no developer server, no analytics, no tracking. Only the two @connect
 *   domains above (plus discordapp.com) are allowed by the script header.
 * - Nothing is collected or exported. Results only appear in the panel and, if you
 *   turn it on, in your own Discord channel.
 */

(function () {
  'use strict';

  /* ---------- authorship seal ---------- */
  const _n = [73, 118, 121, 76, 97, 114, 97], _i = [52, 51, 57, 51, 57, 48, 49];
  const CREDIT = String.fromCharCode(..._n) + ' [' + String.fromCharCode(..._i) + ']';
  const PROFILE = 'https://www.torn.com/profiles.php?XID=' + String.fromCharCode(..._i);
  const H = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
  const HC = 3903572482, HP = 383737834;
  let locked = false;
  const authorOk = () => { try { const a = GM_info.script.author; return a === undefined || H(a) === HC; } catch (e) { return true; } };
  const SEAL = () => !locked && H(CREDIT) === HC && H(PROFILE) === HP && authorOk();
  const lockMsg = () => `This copy has been modified. Please use the original script by ${CREDIT}.`;
  // invisible signature (zero-width characters) carried by titles and Discord posts
  const MARK = (() => {
    let o = '';
    for (const ch of CREDIT) for (const b of ch.charCodeAt(0).toString(2).padStart(8, '0')) o += b === '1' ? '\u200c' : '\u200b';
    return o;
  })();

  /* ---------- storage (local to this device) ---------- */
  const K_KEY = 'fc_apikey', K_HOOK = 'fc_webhook', K_SEND = 'fc_send';
  // Torn PDA: the app swaps the placeholder below for the user's own key, and offers PDA_httpGet / PDA_httpPost for web requests
  const PDA_KEY = '###PDA-APIKEY###';
  const IS_PDA = typeof PDA_httpGet === 'function';
  const pdaKey = () => (/^[A-Za-z0-9]{12,40}$/.test(PDA_KEY) ? PDA_KEY : '');
  const getKey = () => get(K_KEY) || pdaKey();
  const get = (k, d = '') => GM_getValue(k, d);
  const set = (k, v) => GM_setValue(k, v);
  const HOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

  /* ---------- helpers ---------- */
  const cache = new Map();
  const num = n => Number(n || 0).toLocaleString('en-US');
  const money = n => '$' + num(n);
  const dur = s => {
    s = Math.max(0, Math.floor(s));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    const out = [d && d + 'd', h && h + 'h', m && m + 'm'].filter(Boolean);
    return out.length ? out.join(' ') : s + 's';
  };
  const ago = t => dur(Date.now() / 1000 - t) + ' ago';
  const strip = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const vals = o => (!o ? [] : Array.isArray(o) ? o : Object.values(o));
  const f = (name, value, inline = false) => ({ name: String(name), value: String(value === '' || value == null ? '—' : value), inline });
  const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  const GOLD = 0xd4af37;

  function members(d) {
    const m = d.members;
    if (!m) return [];
    if (Array.isArray(m)) return m;
    return Object.entries(m).map(([id, v]) => ({ id, ...v }));
  }
  const tag = m => `${m.name} [${m.id}]`;

  function http(opts) {
    if (IS_PDA) {
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('Request timed out')), 20000);
        let job;
        try { job = opts.method === 'POST' ? PDA_httpPost(opts.url, opts.headers || {}, opts.data || '') : PDA_httpGet(opts.url); }
        catch (e) { clearTimeout(timer); return rej(new Error('Network error')); }
        Promise.resolve(job).then(r => {
          clearTimeout(timer);
          if (typeof r === 'string') return res({ status: 200, responseText: r });
          res({ status: Number(r && r.status) || 200, responseText: String((r && (r.responseText ?? r.response ?? r.body)) ?? '') });
        }, () => { clearTimeout(timer); rej(new Error('Network error')); });
      });
    }
    return new Promise((res, rej) =>
      GM_xmlhttpRequest({
        ...opts,
        timeout: 20000,
        onload: res,
        onerror: () => rej(new Error('Network error')),
        ontimeout: () => rej(new Error('Request timed out')),
      })
    );
  }

  const K_CALLS = 'fc_calls', K_SENT = 'fc_sent', K_PAY = 'fc_pay', K_WSTATE = 'fc_wstate', K_UPD = 'fc_upd';
  const callsNow = () => { const c = Date.now() - 60000; return (get(K_CALLS, null) || []).filter(t => t > c); };
  async function getJson(url) {
    const recent = callsNow();
    if (recent.length >= 90) throw new Error("Close to Torn's limit of 100 calls per minute. Wait a few seconds and try again.");
    recent.push(Date.now()); set(K_CALLS, recent);
    const r = await http({ method: 'GET', url });
    try { return JSON.parse(r.responseText); } catch { throw new Error('Bad response from the Torn API.'); }
  }
  const ERR = {
    1: 'No API key was sent.',
    2: "That API key isn't valid. Re-paste it in Settings.",
    5: 'Too many requests. Torn allows 100 per minute, wait a minute and try again.',
    6: "Torn couldn't find that ID.",
    7: "This key can't see that faction data. The key's owner usually needs a faction position that allows it.",
    8: 'Torn has temporarily blocked your IP for too many requests. Wait a few minutes.',
    9: "Torn's API is switched off right now. Try again later.",
    10: "The key owner is in federal jail, so the key is disabled.",
    12: 'Torn could not read the key. Try again.',
    13: 'That key is disabled because its owner has been inactive.',
    14: 'The daily read limit for this key has been reached.',
    15: 'Temporary Torn API error. Try again shortly.',
    16: "This key's access level is too low for that data. Make a key with a higher access level (Torn > Settings > API Key) from a member who can see faction data.",
    17: 'Torn backend error. Try again shortly.',
    18: "Torn's API is paused right now. Try again later.",
  };
  const apiErr = d => new Error(`${ERR[d.error.code] || d.error.error} (Torn error ${d.error.code})`);
  const MIGRATED = [19, 23, 27]; // selections that moved to API v2 / crimes 2.0

  // Fallback: fetch each selection from the v2 endpoint and reshape it like v1
  async function apiV2(sel, key) {
    const url = (name, extra = '') => `https://api.torn.com/v2/faction/${name}?${extra}key=${key}`;
    const res = {};
    for (const s of sel.split(',')) {
      const d = await getJson(s === 'mainnews' ? url('news', 'cat=main&') : url(s));
      if (d.error) throw apiErr(d);
      if (s === 'basic') {
        const m = await getJson(url('members'));
        if (m.error) throw apiErr(m);
        Object.assign(res, d.basic || d);
        res.members = m.members;
      } else if (s === 'mainnews') res.mainnews = d.news ?? d.mainnews;
      else if (s in d) res[s] = d[s];
      else Object.assign(res, d);
    }
    return res;
  }

  async function api(sel) {
    const key = getKey();
    if (!SEAL()) throw new Error(lockMsg());
    if (!key) throw new Error('Add your API key in Settings first.');
    const hit = cache.get(sel);
    if (hit && Date.now() - hit.t < 30000) return hit.d; // 30s cache, saves your API calls
    const k = encodeURIComponent(key);
    let d = await getJson(`https://api.torn.com/faction/?selections=${sel}&key=${k}`);
    if (d.error && MIGRATED.includes(d.error.code)) d = await apiV2(sel, k);
    else if (d.error) throw apiErr(d);
    cache.set(sel, { t: Date.now(), d });
    return d;
  }

  // <<helpers
  const parseAmt = x => {
    const m = String(x == null ? '' : x).trim().toLowerCase().replace(/[$,\s]/g, '').match(/^(\d*\.?\d+)([kmb])?$/);
    return m ? Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1)) : NaN;
  };
  const ents = o => (!o ? [] : Array.isArray(o) ? o : Object.entries(o).map(([id, v]) => ({ id, ...v })));
  const parseWatch = x => String(x || '').split(',').map(t => t.trim()).filter(Boolean).map(t => {
    const m = t.match(/^(.+?)\s*[=<:]\s*(\d+)$/);
    return m ? { name: m[1].trim().toLowerCase(), min: +m[2] } : null;
  }).filter(Boolean);
  function calcPay(rows, total, mode, min, fac, pl) {
    const wt = r => (mode === 'score' ? r.score : r.hits);
    const elig = rows.filter(r => r.hits >= min && wt(r) > 0).map(r => ({ ...r }));
    const W = elig.reduce((a, r) => a + wt(r), 0);
    const facAmt = Math.floor(total * fac / 100);
    const pot = Math.floor(total * pl / 100);
    elig.forEach(r => { r.pay = W ? Math.floor(pot * (wt(r) / W)) : 0; });
    elig.sort((a, b) => b.pay - a.pay);
    return { elig, W, pot, facAmt, paid: elig.reduce((a, r) => a + r.pay, 0) };
  }
  // helpers>>

  // dedupe for alerts, shared between open tabs
  function claim(key, ttl) {
    const m = get(K_SENT, null) || {}, now = Date.now();
    if (m[key] && now - m[key] < ttl) return false;
    m[key] = now;
    for (const k in m) if (now - m[k] > 2 * 864e5) delete m[k];
    set(K_SENT, m);
    return true;
  }
  function unclaim(key) { const m = get(K_SENT, null) || {}; delete m[key]; set(K_SENT, m); }

  /* ---------- version, quiet hours, pay history ---------- */
  const VERSION = '1.7.0';
  const REPO_URL = 'https://github.com/Ivylara198/faction-command-center';
  const RAW_URL = 'https://raw.githubusercontent.com/Ivylara198/faction-command-center/main/faction-command-center.user.js';
  const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  function isQuiet(o) {
    if (!o.qOn) return false;
    const a = toMin(o.qFrom), b = toMin(o.qTo), d = new Date(), m = d.getHours() * 60 + d.getMinutes();
    if (a === b) return false;
    return a < b ? m >= a && m < b : m >= a || m < b;
  }
  const pingFor = (o, kind) => (o.role && (o.rolePing === 'both' || (o.rolePing === 'chain' && kind === 'chain')) ? { role: o.role } : {});
  const parseWho = x => String(x || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 10).map(t => (/^\d+$/.test(t) ? { id: t } : { name: t }));
  const vNum = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
  const isNewer = (a, b) => { const x = vNum(a), y = vNum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

  const payAll = () => get(K_PAY, null) || {};
  function recordPay(e) {
    const all = payAll(), old = all[e.id];
    e.rows.forEach(r => { const o = old && old.rows.find(x => String(x.id) === String(r.id)); r.paid = !!(o && o.paid && o.pay === r.pay); });
    all[e.id] = e;
    Object.keys(all).sort((a, b) => all[b].at - all[a].at).slice(20).forEach(k => delete all[k]);
    set(K_PAY, all);
    return e;
  }
  function setPaid(warId, memberId, v) {
    const all = payAll(), e = all[warId];
    if (!e) return;
    const r = e.rows.find(x => String(x.id) === String(memberId));
    if (r) { r.paid = !!v; set(K_PAY, all); }
  }
  const csvCell = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  function csvFor(e) {
    const head = ['war_id', 'war', 'member_id', 'name', 'hits', 'score', 'pay', 'paid'];
    const lines = e.rows.map(r => [e.id, e.war, r.id, r.name, r.hits, r.score, r.pay, r.paid ? 'yes' : 'no'].map(csvCell).join(','));
    return [head.join(','), ...lines].join('\r\n') + '\r\n';
  }
  const paidCount = e => e.rows.filter(r => r.paid).length;
  function payResult(e) {
    return {
      title: `Payout · war ${e.id}`,
      color: GOLD,
      pay: e,
      fields: [f('War', e.war), f('Total', money(e.total), true), f('Split', `${e.mode} · faction ${e.fac}% · players ${e.pl}%`, true), f('Paid', `${paidCount(e)} of ${e.rows.length}`, true)],
      description: e.rows.map((r, i) => `${i + 1}. ${r.name} [${r.id}] · ${money(r.pay)} · ${r.paid ? 'paid' : 'not paid'}`).join('\n'),
    };
  }


  let alertErr = '';
  let _me = null;
  async function myFactionId() {
    if (_me) return _me;
    const b = await api('basic');
    _me = String(b.ID ?? b.id ?? '');
    return _me;
  }
  async function warList() { // newest first, each with its id
    const arr = ents((await api('rankedwars')).rankedwars);
    return arr.map(w => ({ ...w, ...(w.war || {}), id: w.id })).sort((a, b) => (b.start || 0) - (a.start || 0));
  }
  async function warReport(id) {
    if (!SEAL()) throw new Error(lockMsg());
    const key = getKey();
    if (!key) throw new Error('Add your API key in Settings first.');
    const ck = 'wr' + id, hit = cache.get(ck);
    if (hit && Date.now() - hit.t < 30000) return hit.d;
    const k = encodeURIComponent(key);
    let d = await getJson(`https://api.torn.com/torn/${id}?selections=rankedwarreport&key=${k}`);
    if (d.error) {
      d = await getJson(`https://api.torn.com/v2/faction/${id}/rankedwarreport?key=${k}`);
      if (d.error) throw apiErr(d);
    }
    const rep = d.rankedwarreport || d;
    cache.set(ck, { t: Date.now(), d: rep });
    return rep;
  }
  const ARM = ['weapons', 'armor', 'temporary', 'medical', 'drugs', 'boosters'];
  async function armouryItems() {
    const d = await api(ARM.join(','));
    return ARM.flatMap(c => vals(d[c]).map(i => ({ name: String(i.name || ''), qty: Number(i.quantity) || 0, avail: Number(i.available ?? i.quantity) || 0, cat: c })));
  }
  const crimeInfo = c => {
    const slots = Array.isArray(c.slots) ? c.slots : null;
    return {
      id: c.id ?? `${c.name || c.crime_name}${c.created_at || c.time_started || ''}`,
      name: c.name || c.crime_name || 'OC',
      ready: c.ready_at || c.time_ready || 0,
      done: !!(c.initiated || c.executed_at || /success|fail|expired/i.test(c.status || '')),
      filled: slots ? slots.filter(x => x.user || x.user_id).length : null,
      total: slots ? slots.length : null,
    };
  };

  /* ---------- commands ----------
     every command returns { title, description?, fields:[{name,value,inline}], color? } */
  const C = {};

  C.info = {
    desc: 'Faction overview',
    run: async () => {
      const d = await api('basic');
      const ms = members(d);
      const on = ms.filter(m => m.last_action?.status === 'Online').length;
      const idle = ms.filter(m => m.last_action?.status === 'Idle').length;
      const nameOf = v => { const id = v && typeof v === 'object' ? v.id : v; const m = ms.find(x => String(x.id) === String(id)); return m ? tag(m) : (v && v.name) || id || '—'; };
      return {
        title: `${d.name || 'Faction'} [${d.tag || ''}]`,
        color: GOLD,
        fields: [
          f('Members', `${ms.length}/${d.capacity ?? '?'}`, true),
          f('Online / Idle', `${on} / ${idle}`, true),
          f('Respect', num(d.respect), true),
          f('Best chain', num(d.best_chain), true),
          f('Age', `${num(d.age)} days`, true),
          f('Peace', d.peace && Object.keys(d.peace).length ? 'Yes' : 'No', true),
          f('Leader', nameOf(d.leader), true),
          f('Co-leader', nameOf(d['co-leader'] ?? d.co_leader), true),
        ],
      };
    },
  };

  C.members = {
    desc: 'Member count by status',
    run: async () => {
      const ms = members(await api('basic'));
      const count = {};
      ms.forEach(m => { const s = m.last_action?.status || 'Unknown'; count[s] = (count[s] || 0) + 1; });
      const states = {};
      ms.forEach(m => { const s = m.status?.state || 'Unknown'; states[s] = (states[s] || 0) + 1; });
      const lv = ms.length ? Math.round(ms.reduce((a, m) => a + (m.level || 0), 0) / ms.length) : 0;
      return {
        title: `Members (${ms.length})`,
        color: GOLD,
        fields: [
          f('Activity', Object.entries(count).map(([k, v]) => `${k}: ${v}`).join('\n')),
          f('State', Object.entries(states).map(([k, v]) => `${k}: ${v}`).join('\n')),
          f('Average level', lv, true),
        ],
      };
    },
  };

  C.online = {
    desc: 'Who is online / idle right now',
    run: async () => {
      const ms = members(await api('basic')).filter(m => ['Online', 'Idle'].includes(m.last_action?.status));
      const line = m => `${tag(m)} · ${m.last_action.status}`;
      return { title: `Online / Idle (${ms.length})`, color: 0x57f287, description: ms.map(line).join('\n') || 'Nobody is online.' };
    },
  };

  C.hospital = {
    desc: 'Members in hospital',
    run: async () => {
      const now = Date.now() / 1000;
      const ms = members(await api('basic')).filter(m => m.status?.state === 'Hospital');
      const line = m => `${tag(m)} · ${m.status.until ? dur(m.status.until - now) + ' left' : ''}`;
      return { title: `In hospital (${ms.length})`, color: 0xed4245, description: ms.map(line).join('\n') || 'Nobody is in hospital.' };
    },
  };

  C.travel = {
    desc: 'Members travelling / abroad',
    run: async () => {
      const ms = members(await api('basic')).filter(m => ['Traveling', 'Abroad'].includes(m.status?.state));
      const line = m => `${tag(m)} · ${strip(m.status.description)}`;
      return { title: `Travelling / abroad (${ms.length})`, color: 0x3498db, description: ms.map(line).join('\n') || 'Nobody is travelling.' };
    },
  };

  C.inactive = {
    desc: 'Inactive members. Usage: inactive [days] (default 3)',
    run: async args => {
      const days = Math.max(1, parseInt(args[0], 10) || 3);
      const cut = Date.now() / 1000 - days * 86400;
      const ms = members(await api('basic'))
        .filter(m => (m.last_action?.timestamp || 0) < cut)
        .sort((a, b) => (a.last_action?.timestamp || 0) - (b.last_action?.timestamp || 0));
      return {
        title: `Inactive ${days}+ days (${ms.length})`,
        color: 0x95a5a6,
        description: ms.map(m => `${tag(m)} · ${m.last_action?.relative || 'unknown'}`).join('\n') || 'Everyone has been active.',
      };
    },
  };

  C.chain = {
    desc: 'Current chain status',
    run: async () => {
      const d = (await api('chain')).chain || {};
      const active = d.current > 0;
      return {
        title: active ? `Chain: ${num(d.current)} / ${num(d.max)}` : 'No active chain',
        color: active ? GOLD : 0x95a5a6,
        fields: active
          ? [
              f('Time left', dur(d.timeout), true),
              f('Bonus modifier', d.modifier ?? '—', true),
              f('Started', d.start ? ago(d.start) : '—', true),
            ]
          : [f('Cooldown', d.cooldown ? dur(d.cooldown) : 'None', true), f('Max reached', num(d.max), true)],
      };
    },
  };

  C.war = {
    desc: 'Latest ranked war',
    run: async () => {
      const ws = vals((await api('rankedwars')).rankedwars).map(w => ({ ...w, ...(w.war || {}) })).sort((a, b) => (b.start || 0) - (a.start || 0));
      const w = ws[0];
      if (!w) return { title: 'Ranked war', description: 'No ranked wars found.' };
      const now = Date.now() / 1000;
      const { start, end, target, winner } = w;
      const state = end && end < now ? 'Finished' : start > now ? 'Upcoming' : 'ACTIVE';
      const fs = Array.isArray(w.factions) ? w.factions : Object.entries(w.factions || {}).map(([id, x]) => ({ id, ...x }));
      const lines = fs.map(x => `**${x.name}** — ${num(x.score)} pts (chain ${num(x.chain)})`);
      const out = [f('Status', state, true), f('Target', num(target), true)];
      if (state === 'ACTIVE') out.push(f('Started', ago(start), true));
      if (state === 'Upcoming') out.push(f('Starts in', dur(start - now), true));
      if (winner) out.push(f('Winner', (fs.find(x => String(x.id) === String(winner)) || {}).name || winner, true));
      if (fs.length === 2) out.push(f('Lead', num(Math.abs(fs[0].score - fs[1].score)), true));
      return { title: 'Ranked war', color: state === 'ACTIVE' ? 0xed4245 : GOLD, description: lines.join('\n'), fields: out };
    },
  };

  C.territory = {
    desc: 'Territory owned',
    run: async () => {
      const t = (await api('territory')).territory;
      const names = Array.isArray(t) ? t.map(x => x.id || x.name || x) : Object.keys(t || {});
      return { title: `Territory (${names.length})`, color: GOLD, description: names.join(', ') || 'No territory owned.' };
    },
  };

  C.vault = {
    desc: 'Faction vault + top balances (needs vault permission)',
    run: async () => {
      const d = await api('balance');
      const b = d.balance || {};
      const fb = d.faction_balance || b.faction || (b.money !== undefined ? b : {});
      const mb = vals(d.donations || b.members || d.members_balance || d.member_balance);
      const all = mb.map(x => ({ n: x.name || x.username || '?', m: x.money_balance ?? x.money ?? 0, p: x.points_balance ?? x.points ?? 0 }));
      const top = [...all].sort((a, b2) => b2.m - a.m).slice(0, 8);
      const sum = k => all.reduce((a, x) => a + (Number(x[k]) || 0), 0);
      const fields = [];
      if (fb.money !== undefined || fb.points !== undefined) {
        const own = Number(fb.money) || 0, ownP = Number(fb.points) || 0;
        fields.push(f('Vault only (faction balance)', `${money(own)} · ${num(ownP)} pts`));
        if (all.length) {
          fields.push(f('Member balances', `${money(sum('m'))} · ${num(sum('p'))} pts`));
          fields.push(f('Total in vault', `${money(own + sum('m'))} · ${num(ownP + sum('p'))} pts`));
        }
      }
      if (top.length) fields.push(f('Top member balances', top.map(x => `${x.n}: ${money(x.m)}${x.p ? ` / ${num(x.p)} pts` : ''}`).join('\n')));
      return { title: 'Faction vault', color: GOLD, fields: fields.length ? fields : [f('Info', 'No vault data returned.')] };
    },
  };

  C.armoury = {
    desc: 'Armoury totals by category',
    run: async () => {
      const d = await api('weapons,armor,temporary,medical,drugs,boosters');
      const cats = ['weapons', 'armor', 'temporary', 'medical', 'drugs', 'boosters'];
      const fields = cats.map(c => {
        const items = vals(d[c]);
        const total = items.reduce((a, i) => a + (i.quantity || 0), 0);
        const avail = items.reduce((a, i) => a + (i.available ?? i.quantity ?? 0), 0);
        const top = [...items].sort((a, b) => (b.quantity || 0) - (a.quantity || 0)).slice(0, 5)
          .map(i => `${i.name} ×${i.quantity}`).join(', ');
        return f(`${c[0].toUpperCase() + c.slice(1)} — ${num(total)} (${num(avail)} free)`, top || 'Empty');
      });
      return { title: 'Armoury', color: GOLD, fields };
    },
  };

  C.news = {
    desc: 'Latest faction news',
    run: async () => {
      const n = vals((await api('mainnews')).mainnews).sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
      return { title: 'Faction news', color: GOLD, description: n.map(x => `• ${strip(x.news || x.text)} _(${ago(x.timestamp)})_`).join('\n') || 'No news.' };
    },
  };

  C.attacks = {
    desc: 'Latest faction attacks',
    run: async () => {
      const t = x => x.timestamp_ended || x.ended || 0;
      const a = vals((await api('attacks')).attacks).sort((x, y) => t(y) - t(x)).slice(0, 10);
      const line = x => `${x.attacker_name || x.attacker?.name || 'Someone'} → ${x.defender_name || x.defender?.name || '?'}: **${x.result}**${x.respect_gain ? ` (+${Number(x.respect_gain).toFixed(2)})` : ''} _${ago(t(x))}_`;
      return { title: 'Recent attacks', color: 0xed4245, description: a.map(line).join('\n') || 'No attacks.' };
    },
  };

  C.oc = {
    desc: 'Organized crimes (active / recent)',
    run: async () => {
      const now = Date.now() / 1000;
      const done = c => c.initiated || /success|fail|expired/i.test(c.status || '');
      const made = c => c.created_at || c.time_started || 0;
      const cs = vals((await api('crimes')).crimes)
        .sort((a, b) => (done(a) - done(b)) || (made(b) - made(a)))
        .slice(0, 8);
      const line = c => {
        const ready = c.ready_at || c.time_ready || 0;
        let st = c.status || (c.initiated ? (c.success ? 'success' : 'failed') : ready > now ? `ready in ${dur(ready - now)}` : 'ready');
        if (c.status && ready > now && !done(c)) st += ` · ready in ${dur(ready - now)}`;
        const sl = Array.isArray(c.slots) ? ` · ${c.slots.filter(s => s.user || s.user_id).length}/${c.slots.length} filled` : '';
        const gain = c.rewards?.money ?? c.money_gain;
        return `${c.name || c.crime_name || 'OC'} · ${st}${sl}${gain ? ' · ' + money(gain) : ''}`;
      };
      return { title: 'Organized crimes', color: GOLD, description: cs.map(line).join('\n') || 'No crimes found.' };
    },
  };

  C.find = {
    desc: 'Find a member. Usage: find <name or id>',
    run: async args => {
      const q = args.join(' ').toLowerCase();
      if (!q) throw new Error('Usage: find <name or id>');
      const ms = members(await api('basic')).filter(m => String(m.id) === q || (m.name || '').toLowerCase().includes(q)).slice(0, 10);
      return {
        title: `Find "${q}" (${ms.length})`,
        color: GOLD,
        description: ms.map(m => `${tag(m)} · lvl ${m.level} · ${m.last_action?.status || '?'} · ${m.status?.state || ''}`).join('\n') || 'No match.',
      };
    },
  };

  C.new = {
    desc: 'Recent joiners. Usage: new [days] (default 7)',
    run: async args => {
      const days = Math.max(1, parseInt(args[0], 10) || 7);
      const ms = members(await api('basic')).filter(m => (m.days_in_faction ?? 9999) <= days).sort((a, b) => a.days_in_faction - b.days_in_faction);
      return {
        title: `Joined in the last ${days} days (${ms.length})`,
        color: GOLD,
        description: ms.map(m => `${tag(m)} · lvl ${m.level} · ${m.days_in_faction}d`).join('\n') || 'Nobody new.',
      };
    },
  };

  C.levels = {
    desc: 'Level spread of the faction',
    run: async () => {
      const ms = members(await api('basic'));
      const b = [[1, 14], [15, 29], [30, 49], [50, 74], [75, 99], [100, 1e9]];
      const fields = b.map(([lo, hi]) => f(hi >= 1e9 ? `${lo}+` : `${lo}-${hi}`, ms.filter(m => m.level >= lo && m.level <= hi).length, true));
      const top = [...ms].sort((a, c) => c.level - a.level)[0];
      if (top) fields.push(f('Highest', `${tag(top)} lvl ${top.level}`));
      return { title: 'Levels', color: GOLD, fields };
    },
  };

  C.warpay = {
    desc: 'War payouts. Usage: warpay [amount] [hits|score] [fac=20] [pl=80] [war=<id>]',
    run: async args => {
      const o = opts();
      let total = o.payTotal, mode = o.payMode, wid = '', fac = o.payFac, pl = o.payPl, facArg = null, plArg = null;
      for (const a of args) {
        const l = a.toLowerCase();
        let m;
        if (l === 'hits' || l === 'score') mode = l;
        else if ((m = l.match(/^war=(\d+)$/))) wid = m[1];
        else if ((m = l.match(/^(?:fac|faction)=(\d+(?:\.\d+)?)%?$/))) facArg = +m[1];
        else if ((m = l.match(/^(?:pl|players?)=(\d+(?:\.\d+)?)%?$/))) plArg = +m[1];
        else {
          const v = parseAmt(l);
          if (Number.isNaN(v)) throw new Error(`Don't understand "${a}". Try: warpay 500m score fac=20`);
          total = v;
        }
      }
      if (facArg !== null) { fac = facArg; if (plArg === null) pl = 100 - fac; }
      if (plArg !== null) pl = plArg;
      if (fac < 0 || pl < 0 || fac + pl > 100.0001) throw new Error(`Faction ${fac}% + players ${pl}% is over 100%.`);
      if (!(total > 0)) throw new Error('Set a pay amount first: warpay 500m, or save one in Settings > war pay.');
      const me = await myFactionId();
      const now = Date.now() / 1000;
      const wars = await warList();
      const w = wid ? wars.find(x => String(x.id) === wid) : wars.find(x => x.end && x.end <= now);
      if (!w) throw new Error(wid ? 'That war was not found.' : 'No finished ranked war found yet.');
      const rep = await warReport(w.id);
      const fs = ents(rep.factions);
      const mine = fs.find(x => String(x.id) === me), foe = fs.find(x => String(x.id) !== me);
      if (!mine) throw new Error("Your faction isn't in that war report.");
      const rows = ents(mine.members).map(m => ({ id: m.id, name: m.name || '?', hits: Number(m.attacks) || 0, score: Number(m.score) || 0 }));
      const { elig, W, pot, facAmt, paid } = calcPay(rows, total, mode, o.payMin, fac, pl);
      if (!W) throw new Error('Nobody qualifies with these settings.');
      const line = (r, i) => `${i + 1}. ${r.name} [${r.id}] · ${money(r.pay)} · ${r.hits} hits${mode === 'score' ? ' · ' + r.score.toFixed(1) + ' score' : ''}`;
      const fields = [
        f('War', `${mine.name} vs ${foe ? foe.name : '?'} · ended ${w.end ? ago(w.end) : '?'}`),
        f('Total', money(total), true),
        f('Split by', mode, true),
        f(`Faction gets (${fac}%)`, money(facAmt), true),
        f(`Players get (${pl}%)`, money(pot), true),
        f('Qualified', `${elig.length} of ${rows.length}`, true),
        f('Paid to players', money(paid), true),
        f('Left over', money(total - facAmt - paid), true),
      ];
      if (mode === 'hits') fields.push(f('Per hit', money(Math.floor(pot / W)), true));
      const entry = recordPay({
        id: String(w.id), at: Date.now(), war: `${mine.name} vs ${foe ? foe.name : '?'}`, total, mode, fac, pl, facAmt,
        rows: elig.map(r => ({ id: String(r.id), name: r.name, hits: r.hits, score: r.score, pay: r.pay })),
      });
      return {
        title: 'War payouts',
        color: GOLD,
        fields,
        description: elig.map(line).join('\n'),
        copy: elig.map(r => `${r.name} [${r.id}]: ${money(r.pay)}`).join('\n'),
        pay: entry,
      };
    },
  };

  C.stock = {
    desc: 'Armoury stock. Usage: stock <item>  (no item = your watch list)',
    run: async args => {
      const q = args.join(' ').toLowerCase();
      const items = await armouryItems();
      if (q) {
        const m = items.filter(i => i.name.toLowerCase().includes(q)).slice(0, 15);
        return { title: `Stock: ${q}`, color: GOLD, description: m.map(i => `${i.name} · ${num(i.avail)} free of ${num(i.qty)}`).join('\n') || 'Nothing matches.' };
      }
      const w = parseWatch(opts().stock);
      if (!w.length) throw new Error('Usage: stock <item>. Or add a watch list in Settings > alerts.');
      const lines = w.map(x => {
        const have = items.filter(i => i.name.toLowerCase().includes(x.name)).reduce((a, i) => a + i.avail, 0);
        return `${x.name} · ${num(have)} (min ${num(x.min)})${have < x.min ? ' · LOW' : ''}`;
      });
      return { title: 'Watch list', color: GOLD, description: lines.join('\n') };
    },
  };

  C.usage = {
    desc: 'API calls used in the last minute',
    run: async () => ({
      title: 'API usage',
      color: GOLD,
      fields: [f('Last minute', `${callsNow().length} / 100`, true), f('Last alert error', alertErr || 'none')],
    }),
  };

  C.pays = {
    desc: 'Saved war payouts. Usage: pays | pays last | pays <war id>',
    run: async args => {
      const all = payAll(), list = Object.values(all).sort((a, b) => b.at - a.at);
      if (!list.length) throw new Error('No saved payouts yet. Run warpay after a war.');
      const q = (args[0] || '').toLowerCase();
      if (q) {
        const e = q === 'last' ? list[0] : all[q];
        if (!e) throw new Error('No saved payout for that war. Type pays to see them.');
        return payResult(e);
      }
      return {
        title: `Saved payouts (${list.length})`,
        color: GOLD,
        description: list.map(e => `war ${e.id} · ${e.war} · ${money(e.total)} · ${paidCount(e)}/${e.rows.length} paid · ${ago(e.at / 1000)}`).join('\n') + '\n\nOpen one with: pays <war id> or pays last',
      };
    },
  };

  C.unpaid = {
    desc: 'Everyone still owed money, across all saved payouts',
    run: async () => {
      const by = {};
      Object.values(payAll()).forEach(e => e.rows.filter(r => !r.paid).forEach(r => {
        const x = by[r.id] || (by[r.id] = { id: r.id, name: r.name, total: 0, wars: [] });
        x.total += r.pay; x.wars.push(e.id);
      }));
      const list = Object.values(by).sort((a, b) => b.total - a.total);
      if (!list.length) return { title: 'Still unpaid', color: GOLD, description: 'Nobody is owed anything. All saved payouts are ticked as paid.' };
      return {
        title: `Still unpaid (${list.length})`,
        color: GOLD,
        fields: [f('Total owed', money(list.reduce((a, x) => a + x.total, 0)))],
        description: list.map(x => `${x.name} [${x.id}] · ${money(x.total)} · war ${x.wars.join(', ')}`).join('\n'),
        copy: list.map(x => `${x.name} [${x.id}]: ${money(x.total)}`).join('\n'),
      };
    },
  };

  C.score = {
    desc: "Live war scoreboard: top attackers and who hasn't hit yet",
    run: async () => {
      const me = await myFactionId();
      const now = Date.now() / 1000;
      const w = (await warList())[0];
      if (!w) throw new Error('No ranked war found.');
      if (w.start > now) throw new Error(`The war starts in ${dur(w.start - now)}.`);
      const fs = ents(w.factions);
      const mine = fs.find(x => String(x.id) === me), foe = fs.find(x => String(x.id) !== me);
      const live = !(w.end && w.end <= now);
      const [att, basic] = await Promise.all([api('attacks'), api('basic')]);
      const all = vals(att.attacks);
      const ended = x => x.timestamp_ended || x.ended || x.timestamp_started || x.started || 0;
      const aid = x => String(x.attacker_id ?? x.attacker?.id ?? '');
      const afac = x => String(x.attacker_faction ?? x.attacker?.faction?.id ?? x.attacker?.faction_id ?? '');
      const dfac = x => String(x.defender_faction ?? x.defender?.faction?.id ?? x.defender?.faction_id ?? '');
      const scored = x => (x.respect_gain !== undefined ? Number(x.respect_gain) > 0 : /attacked|hospital|mugged|arrested/i.test(String(x.result || '')));
      const mineHits = all.filter(x => {
        const t = ended(x);
        if (t < w.start || (w.end && t > w.end)) return false;
        if (afac(x) && afac(x) !== me) return false;
        if (foe && dfac(x) && dfac(x) !== String(foe.id)) return false;
        return scored(x);
      });
      const by = {};
      mineHits.forEach(x => {
        const id = aid(x);
        const r = by[id] || (by[id] = { id, name: x.attacker_name ?? x.attacker?.name ?? id, hits: 0, resp: 0 });
        r.hits += 1; r.resp += Number(x.respect_gain) || 0;
      });
      const top = Object.values(by).sort((a, b) => b.resp - a.resp || b.hits - a.hits).slice(0, 10);
      const noHit = members(basic).filter(m => !by[String(m.id)]);
      const oldest = all.length ? Math.min(...all.map(ended)) : 0;
      const fields = [f('Status', live ? 'LIVE' : 'Finished', true)];
      if (mine && foe) {
        fields.push(f('Score', `${mine.name} ${num(mine.score)} vs ${num(foe.score)} ${foe.name}`));
        fields.push(f('Lead', `${(mine.score || 0) >= (foe.score || 0) ? 'you by ' : 'them by '}${num(Math.abs((mine.score || 0) - (foe.score || 0)))}`, true));
      }
      fields.push(f('Target', num(w.target), true), f('Hits counted', num(mineHits.length), true));
      if (all.length >= 100 && oldest > w.start) fields.push(f('Note', `Torn only gave the last ${all.length} attacks, so earlier hits in this war are missing.`));
      const lines = top.map((r, i) => `${i + 1}. ${r.name} [${r.id}] · ${r.hits} hits · ${r.resp.toFixed(1)} respect`);
      const none = noHit.slice(0, 20).map(m => `${tag(m)} · ${m.status?.state || '?'} · ${m.last_action?.relative || ''}`);
      return {
        title: 'War scoreboard',
        color: live ? 0xed4245 : GOLD,
        fields,
        description: (lines.join('\n') || 'No hits counted yet.') + `\n\nNo hits yet (${noHit.length}):\n` + (none.join('\n') || 'Everybody has hit.') + (noHit.length > 20 ? `\n+${noHit.length - 20} more` : ''),
      };
    },
  };

  async function userState(id) {
    if (!SEAL()) throw new Error(lockMsg());
    const key = getKey();
    if (!key) throw new Error('Add your API key in Settings first.');
    const k = encodeURIComponent(key);
    let d = await getJson(`https://api.torn.com/user/${id}?selections=profile&key=${k}`);
    if (d.error && MIGRATED.includes(d.error.code)) d = await getJson(`https://api.torn.com/v2/user/${id}/profile?key=${k}`);
    if (d.error) throw apiErr(d);
    const p = d.profile ?? d;
    return { name: p.name || String(id), on: p.last_action?.status === 'Online', hosp: p.status?.state === 'Hospital', until: p.status?.until || 0, rel: p.last_action?.relative || '' };
  }

  C.watch = {
    desc: 'Member watch. Usage: watch | watch add <name or id> | watch rm <name or id> | watch clear',
    run: async args => {
      const sub = (args[0] || '').toLowerCase(), rest = args.slice(1).join(' ').trim();
      const o = opts();
      let cur = o.watch.split(',').map(x => x.trim()).filter(Boolean);
      if (sub === 'add') {
        if (!rest) throw new Error('Usage: watch add <name or id>');
        if (cur.length >= 10) throw new Error('You can watch up to 10 people.');
        if (!cur.some(x => x.toLowerCase() === rest.toLowerCase())) cur.push(rest);
      } else if (sub === 'rm' || sub === 'remove') {
        if (!rest) throw new Error('Usage: watch rm <name or id>');
        cur = cur.filter(x => x.toLowerCase() !== rest.toLowerCase());
      } else if (sub === 'clear') cur = [];
      if (sub) set(K_OPTS, cleanOpts({ ...o, watch: cur.join(', ') }));
      if (!cur.length) return { title: 'Watch list', color: GOLD, description: 'Nobody yet. Add someone with: watch add <name or id>\nTurn on "member watch" under settings > alerts to get pings.' };
      const ms = members(await api('basic'));
      const now = Date.now() / 1000;
      const lines = [];
      for (const w of parseWho(cur.join(','))) {
        const m = w.id ? ms.find(x => String(x.id) === w.id) : ms.find(x => (x.name || '').toLowerCase() === w.name.toLowerCase());
        if (m) lines.push(`${tag(m)} · ${m.last_action?.status || '?'} · ${m.status?.state || '?'}${m.status?.state === 'Hospital' && m.status.until ? ' ' + dur(m.status.until - now) + ' left' : ''}`);
        else if (w.id) { try { const u = await userState(w.id); lines.push(`${u.name} [${w.id}] · ${u.on ? 'Online' : 'Not online'}${u.hosp ? ' · Hospital' + (u.until ? ' ' + dur(u.until - now) + ' left' : '') : ''}`); } catch (e) { lines.push(`${w.id} · ${e.message}`); } }
        else lines.push(`${w.name} · not in your faction, use their ID`);
      }
      return { title: `Watch list (${cur.length})`, color: GOLD, description: lines.join('\n') };
    },
  };

  C.report = {
    desc: 'Combined report: info + chain + war + activity',
    run: async () => {
      const parts = await Promise.all([C.info.run(), C.chain.run(), C.war.run(), C.members.run()]);
      const fields = [];
      parts.forEach(p => {
        fields.push(f(`— ${p.title} —`, p.description || '​'));
        (p.fields || []).forEach(x => fields.push(x));
      });
      return { title: `${parts[0].title} — report`, color: GOLD, fields: fields.slice(0, 25) };
    },
  };

  C.help = {
    desc: 'List commands',
    run: async () => {
      const al = opts().alias;
      return {
        title: 'Commands',
        color: GOLD,
        description: Object.entries(C).map(([k, v]) => `**${k}** — ${v.desc}`).join('\n') + (al.length ? '\n\nYour shortcuts:\n' + al.map(a => `**${a.n}** → ${a.c}`).join('\n') : ''),
      };
    },
  };

  /* ---------- Discord ---------- */
  async function sendDiscord(res, extra = {}) {
    if (!SEAL()) throw new Error(lockMsg());
    const url = get(K_HOOK);
    if (!url) throw new Error('No webhook saved.');
    if (!HOOK_RE.test(url)) throw new Error('Saved webhook URL looks invalid.');
    const embed = {
      title: clip(String(res.title || 'Faction') + MARK, 250),
      color: !res.color || res.color === GOLD ? accentInt() : res.color,
      timestamp: new Date().toISOString(),
      footer: { text: 'Faction Command Center · by ' + CREDIT },
    };
    if (res.description) embed.description = clip(res.description + MARK, 4000);
    if (res.fields?.length)
      embed.fields = res.fields.slice(0, 25).map(x => ({ name: clip(x.name, 250) || '​', value: clip(x.value, 1000) || '—', inline: !!x.inline }));
    const role = /^\d{15,22}$/.test(extra.role || '') ? extra.role : '';
    const body = { username: 'Faction Command', allowed_mentions: { parse: [], roles: role ? [role] : [] }, embeds: [embed] };
    if (role) body.content = `<@&${role}>`;
    const r = await http({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(body),
    });
    if (r.status < 200 || r.status >= 300) throw new Error(`Discord returned ${r.status}`);
  }

  /* ---------- options (all stored on this device) ---------- */
  const K_OPTS = 'fc_opts', K_POS = 'fc_pos', K_LAST = 'fc_lastalert';
  // <<opts
  const DEF = {
    op: 100, fs: IS_PDA ? 14 : 12, ac: '#c9a74a', hot: 'ctrl+shift+f', def: '',
    chain: false, mins: 5, war: false, warPre: 30, warGap: 0, oc: false, stock: '', rep: false, repAt: '20:00',
    payTotal: 0, payMode: 'hits', payMin: 1,
    qOn: false, qFrom: '23:00', qTo: '07:00', qUrgent: true, role: '', rolePing: 'off',
    watchOn: false, watch: '', weekly: false, weeklyDay: 1, weeklyAt: '12:00', weeklyDays: 7, upd: true,
    away: true,
    book: [{ l: 'report', t: 'report' }, { l: 'war', t: 'war' }, { l: 'chain', t: 'chain' }],
  };
  function cleanOpts(o) {
    const n = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    const t = (v, d, max) => (typeof v === 'string' ? v.slice(0, max) : d);
    const fac = n(o.payFac ?? o.payCut, 0, 100, 0), pl = n(o.payPl ?? 100 - fac, 0, 100, 100 - fac);
    const bk = Array.isArray(o.book)
      ? o.book.filter(b => b && typeof b.l === 'string' && typeof b.t === 'string' && b.l.trim() && b.t.trim()).slice(0, 12).map(b => ({ l: b.l.trim().slice(0, 16), t: b.t.trim().slice(0, 200) }))
      : DEF.book;
    const al = Array.isArray(o.alias)
      ? o.alias.filter(a => a && typeof a.n === 'string' && typeof a.c === 'string' && /^[a-z][a-z0-9_-]{0,15}$/.test(a.n) && !C[a.n] && a.c.trim()).slice(0, 15).map(a => ({ n: a.n, c: a.c.trim().slice(0, 200) }))
      : [];
    const role = /^\d{15,22}$/.test(String(o.role || '')) ? String(o.role) : '';
    return {
      op: Math.round(n(o.op, 40, 100, DEF.op)), fs: [11, 12, 14].includes(+o.fs) ? +o.fs : DEF.fs,
      ac: /^#[0-9a-f]{6}$/i.test(o.ac) ? o.ac : DEF.ac, hot: t(o.hot, DEF.hot, 30).toLowerCase(), def: t(o.def, '', 40),
      chain: !!o.chain, mins: Math.round(n(o.mins, 1, 60, DEF.mins)),
      war: !!o.war, warPre: Math.round(n(o.warPre, 1, 240, DEF.warPre)), warGap: Math.round(n(o.warGap, 0, 1e9, 0)),
      oc: !!o.oc, stock: t(o.stock, '', 300),
      rep: !!o.rep, repAt: /^([01]?\d|2[0-3]):[0-5]\d$/.test(o.repAt) ? o.repAt : DEF.repAt,
      payTotal: Math.round(n(o.payTotal, 0, 1e13, 0)), payMode: o.payMode === 'score' ? 'score' : 'hits',
      payMin: Math.round(n(o.payMin, 0, 1e6, DEF.payMin)), payFac: fac, payPl: pl,
      away: o.away !== false, book: bk, alias: al,
      qOn: !!o.qOn, qFrom: TIME_RE.test(o.qFrom) ? o.qFrom : DEF.qFrom, qTo: TIME_RE.test(o.qTo) ? o.qTo : DEF.qTo, qUrgent: o.qUrgent !== false,
      role, rolePing: role && ['chain', 'both'].includes(o.rolePing) ? o.rolePing : 'off',
      watchOn: !!o.watchOn, watch: t(o.watch, '', 300),
      weekly: !!o.weekly, weeklyDay: Math.round(n(o.weeklyDay, 0, 6, DEF.weeklyDay)), weeklyAt: TIME_RE.test(o.weeklyAt) ? o.weeklyAt : DEF.weeklyAt, weeklyDays: Math.round(n(o.weeklyDays, 1, 60, DEF.weeklyDays)),
      upd: o.upd !== false,
    };
  }
  // opts>>
  const opts = () => cleanOpts({ ...DEF, ...(get(K_OPTS, null) || {}) });
  const accentInt = () => parseInt(opts().ac.slice(1), 16);

  /* ---------- UI (shadow DOM so Torn's CSS can't touch it) ---------- */
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483000;left:0;top:0;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
  <style>
    *{box-sizing:border-box}
    [hidden]{display:none!important}
    #fab{position:fixed;left:10px;bottom:10px;width:34px;height:38px;border:0;background:none;display:flex;align-items:center;justify-content:center;cursor:grab;opacity:.92;padding:0;touch-action:none;filter:drop-shadow(0 0 5px #ff3d8b55);transition:opacity .15s,transform .15s}
    #fab:hover{opacity:1;transform:scale(1.08)}
    #fab svg{pointer-events:none;width:100%;height:100%}
    #p{position:fixed;left:10px;bottom:52px;width:min(330px,94vw);display:none;background:#141414;color:#d6d6d6;border:1px solid #2a2a2a;border-radius:8px;box-shadow:0 4px 18px #0008;overflow:hidden;font:12px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
    #p *{font-family:inherit;font-size:inherit;line-height:inherit}
    #p.open{display:flex;flex-direction:column;max-height:calc(100vh - 62px)}
    #bar,#bm,#ft{flex:none}
    #p.cfg #out{display:none}
    #bar{display:flex;align-items:center;border-bottom:1px solid #222;touch-action:none}
    #grip{color:#555;padding:0 2px 0 9px;cursor:grab;user-select:none;letter-spacing:-2px}
    #cmd{flex:1;min-width:0;background:none;border:0;color:#eee;padding:9px 8px;outline:none}
    #gear{background:none;border:0;color:#777;cursor:pointer;padding:0 10px}
    #gear:hover{color:var(--ac,#c9a74a)}
    #set{padding:6px 10px 8px;border-bottom:1px solid #222;background:#111;max-height:58vh;overflow:auto;flex:0 1 auto;min-height:0}
    #tabs{display:flex;flex-wrap:wrap;gap:4px 11px;padding-bottom:5px;border-bottom:1px solid #222}
    #tabs button{background:none;border:0;padding:0;color:#777;cursor:pointer}
    #tabs button.on{color:var(--ac,#c9a74a)}
    .tab{display:none}.tab.on{display:block}
    #set label{display:block;color:#777;margin:6px 0 2px;font-size:.92em}
    #set input[type=password],#set input[type=text],#set input[type=number],#set select{background:#0b0b0b;border:1px solid #262626;border-radius:4px;color:#ddd;padding:4px 6px;outline:none}
    #set input.w{width:100%}
    .sec{-webkit-text-security:disc;text-security:disc}
    #set input:focus,#set select:focus{border-color:#555}
    #set .o{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;color:#aaa}
    #set .o input[type=text]{width:110px}
    #set .o input[type=number]{width:56px}
    #set .o input[type=range]{width:120px;accent-color:var(--ac,#c9a74a)}
    #set .o input[type=color]{width:30px;height:20px;padding:0;border:0;background:none}
    #set .o label.c{display:flex;align-items:center;gap:6px;margin:0;color:#aaa}
    #set .o input.g{width:auto;flex:1;min-width:0}
    #set .note{margin-top:7px;font-size:.9em}
    @media (pointer:coarse){#bm button{padding:5px 12px}#gear{padding:0 16px}#tabs button{padding:4px 0}#cmd{padding:12px 8px}.acts button,.lnk{padding:4px 0}}
    #bm{display:flex;flex-wrap:wrap;gap:5px;padding:7px 10px 0}
    #bm:empty{display:none}
    .pr{display:flex;align-items:center;gap:6px;padding:2px 0}
    .pr input{accent-color:var(--ac,#c9a74a);margin:0}
    .pr .nm{flex:1;text-align:left;color:#ddd;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pr .am{color:#aaa}
    .pr.done .nm,.pr.done .am{color:#666;text-decoration:line-through}
    .paysum{margin:6px 0 2px;color:#aaa}
    #upd{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 10px;border-top:1px solid #222;background:#17130c;color:#e8d08a;flex:none}
    #bm button{background:#1b1b1b;border:1px solid #2a2a2a;color:#b5b5b5;border-radius:10px;padding:1px 9px;cursor:pointer}
    #bm button:hover{color:var(--ac,#c9a74a);border-color:var(--ac,#c9a74a)}
    #bml .o span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .acts{display:flex;gap:12px;margin-top:9px;align-items:center;flex-wrap:wrap}
    .acts button,.lnk{background:none;border:0;padding:0;color:var(--ac,#c9a74a);cursor:pointer}
    .acts button:hover,.lnk:hover{text-decoration:underline}
    .acts button.dim,.lnk.dim{color:#888}
    .row{display:flex;gap:12px;margin-top:8px;align-items:center;flex-wrap:wrap}
    #msg{color:#777;font-size:.92em}
    #out{padding:8px 10px;max-height:52vh;overflow:auto;flex:1 1 auto;min-height:0}
    #out:empty{display:none}
    .t{color:var(--ac,#c9a74a);font-weight:600;margin-bottom:4px}
    .d{white-space:pre-wrap;word-break:break-word;color:#cfcfcf}
    .r{display:flex;gap:8px;padding:1px 0}
    .r .k{flex:0 0 38%;color:#777}
    .r .v{flex:1;white-space:pre-wrap;word-break:break-word}
    .r.ml{display:block;margin-top:4px}
    .r.ml .k{display:block}
    .err{color:#e06c6c}.ok{color:#7fbf7f}.dim{color:#777}
    .n{margin-top:6px;font-size:.92em}
    .cp{background:none;border:0;padding:0;margin-top:6px;color:var(--ac,#c9a74a);cursor:pointer}
    #sup{display:inline-block;padding:2px 10px;text-align:center;text-decoration:none;white-space:nowrap;color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;border-radius:999px;background:linear-gradient(90deg,#ff3d8b,#ff7ab0);box-shadow:0 0 4px #ff3d8b,0 0 9px #ff3d8b77;animation:glow 2.2s ease-in-out infinite}
    #sup:hover{filter:brightness(1.12)}
    @keyframes glow{50%{box-shadow:0 0 6px #ff7ab0,0 0 14px #ff3d8bbb}}
    @media (prefers-reduced-motion:reduce){#sup{animation:none}}
  </style>
  <button id="fab" title="Faction Command Center (drag to move)"><svg viewBox="0 0 24 27" aria-hidden="true"><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d77a"/><stop offset="1" stop-color="#a8832a"/></linearGradient><linearGradient id="fp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3d2"/><stop offset="1" stop-color="#ff3d8b"/></linearGradient><linearGradient id="fb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25221b"/><stop offset="1" stop-color="#101010"/></linearGradient></defs><path d="M12 1.2 22 4.6v8.1c0 6.1-4.2 10.5-10 13.1C6.2 23.2 2 18.8 2 12.7V4.6z" fill="url(#fb)" stroke="url(#fg)" stroke-width="1.4" stroke-linejoin="round"/><g transform="translate(5.2 5.6) scale(.58)"><path d="M12 21.5C5.2 16.2 2.8 12.4 2.8 9.3 2.8 6.6 4.8 4.6 7.3 4.6c1.8 0 3.7 1 4.7 2.9 1-1.9 2.9-2.9 4.7-2.9 2.5 0 4.5 2 4.5 4.7 0 3.1-2.4 6.9-9.2 12.2z" fill="url(#fp)"/><path d="M12 19.2V9.6M12 15l-3.2-3.2M12 12.4l3-3" fill="none" stroke="#101010" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round"/></g></svg></button>
  <div id="p">
    <div id="bar"><span id="grip" title="Drag to move">⋮⋮</span><input id="cmd" type="text" placeholder="command  (help)" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button id="gear" title="Settings">⚙</button></div>
    <div id="bm"></div>
    <div id="set" hidden>
      <div id="tabs"><button data-t="a" class="on">setup</button><button data-t="b">alerts</button><button data-t="c">war pay</button><button data-t="f">marks</button><button data-t="d">look</button><button data-t="e">data</button></div>

      <div class="tab on" id="ta">
        <label>API key (full access)</label>
        <input type="text" class="sec w" id="key">
        <label>Discord webhook (optional)</label>
        <input type="text" class="sec w" id="hook" placeholder="https://discord.com/api/webhooks/...">
        <div class="o"><label class="c"><input type="checkbox" id="send"> post command results to Discord</label></div>
        <div class="o"><span>run on open</span><input type="text" id="def" placeholder="e.g. report" autocomplete="off"></div>
        <div class="o"><span>hotkey</span><input type="text" id="hot" placeholder="ctrl+shift+f" autocomplete="off"></div>
        <div class="dim note">Your key and webhook stay on this device. The key is only sent to api.torn.com, results only to your webhook.</div>
        <div class="dim note" id="usage"></div>
      </div>

      <div class="tab" id="tb">
        <div class="o"><label class="c"><input type="checkbox" id="chain"> chain alert at</label><span><input type="number" id="mins" min="1" max="60"> min left</span></div>
        <div class="o"><label class="c"><input type="checkbox" id="war"> war alerts</label><span>heads-up <input type="number" id="warPre" min="1" max="240"> min</span></div>
        <div class="o"><span>close-score gap (0 = off)</span><input type="number" id="warGap" min="0"></div>
        <div class="o"><label class="c"><input type="checkbox" id="oc"> OC ready / empty slots</label></div>
        <div class="o"><label class="c"><input type="checkbox" id="rep"> daily report at</label><input type="text" id="repAt" placeholder="20:00" autocomplete="off"></div>
        <label>Low-stock watch (item=min, comma separated)</label>
        <input type="text" class="w" id="stock" placeholder="xanax=50, empty blood bag=100" autocomplete="off">
        <label>Quiet hours and pings</label>
        <div class="o"><label class="c"><input type="checkbox" id="qOn"> quiet hours</label><span><input type="text" id="qFrom" style="width:52px" placeholder="23:00"> to <input type="text" id="qTo" style="width:52px" placeholder="07:00"></span></div>
        <div class="o"><label class="c"><input type="checkbox" id="qUrgent"> chain &amp; war alerts ignore quiet hours</label></div>
        <div class="o"><span>Discord role ID to ping</span><input type="text" id="role" placeholder="optional" autocomplete="off"></div>
        <div class="o"><span>ping the role on</span><select id="rolePing"><option value="off">nothing</option><option value="chain">chain alerts</option><option value="both">chain + war alerts</option></select></div>
        <label>People and reports</label>
        <div class="o"><label class="c"><input type="checkbox" id="watchOn"> member watch (online / out of hospital)</label></div>
        <input type="text" class="w" id="watch" placeholder="names or IDs, comma separated (max 10)" autocomplete="off">
        <div class="o"><label class="c"><input type="checkbox" id="weekly"> weekly inactivity report</label><span><select id="weeklyDay"><option value="1">Mon</option><option value="2">Tue</option><option value="3">Wed</option><option value="4">Thu</option><option value="5">Fri</option><option value="6">Sat</option><option value="0">Sun</option></select> <input type="text" id="weeklyAt" style="width:52px" placeholder="12:00"></span></div>
        <div class="o"><span>count as inactive after (days)</span><input type="number" id="weeklyDays" min="1" max="60"></div>
        <div class="dim note">Alerts post to your webhook and only run while Torn is open (a browser tab, or the Torn PDA page). To get a role ID: in Discord turn on Developer Mode, right-click the role, Copy ID.</div>
      </div>

      <div class="tab" id="tc">
        <div class="o"><span>total pay amount</span><input type="text" id="payTotal" placeholder="500m" autocomplete="off"></div>
        <div class="o"><span>split by</span><select id="payMode"><option value="hits">hits</option><option value="score">score</option></select></div>
        <div class="o"><span>min hits to qualify</span><input type="number" id="payMin" min="0"></div>
        <div class="o"><span>faction gets (%)</span><input type="number" id="payFac" min="0" max="100" step="any"></div>
        <div class="o"><span>players get (%)</span><input type="number" id="payPl" min="0" max="100" step="any"></div>
        <div class="dim note">Players are split by hits or score. Shares may add up to less than 100%, the rest is left over. Override on the fly: <b>warpay 750m score fac=20 pl=80</b></div>
      </div>

      <div class="tab" id="tf">
        <div id="bml"></div>
        <div class="o"><input type="text" id="bl" placeholder="name" maxlength="16" style="width:80px"><input type="text" id="bt" class="g" placeholder="command or link"><button class="lnk" id="badd">add</button></div>
        <div class="dim note">A bookmark runs a command (like <b>warpay 500m</b>) or opens a link (like https://www.torn.com/factions.php). Up to 12.</div>
        <label style="margin-top:10px">Shortcuts (your own short names for commands)</label>
        <div id="sml"></div>
        <div class="o"><input type="text" id="sn" placeholder="name" maxlength="16" style="width:80px"><input type="text" id="sc" class="g" placeholder="command, e.g. warpay 500m score"><button class="lnk" id="sadd">add</button></div>
        <div class="dim note">Type the short name like any command, and add extra words after it. Example: shortcut <b>pay</b> = <b>warpay 500m score fac=20</b>. Up to 15.</div>
      </div>

      <div class="tab" id="td">
        <div class="o"><span>opacity</span><input type="range" id="op" min="40" max="100"></div>
        <div class="o"><span>text size</span><select id="fs"><option value="11">small</option><option value="12">normal</option><option value="14">large</option></select></div>
        <div class="o"><span>accent colour</span><input type="color" id="ac"></div>
        <div class="o"><label class="c"><input type="checkbox" id="away"> close when clicking outside</label></div>
        <div class="o"><label class="c"><input type="checkbox" id="updOn"> tell me about new versions</label></div>
        <div class="dim note">This checks GitHub once a day for the newest version number. Your key is never sent.</div>
        <div class="row"><button class="lnk dim" id="reset">reset position</button></div>
      </div>

      <div class="tab" id="te">
        <div class="row"><button class="lnk" id="exp">export settings</button><label class="c" style="display:flex;gap:5px;align-items:center;margin:0;color:#888"><input type="checkbox" id="inckey"> include key &amp; webhook</label></div>
        <div class="row"><button class="lnk" id="imp">import settings</button><input type="file" id="file" accept=".json,application/json" hidden></div>
        <div class="dim note" id="pdanote" hidden>Export and import need a desktop browser and are hidden in Torn PDA.</div>
        <div class="row"><button class="lnk dim" id="wipe">delete all saved data</button></div>
      </div>

      <div class="acts"><button id="save">save</button><button id="test" class="dim">test webhook</button><span id="msg"></span></div>
    </div>
    <div id="out"></div>
    <div id="upd" hidden></div>
  </div>`;
  document.documentElement.appendChild(host);

  const $ = id => root.getElementById(id);
  const out = $('out'), panel = $('p'), fab = $('fab');
  const el = (cls, text, tag = 'div') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
  const say = (text, cls = '') => { const m = $('msg'); m.textContent = text; m.className = cls; };

  /* ----- moving things around ----- */
  function place(e, x, y) {
    const w = e.offsetWidth || 30, h = e.offsetHeight || 30;
    e.style.left = Math.min(Math.max(0, x), Math.max(0, innerWidth - w)) + 'px';
    e.style.top = Math.min(Math.max(0, y), Math.max(0, innerHeight - h)) + 'px';
    e.style.bottom = 'auto';
  }
  const positions = () => get(K_POS, null) || {};
  function savePos(key, e) {
    const r = e.getBoundingClientRect(), p = positions();
    p[key] = { x: r.left, y: r.top };
    set(K_POS, p);
  }
  function drag(e, handle, key, onTap) {
    let down = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener('pointerdown', ev => {
      if (ev.button) return;
      if (ev.target.closest('input,select,button:not(#fab)')) return;
      down = true; moved = false; sx = ev.clientX; sy = ev.clientY;
      const r = e.getBoundingClientRect(); ox = r.left; oy = r.top;
      handle.setPointerCapture(ev.pointerId);
    });
    handle.addEventListener('pointermove', ev => {
      if (!down) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      place(e, ox + dx, oy + dy);
    });
    handle.addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      if (moved) savePos(key, e); else if (onTap) onTap();
    });
    handle.addEventListener('pointercancel', () => { down = false; });
  }

  function openPanel() {
    panel.classList.add('open');
    const sp = positions().p;
    if (sp) { place(panel, sp.x, sp.y); }
    else { // sit just above the button
      const r = fab.getBoundingClientRect();
      panel.style.top = 'auto';
      panel.style.left = Math.min(Math.max(0, r.left), Math.max(0, innerWidth - panel.offsetWidth)) + 'px';
      panel.style.bottom = Math.max(0, innerHeight - r.top + 6) + 'px';
    }
    $('cmd').focus();
    if (!ranDef && opts().def && getKey()) { ranDef = true; run(opts().def); }
  }
  let ranDef = false;
  const toggle = () => (panel.classList.contains('open') ? panel.classList.remove('open') : openPanel());
  drag(fab, fab, 'fab', toggle);
  drag(panel, $('bar'), 'p', null);
  { const fp = positions().fab; if (fp) place(fab, fp.x, fp.y); }
  addEventListener('resize', () => {
    const r = fab.getBoundingClientRect(); place(fab, r.left, r.top);
    if (panel.classList.contains('open') && positions().p) { const q = panel.getBoundingClientRect(); place(panel, q.left, q.top); }
  });

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    try {
      const t = document.createElement('textarea');
      t.value = text; t.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
      root.appendChild(t); t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch (e) { return false; }
  }

  function saveFile(name, text, mime) {
    if (IS_PDA) return copyText(text).then(ok => (ok ? 'csv copied' : 'copy failed'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    root.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return Promise.resolve('saved ' + name);
  }
  function payBox(e0) {
    const box = el('', ''), sum = el('paysum', ''), list = el('', ''), acts = el('row', '');
    const cur = () => payAll()[e0.id] || e0;
    function paint() {
      const e = cur();
      list.textContent = '';
      e.rows.forEach(r => {
        const row = el('pr' + (r.paid ? ' done' : ''), '');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !!r.paid; cb.title = 'mark as paid'; cb.setAttribute('autocomplete', 'off');
        cb.onchange = () => { setPaid(e0.id, r.id, cb.checked); paint(); };
        const nm = el('lnk nm', r.name, 'button'); nm.title = 'open profile';
        nm.onclick = () => openBookmark('https://www.torn.com/profiles.php?XID=' + r.id);
        row.append(cb, nm, el('am', money(r.pay), 'span'));
        list.append(row);
      });
      const owed = e.rows.filter(r => !r.paid).reduce((a, r) => a + r.pay, 0);
      sum.textContent = `${paidCount(e)}/${e.rows.length} paid · ${money(owed)} still to pay`;
    }
    const mk = (label, fn) => { const b = el('lnk', label, 'button'); b.onclick = () => fn(b, label); acts.append(b); };
    mk('mark all paid', () => { cur().rows.forEach(r => setPaid(e0.id, r.id, true)); paint(); });
    mk('export csv', b => { saveFile(`war-${e0.id}-pay.csv`, csvFor(cur()), 'text/csv').then(m => { b.textContent = m; }); });
    mk('copy unpaid', b => { copyText(cur().rows.filter(r => !r.paid).map(r => `${r.name} [${r.id}]: ${money(r.pay)}`).join('\n')).then(ok => { b.textContent = ok ? 'copied' : 'copy failed'; }); });
    box.append(sum, list, acts);
    paint();
    return box;
  }

  /* ----- output ----- */
  function render(res, note) {
    out.textContent = '';
    out.append(el('t', res.title + MARK));
    if (res.description && !res.pay) out.append(el('d', res.description.replace(/\*\*/g, '').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2')));
    (res.fields || []).forEach(x => {
      const r = el('r' + (String(x.value).includes('\n') || String(x.value).length > 40 ? ' ml' : ''), '');
      r.append(el('k', x.name, 'span'), el('v', x.value, 'span'));
      out.append(r);
    });
    if (res.pay) out.append(payBox(res.pay));
    if (res.copy) {
      const b = el('cp', 'copy list', 'button');
      b.onclick = () => { copyText(res.copy).then(ok => { b.textContent = ok ? 'copied' : 'copy failed'; }); };
      out.append(b);
    }
    if (note) out.append(el('n ' + note.cls, note.text));
  }
  const showError = e => { out.textContent = ''; out.append(el('err', e.message || String(e))); };

  const history = [];
  let hi = 0;

  async function run(line) {
    let parts = line.trim().replace(/^[/!]/, '').split(/\s+/);
    let name = (parts.shift() || '').toLowerCase();
    if (!name) return;
    setCfg(false);
    if (!SEAL()) return showError(new Error(lockMsg()));
    history.push(line); hi = history.length;
    const al = opts().alias.find(a => a.n === name);
    if (al) { const re = al.c.replace(/^[/!]/, '').split(/\s+/); name = re.shift().toLowerCase(); parts = [...re, ...parts]; }
    const cmd = C[name];
    if (!cmd) return showError(new Error(`Unknown command "${name}". Type help.`));
    out.textContent = '';
    out.append(el('dim', 'loading…'));
    try {
      const res = await cmd.run(parts);
      let note = null;
      if (get(K_SEND) && get(K_HOOK)) {
        try { await sendDiscord(res); note = { text: 'sent to discord', cls: 'ok' }; }
        catch (e) { note = { text: 'discord: ' + e.message, cls: 'err' }; }
      }
      render(res, note);
    } catch (e) { showError(e); }
  }


  $('gear').onclick = () => { $('set').hidden = !$('set').hidden; };
  $('cmd').onkeydown = e => {
    if (e.key === 'Enter') { const v = e.target.value; e.target.value = ''; run(v); }
    else if (e.key === 'Escape') panel.classList.remove('open');
    else if (e.key === 'ArrowUp' && history.length) { hi = Math.max(0, hi - 1); e.target.value = history[hi]; e.preventDefault(); }
    else if (e.key === 'ArrowDown' && history.length) { hi = Math.min(history.length, hi + 1); e.target.value = history[hi] || ''; e.preventDefault(); }
    e.stopPropagation(); // keep Torn hotkeys out of the input
  };
  $('cmd').onkeyup = $('cmd').onkeypress = e => e.stopPropagation();

  /* ----- settings ----- */
  let hotkey = '';
  function applyOpts() {
    const o = opts();
    panel.style.opacity = o.op / 100;
    panel.style.fontSize = o.fs + 'px';
    host.style.setProperty('--ac', o.ac);
    hotkey = o.hot;
  }
  const fmtAmt = n => (!n ? '' : n % 1e9 === 0 ? n / 1e9 + 'b' : n % 1e6 === 0 ? n / 1e6 + 'm' : n % 1e3 === 0 ? n / 1e3 + 'k' : String(n));
  const refreshUsage = () => { $('usage').textContent = `API calls in the last minute: ${callsNow().length} / 100`; };
  function fillSettings() {
    const o = opts();
    $('key').value = ''; $('hook').value = '';
    $('key').placeholder = get(K_KEY) ? 'saved on this device · paste to replace' : pdaKey() ? 'using your Torn PDA key · paste to override' : 'paste your API key';
    $('hook').placeholder = get(K_HOOK) ? 'saved on this device · paste to replace' : 'https://discord.com/api/webhooks/...';
    $('send').checked = !!get(K_SEND, false);
    $('def').value = o.def; $('hot').value = o.hot;
    ['chain', 'war', 'oc', 'rep'].forEach(k => { $(k).checked = o[k]; });
    ['mins', 'warPre', 'warGap', 'payMin', 'payFac', 'payPl'].forEach(k => { $(k).value = o[k]; });
    $('repAt').value = o.repAt; $('stock').value = o.stock;
    $('payTotal').value = fmtAmt(o.payTotal); $('payMode').value = o.payMode;
    $('op').value = o.op; $('fs').value = String(o.fs); $('ac').value = o.ac; $('away').checked = o.away; $('updOn').checked = o.upd;
    $('qOn').checked = o.qOn; $('qFrom').value = o.qFrom; $('qTo').value = o.qTo; $('qUrgent').checked = o.qUrgent;
    $('role').value = o.role; $('rolePing').value = o.rolePing;
    $('watchOn').checked = o.watchOn; $('watch').value = o.watch;
    $('weekly').checked = o.weekly; $('weeklyDay').value = String(o.weeklyDay); $('weeklyAt').value = o.weeklyAt; $('weeklyDays').value = o.weeklyDays;
    renderBook(); renderAlias(); refreshUsage();
  }
  /* ----- bookmarks: quick buttons that run a command or open a link ----- */
  function openBookmark(t) {
    if (t.startsWith('/')) t = 'https://www.torn.com' + t;
    if (/^https?:\/\/\S+$/i.test(t)) { if (IS_PDA && /^https:\/\/(www\.)?torn\.com\//i.test(t)) location.assign(t); else window.open(t, '_blank', 'noopener'); }
    else run(t);
  }
  function saveBook(list) { set(K_OPTS, cleanOpts({ ...opts(), book: list })); renderBook(); }
  function renderBook() {
    const list = opts().book;
    $('bm').textContent = ''; $('bml').textContent = '';
    list.forEach((b, i) => {
      const chip = el('', b.l, 'button'); chip.title = b.t; chip.onclick = () => openBookmark(b.t);
      $('bm').append(chip);
      const row = el('o', ''), x = el('lnk dim', 'remove', 'button');
      x.onclick = () => saveBook(list.filter((_, j) => j !== i));
      row.append(el('', `${b.l} · ${b.t}`, 'span'), x);
      $('bml').append(row);
    });
  }
  /* ----- shortcuts: your own names for commands ----- */
  function saveAlias(list) { set(K_OPTS, cleanOpts({ ...opts(), alias: list })); renderAlias(); }
  function renderAlias() {
    const list = opts().alias;
    $('sml').textContent = '';
    list.forEach((a, i) => {
      const row = el('o', ''), x = el('lnk dim', 'remove', 'button');
      x.onclick = () => saveAlias(list.filter((_, j) => j !== i));
      row.append(el('', `${a.n} → ${a.c}`, 'span'), x);
      $('sml').append(row);
    });
  }
  $('sadd').onclick = () => {
    const n = $('sn').value.trim().toLowerCase(), c = $('sc').value.trim(), cur = opts().alias;
    if (!/^[a-z][a-z0-9_-]{0,15}$/.test(n)) return say('name: letters and numbers, up to 16', 'err');
    if (C[n]) return say(`"${n}" is already a built-in command`, 'err');
    if (cur.some(a => a.n === n)) return say('you already have that shortcut', 'err');
    if (!c) return say('add the command it should run', 'err');
    if (!C[c.replace(/^[/!]/, '').split(/\s+/)[0].toLowerCase()]) return say("that command doesn't exist, try help", 'err');
    if (cur.length >= 15) return say('15 shortcuts max', 'err');
    saveAlias([...cur, { n, c }]);
    $('sn').value = ''; $('sc').value = '';
    say('added', 'ok');
  };

  $('badd').onclick = () => {
    const l = $('bl').value.trim(), t = $('bt').value.trim(), cur = opts().book;
    if (!l || !t) return say('add a name and a command or link', 'err');
    if (cur.length >= 12) return say('12 bookmarks max', 'err');
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:\/\//i.test(t)) return say('links must start with https://', 'err');
    saveBook([...cur, { l, t }]);
    $('bl').value = ''; $('bt').value = '';
    say('added', 'ok');
  };

  fillSettings(); applyOpts();
  if (!getKey()) setCfg(true);

  $('payFac').oninput = () => { const v = parseFloat($('payFac').value); if (!Number.isNaN(v)) $('payPl').value = Math.max(0, Math.round((100 - v) * 100) / 100); };
  $('away').onchange = () => set(K_OPTS, cleanOpts({ ...opts(), away: $('away').checked }));
  // click anywhere outside the panel to close it
  addEventListener('pointerdown', e => {
    if (!panel.classList.contains('open') || !opts().away) return;
    if (e.composedPath().includes(host)) return;
    panel.classList.remove('open');
  }, true);

  // keep password managers and autofill away from every field
  try { if (!CSS.supports('-webkit-text-security', 'disc')) [$('key'), $('hook')].forEach(i => { i.type = 'password'; }); } catch (e) { /* ignore */ }
  root.querySelectorAll('input,select').forEach(i => {
    i.setAttribute('autocomplete', 'off');
    i.setAttribute('name', 'fc_' + (i.id || 'x'));
    ['data-lpignore', 'data-1p-ignore', 'data-bwignore'].forEach(a => i.setAttribute(a, 'true'));
    i.setAttribute('data-form-type', 'other');
  });

  if (IS_PDA) { ['exp', 'imp'].forEach(id => { $(id).closest('.row').hidden = true; }); $('pdanote').hidden = false; }

  const tabs = [...root.querySelectorAll('#tabs button')];
  tabs.forEach(b => {
    b.onclick = () => {
      tabs.forEach(x => x.classList.toggle('on', x === b));
      root.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 't' + b.dataset.t));
      refreshUsage();
    };
  });
  function setCfg(on) { $('set').hidden = !on; panel.classList.toggle('cfg', on); if (on) refreshUsage(); }
  $('gear').onclick = () => setCfg($('set').hidden);

  const autosaveLook = () => {
    set(K_OPTS, cleanOpts({ ...opts(), op: +$('op').value, fs: +$('fs').value, ac: $('ac').value }));
    applyOpts();
  };
  $('op').oninput = autosaveLook;
  $('fs').onchange = autosaveLook;
  $('ac').oninput = autosaveLook;

  $('save').onclick = () => {
    const hook = $('hook').value.trim() || get(K_HOOK), keyIn = $('key').value.trim();
    if (hook && !HOOK_RE.test(hook)) return say('not a valid webhook url', 'err');
    if (keyIn && !/^[A-Za-z0-9]{12,40}$/.test(keyIn)) return say("that doesn't look like an API key", 'err');
    const amt = $('payTotal').value.trim() ? parseAmt($('payTotal').value) : 0;
    if (Number.isNaN(amt)) return say('pay amount: try 500m or 750000000', 'err');
    const hot = $('hot').value.trim().toLowerCase();
    if (hot && !/(ctrl|alt|meta|cmd)/.test(hot)) return say('hotkey needs ctrl, alt or meta', 'err');
    const fac = parseFloat($('payFac').value) || 0, pl = $('payPl').value === '' ? 100 - fac : parseFloat($('payPl').value) || 0;
    if (fac < 0 || pl < 0 || fac + pl > 100.0001) return say('faction % + players % must not exceed 100', 'err');
    if ($('rep').checked && !TIME_RE.test($('repAt').value.trim())) return say('report time should look like 20:00', 'err');
    if ($('qOn').checked && !(TIME_RE.test($('qFrom').value.trim()) && TIME_RE.test($('qTo').value.trim()))) return say('quiet hours should look like 23:00 to 07:00', 'err');
    const role = $('role').value.trim();
    if (role && !/^\d{15,22}$/.test(role)) return say('a role ID is a long number, see the note', 'err');
    if ($('rolePing').value !== 'off' && !role) return say('add a role ID to ping', 'err');
    if ($('weekly').checked && !TIME_RE.test($('weeklyAt').value.trim())) return say('weekly report time should look like 12:00', 'err');
    const o = cleanOpts({
      ...opts(), hot, def: $('def').value.trim(),
      chain: $('chain').checked, mins: $('mins').value, war: $('war').checked, warPre: $('warPre').value, warGap: $('warGap').value,
      oc: $('oc').checked, stock: $('stock').value.trim(), rep: $('rep').checked, repAt: $('repAt').value.trim(),
      payTotal: amt, payMode: $('payMode').value, payMin: $('payMin').value, payFac: fac, payPl: pl, away: $('away').checked,
      op: +$('op').value, fs: +$('fs').value, ac: $('ac').value,
      qOn: $('qOn').checked, qFrom: $('qFrom').value.trim(), qTo: $('qTo').value.trim(), qUrgent: $('qUrgent').checked,
      role, rolePing: $('rolePing').value,
      watchOn: $('watchOn').checked, watch: $('watch').value.trim(),
      weekly: $('weekly').checked, weeklyDay: $('weeklyDay').value, weeklyAt: $('weeklyAt').value.trim(), weeklyDays: $('weeklyDays').value,
      upd: $('updOn').checked,
    });
    if ((o.chain || o.war || o.oc || o.rep || o.stock || o.watchOn || o.weekly) && !hook) return say('alerts need a webhook', 'err');
    if (keyIn) set(K_KEY, keyIn);
    set(K_HOOK, hook);
    set(K_SEND, $('send').checked && !!hook);
    set(K_OPTS, o);
    _me = null; cache.clear();
    fillSettings(); applyOpts(); checkUpdate();
    say('saved on this device', 'ok');
  };
  $('test').onclick = async () => {
    const hook = $('hook').value.trim() || get(K_HOOK);
    if (!HOOK_RE.test(hook)) return say('enter a valid webhook first', 'err');
    set(K_HOOK, hook);
    try { await sendDiscord({ title: 'Webhook test', description: 'Connected.' }); say('sent', 'ok'); }
    catch (e) { say(e.message, 'err'); }
  };
  $('reset').onclick = () => {
    set(K_POS, {});
    fab.style.left = '10px'; fab.style.top = 'auto'; fab.style.bottom = '10px';
    panel.style.left = '10px'; panel.style.top = 'auto';
    const r = fab.getBoundingClientRect();
    panel.style.bottom = Math.max(0, innerHeight - r.top + 6) + 'px';
    say('position reset', 'ok');
  };
  $('wipe').onclick = () => {
    [K_KEY, K_HOOK, K_SEND, K_OPTS, K_POS, K_LAST, K_SENT, K_CALLS, K_PAY, K_WSTATE, K_UPD].forEach(k => GM_deleteValue(k));
    _me = null; fillSettings(); applyOpts(); cache.clear();
    say('deleted', 'ok');
  };

  /* ----- export / import (the API key and webhook are left out unless you tick the box) ----- */
  $('exp').onclick = () => {
    const o = opts();
    const data = { app: 'faction-command-center', v: 1, opts: o, send: !!get(K_SEND, false) };
    if ($('inckey').checked) { data.key = get(K_KEY); data.hook = get(K_HOOK); }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'faction-command-center-settings.json';
    root.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    say($('inckey').checked ? 'exported (contains your key!)' : 'exported', 'ok');
  };
  $('imp').onclick = () => $('file').click();
  $('file').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || d.app !== 'faction-command-center' || typeof d.opts !== 'object') throw new Error('not a settings file');
      set(K_OPTS, cleanOpts({ ...DEF, ...d.opts }));
      if (typeof d.key === 'string') set(K_KEY, d.key.trim());
      if (typeof d.hook === 'string' && HOOK_RE.test(d.hook)) set(K_HOOK, d.hook);
      set(K_SEND, !!d.send && !!get(K_HOOK));
      _me = null; cache.clear(); fillSettings(); applyOpts();
      say('imported', 'ok');
    } catch (err) { say('import failed: ' + err.message, 'err'); }
  };

  /* ----- hotkey ----- */
  addEventListener('keydown', e => {
    if (!hotkey) return;
    const p = hotkey.split('+').map(x => x.trim());
    const key = p.find(x => !['ctrl', 'shift', 'alt', 'meta', 'cmd'].includes(x));
    if (!key || e.key.toLowerCase() !== key) return;
    if (e.ctrlKey !== p.includes('ctrl') || e.shiftKey !== p.includes('shift') || e.altKey !== p.includes('alt') || e.metaKey !== (p.includes('meta') || p.includes('cmd'))) return;
    e.preventDefault(); e.stopPropagation();
    toggle();
  }, true);

  /* ----- alerts (post to your webhook; only run while a Torn tab is open) ----- */
  let alerted = false;
  async function chainTick(o) {
    cache.delete('chain');
    const c = (await api('chain')).chain || {};
    const left = c.timeout || 0, lim = o.mins * 60;
    if (c.current > 0 && left > 0 && left <= lim) {
      if (!alerted) {
        alerted = true;
        // another open tab may already have sent this one
        if (Date.now() - get(K_LAST, 0) > 90000) {
          set(K_LAST, Date.now());
          await sendDiscord({ title: `Chain alert: ${num(c.current)}`, color: 0xed4245, description: `${dur(left)} left on the chain timer.` }, pingFor(o, 'chain'));
        }
      }
    } else alerted = false;
  }

  async function warTick(o) {
    cache.delete('rankedwars');
    const w = (await warList())[0];
    if (!w) return;
    const me = await myFactionId();
    const fs = ents(w.factions);
    const mine = fs.find(x => String(x.id) === me), foe = fs.find(x => String(x.id) !== me);
    if (!mine || !foe) return;
    const ping = pingFor(o, 'war');
    const now = Date.now() / 1000;
    if (w.start > now) {
      if (w.start - now <= o.warPre * 60 && claim(`war_pre_${w.id}`, 864e5))
        await sendDiscord({ title: 'Ranked war starting soon', color: 0xed4245, description: `${mine.name} vs ${foe.name} starts in ${dur(w.start - now)}.`, fields: [f('Target', num(w.target), true)] }, ping);
      return;
    }
    if (w.end && w.end <= now) {
      if (now - w.end < 6 * 3600 && claim(`war_end_${w.id}`, 864e5)) {
        const won = String(w.winner) === me;
        await sendDiscord({ title: won ? 'War won' : 'War over', color: won ? 0x57f287 : 0x95a5a6, description: `Final: ${mine.name} ${num(mine.score)} vs ${num(foe.score)} ${foe.name}.\nRun warpay when you're ready to pay out.` }, ping);
      }
      return;
    }
    const lead = (mine.score || 0) - (foe.score || 0), sign = Math.sign(lead);
    const prev = get('fc_warsign', null);
    set('fc_warsign', { id: String(w.id), sign });
    if (prev && prev.id === String(w.id) && prev.sign && sign && prev.sign !== sign && claim(`war_flip_${w.id}_${sign}`, 120000))
      await sendDiscord({ title: sign > 0 ? 'You took the lead' : 'Lead lost', color: sign > 0 ? 0x57f287 : 0xed4245, description: `${mine.name} ${num(mine.score)} vs ${num(foe.score)} ${foe.name}` }, ping);
    if (o.warGap > 0 && Math.abs(lead) <= o.warGap && claim(`war_close_${w.id}`, 15 * 60e3))
      await sendDiscord({ title: 'Score is close', color: 0xf1c40f, description: `${lead >= 0 ? 'You lead' : 'You trail'} by ${num(Math.abs(lead))}.\n${mine.name} ${num(mine.score)} vs ${num(foe.score)} ${foe.name}` }, ping);
  }

  async function ocTick() {
    cache.delete('crimes');
    const now = Date.now() / 1000;
    const cs = vals((await api('crimes')).crimes).map(crimeInfo).filter(c => !c.done);
    const ready = cs.filter(c => c.ready && c.ready <= now && (c.total === null || c.filled === c.total)).filter(c => claim(`oc_ready_${c.id}`, 12 * 3600e3));
    if (ready.length) await sendDiscord({ title: 'Organized crime ready', color: 0x57f287, description: ready.map(c => c.name).join('\n') });
    const open = cs.filter(c => c.total !== null && c.filled < c.total);
    if (open.length && claim('oc_empty', 6 * 3600e3))
      await sendDiscord({ title: 'Organized crime slots open', color: 0xf1c40f, description: open.map(c => `${c.name} · ${c.total - c.filled} empty`).join('\n') });
  }

  async function stockTick(o) {
    const w = parseWatch(o.stock);
    if (!w.length) return;
    cache.delete(ARM.join(','));
    const items = await armouryItems();
    const low = [];
    for (const x of w) {
      const hit = items.filter(i => i.name.toLowerCase().includes(x.name));
      const have = hit.reduce((a, i) => a + i.avail, 0);
      if (have < x.min && claim('stock_' + x.name, 6 * 3600e3)) low.push(f(x.name, hit.length ? `${num(have)} left (min ${num(x.min)})` : 'not found in the armoury', true));
    }
    if (low.length) await sendDiscord({ title: 'Armoury running low', color: 0xed4245, fields: low });
  }

  async function reportTick(o) {
    const [h, m] = o.repAt.split(':').map(Number);
    const d = new Date();
    const late = Date.now() - new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
    if (late < 0 || late > 90 * 60e3) return; // only within 90 minutes of the set time
    const key = `rep_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!claim(key, 20 * 3600e3)) return;
    try { await sendDiscord(await C.report.run()); } catch (e) { unclaim(key); throw e; }
  }

  async function watchTick(o) {
    const who = parseWho(o.watch);
    if (!who.length) return;
    cache.delete('basic');
    const ms = members(await api('basic'));
    const prev = get(K_WSTATE, null) || {}, next = {};
    const errs = [];
    for (const w of who) {
      try {
        let id = w.id, m = null;
        if (id) m = ms.find(x => String(x.id) === id) || null;
        else {
          m = ms.find(x => (x.name || '').toLowerCase() === w.name.toLowerCase());
          if (!m) { errs.push(`can't find "${w.name}" in your faction, use their ID`); continue; }
          id = String(m.id);
        }
        const st = m
          ? { name: m.name || id, on: m.last_action?.status === 'Online', hosp: m.status?.state === 'Hospital' }
          : await userState(id);
        next[id] = { on: !!st.on, hosp: !!st.hosp };
        const p = prev[id];
        if (!p) continue; // first look is only a baseline
        if (!p.on && st.on && claim(`w_on_${id}`, 10 * 60e3))
          await sendDiscord({ title: `${st.name} is online`, color: 0x57f287, description: `${st.name} [${id}] just came online.` });
        if (p.hosp && !st.hosp && claim(`w_out_${id}`, 10 * 60e3))
          await sendDiscord({ title: `${st.name} left hospital`, color: 0xf1c40f, description: `${st.name} [${id}] is out of hospital.` });
      } catch (e) { errs.push(e.message); }
    }
    set(K_WSTATE, next);
    if (errs.length) throw new Error('watch: ' + errs[0]);
  }

  async function weeklyTick(o) {
    const d = new Date();
    if (d.getDay() !== o.weeklyDay) return;
    const late = Date.now() - new Date(d.getFullYear(), d.getMonth(), d.getDate(), ...o.weeklyAt.split(':').map(Number)).getTime();
    if (late < 0 || late > 90 * 60e3) return;
    const key = `wk_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!claim(key, 6 * 864e5)) return;
    try { await sendDiscord(await C.inactive.run([String(o.weeklyDays)])); } catch (e) { unclaim(key); throw e; }
  }

  let tickN = 0;
  async function alertsTick() {
    const o = opts();
    if (!getKey() || !get(K_HOOK) || !SEAL()) return;
    if (!claim('tick', 50000)) return; // another tab is already polling
    const n = tickN++, jobs = [];
    const quiet = isQuiet(o), urgent = !quiet || o.qUrgent; // quiet hours silence everything except chain and war, if you allow those
    if (o.chain && urgent) jobs.push(chainTick(o));
    if (o.war && urgent) jobs.push(warTick(o));
    if (!quiet) {
      if (o.oc && n % 5 === 0) jobs.push(ocTick());
      if (o.stock && n % 10 === 0) jobs.push(stockTick(o));
      if (o.rep) jobs.push(reportTick(o));
      if (o.watchOn && o.watch) jobs.push(watchTick(o));
      if (o.weekly) jobs.push(weeklyTick(o));
    }
    const res = await Promise.allSettled(jobs);
    const bad = res.find(r => r.status === 'rejected');
    if (bad) alertErr = `${new Date().toLocaleTimeString()} · ${bad.reason && bad.reason.message}`;
  }

  /* ----- credit: rebuilt if removed, hidden or edited ----- */
  const BY_TEXT = 'made by ' + CREDIT, SUP_TEXT = 'SUPPORT ME💗';
  const SHOW = 'display:inline-block!important;visibility:visible!important;opacity:1!important;';
  const FT_CSS = 'display:flex!important;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px 7px;border-top:1px solid #222;';
  const BY_CSS = SHOW + 'color:#777;font-size:10px;text-decoration:none;';
  const SUP_CSS = SHOW + 'padding:2px 10px;text-align:center;text-decoration:none;white-space:nowrap;color:#fff;font-size:10px;font-weight:700;border-radius:999px;background:linear-gradient(90deg,#ff3d8b,#ff7ab0);';
  const seen = e => {
    if (!e) return false;
    const c = getComputedStyle(e), r = e.getBoundingClientRect();
    return c.display !== 'none' && c.visibility === 'visible' && +c.opacity > 0.5 && parseFloat(c.fontSize) >= 9 && r.height > 6 && r.width > 20;
  };
  const mkLink = (id, text, css) => {
    const a = document.createElement('a');
    a.id = id; a.href = PROFILE; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; a.style.cssText = css;
    a.addEventListener('click', e => { if (IS_PDA) { e.preventDefault(); location.assign(PROFILE); } });
    return a;
  };
  let strikes = 0;
  function ensureCredit() {
    if (locked) return;
    const open = panel.classList.contains('open');
    let fixed = false, ft = $('ft'), sup = $('sup'), by = $('by');
    if (!ft || ft.parentNode !== panel) {
      if (ft) ft.remove();
      ft = document.createElement('div'); ft.id = 'ft'; ft.style.cssText = FT_CSS; panel.appendChild(ft);
    }
    if (!by || by.parentNode !== ft || by.getAttribute('href') !== PROFILE || by.textContent !== BY_TEXT || (open && !seen(by))) {
      if (by) by.remove();
      ft.insertBefore(mkLink('by', BY_TEXT, BY_CSS), ft.firstChild); fixed = true;
    }
    if (!sup || sup.parentNode !== ft || sup.getAttribute('href') !== PROFILE || sup.textContent !== SUP_TEXT || (open && !seen(sup))) {
      if (sup) sup.remove();
      ft.appendChild(mkLink('sup', SUP_TEXT, SUP_CSS)); fixed = true;
    }
    if (fixed && open) { if (++strikes >= 3) locked = true; } else if (!fixed) strikes = 0;
  }
  ensureCredit();
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; ensureCredit(); }); })
    .observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  setInterval(ensureCredit, 3000);
  try { console.log('%cFaction Command Center%c by ' + CREDIT, 'color:#ff7ab0;font-weight:700', 'color:#999'); } catch (e) { /* ignore */ }

  /* ----- update notice: once a day, asks GitHub for the newest version number (no key is sent) ----- */
  function showUpdate(v) {
    const box = $('upd');
    if (!v || !isNewer(v, VERSION)) { box.hidden = true; return; }
    box.textContent = '';
    const b = el('lnk', 'get it', 'button');
    b.onclick = () => { if (IS_PDA) location.assign(REPO_URL); else window.open(REPO_URL, '_blank', 'noopener'); };
    box.append(el('', `new version ${v} is out`, 'span'), b);
    box.hidden = false;
  }
  async function checkUpdate() {
    if (!opts().upd) return showUpdate('');
    const last = get(K_UPD, null) || {};
    if (Date.now() - (last.t || 0) < 12 * 3600e3) return showUpdate(last.v);
    try {
      const r = await http({ method: 'GET', url: RAW_URL });
      const m = /@version\s+(\d+(?:\.\d+){0,2})/.exec(String(r.responseText || ''));
      set(K_UPD, { t: Date.now(), v: m ? m[1] : last.v || '' });
      showUpdate(m ? m[1] : last.v);
    } catch (e) { set(K_UPD, { t: Date.now(), v: last.v || '' }); }
  }
  setTimeout(checkUpdate, 8000);

  setInterval(alertsTick, 60000);
  setTimeout(alertsTick, 5000);
})();
