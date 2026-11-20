'use strict';
window.ZijianStrokeParts = Object.create(null);
window.createStrokePlayer = function () {
  const byId = id => document.getElementById(id);
  const board = byId('stroke-svg');
  const plain = byId('card-char');
  const play = byId('play-strokes');
  const step = byId('step-stroke');
  const reset = byId('reset-stroke');
  const status = byId('stroke-feedback');
  const loads = new Map();
  let char = '', available = false, data = null;
  let position = 0, frame = 0, playing = false, loading = false;
  let outlines = [], masks = [];
  const svg = (tag, attrs = {}) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, val] of Object.entries(attrs)) e.setAttribute(key, val);
    return e;
  };
  function controls() {
    play.textContent = playing ? '暂停' : (data && position >= data.length ? '重播笔顺' : position > 0 ? '继续播放' : '播放笔顺');
    play.disabled = !available || loading;
    step.disabled = !available || loading || Boolean(data && position >= data.length);
    reset.disabled = !available || board.hidden;
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; playing = false; }
  function choose(c, canPlay) {
    stop(); char = c; available = canPlay; data = null; position = 0; loading = false;
    board.hidden = true; board.setAttribute('hidden',''); plain.hidden = false; board.replaceChildren();
    plain.textContent = c; status.textContent = canPlay ? '可播放或逐笔查看' : '本站暂无该字的逐笔示意';
    controls();
  }
  function loadPart(i) {
    if (window.ZijianStrokeParts[i]) return Promise.resolve(window.ZijianStrokeParts[i]);
    if (!loads.has(i)) {
      loads.set(i, new Promise((resolve,reject) => {
        const source = document.createElement('script');
        source.src = 'assets/strokes/' + i + '.js';
        source.onload = () => window.ZijianStrokeParts[i] ? resolve(window.ZijianStrokeParts[i]) : reject(new Error('missing data'));
        source.onerror = () => reject(new Error('offline'));
        document.head.append(source);
      }).catch(error => { loads.delete(i); throw error; }));
    }
    return loads.get(i);
  }
  async function prepare() {
    if (data) return true;
    const requested = char;
    loading = true; status.textContent = '正在载入笔顺…'; controls();
    try {
      const part = await loadPart(requested.codePointAt(0) % 64);
      if (requested !== char) return false;
      if (!part[char]) throw new Error('missing character');
      data = part[char];
      const group = svg('g',{transform:'translate(0 900) scale(1 -1)'});
      const defs = svg('defs');
      outlines = []; masks = [];
      data.forEach(([outline, points], i) => {
        const ghost = svg('path',{d:outline,fill:'#dce3d6'});
        group.append(ghost);
        const id = 'stroke-clip-' + i;
        const clip = svg('clipPath',{id});
        clip.append(svg('path',{d:outline})); defs.append(clip);
        const ink = svg('path',{d:outline,fill:'#234c3a',opacity:0});
        const trace = svg('path',{d:points.map(([x,y],j)=>(j?'L':'M')+x+' '+y).join(' '),fill:'none',stroke:'#b04c35','stroke-width':205,'stroke-linejoin':'round','stroke-linecap':'round',pathLength:1,'stroke-dasharray':'1 2','stroke-dashoffset':1,opacity:0,'clip-path':'url(#'+id+')'});
        outlines.push(ink); masks.push(trace);
      });
      group.append(...outlines, ...masks);
      board.replaceChildren(defs,group); board.removeAttribute('hidden'); board.hidden = false; plain.hidden = true;
      return true;
    } catch {
      if (char === requested) status.textContent = '笔顺数据未载入，请重试或打开教育局原版。';
      return false;
    } finally { if (requested === char) { loading = false; controls(); } }
  }
  function paint(pos) {
    position = Math.min(pos,data.length);
    const complete = Math.floor(position);
    for (let i=0;i<data.length;i++) {
      const active = i === complete && position > complete;
      outlines[i].setAttribute('opacity',i < complete ? 1 : 0);
      masks[i].setAttribute('opacity',active ? 1 : 0);
      if (active) masks[i].setAttribute('stroke-dashoffset',1-(position-complete));
    }
    const value = '第 ' + Math.min(data.length,Math.ceil(position)) + ' / ' + data.length + ' 笔';
    if (status.textContent !== value) status.textContent = value;
  }
  play.addEventListener('click',async () => {
    if (playing) { stop(); controls(); return; }
    if (!await prepare()) return;
    if (position >= data.length) position = 0;
    playing = true; controls();
    const start = performance.now(), offset = position;
    function tick(now) {
      const pos = offset+(now-start)/630;
      paint(pos);
      if (pos < data.length) frame = requestAnimationFrame(tick);
      else { stop(); controls(); }
    }
    frame = requestAnimationFrame(tick);
  });
  step.addEventListener('click',async () => {
    stop();
    if (await prepare()) { paint(Math.min(data.length,Math.floor(position)+1)); controls(); }
  });
  reset.addEventListener('click',() => choose(char,available));
  return {choose};
};
