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
