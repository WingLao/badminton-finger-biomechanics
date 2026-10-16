// 3D 羽毛球手指發力教學（F2–F5）：MyoSim 骨骼＋手肘＋肌肉＋拍面與羽球對照；p5.js 背景；支援手機
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { loadMyoSim } from './myosim_20261016100828.js';

const $ = (id) => document.getElementById(id);
const D2R = Math.PI / 180, clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), lerp = (a, b, u) => a + (b - a) * u;
const ease = (u) => u * u * (3 - 2 * u);
const F = ['thumb', 'index', 'middle', 'ring', 'little'];
const FN = { index: 2, middle: 3, ring: 4, little: 5 };
const MUS = ['FDP', 'Thenar', 'Interossei', 'Pronator', 'Supinator', 'EDC'];
const MUS_ZH = { FDP: '彎手指的肌肉', Thenar: '大拇指的肌肉', Interossei: '虎口的小肌肉', Pronator: '前臂向內轉的肌肉', Supinator: '前臂向外轉的肌肉', EDC: '張開手指的肌肉' };

// ---------- 姿勢庫：關節角（度）＋各指施力＋肌群激發（0–1） ----------
// fingers：每指 [MCP, PIP, DIP]；thumb：[CMC 屈曲, CMC 外展, MP, IP]（正值＝屈曲，載入時自動校正方向）
const BASE = { index: [52, 58, 26], middle: [62, 66, 30], ring: [66, 70, 32], little: [70, 72, 34] };
const add = (o, d) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map((x, i) => x + (d[k]?.[i] || 0))]));
const M0 = { FDP: 0.1, Thenar: 0.1, Interossei: 0.1, Pronator: 0.1, Supinator: 0.1, EDC: 0.1 };
const P0 = { thumb: 0.1, index: 0.1, middle: 0.1, ring: 0.1, little: 0.1 };
const POSES = {
  relaxed: { fingers: BASE, thumb: [18, 12, 10, 8], force: P0, mus: M0 },
  fhSqueeze: { fingers: add(BASE, { index: [6, 6, 4], middle: [14, 16, 14], ring: [14, 16, 14], little: [14, 16, 14] }), thumb: [22, 12, 14, 10],
    force: { thumb: 0.45, index: 0.55, middle: 1, ring: 0.85, little: 0.75 }, mus: { FDP: 1, Thenar: 0.3, Interossei: 0.4, Pronator: 1, Supinator: 0.05, EDC: 0.1 }, lever: 1 },
  bhReady: { fingers: add(BASE, { index: [-8, -10, -6], middle: [-2, 0, 0] }), thumb: [14, 16, 2, -4], force: { ...P0, thumb: 0.3 },
    mus: { ...M0, Thenar: 0.3, Supinator: 0.2 } },
  bhPush: { fingers: add(BASE, { index: [-6, -6, -4], middle: [10, 12, 10], ring: [10, 12, 10], little: [10, 12, 10] }), thumb: [12, 18, -6, -14],
    force: { thumb: 1, index: 0.3, middle: 0.7, ring: 0.65, little: 0.6 }, mus: { FDP: 0.6, Thenar: 1, Interossei: 0.4, Pronator: 0.05, Supinator: 1, EDC: 0.15 }, lever: -1 },
  netRoll: { fingers: add(BASE, { index: [-6, -8, -4], middle: [-8, -14, -8], ring: [-18, -30, -16], little: [-20, -32, -18] }), thumb: [20, 10, 10, 6],
    force: { thumb: 0.8, index: 0.8, middle: 0.6, ring: 0.05, little: 0.05 }, mus: { FDP: 0.25, Thenar: 0.5, Interossei: 0.8, Pronator: 0.1, Supinator: 0.1, EDC: 0.3 } },
  drIndex: { fingers: add(BASE, { index: [10, 10, 8], middle: [6, 6, 6] }), thumb: [18, 12, 10, 8],
    force: { thumb: 0.3, index: 1, middle: 0.5, ring: 0.3, little: 0.25 }, mus: { FDP: 0.8, Thenar: 0.25, Interossei: 0.7, Pronator: 0.5, Supinator: 0.05, EDC: 0.1 }, lever: 0.7 },
  drThumb: { fingers: add(BASE, { index: [-6, -6, -4] }), thumb: [12, 18, -6, -14],
    force: { thumb: 1, index: 0.25, middle: 0.5, ring: 0.45, little: 0.4 }, mus: { FDP: 0.5, Thenar: 0.95, Interossei: 0.4, Pronator: 0.05, Supinator: 0.6, EDC: 0.1 }, lever: -0.7 },
  release: { fingers: add(BASE, { index: [-4, -6, -4], middle: [-4, -6, -4], ring: [-4, -6, -4], little: [-4, -6, -4] }), thumb: [16, 12, 8, 6],
    force: { thumb: 0.05, index: 0.05, middle: 0.05, ring: 0.05, little: 0.05 }, mus: { FDP: 0.05, Thenar: 0.05, Interossei: 0.05, Pronator: 0.05, Supinator: 0.05, EDC: 0.4 } },
};
const HIT = { fhSqueeze: 1, drIndex: 1, bhPush: -1, drThumb: -1, netRoll: 1 }; // 擊球方向：+1 正手（掌心方向）、−1 反手
function resolve(k) {
  const p = POSES[k.pose] || POSES.relaxed;
  return { fingers: p.fingers, thumb: p.thumb, force: p.force, mus: p.mus, pron: k.pron || 0, roll: k.roll || 0, couple: k.couple || 0, elbow: k.elbow || 0, lever: p.lever || 0 };
}
function mix(a, b, u) {
  const o = { fingers: {}, force: {}, mus: {} };
  for (const f in a.fingers) o.fingers[f] = a.fingers[f].map((v, i) => lerp(v, b.fingers[f][i], u));
  o.thumb = a.thumb.map((v, i) => lerp(v, b.thumb[i], u));
  for (const f of F) o.force[f] = lerp(a.force[f], b.force[f], u);
  for (const m of MUS) o.mus[m] = lerp(a.mus[m], b.mus[m], u);
  for (const k of ['pron', 'roll', 'couple', 'elbow', 'lever']) o[k] = lerp(a[k], b[k], u);
  return o;
}

// ---------- 5 頁劇本（關鍵影格：秒，1.0x） ----------
const STEPS = [
  { title: '輕輕握拍', en: 'Relaxed Grip', view: 'palm', cmp: 'face', keys: [{ t: 0, pose: 'relaxed' }, { t: 2.4, pose: 'relaxed' }],
    hl: ['輕輕握拍', '拿筷子', '手心留一點空間', '握得很輕', '很短的時間', '拍面朝向'], research: '研究：高手只在擊球前短時間用力，平時握得很輕（Liu 等，2026）', gap: true, fulcrum: true, contact: 'fh' },
  { title: '正手發力', en: 'Forehand Squeeze', view: 'palm', contact: 'fh', cmp: 'ghost', cmpTitle: '比一比：手指有沒有用力',
    keys: [{ t: 0, pose: 'relaxed', pron: -10, elbow: 15 }, { t: 0.9, pose: 'relaxed', pron: -10, elbow: 15 }, { t: 1.12, pose: 'fhSqueeze', pron: 45, elbow: -15, snap: true }, { t: 1.5, pose: 'fhSqueeze', pron: 45, elbow: -15 }, { t: 1.9, pose: 'relaxed', pron: 0 }, { t: 2.6, pose: 'relaxed', pron: -10, elbow: 15 }],
    hl: ['一瞬間', '一起握緊', '手肘微微打直', '向內轉', '甩鞭子', '中指指尖', '二十到三十毫秒', '更快更遠'], research: '研究：手指最用力在中指指尖，出現在觸球前約 20–30 毫秒（Pan、Kao 與 Tsai，2024）' },
  { title: '反手大拇指推', en: 'Backhand Thumb Push', view: 'palm', contact: 'bh', cmp: 'ghost', cmpTitle: '比一比：大拇指有沒有推',
    keys: [{ t: 0, pose: 'relaxed' }, { t: 0.7, pose: 'bhReady', pron: 10, elbow: 10 }, { t: 1.2, pose: 'bhReady', pron: 10, elbow: 10 }, { t: 1.4, pose: 'bhPush', pron: -30, couple: 1, elbow: -15, snap: true }, { t: 1.8, pose: 'bhPush', pron: -30, couple: 1, elbow: -15 }, { t: 2.3, pose: 'bhReady', pron: 0 }, { t: 2.9, pose: 'bhReady', pron: 10 }],
    hl: ['一號面', '八號面', '往前推', '一起握緊', '向外轉', '轉得更快', '更遠'], research: '教學觀察：大拇指頂推能增加反手挑球、平抽的力量（Badminton Insight）' },
  { title: '網前轉拍', en: 'Net Finger Rolling', view: 'palm', contact: 'net', cmp: 'dir',
    keys: [{ t: 0, pose: 'relaxed', roll: 0 }, { t: 0.6, pose: 'netRoll', roll: 0 }, { t: 1.3, pose: 'netRoll', roll: 15, snap: true }, { t: 2.0, pose: 'netRoll', roll: -15, snap: true }, { t: 2.6, pose: 'netRoll', roll: 0 }],
    hl: ['放鬆', '轉筆', '拍面角度', '更小', '更短', '方向就不一樣'], research: '研究：放網前小球時，高手握力比初學者更小、時間更短（Liu 等，2026）' },
  { title: '快速平抽', en: 'Fast Drive', view: 'palm', contact: 'fh', cmp: 'ghost', cmpTitle: '比一比：手指有沒有用力',
    keys: [{ t: 0, pose: 'release' }, { t: 0.35, pose: 'release' }, { t: 0.45, pose: 'drIndex', pron: 25, elbow: -8, snap: true }, { t: 0.55, pose: 'release', pron: 5 }, { t: 1.05, pose: 'release', pron: 5 },
      { t: 1.15, pose: 'drThumb', pron: -25, couple: 1, elbow: -8, snap: true }, { t: 1.25, pose: 'release', pron: -5 }, { t: 1.75, pose: 'release', pron: -5 }, { t: 1.85, pose: 'drIndex', pron: 25, elbow: -8, snap: true }, { t: 1.95, pose: 'release', pron: 5 }, { t: 2.5, pose: 'release' }],
    hl: ['食指壓', '大拇指推', '快速切換', '馬上放鬆', '零點四秒', '一點二秒', '要短、要準'], research: '研究：殺球最大握力相近，但用力時間高手約 0.41 秒、初學者約 1.25 秒（Liu 等，2026）' },
];

