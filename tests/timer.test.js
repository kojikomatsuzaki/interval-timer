import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConfig,serialize } from '../config.js';
import { TimerEngine } from '../engine.js';
const defaults=parseConfig(readFileSync(new URL('../config/timer.yaml',import.meta.url),'utf8'));
function fixture(patch={}) {const c=structuredClone(defaults);Object.assign(c.timer,patch);const events=[];const e=new TimerEngine(c,event=>events.push(event));return {e,events,c};}
test('YAML roundtrip, malformed values and unknown keys',()=>{
 assert.deepEqual(parseConfig(serialize(defaults)),defaults);
 for(const mutate of [c=>c.timer.act_seconds=-1,c=>c.timer.rounds=1.5,c=>c.audio.start.source='javascript:alert(1)',c=>c.display.accent='red',c=>c.timer.round=3,c=>c.audio.enabled='true']) {const c=structuredClone(defaults);mutate(c);assert.throws(()=>parseConfig(serialize(c)));}
 assert.throws(()=>parseConfig('timer: [bad'));
});
test('initial countdown 3,2,1 then horn; ACT counts up',()=>{
 const {e,events}=fixture(); e.start(100);e.tick(1100);e.tick(2100);e.tick(3100);e.tick(4350);
 assert.deepEqual(events.map(x=>[x.key,x.at]),[['countdown',100],['countdown',1100],['countdown',2100],['start',3100]]);
 assert.equal(e.phase,'act');assert.equal(e.elapsed,1250);
});
test('ten-minute ACT minute bell x8, warning replaces ninth, one end gong event',()=>{
 const {e,events}=fixture({countdown_seconds:0,rounds:1});e.start(0);
 for(let now=50;now<=600000;now+=50)e.tick(now);
 assert.equal(events.filter(x=>x.key==='minute').length,8);assert.deepEqual(events.filter(x=>x.key==='warning').map(x=>x.at),[540000]);
 assert.equal(events.filter(x=>x.key==='end').length,1);assert.equal(e.phase,'complete');e.start(700000);assert.equal(e.phase,'complete');
});
test('non-minute warning and short ACT avoid duplicate start bells',()=>{
 const {e,events}=fixture({act_seconds:150,countdown_seconds:0,rounds:1});e.start(0);for(let n=50;n<=150000;n+=50)e.tick(n);
 assert.deepEqual(events.map(x=>[x.key,x.at]),[['start',0],['minute',60000],['warning',90000],['minute',120000],['end',150000]]);
 const short=fixture({act_seconds:60,countdown_seconds:0,rounds:1});short.e.start(0);short.e.tick(60000);assert.equal(short.events.filter(x=>x.key==='warning').length,0);
});
test('pause/resume and reset preserve measured elapsed time',()=>{
 const {e}=fixture({countdown_seconds:0});e.start(0);e.pause(3456);e.tick(99999);assert.equal(e.elapsed,3456);e.start(100000);e.tick(101000);assert.equal(e.elapsed,4456);e.reset();assert.equal(e.elapsed,0);assert.equal(e.phase,'idle');
});
test('auto REST countdown and phase boundaries preserve overshoot',()=>{
 const {e,events}=fixture({act_seconds:10,rest_seconds:5,rounds:2});e.start(0);e.tick(3100);e.tick(13120);assert.equal(e.phase,'rest');assert.equal(e.elapsed,120);
 e.tick(15000);e.tick(16000);e.tick(17000);e.tick(18150);assert.equal(e.phase,'act');assert.equal(e.round,2);assert.equal(e.elapsed,150);
 assert.deepEqual(events.filter(x=>x.key==='countdown'&&x.at>=15000).map(x=>x.at),[15000,16000,17000]);e.tick(28000);assert.equal(e.phase,'complete');
});
test('manual stops at ACT and REST boundaries; START advances and gives countdown',()=>{
 const {e}=fixture({act_seconds:10,rest_seconds:5,countdown_seconds:3,rounds:2,progression:'manual'});
 e.start(0);e.tick(13000);assert.equal(e.pending,'rest');assert.equal(e.running,false);e.start(20000);assert.equal(e.phase,'rest');e.tick(25000);assert.equal(e.pending,'countdown');e.start(30000);assert.equal(e.phase,'countdown');e.tick(33000);assert.equal(e.phase,'act');e.tick(43000);assert.equal(e.phase,'complete');
});
test('zero REST, one round, delayed callbacks, no accumulated drift in 100 rounds',()=>{
 const {e}=fixture({act_seconds:1,rest_seconds:0,countdown_seconds:0,rounds:100});e.start(0);e.tick(99234);assert.equal(e.round,100);assert.equal(e.elapsed,234);e.tick(100000);assert.equal(e.phase,'complete');
});
test('lookahead does not consume events and a delayed wake skips old audio',()=>{
 const {e,events}=fixture({countdown_seconds:0,rounds:1});e.start(0);assert.equal(e.signals(59900,150)[0].at,60000);assert.equal(e.signals(59900,150)[0].at,60000);e.tick(60000);e.tick(60000);assert.equal(events.filter(x=>x.key==='minute').length,1);e.tick(400000);assert.equal(events.filter(x=>x.key==='minute').length,1);assert.equal(e.elapsed,400000);
});
