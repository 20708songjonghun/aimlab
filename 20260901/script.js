const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const mainMenu = document.getElementById('main-menu');
const pauseScreen = document.getElementById('pause-screen');
const resultScreen = document.getElementById('result-screen');
const hud = document.getElementById('hud');
const hudTime = document.getElementById('hud-time');
const hudScore = document.getElementById('hud-score');
const hudAccuracy = document.getElementById('hud-accuracy');
const sensInput = document.getElementById('sens-input');
const sensVal = document.getElementById('sens-val');

// Game Config
const GAME_TIME = 60;
const GRID_ROWS = 6;
const GRID_COLS = 10;
const TARGET_COUNT = 3;

// Game State Variables
let isPlaying = false;
let timeRemaining = GAME_TIME;
let timerInterval = null;
let targets = [];
let hits = 0;
let misses = 0;
let score = 0;
let reactionTimes = [];
let sensitivity = 1.0;

let occupiedSlots = new Set(); // 6x10 중복 방지 저장소

// Crosshair State
let crosshair = { x: 0, y: 0 };

// Audio Context
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playHitSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.05);
}

// Resize Canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  crosshair.x = canvas.width / 2;
  crosshair.y = canvas.height / 2;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Sens UI
sensInput.addEventListener('input', (e) => {
  sensitivity = parseFloat(e.target.value);
  sensVal.textContent = sensitivity.toFixed(1);
});

// Target Class with 3D Skyblue Design
class Target {
  constructor() {
    this.slotIndex = -1;
    this.spawn();
  }

  spawn() {
    if (this.slotIndex !== -1) {
      occupiedSlots.delete(this.slotIndex);
    }

    let slot;
    do {
      slot = Math.floor(Math.random() * (GRID_ROWS * GRID_COLS));
    } while (occupiedSlots.has(slot));

    this.slotIndex = slot;
    occupiedSlots.add(slot);

    const col = slot % GRID_COLS;
    const row = Math.floor(slot / GRID_COLS);

    const gridWidth = Math.min(canvas.width * 0.7, 1000);
    const gridHeight = Math.min(canvas.height * 0.6, 600);
    
    const startX = (canvas.width - gridWidth) / 2;
    const startY = (canvas.height - gridHeight) / 2;

    const cellW = gridWidth / GRID_COLS;
    const cellH = gridHeight / GRID_ROWS;

    this.x = startX + col * cellW + cellW / 2;
    this.y = startY + row * cellH + cellH / 2;
    this.radius = Math.min(cellW, cellH) * 0.38;
    this.createdAt = performance.now();
  }

  draw() {
    ctx.save();
    
    const gradient = ctx.createRadialGradient(
      this.x - this.radius * 0.3,
      this.y - this.radius * 0.3,
      this.radius * 0.1,
      this.x,
      this.y,
      this.radius
    );
    
    gradient.addColorStop(0, '#e0f2fe');
    gradient.addColorStop(0.5, '#38bdf8');
    gradient.addColorStop(1, '#0284c7');

    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#bae6fd';
    ctx.stroke();
    ctx.closePath();

    ctx.restore();
  }

  isHit(px, py) {
    const dist = Math.hypot(this.x - px, this.y - py);
    return dist <= this.radius;
  }
}

// 착시 배경
function drawIllusionBackground() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const bgGradient = ctx.createRadialGradient(cx, cy, 50, cx, cy, Math.max(canvas.width, canvas.height) / 1.2);
  bgGradient.addColorStop(0, '#475569');
  bgGradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1.5;

  const numLines = 24;
  const maxRadius = Math.max(canvas.width, canvas.height);

  for (let i = 0; i < numLines; i++) {
    const angle = (i * Math.PI * 2) / numLines;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * maxRadius, cy + Math.sin(angle) * maxRadius);
    ctx.stroke();
  }

  const gridWidth = Math.min(canvas.width * 0.7, 1000);
  const gridHeight = Math.min(canvas.height * 0.6, 600);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect((canvas.width - gridWidth) / 2, (canvas.height - gridHeight) / 2, gridWidth, gridHeight);

  ctx.restore();
}

/**
 * 커스텀 십자가 조준선 렌더링 함수
 * 코드 스펙 (0;P;c;1;o;1;f;0;0t;1;0l;4;0o;2;0a;1;0f;0;1b;0):
 * - 색상: 빨간색 (#ff0000)
 * - 안쪽 선 두께(0t): 1px
 * - 안쪽 선 길이(0l): 4px
 * - 안쪽 선 오프셋(0o): 2px
 * - 윤곽선(o): 1px (검은색)
 */
