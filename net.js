/* =====================================================================
   Режим зрителя: игрок (хост) транслирует состояние игры зрителю напрямую
   (WebRTC через PeerJS). Сервера у нас нет — GitHub Pages только раздаёт
   файлы, поэтому используется бесплатный сервер знакомства PeerJS.
   ===================================================================== */

let libPromise = null;
function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Не удалось загрузить PeerJS'));
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randCode(n = 6) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
  return s;
}

/** Хост: возвращает { code, send(obj), count() } */
export async function startHost({ onCount, onError } = {}) {
  await loadPeerLib();
  let code = '';
  try { code = localStorage.getItem('kd_host_code') || ''; } catch (e) { /* ignore */ }
  if (!/^[A-Z0-9]{6}$/.test(code)) code = randCode();

  return new Promise((resolve, reject) => {
    const conns = new Set();
    const api = {
      code: '',
      send(obj) { for (const c of conns) { if (c.open) { try { c.send(obj); } catch (e) { /* ignore */ } } } },
      count: () => conns.size,
    };
    const notify = () => { if (onCount) onCount(conns.size); };
    const attempt = (c, n) => {
      const peer = new window.Peer('kd-' + c);
      peer.on('open', () => {
        try { localStorage.setItem('kd_host_code', c); } catch (e) { /* ignore */ }
        api.code = c;
        resolve(api);
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => { conns.add(conn); notify(); });
        const drop = () => { conns.delete(conn); notify(); };
        conn.on('close', drop);
        conn.on('error', drop);
      });
      peer.on('error', (err) => {
        if (err && err.type === 'unavailable-id' && n < 3) { peer.destroy(); attempt(randCode(), n + 1); return; }
        if (onError) onError(err);
        reject(err);
      });
    };
    attempt(code, 0);
  });
}

/** Зритель: onData(obj) на каждый кадр трансляции, onStatus('open'|'closed'|'nohost'|'timeout'|'error') */
export async function startGuest(code, { onData, onStatus }) {
  await loadPeerLib();
  const peer = new window.Peer();
  peer.on('open', () => {
    const conn = peer.connect('kd-' + String(code).toUpperCase(), { serialization: 'json', reliable: true });
    conn.on('open', () => onStatus('open'));
    conn.on('data', onData);
    conn.on('close', () => onStatus('closed'));
    conn.on('error', () => onStatus('error'));
    setTimeout(() => { if (!conn.open) onStatus('timeout'); }, 12000);
  });
  peer.on('error', (e) => onStatus(e && e.type === 'peer-unavailable' ? 'nohost' : 'error'));
}
