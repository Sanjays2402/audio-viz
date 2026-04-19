const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
let audioCtx, analyser, dataArray, freqArray, source, rafId;
let mode = localStorage.getItem('av-mode') || 'bars';
let sens = +localStorage.getItem('av-sens') || 50;
let smoothing = +localStorage.getItem('av-smoothing') || 0.85;
let colorScheme = localStorage.getItem('av-color') || 'neon';
let bgFade = +localStorage.getItem('av-fade') || 0.15;
let mirror3d = localStorage.getItem('av-3d') === '1';
let particles = [], stars = [];
let running = false, mediaStream;
let peakHistory = new Array(60).fill(0);
let beatAt = 0, bpm = 0, lastBeat = 0;

// ── ITER 9: star background always draw (even when idle for visual fidelity)
for (let i = 0; i < 80; i++) stars.push({
  x: Math.random(), y: Math.random(),
  size: Math.random() * 1.2 + 0.3,
  tw: Math.random() * Math.PI * 2,
});

// ── ITER 2: hi-DPI canvas resize
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

// ── ITER 1: restore selected mode from localStorage
document.querySelectorAll('.mode').forEach(b => {
  b.classList.toggle('active', b.dataset.mode === mode);
  b.onclick = () => {
    document.querySelectorAll('.mode').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    mode = b.dataset.mode;
    localStorage.setItem('av-mode', mode);
    particles = [];
  };
});

// ── ITER 10: keyboard shortcuts
addEventListener('keydown', e => {
  if (!running || e.target.tagName === 'INPUT') return;
  const modes = ['bars', 'wave', 'particles', 'circular', 'mirror', 'galaxy', 'tunnel'];
  const modeIdx = modes.indexOf(mode);
  if (e.key >= '1' && e.key <= '7') {
    const i = +e.key - 1;
    if (modes[i]) {
      document.querySelector(`[data-mode="${modes[i]}"]`)?.click();
    }
  } else if (e.key === 'ArrowRight') {
    document.querySelector(`[data-mode="${modes[(modeIdx + 1) % modes.length]}"]`)?.click();
  } else if (e.key === 'ArrowLeft') {
    document.querySelector(`[data-mode="${modes[(modeIdx - 1 + modes.length) % modes.length]}"]`)?.click();
  } else if (e.key === 'f' || e.key === 'F') {
    $('fullscreen').click();
  } else if (e.key === 'c' || e.key === 'C') {
    cycleColorScheme();
  } else if (e.key === 'h' || e.key === 'H') {
    $('controls').classList.toggle('hidden-mode');
  }
});

// ── ITER 6: color scheme cycling
const COLOR_SCHEMES = {
  neon: { hueBase: 240, hueRange: 300, desc: 'Neon (violet→cyan)' },
  fire: { hueBase: 0, hueRange: 60, desc: 'Fire (red→yellow)' },
  ocean: { hueBase: 170, hueRange: 80, desc: 'Ocean (cyan→blue)' },
  forest: { hueBase: 80, hueRange: 60, desc: 'Forest (lime→emerald)' },
  sunset: { hueBase: 320, hueRange: 80, desc: 'Sunset (magenta→amber)' },
  mono: { hueBase: 0, hueRange: 0, desc: 'Mono (white)' },
};
function colorAt(t, alpha = 1, lightness = 60) {
  const { hueBase, hueRange } = COLOR_SCHEMES[colorScheme];
  if (hueRange === 0) return `hsla(0, 0%, ${Math.min(100, lightness + 30)}%, ${alpha})`;
  return `hsla(${hueBase + t * hueRange}, 100%, ${lightness}%, ${alpha})`;
}
function cycleColorScheme() {
  const keys = Object.keys(COLOR_SCHEMES);
  const i = keys.indexOf(colorScheme);
  colorScheme = keys[(i + 1) % keys.length];
  localStorage.setItem('av-color', colorScheme);
  showToast('🎨 ' + COLOR_SCHEMES[colorScheme].desc);
}

// ── ITER 5: toast notification
function showToast(msg) {
  let t = $('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

$('start').onclick = async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = smoothing;
    source = audioCtx.createMediaStreamSource(mediaStream);
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.fftSize);
    freqArray = new Uint8Array(analyser.frequencyBinCount);
    $('overlay').classList.add('hidden');
    $('controls').classList.remove('hidden');
    running = true;
    loop();
  } catch (err) {
    showToast('❌ Microphone access denied');
  }
};

