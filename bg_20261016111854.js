// p5.js 背景：黑底＋淡淡的球場透視線、飄動的羽毛粒子；發力瞬間擴散紅色震波，光暈隨握力變化
// app 透過 window.__bgPulse(fx, fy, s) 觸發震波、window.__bgGrip（0–1）傳入握力、window.__bgFoci 傳入光暈中心
new p5((p) => {
  const parts = [], rings = [];
  let grip = 0, holder;
  const size = () => { const r = holder.getBoundingClientRect(); return [Math.max(10, r.width), Math.max(10, r.height)]; };
  const feather = (init) => ({
    x: p.random(p.width), y: init ? p.random(p.height) : p.height + 20,
    vy: -p.random(0.12, 0.55), vx: p.random(-0.12, 0.12), len: p.random(5, 14),
    a: p.random(p.TWO_PI), va: p.random(-0.012, 0.012), al: p.random(25, 75),
  });
  p.setup = () => {
    holder = document.getElementById('bg');
    const [w, h] = size();
    p.createCanvas(w, h).parent(holder);
    p.pixelDensity(1); p.frameRate(30);
    for (let i = 0; i < 70; i++) parts.push(feather(true));
  };
  p.windowResized = () => { if (!holder) return; const [w, h] = size(); p.resizeCanvas(w, h); }; // setup 完成前略過
  window.addEventListener('bgresize', () => setTimeout(p.windowResized, 30));
  p.draw = () => {
    p.background(0);
    grip = p.lerp(grip, window.__bgGrip || 0, 0.15);
    // 光暈：手指與拍面位置，握力越大越亮、越紅
    for (const f of window.__bgFoci || []) {
      const cx = f.x * p.width, cy = f.y * p.height, R = Math.min(p.width, p.height) * 0.42;
      p.noStroke();
      for (let k = 6; k >= 1; k--) {
        const t = k / 6;
        p.fill(p.lerp(20, 130, grip), p.lerp(70, 30, grip), p.lerp(100, 25, grip), 7 + 10 * grip);
        p.circle(cx, cy, R * t * 2);
      }
    }
    // 球場透視線
    const vx = p.width * 0.5, vy = p.height * 0.3, drift = (p.frameCount * 0.25) % 40;
    p.stroke(255, 255, 255, 14); p.strokeWeight(1);
    for (let i = -6; i <= 6; i++) p.line(vx + i * 8, vy, vx + i * p.width * 0.18, p.height);
    for (let k = 0; k < 9; k++) { const t = ((k * 40 + drift) / 360) ** 1.8, y = p.lerp(vy, p.height, t); p.line(0, y, p.width, y); }
    // 羽毛粒子
    for (const q of parts) {
      q.x += q.vx; q.y += q.vy; q.a += q.va;
      if (q.y < -20) Object.assign(q, feather(false));
      p.stroke(220, 230, 255, q.al * (0.6 + grip * 0.6)); p.strokeWeight(1.2);
      p.line(q.x, q.y, q.x + Math.cos(q.a) * q.len, q.y + Math.sin(q.a) * q.len);
    }
    // 發力震波
    p.noFill();
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.r += 9 * r.s; r.life -= 0.035;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      p.stroke(255, p.lerp(176, 77, r.life), p.lerp(75, 61, r.life), 200 * r.life); // 軟木塞琥珀 → 用力紅 p.strokeWeight(3 * r.life + 0.5);
      p.circle(r.x, r.y, r.r * 2);
      p.stroke(255, 255, 255, 90 * r.life); p.strokeWeight(1); p.circle(r.x, r.y, r.r * 1.4);
    }
  };
  window.__bgPulse = (fx, fy, s = 1) => rings.push({ x: fx * p.width, y: fy * p.height, r: 8, s, life: 1 });
});
