// Co-op transport: one WebRTC data channel between two browsers (PeerJS, vendored at js/vendor/peerjs.min.js, MIT).
// Signalling goes through the free PeerJS cloud broker (0.peerjs.com) and NAT traversal through its STUN/TURN defaults; game traffic is
// browser to browser. Nothing here knows the game: link.send(obj) / link.onMessage(fn) / link.onClose(fn) / link.close().
import { BUILD } from "../version.js?v=20261028e";

const PREFIX = "spires-azeroth-v1-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I: codes are read aloud
export const newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
export const cleanCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

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
  const Peer = await loadPeer();
  return new Promise((res, rej) => {
    const peer = new Peer(PREFIX + code, { debug: 1 });
    let taken = false, ready = false;
    peer.on("open", () => { ready = true; res({ code, cancel: () => { try { peer.destroy(); } catch { /* gone */ } } }); });
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
  const Peer = await loadPeer();
  return new Promise((res, rej) => {
    const peer = new Peer(undefined, { debug: 1 });
    let done = false;
    const fail = (m) => { if (done) return; done = true; try { peer.destroy(); } catch { /* gone */ } rej(new Error(m)); };
    const timer = setTimeout(() => fail("Timed out reaching that game. Check the code and try again."), 20000);
    peer.on("open", () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
      conn.on("open", () => { if (done) return; done = true; clearTimeout(timer); res(wrap(peer, conn)); });
      conn.on("error", (e) => fail(peerError(e)));
    });
    peer.on("error", (e) => { clearTimeout(timer); fail(peerError(e)); });
  });
}
