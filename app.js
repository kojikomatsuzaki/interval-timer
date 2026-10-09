import { parseConfig, serialize, validate, soundKeys } from './config.js';
import { TimerEngine } from './engine.js';
import { AudioPlayer } from './audio.js';
// ===== 1. 設定と画面の同期 =====
const $ = id => document.getElementById(id), storageKey = 'interval-timer:0.1';
let config, defaults, engine, audio, busy=false, wakeLock;
const names = {countdown:'開始予告 · 電子音',start:'ACT開始 · ホーン',minute:'定期通知 · ベル1回',warning:'終了前 · ベル2回',end:'ACT終了 · ゴング5回'};
for (const key of soundKeys) {
  const section=document.createElement('section'); section.className='sound-setting';
  section.innerHTML=`<h3>${names[key]}</h3><div class="fields"><label class="source">音源<input data-path="audio.${key}.source" required></label><label>音量<input type="number" min="0" max="1" step="any" data-path="audio.${key}.volume" required></label><label>再生回数<input type="number" min="1" max="10" step="1" data-path="audio.${key}.count" required></label><label>間隔（秒）<input type="number" min="0.05" max="5" step="any" data-path="audio.${key}.interval_seconds" required></label></div><button type="button" data-preview="${key}">試聴</button>`;
  $('sound-fields').append(section);
}
function message(text,error=false) { $('message').textContent=text; $('message').className=error?'error':''; }
function getPath(obj,path) { return path.split('.').reduce((o,k)=>o[k],obj); }
function setPath(obj,path,value) { const keys=path.split('.'), last=keys.pop(); keys.reduce((o,k)=>o[k],obj)[last]=value; }
function save() { try { localStorage.setItem(storageKey,serialize(config)); } catch { message('設定をブラウザに保存できません。YAMLをダウンロードしてください。',true); } }
function sync() {
  document.querySelectorAll('[data-path]').forEach(input=> { const value=getPath(config,input.dataset.path); if (input.type==='checkbox') input.checked=value; else input.value=value; });
  $('yaml').value=serialize(config); $('title').textContent=config.display.title; document.documentElement.style.setProperty('--accent',config.display.accent);
  $('act-summary').textContent=format(config.timer.act_seconds*1000,false); $('rest-summary').textContent=format(config.timer.rest_seconds*1000,false);
  $('mode-label').textContent=config.timer.progression==='auto'?'自動進行':'手動進行';
  $('mute').textContent=config.audio.enabled?'音声 ON':'音声 OFF'; $('mute').setAttribute('aria-pressed',String(!config.audio.enabled));
}
function apply(next) {
  if (engine && engine.phase!=='idle') throw new Error('RESETしてから設定を変更してください。');
  validate(next); audio?.cancel(); config=next;
  audio=new AudioPlayer(config,(text)=>message(text,true)); engine=new TimerEngine(config,event=>audio.play(event));
  sync(); save(); render(); message('設定を反映し、このブラウザに保存しました。');
}
function fromForm() {
  const next=structuredClone(config);
  document.querySelectorAll('[data-path]').forEach(input=>setPath(next,input.dataset.path,input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value));
  return next;
}
// ===== 2. 表示・操作状態 =====
function format(ms,tenths=false,ceil=false) {
  const n=ceil ? Math.ceil(ms/1000) : Math.floor(ms/1000), minutes=Math.floor(n/60), seconds=n%60;
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}${tenths?'.'+Math.floor((ms%1000)/100):''}`;
}
function render() {
  if (!engine) return;
  const s=engine.snapshot(), labels={idle:'READY',countdown:'GET READY',act:'ACT',rest:'REST',complete:'FINISH'};
  const locked=s.phase!=='idle'; $('editable').disabled=locked; $('apply-yaml').disabled=locked; $('defaults').disabled=locked; $('import').disabled=locked; $('yaml').readOnly=locked;
  $('start').disabled=busy||s.running||s.phase==='complete'; $('stop').disabled=busy||!s.running; $('reset').disabled=busy;
  $('phase').textContent=labels[s.phase]; document.querySelector('.timer-screen').dataset.phase=s.phase;
  $('direction').textContent=s.phase==='act'?'経過時間 ↑':s.phase==='rest'?'残り時間 ↓':s.phase==='countdown'?'開始予告':s.phase==='complete'?'おつかれさまでした':'準備完了';
  let display;
  if (s.phase==='countdown') display=String(Math.ceil(s.remaining/1000));
  else if (s.phase==='rest') display=format(s.remaining,config.display.show_tenths,!config.display.show_tenths);
  else display=format(s.phase==='idle'?0:s.elapsed,config.display.show_tenths);
  $('clock').textContent=display; $('clock').classList.toggle('tenths',config.display.show_tenths); $('clock').classList.toggle('long',display.split(':')[0].length>2);
  $('round').replaceChildren(document.createTextNode(String(s.round).padStart(2,'0')+' '));
  const total=document.createElement('span'); total.textContent='/ '+String(config.timer.rounds).padStart(2,'0'); $('round').append(total);
  const progress=s.phase==='complete'?100:engine.duration()?Math.min(100,s.elapsed/engine.duration()*100):0;
  $('progress').style.width=progress+'%'; document.querySelector('.track').setAttribute('aria-valuenow',String(Math.round(progress)));
  $('phase-note').textContent=s.pending?`STARTで${s.pending==='rest'?'REST':'次のACT'}へ`:s.phase==='idle'?`STARTで${config.timer.countdown_seconds}秒前からカウントダウン`:s.phase==='complete'?'すべてのラウンドが終了しました':!s.running?'一時停止中 · STARTで再開':s.phase==='act'?`残り ${format(s.remaining,false,true)}`:s.phase==='rest'?'次のラウンドに向けてひと休み':'まもなくACTが始まります';
  const status=s.pending?'区間終了 · 手動での開始待ち':s.phase==='complete'?'完了 · RESETで最初に戻ります':s.phase==='idle'?'準備完了 · 設定を変更できます':s.running?'進行中 · STOPで一時停止':'一時停止中 · STARTで再開';
  const text=document.hidden?'画面が非表示です。復帰時に時刻を補正します。':status;
  if ($('state').textContent!==text) $('state').textContent=text;
  if (!s.running) releaseWake();
}
async function requestWake() { try { if ('wakeLock' in navigator && !document.hidden && !wakeLock) { wakeLock=await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release',()=>{wakeLock=null;}); } } catch {} }
function releaseWake() { if (wakeLock) { wakeLock.release().catch(()=>{}); wakeLock=null; } }
// ===== 3. 50ms更新と150ms音声先読み =====
setInterval(()=>{
  if (!engine?.running) return;
  const now=performance.now();
  engine.tick(now);
  for (const event of engine.signals(now,150)) audio.play(event,now);
  render();
},50);
$('start').addEventListener('click',async()=>{
  if (busy || engine.running) return;
  busy=true; render();
  try {
    audio.cancel();
    if (config.audio.enabled) await audio.unlock();
    $('settings').close(); engine.start(performance.now()); requestWake();
  } catch(e) { message(e.message,true); }
  finally { busy=false; render(); }
});
$('stop').addEventListener('click',()=>{engine.pause(performance.now());audio.cancel();render();});
$('reset').addEventListener('click',()=>{audio.cancel();engine.reset();render();});
$('mute').addEventListener('click',async()=>{
  if (!config) return;
  config.audio.enabled=!config.audio.enabled;audio.cancel();sync();save();
  if (config.audio.enabled) { try { await audio.unlock(); } catch(e) { config.audio.enabled=false; sync(); save(); message(e.message,true); } }
});
$('fullscreen').addEventListener('click',async()=>{
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.shell').requestFullscreen(); }
  catch { message('全画面表示に対応していない環境です。ブラウザの全画面機能を使ってください。',true); }
});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'全画面を終了':'全画面';});
// 設定は画面に重ねて表示し、タイマーの高さを変えない。
$('settings-toggle').addEventListener('click',()=>{
  $('settings').showModal(); $('settings-toggle').setAttribute('aria-expanded','true');
});
$('settings-close').addEventListener('click',()=> $('settings').close());
$('settings').addEventListener('close',()=> $('settings-toggle').setAttribute('aria-expanded','false'));
$('settings').addEventListener('click',e=>{
  if(e.target!==$('settings')) return;
  const r=$('settings').getBoundingClientRect();
  if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) $('settings').close();
});
document.addEventListener('visibilitychange',()=>{if(engine?.running){engine.tick(performance.now());audio.cancel();if(!document.hidden)requestWake();}render();});
// ===== 4. 画面入力・YAML入出力 =====
$('config-form').addEventListener('input',()=>{if(engine?.phase==='idle'){try{$('yaml').value=serialize(validate(fromForm()));message('未反映の変更があります。「保存してタイマーへ」を押してください。');}catch(e){message(e.message,true);}}});
$('config-form').addEventListener('submit',e=>{e.preventDefault();try{apply(fromForm());$('settings').close();}catch(error){message(error.message,true);}});
$('apply-yaml').addEventListener('click',()=>{try{apply(parseConfig($('yaml').value));}catch(e){message(e.message,true);}});
$('defaults').addEventListener('click',()=>{try{apply(structuredClone(defaults));}catch(e){message(e.message,true);}});
$('import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw new Error('YAMLは200KB以内にしてください。');apply(parseConfig(await file.text()));}catch(error){message(error.message,true);}finally{e.target.value='';}});
$('export').addEventListener('click',()=>{
  try { const text=serialize(parseConfig($('yaml').value)),url=URL.createObjectURL(new Blob([text],{type:'text/yaml'})),a=document.createElement('a');a.href=url;a.download='timer.yaml';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  catch(e){message(e.message,true);}
});
$('sound-fields').addEventListener('click',async e=>{
  const key=e.target.dataset.preview;if(!key)return;
  let preview;
  try { const draft=validate(fromForm());preview=new AudioPlayer(draft,text=>message(text,true));await preview.unlock();preview.play({id:'preview',key,at:performance.now()}); }
  catch(error){message(error.message,true);}
});
// ===== 5. リポジトリYAMLを読み込み、保存済み設定を復元 =====
try {
  const response=await fetch('./config/timer.yaml');if(!response.ok)throw new Error(`設定読み込み失敗: HTTP ${response.status}`);
  defaults=parseConfig(await response.text());let initial=structuredClone(defaults),warning='';
  try { const saved=localStorage.getItem(storageKey);if(saved)initial=parseConfig(saved); }
  catch(e){warning=`保存済み設定を使えないため初期設定を読み込みました: ${e.message}`;}
  apply(initial);if(warning)message(warning,true);
} catch(e){message(e.message,true);$('state').textContent='設定を読み込めません。ページを再読み込みしてください。';}
