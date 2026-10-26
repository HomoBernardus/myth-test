/* ============================================================
 * 交互与计分逻辑
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 状态 ---------- */
  const state = {
    idx: 0,                        // 当前题目下标
    answers: [],                   // 每题选中的维度（按顺序）
    scores: { C: 0, S: 0, E: 0, I: 0 }
  };

  let lastResult = null;           // 最近一次结果（用于生成分享图）

  /* ---------- DOM 工具 ---------- */
  const $ = (id) => document.getElementById(id);
  const screens = {
    gate: $('gate'),
    intro: $('intro'),
    quiz: $('quiz'),
    result: $('result')
  };

  function show(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.remove('is-active'));
    screens[name].classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 密码门 ---------- */
  $('gate-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const val = $('gate-input').value.trim();
    if (val === ACCESS_PASSWORD) {
      $('gate-error').textContent = '';
      $('gate-input').value = '';
      show('intro');
    } else {
      $('gate-error').textContent = '密码不对哦，再试一次吧 🌷';
      $('gate-input').value = '';
      $('gate-input').focus();
    }
  });

  /* ---------- 开始测试 ---------- */
  $('start-btn').addEventListener('click', function () {
    state.idx = 0;
    state.answers = [];
    state.scores = { C: 0, S: 0, E: 0, I: 0 };
    renderQuestion();
    show('quiz');
  });

  /* ---------- 答题 ---------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function renderQuestion() {
    const q = QUESTIONS[state.idx];
    const total = QUESTIONS.length;

    $('progress-text').textContent = (state.idx + 1) + '/' + total;
    $('progress-bar').style.width = ((state.idx + 1) / total * 100) + '%';
    $('question-index').textContent = 'Q' + (state.idx + 1);
    $('question-text').textContent = q.text;
    $('back-btn').style.visibility = state.idx === 0 ? 'hidden' : 'visible';

    const optsEl = $('options');
    optsEl.innerHTML = '';
    const keys = ['A', 'B', 'C', 'D'];
    shuffle(q.options).forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.innerHTML = '<span class="option-key">' + keys[i] + '</span><span>' + opt.text + '</span>';
      btn.addEventListener('click', () => selectOption(opt.dim, btn));
      optsEl.appendChild(btn);
    });
  }

  function selectOption(dim, btn) {
    if ($('options').querySelector('.option.selected')) return; // 防重复点击

    btn.classList.add('selected');
    state.answers.push(dim);
    state.scores[dim] += 1;

    setTimeout(() => {
      if (state.idx < QUESTIONS.length - 1) {
        state.idx += 1;
        renderQuestion();
      } else {
        showResult();
      }
    }, 260);
  }

  $('back-btn').addEventListener('click', function () {
    if (state.idx === 0) return;
    const last = state.answers.pop();
    state.scores[last] -= 1;
    state.idx -= 1;
    renderQuestion();
  });

  /* ---------- 计分 ----------
   * 24 题每题 1 分，随机作答每维约 6 分。
   * 把「约 6 分 = 中性 50 分」映射到 0~100，便于和结果画像比较 */
  function toPercent(raw) {
    const v = 50 + (raw - 6) * (50 / 18);
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  function computeScores() {
    const p = {};
    DIM_ORDER.forEach((k) => { p[k] = toPercent(state.scores[k]); });
    return p;
  }

  function distance(a, b) {
    let sum = 0;
    DIM_ORDER.forEach((k) => { sum += Math.pow(a[k] - b[k], 2); });
    return Math.sqrt(sum);
  }

  function rankResults(scores) {
    return RESULTS
      .map((r) => {
        const d = distance(scores, r.profile);
        return { result: r, dist: d, fit: Math.max(5, Math.min(100, Math.round(100 - d))) };
      })
      .sort((x, y) => x.dist - y.dist);
  }

  /* ---------- 结果页 ---------- */
  function showResult() {
    const scores = computeScores();
    const ranked = rankResults(scores);
    const best = ranked[0];

    $('result-emoji').textContent = best.result.emoji;
    $('result-name').textContent = best.result.name;
    $('result-tagline').textContent = best.result.tagline;
    $('match-score').textContent = '契合度 ' + best.fit + '%';
    $('result-why').textContent = best.result.why;
    $('result-first-step').textContent = best.result.firstStep;
    $('result-monetize').textContent = best.result.monetize;
    $('result-pitfall').textContent = best.result.pitfall;

    drawRadar(scores, best.result.profile);
    renderDimAnalysis(scores);
    renderBackups(ranked.slice(1, 3));

    lastResult = { result: best.result, fit: best.fit, scores: scores };

    show('result');
  }

  /* ---------- 四维雷达图（SVG） ---------- */
  function drawRadar(scores, ideal) {
    const container = $('radar');
    container.innerHTML = '';
    const NS = 'http://www.w3.org/2000/svg';
    const cx = 190, cy = 170, R = 100, labelTop = 40, labelBottom = 300;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 380 340');

    const pt = (k, value) => {
      const angle = -Math.PI / 2 + k * Math.PI / 2;
      const r = R * (value / 100);
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    };
    const ptsStr = (values) => DIM_ORDER.map((key, i) => {
      const p = pt(i, values[key]);
      return p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }).join(' ');

    /* 网格环 */
    [25, 50, 75, 100].forEach((level) => {
      const poly = document.createElementNS(NS, 'polygon');
      const pts = DIM_ORDER.map((_, i) => pt(i, level).map((n) => n.toFixed(1)).join(','));
      poly.setAttribute('points', pts.join(' '));
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', '#F3E4D8');
      poly.setAttribute('stroke-width', '1');
      svg.appendChild(poly);
    });

    /* 轴线 */
    DIM_ORDER.forEach((_, i) => {
      const p = pt(i, 100);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', cx); line.setAttribute('y1', cy);
      line.setAttribute('x2', p[0]); line.setAttribute('y2', p[1]);
      line.setAttribute('stroke', '#F3E4D8');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    });

    /* 理想画像（虚线，绿） */
    const idealPoly = document.createElementNS(NS, 'polygon');
    idealPoly.setAttribute('points', ptsStr(ideal));
    idealPoly.setAttribute('fill', 'rgba(168,198,163,0.18)');
    idealPoly.setAttribute('stroke', '#A8C6A3');
    idealPoly.setAttribute('stroke-width', '2');
    idealPoly.setAttribute('stroke-dasharray', '6 5');
    svg.appendChild(idealPoly);

    /* 用户得分（实线填充，珊瑚） */
    const userPoly = document.createElementNS(NS, 'polygon');
    userPoly.setAttribute('points', ptsStr(scores));
    userPoly.setAttribute('fill', 'rgba(242,145,139,0.32)');
    userPoly.setAttribute('stroke', '#F2918B');
    userPoly.setAttribute('stroke-width', '2.5');
    userPoly.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(userPoly);

    /* 顶点圆点 */
    DIM_ORDER.forEach((key, i) => {
      const p = pt(i, scores[key]);
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', '4');
      c.setAttribute('fill', '#F2918B');
      svg.appendChild(c);
    });

    /* 维度标签 */
    const labelCfg = [
      { x: cx, y: labelTop, anchor: 'middle' },               // 上
      { x: cx + R + 16, y: cy, anchor: 'start' },             // 右
      { x: cx, y: labelBottom, anchor: 'middle' },            // 下
      { x: cx - R - 16, y: cy, anchor: 'end' }                // 左
    ];
    DIM_ORDER.forEach((key, i) => {
      const cfg = labelCfg[i];
      const dim = DIMENSIONS[key];
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', cfg.x); t.setAttribute('y', cfg.y);
      t.setAttribute('text-anchor', cfg.anchor);
      t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('font-size', '14');
      t.setAttribute('font-weight', '700');
      t.setAttribute('fill', '#5B4B44');
      t.textContent = dim.emoji + ' ' + dim.name + ' ' + scores[key];
      svg.appendChild(t);
    });

    container.appendChild(svg);
  }

  /* ---------- 四维分析 ---------- */
  function renderDimAnalysis(scores) {
    const el = $('dim-analysis');
    el.innerHTML = '';
    DIM_ORDER.forEach((key) => {
      const dim = DIMENSIONS[key];
      const score = scores[key];
      const tier = score >= 70 ? 'high' : (score < 40 ? 'low' : 'mid');
      const item = document.createElement('div');
      item.className = 'dim-item';
      item.innerHTML =
        '<div class="dim-head"><span class="dim-name">' + dim.emoji + ' ' + dim.name + '</span>' +
        '<span class="dim-score">' + score + ' 分</span></div>' +
        '<div class="dim-bar"><div class="dim-bar-fill" data-w="' + score + '"></div></div>' +
        '<p class="dim-text">' + dim[tier] + '</p>' +
        '<p class="dim-advice">💡 ' + dim.advice + '</p>';
      el.appendChild(item);
    });
    requestAnimationFrame(() => {
      el.querySelectorAll('.dim-bar-fill').forEach((bar) => {
        bar.style.width = bar.getAttribute('data-w') + '%';
      });
    });
  }

  /* ---------- 备选方向 ---------- */
  function renderBackups(backups) {
    const el = $('backup-results');
    el.innerHTML = '';
    backups.forEach((b) => {
      const div = document.createElement('div');
      div.className = 'backup-item';
      div.innerHTML =
        '<span class="backup-emoji">' + b.result.emoji + '</span>' +
        '<div class="backup-info"><div class="backup-name">' + b.result.name + '</div>' +
        '<div class="backup-tagline">' + b.result.tagline + '</div></div>' +
        '<span class="backup-score">' + b.fit + '%</span>';
      el.appendChild(div);
    });
  }

  /* ---------- 复制结果 ---------- */
  $('copy-btn').addEventListener('click', function () {
    const text =
      '✨ 我测出最适合我的副业是「' + $('result-name').textContent + '」！\n' +
      $('result-tagline').textContent + '\n\n你也来测测吧 💕';
    copyText(text);
  });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('已复制，去分享吧 ✨'))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('已复制，去分享吧 ✨'); }
    catch (e) { showToast('复制失败，请手动截图分享'); }
    document.body.removeChild(ta);
  }
  function showToast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2000);
  }

  /* ---------- 保存结果图片（Canvas 生成分享图） ---------- */
  $('save-btn').addEventListener('click', function () {
    if (!lastResult) return;
    const canvas = drawShareCard(lastResult.result, lastResult.fit, lastResult.scores);
    showShareModal(canvas.toDataURL('image/png'));
  });

  function showShareModal(dataURL) {
    $('share-img').src = dataURL;
    $('share-download').href = dataURL;
    $('share-download').setAttribute('download', '副业天赋测试-' + lastResult.result.name + '.png');
    $('share-modal').style.display = 'flex';
  }

  function closeShareModal() {
    $('share-modal').style.display = 'none';
  }
  /* 暴露到全局，供内联 onclick 调用（兼容各种内嵌浏览器） */
  window.closeShareModal = closeShareModal;

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeShareModal();
  });

  /* 绘制 1080×1440 的分享图 */
  function drawShareCard(result, fit, scores) {
    const W = 1080, H = 1440;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const cx = W / 2;
    const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
    const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji",sans-serif';

    /* 背景 */
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#FFF7F0');
    bg.addColorStop(1, '#FFEFE4');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* 装饰圆 */
    ctx.fillStyle = 'rgba(242,145,139,0.10)';
    ctx.beginPath(); ctx.arc(70, 110, 130, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(1010, 1320, 170, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(168,198,163,0.12)';
    ctx.beginPath(); ctx.arc(1030, 170, 100, 0, Math.PI * 2); ctx.fill();

    /* 白色卡片 */
    ctx.save();
    ctx.shadowColor = 'rgba(242,145,139,0.22)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#FFFFFF';
    drawRoundRect(ctx, 48, 48, W - 96, H - 96, 44);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    /* 顶部小标题 */
    ctx.fillStyle = '#C4B5AC';
    ctx.font = '400 30px ' + FONT;
    ctx.fillText('✨ 副业天赋测试 ✨', cx, 130);

    /* 主标题 */
    ctx.fillStyle = '#5B4B44';
    ctx.font = '800 54px ' + FONT;
    ctx.fillText('测试你适合什么副业', cx, 192);

    /* 结果 emoji */
    ctx.font = '110px ' + EMOJI_FONT;
    ctx.fillText(result.emoji, cx, 322);

    /* 结果名 */
    ctx.fillStyle = '#E8786F';
    ctx.font = '800 58px ' + FONT;
    ctx.fillText(result.name, cx, 398);

    /* 一句话 */
    ctx.fillStyle = '#9C8B82';
    ctx.font = '400 28px ' + FONT;
    wrapText(ctx, result.tagline, cx, 446, 800, 40, 2);

    /* 契合度徽章 */
    drawPill(ctx, cx, 508, '契合度 ' + fit + '%', 30, '#F2918B');

    /* 四维雷达图 */
    drawRadar2D(ctx, cx, 755, 155, scores, result.profile);

    /* 四维条形 */
    const barStart = 992;
    ctx.textBaseline = 'middle';
    DIM_ORDER.forEach(function (key, i) {
      const dim = DIMENSIONS[key];
      const score = scores[key];
      const y = barStart + i * 62;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#5B4B44';
      ctx.font = '700 30px ' + FONT;
      ctx.fillText(dim.emoji + ' ' + dim.name, 112, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#E8786F';
      ctx.font = '800 30px ' + FONT;
      ctx.fillText(score + '分', W - 112, y);

      /* 轨道 */
      const tx = 350, tw = W - 350 - 150;
      ctx.fillStyle = '#F6EDE4';
      drawRoundRect(ctx, tx, y - 11, tw, 22, 11);
      ctx.fill();

      /* 填充 */
      const grad = ctx.createLinearGradient(tx, 0, tx + tw, 0);
      grad.addColorStop(0, '#FFD3A8');
      grad.addColorStop(1, '#F2918B');
      ctx.fillStyle = grad;
      drawRoundRect(ctx, tx, y - 11, Math.max(22, tw * score / 100), 22, 11);
      ctx.fill();
    });

    /* 页脚 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#C4B5AC';
    ctx.font = '400 24px ' + FONT;
    ctx.fillText('结果仅供娱乐参考 · 找到属于你的方向 💕', cx, H - 72);

    return canvas;
  }

  /* 圆角矩形 */
  function drawRoundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 居中渐变徽章 */
  function drawPill(ctx, cx, cy, text, fontSize, color) {
    ctx.font = '700 ' + fontSize + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    const w = ctx.measureText(text).width + 56;
    const h = fontSize + 24;
    const x = cx - w / 2, y = cy - h / 2;
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#FFB6A3');
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    drawRoundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 1);
  }

  /* 自动换行（居中） */
  function wrapText(ctx, text, cx, y, maxWidth, lineHeight, maxLines) {
    const chars = Array.from(text);
    const lines = [];
    let line = '';
    for (let i = 0; i < chars.length; i++) {
      const test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = chars[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/…$/, '') + '…';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    lines.forEach(function (l, i) {
      ctx.fillText(l, cx, y + i * lineHeight);
    });
  }

  /* 2D 四维雷达图 */
  function drawRadar2D(ctx, cx, cy, R, scores, ideal) {
    const keys = DIM_ORDER;
    const pt = function (i, val) {
      const angle = -Math.PI / 2 + i * Math.PI / 2;
      const r = R * val / 100;
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    };
    const trace = function (values) {
      keys.forEach(function (k, i) {
        const p = pt(i, values[k]);
        if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      });
      ctx.closePath();
    };

    /* 网格环 + 轴线 */
    [25, 50, 75, 100].forEach(function (level) {
      ctx.beginPath();
      keys.forEach(function (k, i) {
        const p = pt(i, level);
        if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      });
      ctx.closePath();
      ctx.strokeStyle = '#F3E4D8';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    keys.forEach(function (k, i) {
      const p = pt(i, 100);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = '#F3E4D8';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    /* 理想画像（虚线，绿） */
    ctx.beginPath();
    trace(ideal);
    ctx.fillStyle = 'rgba(168,198,163,0.22)';
    ctx.fill();
    ctx.strokeStyle = '#A8C6A3';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    /* 用户得分（实线，珊瑚） */
    ctx.beginPath();
    trace(scores);
    ctx.fillStyle = 'rgba(242,145,139,0.36)';
    ctx.fill();
    ctx.strokeStyle = '#F2918B';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    /* 顶点圆点 */
    keys.forEach(function (k, i) {
      const p = pt(i, scores[k]);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
      ctx.fillStyle = '#F2918B';
      ctx.fill();
    });

    /* 标签 */
    const labels = [
      { x: cx, y: cy - R - 46, align: 'center' },
      { x: cx + R + 40, y: cy, align: 'left' },
      { x: cx, y: cy + R + 52, align: 'center' },
      { x: cx - R - 40, y: cy, align: 'right' }
    ];
    keys.forEach(function (k, i) {
      const dim = DIMENSIONS[k];
      const pos = labels[i];
      ctx.textAlign = pos.align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#5B4B44';
      ctx.font = '700 28px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(dim.emoji + ' ' + dim.name + ' ' + scores[k], pos.x, pos.y);
    });
  }

  /* ---------- 重新测试 ---------- */
  $('restart-btn').addEventListener('click', function () {
    show('intro');
  });
})();
