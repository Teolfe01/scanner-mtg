// Abre o site no WebKit (motor do Safari), simulando iPhone, e registra erros e travamentos
import { webkit, devices } from "playwright";
const url = process.argv[2] || "https://teolfe01.github.io/scanner-mtg/";
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const pg = await ctx.newPage();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
pg.on("console", m => { if (["error", "warning"].includes(m.type())) log("CONSOLE", m.type(), m.text().slice(0, 300)); });
pg.on("pageerror", e => log("PAGEERROR", e.message, (e.stack || "").split("\n").slice(0, 4).join(" | ")));
pg.on("crash", () => log("CRASH: o processo da página travou"));
pg.on("requestfailed", r => log("REQFAIL", r.url().slice(0, 120), r.failure()?.errorText));
try {
  await pg.goto(url, { timeout: 60000 });
  for (let i = 0; i < 12; i++) {
    await pg.waitForTimeout(5000);
    const st = await pg.evaluate(() => ({ splash: document.getElementById("splash")?.className, bar: document.getElementById("splashBar")?.style.width, title: document.getElementById("title")?.textContent, err: document.getElementById("bootErr")?.innerText?.slice(0, 400) })).catch(e => ({ evalErr: e.message }));
    log("STATE", JSON.stringify(st));
    if (st.splash && st.splash.includes("hidden")) break;
  }
  await pg.screenshot({ path: "webkit.png" });
} catch (e) { log("FALHA", e.message); }
await b.close();
