/* =====================================================================
   Процедурный звук (WebAudio). Внешних файлов нет — всё синтезируется:
   удары, металл, голоса мобов, огонь, лёд, ветер, лук, шаги, фон уровней,
   музыка. Звук объёмный: панорама и громкость зависят от положения источника,
   есть реверберация (пещеры и замки звучат гулко).
   ===================================================================== */

let ctx = null, master = null, revIn = null, revWet = null, noiseBuf = null;
let muted = false;
let musicEnabled = true;
let wetLevel = 0.18;
const L = { x: 0, z: 0, fx: 0, fz: -1 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export function setListener(x, z, fx, fz) {
  L.x = x; L.z = z;
  const l = Math.hypot(fx, fz) || 1;
  L.fx = fx / l; L.fz = fz / l;
}
export function setReverb(v) { wetLevel = v; if (revWet && ctx) revWet.gain.setTargetAtTime(v, ctx.currentTime, 0.2); }
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}
export function setMusicEnabled(v) { musicEnabled = v; }

export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(comp); comp.connect(ctx.destination);

      const n = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

      // импульс реверберации: затухающий шум
      const len = Math.floor(ctx.sampleRate * 1.8);
      const imp = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = imp.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      const conv = ctx.createConvolver();
      conv.buffer = imp;
      revIn = ctx.createGain();
      revWet = ctx.createGain();
      revWet.gain.value = wetLevel;
      revIn.connect(conv); conv.connect(revWet); revWet.connect(master);
      // фон и музыку запускаем, как только звук разрешён браузером
      const k = ambKind; ambKind = '';
      if (k) ambient(k);
      if (musicMode !== 'off') music(musicMode);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* звук необязателен */ }
}

function ready() { return !!ctx && ctx.state === 'running' && !muted; }

// ------------------------------------------------------------------ кирпичики
function bus(pan = 0, vol = 1, wet = 0.15) {
  const g = ctx.createGain();
  g.gain.value = vol;
  let last = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    g.connect(p); last = p;
  }
  last.connect(master);
  if (wet > 0) {
    const s = ctx.createGain();
    s.gain.value = wet;
    last.connect(s); s.connect(revIn);
  }
  return g;
}

function osc({ dest, type = 'sine', f = 440, f2 = null, dur = 0.2, vol = 0.2, at = 0.004, delay = 0, lp = null }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let n = o;
  if (lp) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = lp;
    o.connect(fl); n = fl;
  }
  n.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

