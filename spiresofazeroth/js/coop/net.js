// Co-op transport: one WebRTC data channel between two browsers (PeerJS, vendored at js/vendor/peerjs.min.js, MIT).
// Signalling goes through the free PeerJS cloud broker (0.peerjs.com) and NAT traversal through its STUN/TURN defaults; game traffic is
// browser to browser. Nothing here knows the game: link.send(obj) / link.onMessage(fn) / link.onClose(fn) / link.close().
import { BUILD } from "../version.js?v=20261029d";

const PREFIX = "spires-azeroth-v1-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I: codes are read aloud
export const newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
export const cleanCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

// 10-29: the PeerJS cloud TURN (eu-0/us-0.turn.peerjs.com) returned no relay candidates, so players whose networks cannot connect
// directly timed out on join. Relay now comes from Cloudflare TURN through our Worker (workers/spires-turn), fetched per connection
// (credentials last 2h). If it is unreachable, STUN alone still connects most players.
const TURN_URL = "https://thewowdb.com/spiresofazeroth/api/turn";
const FALLBACK_ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
async function peerOpts() {
  let iceServers = FALLBACK_ICE;
  try {
    const r = await fetch(TURN_URL, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (r.ok) { const d = await r.json(); if (Array.isArray(d.iceServers) && d.iceServers.length) iceServers = d.iceServers; }
  } catch { /* offline or blocked: direct connections still work */ }
  return { debug: 1, config: { iceServers } };
}

let loading = null;
function loadPeer() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  if (!loading) loading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = new URL(`../vendor/peerjs.min.js?v=${BUILD}`, import.meta.url).href;
    s.onload = () => { const P = globalThis.Peer || (globalThis.peerjs && globalThis.peerjs.Peer); P ? res(P) : rej(new Error("PeerJS missing")); };
    s.onerror = () => { loading = null; rej(new Error("Could not load the co-op library")); };
    document.head.append(s);
  });
  return loading;
}

function wrap(peer, conn) {
  const msgL = new Set(), closeL = new Set();
  let closed = false;
  const fireClose = (why) => { if (closed) return; closed = true; for (const f of closeL) try { f(why); } catch (e) { console.warn("[coop] close listener", e); } };
  conn.on("data", (d) => { for (const f of msgL) try { f(d); } catch (e) { console.error("[coop] message handler", e); } });
  conn.on("close", () => fireClose("closed"));
  conn.on("error", (e) => { console.warn("[coop] connection error", e); fireClose("error"); });
  peer.on("disconnected", () => { if (!closed && conn.open) try { peer.reconnect(); } catch { /* broker gone; the data channel itself may live on */ } });
  return {
    send(obj) { if (!closed && conn.open) conn.send(obj); },
    onMessage(f) { msgL.add(f); return () => msgL.delete(f); },
    onClose(f) { closeL.add(f); return () => closeL.delete(f); },
    close() { fireClose("left"); try { conn.close(); } catch { /* already gone */ } try { peer.destroy(); } catch { /* already gone */ } },
    get open() { return !closed && conn.open; },
  };
}

function peerError(e) {
  const t = e && e.type;
  if (t === "peer-unavailable") return "No game with that code. Check the code and that your friend is still hosting.";
  if (t === "unavailable-id") return "That room code is taken, try again.";
  if (t === "browser-incompatible") return "This browser cannot do peer-to-peer co-op.";
  if (t === "network" || t === "server-error" || t === "socket-error") return "Could not reach the co-op matchmaker. Check your connection.";
  return (e && e.message) || "Co-op connection failed.";
}

// Host: opens room `code`, resolves once the room is registered; onJoin(link) fires when a partner connects (one partner, later ones are refused).
export async function host(code, onJoin, onError) {
  const Peer = await loadPeer(), opts = await peerOpts();
  return new Promise((res, rej) => {
    const peer = new Peer(PREFIX + code, opts);
    let taken = false, ready = false;
    peer.on("open", () => { ready = true; res({ code, cancel: () => { try { peer.destroy(); } catch { /* gone */ } } }); });
    peer.on("disconnected", () => { if (!taken && !peer.destroyed) try { peer.reconnect(); } catch { /* broker gone */ } }); // an idle lobby lost its room on the broker, so the code stopped resolving
    peer.on("connection", (conn) => {
      if (taken) { conn.on("open", () => { conn.send({ t: "full" }); setTimeout(() => conn.close(), 300); }); return; }
      taken = true;
      conn.on("open", () => onJoin(wrap(peer, conn)));
    });
    peer.on("error", (e) => { const m = peerError(e); if (!ready) rej(new Error(m)); else if (onError) onError(m); });
  });
}

// Guest: connects to room `code`; resolves with the link once the channel is open.
export async function join(code) {
  const Peer = await loadPeer(), opts = await peerOpts();
  return new Promise((res, rej) => {
    const peer = new Peer(undefined, opts);
    let done = false;
    const fail = (m) => { if (done) return; done = true; try { peer.destroy(); } catch { /* gone */ } rej(new Error(m)); };
    const timer = setTimeout(() => fail("Timed out reaching that game. Check the code; if it is right, one of your networks blocks peer-to-peer (try another network or have the other player host)."), 35000);
    peer.on("open", () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
      conn.on("open", () => { if (done) return; done = true; clearTimeout(timer); res(wrap(peer, conn)); });
      conn.on("error", (e) => fail(peerError(e)));
    });
    peer.on("error", (e) => { clearTimeout(timer); fail(peerError(e)); });
  });
}