// ---------- 聲音（Web Audio 即時生成） ----------
class Sound {
  constructor() { this.ctx = null; this.vol = 0.5; this.muted = false; this.duck = 1; }
  init() {
    if (this.ctx) return;
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.out = c.createGain(); this.out.connect(c.destination);
    this.bgm = c.createGain(); this.bgm.connect(this.out); this.fx = c.createGain(); this.fx.connect(this.out);
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 1600; this.lp.connect(this.bgm);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.next = c.currentTime + 0.1; this.beat = 0; this.apply();
    setInterval(() => this.sched(), 30);
  }
  apply() { if (!this.ctx) return; const t = this.ctx.currentTime; this.bgm.gain.setTargetAtTime(this.muted ? 0 : this.vol * 0.5 * this.duck, t, 0.25); this.fx.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.02); }
  midi(n) { return 440 * 2 ** ((n - 69) / 12); }
  sched() { // 92 BPM：柔和和弦墊＋科技感脈衝
    const c = this.ctx, spb = 60 / 92 / 2, chords = [[57, 64, 67, 72], [53, 60, 64, 69], [48, 55, 60, 64], [55, 62, 67, 71]];
    while (this.next < c.currentTime + 0.15) {
      const t = this.next, b = this.beat;
      if (b % 16 === 0) for (const n of chords[(b / 16) % 4]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = this.midi(n - 12);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.8); g.gain.linearRampToValueAtTime(0, t + spb * 16 + 0.3); o.connect(g).connect(this.lp); o.start(t); o.stop(t + spb * 16 + 0.4); }
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = this.midi((b % 4 === 0 ? 45 : 57) + (b % 8 === 6 ? 7 : 0));
      g.gain.setValueAtTime(b % 4 === 0 ? 0.12 : 0.04, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g).connect(this.bgm); o.start(t); o.stop(t + 0.2);
      if (b % 2 === 1) { const s = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain(); s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 8000;
        gn.gain.setValueAtTime(0.03, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.04); s.connect(f).connect(gn).connect(this.bgm); s.start(t, Math.random() * 0.5, 0.05); }
      this.beat++; this.next += spb;
    }
  }
  snap() { // 發力峰值：清脆擊發＋球拍破風
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + 0.005;
    const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(700, t - 0.002); bp.frequency.exponentialRampToValueAtTime(4200, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.09); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    s.connect(bp).connect(g).connect(this.fx); s.start(t, 0, 0.25);
    const o = c.createOscillator(), go = c.createGain(); o.type = 'square'; o.frequency.setValueAtTime(2600, t + 0.1); o.frequency.exponentialRampToValueAtTime(1100, t + 0.16);
    go.gain.setValueAtTime(0.0001, t); go.gain.setValueAtTime(0.16, t + 0.1); go.gain.exponentialRampToValueAtTime(0.001, t + 0.19); o.connect(go).connect(this.fx); o.start(t); o.stop(t + 0.2);
    const k = c.createOscillator(), gk = c.createGain(); k.frequency.setValueAtTime(180, t + 0.1); k.frequency.exponentialRampToValueAtTime(55, t + 0.2);
    gk.gain.setValueAtTime(0.0001, t); gk.gain.setValueAtTime(0.3, t + 0.1); gk.gain.exponentialRampToValueAtTime(0.001, t + 0.22); k.connect(gk).connect(this.fx); k.start(t); k.stop(t + 0.24);
  }
  victory() {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + 0.05;
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = this.midi(n); const t = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1); o.connect(g).connect(this.fx); o.start(t); o.stop(t + 1.1); });
    [48, 60, 64, 67, 72].forEach((n) => { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = this.midi(n); f.type = 'lowpass'; f.frequency.value = 2400;
      const t = t0 + 0.65; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4); o.connect(f).connect(g).connect(this.fx); o.start(t); o.stop(t + 2.5); });
  }
}

// ---------- 彩帶 ----------
function confetti(cv) {
  const ctx = cv.getContext('2d'), W = (cv.width = cv.clientWidth), H = (cv.height = cv.clientHeight);
  const cols = ['#38bdf8', '#ff3b30', '#34d399', '#E8B04B', '#a78bfa', '#f472b6'];
  const ps = Array.from({ length: 280 }, () => ({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.62, vx: (Math.random() - 0.5) * 17, vy: -Math.random() * 19 - 8, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * 6) | 0] }));
  let n = 0;
  (function tick() { ctx.clearRect(0, 0, W, H); for (const p of ps) { p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
    if (++n < 280) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H); })();
}

