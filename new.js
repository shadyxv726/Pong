// ========== 全局变量 (Globals) ==========
var mic, fft;
var leftPaddle, rightPaddle;

// 唯一的弹球 (The Main Good Note)
var mainBall = null;
var baseSpeed = 6;

// 干扰音符 (Red Bad Notes triggered by voice)
var notes = [];

var leftScore = 0;
var rightScore = 0;

var WIN_SCORE = 10;
var gameOver = null; // null | 'left' | 'right'

// 机制常量
var trebleThreshold = 60; // 适当提高，避免微小高频杂音
var bassThreshold = 100;  // 适当降低，低频容易被识别
var volThreshold = 0.02;  // 底噪过滤

var trebleEnergyMult = 1.5;
var bassEnergyMult = 1.5;

var leftCooldown = 0;
var rightCooldown = 0;
var COOLDOWN_TIME = 15; // frames

// 持续发声积累 (防止短促的游戏内噪音触发)
var leftSustain = 0;
var rightSustain = 0;
var SUSTAIN_TARGET = 8; // 降低判定：连续 8 帧 (约 0.13 秒) 持续喊叫即可，更加灵敏

var audioStarted = false;
var gameStarted = false;
var isTutorial = false;
var tutorialTimer = 0;

// 图像资产 (Images)
var drumLImg, drumRImg;
var notationImg;
var badNote1Img, badNote2Img;
var ziziImg, wuwuImg;
var win10Img1, win10Img2;

// ========== 音效 (Sound Effects) ==========
var kickDrumSound;
var saxSound;
var bgMusic;
var booSound;
var catchGoodSound, catchBadSound, scoreSound;

function createPercOsc(freq, durationMs, type, maxAmp) {
  type = type || 'triangle';
  var amp = maxAmp !== undefined ? maxAmp : 0.2;
  var osc = new p5.Oscillator(type);
  var env = new p5.Envelope();
  // 使用更短促的包络，减少声音残留时间
  env.setADSR(0.005, 0.05, 0, 0.05);
  env.setRange(amp, 0);
  osc.freq(freq);
  osc.start();
  osc.amp(0);
  return {
    play: function () {
      env.play(osc, 0, durationMs / 1000);
    }
  };
}

// ========== 预加载 (Preload) ==========
function preload() {
  drumLImg = loadImage('Drum L.png');
  drumRImg = loadImage('Drum R.png');
  notationImg = loadImage('notation.png');
  badNote1Img = loadImage('bad note01.png');
  badNote2Img = loadImage('badnote2.png');

  ziziImg = loadImage('Make a “zizi” sound to trigger the piano keys and generate more noise to disrupt the opponent..png');
  wuwuImg = loadImage('Make a “WUWU” sound to trigger the piano keys and generate more noise to disrupt the opponent..png');
  win10Img1 = loadImage('The first player to reach 10 points wins..png');
  win10Img2 = loadImage('The first player to reach 10 points wins.-1.png');
  kickDrumSound = loadSound('811705__soothsayer_orchestra__kickdrum-10.wav');
  saxSound = loadSound('448734__eitabyte__sax_noise_1-felipe-ruizbrx11.wav');
  bgMusic = loadSound('712632__kevp888__r4_00572_fr_jazz_trio_in_public_garden.wav');
  booSound = loadSound('Boo sound .wav');
}

