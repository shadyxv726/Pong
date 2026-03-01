// ========== 全局变量（仅声明一次） ==========
var ball;
var leftPaddle, rightPaddle;
var baseSpeed = 6;
var speedMultiplier = 16;

// 中线障碍
var SEG_COUNT = 6;
var segments = [];
var activeSegmentIndex = -1;
var activeUntil = 0;

// 音频
var mic;
var micThreshold = 0.05; // 降低阈值，更容易触发“Peng!”
var lastPengTime = 0;
var pengCooldown = 300;

var amplitude;
var snareSound, tomSound, cymbalSound;
var jazzMusic; // 背景爵士乐（文件）
var ambientOsc1, ambientOsc2; // 无文件时的合成背景音

var ripples = [];
var audioStarted = false;

// 爵士背景乐：依次尝试在线（archive.org 通常支持 CORS），全失败则合成音
// 也可将 jazz.mp3 放同目录后刷新
var JAZZ_BG_URLS = [
  'https://ia801402.us.archive.org/6/items/78_crazy_blues_mamie_smith_and_her_jazz_hounds/crazy_blues.mp3',
  'https://archive.org/download/the-chronological-duke-ellington-1924-1927/01%20-%20Choo%20Choo%20%28Gotta%20Hurry%20Home%29.mp3'
];

// ========== 合成器音效（可作为采样/音乐缺失时的 fallback） ==========
function createPercOsc(freq, durationMs, type) {
  type = type || 'triangle';
  var osc = new p5.Oscillator(type);
  var env = new p5.Envelope();
  env.setADSR(0.001, 0.08, 0, 0.12);
  env.setRange(0.6, 0);
  osc.freq(freq);
  osc.start();
  osc.amp(0);
  return {
    play: function() {
      env.play(osc, 0, durationMs / 1000);
    }
  };
}

// 无 jazz 文件时：用合成器播放柔和爵士风背景音（纯 sine，降低滋滋声）
function startAmbientJazzBg() {
  if (ambientOsc1) return;
  ambientOsc1 = new p5.Oscillator('sine');
  ambientOsc1.freq(82.4); // E2
  ambientOsc1.amp(0.08);  //  softer
  ambientOsc1.start();
  ambientOsc2 = new p5.Oscillator('sine'); // 纯 sine，减少泛音
  ambientOsc2.freq(123.5); // E3 五度
  ambientOsc2.amp(0.05);
  ambientOsc2.start();
}

function stopAmbientJazzBg() {
  if (ambientOsc1) {
    ambientOsc1.stop();
    ambientOsc1 = null;
  }
  if (ambientOsc2) {
    ambientOsc2.stop();
    ambientOsc2 = null;
  }
}

// 尝试加载在线爵士风背景乐，依次尝试多个 URL，全失败则用合成背景
function tryLoadJazzBgUrl(onDone) {
  var idx = 0;
  function tryNext() {
    if (idx >= JAZZ_BG_URLS.length) {
      startAmbientJazzBg();
      if (amplitude) amplitude.setInput();
      console.log('在线爵士乐加载失败，使用合成背景音。可将 jazz.mp3 放同目录后刷新');
      if (onDone) onDone();
      return;
    }
    var url = JAZZ_BG_URLS[idx++];
    loadSound(
      url,
      function(snd) {
        stopAmbientJazzBg();
        jazzMusic = snd;
        if (audioStarted && amplitude) {
          if (typeof snd.setVolume === 'function') snd.setVolume(1);
          snd.loop();
          amplitude.setInput(snd);
        }
        console.log('背景爵士乐已播放（在线）');
        if (onDone) onDone();
      },
      tryNext
    );
  }
  tryNext();
}

// 不在 preload 里加载 jazz.mp3，避免 404 导致部分环境卡住、setup 不执行、画布不创建
// 需要爵士乐：将 jazz.mp3 放同目录后按 M 加载
// ========== 初始化 ==========
function setup() {
  jazzMusic = null;
  createCanvas(900, 500);
  frameRate(60);

  ball = {
    x: width / 2,
    y: height / 2,
    vx: random([-1, 1]) * baseSpeed,
    vy: random([-0.7, 0.7]) * baseSpeed,
    r: 10
  };

  var paddleH = 90;
  leftPaddle = { x: 40, y: height / 2 - paddleH / 2, w: 12, h: paddleH };
  rightPaddle = { x: width - 40, y: height / 2 - paddleH / 2, w: 12, h: paddleH };

  var segHeight = height / SEG_COUNT;
  for (var i = 0; i < SEG_COUNT; i++) {
    segments.push({
      x: width / 2 - 8,
      y: i * segHeight + segHeight * 0.1,
      w: 16,
      h: segHeight * 0.8
    });
  }

  mic = new p5.AudioIn();
  mic.start();

  amplitude = new p5.Amplitude();
  amplitude.smooth(0.85);

  // 鼓点合成器在「点击解锁音频」之后再创建，否则无声音
  snareSound = null;
  tomSound = null;
  cymbalSound = null;
}

