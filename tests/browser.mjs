import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=new URL('../',import.meta.url),base=process.env.TEST_URL||'http://127.0.0.1:8766/';
const output=process.env.TEST_OUTPUT||'/tmp/interval-v02-tests';mkdirSync(output,{recursive:true});
const wav=readFileSync(new URL('../audio/soft-chime.wav',import.meta.url));
const mp3=readFileSync(process.env.MP3_FIXTURE||new URL('../audio/counterbell.mp3',import.meta.url));
const browsers=[['Chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],['Edge','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']];
let checks=0;
for(const [name,executablePath] of browsers){
 const browser=await chromium.launch({executablePath,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postData()}));
 await page.addInitScript(()=>{window.revoked=[];const revoke=URL.revokeObjectURL;URL.revokeObjectURL=function(url){window.revoked.push(url);return revoke.call(this,url);};});
 await page.goto(base);await page.locator('#start').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#start').disabled);
 const rect=await page.locator('.timer-screen').boundingBox();assert.ok(Math.abs(rect.width/rect.height-16/9)<.01);assert.ok(rect.y+rect.height<=1000);assert.equal(await page.locator('#settings').isVisible(),false);checks++;
 await page.screenshot({path:`${output}/${name.toLowerCase()}-timer.png`});
 const decoded=await page.evaluate(async()=>{const ctx=new AudioContext(),result=[];try{for(const name of ['soft-chime','bright-bell','low-gong','short-horn']){const response=await fetch(`audio/${name}.wav`);if(!response.ok)throw Error(name);const buffer=await ctx.decodeAudioData(await response.arrayBuffer());result.push(buffer.duration>0&&buffer.numberOfChannels===1);}}finally{await ctx.close();}return result;});assert.deepEqual(decoded,[true,true,true,true]);checks++;
 const moduleURL=new URL('audio.js?v=0.2',base).href;
 await page.evaluate(async url=>{const {AudioPlayer}=await import(url);const play=AudioPlayer.prototype.play;window.events=[];AudioPlayer.prototype.play=function(event,now){window.events.push({key:event.key,at:event.at,local:!!this.local?.get(event.key),enabled:this.config.audio.enabled,selected:this.config.audio[event.key].selected});return play.call(this,event,now);};},moduleURL);
 async function settings(){await page.locator('#settings-toggle').click();if(!(await page.locator('#editable details').evaluate(el=>el.open)))await page.locator('#editable details summary').click();}
 await settings();assert.equal(await page.locator('[data-sound=start] option').count(),12);
 await page.locator('[data-sound=start]').selectOption('soft_chime');assert.match(await page.locator('[data-description=start]').innerText(),/やわらかい/);
 await page.locator('[data-preview=start]').click();await page.waitForTimeout(500);assert.equal(await page.locator('#phase').innerText(),'READY');checks++;
 // Real file chooser, MP3 decode, WAV replacement, trial and Blob lifecycle.
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('[data-sound=start]').selectOption('__local')]);
 await chooser.setFiles({name:'PRIVATE-LOCAL-123.mp3',mimeType:'audio/mpeg',buffer:mp3});await page.waitForFunction(()=>document.querySelector('[data-local=start]').textContent.includes('PRIVATE-LOCAL'));
 await page.locator('[data-preview=start]').click();await page.waitForTimeout(300);assert.ok((await page.evaluate(()=>window.events)).some(e=>e.local));
 await page.locator('[data-file=start]').setInputFiles({name:'PRIVATE-LOCAL-456.wav',mimeType:'audio/wav',buffer:wav});await page.waitForFunction(()=>document.querySelector('[data-local=start]').textContent.includes('456'));assert.ok((await page.evaluate(()=>window.revoked)).some(url=>url.startsWith('blob:')));checks++;
 const previous=await page.locator('[data-local=start]').innerText();
 await page.locator('[data-file=start]').setInputFiles({name:'large.wav',mimeType:'audio/wav',buffer:Buffer.alloc(20971521)});await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('20MB'));assert.equal(await page.locator('[data-local=start]').innerText(),previous);
 await page.locator('[data-file=start]').setInputFiles({name:'bad.wav',mimeType:'audio/wav',buffer:Buffer.from('invalid audio')});await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('読み込めません'));assert.equal(await page.locator('[data-local=start]').innerText(),previous);checks++;
 await page.locator('[data-path="timer.act_seconds"]').fill('3');await page.locator('[data-path="timer.rest_seconds"]').fill('2');await page.locator('[data-path="timer.rounds"]').fill('2');await page.locator('[data-path="timer.countdown_seconds"]').fill('1');await page.locator('[data-path="timer.minute_interval_seconds"]').fill('1');await page.locator('[data-path="timer.warning_before_seconds"]').fill('1');
 await page.locator('.apply').click();
 const persisted=await page.evaluate(()=>localStorage.getItem('interval-timer:0.2'));assert.ok(!/PRIVATE-LOCAL|blob:|data:audio/.test(persisted));checks++;
 await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#phase').textContent==='ACT');await page.waitForTimeout(550);await page.locator('#stop').click();const clock=await page.locator('#clock').innerText();await page.waitForTimeout(400);assert.equal(await page.locator('#clock').innerText(),clock);await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#phase').textContent==='REST');await page.waitForFunction(()=>document.querySelector('#phase').textContent==='FINISH',null,{timeout:12000});
 const events=await page.evaluate(()=>window.events);assert.ok(events.some(e=>e.key==='start'&&e.local));for(const key of ['countdown','minute','warning','end'])assert.ok(events.some(e=>e.key===key));checks++;
 await page.locator('#reset').click();await settings();await page.locator('.yaml-section summary').click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);const path=await download.path();assert.ok(!/PRIVATE-LOCAL|blob:|data:audio/.test(readFileSync(path,'utf8')));checks++;
 // Only memory Blob GETs and published app GETs; no requests containing local bytes.
 assert.deepEqual(requests.filter(r=>!r.url.startsWith(base)&&!r.url.startsWith('blob:')&&r.url!=='about:blank'),[]);assert.deepEqual(requests.filter(r=>r.method!=='GET'||r.body),[]);checks++;
 await page.locator('[data-clear=start]').click();assert.equal(await page.locator('[data-local=start]').innerText(),'');
 await page.locator('[data-file=start]').setInputFiles({name:'PRIVATE-LOCAL-789.wav',mimeType:'audio/wav',buffer:wav});await page.waitForFunction(()=>document.querySelector('[data-local=start]').textContent.includes('789'));
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#start').disabled);await settings();assert.equal(await page.locator('[data-local=start]').innerText(),'');assert.equal(await page.locator('[data-sound=start]').inputValue(),'soft_chime');checks++;
 // Per-notification silence and global mute.
 await page.locator('[data-sound=start]').selectOption('silent');await page.locator('[data-preview=start]').click();await page.waitForTimeout(200);assert.equal(await page.locator('#phase').innerText(),'READY');await page.locator('.apply').click();await page.locator('#mute').click();assert.equal(await page.locator('#mute').innerText(),'音声 OFF');checks++;
 // Manual ACT/REST waits and START advances.
 await settings();await page.locator('[data-path="timer.progression"]').selectOption('manual');await page.locator('[data-path="timer.act_seconds"]').fill('1');await page.locator('[data-path="timer.rest_seconds"]').fill('1');await page.locator('[data-path="timer.countdown_seconds"]').fill('0');await page.locator('.apply').click();await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#phase-note').textContent.includes('STARTでREST'));await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#phase-note').textContent.includes('次のACT'));await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#phase').textContent==='FINISH');await page.locator('#reset').click();checks++;
 // Broken saved data and missing initial YAML do not prevent startup.
 await page.evaluate(()=>localStorage.setItem('interval-timer:0.2','bad: [yaml'));await page.reload();await page.waitForFunction(()=>!document.querySelector('#start').disabled);assert.match(await page.locator('#message').innerText(),/保存済み設定が不正/);checks++;
 await page.evaluate(()=>localStorage.clear());await page.route('**/config/timer.yaml*',route=>route.fulfill({status:500,body:'error'}));await page.reload();await page.waitForFunction(()=>!document.querySelector('#start').disabled);assert.match(await page.locator('#message').innerText(),/緊急設定/);await page.unroute('**/config/timer.yaml*');checks++;
 // Legacy migration in the actual startup path.
 const old={version:'0.1',timer:{act_seconds:17,rest_seconds:3,rounds:4,progression:'manual',countdown_seconds:3,minute_interval_seconds:60,warning_before_seconds:60},display:{title:'OLD USER',show_tenths:true,accent:'#c4f36b'},audio:{enabled:true,volume:.4}};
 for(const [key,source] of Object.entries({countdown:'synth:beep',start:'audio/reggaehorn.mp3',minute:'synth:bell',warning:'synth:bell',end:'synth:gong'}))old.audio[key]={source,volume:.6,count:2,interval_seconds:.2};
 await page.evaluate(old=>{localStorage.clear();localStorage.setItem('interval-timer:0.1',JSON.stringify(old));},old);await page.reload();await page.waitForFunction(()=>!document.querySelector('#start').disabled);assert.equal(await page.locator('#title').innerText(),'OLD USER');await settings();assert.equal(await page.locator('[data-path="timer.act_seconds"]').inputValue(),'17');assert.equal(await page.locator('[data-path="audio.start.volume"]').inputValue(),'0.6');checks++;
 // Missing standard file falls back to synthesis, and malformed input keeps config.
 page.once('dialog',d=>d.accept('audio/nonexistent.wav'));await page.locator('[data-sound=start]').selectOption('__url');await page.locator('[data-preview=start]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('合成音で再生'));assert.equal(await page.locator('#phase').innerText(),'READY');checks++;
 await page.locator('#settings-close').click();await page.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);await settings();assert.equal(await page.locator('#settings').isVisible(),true);await page.locator('#settings-close').click();await page.locator('#fullscreen').click();checks++;
 await page.goto(new URL('tutorial.html',base).href);assert.match(await page.locator('h1').innerText(),/はじめて/);await page.screenshot({path:`${output}/${name.toLowerCase()}-tutorial.png`,fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${output}/${name.toLowerCase()}-tutorial-mobile.png`,fullPage:true});checks++;
 assert.deepEqual(errors,[]);console.log(`${name}: 18 browser checks PASS, no JavaScript errors. ${requests.length} observed GET requests.`);await browser.close();
}
console.log(`Total ${checks} browser checks PASS. Outputs: ${output}`);