// ========== 初始化 (Setup) ==========
function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(60);

  // 根据新的鼓面大小调整 Paddle 的物理碰撞体积
  var paddleH = windowHeight * 0.15;
  var paddleW = 20;
  var offset = windowWidth * 0.12;
  leftPaddle = { x: offset, y: height / 2 - paddleH / 2, w: paddleW, h: paddleH };
  rightPaddle = { x: width - offset, y: height / 2 - paddleH / 2, w: paddleW, h: paddleH };

  resetMainBall();

  mic = new p5.AudioIn();
  mic.start();

  // 初始化 FFT，用于频谱分析
  fft = new p5.FFT(0.8, 1024);
  fft.setInput(mic);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function mousePressed() {
  if (!audioStarted) {
    var el = document.querySelector('.overlay');
    if (el) el.style.display = 'none';
  }

  // 1. 如果还在教程阶段，允许点击跳过/加速进度
  if (isTutorial) {
    // 防抖：刚开始教程的头半秒内忽略点击，防止 START 按钮的双重触发导致瞬间跳过
    if (tutorialTimer < 30) return;

    var fps = 60;
    var phase1End = 5 * fps; // 300
    var phase2End = 10 * fps; // 600
    var phase3End = 14 * fps; // 840

    if (tutorialTimer <= phase1End) {
      // 在阶段 1 点击 -> 直接跳到阶段 2 开始
      tutorialTimer = phase1End + 1;
    } else if (tutorialTimer <= phase2End) {
      // 在阶段 2 点击 -> 直接跳到阶段 3 倒数开始
      tutorialTimer = phase2End + 1;
    } else {
      // 在倒数时点击 -> 直接结束教程开始游戏
      tutorialTimer = phase3End + 1;
    }
    return; // 点击加速后不执行后续启动音频操作(如果已经启动过)
  }

  // 2. 如果游戏还没开始，启动游戏(和教程)
  if (!gameStarted) {
    gameStarted = true;
    isTutorial = true;
    tutorialTimer = 0;
  }

  // 3. 游戏结束状态点击 -> 重置游戏
  if (gameOver) {
    resetGame();
    return;
  }

  if (audioStarted) return;

  userStartAudio().then(function () {
    audioStarted = true;
    // 使用中频段、极短促且音量较低的提示音 (Tick / Pop)，避免覆盖高低频人声触发
    catchGoodSound = createPercOsc(600, 50, 'sine', 0.03);
    scoreSound = createPercOsc(800, 150, 'sine', 0.08);

    var el = document.querySelector('.overlay');
    if (el) el.style.display = 'none';
    var canvasEl = document.getElementById('defaultCanvas0');
    if (canvasEl) {
      canvasEl.style.display = 'block';
      canvasEl.style.visibility = 'visible';
    }
  });
}

function keyPressed() {
  if (gameOver && (key === 'r' || key === 'R' || keyCode === 82)) {
    resetGame();
  }
}

function resetGame() {
  gameOver = null;
  leftScore = 0;
  rightScore = 0;
  notes = [];

  // 游戏(倒数结束后)正式开始，才播放背景音乐循环
  if (bgMusic && audioStarted && !bgMusic.isPlaying()) {
    bgMusic.loop();
    bgMusic.setVolume(0.2);
  }

  resetMainBall();
}

function resetMainBall() {
  var angle = random(-PI / 4, PI / 4);
  var dir = random([-1, 1]);
  mainBall = {
    x: width / 2,
    y: height / 2,
    vx: cos(angle) * baseSpeed * dir,
    vy: sin(angle) * baseSpeed,
    r: 25,
    trail: [],
    // 旋转与弹性动画动画属性
    rotAngle: 0,
    rotSpd: dir * 0.02, // 空中自转速度调慢
    scaleX: 1.0,       // X轴缩放 (Squash/Stretch)
    scaleY: 1.0        // Y轴缩放 (Squash/Stretch)
  };
}

