// 排行榜：使用 localStorage 保存历史战绩，展示前 10 名
(function (global) {
  var STORAGE_KEY = 'whiplash.leaderboard.v1';
  var MAX_ENTRIES = 10;

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (e) {
        return e && typeof e.name === 'string' && typeof e.score === 'number';
      });
    } catch (err) {
      return [];
    }
  }

  function save(entries) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      // 隐私模式等场景下写入失败，忽略即可
    }
  }

  function sortEntries(entries) {
    return entries.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.margin !== b.margin) return (b.margin || 0) - (a.margin || 0);
      return (a.date || 0) - (b.date || 0);
    });
  }

  function add(entry) {
    var entries = load();
    entries.push({
      name: (entry.name || 'Anonymous').slice(0, 16),
      side: entry.side === 'right' ? 'right' : 'left',
      score: entry.score,
      opponentScore: entry.opponentScore,
      margin: entry.score - entry.opponentScore,
      date: Date.now()
    });
    entries = sortEntries(entries).slice(0, MAX_ENTRIES);
    save(entries);
    return entries;
  }

  function clear() {
    save([]);
    render();
  }

  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function render() {
    var body = document.getElementById('leaderboardBody');
    if (!body) return;
    var entries = sortEntries(load());
    if (entries.length === 0) {
      body.innerHTML = '<div class="lb-empty">暂无记录，赢下一局来登榜吧！</div>';
      return;
    }
    var rows = entries.map(function (e, i) {
      return '<div class="lb-row">' +
        '<span class="lb-rank">' + (i + 1) + '</span>' +
        '<span class="lb-name"></span>' +
        '<span class="lb-side">' + (e.side === 'right' ? 'RIGHT' : 'LEFT') + '</span>' +
        '<span class="lb-score">' + e.score + ' : ' + e.opponentScore + '</span>' +
        '<span class="lb-date">' + formatDate(e.date) + '</span>' +
        '</div>';
    }).join('');
    body.innerHTML = rows;
    // 用 textContent 写入名字，避免 HTML 注入
    var nameEls = body.querySelectorAll('.lb-name');
    for (var i = 0; i < nameEls.length; i++) {
      nameEls[i].textContent = entries[i].name;
    }
  }

  function show() {
    render();
    var panel = document.getElementById('leaderboardPanel');
    if (panel) panel.style.display = 'flex';
  }

  function hide() {
    var panel = document.getElementById('leaderboardPanel');
    if (panel) panel.style.display = 'none';
  }

  // 游戏结束时记录胜者成绩
  function recordResult(winnerSide, leftScore, rightScore) {
    var winnerScore = winnerSide === 'left' ? leftScore : rightScore;
    var loserScore = winnerSide === 'left' ? rightScore : leftScore;
    var label = winnerSide === 'left' ? '左侧玩家' : '右侧玩家';
    var name = null;
    try {
      name = global.prompt('恭喜' + label + '获胜！输入名字登上排行榜：', label);
    } catch (err) {
      name = null;
    }
    if (name === null) return;
    name = name.trim() || label;
    add({ name: name, side: winnerSide, score: winnerScore, opponentScore: loserScore });
    show();
  }

  function init() {
    var openBtn = document.getElementById('leaderboardBtn');
    if (openBtn) openBtn.addEventListener('click', show);
    var closeBtn = document.getElementById('leaderboardCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', hide);
    var clearBtn = document.getElementById('leaderboardClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (global.confirm('确定清空排行榜？')) clear();
    });
    var panel = document.getElementById('leaderboardPanel');
    if (panel) panel.addEventListener('click', function (e) {
      if (e.target === panel) hide();
    });
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.Leaderboard = {
    load: load,
    add: add,
    clear: clear,
    render: render,
    show: show,
    hide: hide,
    recordResult: recordResult
  };
})(window);
