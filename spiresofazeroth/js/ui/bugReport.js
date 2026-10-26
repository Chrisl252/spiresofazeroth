// Floating bug-report button (draggable, remembers where you left it) + a small report form.
// "Email report" POSTs to /api/spires/bug, which emails Chris; mailto is the fallback if SMTP is down.
// Starts bottom-left next to the draw pile. Lives on the stage root, so it scales with the 1920x1080 design space.
import { h, clear } from "./dom.js";
import { BUILD } from "../version.js";

const KEY = "spires.bugBtn", ENDPOINT = "/api/spires/bug", START = { x: 184, y: 1080 - 42 - 56 }, SIZE = 56, DESIGN = { w: 1920, h: 1080 };
const BUG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="14" rx="5" ry="6.5"/><path d="M9.5 7.6 8 5M14.5 7.6 16 5M7 11H3.5M17 11h3.5M7.2 15.5H4M16.8 15.5H20M8 19.5l-2 2M16 19.5l2 2M12 7.5v13"/></svg>';
const FALLBACK_EMAIL = "chrislucas252@gmail.com";
const SAY = {
  send: "Email report",
  sending: "Sending...",
  thanks: "Thanks! Report emailed.",
  alt: "Open in your email app instead",
};

const load = () => { try { const p = JSON.parse(localStorage.getItem(KEY)); if (p && isFinite(p.x) && isFinite(p.y)) return p; } catch (e) { /* storage blocked */ } return null; };
const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ } };
const clamp = (p) => ({ x: Math.max(0, Math.min(DESIGN.w - SIZE, p.x)), y: Math.max(0, Math.min(DESIGN.h - SIZE, p.y)) });

function context(app) {
  const r = (app && app.run) || {};
  return {
    build: BUILD,
    screen: r.screen || "title",
    class: r.classId || "",
    zone: r.zoneId || "",
    act: r.act != null ? r.act : "",
    floor: r.floor != null ? r.floor : "",
    hp: r.hp != null ? `${r.hp}/${r.maxHp}` : "",
    deck: r.deck && Array.isArray(r.deck) ? r.deck.length : (r.deck || ""),
    gold: r.gold != null ? r.gold : "",
    seed: r.seed || "",
    viewport: typeof innerWidth !== "undefined" ? `${innerWidth}x${innerHeight}` : "",
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

function buildMailtoUrl(reportText, emailVal, ctx) {
  const subject = `[Spires bug] build ${ctx.build || "?"} - ${reportText.slice(0, 60).replace(/[\r\n]+/g, " ")}`;
  const lines = [
    reportText,
    "",
    "--- context ---",
    ...Object.entries(ctx).map(([k, v]) => `${k}: ${v}`),
    `contact: ${emailVal || "-"}`,
  ];
  return `mailto:${FALLBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

export function mountBugReport(app, stage) {
  if (document.getElementById("sp-bug-btn")) return;
  const link = document.createElement("link"); link.rel = "stylesheet"; link.href = new URL(`../../css/bugreport.css?v=${BUILD}`, import.meta.url).href; document.head.append(link);
  let pos = clamp(load() || START);
  const btn = h("button", { class: "sp-bug", id: "sp-bug-btn", type: "button", title: "Report a bug", "aria-label": "Report a bug" });
  btn.innerHTML = BUG_SVG;
  const place = () => { btn.style.left = `${pos.x}px`; btn.style.top = `${pos.y}px`; };
  place();

  // drag (pointer events, scaled by the stage); a press that barely moves is a click
  let drag = null;
  btn.addEventListener("pointerdown", (e) => { drag = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false }; btn.setPointerCapture(e.pointerId); });
  btn.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true; btn.classList.add("is-drag");
    const s = stage.scale || 1; pos = clamp({ x: drag.ox + dx / s, y: drag.oy + dy / s }); place();
  });
  const end = () => { if (!drag) return; const moved = drag.moved; drag = null; btn.classList.remove("is-drag"); if (moved) save(pos); else openPanel(); };
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", () => { drag = null; btn.classList.remove("is-drag"); });
  btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPanel(); } });

  function openPanel() {
    if (stage.root.querySelector(".sp-bugp")) return;
    const msg = h("p", { class: "sp-bugp__msg", role: "status" });
    const ta = h("textarea", { placeholder: "What happened? What did you expect?", maxlength: 2000, "aria-label": "Describe the bug" });
    const em = h("input", { type: "email", placeholder: "Your email (optional, only if you want a reply)", maxlength: 254, "aria-label": "Email" });
    const hp = h("input", { class: "sp-bugp__hp", type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
    const send = h("button", { class: "sp-wowbtn sp-wowbtn--sm", type: "button" }, SAY.send);
    const cancel = h("button", { class: "sp-wowbtn sp-wowbtn--sm", type: "button" }, "Close");
    const box = h("div", { class: "sp-bugp__box", role: "dialog", "aria-modal": "true", "aria-label": "Report a bug" },
      h("h3", {}, "Report a bug"), h("p", {}, "Tell us what went wrong. Your class, floor and build are attached automatically."), ta, em, hp, h("div", { class: "sp-bugp__row" }, msg, cancel, send));
    const wrap = h("div", { class: "sp-bugp" }, box);
    const close = () => { document.removeEventListener("keydown", onKey, true); wrap.remove(); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    wrap.addEventListener("keydown", (e) => e.stopPropagation()); // typing here must never reach the game's key handlers
    wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) close(); });
    cancel.addEventListener("click", close);
    function showFallback(errText, reportText, emailVal, ctx) {
      clear(msg);
      const mailto = buildMailtoUrl(reportText, emailVal, ctx);
      const link = h("a", {
        href: mailto,
        class: "sp-bugp__fallback",
        target: "_blank",
        rel: "noopener noreferrer",
      }, SAY.alt);
      msg.append(document.createTextNode(`${errText} `), link);
    }

    send.addEventListener("click", () => { viaSite(); });

    async function viaSite() {
      const text = ta.value.trim();
      if (text.length < 5) {
        clear(msg);
        msg.textContent = "Please describe the bug first.";
        return;
      }
      send.disabled = true;
      clear(msg);
      msg.textContent = SAY.sending;
      const emailVal = em.value.trim();
      const ctx = context(app);
      let success = false;
      let timer = null;
      try {
        let signal;
        if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
          signal = AbortSignal.timeout(12000);
        } else if (typeof AbortController !== "undefined") {
          const controller = new AbortController();
          timer = setTimeout(() => controller.abort(), 12000);
          signal = controller.signal;
        }

        const r = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, email: emailVal, website: hp.value, context: ctx }),
          signal,
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok && j.emailed !== false) {
          success = true;
          clear(msg);
          msg.textContent = SAY.thanks;
          ta.value = "";
          setTimeout(close, 1400);
          return;
        }
        const err = j.emailed === false
          ? "Saved, but email did not send."
          : (j.error || (r.status ? `Server returned ${r.status}.` : "Could not send."));
        showFallback(err, text, emailVal, ctx);
      } catch (e) {
        const isTimeout = e && (e.name === "TimeoutError" || e.name === "AbortError");
        const err = isTimeout ? "Request timed out (12s)." : "Could not reach the server.";
        showFallback(err, text, emailVal, ctx);
      } finally {
        if (timer) clearTimeout(timer);
        if (!success) {
          send.disabled = false;
        }
      }
    }
    stage.root.append(wrap);
    ta.focus();
  }
  stage.root.append(btn);
}