// ========== 主循环 (Draw) ==========
function draw() {
  if (!gameStarted) {
    background('#0033B9');
    return;
  }

  background('#0033B9'); // 使用提供的蓝色背景

  if (gameOver) {
    drawGameOver();
    return;
  }

  // 获取频谱
  var spectrum = fft.analyze();

  // Zizi/Cici 摩擦音频段: 更专注于极高频 (6000Hz - 12000Hz)
  // 避开人声的中高频段 (2500 - 5000) 里面可能混杂的其他声音
  var trebleEnergy = fft.getEnergy(6000, 12000);

  // Dongdong/Wuwu 专注极低频共鸣范围 (60Hz - 180Hz)
  // 避开 200Hz 以上泛音较高的部分
  var bassEnergy = fft.getEnergy(60, 180);

  // 分别增强人声响应，并限制最大值为255
  trebleEnergy = constrain(trebleEnergy * trebleEnergyMult, 0, 255);
  bassEnergy = constrain(bassEnergy * bassEnergyMult, 0, 255);

  // 用来控制环境底噪，若总体声音小，就不触发
  var micVol = mic.getLevel();

  drawVisuals(spectrum, bassEnergy, trebleEnergy);

  // 如果是在新手教程期间，不更新也不绘制实体，只画教程文字
  if (isTutorial) {
    tutorialTimer++;
    drawTutorial();

    // 教程持续时间： 5s + 5s + 4s倒数 = 14s (840 frames)
    if (tutorialTimer > 840) {
      isTutorial = false;
      resetGame(); // 教程结束，重置球和分数正式开始
    }
    return;
  }

  // 正常游戏逻辑更新
  updatePaddles();
  updateMainBall();
  handleSpawners(trebleEnergy, bassEnergy, micVol);
  updateNotes();

  // 绘制实体
  drawPaddles();
  drawMainBall();
  drawNotes();

  // 绘制分数
  drawHUD(trebleEnergy, bassEnergy);
}

// ========== 玩家控制 (Player Inputs) ==========
function updatePaddles() {
  var moveSpeed = height * 0.015;
  var offset = width * 0.12;

  leftPaddle.h = height * 0.15;
  rightPaddle.h = height * 0.15;

  // 保持横向比例跟随屏幕缩放
  leftPaddle.x = offset;
  rightPaddle.x = width - offset;

  // 左侧玩家 (W / S) 防守/接音符
  if (keyIsDown(87)) leftPaddle.y -= moveSpeed;
  if (keyIsDown(83)) leftPaddle.y += moveSpeed;

  // 右侧玩家 (↑ / ↓) 防守/接音符
  if (keyIsDown(38)) rightPaddle.y -= moveSpeed;
  if (keyIsDown(40)) rightPaddle.y += moveSpeed;

  leftPaddle.y = constrain(leftPaddle.y, 0, height - leftPaddle.h);
  rightPaddle.y = constrain(rightPaddle.y, 0, height - rightPaddle.h);
}

// ========== 唯一的弹球机制 (Bouncing Ball Mechanics) ==========
function updateMainBall() {
  mainBall.trail.push({ x: mainBall.x, y: mainBall.y });
  if (mainBall.trail.length > 5) mainBall.trail.shift();

  mainBall.x += mainBall.vx;
  mainBall.y += mainBall.vy;

  // 空中自然旋转
  mainBall.rotAngle += mainBall.rotSpd;

  // 弹性动画：每一帧逐渐恢复到 1.0 原比例
  mainBall.scaleX = lerp(mainBall.scaleX, 1.0, 0.15);
  mainBall.scaleY = lerp(mainBall.scaleY, 1.0, 0.15);

  // 碰壁反弹 (上下)
  if (mainBall.y < mainBall.r) {
    mainBall.y = mainBall.r;
    mainBall.vy *= -1;
    mainBall.rotSpd = -mainBall.rotSpd; // 碰壁反转自转方向
    // 撞击上下墙壁，上下压扁，左右拉伸
    mainBall.scaleX = 1.3;
    mainBall.scaleY = 0.5;
  }
  if (mainBall.y > height - mainBall.r) {
    mainBall.y = height - mainBall.r;
    mainBall.vy *= -1;
    mainBall.rotSpd = -mainBall.rotSpd;
    // 撞击上下墙壁，上下压扁，左右拉伸
    mainBall.scaleX = 1.3;
    mainBall.scaleY = 0.5;
  }

  // 与 Paddle 碰撞判定 (接球得分)
  if (rectCircleIntersect(leftPaddle, mainBall)) {
    if (mainBall.vx < 0) {
      mainBall.x = leftPaddle.x + leftPaddle.w / 2 + mainBall.r + 1;
      mainBall.vx = abs(mainBall.vx) * 1.05; // 稍微加速
      // 撞击鼓面侧边，左右压扁，上下拉伸
      mainBall.scaleX = 0.4;
      mainBall.scaleY = 1.6;
      mainBall.rotSpd = random(0.01, 0.04); // 重新给一个随机自转

      leftScore += 1;
      if (kickDrumSound) kickDrumSound.play();
      checkWinCondition();
    }
  }
  if (rectCircleIntersect(rightPaddle, mainBall)) {
    if (mainBall.vx > 0) {
      mainBall.x = rightPaddle.x - rightPaddle.w / 2 - mainBall.r - 1;
      mainBall.vx = -abs(mainBall.vx) * 1.05; // 稍微加速
      // 撞击鼓面侧边，左右压扁，上下拉伸
      mainBall.scaleX = 0.4;
      mainBall.scaleY = 1.6;
      mainBall.rotSpd = random(-0.04, -0.01);

      rightScore += 1;
      if (kickDrumSound) kickDrumSound.play();
      checkWinCondition();
    }
  }

  // 漏球机制 (漏接扣一分)
  if (mainBall.x < -50) {
    if (scoreSound) scoreSound.play();
    if (booSound) booSound.play(0, 1, 1, 0, 2); // 播放 boo sound，持续最多2秒
    leftScore -= 1; // 左侧漏接，扣一分
    checkWinCondition();
    resetMainBall();
  } else if (mainBall.x > width + 50) {
    if (scoreSound) scoreSound.play();
    if (booSound) booSound.play(0, 1, 1, 0, 2); // 播放 boo sound，持续最多2秒
    rightScore -= 1; // 右侧漏接，扣一分
    checkWinCondition();
    resetMainBall();
  }
}

