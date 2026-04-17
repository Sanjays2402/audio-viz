const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
let audioCtx, analyser, dataArray, freqArray, source, rafId;
let mode = 'bars';
let sens = 50;
let particles = [];
let running = false;

function resize(){
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  canvas.style.width = innerWidth+'px'; canvas.style.height = innerHeight+'px';
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
addEventListener('resize', resize);
resize();

$('start').onclick = async () => {
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false}});
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.fftSize);
    freqArray = new Uint8Array(analyser.frequencyBinCount);
    $('overlay').classList.add('hidden');
    $('controls').classList.remove('hidden');
    running = true;
    loop();
  }catch(err){
    alert('Microphone access denied. Refresh & allow to use this.');
  }
};

$('stop').onclick = () => {
  if(source){ source.disconnect(); source.mediaStream?.getTracks().forEach(t => t.stop()); }
  if(audioCtx) audioCtx.close();
  cancelAnimationFrame(rafId);
  running = false;
  $('overlay').classList.remove('hidden');
  $('controls').classList.add('hidden');
};

$('sens').oninput = e => sens = +e.target.value;
$('fullscreen').onclick = () => {
  if(document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
};

document.querySelectorAll('.mode').forEach(b => b.onclick = () => {
  document.querySelectorAll('.mode').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  mode = b.dataset.mode;
  particles = [];
});

function loop(){
  if(!running) return;
  analyser.getByteTimeDomainData(dataArray);
  analyser.getByteFrequencyData(freqArray);

  const k = sens / 50; // sensitivity multiplier
  const avg = freqArray.reduce((a,b)=>a+b,0) / freqArray.length;
  $('level-fill').style.width = Math.min(100, avg*k*1.5) + '%';

  // background trail
  ctx.fillStyle = 'rgba(5,5,10,0.15)';
  ctx.fillRect(0,0,innerWidth,innerHeight);

  if(mode === 'bars') drawBars(k);
  else if(mode === 'wave') drawWave(k);
  else if(mode === 'particles') drawParticles(k, avg);
  else if(mode === 'circular') drawCircular(k);
  else if(mode === 'mirror') drawMirror(k);

  rafId = requestAnimationFrame(loop);
}

function color(i, n){
  const hue = (i/n)*300 + 240; // violet → pink → cyan
  return `hsl(${hue}, 100%, 60%)`;
}

function drawBars(k){
  const w = innerWidth, h = innerHeight;
  const bars = 128;
  const bw = w / bars;
  const step = Math.floor(freqArray.length / bars);
  for(let i=0;i<bars;i++){
    const v = freqArray[i*step] / 255 * k;
    const bh = v * h * .8;
    const x = i * bw;
    const grad = ctx.createLinearGradient(x, h, x, h-bh);
    grad.addColorStop(0, `hsla(${(i/bars)*300+240}, 100%, 60%, .6)`);
    grad.addColorStop(1, `hsla(${(i/bars)*300+240}, 100%, 70%, 1)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x+1, h-bh, bw-2, bh);
  }
}

function drawWave(k){
  const w = innerWidth, h = innerHeight;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#a78bfa';
  ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 20;
  ctx.beginPath();
  const slice = w / dataArray.length;
  for(let i=0;i<dataArray.length;i++){
    const v = (dataArray[i]/128 - 1) * k;
    const y = h/2 + v * h/3;
    const x = i*slice;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawParticles(k, avg){
  const w = innerWidth, h = innerHeight;
  // spawn on loud moments
  if(avg*k > 40){
    const count = Math.floor(avg*k/20);
    for(let i=0;i<count;i++){
      const angle = Math.random()*Math.PI*2;
      const speed = 1 + Math.random()*4 + avg*k/50;
      particles.push({
        x: w/2, y: h/2,
        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        life: 1, hue: (Math.random()*300+240)%360,
        size: 2 + Math.random()*3,
      });
    }
  }
  particles = particles.filter(p => p.life > 0);
  for(const p of particles){
    p.x += p.vx; p.y += p.vy;
    p.vy += .05;
    p.life -= .012;
    ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size*p.life, 0, Math.PI*2); ctx.fill();
  }
}

function drawCircular(k){
  const w = innerWidth, h = innerHeight;
  const cx = w/2, cy = h/2;
  const radius = Math.min(w,h) * .22;
  const bars = 180;
  for(let i=0;i<bars;i++){
    const v = freqArray[Math.floor(i*freqArray.length/bars/2)] / 255 * k;
    const len = radius * .5 * v + 5;
    const angle = (i/bars) * Math.PI * 2 - Math.PI/2;
    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + len);
    const y2 = cy + Math.sin(angle) * (radius + len);
    ctx.strokeStyle = `hsl(${(i/bars)*300 + 240}, 100%, ${50 + v*30}%)`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }
  // centre circle pulse
  const pulse = Array.from(freqArray.slice(0,16)).reduce((a,b)=>a+b,0)/16/255 * k;
  ctx.fillStyle = `hsla(280, 100%, 65%, ${.2 + pulse*.4})`;
  ctx.beginPath(); ctx.arc(cx, cy, radius * (.8 + pulse*.3), 0, Math.PI*2); ctx.fill();
}

function drawMirror(k){
  const w = innerWidth, h = innerHeight;
  const bars = 80;
  const bw = w / bars;
  for(let i=0;i<bars;i++){
    const v = freqArray[i*2] / 255 * k;
    const bh = v * h * .4;
    const x = i * bw;
    const hue = (i/bars)*300 + 240;
    ctx.fillStyle = `hsla(${hue}, 100%, 60%, .9)`;
    ctx.fillRect(x+1, h/2 - bh, bw-2, bh);
    ctx.fillStyle = `hsla(${hue}, 100%, 60%, .4)`;
    ctx.fillRect(x+1, h/2, bw-2, bh);
  }
}
