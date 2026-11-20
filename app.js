(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const source = byId('source');
  const output = byId('output');
  const size = byId('size');
  const gridButton = byId('grid');
  const copyButton = byId('copy');
  const notice = byId('notice');
  const directionButtons = document.querySelectorAll('[data-direction]');
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null;
  const isHan = /\p{Script=Han}/u;
  const pageSize = 96;
  const samples = ['书包', '铅笔', '上学'];
  const converters = {};
  let direction = 'forward';
  let result = '';
  let pageIndex = 0;
  let copyTimer;
  let demo = true;
  let generation = 0;
  let graphemes = [];
  let gridOn = readPreference('grid') !== 'off';

  function readPreference(key) {
    try { return localStorage.getItem('zijian.' + key); } catch { return null; }
  }
  function savePreference(key, value) {
    try { localStorage.setItem('zijian.' + key, value); } catch { /* Settings are optional. */ }
  }
  function convert(value, mode) {
    if (!converters[mode]) {
      const forward = mode === 'forward';
      converters[mode] = OpenCC.Converter({from: forward ? 'cn' : 'hk', to: forward ? 'hk' : 'cn'});
    }
    return converters[mode](value);
  }
  function splitGraphemes(value) {
    return segmenter ? Array.from(segmenter.segment(value), part => part.segment) : Array.from(value);
  }
  const paging = document.createElement('div');
  paging.className = 'paging';
  const previous = document.createElement('button');
  const next = document.createElement('button');
  const pageLabel = document.createElement('span');
  previous.type = next.type = 'button';
  previous.textContent = '上一页';
  next.textContent = '下一页';
  paging.append(previous, pageLabel, next);
  byId('paper').after(paging);
  function turnPage(delta) {
    pageIndex += delta;
    draw();
    byId('paper').scrollTop = 0;
    notice.textContent = pageLabel.textContent;
  }
  previous.addEventListener('click', () => turnPage(-1));
  next.addEventListener('click', () => turnPage(1));

  function draw() {
    byId('empty').hidden = result.length > 0;
    output.hidden = result.length === 0;
    output.classList.toggle('gridded', gridOn);
    gridButton.setAttribute('aria-pressed', String(gridOn));
    const totalPages = Math.ceil(graphemes.length / pageSize);
    paging.hidden = !gridOn || totalPages < 2;
    if (!gridOn) {
      output.textContent = result;
      return;
    }
    const fragment = document.createDocumentFragment();
    let plain = '';
    function flushPlain() {
      if (!plain) return;
      const run = document.createElement('span');
      run.className = 'plain-run';
      run.textContent = plain;
      fragment.append(run);
      plain = '';
    }
    for (const char of graphemes.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)) {
      if (!isHan.test(char)) {
        plain += char;
        continue;
      }
      flushPlain();
      const cell = document.createElement('span');
      cell.className = 'char-cell';
      cell.textContent = char;
      fragment.append(cell);
    }
    flushPlain();
    output.replaceChildren(fragment);
    previous.disabled = pageIndex === 0;
    next.disabled = pageIndex + 1 >= totalPages;
    pageLabel.textContent = '第 ' + (pageIndex + 1) + ' / ' + totalPages + ' 页';
  }
  function resetCopy() {
    clearTimeout(copyTimer);
    byId('copy-icon').setAttribute('href', '#icon-copy');
    byId('copy-label').textContent = '复制结果';
  }
  function updateText() {
    generation += 1;
    resetCopy();
    result = convert(source.value, direction);
    graphemes = splitGraphemes(result);
    byId('source-count').textContent = splitGraphemes(source.value).length + ' 字';
    byId('clear').disabled = !source.value;
    copyButton.disabled = !result;
    pageIndex = 0;
    byId('paper').scrollTop = 0;
    draw();
  }
  function setDirection(mode) {
    direction = mode;
    const forward = mode === 'forward';
    source.lang = forward ? 'zh-CN' : 'zh-HK';
    output.lang = forward ? 'zh-HK' : 'zh-CN';
    byId('hero-hint').textContent = forward ? '输入简体字，看香港繁体怎么写。' : '输入香港繁体，查看对应的简体字。';
    byId('source-title').textContent = forward ? '简体原文' : '繁体原文';
    byId('result-title').textContent = forward ? '香港繁体' : '简体结果';
    for (const button of directionButtons) button.setAttribute('aria-pressed', String(button.dataset.direction === mode));
    byId('samples').replaceChildren(...samples.map(sample => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = forward ? sample : convert(sample, 'forward');
      button.lang = source.lang;
      button.addEventListener('click', () => {
        demo = false;
        source.value = button.textContent;
        updateText();
        notice.textContent = '转换结果：' + result;
      });
      return button;
    }));
  }
  for (const button of directionButtons) {
    button.addEventListener('click', () => {
      if (direction === button.dataset.direction) return;
      source.value = result;
      demo = false;
      setDirection(button.dataset.direction);
      updateText();
    });
  }
  function updateSize() {
    const value = Number(size.value);
    output.style.setProperty('--size', value + 'px');
    size.style.setProperty('--fill', ((value - size.min) / (size.max - size.min) * 100) + '%');
    size.setAttribute('aria-valuetext', value + ' 像素');
    byId('size-value').value = value;
  }
  const savedSize = Number(readPreference('size'));
  if (savedSize >= +size.min && savedSize <= +size.max) size.value = savedSize;
  updateSize();
  size.addEventListener('input', () => { updateSize(); savePreference('size', size.value); });
  gridButton.addEventListener('click', () => {
    gridOn = !gridOn;
    savePreference('grid', gridOn ? 'on' : 'off');
    pageIndex = 0;
    byId('paper').scrollTop = 0;
    draw();
  });

  source.addEventListener('focus', () => {
    if (demo) { source.select(); demo = false; }
  });
  source.addEventListener('input', () => { demo = false; updateText(); });
  byId('clear').addEventListener('click', () => {
    demo = false;
    source.value = '';
    updateText();
    source.focus();
    notice.textContent = '已清空';
  });
  for (const button of document.querySelectorAll('[data-example]')) {
    button.addEventListener('click', () => {
      demo = false;
      const sample = button.dataset.example;
      source.value = direction === 'forward' ? sample : convert(sample, 'forward');
      updateText();
      output.scrollIntoView({block:'nearest'});
      notice.textContent = '转换结果：' + result;
    });
  }

  // Older browsers and local files may lack the asynchronous clipboard API.
  function copyWithSelection(value) {
    const buffer = document.createElement('textarea');
    buffer.value = value;
    buffer.className = 'sr';
    buffer.readOnly = true;
    document.body.append(buffer);
    try {
      buffer.select();
      return document.execCommand('copy');
    } finally {
      buffer.remove();
      copyButton.focus({preventScroll:true});
    }
  }
  copyButton.addEventListener('click', async () => {
    const value = result;
    const version = generation;
    let copied = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch { /* Try the local selection fallback. */ }
    if (!copied && version === generation) {
      try { copied = copyWithSelection(value); } catch { /* Offer a manual copy. */ }
    }
    if (version !== generation) return;
    if (!copied) {
      // Select every character, including text beyond the current grid page.
      gridOn = false;
      draw();
      const range = document.createRange();
      range.selectNodeContents(output);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    resetCopy();
    if (copied) byId('copy-icon').setAttribute('href', '#icon-check');
    const message = copied ? '已复制' : '已选中，请复制';
    byId('copy-label').textContent = message;
    notice.textContent = message;
    copyTimer = setTimeout(resetCopy, 2200);
  });

  const dialog = byId('details');
  function showDetails(credits) {
    byId('dialog-title').textContent = credits ? '字库与来源' : '使用说明';
    byId('help-content').hidden = credits;
    byId('credits-content').hidden = !credits;
    dialog.showModal();
    byId('close').focus();
  }
  byId('help-open').addEventListener('click', () => showDetails(false));
  byId('credits-open').addEventListener('click', () => showDetails(true));
  byId('close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });

  if (!window.OpenCC) {
    byId('live').textContent = '词库未载入';
    byId('empty').textContent = '请重新打开网页，并确认网站文件夹中的词库完整。';
    byId('empty').hidden = false;
    copyButton.disabled = true;
    return;
  }
  setDirection('forward');
  updateText();
})();
