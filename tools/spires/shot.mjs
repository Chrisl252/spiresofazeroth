// Headless screenshot with real device metrics via CDP (no puppeteer): node tools/spires/shot.mjs <url> <out.png> [w] [h] [waitMs] [mobile]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, out, w = "1920", h = "1080", wait = "3500", mobile = ""] = process.argv.slice(2);
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const dir = mkdtempSync(join(tmpdir(), "spshot-"));
const port = 9300 + Math.floor(Math.random() * 500);
const p = spawn(chrome, [`--user-data-dir=${dir}`, "--headless=new", "--mute-audio", "--disable-gpu", `--remote-debugging-port=${port}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {} await sleep(250); }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) pend.get(d.id)(d.result); else if (d.method === "Runtime.consoleAPICalled" || d.method === "Runtime.exceptionThrown") logs.push(JSON.stringify(d.params).slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: !!mobile });
await send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.setItem('spires.sfx.muted','1')}catch(e){}" });
await send("Page.navigate", { url: url + (url.includes("?") ? "&" : "?") + "mute=1" }); await sleep(+wait);
if (process.env.PRE) { await send("Runtime.evaluate", { expression: process.env.PRE, awaitPromise: true }); await sleep(+(process.env.POST_MS || 1800)); }
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
if (process.env.EVAL) { const r = await send("Runtime.evaluate", { expression: process.env.EVAL, returnByValue: true }); console.log("EVAL", JSON.stringify(r.result && r.result.value)); }
console.log("saved", out, "console:", logs.length ? logs.join("\n") : "clean");
ws.close(); p.kill();
