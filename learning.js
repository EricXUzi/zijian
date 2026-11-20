(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const library = window.ZijianLearningData;
  if (!library || !window.OpenCC) {
    el('lookup-feedback').textContent = '字词索引载入失败，请刷新页面。';
    el('learn-card').hidden = true;
    el('word-section').hidden = true;
    return;
  }
  const toHK = OpenCC.Converter({from:'cn',to:'hk'});
  const toSC = OpenCC.Converter({from:'hk',to:'cn'});
  const records = new Map(library.characters.map(([char,id,strokes,radical,jyut,pinyin,gloss,animated]) =>
    [char,{char,id,strokes,radical,jyut,pinyin,gloss,animated}]));
  const wordRows = library.words.map(([text,jyut,level,id,mandarin])=>({text,jyut,level,id,mandarin}));
  const words = new Map(wordRows.map(w=>[w.text,w]));
  const wordsByChar = new Map();
  for (const w of wordRows) for (const c of new Set(w.text)) {
    if (!wordsByChar.has(c)) wordsByChar.set(c,[]);
    wordsByChar.get(c).push(w);
  }
  const mode = el('lookup-mode'), input = el('lookup-query');
  const samples = {
    char:['学校','头发','書包'],strokes:['6','12','16'],
    jyut:['hok6','zi6','syu1'],pinyin:['xué','shu1','zi4']
  };
  const hints = {char:'例如：学校、头发',strokes:'输入笔画数，例如 16',jyut:'例如：hok6，也可输入 hok',pinyin:'例如：xué、xue2 或 xue'};
  // Stroke groups follow the HK Education Bureau picker. Roots use the index's spelling.
  const rootGroups = {
    1:'一丨丶丿乙亅',2:'二亠人儿入八冂冖冫几凵刀力勹匕匸匚十卜卩厂厶又',
    3:'口囗土士夊夕大女子宀寸小尢尸屮山巛工己巾干幺广廴廾弋弓彐彡彳',
    4:'心戈戶手支攴文斗斤方无日曰月木欠止歹殳毋比毛氏气水火爪父爻爿片牙牛犬',
    5:'玄玉瓜瓦甘生用田疋疒癶白皮皿目矛矢石示禸禾穴立',
    6:'竹米糸缶网羊羽老而耒耳聿肉臣自至臼舌舛舟艮色艸虍虫血行衣襾',
    7:'見角言谷豆豕豸貝赤走足身車辛辰辵邑酉釆里',8:'金長門阜隶隹雨靑非',
    9:'面革韋韭音頁風飛食首香',10:'馬骨高髟鬥鬯鬼',11:'魚鳥鹵鹿麥麻',12:'黃黍黑',
    13:'黽鼎鼓鼠',14:'鼻齊',15:'齒',16:'龍',18:'龜'
  };
  // Positional forms map to the same dictionary root. Left and right 阝 have different roots.
  const forms = [
    ['氵','水','三点水','3'],['扌','手','提手旁','3'],['亻','人','单人旁','2'],
    ['忄','心','竖心旁','3'],['口','口','口字旁','3'],['木','木','木字旁','4'],
    ['艹','艸','草字头','3 4'],['訁','言','言字旁','7'],['辶','辵','走之','3 4'],
    ['糹','糸','绞丝旁','6'],['宀','宀','宝盖头','3'],['日','日','日字旁','4'],
    ['讠','言','简体言字旁','2'],['纟','糸','简体绞丝旁','3'],['阝','阜','左耳旁','2 3'],['阝','邑','右耳旁','2 3'],
    ['冫','冫','两点水','2'],['刂','刀','立刀旁','2'],['犭','犬','反犬旁','3'],['彳','彳','双人旁','3'],
    ['女','女','女字旁','3'],['土','土','提土旁','3'],['囗','囗','方框儿','3'],['灬','火','四点底','4'],
    ['爫','爪','爪字头','4'],['攵','攴','反文旁','4'],['王','玉','王字旁','4'],['牜','牛','牛字旁','4'],
    ['礻','示','示字旁','4'],['衤','衣','衣字旁','5'],['罒','网','网字头','5'],['耂','老','老字头','4'],
    ['⺮','竹','竹字头','6'],['⻊','足','足字旁','7'],['釒','金','金字旁','8'],['钅','金','简体金字旁','5'],
    ['飠','食','食字旁','8'],['饣','食','简体食字旁','3'],['月','肉','肉月旁','4'],['月','月','月字旁','4']
  ];
  const commonGlyphs = new Set(['氵','扌','亻','忄','口','木','艹','訁','辶','糹','宀','日','讠','阝']);
  const indexedRoots = new Set([...records.values()].map(r=>r.radical));
  const radicalChoices = forms.filter(([,root])=>indexedRoots.has(root));
  for (const [count,roots] of Object.entries(rootGroups)) {
    for (const root of roots) {
      if (indexedRoots.has(root) && !radicalChoices.some(([glyph,r])=>glyph===root && r===root)) {
        radicalChoices.push([root,root,'',count]);
      }
    }
  }
  let pickedRadical = null;
  const base = 'https://www.edbchinese.hk/';
  const player = window.createStrokePlayer();
  const hkCollator = new Intl.Collator('zh-HK');
  let matches = [], selected = '', shown = 40, wordLimit = 5;
  let activeAudio = null, audioSerial = 0;
  const han = /\p{Script=Han}/u;
  const toneMarks = {'\u0304':'1','\u0301':'2','\u030c':'3','\u0300':'4'};
  function pinyinCode(raw) {
    const value = raw.toLowerCase().replaceAll('u:','ü').normalize('NFD');
    let text = '', tone = '';
    for (const c of value) {
      if (toneMarks[c]) tone = toneMarks[c];
      else if (c==='\u0308' && text.endsWith('u')) text=text.slice(0,-1)+'v';
      else text+=c;
    }
    return text + (/\d$/.test(text) ? '' : tone);
  }
  function phoneticMatch(value,query) {
    return /\d$/.test(query) ? value === query || (query.endsWith('5') && value === query.slice(0,-1))
      : value.startsWith(query);
  }
  function button(label,handler,className) {
    const b=document.createElement('button'); b.type='button'; b.textContent=label;
    if (className) b.className=className;
    b.addEventListener('click',handler); return b;
  }
  function stopAudio() {
    audioSerial++;
    if (activeAudio) { activeAudio.onended = activeAudio.onerror = null; activeAudio.pause(); activeAudio=null; }
  }
  function playReading(language, syllables) {
    stopAudio();
    const serial=audioSerial;
    const path=language==='jyut'?'jyutping':'pinyin';
    const parts=syllables.split(/\s+/).map(s=>language==='jyut'||/^[a-z]+[1-5](?:-[A-Z])?$/.test(s)?s:pinyinCode(s));
    const message=el('audio-tip'); let index=0;
    function failed() {
      if (serial===audioSerial) message.textContent='这段录音暂未能播放，可在下方的官方字卡核对读音。';
    }
    function playNext() {
      if (serial!==audioSerial) return;
      if (index>=parts.length) { message.textContent='播放完毕。'; activeAudio=null; return; }
      let code=parts[index++];
      if (!/^[a-z]+[1-6]?(?:-[A-Z])?$/.test(code)) { failed(); return; }
      if (language==='pinyin' && !/\d/.test(code)) code+='5';
      const audio=new Audio(); activeAudio=audio;
      audio.onended=playNext; audio.onerror=failed;
      audio.src=base+'EmbziciwebRes/'+path+'/'+code+'.mp3';
      message.textContent='正在播放 '+syllables;
      audio.play().catch(failed);
    }
    playNext();
  }
  function romanize(b) {
    const text=b.dataset.jyut, scheme=el('official-scheme').value;
    const readings=text.split(' ');
    const table=library.systems[scheme];
    if (!table) { b.textContent=text; return; }
    b.textContent=readings.every(r=>table[r]) ? readings.map(r=>table[r]).join(' ') : text+'（粤拼）';
  }
  function withTone(syllable) {
    const matched=syllable.match(/^([a-z]+)([1-5])(?:-[A-Z])?$/);
    if (!matched) return syllable;
    const base=matched[1].replaceAll('v','ü'), tone=Number(matched[2]);
    if (tone===5) return base;
    const chars=Array.from(base);
    let i=chars.indexOf('a');
    if (i<0) i=chars.indexOf('e');
    if (i<0 && base.includes('ou')) i=chars.indexOf('o');
    if (i<0) i=chars.findLastIndex(c=>'iouü'.includes(c));
    if (i<0) i=chars.findIndex(c=>'nm'.includes(c));
    if (i<0) return base;
    chars[i]+=['','\u0304','\u0301','\u030c','\u0300'][tone];
    return chars.join('').normalize('NFC');
  }
  function audioButton(reading,lang) {
    const label=lang==='pinyin'?reading.split(' ').map(withTone).join(' '):reading;
    const b=button(label,()=>playReading(lang,reading),'listen');
    b.dataset.lang=lang;
    if (lang==='jyut') { b.dataset.jyut=reading; romanize(b); }
    b.setAttribute('aria-label','播放'+(lang==='jyut'?'粤语 ':'普通话 ')+reading);
    b.title='播放教育局录音'; return b;
  }
  function readingButtons(id,values,lang) {
    const box=el(id);box.replaceChildren(...values.map(v=>audioButton(v,lang)));
    if (!values.length) box.textContent='暂无读音';
  }
  function officialURL(id,english=false) {
    const url=new URL((english?'lexlist_en':'lexlist_ch')+'/result.jsp',base);
    url.search=new URLSearchParams({id,sortBy:el('official-sort').value,jpC:el('official-scheme').value});
    return url;
  }
  function officialLinks() {
    const record=records.get(selected);
    const hasId=Boolean(record?.id);
    el('official-options').hidden=!hasId;el('official-demo').hidden=!hasId;
    if (!hasId) return;
    const url=officialURL(record.id);
    el('official-card').href=url;
    el('official-english').href=officialURL(record.id,true);
    const terms=new URL(url);terms.hash='tblCi';el('official-words').href=terms;
    // The full character page also handles supplemental entries without a separate animation.
    el('official-demo').href=url;
    el('official-demo').textContent=record.id.startsWith('ZC')?'查看教育局原条目 ↗':'看教育局原版笔顺 ↗';
  }
  function strokeCompare(a,b) {
    const x=Array.from(a),y=Array.from(b);
    for (let i=0;i<Math.min(x.length,y.length);i++) {
      const diff=(records.get(x[i])?.strokes||100)-(records.get(y[i])?.strokes||100);
      if (diff) return diff;
      if (x[i]!==y[i]) return hkCollator.compare(x[i],y[i]);
    }
    return x.length-y.length;
  }
  function renderWords() {
    const stage=el('word-stage').value;
    const all=wordsByChar.get(selected)||[];
    const list=all.filter(w=>stage==='all'||w.level===Number(stage)).sort((a,b)=>{
      const byStage=el('word-sort').value==='stage' ? (a.level||3)-(b.level||3) : 0;
      return byStage || strokeCompare(a.text,b.text);
    });
    const box=el('word-list');box.replaceChildren();
    for (const word of list.slice(0,wordLimit)) {
      const line=document.createElement('div');line.className='word-line';
      const title=button(word.text,()=>lookupText(word.text,true),'word-name'); title.lang='zh-HK';
      const reads=document.createElement('div'); reads.className='word-readings';
      if (word.jyut[0]) reads.append(audioButton(word.jyut[0],'jyut'));
      if (word.mandarin) reads.append(audioButton(word.mandarin,'pinyin'));
      const level=document.createElement('span');level.className='word-level';
      level.textContent=word.level===1?'小一至小三':word.level===2?'小四至小六':'未标学段';
      if (word.id) {
        const ref=document.createElement('a');ref.href=officialURL(word.id)+'#tblCi';ref.target='_blank';ref.rel='noopener noreferrer';
        ref.title='在教育局字卡核对学段';ref.textContent=level.textContent+' ↗';level.replaceChildren(ref);
      }
      line.append(title,reads,level);box.append(line);
    }
    el('more-words').hidden=list.length<=wordLimit;
    el('word-note').textContent=list.length ? '本页选录 '+list.length+' 个词，可点词查看组成字。' :
      (stage==='all'?'本站暂未选录含这个字的校园词。':'本页暂未收录这个学段的相关词。')+(records.get(selected)?.id?'可在官方字卡查看完整配词。':'');
  }
  function card(c) {
    const r=records.get(c);
    selected=c;stopAudio();wordLimit=5;
    el('learn-card').hidden=!r;el('word-section').hidden=!r;
    if (!r) { player.choose('',false);return; }
    player.choose(c,Boolean(r.animated));
    el('audio-tip').textContent='点拼音播放教育局读音，需联网。';
    const simple=toSC(c);
    el('card-title').textContent='「'+c+'」的字卡';
    el('card-meta').textContent=[simple!==c?'简体「'+simple+'」':'',r.radical?r.radical+'部':'',r.strokes?r.strokes+' 画':''].filter(Boolean).join(' · ');
    readingButtons('card-jyut',r.jyut,'jyut');readingButtons('card-pinyin',r.pinyin,'pinyin');
    el('card-gloss').textContent=r.gloss?'英文释义　'+r.gloss:'';el('card-gloss').hidden=!r.gloss;
    officialLinks();renderWords();
    el('lookup-matches').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===c)));
  }
  function showChoices() {
    const box=el('lookup-matches');box.replaceChildren();
    for (const c of matches.slice(0,shown)) {
      const b=button(c,()=>card(c),'match');b.lang='zh-HK';b.setAttribute('aria-pressed',String(c===selected));box.append(b);
    }
    el('more-matches').hidden=shown>=matches.length;
  }
  function search() {
    let list=[], error='', phrase='';
    const choice=mode.value;
    const query=input.value.trim();
    if (choice==='radical') {
      if (pickedRadical) list=[...records.values()].filter(r=>r.radical===pickedRadical[1]).map(r=>r.char);
    } else if (!query) error='请输入要查的字、读音或笔画数。';
    else if (choice==='char') {
      phrase=toHK(query);
      const letters=Array.from(phrase).filter(c=>han.test(c));
      // Preserve an exact indexed single-character lookup as well as its converted variant.
      if (Array.from(query).length===1 && records.has(query) && !letters.includes(query)) letters.unshift(query);
      list=[...new Set(letters)].filter(c=>records.has(c));
      if (!letters.length) error='请输入汉字。查读音请切换到粤语或普通话拼音。';
      else if (!list.length) error='本站字库暂未收录，可到教育局字词表查阅。';
    } else if (choice==='strokes') {
      if (!/^\d{1,2}$/.test(query)||+query<1||+query>32) error='请输入 1 至 32 之间的整数。';
      else list=[...records.values()].filter(r=>r.strokes===+query).map(r=>r.char);
    } else {
      const jyut=choice==='jyut';
      const q=jyut?query.toLowerCase():pinyinCode(query);
      if (!(jyut?/^[a-z]+[1-6]?$/:/^[a-z]+[1-5]?$/).test(q)) error=jyut?'请输入一个粤拼音节，例如 hok6。':'请输入一个普通话音节，例如 xué 或 xue2。';
      else list=[...records.values()].filter(r=>(jyut?r.jyut:r.pinyin).some(v=>phoneticMatch(jyut?v:pinyinCode(v),q))).map(r=>r.char);
    }
    if (choice!=='char') list.sort(strokeCompare);
    matches=list;shown=40;
    const info=el('lookup-feedback');info.replaceChildren();
    const exactWord=words.get(phrase);
    if (exactWord) {
      info.append('「'+phrase+'」的读音　');
      for (const r of exactWord.jyut) info.append(audioButton(r,'jyut'));
      if (exactWord.mandarin) info.append(audioButton(exactWord.mandarin,'pinyin'));
    } else if (choice==='radical') {
      if (pickedRadical) {
        const [glyph,,name]=pickedRadical;
        info.textContent='「'+glyph+'」'+name+'共找到 '+list.length+' 个字，点选查看。';
      }
    } else info.textContent=error|| (list.length?'找到 '+list.length+' 个字，点选查看。':'没有匹配的字，请换一个条件。');
    if (choice==='char' && list.length) {
      const missing=[...new Set(Array.from(phrase).filter(c=>han.test(c)&&!records.has(c)))];
      if (missing.length) info.append('　暂未收录：'+missing.slice(0,12).join('、')+'。');
    }
    showChoices();card(list[0]||'');
  }
  function renderRadicals() {
    const scope=el('rad-scope').value;
    let choices=radicalChoices;
    if (scope==='common') choices=choices.filter(([glyph])=>commonGlyphs.has(glyph));
    else if (scope==='all') choices=choices.slice().sort((a,b)=>parseInt(a[3],10)-parseInt(b[3],10));
    else choices=choices.filter(choice=>choice[3].split(' ').includes(scope));
    const grid=el('rad-list');
    grid.replaceChildren();
    grid.classList.toggle('common',scope==='common');
    for (const choice of choices) {
      const [glyph,,name]=choice;
      const b=button('',()=>{
        grid.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed','false');
        b.setAttribute('aria-pressed','true');
        pickedRadical=choice;
        search();
      },'rad');
      const shape=document.createElement('span');
      shape.lang='zh-HK';shape.className='rad-shape';shape.textContent=glyph;b.append(shape);
      if (name) {
        const label=document.createElement('span');label.className='rad-name';label.textContent=name;b.append(label);
      }
      b.setAttribute('aria-label',name?glyph+'（'+name+'）':glyph);
      b.setAttribute('aria-pressed','false');grid.append(b);
    }
    grid.scrollTop=0;
  }
  function updateMode() {
    const byRadical=mode.value==='radical';
    el('lookup-form').classList.toggle('by-radical',byRadical);
    el('search-box').hidden=input.disabled=byRadical;
    el('lookup-form').querySelector('.lookup-go').hidden=byRadical;
    el('rad-picker').hidden=el('rad-scope-label').hidden=!byRadical;
    const box=el('query-examples');box.hidden=byRadical;
    if (byRadical) {
      pickedRadical=null;el('rad-scope').value='common';renderRadicals();return;
    }
    input.placeholder=hints[mode.value];input.inputMode=mode.value==='strokes'?'numeric':'text';
    el('query-label').textContent=mode.selectedOptions[0].textContent;
    box.replaceChildren('试一试');
    for (const q of samples[mode.value]) box.append(button(q,()=>{input.value=q;search();},'hint'));
  }
  function lookupText(value,bringIntoView) {
    mode.value='char';updateMode();input.value=value;search();
    if (bringIntoView) el('learn').scrollIntoView({block:'start'});
  }
  for (const count of Object.keys(rootGroups)) el('rad-scope').add(new Option(count+' 画的部首',count));
  el('rad-scope').addEventListener('change',()=>{
    pickedRadical=null;renderRadicals();search();
  });
  mode.addEventListener('change',()=>{
    input.value='';updateMode();
    if (mode.value==='radical') {search();return;}
    matches=[];showChoices();card('');el('lookup-feedback').textContent=hints[mode.value];input.focus();
  });
  el('lookup-form').addEventListener('submit',event=>{event.preventDefault();search();});
  el('more-matches').addEventListener('click',()=>{shown+=40;showChoices();});
  el('more-words').addEventListener('click',()=>{wordLimit+=10;renderWords();});
  for (const id of ['word-stage','word-sort']) el(id).addEventListener('change',()=>{wordLimit=5;renderWords();});
  for (const id of ['official-sort','official-scheme']) el(id).addEventListener('change',()=>{
    officialLinks();renderWords();
    for (const b of document.querySelectorAll('button[data-jyut]')) romanize(b);
  });
  el('guides').addEventListener('click',event=>{
    const b=event.target.closest('button[data-guide]');
    if (!b)return;
    el('practice-board').dataset.guide=b.dataset.guide;
    for (const option of el('guides').querySelectorAll('button')) option.setAttribute('aria-pressed',String(option===b));
  });
  document.addEventListener('zijian-lookup',event=>lookupText(event.detail,true));
  window.addEventListener('pagehide',stopAudio);
  if (new URLSearchParams(location.search).get('lookup')==='radical') mode.value='radical';
  updateMode();search();
})();
