// src/smsAlertEngine.js
// The real logic behind the Dubsado -> Zapier -> SMS alert preview.
// index.html and tests/verify.js load THIS file. In the delivered setup the same
// rules are Zapier steps: Dubsado trigger -> Filter -> Storage (seen projects)
// -> Formatter -> SMS (SMS by Zapier or Twilio).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmsAlertEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    allowedSources: ['Website contact form'],   // only these create an alert
    includeEmail: true,
    fullLastName: false,                        // false = "Jane D." (less client data in a text)
    gsmSafe: true,                              // swap curly quotes/dashes so the text stays plain GSM
    linkBase: 'https://yourstudio.dubsado.com/project/',
    pricePerSegment: 0.0083                     // your SMS provider's price per segment (editable, invented default)
  };
  // GSM-7 basic set plus the extension table (counted as 2).
  var GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  var GSM_EXT = '^{}\\[~]|€';
  var SWAP = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', ' ': ' ' };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function settingsOf(s) { return Object.assign(clone(DEFAULTS), s || {}); }

  function gsmClean(t) { return String(t).replace(/[‘’“”–—… ]/g, function (c) { return SWAP[c]; }); }
  function isGsm(t) { return Array.prototype.every.call(String(t), function (c) { return GSM.indexOf(c) >= 0 || GSM_EXT.indexOf(c) >= 0; }); }
  // SMS segments: GSM-7 160 single / 153 per part; anything else is UCS-2 70 / 67.
  function segments(t) {
    var s = String(t);
    if (isGsm(s)) { var units = Array.prototype.reduce.call(s, function (n, c) { return n + (GSM_EXT.indexOf(c) >= 0 ? 2 : 1); }, 0); return { encoding: 'GSM-7', units: units, count: units <= 160 ? 1 : Math.ceil(units / 153) }; }
    var len = Array.from(s).reduce(function (n, c) { return n + (c.codePointAt(0) > 0xFFFF ? 2 : 1); }, 0);
    return { encoding: 'UCS-2 (Unicode)', units: len, count: len <= 70 ? 1 : Math.ceil(len / 67) };
  }

  function phoneE164(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length === 10) d = '1' + d;
    return d.length === 11 && d.charAt(0) === '1' ? '+' + d : '';
  }
  function prettyPhone(e) { return e ? e.slice(2, 5) + '-' + e.slice(5, 8) + '-' + e.slice(8) : ''; }
  function displayName(n, full) {
    var parts = String(n || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'New client';
    if (full || parts.length === 1) return parts.join(' ');
    return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
  }

  function message(ev, s) {
    var ph = phoneE164(ev.phone);
    var lines = ['New inquiry: ' + displayName(ev.client_name, s.fullLastName), (ev.session_type || 'Session type not given'),
      ph ? prettyPhone(ph) : 'No valid phone'];
    if (s.includeEmail && ev.email) lines.push(String(ev.email).trim());
    lines.push(s.linkBase + ev.project_id);
    var text = lines.join('\n');
    if (s.gsmSafe) text = gsmClean(text);
    return text;
  }

  // events: Dubsado trigger payloads in arrival order.
  // seen: project ids already alerted (Zapier Storage), so a re-run never repeats.
  function run(events, settings, seenIn) {
    var s = settingsOf(settings), seen = Object.assign({}, seenIn || {}), seenEvents = {}, sent = [], halted = [];
    (events || []).forEach(function (ev) {
      var why = null;
      if (seenEvents[ev.event_id]) why = 'Zapier retry of the same event (' + ev.event_id + ')';
      else if (ev.type !== 'project.created') why = 'Record change (' + ev.type + '), not a new inquiry';
      else if (ev.status !== 'Lead') why = 'Project created as ' + ev.status + ', not a lead';
      else if (s.allowedSources.indexOf(ev.source) < 0) why = 'Source "' + ev.source + '" is not the website form';
      else if (seen[ev.project_id]) why = 'Already alerted for project ' + ev.project_id;
      seenEvents[ev.event_id] = true;
      if (why) { halted.push({ event: ev, reason: why }); return; }
      seen[ev.project_id] = ev.created_at;
      var text = message(ev, s), seg = segments(text);
      sent.push({ event: ev, text: text, segments: seg, cost: Math.round(seg.count * s.pricePerSegment * 10000) / 10000 });
    });
    var segs = sent.reduce(function (n, x) { return n + x.segments.count; }, 0);
    return { sent: sent, halted: halted, seen: seen, metrics: { events: (events || []).length, alerts: sent.length, halted: halted.length, segments: segs, cost: Math.round(segs * s.pricePerSegment * 10000) / 10000 } };
  }

  return { DEFAULTS: DEFAULTS, run: run, segments: segments, gsmClean: gsmClean, phoneE164: phoneE164, displayName: displayName, message: message };
});
