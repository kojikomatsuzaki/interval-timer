import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConfig, serialize, emergencyConfig } from '../config.js';
const defaults=parseConfig(readFileSync(new URL('../config/timer.yaml',import.meta.url),'utf8'));
test('catalog loaded; description dates remain strings, optional modified preserved',()=>{
 assert.equal(Object.keys(defaults.audio.catalog).length,9);
 const c=structuredClone(defaults);c.audio.catalog.soft_chime.description.modified='2026-10-15';
 assert.deepEqual(parseConfig(serialize(c)),c);assert.equal(typeof c.audio.catalog.soft_chime.description.created,'string');
 assert.match(c.audio.catalog.soft_chime.description.author,/AI/);
});
test('0.1 storage migration preserves timing, controls, known/custom source and volume',()=>{
 const c=structuredClone(defaults);c.version='0.1';delete c.audio.catalog;delete c.audio.local_max_bytes;
 for(const key of ['countdown','start','minute','warning','end']){c.audio[key].source=defaults.audio.catalog[c.audio[key].selected].source;delete c.audio[key].selected;}
 c.timer.act_seconds=123;c.timer.progression='manual';c.audio.start.volume=.4;c.audio.minute.source='https://example.org/bell.mp3';c.display.title='';
 const warnings=[],m=parseConfig(serialize(c),{defaults,warnings});
 assert.equal(m.timer.act_seconds,123);assert.equal(m.timer.progression,'manual');assert.equal(m.audio.start.volume,.4);assert.equal(m.audio.catalog[m.audio.minute.selected].source,c.audio.minute.source);assert.equal(m.audio.start.selected,'short_horn');assert.ok(warnings.length);
});
test('unknown IDs safely fallback and new catalog entries merge into saved settings',()=>{
 const saved=structuredClone(defaults);delete saved.audio.catalog.soft_chime;saved.audio.start.selected='missing';
 const warnings=[],c=parseConfig(serialize(saved),{defaults,warnings});assert.equal(c.audio.start.selected,'electronic_horn');assert.ok(c.audio.catalog.soft_chime);assert.equal(warnings.length,1);
});
test('reject malformed dates, language, metadata, unsafe persisted URLs, ranges and prototypes',()=>{
 for(const mutate of [c=>c.audio.catalog.soft_chime.description.created='2026-02-30',c=>c.audio.catalog.soft_chime.description.created=new Date(),c=>c.audio.catalog.soft_chime.description.language='not_a_language',c=>c.audio.catalog.soft_chime.description.author=undefined,c=>c.audio.catalog.soft_chime.source='blob:https://example.org/secret',c=>c.audio.catalog.soft_chime.source='data:audio/wav;base64,AAA',c=>c.audio.local_max_bytes=-1,c=>c.audio.catalog.constructor=c.audio.catalog.soft_chime,c=>c.audio.start.count=0]){const c=structuredClone(defaults);mutate(c);assert.throws(()=>parseConfig(serialize(c)));}
 const c=emergencyConfig();assert.deepEqual(parseConfig(serialize(c)),c);
});

test('retired third-party sources migrate from 0.1 and saved 0.2 catalogs without losing settings',()=>{
 for(const legacy of [true,false]) {
  const c=structuredClone(defaults);c.version=legacy?'0.1':'0.2';
  for(const [key,source] of Object.entries({start:'audio/reggaehorn.mp3',minute:'https://kojikomatsuzaki.github.io/interval-timer/audio/counterbell.mp3?v=1',end:'audio/gon3times.mp3'})) {
   if(legacy){delete c.audio[key].selected;c.audio[key].source=source;}
   else {const id='retired_'+key;c.audio.catalog[id]={...c.audio.catalog.soft_chime,source};c.audio[key].selected=id;}
  }
  const warnings=[],m=parseConfig(serialize(c),{defaults,warnings});
  assert.equal(m.audio.start.selected,'short_horn');assert.equal(m.audio.minute.selected,'electronic_bell');assert.equal(m.audio.end.selected,'electronic_gong');
  assert.equal(m.timer.act_seconds,c.timer.act_seconds);assert.equal(m.audio.start.volume,c.audio.start.volume);
  assert.ok(warnings.length>=3);assert.ok(!serialize(m).match(/reggaehorn\.mp3|counterbell\.mp3|gon3times\.mp3/));
 }
});
