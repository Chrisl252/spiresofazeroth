// Draws the hand-inked dashed lanes between map nodes on the parchment sheet canvas. Pure drawing; map.js owns layout.
// Inks: walked (stamped red-brown), live (bold dark: lanes you can still take), dead (faint). Hover lights the whole path ahead of a node.
const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return ((x >>> 0) % 1000) / 1000; };

// wobbly stroke so it reads as drawn by hand (stable per edge id)
function ink(ctx, a, b, id, color, width, dash, blur) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const bend = (hash(id) - 0.5) * 36, N = Math.max(10, Math.round(len / 14));
  ctx.save();
  if (blur) { ctx.shadowColor = "rgba(255,196,50,.95)"; ctx.shadowBlur = blur; }
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = Math.sin(Math.PI * t), jit = (hash(id + i) - 0.5) * 5;
    const x = a[0] + dx * t + nx * (bend + jit) * w, y = a[1] + dy * t + ny * (bend + jit) * w;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.setLineDash(dash); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
  ctx.restore();
}

export function drawPath(canvas, { W, H, map, pos, start, taken, live, here, hover, kids }) {
  const k = 1.5;
  canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(k, k);
  const all = [start, ...map.floors.flat()];
  const byId = new Map(all.map((n) => [n.id, n]));
  const lit = new Set(); // hovered node and everything beyond it
  if (hover) { const st = [hover]; while (st.length) { const id = st.pop(); if (lit.has(id)) continue; lit.add(id); for (const c of kids(byId.get(id))) st.push(c.id); } }
  const hereId = here && here.id;
  const edges = [];
  for (const n of all) for (const m of kids(n)) {
    const walked = taken.has(n.id) && taken.has(m.id);
    const isLive = !walked && (n.id === hereId || live.has(n.id)) && live.has(m.id);
    const hot = !!hover && !walked && lit.has(m.id) && (n.id === hereId ? m.id === hover : lit.has(n.id));
    edges.push({ a: pos(n), b: pos(m), id: n.id + ">" + m.id, walked, live: isLive, hot });
  }
  for (const e of edges) if (!e.walked && !e.live) ink(ctx, e.a, e.b, e.id, "rgba(70,40,12,.42)", 6, [14, 16]);
  for (const e of edges) if (e.walked) ink(ctx, e.a, e.b, e.id, "rgba(120,22,10,.92)", 12, [26, 7]);
  for (const e of edges) if (e.live) ink(ctx, e.a, e.b, e.id, "rgba(34,16,4,.95)", 12, [22, 13]);
  for (const e of edges) if (e.hot) ink(ctx, e.a, e.b, e.id, "#f2b81f", 13, [22, 11], 16);
}