function drawMainBall() {
  // Trail 拖尾
  noFill();
  beginShape();
  stroke(255, 255, 255, 100);
  strokeWeight(mainBall.r);
  for (var j = 0; j < mainBall.trail.length; j++) {
    vertex(mainBall.trail[j].x, mainBall.trail[j].y);
  }
  vertex(mainBall.x, mainBall.y);
  endShape();

  // 本体绘制
  push();
  translate(mainBall.x, mainBall.y);
  rotate(mainBall.rotAngle);
  scale(mainBall.scaleX, mainBall.scaleY);

  if (notationImg) {
    // 画音符图片
    imageMode(CENTER);
    image(notationImg, 0, 0, mainBall.r * 2.5, mainBall.r * 2.5);
    imageMode(CORNER);
  } else {
    // 兜底：如果没有图，画一个转动的方块或圆
    noStroke();
    fill(255);
    ellipse(0, 0, mainBall.r * 2);
  }
  pop();
}

// ========== 声音控制生成干扰红球 (Audio Spawners) ==========
function handleSpawners(trebleEnergy, bassEnergy, micVol) {
  if (leftCooldown > 0) leftCooldown--;
  if (rightCooldown > 0) rightCooldown--;

  // 总音量必须超过底噪阈值
  if (micVol > volThreshold) {

    // 使用绝对能量值来分别判定，因为我们现在分离的频率范围非常远
    // Zizi 必须只检测到了极高频
    var isZizi = trebleEnergy > trebleThreshold;

    // Wuwu 必须只检测到了极低频，且不能带有高频的摩擦音成分
    var isWuwu = bassEnergy > bassThreshold && trebleEnergy < 30;

    // Zizi 触发右侧屏幕红球 (Right Player, spawn to left 向右打)
    if (isZizi && !isWuwu) {
      rightSustain++;
      leftSustain = max(0, leftSustain - 1); // 缓慢衰减
    }
    // Wuwu 触发左侧屏幕红球 (Left Player, spawn to right 向左打)
    else if (isWuwu && !isZizi) {
      leftSustain++;
      rightSustain = max(0, rightSustain - 1);
    }
    else {
      leftSustain = max(0, leftSustain - 1);
      rightSustain = max(0, rightSustain - 1);
    }

  } else {
    // 没声音时也只是缓慢衰减
    leftSustain = max(0, leftSustain - 1);
    rightSustain = max(0, rightSustain - 1);
  }

  // Left Player (Wuwu): triggers RED notes from CENTER to LEFT
  if (leftSustain >= SUSTAIN_TARGET && leftCooldown <= 0) {
    spawnBadNote('left', bassEnergy, bassThreshold);
    leftCooldown = COOLDOWN_TIME + 25;
    leftSustain = 0;
  }

  // Right Player (Zizi): triggers RED notes from CENTER to RIGHT
  if (rightSustain >= SUSTAIN_TARGET && rightCooldown <= 0) {
    spawnBadNote('right', trebleEnergy, trebleThreshold);
    rightCooldown = COOLDOWN_TIME + 25;
    rightSustain = 0;
  }
}