$('stop').onclick = () => {
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  if (source) source.disconnect();
  if (audioCtx) audioCtx.close();
  cancelAnimationFrame(rafId);
  running = false;
  $('overlay').classList.remove('hidden');
  $('controls').classList.add('hidden');
};

$('sens').oninput = e => {
  sens = +e.target.value;
  localStorage.setItem('av-sens', sens);
};
$('sens').value = sens;

$('fullscreen').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
};

// ── ITER 14: screenshot button
$('screenshot').onclick = () => {
  const link = document.createElement('a');
  link.download = `audioviz-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('📸 Screenshot saved');
};

// ── ITER 7: color scheme button
$('colorBtn').onclick = cycleColorScheme;

function loop() {
  if (!running) return;
  analyser.getByteTimeDomainData(dataArray);
  analyser.getByteFrequencyData(freqArray);

  const k = sens / 50;
  // ── ITER 11: weighted average (low-freq bias) for bpm detection
  let lowAvg = 0, fullAvg = 0;
  for (let i = 0; i < 32; i++) lowAvg += freqArray[i];
  lowAvg /= 32;
  for (let i = 0; i < freqArray.length; i++) fullAvg += freqArray[i];
  fullAvg /= freqArray.length;

  // ── ITER 12: simple beat detection
  peakHistory.shift();
  peakHistory.push(lowAvg);
  const baseline = peakHistory.reduce((a, b) => a + b, 0) / peakHistory.length;
  const now = performance.now();
  if (lowAvg > baseline * 1.25 && lowAvg > 50 && now - lastBeat > 220) {
    beatAt = now;
    if (lastBeat > 0) {
      const interval = now - lastBeat;
      const inst = 60000 / interval;
      bpm = bpm > 0 ? bpm * 0.85 + inst * 0.15 : inst;
    }
    lastBeat = now;
  }
  const beatPulse = Math.max(0, 1 - (now - beatAt) / 220);

  $('level-fill').style.width = Math.min(100, fullAvg * k * 1.5) + '%';
  $('bpm').textContent = bpm > 50 && bpm < 200 ? Math.round(bpm) : '—';

  // ── ITER 4: background fade with star twinkle
  ctx.fillStyle = `rgba(5,5,10,${bgFade})`;
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  drawStarfield(fullAvg * k);

  if (mode === 'bars') drawBars(k, beatPulse);
  else if (mode === 'wave') drawWave(k, beatPulse);
  else if (mode === 'particles') drawParticles(k, fullAvg);
  else if (mode === 'circular') drawCircular(k, beatPulse);
  else if (mode === 'mirror') drawMirror(k);
  else if (mode === 'galaxy') drawGalaxy(k, fullAvg, beatPulse);
  else if (mode === 'tunnel') drawTunnel(k, fullAvg, beatPulse);

  rafId = requestAnimationFrame(loop);
}

// ── ITER 9: subtle starfield background
function drawStarfield(loud) {
  const w = innerWidth, h = innerHeight;
  for (const s of stars) {
    s.tw += 0.02;
    const a = 0.2 + Math.sin(s.tw) * 0.15 + loud * 0.003;
    ctx.fillStyle = colorAt(s.x, Math.min(a, 0.7), 75);
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.size + loud * 0.005, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBars(k, beat) {
  const w = innerWidth, h = innerHeight;
  const bars = 128;
  const bw = w / bars;
  const step = Math.floor(freqArray.length / bars);
  for (let i = 0; i < bars; i++) {
    const v = freqArray[i * step] / 255 * k;
    const bh = v * h * 0.8 * (1 + beat * 0.1);
    const x = i * bw;
    const grad = ctx.createLinearGradient(x, h, x, h - bh);
    grad.addColorStop(0, colorAt(i / bars, 0.7, 55));
    grad.addColorStop(1, colorAt(i / bars, 1, 70));
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1, h - bh, bw - 2, bh);
    // ── ITER 3: cap bar with a bright pixel for that "led equalizer" look
    ctx.fillStyle = colorAt(i / bars, 1, 85);
    ctx.fillRect(x + 1, h - bh - 2, bw - 2, 2);
  }
}

function drawWave(k, beat) {
  const w = innerWidth, h = innerHeight;
  // ── ITER 13: layered wave (3 copies offset + blurred for glow)
  const layers = [
    { lw: 1, alpha: 0.3, off: 6 },
    { lw: 2, alpha: 0.6, off: 3 },
    { lw: 3, alpha: 1, off: 0 },
  ];
  for (const { lw, alpha, off } of layers) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = colorAt(0.3, alpha, 70);
    ctx.shadowColor = colorAt(0.3, 1, 60);
    ctx.shadowBlur = off > 0 ? 20 : 10;
    ctx.beginPath();
    const slice = w / dataArray.length;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] / 128 - 1) * k;
      const y = h / 2 + v * h / 3 + off * Math.sin(i * 0.02);
      const x = i * slice;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function drawParticles(k, avg) {
  const w = innerWidth, h = innerHeight;
  if (avg * k > 40) {
    const count = Math.floor(avg * k / 20);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4 + avg * k / 50;
      particles.push({
        x: w / 2, y: h / 2,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1,
        hueT: Math.random(),
        size: 2 + Math.random() * 3,
      });
    }
  }
  particles = particles.filter(p => p.life > 0);
  if (particles.length > 800) particles.splice(0, particles.length - 800);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.05;
    p.life -= 0.012;
    ctx.fillStyle = colorAt(p.hueT, p.life, 65);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCircular(k, beat) {
  const w = innerWidth, h = innerHeight;
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.22 * (1 + beat * 0.08);
  const bars = 180;
  for (let i = 0; i < bars; i++) {
    const v = freqArray[Math.floor(i * freqArray.length / bars / 2)] / 255 * k;
    const len = radius * 0.5 * v + 5;
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + len);
    const y2 = cy + Math.sin(angle) * (radius + len);
    ctx.strokeStyle = colorAt(i / bars, 1, 50 + v * 30);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  const pulse = Array.from(freqArray.slice(0, 16)).reduce((a, b) => a + b, 0) / 16 / 255 * k;
  ctx.fillStyle = colorAt(0.3, 0.2 + pulse * 0.4, 65);
  ctx.beginPath(); ctx.arc(cx, cy, radius * (0.8 + pulse * 0.3), 0, Math.PI * 2); ctx.fill();
}

function drawMirror(k) {
  const w = innerWidth, h = innerHeight;
  const bars = 80;
  const bw = w / bars;
  for (let i = 0; i < bars; i++) {
    const v = freqArray[i * 2] / 255 * k;
    const bh = v * h * 0.4;
    const x = i * bw;
    ctx.fillStyle = colorAt(i / bars, 0.9, 60);
    ctx.fillRect(x + 1, h / 2 - bh, bw - 2, bh);
    ctx.fillStyle = colorAt(i / bars, 0.4, 60);
    ctx.fillRect(x + 1, h / 2, bw - 2, bh);
  }
}

// ── ITER 8: new "Galaxy" mode — 3D rotating point cloud driven by audio
let galaxyAngle = 0;
function drawGalaxy(k, avg, beat) {
  const w = innerWidth, h = innerHeight;
  const cx = w / 2, cy = h / 2;
  const points = 500;
  galaxyAngle += 0.008 + avg * 0.0002;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < points; i++) {
    const t = i / points;
    const arm = Math.floor(t * 3);
    const armT = (t * 3) % 1;
    const r = Math.min(w, h) * 0.4 * armT;
    const a = galaxyAngle + arm * (Math.PI * 2 / 3) + armT * Math.PI * 2;
    const freqIdx = Math.floor(t * freqArray.length / 2);
    const v = freqArray[freqIdx] / 255 * k;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.5; // tilted disk
    const size = 1 + v * 4 + beat * 2;
    ctx.fillStyle = colorAt(t, 0.7 + v * 0.3, 60 + v * 30);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── ITER 15: new "Tunnel" mode — perspective grid into the distance
let tunnelZ = 0;
function drawTunnel(k, avg, beat) {
  const w = innerWidth, h = innerHeight;
  const cx = w / 2, cy = h / 2;
  tunnelZ = (tunnelZ + 0.02 + avg * 0.0005) % 1;
  const rings = 14;
  for (let i = 0; i < rings; i++) {
    const t = (i + tunnelZ) / rings;
    const size = Math.pow(t, 2.5) * Math.min(w, h) * 0.95;
    const alpha = Math.min(1, t * 1.5) * 0.7;
    const freqIdx = Math.floor(i * freqArray.length / rings / 3);
    const v = freqArray[freqIdx] / 255 * k;
    ctx.strokeStyle = colorAt(t, alpha, 55 + v * 30);
    ctx.lineWidth = 2 + v * 4 + beat * 2;
    ctx.beginPath();
    // hexagon rings (more interesting than circles)
    for (let s = 0; s < 7; s++) {
      const a = (s / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * size * (1 + v * 0.15);
      const y = cy + Math.sin(a) * size * (1 + v * 0.15);
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