function drawCustomCrosshair(x, y) {
  ctx.save();
  
  // 픽셀 선명도를 위해 정수 좌표로 변환
  const cx = Math.floor(x);
  const cy = Math.floor(y);

  const length = 4;   // 0l
  const thickness = 1; // 0t
  const offset = 2;   // 0o
  const outline = 1;  // o

  // 4방향 위치 정보 (상, 하, 좌, 우)
  const lines = [
    { x: cx - thickness / 2, y: cy - offset - length, w: thickness, h: length }, // 상
    { x: cx - thickness / 2, y: cy + offset,          w: thickness, h: length }, // 하
    { x: cx - offset - length, y: cy - thickness / 2, w: length,    h: thickness }, // 좌
    { x: cx + offset,          y: cy - thickness / 2, w: length,    h: thickness }  // 우
  ];

  // 1. 검은색 윤곽선(Outline) 그리기
  ctx.fillStyle = '#000000';
  lines.forEach(line => {
    ctx.fillRect(
      line.x - outline,
      line.y - outline,
      line.w + outline * 2,
      line.h + outline * 2
    );
  });

  // 2. 메인 조준선 (빨간색) 그리기
  ctx.fillStyle = '#ff0000'; // c;1 (Red)
  lines.forEach(line => {
    ctx.fillRect(line.x, line.y, line.w, line.h);
  });

  ctx.restore();
}

function initTargets() {
  occupiedSlots.clear();
  targets = [];
  for (let i = 0; i < TARGET_COUNT; i++) {
    targets.push(new Target());
  }
}

// Main Render Loop
function render() {
  if (!isPlaying) return;

  // 착시 배경
  drawIllusionBackground();

  // 타깃
  targets.forEach(target => target.draw());

  // 커스텀 십자가 조준선
  drawCustomCrosshair(crosshair.x, crosshair.y);

  requestAnimationFrame(render);
}

function handleMouseMove(e) {
  if (document.pointerLockElement === canvas) {
    crosshair.x += e.movementX * sensitivity;
    crosshair.y += e.movementY * sensitivity;

    crosshair.x = Math.max(0, Math.min(canvas.width, crosshair.x));
    crosshair.y = Math.max(0, Math.min(canvas.height, crosshair.y));
  }
}

function handleClick() {
  if (!isPlaying || document.pointerLockElement !== canvas) return;

  let hitIndex = -1;
  const now = performance.now();

  for (let i = 0; i < targets.length; i++) {
    if (targets[i].isHit(crosshair.x, crosshair.y)) {
      hitIndex = i;
      break;
    }
  }

  if (hitIndex !== -1) {
    hits++;
    playHitSound();
    reactionTimes.push(now - targets[hitIndex].createdAt);
    targets[hitIndex].spawn();
  } else {
    misses++;
  }

  updateHUD();
}

function updateHUD() {
  const totalClicks = hits + misses;
  const accuracy = totalClicks > 0 ? Math.round((hits / totalClicks) * 100) : 100;
  score = hits * 100 - misses * 50;
  if (score < 0) score = 0;

  hudScore.textContent = score;
  hudAccuracy.textContent = `${accuracy}%`;
}

function startGame() {
  hits = 0;
  misses = 0;
  score = 0;
  reactionTimes = [];
  timeRemaining = GAME_TIME;

  hudTime.textContent = timeRemaining;
  updateHUD();

  mainMenu.classList.add('hidden');
  resultScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  canvas.requestPointerLock();
}

function startTimer() {
  isPlaying = true;
  initTargets();
  requestAnimationFrame(render);

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeRemaining--;
    hudTime.textContent = timeRemaining;

    if (timeRemaining <= 0) {
      endGame();
    }
  }, 1000);
}

function quitGame() {
  isPlaying = false;
  clearInterval(timerInterval);
  document.exitPointerLock();

  hud.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  mainMenu.classList.remove('hidden');
}

function endGame() {
  isPlaying = false;
  clearInterval(timerInterval);
  document.exitPointerLock();

  hud.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  resultScreen.classList.remove('hidden');

  const totalClicks = hits + misses;
  const accuracy = totalClicks > 0 ? Math.round((hits / totalClicks) * 100) : 0;
  const avgReaction = reactionTimes.length > 0 
    ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length) 
    : 0;

  document.getElementById('res-score').textContent = score;
  document.getElementById('res-accuracy').textContent = `${accuracy}%`;
  document.getElementById('res-reaction').textContent = `${avgReaction} ms`;
  document.getElementById('res-hits').textContent = `${hits} / ${misses}`;
}

// Event Listeners
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('menu-btn').addEventListener('click', quitGame);

document.getElementById('resume-btn').addEventListener('click', () => {
  canvas.requestPointerLock();
});
document.getElementById('quit-btn').addEventListener('click', quitGame);

pauseScreen.addEventListener('click', (e) => {
  if (e.target === pauseScreen) {
    canvas.requestPointerLock();
  }
});

// Pointer Lock Detection
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    pauseScreen.classList.add('hidden');
    if (!isPlaying) startTimer();
  } else if (isPlaying) {
    pauseScreen.classList.remove('hidden');
  }
});

window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('mousedown', handleClick);