function spawnBadNote(targetSide, energy, threshold) {
  var numNotes;
  if (targetSide === 'left') {
    // Wuwu 触发向左发射干扰球 (原本系数 * 1.44，现在比之前少 1.5倍，约 / 1.5)
    var mappedNum = (map(energy, threshold, 255, 1, 2.99) * 1.44) / 1.5;
    numNotes = floor(mappedNum); // 取消保底 1 颗，如果声音小可能发出 0 颗
  } else {
    // Zizi 触发向右发射干扰球 (原本系数 * 1.2，现在在之前基础上多 1.2倍，约 * 1.2)
    var mappedNum = (map(energy, threshold, 255, 1, 2.99) * 1.2) * 1.2;
    numNotes = floor(mappedNum);
    numNotes = constrain(numNotes, 1, 5); // 上限提升，因为多了
  }

  for (var i = 0; i < numNotes; i++) {
    // 钢琴即在屏幕中央，作为起点
    var startX = width / 2;
    // 在中间钢琴的一定高度范围内随机生成
    var startY = height / 2 + random(-height / 3, height / 3);

    // 速度取决于声音能量
    var baseSpd = map(energy, threshold, 255, 3, 6) + random(-0.5, 0.5);

    notes.push({
      x: startX,
      y: startY,
      vx: targetSide === 'left' ? -baseSpd : baseSpd,
      vy: random(-3, 3), // 给它一个非常大的随机垂直角度 (扇形散开)
      r: 15,
      targetSide: targetSide,
      active: true,
      trail: [],
      // 加入旋转和图片类型
      rotAngle: random(TWO_PI),
      rotSpd: random(0.05, 0.15) * (targetSide === 'left' ? -1 : 1),
      imgType: floor(random(1, 3)) // 1 or 2
    });
  }
}

// 辅助函数：播放萨克斯噪音的一秒片段
function playRandomSaxSnippet() {
  if (saxSound && saxSound.isLoaded()) {
    var dur = saxSound.duration();
    var maxStart = max(0, dur - 0.3); // 预留 0.3 秒完整播放
    var randStart = random(0, maxStart);
    // play(startTime, rate, amp, cueStart, duration)
    saxSound.play(0, 1, 1, randStart, 0.3);
  }
}

// ========== 干扰红球系统 (Notes & Collisions) ==========
function updateNotes() {
  for (var i = notes.length - 1; i >= 0; i--) {
    var n = notes[i];
    if (!n.active) {
      notes.splice(i, 1);
      continue;
    }

    n.trail.push({ x: n.x, y: n.y });
    if (n.trail.length > 5) n.trail.shift();

    n.x += n.vx;
    n.y += n.vy;
    n.rotAngle += n.rotSpd;

    // 出界销毁
    if (n.x < -50 || n.x > width + 50) {
      n.active = false;
      continue;
    }

    // 碰撞判定 (接球扣分)
    if (n.targetSide === 'right') {
      // 从中间飞向右，右侧玩家会被击中
      if (rectCircleIntersect(rightPaddle, n)) {
        n.active = false;
        rightScore -= 1;
        playRandomSaxSnippet();
        checkWinCondition();
      }
    } else {
      // 从中间飞向左，左侧玩家会被击中
      if (rectCircleIntersect(leftPaddle, n)) {
        n.active = false;
        leftScore -= 1;
        playRandomSaxSnippet();
        checkWinCondition();
      }
    }
  }
}

function checkWinCondition() {
  if (leftScore >= WIN_SCORE) gameOver = 'left';
  if (rightScore >= WIN_SCORE) gameOver = 'right';
}

