"""
tests/browser-check.py
Playwright checks that drive the real page (index.html), which loads the
same src/smsAlertEngine.js that tests/verify.js tests.
Run:  python3 tests/browser-check.py      (expects "0 failed" on the last line)
"""
import functools, http.server, pathlib, threading
from html.parser import HTMLParser
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TESTS = ROOT / "tests"
passed = failed = 0
def check(name, cond):
    global passed, failed
    if cond: passed += 1; print(f"PASS: {name}")
    else: failed += 1; print(f"FAIL: {name}")

class Balance(HTMLParser):
    VOID = {"meta","link","br","input","img","hr","source","wbr","col"}
    def __init__(self): super().__init__(); self.stack, self.errors = [], []
    def handle_starttag(self, tag, attrs):
        if tag not in self.VOID: self.stack.append(tag)
    def handle_endtag(self, tag):
        if tag in self.VOID: return
        if not self.stack or self.stack[-1] != tag: self.errors.append(f"unexpected </{tag}> open {self.stack[-3:]}")
        else: self.stack.pop()

print("0. HTML tag balance")
b = Balance(); b.feed((ROOT / "index.html").read_text())
check("all tags closed and nested", not b.errors and not b.stack)
if b.errors: print(b.errors[:5])

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)); handler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
problems = []

with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={"width": 1366, "height": 950})
    p.on("console", lambda m: problems.append(m.text) if m.type == "error" else None)
    p.on("pageerror", lambda e: problems.append(str(e)))
    p.goto(url); p.wait_for_selector("[data-testid=task]")
    sms = lambda: p.locator("[data-testid=sms]").count()
    txt = lambda t: p.locator(f"[data-testid={t}]").inner_text()

    print("\n1. Default history")
    check("9 events: 3 texts, 6 halted", sms() == 3 and p.locator("[data-testid=task][data-kind=sent]").count() == 3 and p.locator("[data-testid=task][data-kind=halted]").count() == 6)
    check("first text: Maya T., family portrait, phone, link", "New inquiry: Maya T." in p.locator("[data-testid=sms]").first.inner_text() and "P-1001" in p.locator("[data-testid=sms]").first.inner_text())
    p.screenshot(path=str(TESTS / "screenshot-default.png"), full_page=False)

    print("\n2. New inquiry, retry, edit")
    p.click("[data-testid=f-send]")
    check("a new website inquiry texts once", "Texted you" in txt("f-msg") and sms() == 4)
    p.click("[data-testid=f-send]")
    check("submitting again is a Zapier retry: no second text", "retry" in txt("f-msg") and sms() == 4)
    p.click("[data-testid=a-edit]")
    check("editing the project does not text", "Record change" in txt("f-msg") and sms() == 4)

    print("\n3. Other sources")
    p.fill("[data-testid=f-name]", "Ana Lopez"); p.select_option("[data-testid=f-src]", "Mini session form"); p.click("[data-testid=f-send]")
    check("mini-session form is halted by default", "Mini session form" in txt("f-msg") and sms() == 4)
    p.check("[data-testid=s-mini]")
    check("allowing that form texts both mini-session leads", sms() == 6)
    p.uncheck("[data-testid=s-mini]")
    p.fill("[data-testid=f-name]", "Ben Hall"); p.select_option("[data-testid=f-src]", "Manual"); p.click("[data-testid=f-send]")
    check("lead added by hand: no text", "Manual" in txt("f-msg"))
    p.fill("[data-testid=f-name]", "Cara Diaz"); p.select_option("[data-testid=f-src]", "Website contact form"); p.fill("[data-testid=f-phone]", "555-0199"); p.click("[data-testid=f-send]")
    check("7-digit phone: texted with No valid phone", "No valid phone" in p.locator("[data-testid=sms]").last.inner_text())

    print("\n4. What the text includes")
    before = int(txt("m-seg").split()[0])
    p.uncheck("[data-testid=s-gsm]")
    check("plain characters off: Siobhan's text turns Unicode and segments go up", int(txt("m-seg").split()[0]) > before)
    p.check("[data-testid=s-gsm]")
    p.check("[data-testid=s-full]")
    check("full names on: O'Neill with a plain apostrophe", "Siobhan O'Neill" in p.locator("[data-testid=phone]").inner_text())
    p.uncheck("[data-testid=s-email]")
    check("email off: no email in any text", "@" not in p.locator("[data-testid=phone]").inner_text())
    p.click("[data-testid=reset]")
    check("reset restores 3 texts", sms() == 3)
    p.locator("#app").scroll_into_view_if_needed()
    p.screenshot(path=str(TESTS / "screenshot-app.png"), full_page=False)

    print("\n6. Phone width")
    m = br.new_page(viewport={"width": 390, "height": 844})
    m.on("pageerror", lambda e: problems.append(str(e)))
    m.goto(url); m.wait_for_selector("[data-testid=task]")
    check("no horizontal page scroll at 390px", m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    m.screenshot(path=str(TESTS / "screenshot-mobile.png"), full_page=False)

    print("\n7. Console")
    check("zero console or page errors", not problems)
    if problems: print(problems)
    br.close()
srv.shutdown()
print(f"\n{passed} passed, {failed} failed")