function mousePressed() {
  if (audioStarted) return;
  userStartAudio().then(function() {
    audioStarted = true;
    if (!amplitude) {
      amplitude = new p5.Amplitude();
      amplitude.smooth(0.85);
    }
    snareSound = createPercOsc(220, 120, 'square');
    tomSound = createPercOsc(150, 150, 'sine');
    cymbalSound = createPercOsc(900, 250, 'sawtooth');
    amplitude.setInput();
    var hasJazz = !!(jazzMusic && typeof jazzMusic.loop === 'function');
    if (hasJazz) {
      if (typeof jazzMusic.setVolume === 'function') jazzMusic.setVolume(1);
      jazzMusic.loop();
      amplitude.setInput(jazzMusic);
      console.log('背景爵士乐已播放（jazz.mp3）');
    } else {
      tryLoadJazzBgUrl(function() {});
    }
    var el = document.querySelector('.overlay');
    if (el) el.style.display = 'none';
    var canvasEl = document.getElementById('defaultCanvas0');
    if (canvasEl) {
      canvasEl.style.display = 'block';
      canvasEl.style.visibility = 'visible';
      canvasEl.style.zIndex = '10';
    }
    console.log('Audio context unlocked.');
  });
}

// 按 M 键可选加载并播放 jazz.mp3（需先把文件放在同目录，再按 M）
function keyPressed() {
  if (key === 'm' || key === 'M') {
    loadSound(
      'jazz.mp3',
      function(snd) {
        jazzMusic = snd;
        if (audioStarted && amplitude) {
          if (typeof snd.setVolume === 'function') snd.setVolume(1);
          snd.loop();
          amplitude.setInput(snd);
        }
        console.log('jazz.mp3 已加载并播放');
      },
      function() {
        console.warn('未找到 jazz.mp3，请将文件放在与 index.html 同目录');
      }
    );
    return false;
  }
}

// ========== 主循环 ==========
function draw() {
  background('#0f0f19');

  drawBackgroundGlow();
  applyMusicToBallSpeed();

  updatePaddles();
  updateBall();
  handleCollisions();

  drawCenterSegments();
  drawPaddles();
  drawBallWithTrail();
  updateAndDrawRipples();
  drawHUD();
}

function drawBackgroundGlow() {
  noFill();
  stroke(255, 150, 0, 25);
  strokeWeight(1);
  for (var i = 0; i < 6; i++) {
    line(map(i, 0, 5, width * 0.15, width * 0.85), 0, map(i, 0, 5, width * 0.15, width * 0.85), height);
  }
  noStroke();
  for (var i = 0; i < 80; i++) {
    fill(15, 15, 25 + i, map(i, 0, 79, 70, 0));
    rect(0, i * 2, width, 4);
  }
}

function applyMusicToBallSpeed() {
  if (!amplitude) return;
  var level = amplitude.getLevel(); // 音乐/整体输出能量
  var micLevel = mic.getLevel();    // 语音能量

  // 取两者中的较大值，语音稍微放大一点
  level = max(level, micLevel * 1.5);
  var targetSpeed = baseSpeed + level * speedMultiplier;
  targetSpeed = constrain(targetSpeed, 4, 22);

  var dir = createVector(ball.vx, ball.vy).normalize();
  var current = createVector(ball.vx, ball.vy);
  var desired = dir.mult(targetSpeed);
  ball.vx = lerp(current.x, desired.x, 0.2);
  ball.vy = lerp(current.y, desired.y, 0.2);
}

function updatePaddles() {
  var moveSpeed = 7;

  // 左侧玩家：W / S
  if (keyIsDown(87)) { // W
    leftPaddle.y -= moveSpeed;
  }
  if (keyIsDown(83)) { // S
    leftPaddle.y += moveSpeed;
  }

  // 右侧玩家：↑ / ↓
  if (keyIsDown(38)) { // Up
    rightPaddle.y -= moveSpeed;
  }
  if (keyIsDown(40)) { // Down
    rightPaddle.y += moveSpeed;
  }

  leftPaddle.y = constrain(leftPaddle.y, 0, height - leftPaddle.h);
  rightPaddle.y = constrain(rightPaddle.y, 0, height - rightPaddle.h);
}

function updateBall() {
  ball.x += ball.vx;
  ball.y += ball.vy;
  if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }
  if (ball.y + ball.r > height) { ball.y = height - ball.r; ball.vy *= -1; }
  if (ball.x < -80 || ball.x > width + 80) resetBall();
}

function resetBall() {
  ball.x = width / 2;
  ball.y = height / 2;
  var angle = random(-PI / 4, PI / 4);
  var dir = random([1, -1]);
  var speed = baseSpeed + 4;
  ball.vx = cos(angle) * speed * dir;
  ball.vy = sin(angle) * speed;
}