function nz({ dest, dur = 0.2, vol = 0.2, type = 'bandpass', f = 1000, f2 = null, q = 1, at = 0.003, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}

// голос: пила + вибрато + «рычание» (амплитудная модуляция) + форманты
function voice(d, { f0 = 150, f1 = 100, dur = 0.4, vol = 0.2, rough = 0.5, fm = [700, 1500], vib = 6, noise = 0.2, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(25, f1), t + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = vib;
  const lg = ctx.createGain();
  lg.gain.value = f0 * 0.03;
  lfo.connect(lg); lg.connect(o.frequency);

  const am = ctx.createGain();
  am.gain.value = 1 - rough * 0.5;
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 34 + rough * 40;
  const lg2 = ctx.createGain();
  lg2.gain.value = rough * 0.5;
  lfo2.connect(lg2); lg2.connect(am.gain);
  o.connect(am);

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  fm.forEach((f, i) => {
    const b = ctx.createBiquadFilter();
    b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 4 + i * 2;
    const bg = ctx.createGain();
    bg.gain.value = i ? 0.6 : 1;
    am.connect(b); b.connect(bg); bg.connect(out);
  });
  out.connect(d);
  [o, lfo, lfo2].forEach((n) => { n.start(t); n.stop(t + dur + 0.05); });
  if (noise) nz({ dest: d, type: 'bandpass', f: fm[1] || 1000, q: 1.2, dur, vol: noise * vol * 2, at: 0.02, delay });
}

function crackle(d, dur = 1, vol = 0.12, delay = 0) {
  const n = Math.floor(dur * 26);
  for (let i = 0; i < n; i++) {
    nz({ dest: d, type: 'highpass', f: rand(1800, 4500), q: 0.7, dur: rand(0.012, 0.035), vol: vol * rand(0.4, 1), at: 0.001, delay: delay + Math.random() * dur });
  }
}

function chimeNotes(d, notes, gap = 0.09, vol = 0.12) {
  notes.forEach((f, i) => {
    osc({ dest: d, type: 'triangle', f, dur: 0.9, vol, at: 0.004, delay: i * gap });
    osc({ dest: d, type: 'sine', f: f * 2.01, dur: 0.5, vol: vol * 0.4, at: 0.004, delay: i * gap });
  });
}

// ------------------------------------------------------------------ звуки
const VOICES = {
  goblin:   { f: 400, fm: [850, 2200], r: 0.35, s: 1 },
  golem:    { f: 68,  fm: [170, 420],  r: 0.85, s: 1.7 },
  bog:      { f: 135, fm: [380, 900],  r: 0.7,  s: 1.2 },
  dark:     { f: 118, fm: [480, 1050], r: 0.4,  s: 1.1 },
  elite:    { f: 155, fm: [640, 1400], r: 0.45, s: 1 },
  fire:     { f: 210, fm: [500, 1500], r: 0.95, s: 1.2 },
  dragon:   { f: 60,  fm: [230, 680],  r: 0.8,  s: 2.4 },
};

const SND = {
  swing(d, a) {
    const s = clamp(a.s || 0.5, 0, 1);
    nz({ dest: d, type: 'bandpass', f: 350 + s * 400, f2: 1400 + s * 1400, q: 0.9, dur: 0.16 + 0.06 * (1 - s), vol: 0.1 + 0.12 * s, at: 0.04 });
    if (a.e === 'fire') nz({ dest: d, type: 'lowpass', f: 800, f2: 280, dur: 0.38, vol: 0.14, at: 0.05 });
    else if (a.e === 'ice') osc({ dest: d, type: 'sine', f: 2600, f2: 3600, dur: 0.25, vol: 0.035 });
    else if (a.e === 'wind') nz({ dest: d, type: 'bandpass', f: 500, f2: 2400, q: 0.5, dur: 0.42, vol: 0.18, at: 0.1 });
    else if (a.e === 'hammer') { osc({ dest: d, f: 95, f2: 55, dur: 0.3, vol: 0.1 }); nz({ dest: d, type: 'lowpass', f: 300, dur: 0.3, vol: 0.12, at: 0.08 }); }
  },
  hitFlesh(d, a) {
    osc({ dest: d, f: 170, f2: 55, dur: 0.16, vol: 0.4, at: 0.002 });
    nz({ dest: d, type: 'lowpass', f: 1400, f2: 300, dur: 0.14, vol: 0.3, at: 0.002 });
    nz({ dest: d, type: 'bandpass', f: 260, q: 3, dur: 0.2, vol: 0.12, delay: 0.02 });
    if (a.e === 'fire') crackle(d, 0.5, 0.1);
    if (a.e === 'ice') SND.freeze(d, {});
    if (a.e === 'wind') nz({ dest: d, type: 'bandpass', f: 700, f2: 2000, q: 0.5, dur: 0.3, vol: 0.14, at: 0.05 });
  },
  clang(d, a) {
    const base = a.p || 1;
    [[520, 1], [1130, 0.6], [1790, 0.45], [2610, 0.3], [3480, 0.2]].forEach(([f, v], i) =>
      osc({ dest: d, type: 'sine', f: f * base, dur: 0.55 - i * 0.07, vol: 0.11 * v, at: 0.001 }));
    nz({ dest: d, type: 'highpass', f: 3500, dur: 0.05, vol: 0.2, at: 0.001 });
  },
  block(d) {
    SND.clang(d, { p: 0.8 });
    osc({ dest: d, f: 120, f2: 45, dur: 0.22, vol: 0.35, at: 0.002 });
    nz({ dest: d, type: 'lowpass', f: 500, dur: 0.12, vol: 0.2 });
  },
  boom(d) {                      // удар молота
    osc({ dest: d, f: 75, f2: 32, dur: 0.65, vol: 0.55, at: 0.003 });
    nz({ dest: d, type: 'lowpass', f: 500, f2: 120, dur: 0.5, vol: 0.4, at: 0.003 });
    SND.clang(d, { p: 0.55 });
  },
  hurt(d) {
    osc({ dest: d, f: 150, f2: 50, dur: 0.25, vol: 0.45, at: 0.002 });
    nz({ dest: d, type: 'lowpass', f: 900, f2: 200, dur: 0.2, vol: 0.3 });
    voice(d, { f0: 190, f1: 110, dur: 0.28, vol: 0.12, rough: 0.2, fm: [600, 1500], noise: 0.1, delay: 0.03 });
  },
  voice(d, a) {
    const k = a.k || 'alert';
    if (a.t === 'spider') {
      nz({ dest: d, type: 'highpass', f: 3200, f2: 6000, q: 0.6, dur: k === 'die' ? 0.7 : 0.35, vol: 0.18, at: 0.03 });
      for (let i = 0; i < 4; i++) osc({ dest: d, type: 'square', f: 1500 + i * 120, dur: 0.03, vol: 0.05, at: 0.001, delay: i * 0.05 });
      return;
    }
    if (a.t === 'skeleton') {
      for (let i = 0; i < (k === 'die' ? 9 : 5); i++)
        nz({ dest: d, type: 'bandpass', f: rand(1800, 3600), q: 8, dur: 0.04, vol: 0.14, at: 0.001, delay: i * rand(0.03, 0.07) });
      osc({ dest: d, f: 220, f2: 140, dur: 0.18, vol: 0.06, type: 'triangle' });
      return;
    }
    const v = VOICES[a.t] || VOICES.goblin;
    const s = v.s;
    const cfg = {
      alert: { f0: v.f,        f1: v.f * 0.75, dur: 0.35 * s, vol: 0.2 },
      hurt:  { f0: v.f * 1.25, f1: v.f * 0.6,  dur: 0.22 * s, vol: 0.18 },
      die:   { f0: v.f,        f1: v.f * 0.3,  dur: 0.8 * s,  vol: 0.22 },
      atk:   { f0: v.f * 1.1,  f1: v.f * 0.8,  dur: 0.18 * s, vol: 0.2 },
    }[k] || { f0: v.f, f1: v.f * 0.7, dur: 0.3, vol: 0.18 };
    voice(d, { ...cfg, rough: v.r, fm: v.fm, vib: 5 + Math.random() * 3 });
    if (a.t === 'dragon') {
      nz({ dest: d, type: 'lowpass', f: 700, f2: 150, dur: cfg.dur, vol: 0.3, at: 0.08 });
      osc({ dest: d, f: 45, f2: 28, dur: cfg.dur, vol: 0.3, at: 0.05 });
    } else if (a.t === 'fire') {
      nz({ dest: d, type: 'bandpass', f: 400, f2: 900, q: 0.6, dur: cfg.dur, vol: 0.18, at: 0.05 });
      crackle(d, cfg.dur, 0.08);
    } else if (a.t === 'dark' || a.t === 'elite') {
      SND.clang(d, { p: 1.6 });
    } else if (a.t === 'bog') {
      for (let i = 0; i < 3; i++) osc({ dest: d, f: 220 + i * 60, f2: 520 + i * 90, dur: 0.1, vol: 0.07, delay: i * 0.09 });
    }
  },
  roar(d) { SND.voice(d, { t: 'dragon', k: 'alert' }); },
  fireBreath(d) {
    nz({ dest: d, type: 'lowpass', f: 300, f2: 1300, dur: 0.4, vol: 0.45, at: 0.15 });
    nz({ dest: d, type: 'lowpass', f: 1300, f2: 260, dur: 1.1, vol: 0.45, at: 0.02, delay: 0.4 });
    nz({ dest: d, type: 'bandpass', f: 2200, q: 0.6, dur: 1.4, vol: 0.12, at: 0.1 });
    osc({ dest: d, f: 52, f2: 38, dur: 1.5, vol: 0.28, at: 0.1 });
    crackle(d, 1.4, 0.12);
  },
  burn(d) { crackle(d, 0.7, 0.12); nz({ dest: d, type: 'lowpass', f: 500, dur: 0.4, vol: 0.12, at: 0.05 }); },
  freeze(d) {
    [2400, 3100, 4200, 5200].forEach((f, i) => osc({ dest: d, f, f2: f * 0.97, dur: 0.35 - i * 0.04, vol: 0.06, at: 0.001, delay: i * 0.02 }));
    nz({ dest: d, type: 'highpass', f: 5000, dur: 0.12, vol: 0.12 });
  },
  gust(d) {
    nz({ dest: d, type: 'bandpass', f: 400, f2: 1800, q: 0.5, dur: 0.5, vol: 0.2, at: 0.15 });
    nz({ dest: d, type: 'bandpass', f: 1800, f2: 500, q: 0.5, dur: 0.5, vol: 0.12, at: 0.15, delay: 0.25 });
  },
  bowDraw(d) {
    osc({ dest: d, type: 'sawtooth', f: 90, f2: 150, dur: 0.5, vol: 0.05, at: 0.1, lp: 500 });
    nz({ dest: d, type: 'bandpass', f: 1200, q: 4, dur: 0.4, vol: 0.04, at: 0.1 });
  },
  bow(d, a) {
    const c = clamp(a.c || 0.5, 0, 1);
    osc({ dest: d, type: 'triangle', f: 210 + c * 80, f2: 100, dur: 0.16, vol: 0.28, at: 0.001 });
    osc({ dest: d, type: 'sine', f: 330, f2: 300, dur: 0.35, vol: 0.1, at: 0.001 });
    nz({ dest: d, type: 'bandpass', f: 1500, q: 2, dur: 0.06, vol: 0.2, at: 0.001 });
    nz({ dest: d, type: 'bandpass', f: 1000, f2: 3200, q: 1, dur: 0.35, vol: 0.1 + 0.1 * c, at: 0.04, delay: 0.03 });
  },
  arrowHit(d) {
    osc({ dest: d, f: 220, f2: 80, dur: 0.09, vol: 0.28, at: 0.001 });
    osc({ dest: d, type: 'triangle', f: 760, f2: 520, dur: 0.07, vol: 0.12, at: 0.001 });
    nz({ dest: d, type: 'lowpass', f: 1500, dur: 0.06, vol: 0.2 });
  },
  step(d, a) {
    const h = clamp(a.h || 1, 0.5, 2.2);
    osc({ dest: d, f: 130 / h, f2: 50 / h, dur: 0.11, vol: 0.22 * Math.min(1.4, h), at: 0.002 });
    nz({ dest: d, type: 'lowpass', f: 500 / Math.sqrt(h), dur: 0.08, vol: 0.18 * Math.min(1.4, h) });
  },
  stomp(d, a) {                  // тяжёлый шаг: грохот и дрожь земли — чем больше моб, тем сильнее
    const h = clamp(a.h || 1.5, 1, 4);
    osc({ dest: d, f: 62 / Math.sqrt(h), f2: 24, dur: 0.5 + 0.12 * h, vol: Math.min(0.75, 0.28 + 0.1 * h), at: 0.002 });
    osc({ dest: d, type: 'triangle', f: 38, f2: 20, dur: 0.9 + 0.1 * h, vol: 0.25, at: 0.01 });
    nz({ dest: d, type: 'lowpass', f: 420, f2: 70, dur: 0.6 + 0.1 * h, vol: 0.4, at: 0.003 });
    for (let i = 0; i < 4; i++) nz({ dest: d, type: 'bandpass', f: rand(250, 700), q: 3, dur: 0.1, vol: 0.12, delay: 0.05 + i * 0.07 });   // сыплются камни
  },
  rumble(d, a) {                 // раскат: появление гиганта, удар босса
    const h = clamp(a.h || 2, 1, 4);
    osc({ dest: d, type: 'sawtooth', f: 36, f2: 26, dur: 1.6, vol: 0.2, at: 0.2, lp: 160 });
    nz({ dest: d, type: 'lowpass', f: 180, f2: 50, dur: 1.5 + 0.2 * h, vol: 0.5, at: 0.25 });
    crackle(d, 1.0, 0.06, 0.2);
  },
  ignite(d) {
    nz({ dest: d, type: 'bandpass', f: 400, f2: 2200, q: 0.6, dur: 0.35, vol: 0.28, at: 0.03 });
    nz({ dest: d, type: 'lowpass', f: 900, f2: 200, dur: 0.6, vol: 0.2, at: 0.05 });
    crackle(d, 0.7, 0.12);
  },
  shatter(d) {
    [3200, 4100, 5200, 6100, 2600].forEach((f, i) => osc({ dest: d, f, f2: f * 0.9, dur: 0.3 - i * 0.03, vol: 0.07, at: 0.001, delay: i * 0.015 }));
    nz({ dest: d, type: 'highpass', f: 3500, dur: 0.35, vol: 0.28, at: 0.001 });
    osc({ dest: d, f: 140, f2: 60, dur: 0.25, vol: 0.25 });
  },
  guardBreak(d) {                // щит пробит
    nz({ dest: d, type: 'highpass', f: 2500, dur: 0.3, vol: 0.35, at: 0.001 });
    SND.clang(d, { p: 0.55 });
    osc({ dest: d, f: 90, f2: 30, dur: 0.6, vol: 0.5, at: 0.002 });
    voice(d, { f0: 260, f1: 90, dur: 0.4, vol: 0.12, rough: 0.5, fm: [500, 1200], noise: 0.1 });
  },
  guardStrain(d) {               // щит держит, но трещит
    osc({ dest: d, type: 'sawtooth', f: 160, f2: 110, dur: 0.18, vol: 0.08, lp: 500 });
    nz({ dest: d, type: 'bandpass', f: 1800, q: 2, dur: 0.1, vol: 0.12 });
  },
  parry(d) {                     // успешное парирование
    SND.clang(d, { p: 1.7 });
    chimeNotes(d, [1568, 2093], 0.05, 0.08);
  },
  whoosh(d, a) {
    nz({ dest: d, type: 'bandpass', f: 300, f2: 1600, q: 0.8, dur: 0.3, vol: 0.1 + 0.1 * (a.s || 0.5), at: 0.06 });
  },
  pickup(d) {
    chimeNotes(d, [880, 1109, 1319, 1760], 0.08, 0.14);
    nz({ dest: d, type: 'highpass', f: 6000, dur: 0.4, vol: 0.04, at: 0.05 });
  },
  gate(d) {
    osc({ dest: d, type: 'sawtooth', f: 80, f2: 160, dur: 1.2, vol: 0.12, at: 0.4, lp: 600 });
    chimeNotes(d, [392, 523, 659, 784], 0.16, 0.1);
  },
  fanfare(d) {
    [[392, 0], [392, 0.18], [392, 0.36], [523, 0.54], [659, 0.9], [784, 1.2]].forEach(([f, t], i) => {
      osc({ dest: d, type: 'sawtooth', f, dur: i > 3 ? 0.7 : 0.22, vol: 0.09, at: 0.02, delay: t, lp: 1800 });
      osc({ dest: d, type: 'square', f: f / 2, dur: i > 3 ? 0.7 : 0.22, vol: 0.04, at: 0.02, delay: t, lp: 900 });
    });
    nz({ dest: d, type: 'bandpass', f: 4000, q: 0.5, dur: 1.6, vol: 0.03, at: 0.1, delay: 0.6 });
  },
  princess(d) { chimeNotes(d, [1046, 1318, 1568, 2093], 0.1, 0.09); },
  spawn(d) { osc({ dest: d, f: 110, f2: 55, dur: 0.5, vol: 0.2 }); nz({ dest: d, type: 'lowpass', f: 600, f2: 150, dur: 0.5, vol: 0.2 }); },
};

const SND_WET = { stomp: 0.35, rumble: 0.5, shatter: 0.3, guardBreak: 0.35, parry: 0.3, clang: 0.3, block: 0.3, boom: 0.4, fireBreath: 0.35, voice: 0.25, roar: 0.4, pickup: 0.45, fanfare: 0.4, princess: 0.5, gate: 0.4 };
const lastPlay = {};

export function play(name, x, z, arg) {
  if (!ready()) return;
  const fn = SND[name];
  if (!fn) return;
  const now = performance.now();
  if (now - (lastPlay[name] || 0) < 35) return;     // защита от «каши» из одинаковых звуков
  lastPlay[name] = now;
  let pan = 0, vol = 1;
  if (x !== undefined && x !== null) {
    const dx = x - L.x, dz = z - L.z, dist = Math.hypot(dx, dz);
    pan = dist > 0.3 ? clamp((dx * -L.fz + dz * L.fx) / dist, -1, 1) : 0;
    vol = clamp(1.7 / (1 + 0.2 * dist), 0.12, 1);
  }
  try { fn(bus(pan, vol, SND_WET[name] ?? 0.15), arg || {}); } catch (e) { /* ignore */ }
}

// ------------------------------------------------------------------ фон уровня
const AMB = {
  village:  { lp: 420, vol: 0.05, lfo: 0.12, ev: 'owl',    wet: 0.1 },
  forest:   { lp: 700, vol: 0.06, lfo: 0.2,  ev: 'cricket', wet: 0.18 },
  mine:     { lp: 220, vol: 0.05, lfo: 0.07, ev: 'drip',   wet: 0.5 },
  swamp:    { lp: 350, vol: 0.05, lfo: 0.15, ev: 'bubble', wet: 0.3 },
  fortress: { lp: 260, vol: 0.06, lfo: 0.06, ev: 'drip',   wet: 0.4 },
  canyon:   { lp: 180, vol: 0.09, lfo: 0.1,  ev: 'lava',   wet: 0.25 },
  approach: { lp: 520, vol: 0.06, lfo: 0.18, ev: 'owl',    wet: 0.2 },
  castle:   { lp: 200, vol: 0.08, lfo: 0.08, ev: 'lava',   wet: 0.35 },
  tower:    { lp: 300, vol: 0.03, lfo: 0.1,  ev: 'drip',   wet: 0.5 },
};
let ambNodes = null, ambTimer = null, ambKind = '';

export function ambient(kind) {
  if (kind === ambKind) return;
  ambKind = kind;
  const cfg = AMB[kind];
  if (cfg) setReverb(cfg.wet);
  if (!ctx) return;
  stopAmbient();
  if (!cfg) return;
  try {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = cfg.lp;
    const g = ctx.createGain();
    g.gain.value = cfg.vol;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = cfg.lfo;
    const lg = ctx.createGain();
    lg.gain.value = cfg.vol * 0.6;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(fl); fl.connect(g); g.connect(master);
    s.start(); lfo.start();
    ambNodes = { s, lfo, g };
    ambTimer = setInterval(() => {
      if (!ready()) return;
      if (Math.random() < 0.18) {                                           // порыв ветра / шелест
        const dw = bus(rand(-0.9, 0.9), rand(0.2, 0.5), 0.3);
        nz({ dest: dw, type: 'bandpass', f: rand(300, 600), f2: rand(900, 1600), q: 0.5, dur: 1.4, vol: 0.07, at: 0.6 });
      }
      if (cfg.ev === 'owl' && Math.random() < 0.35) {                       // птичьи трели
        const db = bus(rand(-0.9, 0.9), rand(0.25, 0.5), 0.25), f = rand(2400, 3600);
        for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) osc({ dest: db, f, f2: f * rand(1.1, 1.4), dur: 0.07, vol: 0.035, at: 0.005, delay: i * 0.1 });
      }
      if (Math.random() > 0.5) return;
      const d = bus(rand(-0.8, 0.8), rand(0.3, 0.7), 0.4);
      const ev = cfg.ev;
      if (ev === 'owl') { osc({ dest: d, f: 390, f2: 350, dur: 0.5, vol: 0.08, at: 0.05, lp: 900 }); osc({ dest: d, f: 360, f2: 300, dur: 0.7, vol: 0.08, at: 0.05, delay: 0.6, lp: 900 }); }
      else if (ev === 'cricket') { for (let i = 0; i < 6; i++) osc({ dest: d, type: 'square', f: 4200, dur: 0.025, vol: 0.02, delay: i * 0.06 }); }
      else if (ev === 'drip') osc({ dest: d, f: 1900, f2: 800, dur: 0.12, vol: 0.12, at: 0.002 });
      else if (ev === 'bubble') osc({ dest: d, f: 280, f2: 700, dur: 0.12, vol: 0.1 });
      else if (ev === 'lava') { nz({ dest: d, type: 'lowpass', f: 200, dur: 0.4, vol: 0.25, at: 0.05 }); crackle(d, 0.5, 0.05); }
    }, 1600);
  } catch (e) { /* ignore */ }
}

function stopAmbient() {
  try {
    if (ambNodes) { ambNodes.s.stop(); ambNodes.lfo.stop(); ambNodes = null; }
    if (ambTimer) { clearInterval(ambTimer); ambTimer = null; }
  } catch (e) { /* ignore */ }
}

// ------------------------------------------------------------------ музыка
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
let musicMode = 'off', musicTimer = null, tick = 0;

export function music(mode) {
  musicMode = mode;
  if (musicTimer || !ctx) return;
  musicTimer = setInterval(() => {
    if (!ready() || !musicEnabled || musicMode === 'off') return;
    const battle = musicMode === 'battle';
    const d = bus(0, 1, 0.3);
    if (tick % 8 === 0) {
      const ch = CHORDS[(tick / 8) % CHORDS.length | 0];
      ch.forEach((f, i) => {
        osc({ dest: d, type: battle ? 'sawtooth' : 'triangle', f: f / 2, dur: 5.5, vol: battle ? 0.016 : 0.02, at: 1.6, lp: battle ? 500 : 700 });
        osc({ dest: d, type: 'sine', f: f * (1 + i * 0.002), dur: 5.5, vol: 0.012, at: 1.8 });
      });
    }
    if (battle) {
      osc({ dest: d, f: 120, f2: 42, dur: 0.28, vol: 0.28, at: 0.002 });
      if (tick % 2 === 1) { nz({ dest: d, type: 'lowpass', f: 400, f2: 150, dur: 0.22, vol: 0.2 }); osc({ dest: d, f: 90, f2: 55, dur: 0.2, vol: 0.12 }); }
    }
    tick++;
  }, 520);
}

export function stopAll() { stopAmbient(); ambKind = ''; musicMode = 'off'; }