// ---------- 主程式 ----------
(async function main() {
  try { await document.fonts.load('600 40px "Barlow Condensed"'); await document.fonts.load('700 40px "Noto Sans TC"'); } catch (e) { /* 離線時使用系統字型 */ }
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 600);
  scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x0b1220, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(40, 60, 50); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7dd3fc, 0.7); rim.position.set(-40, 10, -50); scene.add(rim);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  // WebXR：支援的頭戴裝置（例如 Quest 瀏覽器）才顯示「進入 VR」
  renderer.xr.enabled = true;
  if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (!ok) return; const b = VRButton.createButton(renderer); b.id = 'vrBtn'; b.removeAttribute('style'); document.getElementById('stage').append(b); }).catch(() => {});

  const M = await loadMyoSim('assets/');
  scene.add(M.root);
  // 隱藏肱骨大部分，只留肘部參考
  // 手肘：上臂骨完整顯示，並加上「手肘」標籤
  const tagSprite = (text, color = '#E8B04B') => { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, 256, 96); g.fillStyle = color; g.font = '700 54px "Noto Sans TC", "PingFang TC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); sp.scale.set(0.08, 0.03, 1); sp.renderOrder = 10; return sp; };
  const elbowTag = tagSprite('手肘'); elbowTag.scale.multiplyScalar(100); scene.add(elbowTag); // 每幀放在肘關節上方
  M.setJoint('elbow_flexion', 90 * D2R);

  const J = (k, deg) => M.setJoint(k, deg * D2R);
  const W = (n) => M.bodies[n].inner.getWorldPosition(new THREE.Vector3());
  const CH = { index: ['2proxph_r', 'midph2_r', 'distph2_r'], middle: ['3proxph_r', 'midph3_r', 'distph3_r'], ring: ['4proxph_r', 'midph4_r', 'distph4_r'], little: ['5proxph_r', 'midph5_r', 'distph5_r'], thumb: ['firstmc_r', 'proximal_thumb_r', 'distal_thumb_r'] };
  // 指尖：遠端指骨上離關節最遠的頂點（自身座標）
  const tipLocal = {};
  for (const f of F) {
    const b = M.bodies[CH[f][2]], g = b.meshes[0], pos = g.geometry.attributes.position, v = new THREE.Vector3(); let best = null, bd = -1;
    for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(g.matrix); const d = v.length(); if (d > bd) { bd = d; best = v.clone(); } }
    tipLocal[f] = best;
  }
  const tipW = (f, out = new THREE.Vector3()) => M.bodies[CH[f][2]].inner.localToWorld(out.copy(tipLocal[f]));

  // 方向自動校正
  M.updateBodies();
  const palmDir = () => { const t0 = tipW('middle'); J('mcp3_flexion', 60); M.updateBodies(); const t1 = tipW('middle'); J('mcp3_flexion', 0); M.updateBodies(); return t1.sub(t0).normalize(); };
  const N0 = palmDir();
  J('pro_sup', 30); M.updateBodies(); const N1 = palmDir(); J('pro_sup', 0); M.updateBodies();
  const PRON = N1.y < N0.y ? 1 : -1; // 內旋：掌心轉向下方
  const d0 = tipW('thumb').distanceTo(W('5proxph_r')); J('cmc_flexion', 20); M.updateBodies(); const d1 = tipW('thumb').distanceTo(W('5proxph_r')); J('cmc_flexion', 0);
  const TH = d1 < d0 ? 1 : -1; // 拇指屈曲方向
  const abd0 = tipW('thumb').distanceTo(W('2proxph_r')); J('cmc_abduction', 20); M.updateBodies(); const abd1 = tipW('thumb').distanceTo(W('2proxph_r')); J('cmc_abduction', 0);
  const TA = abd1 > abd0 ? 1 : -1; // 外展：離開食指

  const debug = { on: false, vals: {} };
  function applyPose(s) {
    for (const f in FN) { const n = FN[f], a = s.fingers[f]; J(`mcp${n}_flexion`, a[0]); J(`pm${n}_flexion`, a[1]); J(`md${n}_flexion`, a[2]); }
    J('cmc_flexion', TH * s.thumb[0]); J('cmc_abduction', TA * s.thumb[1]); J('mp_flexion', TH * s.thumb[2]); J('ip_flexion', TH * s.thumb[3]);
    J('pro_sup', PRON * s.pron);
    J('elbow_flexion', 90 + (s.elbow || 0)); // 手肘：90° 為基準，負值＝伸直
    if (debug.on) for (const k in debug.vals) J(k, debug.vals[k]);
    M.updateBodies();
  }

  // ---------- 拍柄：依放鬆握拍時食指與小指的「指環」中心放置 ----------
  applyPose(resolve({ pose: 'relaxed' }));
  const handB = M.bodies.capitate_r.inner;
  const toHand = (v) => handB.worldToLocal(v.clone());
  const loop = (f) => [W(CH[f][0]), W(CH[f][1]), W(CH[f][2]), tipW(f)].reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(0.25);
  const cI = toHand(loop('index')), cL = toHand(loop('little'));
  const axisH = cI.clone().sub(cL).normalize();
  const palmH = toHand(W('capitate_r').add(N0)).sub(toHand(W('capitate_r'))).normalize(); // 掌心法向（手座標）
  const mcpMid = toHand(W('2proxph_r')).lerp(toHand(W('5proxph_r')), 0.5);
  const centerH = cI.clone().lerp(cL, 0.5).lerp(mcpMid, 0.3); // 由指環中心往掌指關節靠 30%
  const R = 1.45 / 100; // 拍柄外接半徑 1.45 cm（hand 座標單位為公尺）
  const grip = new THREE.Group(); grip.position.copy(centerH);
  // 握把座標：Y＝拍柄軸（指向拍頭），Z＝背離掌心（1 號寬面方向）
  const gy = axisH.clone(), gz = palmH.clone().negate().addScaledVector(gy, palmH.dot(gy)).normalize(), gx = new THREE.Vector3().crossVectors(gy, gz);
  grip.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(gx, gy, gz));
  handB.add(grip);
  // 手指收緊時，拍柄繞「拇指＋食指 V 字」支點轉動（槓桿），讓拍頭多加速
  const PIVOT_Y = 0.035, LEVER_MAX = 28; // 加大手指槓桿，讓「有用／沒用手指」差別看得出來
  const leverP = new THREE.Group(); leverP.position.y = PIVOT_Y; grip.add(leverP);
  const leverG = new THREE.Group(); leverP.add(leverG);
  const leverO = new THREE.Group(); leverO.position.y = -PIVOT_Y; leverG.add(leverO);
  const rollG = new THREE.Group(); leverO.add(rollG); // 捻動時繞軸轉
  const ap = R * Math.cos(Math.PI / 8), fw = 2 * R * Math.sin(Math.PI / 8), L = 0.2;
  const faces = [];
  const faceAngle = (k) => (k - 1) * 45; // 1 號＝+Z（拇指側寬面），依序環繞
  for (let k = 1; k <= 8; k++) {
    const a = faceAngle(k) * D2R, n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(fw * 1.01, L), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false }));
    m.position.copy(n.clone().multiplyScalar(ap)); m.position.y = 0.04; m.rotation.y = a; rollG.add(m);
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = k === 1 || k === 8 ? '#E8B04B' : '#e2e8f0'; g.font = '600 92px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k, 64, 70);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); sp.scale.setScalar(0.011); sp.renderOrder = 9;
    sp.position.copy(n.clone().multiplyScalar(ap + 0.007)); sp.position.y = -0.062; rollG.add(sp);
    faces.push({ k, mesh: m, a: faceAngle(k) });
  }
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.006, 8), new THREE.MeshStandardMaterial({ color: 0xff3b30 })); butt.rotation.y = Math.PI / 8; butt.position.y = -0.063; rollG.add(butt);
  function buildHead(parent, ghost) { // 拍桿＋拍框＋拍面＋拍線
    const op = ghost ? 0.42 : 1;
    const mat = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4, transparent: ghost, opacity: op, depthWrite: !ghost });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0033, 0.004, 0.24, 12), mat(ghost ? 0x64748b : 0xcbd5e1)); shaft.position.y = 0.26; parent.add(shaft);
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.0045, 10, 64), mat(ghost ? 0x64748b : 0x2f7df6)); head.scale.set(1, 1.3, 1); head.position.y = 0.52; parent.add(head);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.106, 48), new THREE.MeshBasicMaterial({ color: ghost ? 0x64748b : 0x3d8bff, transparent: true, opacity: ghost ? 0.05 : 0.14, side: THREE.DoubleSide, depthWrite: false }));
    face.scale.set(1, 1.3, 1); face.position.y = 0.52; parent.add(face);
    const pts = [], rx = 0.104, ry = 0.135;
    for (let x = -rx + 0.012; x < rx; x += 0.012) { const h = ry * Math.sqrt(1 - (x / rx) ** 2); pts.push(x, 0.52 - h, 0, x, 0.52 + h, 0); }
    for (let y = -ry + 0.012; y < ry; y += 0.012) { const w = rx * Math.sqrt(1 - (y / ry) ** 2); pts.push(-w, 0.52 + y, 0, w, 0.52 + y, 0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    parent.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: ghost ? 0x64748b : 0xe2e8f0, transparent: true, opacity: ghost ? 0.22 : 0.5 })));
    for (const o of [head, face]) o.layers.set(1); parent.children[parent.children.length - 1].layers.set(1); // 拍框、拍面、拍線只在右畫面
    return { head, face };
  }
  const realHead = buildHead(rollG, false);
  const ghostRoll = new THREE.Group(); grip.add(ghostRoll); // 幽靈球拍：同樣的手臂動作，但沒有手指槓桿
  const ghostHead = buildHead(ghostRoll, true); ghostRoll.visible = false;
  grip.position.addScaledVector(gy, 0.01); // 拍底略超出小指
  { // 1 號寬面＝反手拇指指腹所在的寬面：若拇指在 −Z 側就翻轉握把座標
    applyPose(resolve({ pose: 'bhPush' })); M.root.updateMatrixWorld(true);
    const t = grip.worldToLocal(M.bodies.distal_thumb_r.inner.localToWorld(tipLocal.thumb.clone()));
    if (t.z < 0) { grip.rotateY(Math.PI); }
    applyPose(resolve({ pose: 'relaxed' })); M.root.updateMatrixWorld(true);
  }

  // ---------- 拇指逆向運動學：讓拇指指腹精準落在指定稜面 ----------
  const thumbPadW = () => { const b = M.bodies.distal_thumb_r.inner; return b.getWorldPosition(new THREE.Vector3()).lerp(tipW('thumb'), 0.68); };
  const rng = ['cmc_flexion', 'cmc_abduction', 'mp_flexion', 'ip_flexion'].map((k) => M.joints[k].range.map((r) => r / D2R));
  function solveThumb(faceK, soft, axial) {
    const a = faceAngle(faceK) * D2R, n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const base = resolve({ pose: 'relaxed' });
    const cost = (th) => {
      applyPose({ ...base, thumb: th }); M.root.updateMatrixWorld(true);
      const p = rollG.worldToLocal(thumbPadW());
      const tgt = n.clone().multiplyScalar(ap + soft); tgt.y = axial ?? p.y; // 沿拍柄方向保留拇指自然位置
      return p.distanceTo(tgt) * 100 + 0.002 * th.reduce((s2, v) => s2 + v * v, 0);
    };
    let th = [...POSES.relaxed.thumb], c = cost(th);
    for (let step = 12; step > 0.4; step *= 0.6) {
      let moved = true;
      while (moved) { moved = false;
        for (let i = 0; i < 4; i++) for (const d of [step, -step]) {
          const t2 = [...th]; t2[i] = clamp(t2[i] + d, ...(i === 1 ? [TA > 0 ? rng[1][0] : -rng[1][1], TA > 0 ? rng[1][1] : -rng[1][0]] : [TH > 0 ? rng[i][0] : -rng[i][1], TH > 0 ? rng[i][1] : -rng[i][0]]));
          const c2 = cost(t2); if (c2 < c - 1e-4) { th = t2; c = c2; moved = true; }
        }
      }
    }
    return { th: th.map((v) => +v.toFixed(1)), err: c };
  }
  {
    const pushT = solveThumb(8, 0.006);           // 反手頂推：指腹壓在 8 號斜稜
    const readyT = solveThumb(8, 0.011, undefined); // 準備：貼近但未加壓
    const netT = solveThumb(1, 0.007);            // 網前：拇指在 1 號寬面
    POSES.bhPush.thumb = pushT.th; POSES.drThumb.thumb = pushT.th; POSES.bhReady.thumb = readyT.th; POSES.netRoll.thumb = netT.th;
    window.__ik = { pushT, readyT, netT };
    applyPose(resolve({ pose: 'relaxed' })); M.root.updateMatrixWorld(true);
  }

  let LEVER_SIGN = 1;
  { // 正值槓桿＝拍頭往掌心方向（正手擊球方向）移動
    M.root.updateMatrixWorld(true); const h0 = realHead.head.getWorldPosition(new THREE.Vector3());
    leverG.rotation.x = 0.2; M.root.updateMatrixWorld(true); const h1 = realHead.head.getWorldPosition(new THREE.Vector3());
    leverG.rotation.x = 0; M.root.updateMatrixWorld(true);
    LEVER_SIGN = h1.sub(h0).dot(new THREE.Vector3().copy(palmH).transformDirection(handB.matrixWorld)) > 0 ? 1 : -1;
  }

  // 掌心空隙標示（約 1 cm）
  const gapRing = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0008, 8, 40), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0, depthTest: false }));
  gapRing.position.copy(centerH.clone().addScaledVector(palmH, -0.012)); gapRing.lookAt(gapRing.position.clone().add(palmH)); handB.add(gapRing);
  // 食指 MCP 支點標示
  const fulcrum = new THREE.Mesh(new THREE.SphereGeometry(0.005, 20, 14), new THREE.MeshBasicMaterial({ color: 0xe8b04b, transparent: true, opacity: 0, depthTest: false }));
  M.bodies['2proxph_r'].inner.add(fulcrum);

  // ---------- 6 條程序化肌肉／肌腱（站點取自 MyoSim） ----------
  const FORE = new Set(['humerus_r', 'ulna_r', 'radius_r']);
  const COOL = new THREE.Color('#4CC9F0'), HOT = new THREE.Color('#FF4D3D'), WARM = new THREE.Color('#FF8A3D'), IVORY = new THREE.Color(0xe8e2d4);
  const muscles = [];
  for (const g of MUS) for (const t of M.data.tendons[g]) {
    const belly = t.path.filter((p) => FORE.has(p.body)), rest = t.path.filter((p) => !FORE.has(p.body));
    const parts = g === 'Thenar' || g === 'Interossei' ? [{ pts: t.path, r: 0.0042, bulge: true }] :
      [{ pts: belly.length ? [...belly, ...rest.slice(0, 1)] : [], r: g === 'FDP' || g === 'EDC' ? 0.0026 : 0.0042 }, { pts: belly.length ? [belly[belly.length - 1], ...rest] : rest, r: 0.0009 }];
    for (const p of parts) if (p.pts.length >= 2) {
      const mat = new THREE.MeshStandardMaterial({ color: COOL, transparent: true, opacity: 0.4, roughness: 0.35, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.renderOrder = 4; M.root.add(mesh);
      muscles.push({ g, ...p, mat, mesh });
    }
  }
  let showMus = true;
  const inv = new THREE.Matrix4();
  function updateMuscles(mus) {
    inv.copy(M.root.matrixWorld).invert();
    for (const m of muscles) {
      m.mesh.visible = showMus; if (!showMus) continue;
      const a = mus[m.g];
      let pts = m.pts.map((p) => M.siteWorld(p.body, p.pos).applyMatrix4(inv));
      if (m.bulge && pts.length >= 2) { const mid = pts[0].clone().lerp(pts[pts.length - 1], 0.5).addScaledVector(curN(), -0.4 / 100); pts = [pts[0], mid, ...pts.slice(1)]; }
      m.mesh.geometry.dispose();
      m.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 6), m.r * (1 + 0.35 * a), 10, false);
      m.mat.color.copy(COOL).lerp(a > 0.9 ? HOT : WARM, clamp((a - 0.1) / 0.85));
      m.mat.emissive.copy(HOT).multiplyScalar(clamp(a - 0.3) * 0.7);
      m.mat.opacity = 0.32 + 0.6 * a;
    }
  }

  // ---------- 指腹壓力標記與力量向量 ----------
  const pads = {}, arrows = {};
  for (const f of F) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 16, 12), new THREE.MeshStandardMaterial({ color: COOL, transparent: true, opacity: 0.85 }));
    scene.add(s); pads[f] = s;
    const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 3, 0xff3b30, 1.1, 0.7); a.visible = false; scene.add(a); arrows[f] = a;
  }
  const counter = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 3, 0x38bdf8, 1.1, 0.7); counter.visible = false; scene.add(counter);
  const rollArrows = [0, 1].map(() => { const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 2.4, 0xff7a1a, 0.9, 0.6); a.visible = false; scene.add(a); return a; });
  const padPos = (f) => { const b = M.bodies[CH[f][2]].inner; const tip = tipW(f), base = b.getWorldPosition(new THREE.Vector3()); return base.lerp(tip, 0.62).addScaledVector(curN(), 0.35); };
  const curN = () => new THREE.Vector3().copy(palmH).transformDirection(handB.matrixWorld); // 目前掌心法向（世界）
  const axisLine = new THREE.Line3();
  const gripAxisW = () => { const a = grip.localToWorld(new THREE.Vector3(0, -0.08, 0)), b = grip.localToWorld(new THREE.Vector3(0, 0.12, 0)); return axisLine.set(a, b); };
  const faceOf = (p) => { // 世界座標點 → 最近的稜面編號（依握把局部角度）
    const l = rollG.worldToLocal(p.clone()); let ang = Math.atan2(l.x, l.z) / D2R; ang = (ang + 360) % 360; return (Math.round(ang / 45) % 8) + 1;
  };

  // ---------- 右畫面：拍面與羽球 ----------
  const rightCam = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  const headW = (h = realHead) => h.head.getWorldPosition(new THREE.Vector3());
  const faceNW = (h = realHead) => new THREE.Vector3(0, 0, 1).transformDirection(h.face.matrixWorld);
  const hitDirW = (type, h = realHead) => { const n = faceNW(h); return n.multiplyScalar(Math.sign(n.dot(curN())) * type || 1); };
  const faceArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 22, 0xe8b04b, 5, 3.2); scene.add(faceArrow);
  const label = (text, color, w = 14) => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.65)'; g.beginPath(); g.roundRect(4, 14, 504, 100, 24); g.fill(); g.fillStyle = color; g.font = '700 62px "Noto Sans TC", "PingFang TC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); sp.scale.set(w, w / 4, 1); sp.renderOrder = 12; scene.add(sp); return sp; };
  const tagFace = label('拍面朝向', '#E8B04B', 24), tagReal = label('手指有用力', '#6AA8FF', 26), tagGhost = label('手指沒用力', '#94a3b8', 26);
  rightCam.layers.enable(1); for (const o of [faceArrow, tagFace, tagReal, tagGhost]) o.traverse((c) => c.layers.set(1)); // 只在右畫面顯示
  function makeShuttle(color, ghost) {
    const g = new THREE.Group();
    const cork = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), new THREE.MeshStandardMaterial({ color: ghost ? 0x64748b : 0xffffff, transparent: ghost, opacity: ghost ? 0.55 : 1 }));
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 3.3, 6.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: ghost ? 0x64748b : 0xf8fafc, transparent: true, opacity: ghost ? 0.3 : 0.8, side: THREE.DoubleSide, depthWrite: false }));
    skirt.position.y = -3.6; g.add(cork, skirt); g.visible = false; scene.add(g);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 3), 3)); tg.setDrawRange(0, 0);
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: ghost ? 0.6 : 0.95 })); trail.frustumCulled = false; trail.layers.set(1); scene.add(trail);
    return { g, trail, n: 0, ghost };
  }
  const TRAIL = ['#E8B04B', '#4CC9F0', '#E8B04B'];
  const pool = [0, 1, 2].map((i) => ({ real: makeShuttle(TRAIL[i], false), ghost: makeShuttle('#94a3b8', true) }));
  const shots = {}; // 依關鍵影格編號記錄每一球
  const endReal = label('有用手指', '#6AA8FF', 22), endGhost = label('沒用手指', '#94a3b8', 22);
  let endDiff = label('遠 +0%', '#E8B04B', 20), endDiffText = '';
  const gapLineG = new THREE.BufferGeometry(); gapLineG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const gapLine = new THREE.Line(gapLineG, new THREE.LineDashedMaterial({ color: 0xe8b04b, dashSize: 3, gapSize: 2 })); gapLine.frustumCulled = false; scene.add(gapLine);
  for (const o of [endReal, endGhost, endDiff, gapLine]) o.layers.set(1);
  const hideEnds = () => { endReal.visible = endGhost.visible = endDiff.visible = gapLine.visible = false; };
  hideEnds();
  const VIN = 120, GRAV = new THREE.Vector3(0, -45, 0), DRAG = 1.1, UP = new THREE.Vector3(0, 1, 0);
  const ballAt = (P0, v0, tau) => P0.clone().addScaledVector(v0, (1 - Math.exp(-DRAG * tau)) / DRAG).addScaledVector(GRAV, 0.5 * tau * tau);
  function orient(obj, dir) { obj.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); }
  function pushTrail(sh, p) { const a = sh.trail.geometry.attributes.position; if (sh.n >= 120) return; a.setXYZ(sh.n++, p.x, p.y, p.z); a.needsUpdate = true; sh.trail.geometry.setDrawRange(0, sh.n); }
  function resetShots() { hideEnds?.(); endDiffText = ''; for (const k in shots) delete shots[k]; for (const p of pool) for (const sh of [p.real, p.ghost]) { sh.n = 0; sh.trail.geometry.setDrawRange(0, 0); sh.g.visible = false; } }
  const speedHist = { real: [], ghost: [] }, lastHead = { real: null, ghost: null };
  let cmpVals = null;
  function frameRight(st) { // 右相機：垂直於「拍桿＋擊球方向」平面，拍頭與球路同時入鏡
    M.root.updateMatrixWorld(true);
    const H = headW(), S = new THREE.Vector3(0, 1, 0).transformDirection(rollG.matrixWorld), type = st.contact === 'bh' ? -1 : 1, n = hitDirW(type);
    let side = new THREE.Vector3().crossVectors(S, n).normalize(); if (side.y < -0.2) side.negate();
    side.multiplyScalar(0.72).addScaledVector(n, -0.6).add(new THREE.Vector3(0, 0.22, 0)).normalize(); // 3/4 視角：看得到拍面
    const G = grip.getWorldPosition(new THREE.Vector3()), far = H.clone().addScaledVector(n, 95);
    const tgt = H.clone().multiplyScalar(2).add(far).add(G).multiplyScalar(1 / 4);
    const ext = Math.max(H.distanceTo(far), H.distanceTo(G), far.distanceTo(G));
    rightCam.position.copy(tgt).addScaledVector(side, ext * 2.25).add(new THREE.Vector3(0, ext * 0.25, 0));
    rightCam.lookAt(tgt.clone().add(new THREE.Vector3(0, -ext * 0.2, 0))); // 物件在畫面偏上，避開下方字幕
  }

  // ---------- 視角 ----------
  const focusW = () => grip.localToWorld(new THREE.Vector3(0, 0.0, 0));
  let camTween = null, curView = 'palm';
  function focusFor(v) { // 鏡頭中心：手指特寫以拍柄為中心；全手臂視角往手肘靠
    const g0 = focusW(); return v === 'arm' ? g0.lerp(W('ulna_r'), 0.45) : v === 'butt' ? g0 : g0.lerp(W('ulna_r'), 0.1);
  }
  function setView(v, instant) {
    curView = v; M.root.updateMatrixWorld(true);
    const g0 = focusW(), n = curN(), ax = new THREE.Vector3(0, 1, 0).transformDirection(grip.matrixWorld);
    const c = focusFor(v);
    let to;
    // n＝掌心法向（由掌心指向拍柄）；掌心視角從拍柄外側看向掌心
    if (v === 'palm') to = c.clone().addScaledVector(n, 70).add(new THREE.Vector3(0, 10, 0)); // 3D 為主角：鏡頭拉近
    else if (v === 'arm') to = c.clone().addScaledVector(n, 92).add(new THREE.Vector3(0, 18, 0));
    else if (v === 'dorsal') to = c.clone().addScaledVector(n, -66).add(new THREE.Vector3(0, 10, 0));
    else to = c.clone().addScaledVector(ax, -40).addScaledVector(n, 6);
    if (portrait) to.sub(c).multiplyScalar(1.25).add(c); // 手機直向畫面較窄，鏡頭拉遠
    camTween = { from: camera.position.clone(), to, tf: controls.target.clone(), tt: c, t: instant ? 1 : 0 };
    if (instant) { camera.position.copy(to); controls.target.copy(c); camTween = null; }
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  }

  // ---------- 開發者關節微調 ----------
  const DBG = ['elbow_flexion', 'pro_sup', 'flexion', 'deviation', 'cmc_flexion', 'cmc_abduction', 'mp_flexion', 'ip_flexion', ...[2, 3, 4, 5].flatMap((n) => [`mcp${n}_flexion`, `pm${n}_flexion`, `md${n}_flexion`])];
  $('dbgList').innerHTML = DBG.map((k) => { const j = M.joints[k]; return `<label>${k}<input type="range" data-j="${k}" min="${(j.range[0] / D2R).toFixed(0)}" max="${(j.range[1] / D2R).toFixed(0)}" step="1" value="0"><em id="dv_${k}">0°</em></label>`; }).join('');
  $('dbgOn').onchange = (e) => { debug.on = e.target.checked; if (debug.on) DBG.forEach((k) => { const v = M.joints[k].q; debug.vals[k] = v; const el = document.querySelector(`[data-j="${k}"]`); el.value = (v / D2R).toFixed(0); $(`dv_${k}`).textContent = `${el.value}°`; }); };
  document.querySelectorAll('[data-j]').forEach((el) => (el.oninput = () => { debug.vals[el.dataset.j] = +el.value * D2R; $(`dv_${el.dataset.j}`).textContent = `${el.value}°`; if (!debug.on) { $('dbgOn').checked = true; $('dbgOn').onchange({ target: { checked: true } }); } }));
  $('dbgBtn').onclick = () => $('dbg').classList.toggle('show');

  // ---------- 18 區握壓熱力圖＋八角截面（SVG） ----------
  const heat = (v) => { const s = [[56, 189, 248], [52, 211, 153], [251, 191, 36], [255, 59, 48]]; const x = clamp(v) * 3, i = Math.min(2, Math.floor(x)), u = x - i; return `rgb(${s[i].map((c, k) => Math.round(lerp(c, s[i + 1][k], u))).join(',')})`; };
  function regions(s, step) { // 18 區（參考 Pan 2024 的手掌分區）
    const f = s.force, r = {};
    r[1] = f.thumb; r[2] = f.thumb * 0.6;
    ['index', 'middle', 'ring', 'little'].forEach((k, i) => { r[3 + i * 3] = f[k]; r[4 + i * 3] = f[k] * 0.7; r[5 + i * 3] = f[k] * 0.5; });
    r[15] = Math.max(f.index * (step.fulcrum || step.contact === 'fh' ? 0.9 : 0.5), 0.1); r[16] = (f.middle + f.ring + f.little) / 3 * 0.45; r[17] = f.thumb * 0.5; r[18] = (f.ring + f.little) / 2 * 0.5;
    if (step.gap) r[16] = Math.min(r[16], 0.08); // 掌心空隙
    return r;
  }
  function panelSVG(s, step) {
    const r = regions(s, step);
    const fing = [['little', 95, [30, 20, 18], 12], ['ring', 130, [38, 25, 20], 9], ['middle', 165, [42, 27, 21], 6], ['index', 200, [38, 24, 20], 3]];
    let hand = `<rect x="78" y="150" width="150" height="120" rx="26" fill="#0f172a" stroke="#475569"/>`;
    hand += `<rect x="190" y="152" width="34" height="56" rx="8" fill="${heat(r[15])}" stroke="#0b1220"/><text x="207" y="185" class="rn">15</text>`;
    hand += `<rect x="100" y="152" width="86" height="56" rx="8" fill="${heat(r[16])}" stroke="#0b1220"/><text x="143" y="185" class="rn">16</text>`;
    hand += `<rect x="168" y="212" width="58" height="56" rx="16" fill="${heat(r[17])}" stroke="#0b1220"/><text x="197" y="245" class="rn">17</text>`;
    hand += `<rect x="80" y="212" width="84" height="56" rx="16" fill="${heat(r[18])}" stroke="#0b1220"/><text x="122" y="245" class="rn">18</text>`;
    for (const [f, x, Ls, n0] of fing) { let y = 148; [0, 1, 2].forEach((i) => { const id = n0 + 2 - i, h = Ls[2 - i]; y -= h + 3; hand += `<rect x="${x - 15}" y="${y}" width="30" height="${h}" rx="8" fill="${heat(r[id])}" stroke="#0b1220"/><text x="${x}" y="${y + h / 2 + 4}" class="rn">${id}</text>`; }); }
    hand += `<g transform="rotate(-38 250 222)"><rect x="236" y="196" width="30" height="34" rx="10" fill="${heat(r[2])}" stroke="#0b1220"/><text x="251" y="217" class="rn">2</text><rect x="236" y="164" width="30" height="30" rx="10" fill="${heat(r[1])}" stroke="#0b1220"/><text x="251" y="183" class="rn">1</text></g>`;
    // 八角截面：用 3D 實際接觸計算稜面
    const C = [470, 205], RR = 72, hot = {};
    for (const f of F) { if (s.force[f] < 0.2) continue; const k = faceOf(padPos(f)); hot[k] = Math.max(hot[k] || 0, s.force[f]); }
    let oc = '';
    for (let k = 1; k <= 8; k++) {
      const a0 = (faceAngle(k) - 22.5) * D2R, a1 = (faceAngle(k) + 22.5) * D2R, P = (a) => [C[0] + RR * Math.sin(a), C[1] - RR * Math.cos(a)];
      const [p0, p1] = [P(a0), P(a1)], h = hot[k] || 0, m = P(faceAngle(k) * D2R), lab = [C[0] + (RR - 22) * Math.sin(faceAngle(k) * D2R), C[1] - (RR - 22) * Math.cos(faceAngle(k) * D2R)];
      oc += `<line x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}" stroke="${h ? heat(h) : '#475569'}" stroke-width="${h ? 9 : 4}" stroke-linecap="round"/><text x="${lab[0]}" y="${lab[1] + 6}" class="bn" fill="${h ? '#fff' : '#94a3b8'}">${k}</text>`;
      if (h) { const out = [C[0] + (RR + 14 + 40 * h) * Math.sin(faceAngle(k) * D2R), C[1] - (RR + 14 + 40 * h) * Math.cos(faceAngle(k) * D2R)]; oc += `<line x1="${out[0]}" y1="${out[1]}" x2="${m[0] + (out[0] - m[0]) * 0.18}" y2="${m[1] + (out[1] - m[1]) * 0.18}" stroke="${heat(h)}" stroke-width="${2 + 4 * h}" marker-end="url(#ah)"/>`; }
    }
    const legend = [0, 0.25, 0.5, 0.75, 1].map((v, i) => `<rect x="${60 + i * 34}" y="300" width="34" height="10" fill="${heat(v)}"/>`).join('');
    return `<svg viewBox="0 0 600 340" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff3b30"/></marker></defs>
      <text x="24" y="30" class="pt">手掌哪裡在用力</text><text x="380" y="30" class="pt">拍柄哪一面在出力</text>
      ${hand}${oc}<text x="${C[0]}" y="${C[1] + 5}" class="rn">拍柄底</text>
      ${legend}<text x="60" y="328" class="sm">低</text><text x="230" y="328" class="sm" text-anchor="end">高</text>
      <text x="380" y="318" class="sm">從拍柄底看；1 號面＝大拇指那一面</text><text x="24" y="58" class="sm">顏色越紅＝越用力（示意）</text></svg>`;
  }

  // ---------- 握壓峰值曲線 ----------
  const hist = new Array(180).fill(0);
  function sparkline() {
    const w = 260, h = 64, mx = Math.max(...hist, 0.01);
    const d = hist.map((v, i) => `${i ? 'L' : 'M'}${(i / (hist.length - 1)) * w},${h - v * h}`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d} L${w},${h} L0,${h}Z" fill="rgba(255,59,48,.18)"/><path d="${d}" fill="none" stroke="#ff3b30" stroke-width="2"/></svg>`;
  }

  // ---------- 播放控制 ----------
  const sound = new Sound(), voice = new Audio();
  const words = await Promise.all(STEPS.map((_, i) => fetch(`assets/audio/step${i + 1}.json`).then((r) => r.json())));
  let step = 0, anim = null, playing = false, speed = 1, voiceDone = true, state = resolve({ pose: 'relaxed' });
  $('dots').innerHTML = STEPS.map((s, i) => `<span>${i + 1}. ${s.title}</span>`).join('');
  $('bars').innerHTML = MUS.map((m) => `<div class="mrow"><b>${MUS_ZH[m]}<em id="mv_${m}">0%</em></b><div class="bar"><i id="mb_${m}"></i></div></div>`).join('');

  function renderSubs(t) {
    const w = words[step]; let html = '', acc = '';
    const hl = STEPS[step].hl;
    // 先標關鍵字位置
    const text = w.text, mark = new Array(text.length).fill(false);
    for (const k of hl) { let i = text.indexOf(k); while (i >= 0) { for (let j = i; j < i + k.length; j++) mark[j] = true; i = text.indexOf(k, i + 1); } }
    // 依詞時間判斷已唸到的字數
    let spoken = 0, cursor = 0;
    for (const wd of w.words) { const i = text.indexOf(wd.w, cursor); if (i < 0) continue; cursor = i + wd.w.length; if (wd.t <= t) spoken = cursor; }
    for (let i = 0; i < text.length; i++) { const cls = (i < spoken ? 'sp' : '') + (mark[i] ? ' kw' : ''); html += cls ? `<span class="${cls.trim()}">${text[i]}</span>` : text[i]; acc = ''; }
    $('subs').innerHTML = html;
  }
  function startStep(i) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    const st = STEPS[step];
    $('title').innerHTML = `<small>STEP ${step + 1} / ${STEPS.length}　${st.en}</small>${st.title}`;
    [...$('dots').children].forEach((d, k) => (d.className = k < step ? 'done' : k === step ? 'now' : ''));
    $('progress').firstElementChild.style.width = `${(step / STEPS.length) * 100}%`;
    $('finish').style.display = 'none'; $('btnNext').style.display = '';
    const keys = st.keys.map((k) => ({ ...k, s: resolve(k) }));
    anim = { keys, dur: keys[keys.length - 1].t, t: 0, fired: new Set(), loops: 0 };
    resetShots(); cmpVals = null; renderRel();
    applyPose(keys[0].s); leverG.rotation.x = 0; rollG.rotation.y = 0; M.root.updateMatrixWorld(true); setView(st.view); frameRight(st); // 以本步驟起始姿勢取景
    playing = true; voiceDone = false; $('btnNext').classList.remove('pulse');
    voice.src = `assets/audio/step${step + 1}.mp3`; voice.currentTime = 0; sound.duck = 0.4; sound.apply();
    renderSubs(0);
    voice.play().catch(() => { voiceDone = true; renderSubs(999); });
  }
  voice.onended = () => { voiceDone = true; sound.duck = 1; sound.apply(); };
  voice.onerror = () => { voiceDone = true; };
  function renderCmp(st) {
    let h = '';
    if (st.cmp === 'face') h = `<h5>拍面是什麼？</h5><p>拍面＝球拍上<b>拍線</b>的那一面。<br><b style="color:#E8B04B">黃色箭頭</b>＝拍面朝向，球會往那邊飛。</p><p class="note">手指輕輕握，拍面才能隨時調整方向。</p>`;
    else if (st.cmp === 'ghost') {
      const v = cmpVals, r = v ? v.real : 0, g = v ? v.ghost : 0, mx = Math.max(r, g, 1);
      const row = (name, val, color) => `<div class="crow"><span>${name}</span><div class="cbar"><i style="width:${(val / mx) * 100}%;background:${color}"></i></div><em>${v ? Math.round(val) : '—'}</em></div>`;
      h = `<h5>${st.cmpTitle}</h5>${row('<b style="color:#38bdf8">藍色球拍</b>：有用力', r, '#38bdf8')}${row('<b style="color:#94a3b8">灰色球拍</b>：沒用力', g, '#64748b')}
        <p class="note">拍頭速度（以「沒用力」＝100；示意）${v ? `｜快了 <b style="color:#E8B04B">${Math.round(r - 100)}%</b>` : '｜等第一球…'}</p><p class="note">黃色線＝藍色球拍打出的球；灰色線＝灰色球拍打出的球</p>`;
    } else if (st.cmp === 'dir') h = `<h5>比一比：拍面轉一點點</h5><p><b style="color:#E8B04B">黃色線</b>＝拍面往一邊轉 15° 打出的球<br><b style="color:#22d3ee">青色線</b>＝拍面往另一邊轉 15° 打出的球</p><p class="note">手指只轉一點點，球的方向就不一樣。</p><p class="note" id="rollNow"></p>`;
    if (st.research) h += `<p class="research">${st.research}</p>`;
    $('cmp').innerHTML = h;
  }

  // ---------- 關聯圖：手指 → 拍柄 → 拍頭／拍面 → 羽球（隨動畫亮起） ----------
  const CX = [8, 190, 338, 466], CW = [158, 128, 112, 90];
  const node = (id, c, y, label, sub = '', kind = 'cause') => ({ id, x: CX[c], y, w: CW[c], label, sub, kind });
  const REL = [
    { nodes: [node('t', 0, 18, '大拇指＋食指夾住', 'V 字支點'), node('r', 0, 82, '後三指輕輕靠', '手心留空間'), node('L', 1, 50, '握得輕', '拍柄可微調', 'mid'), node('F', 2, 50, '拍面', '隨時調整方向', 'face'), node('S', 3, 50, '球往拍面', '朝向飛', 'ball')],
      edges: [['t', 'L'], ['r', 'L'], ['L', 'F'], ['F', 'S']] },
    { nodes: [node('f', 0, 8, '後三指一起握緊', '彎手指的肌肉'), node('a', 0, 62, '前臂向內轉', '前臂向內轉的肌肉'), node('e', 0, 116, '手肘微微打直'), node('L', 1, 38, '拍柄繞 V 字轉', '手指槓桿', 'mid'), node('H', 2, 62, '拍頭加速', '{gain}', 'face'), node('S', 3, 62, '球更快', '更遠', 'ball')],
      edges: [['f', 'L'], ['L', 'H'], ['a', 'H'], ['e', 'H'], ['H', 'S']] },
    { nodes: [node('f', 0, 8, '大拇指往前推', '大拇指的肌肉'), node('b', 0, 62, '後三指回扣', '提供反作用力'), node('a', 0, 116, '前臂向外轉', '前臂向外轉的肌肉'), node('L', 1, 38, '拍柄轉動', '大拇指槓桿', 'mid'), node('H', 2, 62, '拍頭加速', '{gain}', 'face'), node('S', 3, 62, '球飛得', '更遠', 'ball')],
      edges: [['f', 'L'], ['b', 'L'], ['L', 'H'], ['a', 'H'], ['H', 'S']] },
    { nodes: [node('r', 0, 18, '後三指放鬆', '讓拍柄轉得動'), node('p', 0, 82, '拇指推、食指拉', '虎口的小肌肉'), node('L', 1, 50, '拍柄轉 {roll}', '像轉筆', 'mid'), node('F', 2, 50, '拍面角度', '改變', 'face'), node('S', 3, 50, '球的方向', '改變', 'ball')],
      edges: [['r', 'L'], ['p', 'L'], ['L', 'F'], ['F', 'S']] },
    { nodes: [node('i', 0, 8, '食指壓', '正手'), node('t', 0, 82, '大拇指推', '反手'), node('F', 1, 45, '拍面快速', '換方向', 'mid'), node('R', 2, 45, '打完', '馬上放鬆', 'face'), node('S', 3, 45, '下一球', '來得及', 'ball')],
      edges: [['i', 'F'], ['t', 'F'], ['F', 'R'], ['R', 'S'], ['i', 't', '輪流']] },
  ];
  const nearSnap = (lo, hi) => anim && anim.keys.some((k) => k.snap && anim.t - k.t >= lo && anim.t - k.t <= hi);
  function relOn(i, s) { // 依目前動作判斷哪些節點亮起
    const on = new Set(), lv = Math.abs(s.lever), hit = nearSnap(-0.15, 0.2), fly = nearSnap(0, 1.2);
    if (!anim) return on;
    if (i === 0) ['t', 'r', 'L', 'F', 'S'].forEach((k) => on.add(k));
    if (i === 1) { if (s.force.middle > 0.5) on.add('f'); if (s.pron > 20) on.add('a'); if (s.elbow < -10) on.add('e'); if (lv > 0.3) on.add('L'); if (hit) on.add('H'); if (fly) on.add('S'); }
    if (i === 2) { if (s.force.thumb > 0.6) on.add('f'); if (s.couple > 0.3) on.add('b'); if (s.pron < -15) on.add('a'); if (lv > 0.3) on.add('L'); if (hit) on.add('H'); if (fly) on.add('S'); }
    if (i === 3) { if (s.force.ring < 0.2) on.add('r'); if (Math.abs(s.roll) > 5) ['p', 'L', 'F'].forEach((k) => on.add(k)); if (fly) on.add('S'); }
    if (i === 4) { if (s.force.index > 0.6) on.add('i'); if (s.force.thumb > 0.6) on.add('t'); if (lv > 0.3) on.add('F'); const relax = nearSnap(0.08, 0.6) && s.force.middle < 0.2; if (relax) { on.add('R'); on.add('S'); } }
    return on;
  }
  const KIND = { cause: '#FF4D3D', mid: '#FF8A3D', face: '#3D8BFF', ball: '#E8B04B' };
  function renderRel() {
    const st = STEPS[step], R = REL[step], on = relOn(step, state), H = 44;
    const gain = cmpVals ? `+${Math.round(cmpVals.real - 100)}%（示意）` : '等第一球…';
    const txt = (t) => t.replace('{gain}', gain).replace('{roll}', `${state.roll >= 0 ? '+' : ''}${Math.round(state.roll)}°`);
    const pos = Object.fromEntries(R.nodes.map((n) => [n.id, n]));
    let svg = '';
    for (const [a, b, lab] of R.edges) {
      const A = pos[a], B = pos[b], act = on.has(a) && (on.has(b) || lab);
      let x1, y1, x2, y2;
      if (A.x === B.x) { x1 = x2 = A.x + A.w - 18; y1 = A.y + H; y2 = B.y; } else { x1 = A.x + A.w; y1 = A.y + H / 2; x2 = B.x - 4; y2 = B.y + H / 2; }
      const mx = (x1 + x2) / 2;
      svg += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" class="edge${act ? ' on' : ''}" marker-end="url(#ra${act ? 'on' : ''})"/>`;
      if (lab) svg += `<text x="${x1 + 8}" y="${(y1 + y2) / 2 + 4}" class="elab">${lab}</text>`;
    }
    for (const n of R.nodes) {
      const act = on.has(n.id), c = KIND[n.kind];
      svg += `<g class="node${act ? ' on' : ''}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${H}" rx="9" fill="${act ? c : '#111827'}" fill-opacity="${act ? 0.92 : 1}" stroke="${c}" stroke-width="${act ? 2.5 : 1.2}"/>
        <text x="${n.x + n.w / 2}" y="${n.y + (n.sub ? 19 : 28)}" class="nl${act ? ' on' : ''}">${txt(n.label)}</text>${n.sub ? `<text x="${n.x + n.w / 2}" y="${n.y + 35}" class="ns${act ? ' on' : ''}">${txt(n.sub)}</text>` : ''}</g>`;
    }
    const heads = ['手指', '拍柄', st.cmp === 'face' || st.cmp === 'dir' ? '拍面' : '拍頭', '羽球'];
    const top = heads.map((h, i) => `<text x="${CX[i] + CW[i] / 2}" y="-4" class="col">${h}</text>`).join('');
    const legend = st.cmp === 'ghost' ? '藍色球拍＝手指有用力｜灰色球拍＝手指沒用力' : st.cmp === 'dir' ? '黃色／青色球路＝拍面往兩邊各轉 15°' : '黃色箭頭＝拍面朝向';
    $('cmp').innerHTML = `<svg viewBox="0 -18 560 ${st.research ? 240 : 204}" class="rel"><defs>
      <marker id="ra" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#475569"/></marker>
      <marker id="raon" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#E8B04B"/></marker></defs>
      ${top}${svg}<text x="0" y="178" class="leg">${legend}</text>${st.research ? `<rect x="0" y="186" width="560" height="30" rx="6" class="res"/><text x="10" y="206" class="rest">${st.research}</text>` : ''}</svg>`;
  }
  function stepDone() {
    playing = false; $('btnNext').classList.add('pulse');
    $('progress').firstElementChild.style.width = `${((step + 1) / STEPS.length) * 100}%`;
    if (step === STEPS.length - 1) { $('finish').style.display = 'block'; $('btnNext').style.display = 'none'; }
  }
  $('btnStart').onclick = () => { $('intro').remove(); sound.init(); startStep(0); };
  $('btnPrev').onclick = () => { voice.pause(); startStep(step - 1); };
  $('btnReplay').onclick = () => { voice.pause(); startStep(step); };
  $('btnNext').onclick = () => { voice.pause(); if (step < STEPS.length - 1) startStep(step + 1); };
  $('finishBtn').onclick = () => { $('finish').style.display = 'none'; [...$('dots').children].forEach((d) => (d.className = 'done')); $('progress').firstElementChild.style.width = '100%'; confetti($('confetti')); sound.victory(); setTimeout(() => $('refs').classList.add('show'), 2200); $('subs').innerHTML = '<span class="kw">訓練完成！</span>記住：平時輕輕握，打到球才用力，打完馬上放鬆。手指用得好，拍面更準、球更快。'; };
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => { speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('vol').oninput = (e) => { sound.vol = +e.target.value; sound.apply(); };
  $('mute').onclick = () => { sound.muted = !sound.muted; voice.muted = sound.muted; sound.apply(); $('mute').textContent = sound.muted ? '取消靜音' : '靜音'; $('mute').classList.toggle('on', sound.muted); };
  $('musBtn').onclick = () => { showMus = !showMus; $('musBtn').classList.toggle('on', showMus); $('musBtn').textContent = showMus ? '隱藏肌肉層' : '顯示肌肉層'; };
  $('panel').onclick = () => $('panel').classList.toggle('full');
  $('refsBtn').onclick = () => $('refs').classList.add('show'); $('refsClose').onclick = () => $('refs').classList.remove('show');
  $('heatBtn').onclick = () => $('panel').classList.toggle('full');
  const setRel = (on) => { $('cmp').classList.toggle('hide', !on); $('relBtn').classList.toggle('on', on); $('relBtn').textContent = on ? '圖解：開' : '圖解：關'; };
  let relOnFlag = !(innerHeight > innerWidth * 1.05); setRel(relOnFlag); // 手機預設關閉
  $('relBtn').onclick = () => setRel((relOnFlag = !relOnFlag));

  const SPLIT = 0.58, SPLIT_Y = 0.55; // 桌面：左右分割｜手機直向：上下分割
  let portrait = false;
  function rects() { // [手指畫面, 拍面畫面]：WebGL 視窗以左下為原點
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (portrait) { const th = Math.round(ch * SPLIT_Y); return [[0, ch - th, cw, th], [0, 0, cw, ch - th]]; }
    const sx = Math.round(cw * SPLIT); return [[0, 0, sx, ch], [sx, 0, cw - sx, ch]];
  }
  // 手機直向：上方兩個 3D 畫面，下方可捲動的圖解與數據；電腦版放回原位
  let relaid = false;
  function relayout() {
    relaid = true;
    const st = $('stage');
    if (portrait) { $('msSubs').prepend($('subs')); $('msRel').append($('cmp')); $('msMus').append($('left')); $('msHeat').append($('panel')); $('msRef').append($('refsBtn')); setRel(true); }
    else { for (const id of ['subs', 'cmp', 'left', 'panel', 'refsBtn']) st.insertBefore($(id), $('mob')); setRel(relOnFlag); }
  }
  function resize() {
    const was = portrait; portrait = innerHeight > innerWidth * 1.05; document.body.classList.toggle('portrait', portrait); // 依視窗方向切換版面
    if (was !== portrait || !relaid) relayout();
    const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false);
    window.dispatchEvent(new Event('bgresize'));
    if (was !== portrait && typeof curView !== 'undefined') setView(curView, true);
  }
  addEventListener('resize', resize); resize();
  setView('palm', true);

  function pulseBg() { // 把手指與拍頭位置投影到畫面，觸發 p5 震波
    if (!window.__bgPulse) return;
    const cw = canvas.clientWidth, ch = canvas.clientHeight, [A, B] = rects();
    const proj = (pos, cam, r) => { const v = pos.clone().project(cam); return [(r[0] + (v.x + 1) / 2 * r[2]) / cw, 1 - (r[1] + (v.y + 1) / 2 * r[3]) / ch]; };
    window.__bgPulse(...proj(grip.getWorldPosition(new THREE.Vector3()), camera, A), 1);
    window.__bgPulse(...proj(headW(), rightCam, B), 1.3);
  }

  // ---------- 主迴圈 ----------
  const clock = new THREE.Clock(); let time = 0, panelTick = 0; const q0 = new URLSearchParams(location.search).get('pose');
  const v1 = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05); time += dt;
    if (anim) {
      if (playing) {
        anim.t += dt * speed;
        if (anim.t >= anim.dur) { if (voiceDone) { anim.t = anim.dur; stepDone(); } else { anim.t = 0; anim.fired.clear(); anim.loops++; resetShots(); } }
      }
      const ks = anim.keys; let i = 0; while (i < ks.length - 2 && anim.t >= ks[i + 1].t) i++;
      const a = ks[i], b = ks[Math.min(i + 1, ks.length - 1)], u = b.t > a.t ? ease(clamp((anim.t - a.t) / (b.t - a.t))) : 1;
      state = mix(a.s, b.s, u);
      for (let k = 1; k < ks.length; k++) if (ks[k].snap && anim.t >= ks[k].t && !anim.fired.has(k)) { anim.fired.add(k); sound.snap(); pulseBg(); }
    }
    applyPose(state);
    rollG.rotation.y = state.roll * D2R; ghostRoll.rotation.y = state.roll * D2R;
    leverG.rotation.x = LEVER_SIGN * state.lever * LEVER_MAX * D2R; // 手指槓桿
    M.root.updateMatrixWorld(true);
    const st = STEPS[step];
    ghostRoll.visible = st.cmp === 'ghost' && !!anim;
    // 拍頭速度（世界座標，用於對照）
    for (const [k, h] of [['real', realHead], ['ghost', ghostHead]]) { const p = headW(h); if (lastHead[k] && dt > 0) { speedHist[k].push(p.distanceTo(lastHead[k]) / Math.max(dt * speed, 1e-3)); if (speedHist[k].length > 30) speedHist[k].shift(); } lastHead[k] = p; }
    // 拍面朝向箭頭
    const typeNow = st.contact === 'bh' ? -1 : 1, nDir = hitDirW(typeNow), Hn = headW();
    faceArrow.position.copy(Hn); faceArrow.setDirection(nDir); faceArrow.visible = !!anim || !!q0;
    tagFace.position.copy(Hn).addScaledVector(nDir, 30).add(new THREE.Vector3(0, 6, 0)); tagFace.visible = faceArrow.visible;
    tagReal.visible = tagGhost.visible = ghostRoll.visible;
    if (ghostRoll.visible) { tagReal.position.copy(Hn).add(new THREE.Vector3(0, 24, 0)); tagGhost.position.copy(headW(ghostHead)).add(new THREE.Vector3(0, -22, 0)); }
    // 羽球：飛進來 → 觸球（發力瞬間）→ 飛出去
    if (anim) {
      const snaps = anim.keys.map((k, i) => ({ ...k, i })).filter((k) => k.snap);
      snaps.forEach((k, si) => {
        const pl = pool[si % 3], type = HIT[k.pose] ?? 1, isNet = k.pose === 'netRoll', dtk = anim.t - k.t;
        if (dtk < -0.4 || (si < snaps.length - 1 && anim.t > snaps[si + 1].t - 0.4 && !shots[k.i])) { if (!shots[k.i]) pl.real.g.visible = pl.ghost.g.visible = false; return; }
        if (dtk < 0) { // 飛進來
          const d = hitDirW(type), p = headW().addScaledVector(d, 2 + (-dtk) * (isNet ? 45 : VIN));
          pl.real.g.visible = true; pl.real.g.position.copy(p); orient(pl.real.g, d.clone().negate()); pl.ghost.g.visible = false; return;
        }
        if (!shots[k.i]) { // 觸球瞬間：記錄出球
          const avg = (a) => Math.max(...a.slice(-10), 1);
          const vr = avg(speedHist.real), vg = avg(speedHist.ghost);
          const d = hitDirW(type).add(new THREE.Vector3(0, isNet ? 0.35 : 0.12, 0)).normalize(), dg = hitDirW(type, ghostHead).add(new THREE.Vector3(0, 0.12, 0)).normalize();
          const base = isNet ? 70 : 250, ratio = st.cmp === 'ghost' ? clamp(vr / vg, 1.15, 1.9) : 1;
          shots[k.i] = { P0: headW().addScaledVector(d, 2), v0: d.multiplyScalar(base * (st.cmp === 'ghost' ? 0.62 * ratio : 1)), Pg: headW(ghostHead).addScaledVector(dg, 2), vg: dg.multiplyScalar(base * 0.62), si };
          pl.real.n = 0; pl.ghost.n = 0;
          if (st.cmp === 'ghost') cmpVals = { real: 100 * ratio, ghost: 100 };
        }
        const sh = shots[k.i], tau = Math.min(dtk, 1.2);
        const p = ballAt(sh.P0, sh.v0, tau), v = sh.v0.clone().multiplyScalar(Math.exp(-DRAG * tau)).addScaledVector(GRAV, tau);
        pl.real.g.visible = true; pl.real.g.position.copy(p); orient(pl.real.g, v); pushTrail(pl.real, p);
        if (st.cmp === 'ghost') {
          const pg = ballAt(sh.Pg, sh.vg, tau), vgv = sh.vg.clone().multiplyScalar(Math.exp(-DRAG * tau)).addScaledVector(GRAV, tau); pl.ghost.g.visible = true; pl.ghost.g.position.copy(pg); orient(pl.ghost.g, vgv); pushTrail(pl.ghost, pg);
          // 兩顆球的位置標記＋虛線＋距離差（最近一球）
          const dR = p.distanceTo(sh.P0), dG = pg.distanceTo(sh.Pg), pct = Math.round((dR / Math.max(dG, 1e-3) - 1) * 100);
          endReal.position.copy(p).add(new THREE.Vector3(0, 9, 0)); endGhost.position.copy(pg).add(new THREE.Vector3(0, -9, 0));
          const a = gapLine.geometry.attributes.position; a.setXYZ(0, p.x, p.y, p.z); a.setXYZ(1, pg.x, pg.y, pg.z); a.needsUpdate = true; gapLine.computeLineDistances();
          const t2 = `遠 +${Math.max(0, pct)}%`; if (t2 !== endDiffText && tau > 0.25) { endDiffText = t2; scene.remove(endDiff); endDiff = label(t2, '#E8B04B', 20); endDiff.layers.set(1); }
          endDiff.position.copy(p).lerp(pg, 0.5).add(new THREE.Vector3(14, 0, 0));
          endReal.visible = endGhost.visible = gapLine.visible = tau > 0.12; endDiff.visible = tau > 0.25;
          if (tau > 0.12) tagReal.visible = tagGhost.visible = tagFace.visible = false; // 球飛出後只留落點標記，避免重疊
        }
      });
      
    } else for (const pl of pool) pl.real.g.visible = pl.ghost.g.visible = false;
    // 骨骼著色：遠端指骨依施力變紅
    for (const f of F) CH[f].forEach((bn, si) => M.bodies[bn].meshes.forEach((m) => { const w = [0.35, 0.65, 1][si]; m.material.color.copy(IVORY).lerp(HOT, clamp((state.force[f] - 0.15) * w * 1.2)); m.material.emissive.copy(HOT).multiplyScalar(clamp(state.force[f] - 0.6) * w * 0.8); }));
    // 指腹壓力與向量
    const ax = gripAxisW();
    for (const f of F) {
      const p = padPos(f), fv = state.force[f];
      pads[f].position.copy(p); pads[f].material.color.copy(COOL).lerp(HOT, clamp((fv - 0.1) / 0.8)); pads[f].scale.setScalar(0.6 + fv * 0.9);
      const A = arrows[f];
      if (fv < 0.4) { A.visible = false; continue; }
      const tgt = ax.closestPointToPoint(p, true, new THREE.Vector3()), dir = tgt.sub(p).normalize(), len = 1.5 + fv * 3.5;
      A.position.copy(p).addScaledVector(dir, -len - 0.3); A.setDirection(dir); A.setLength(len, 1.0, 0.7); A.visible = true;
    }
    // 反手力偶：拇指推力與後三指回扣反作用力
    if (state.couple > 0.3) {
      const p = padPos('ring'), tgt = ax.closestPointToPoint(p, true, new THREE.Vector3()), dir = p.clone().sub(tgt).normalize();
      counter.position.copy(tgt); counter.setDirection(dir); counter.setLength(2 + 3 * state.couple, 1, 0.7); counter.visible = true;
    } else counter.visible = false;
    // 捻動：拇指一推、食指一拉（切線方向）
    const rollOn = st.contact === 'net' && Math.abs(state.roll) > 2;
    ['thumb', 'index'].forEach((f, k) => {
      const A = rollArrows[k]; if (!rollOn) { A.visible = false; return; }
      const p = padPos(f), c = ax.closestPointToPoint(p, true, new THREE.Vector3()), radial = p.clone().sub(c).normalize();
      const axisDir = ax.delta(new THREE.Vector3()).normalize(), tan = new THREE.Vector3().crossVectors(axisDir, radial).multiplyScalar(Math.sign(state.roll) * (k ? -1 : 1));
      A.position.copy(p); A.setDirection(tan); A.setLength(2.4, 0.9, 0.6); A.visible = true;
    });
    gapRing.material.opacity = st.gap && anim ? 0.55 + 0.35 * Math.sin(time * 5) : 0;
    fulcrum.material.opacity = (st.fulcrum || st.contact === 'fh') && anim ? 0.6 + 0.3 * Math.sin(time * 4) : 0;
    faces.forEach((fc) => fc.mesh.material.emissive.setRGB(0, 0, 0));
    for (const f of F) if (state.force[f] > 0.25) { const k = faceOf(padPos(f)); const m = faces[k - 1].mesh.material; m.emissive.copy(HOT).multiplyScalar(Math.max(m.emissive.r, state.force[f] * 0.14)); }
    elbowTag.position.copy(W('ulna_r')).add(new THREE.Vector3(0, 7, 0));
    updateMuscles(state.mus);
    // 面板
    for (const m of MUS) { const v = Math.round(state.mus[m] * 100); $(`mb_${m}`).style.width = `${v}%`; $(`mb_${m}`).style.background = v >= 90 ? '#FF4D3D' : v >= 60 ? '#FF8A3D' : v >= 30 ? '#E8B04B' : '#4CC9F0'; $(`mv_${m}`).textContent = `${v}%`; }
    const g = (state.force.middle + state.force.ring + state.force.little + state.force.index + state.force.thumb) / 5;
    hist.push(g); hist.shift();
    if (++panelTick % 6 === 0) { renderRel(); $('spark').innerHTML = sparkline(); $('peak').textContent = `${Math.round(Math.max(...hist) * 100)}%`; $('panel').innerHTML = panelSVG(state, st) + `<span class="hint">${$('panel').classList.contains('full') ? '點擊縮回' : '點擊放大'}</span>`; }
    if (anim && !voice.paused) renderSubs(voice.currentTime);
    if (!camTween && anim && !renderer.xr.isPresenting) { // 鏡頭平順跟隨手部，手永遠在畫面中央（仍可拖曳旋轉）
      const d = focusFor(curView).sub(controls.target).multiplyScalar(Math.min(1, dt * 3));
      controls.target.add(d); camera.position.add(d);
    }
    if (camTween) { camTween.t = Math.min(1, camTween.t + dt * 1.5); const e = ease(camTween.t); camera.position.lerpVectors(camTween.from, camTween.to, e); controls.target.lerpVectors(camTween.tf, camTween.tt, e); if (camTween.t >= 1) camTween = null; }
    controls.update();
    if (renderer.xr.isPresenting) { renderer.render(scene, camera); return; } // VR 中只用頭戴裝置的視角
    const [A, B] = rects();
    renderer.setScissorTest(true); renderer.setClearColor(0x000000, 0); // 透明：露出 p5.js 背景
    renderer.setViewport(...A); renderer.setScissor(...A); camera.aspect = A[2] / A[3]; camera.updateProjectionMatrix(); renderer.render(scene, camera);
    renderer.setViewport(...B); renderer.setScissor(...B); rightCam.aspect = B[2] / B[3]; rightCam.updateProjectionMatrix(); renderer.render(scene, rightCam);
    renderer.setScissorTest(false);
    // p5 背景：光暈中心與握力
    const ch2 = canvas.clientHeight, cw2 = canvas.clientWidth;
    window.__bgFoci = [A, B].map((r) => ({ x: (r[0] + r[2] / 2) / cw2, y: 1 - (r[1] + r[3] / 2) / ch2 }));
    window.__bgGrip = g;
  });

  // 測試參數：?step=N 直接播放；?pose=xxx&view=yyy 靜態檢視
  const q = new URLSearchParams(location.search);
  if (q.get('clean')) document.querySelectorAll('#top,#left,.cluster,#subs,#panel,#nav,#sound,#dbgBtn,.credit').forEach((e) => (e.style.display = 'none'));
  if (q.get('pose')) { $('intro').remove(); state = { ...resolve({ pose: q.get('pose'), pron: +(q.get('pron') || 0), roll: +(q.get('roll') || 0) }) }; anim = null; setView(q.get('view') || 'palm', true); applyPose(state); frameRight(STEPS[+(q.get('s') || 2) - 1]); renderRel(); }
  else if (q.get('step')) { $('intro').remove(); sound.init(); startStep(+q.get('step') - 1); }
  renderer.xr.addEventListener('sessionstart', () => { // VR：場景改為公尺尺度，拍柄放在眼前 45 cm、高 1.2 m
    scene.scale.setScalar(0.01); scene.position.set(0, 0, 0); scene.updateMatrixWorld(true);
    const g = grip.getWorldPosition(new THREE.Vector3()); scene.position.set(-g.x, 1.2 - g.y, -0.45 - g.z);
  });
  renderer.xr.addEventListener('sessionend', () => { scene.scale.setScalar(1); scene.position.set(0, 0, 0); });
  window.__ready = { PRON, TH, TA }; window.__M = M;
})().catch((e) => { const d = document.createElement('div'); d.id = 'err'; d.textContent = `載入失敗：${e.message}`; document.getElementById('stage').append(d); console.error(e); });
