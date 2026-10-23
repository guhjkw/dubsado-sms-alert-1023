# Dubsado new lead → SMS alert (live preview)

A working preview of a Zapier flow for a portrait studio: Dubsado trigger → Filter (new website inquiries only) → Storage (projects already alerted) → Formatter → SMS. It shows exactly which events send a text and which are halted and why, the text itself, its SMS segment count and cost. The events are invented; nothing is connected to Dubsado, Zapier or an SMS provider.

## Try it
Open `index.html`. Send a test inquiry from the form on the left and watch the Zapier task history and the phone on the right. Then edit the project, replay a Zapier retry or add a lead by hand: none of those send a text. Turn on the full last name, untick email or turn off GSM-safe and the segment count and cost update.

## Files
```
index.html                  the page
src/smsAlertEngine.js       the engine (UMD: browser + node)
data/sample.json            9 invented Dubsado events
tests/verify.js             23 node tests
tests/browser-check.py      16 Playwright checks
```

## Run the tests
```
node tests/verify.js            # 23 passed, 0 failed
python3 tests/browser-check.py  # 16 passed, 0 failed
```
The page and the tests load the same `src/smsAlertEngine.js`.

## How the logic works
| Step | Rule |
|---|---|
| Retry guard | the same event id seen twice (a Zapier retry) is halted |
| Filter | only `project.created`, status Lead, from an allowed source (the website contact form) |
| Storage | a project already alerted never alerts again, even if re-triggered or edited |
| Message | name with last initial by default, session type, phone in E.164 shown as 555-555-5555, optional email, Dubsado project link |
| GSM-safe | curly quotes, dashes and ellipses swapped for plain characters so the text stays GSM-7 |
| Segments | GSM-7: 160 for one part, 153 per part after; Unicode: 70 / 67; cost = segments x price per segment |

## Extending it
Add an allowed source in `DEFAULTS.allowedSources`, or change the message lines in `message()`, with a test.

## What the delivered version adds
The real Zap on the studio's Zapier account with the Dubsado trigger, Filter, Storage by Zapier and SMS by Zapier or Twilio, tested with live inquiries, plus the handover doc (trigger, filters, field mapping, account ownership, recurring costs, troubleshooting, changing the destination number).