function handleCollisions() {
  var hitLeft = circleRectCollision(ball, leftPaddle);
  var hitRight = circleRectCollision(ball, rightPaddle);
  if (hitLeft) {
    ball.x = leftPaddle.x + leftPaddle.w / 2 + ball.r + 1;
    ball.vx = abs(ball.vx);
    addRipple(leftPaddle.x + leftPaddle.w / 2, ball.y, '#ff9600');
    if (snareSound) snareSound.play();
  }
  if (hitRight) {
    ball.x = rightPaddle.x - rightPaddle.w / 2 - ball.r - 1;
    ball.vx = -abs(ball.vx);
    addRipple(rightPaddle.x - rightPaddle.w / 2, ball.y, '#ff9600');
    if (tomSound) tomSound.play();
  }

  handleMicTrigger();

  if (activeSegmentIndex >= 0 && millis() < activeUntil) {
    var seg = segments[activeSegmentIndex];
    if (circleRectCollision(ball, seg)) {
      if (ball.x < seg.x) {
        ball.x = seg.x - ball.r - 1;
        ball.vx = -abs(ball.vx);
      } else if (ball.x > seg.x + seg.w) {
        ball.x = seg.x + seg.w + ball.r + 1;
        ball.vx = abs(ball.vx);
      } else {
        ball.vy *= -1;
      }
      addRipple(seg.x + seg.w / 2, ball.y, '#ffffff');
      cymbalSound.play();
      activeSegmentIndex = -1;
    }
  } else {
    activeSegmentIndex = -1;
  }
}

function handleMicTrigger() {
  var vol = mic.getLevel();
  var now = millis();
  if (vol > micThreshold && now - lastPengTime > pengCooldown) {
    lastPengTime = now;
    activeSegmentIndex = floor(random(SEG_COUNT));
    activeUntil = now + 800;
    addRipple(width / 2, height / 2, '#ffffff');
  }
}

function circleRectCollision(c, r) {
  var closestX = constrain(c.x, r.x - r.w / 2, r.x + r.w / 2);
  var closestY = constrain(c.y, r.y, r.y + r.h);
  var dx = c.x - closestX;
  var dy = c.y - closestY;
  return dx * dx + dy * dy <= c.r * c.r;
}

function addRipple(x, y, colorHex) {
  ripples.push({ x: x, y: y, r: 0, alpha: 255, colorHex: colorHex });
}

function updateAndDrawRipples() {
  noFill();
  for (var i = ripples.length - 1; i >= 0; i--) {
    var rp = ripples[i];
    rp.r += 4;
    rp.alpha -= 12;
    if (rp.alpha <= 0) { ripples.splice(i, 1); continue; }
    var c = color(rp.colorHex);
    c.setAlpha(rp.alpha);
    stroke(c);
    strokeWeight(2);
    ellipse(rp.x, rp.y, rp.r * 2);
  }
}

function drawPaddles() {
  noStroke();
  fill(80, 140, 255, 220);
  rectMode(CENTER);
  rect(leftPaddle.x, leftPaddle.y + leftPaddle.h / 2, leftPaddle.w, leftPaddle.h, 5);
  fill(255, 150, 0, 230);
  rect(rightPaddle.x, rightPaddle.y + rightPaddle.h / 2, rightPaddle.w, rightPaddle.h, 5);
}

function drawCenterSegments() {
  rectMode(CORNER);
  stroke(80, 80, 120, 160);
  strokeWeight(2);
  for (var y = 0; y < height; y += 36) {
    line(width / 2, y, width / 2, y + 18);
  }
  noStroke();
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (i === activeSegmentIndex && millis() < activeUntil) {
      fill(255, 255, 255, 220);
      rect(seg.x, seg.y, seg.w, seg.h, 4);
      push();
      drawingContext.shadowBlur = 20;
      drawingContext.shadowColor = '#ff9600';
      noFill();
      stroke(255, 150, 0, 150);
      strokeWeight(3);
      rect(seg.x - 4, seg.y - 4, seg.w + 8, seg.h + 8, 6);
      pop();
    }
  }
}

function drawBallWithTrail() {
  var speed = sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  var tailLen = map(speed, 4, 22, 10, 60, true);
  var dir = createVector(ball.vx, ball.vy).normalize();
  var tailEnd = createVector(ball.x, ball.y).sub(dir.mult(tailLen));
  stroke(255, 150, 0, 180);
  strokeWeight(3);
  line(ball.x, ball.y, tailEnd.x, tailEnd.y);
  noStroke();
  fill(240, 240, 255);
  ellipse(ball.x, ball.y, ball.r * 2);
  fill(255, 255, 255, 180);
  ellipse(ball.x - 3, ball.y - 3, ball.r * 1.3);
}

function drawHUD() {
  noStroke();
  fill(200);
  textAlign(LEFT, TOP);
  textSize(12);
  var vol = mic ? mic.getLevel() : 0;
  var rms = amplitude ? amplitude.getLevel() : 0;
  var speed = sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  text(
    'Mic: ' + vol.toFixed(3) + ' (阈值 ' + micThreshold + ')\n' +
    'Music RMS: ' + rms.toFixed(3) + '\n' +
    '球速 |v| ≈ ' + speed.toFixed(2) + '\n\n' +
    '左: W/S  右: ↑/↓  喊 Peng! 触发障碍  按 M 加载 jazz.mp3',
    14, 12
  );
}