function rectCircleIntersect(rectObj, circleObj) {
  var closestX = constrain(circleObj.x, rectObj.x - rectObj.w / 2, rectObj.x + rectObj.w / 2);
  var closestY = constrain(circleObj.y, rectObj.y, rectObj.y + rectObj.h);
  var dx = circleObj.x - closestX;
  var dy = circleObj.y - closestY;
  return dx * dx + dy * dy <= circleObj.r * circleObj.r;
}

// ========== 视觉效果 (Visuals) ==========
function drawVisuals(spectrum, lEng, rEng) {
  // 1. 周围的音频反应波浪线 (在钢琴键底部)
  drawAudioLines(lEng, rEng);

  // 2. 中线钢琴键装饰
  drawCenterPianoKeys(lEng, rEng);
}

function drawCenterPianoKeys(lEng, rEng) {
  noStroke();
  var midX = width / 2;

  // 钢琴琴键参数
  var pillarW = 200;
  var spacing = 10;
  var numWhiteBlocks = 6;

  // 要铺满 height，算出每个白块的高度
  var blockH = (height - (numWhiteBlocks - 1) * spacing) / numWhiteBlocks;

  // 绘制白块
  fill(255);
  for (var i = 0; i < numWhiteBlocks; i++) {
    var yPos = i * (blockH + spacing);
    rect(midX - pillarW / 2, yPos, pillarW, blockH);
  }

  // 绘制深蓝色的黑键 (#001F6C)
  var numBlueBlocks = numWhiteBlocks - 1; // 黑键正好卡在白块缝隙
  var bBlockW = pillarW * 0.5; // 比白条窄
  var bBlockH = blockH * 0.6;  // 比白条矮

  for (var i = 0; i < numBlueBlocks; i++) {
    // 黑键正好在缝隙的高度居中
    // 第 i 个白块的底边是: (i+1) * blockH + i * spacing
    // 缝隙的中线再加 spacing/2
    var centerY = (i + 1) * blockH + i * spacing + spacing / 2;

    // 左侧玩家触发时，黑键变亮 (可选互动视觉，无震动)
    if (lEng > 100 && i % 2 === 1) fill(50, 80, 200);
    else if (rEng > 100 && i % 2 === 0) fill(50, 80, 200);
    else fill('#001F6C');

    // 垂直居中分布，没有 jitter 震动
    rect(midX - bBlockW / 2 + 50, centerY - bBlockH / 2, bBlockW, bBlockH);
  }
}

