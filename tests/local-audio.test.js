import test from 'node:test';import assert from 'node:assert/strict';
import { LocalAudioStore } from '../local-audio.js';
const file=(name='private.wav',size=12,type='audio/wav')=>Object.assign(new Blob([new Uint8Array(size)],{type}),{name});
test('local replacement/clear/dispose revoke URLs; fetch only Blob memory; store is ephemeral',async()=>{
 const original=URL.revokeObjectURL,revoked=[];URL.revokeObjectURL=url=>{revoked.push(url);original(url);};
 try{const store=new LocalAudioStore();await store.select('start',file(),async bytes=>bytes);const first=store.get('start').url;assert.match(first,/^blob:/);await store.select('start',file('other.mp3',14,'audio/mpeg'),async bytes=>bytes);assert.ok(revoked.includes(first));const second=store.get('start').url;store.clear('start');assert.ok(revoked.includes(second));assert.equal(store.get('start'),undefined);await store.select('end',file(),async bytes=>bytes);store.dispose();assert.equal(store.entries.size,0);assert.equal(new LocalAudioStore().entries.size,0);}finally{URL.revokeObjectURL=original;}
});
test('oversize, empty, incorrect type, decode failure retain previous valid audio',async()=>{
 const store=new LocalAudioStore({maxBytes:20});await store.select('start',file(),async b=>b);const previous=store.get('start');
 for(const f of [file('large.wav',21),file('empty.wav',0),file('bad.txt',10,'text/plain')])await assert.rejects(store.select('start',f,async b=>b));
 await assert.rejects(store.select('start',file(),async()=>{throw Error('invalid content');}));assert.equal(store.get('start'),previous);
});
test('stale decode cannot overwrite newer selection or resurrect cleared resource',async()=>{
 const store=new LocalAudioStore();let release;const deferred=new Promise(r=>release=r);
 const old=store.select('start',file('old.wav'),async()=>deferred);await new Promise(r=>setTimeout(r,10));
 await store.select('start',file('new.wav'),async()=>({ok:true}));release({old:true});assert.equal(await old,false);assert.equal(store.get('start').name,'new.wav');
 let resolve;const pending=store.select('end',file(),async()=>new Promise(r=>resolve=r));await new Promise(r=>setTimeout(r,10));store.clear('end');resolve({});assert.equal(await pending,false);assert.equal(store.get('end'),undefined);
});
