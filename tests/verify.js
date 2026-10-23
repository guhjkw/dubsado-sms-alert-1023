// tests/verify.js  —  node tests/verify.js
// Tests the same src/smsAlertEngine.js that index.html loads.
'use strict';
var E = require('../src/smsAlertEngine.js');
var D = require('../data/sample.json');
var passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('PASS: ' + name); } else { failed++; console.log('FAIL: ' + name); } }
function run(s, seen) { return E.run(JSON.parse(JSON.stringify(D.events)), s || {}, seen); }
function halt(r, id) { return r.halted.filter(function (h) { return h.event.event_id === id; }).map(function (h) { return h.reason; }); }

console.log('1. Which events become a text');
var r = run();
check('9 Dubsado events become 3 alerts and 6 halted', r.metrics.events === 9 && r.metrics.alerts === 3 && r.metrics.halted === 6);
check('alerts for the three new website inquiries (P-1001, P-1003, P-1006)', r.sent.map(function (x) { return x.event.project_id; }).join(',') === 'P-1001,P-1003,P-1006');
check('a later edit to the project does not text again', /Record change \(project.updated\)/.test(halt(r, 'evt-102')[0]));
check('a Zapier retry of the same event does not text again', halt(r, 'evt-101').some(function (x) { return /retry/.test(x); }));
check('a lead added by hand in Dubsado is skipped', /Source "Manual"/.test(halt(r, 'evt-103')[0]));
check('a booked job (not a lead) is skipped', /created as Job/.test(halt(r, 'evt-105')[0]));
check('a different form (mini session) is skipped unless you allow it', /Mini session form/.test(halt(r, 'evt-106')[0]));
check('the same project triggering twice texts once', /Already alerted for project P-1003/.test(halt(r, 'evt-108')[0]));
check('allowing the mini-session form adds that alert', run({ allowedSources: ['Website contact form', 'Mini session form'] }).metrics.alerts === 4);
check('projects already stored from an earlier run are not texted again', run({}, { 'P-1001': '2026-10-22T09:00' }).metrics.alerts === 2);

console.log('\n2. The text itself');
var t1 = r.sent[0].text;
check('name, session type, phone, email and record link, one per line', t1 === 'New inquiry: Maya T.\nFamily portrait session\n917-555-0142\nmaya.t@example.com\nhttps://yourstudio.dubsado.com/project/P-1001');
check('last initial by default; full name only if you switch it on', /Maya Thompson/.test(run({ fullLastName: true }).sent[0].text));
check('email left out when you switch it off', !/@/.test(run({ includeEmail: false }).sent[0].text));
check('phone in any format becomes one standard format', E.phoneE164('646.555.0199') === '+16465550199' && E.phoneE164('(917) 555-0142') === '+19175550142');
check('a 7-digit phone is flagged, not sent as a broken number', /No valid phone/.test(r.sent[2].text));
check('a first name only still works ("Priya")', /New inquiry: Priya\n/.test(r.sent[2].text));

console.log('\n3. Segments and cost');
var sio = r.sent[1];
check('curly dash swapped so the text stays plain GSM (1 segment)', sio.segments.encoding === 'GSM-7' && /headshots - team/.test(sio.text) && sio.segments.count === 1);
check('with full names on, the curly apostrophe in O\u2019Neill becomes a plain one', /O'Neill/.test(run({ fullLastName: true }).sent[1].text));
var raw = run({ gsmSafe: false }).sent[1];
check('without the swap the same text goes Unicode and costs more segments', raw.segments.encoding.indexOf('UCS-2') === 0 && raw.segments.count > sio.segments.count);
check('a 160-character GSM text is 1 segment, 161 is 2', E.segments(new Array(161).join('a')).count === 1 && E.segments(new Array(162).join('a')).count === 2);
check('a 70-character Unicode text is 1 segment, 71 is 2', E.segments('’' + new Array(70).join('a')).count === 1 && E.segments('’' + new Array(71).join('a')).count === 2);
check('cost = segments x your price per segment', r.metrics.cost === Math.round(r.metrics.segments * 0.0083 * 10000) / 10000);
check('empty event list does not crash', E.run([], {}).metrics.alerts === 0);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
