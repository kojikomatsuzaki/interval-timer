import test from 'node:test';import assert from 'node:assert/strict';
import { AudioPlayer } from '../audio.js';import { emergencyConfig } from '../config.js';
function fixture(){
 const c=emergencyConfig(),calls={start:[],stop:[],gain:[]};
 const context={currentTime:10,destination:{},createBufferSource(){return{connect(){return this;},disconnect(){},start(at){calls.start.push(at);},stop(){calls.stop.push(1);}};},createGain(){return{gain:{value:0},connect(){return this;},disconnect(){}};}};
 const make=context.createGain;context.createGain=()=>{const node=make();calls.gain.push(node);return node;};
 const player=new AudioPlayer(c,()=>{});player.context=context;return {c,calls,player};
}
test('decoded source schedules repeats on audio clock with multiplied volume and deduplication',()=>{
 const {c,calls,player}=fixture();c.audio.catalog.wave={...c.audio.catalog.electronic_gong,source:'audio/test.wav'};c.audio.end.selected='wave';player.buffers.set('audio/test.wav',{});
 player.play({id:'end',key:'end',at:1050},1000);assert.deepEqual(calls.start,[10.05,10.25,10.450000000000001,10.65,10.850000000000001]);assert.ok(calls.gain.every(g=>Math.abs(g.gain.value-.56)<1e-10));
 player.play({id:'end',key:'end',at:1050},1000);assert.equal(calls.start.length,5);player.cancel();assert.equal(calls.stop.length,5);assert.equal(player.scheduled.size,0);
});
test('per notification silence, global mute and temporary local buffer override',()=>{
 const {c,calls,player}=fixture();c.audio.start.selected='silent';player.play({id:'silent',key:'start',at:1000},1000);assert.equal(calls.start.length,0);
 player.local={get:key=>key==='start'?{buffer:{local:true}}:null};player.play({id:'local',key:'start',at:1000},1000);assert.equal(calls.start.length,1);
 c.audio.enabled=false;player.play({id:'muted',key:'start',at:1000},1000);assert.equal(calls.start.length,1);
});
test('unavailable standard audio uses notification fallback instead of stopping timer',()=>{
 const {c,player}=fixture();c.audio.catalog.missing={...c.audio.catalog.electronic_gong,source:'missing.wav'};c.audio.end.selected='missing';let kind;player.synth=(value)=>kind=value;player.play({id:'missing',key:'end',at:1000},1000);assert.equal(kind,'gong');
});
test('cancelling or disposing a pending preview ignores stale decode/error without warning',async()=>{
 const oldFetch=globalThis.fetch;
 try {
  for(const dispose of [false,true]) {
   const {c,player}=fixture();c.audio.catalog.wave={...c.audio.catalog.electronic_gong,source:'test.wav'};c.audio.start.selected='wave';
   let release,decoded=0;const warnings=[];player.report=text=>warnings.push(text);
   player.context.state='running';player.context.resume=async()=>{};player.context.close=async()=>{};player.context.decodeAudioData=async()=>{decoded++;return {};};
   globalThis.fetch=()=>new Promise(resolve=>release=resolve);
   const pending=player.unlock();await new Promise(resolve=>setTimeout(resolve,0));
   if(dispose)player.dispose();else player.cancel();
   release({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});await pending;
   assert.equal(decoded,0);assert.deepEqual(warnings,[]);assert.equal(player.buffers.size,0);
  }
 } finally {globalThis.fetch=oldFetch;}
});
test('local decode succeeds with suspended context without waiting for playback permission',async()=>{
 const {player}=fixture();let resumes=0;const bytes=new ArrayBuffer(4);
 player.context.state='suspended';player.context.resume=()=>{resumes++;return new Promise(()=>{});};player.context.decodeAudioData=async input=>({input});
 assert.deepEqual(await player.decode(bytes),{input:bytes});assert.equal(resumes,0);
});