// 动态绘制周边的音频折线 (颜色 #001F6C)
function drawAudioLines(lEng, rEng) {
  stroke('#001F6C');
  strokeWeight(2);
  noFill();

  var midX = width / 2;
  var numSegments = 10;
  // 缩短线条长度
  var lineLength = 100;

  // 降低震动幅度上限，使其更加细微
  var lAmp = map(lEng, 0, 255, 2, 45);
  var rAmp = map(rEng, 0, 255, 2, 45);

  // 随机种子，让线条仅每 4 帧（约15fps）变化一次，降低闪烁频率
  // 但是用另一组种子来决定生成“位置”和“方向”，让它们这一整局错落有致但位置固定
  randomSeed(12345);

  // 预先设定这几条线的位置和角度，完全按照你的红线草图标注！
  var leftLines = [
    // 左上：朝左上方发散 (X减少, Y减少)
    { startY: height * 0.15, angle: PI + PI / 6 },
    // 左中：水平朝左 (Y不变)
    { startY: height * 0.50, angle: PI },
    // 左下：朝左下方发散 (X减少, Y增加)
    { startY: height * 0.85, angle: PI - PI / 3 }
  ];

  var rightLines = [
    // 右上：朝右上方发散 (X增加, Y减少)
    { startY: height * 0.15, angle: -PI / 3 },
    // 右中：水平朝右 (稍微偏下一点给飞球让路)
    { startY: height * 0.55, angle: 0 },
    // 右下：朝右下方发散 (X增加, Y增加)
    { startY: height * 0.85, angle: PI / 6 }
  ];

  // 恢复随时间变化的随机种子，用于跳动
  randomSeed(floor(frameCount / 4));

  // 在左侧画几条心电图折线
  for (var k = 0; k < 3; k++) {
    var startY = leftLines[k].startY;
    var startX = midX - 130;  // 之前你调过的起点偏移保留
    var angle = leftLines[k].angle;

    beginShape();
    for (var i = 0; i <= numSegments; i++) {
      var progress = i / numSegments;
      // 沿着基准倒退方向
      var dx = cos(angle) * (lineLength * progress);
      var dy = sin(angle) * (lineLength * progress);

      // 与方向垂直的跳动向量
      var perpAngle = angle + PI / 2;
      var fade = constrain(map(progress, 0, 1, 1, 0.2), 0, 1);
      // yOffset 其实是沿着垂直法线方向跳动
      var jump = random(-lAmp, lAmp) * fade;
      var ox = cos(perpAngle) * jump;
      var oy = sin(perpAngle) * jump;

      vertex(startX + dx + ox, startY + dy + oy);
    }
    endShape();
  }

  // 在右侧画几条心电图折线
  for (var k = 0; k < 3; k++) {
    var startY = rightLines[k].startY;
    var startX = midX + 130;
    var angle = rightLines[k].angle;

    beginShape();
    for (var i = 0; i <= numSegments; i++) {
      var progress = i / numSegments;
      var dx = cos(angle) * (lineLength * progress);
      var dy = sin(angle) * (lineLength * progress);

      var perpAngle = angle + PI / 2;
      var fade = constrain(map(progress, 0, 1, 1, 0.2), 0, 1);
      var jump = random(-rAmp, rAmp) * fade;
      var ox = cos(perpAngle) * jump;
      var oy = sin(perpAngle) * jump;

      vertex(startX + dx + ox, startY + dy + oy);
    }
    endShape();
  }

  randomSeed();
  noStroke();
}

function drawPaddles() {
  imageMode(CENTER);

  // ---------- 绘制鼓面 (Drums) ----------
  var drumW = width * 0.04;
  var drumH = height * 0.16;

  // Left Catcher (Drum L)
  if (drumLImg) {
    image(drumLImg, leftPaddle.x, leftPaddle.y + leftPaddle.h / 2, drumW, drumH);
  } else {
    fill(80, 140, 255);
    rect(leftPaddle.x - leftPaddle.w / 2, leftPaddle.y, leftPaddle.w, leftPaddle.h, 5);
  }

  // Right Catcher (Drum R)
  if (drumRImg) {
    // The visual center is shifted slightly depending on PNG cropped area, tweak size as needed
    image(drumRImg, rightPaddle.x, rightPaddle.y + rightPaddle.h / 2, drumW, drumH);
  } else {
    fill(255, 100, 80);
    rect(rightPaddle.x - rightPaddle.w / 2, rightPaddle.y, rightPaddle.w, rightPaddle.h, 5);
  }

  imageMode(CORNER);
}

function drawNotes() {
  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];

    // Trail 拖尾
    noFill();
    beginShape();
    stroke(255, 50, 50, 100);
    strokeWeight(10);
    for (var j = 0; j < n.trail.length; j++) vertex(n.trail[j].x, n.trail[j].y);
    vertex(n.x, n.y);
    endShape();

    // Body
    push();
    translate(n.x, n.y);
    rotate(n.rotAngle);

    imageMode(CENTER);
    if (n.imgType === 1 && badNote1Img) {
      image(badNote1Img, 0, 0, n.r * 3, n.r * 3);
    } else if (n.imgType === 2 && badNote2Img) {
      image(badNote2Img, 0, 0, n.r * 3, n.r * 3);
    } else {
      // 兜底：如果没有图，画一个红色的转动方块
      fill(255, 40, 40);
      noStroke();
      rectMode(CENTER);
      rect(0, 0, n.r * 2, n.r * 2, 2);
    }

    pop();
  }
}

function updateHTMLScore() {
  var lEl = document.getElementById('scoreLeft');
  var rEl = document.getElementById('scoreRight');
  if (lEl) lEl.innerText = leftScore;
  if (rEl) rEl.innerText = rightScore;
}

function drawHUD(lEng, rEng) {
  updateHTMLScore();

  // 绘制得分数字在 Sidebar 上
  // var barOffset = width * 0.05; // 靠近边缘
  // var scoreY = height * 0.85;   // 放在屏幕下半部

  /*
  push();
  textSize(64);
  textAlign(CENTER, CENTER);
  textFont('Georgia');
  textStyle(BOLD);

  // Left Player Score
  fill(255);
  text(leftScore, barOffset, scoreY);

  // Right Player Score
  fill(255);
  text(rightScore, width - barOffset, scoreY);

  pop();
  */
}

function drawGameOver() {
  background('#0a0a1a');
  textAlign(CENTER, CENTER);
  noStroke();
  textSize(48);

  if (gameOver === 'left') {
    fill(80, 140, 255);
    text("Left Player Wins!", width / 2, height / 2 - 40);
  } else {
    fill(255, 100, 80);
    text("Right Player Wins!", width / 2, height / 2 - 40);
  }

  textSize(24);
  fill(220);
  text("Final Score: " + leftScore + " - " + rightScore, width / 2, height / 2 + 20);

  textSize(16);
  fill(150);
  text("Press 'R' to Restart", width / 2, height / 2 + 80);
}

// ========== 新手教程绘制 (Tutorial Sequence) ==========
function drawTutorial() {
  var fps = 60;
  var phase1End = 5 * fps; // 300 帧 (0-5秒)
  var phase2End = 10 * fps; // 600 帧 (5-10秒)
  var phase3End = 14 * fps; // 840 帧 (10-14秒)

  // 阶段 1：显示顶部左右两边的发声指令，等阶段2出来时消失
  if (tutorialTimer <= phase1End) {
    push();
    imageMode(CENTER);
    var imgW = width * 0.25; // 根据排版大小自适应

    // 根据原图宽高比自适应高度，防止文字被压缩变形
    // Wuwu 是左边，Zizi 是右边
    if (wuwuImg && wuwuImg.width > 0) {
      var h2 = wuwuImg.height * (imgW / wuwuImg.width);
      image(wuwuImg, width * 0.28, height * 0.25, imgW, h2);
    }
    if (ziziImg && ziziImg.width > 0) {
      var h1 = ziziImg.height * (imgW / ziziImg.width);
      image(ziziImg, width * 0.72, height * 0.25, imgW, h1);
    }
    pop();
  }

  // 阶段 2：过了 5 秒后，渐渐显示底部的胜利条件
  if (tutorialTimer > phase1End && tutorialTimer <= phase2End) {
    // 渐显效果 (用 1 秒 = 60 帧逐渐变亮)
    var alphaVal = constrain(map(tutorialTimer, phase1End, phase1End + 60, 0, 255), 0, 255);

    push();
    imageMode(CENTER);
    tint(255, alphaVal);

    var winImgW = width * 0.18;

    if (win10Img1 && win10Img1.width > 0) {
      var wh1 = win10Img1.height * (winImgW / win10Img1.width);
      image(win10Img1, width * 0.25, height * 0.85, winImgW, wh1);
    }
    if (win10Img2 && win10Img2.width > 0) {
      var wh2 = win10Img2.height * (winImgW / win10Img2.width);
      image(win10Img2, width * 0.75, height * 0.85, winImgW, wh2);
    }
    pop();
  }

  // 阶段 3：再过了 5 秒后（即第 10 秒开始），屏幕正中显示倒数
  if (tutorialTimer > phase2End) {
    var countdownTime = tutorialTimer - phase2End; // 0 to 240+
    var countStr = "";
    if (countdownTime < 60) countStr = "3";
    else if (countdownTime < 120) countStr = "2";
    else if (countdownTime < 180) countStr = "1";
    else countStr = "READY... GO!";

    push();
    textAlign(CENTER, CENTER);
    textFont('outfit', 'sans-serif');
    textStyle(BOLD);
    fill(255, 204, 0); // 跳动的强调色
    textSize(width * 0.08); // 跟随屏幕宽度的巨型字体
    text(countStr, width / 2, height / 2);
    pop();
  }
}
