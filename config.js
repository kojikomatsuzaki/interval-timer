// ===== 1. YAML読み書きと0.1→0.2移行 =====
import { load, dump, JSON_SCHEMA } from './vendor/js-yaml.mjs';
import { SOUND_KEYS, FALLBACK_IDS, builtinCatalog, description, sourceId, SILENCE } from './catalog.js';
export const soundKeys = SOUND_KEYS;
export function serialize(config) { return dump(config, { noRefs: true, lineWidth: 100, forceQuotes: true, quotingType: '"' }); }
export function parseConfig(text, options = {}) {
  return normalizeConfig(load(text, { schema: JSON_SCHEMA }), options);
}
export function normalizeConfig(input, { defaults, warnings = [] } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('設定はオブジェクトで指定してください。');
  const c = structuredClone(input);
  if (!['0.1', '0.2'].includes(String(c.version))) throw new Error('versionは0.1または0.2を指定してください。');
  const wasLegacy = String(c.version) === '0.1';
  c.version = '0.2';
  if (!c.audio || typeof c.audio !== 'object' || Array.isArray(c.audio)) throw new Error('audioを指定してください。');
  if (c.audio.catalog !== undefined && (!c.audio.catalog || typeof c.audio.catalog !== 'object' || Array.isArray(c.audio.catalog))) throw new Error('audio.catalogはオブジェクトです。');
  c.audio.catalog = { ...builtinCatalog(), ...structuredClone(defaults?.audio.catalog || {}), ...(c.audio.catalog || {}) };
  if (c.audio.local_max_bytes === undefined) c.audio.local_max_bytes = defaults?.audio.local_max_bytes || 20 * 1024 * 1024;
  for (const key of SOUND_KEYS) {
    const s = c.audio[key];
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error(`audio.${key}を指定してください。`);
    if (s.source !== undefined) {
      if (s.selected !== undefined) throw new Error(`${key}: sourceとselectedは同時に指定できません。`);
      validateSource(s.source);
      let id = Object.keys(c.audio.catalog).find(id => c.audio.catalog[id].source === s.source);
      if (!id) {
        id = sourceId(s.source);
        c.audio.catalog[id] = { name: `従来の音源（${key}）`, source: s.source, description: description('従来のsource指定から移行した音源です。提供元・権利情報は未確認です。') };
      }
      s.selected = id; delete s.source;
    }
    if (typeof s.selected !== 'string' || !s.selected) throw new Error(`${key}のselectedまたはsourceを指定してください。`);
    if (!Object.hasOwn(c.audio.catalog, s.selected)) {
      warnings.push(`${key}: 不明な音源ID「${s.selected}」を合成音に戻しました。`);
      s.selected = FALLBACK_IDS[key];
    }
  }
  validate(c);
  if (wasLegacy) warnings.push('Ver. 0.1の設定を0.2へ移行しました。時間・音量・進行方式は引き継いでいます。');
  return c;
}
// ===== 2. 検証（Blob URL・ファイル内容を永続設定から除外） =====
export function validateSource(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > 2048) throw new Error('音源を有効な文字列で指定してください。');
  if (source === SILENCE) return;
  if (source.startsWith('synth:')) {
    if (!['synth:beep', 'synth:horn', 'synth:bell', 'synth:gong'].includes(source)) throw new Error('合成音の指定が不正です。');
  } else {
    const url = new URL(source, 'https://example.com/interval-timer/');
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('永続音源は相対パスかHTTP(S) URLです。Blob URLや音声データは保存できません。');
  }
}
export function validate(c) {
  const fail = message => { throw new Error(message); };
  const object = (value, name) => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name}はオブジェクトです。`); };
  const only = (value, keys, name) => { object(value, name); for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${name}.${key}は未対応の設定です。`); };
  const range = (value, min, max, name, integer = false) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${name}: ${min}〜${max}${integer ? 'の整数' : ''}で指定してください。`); };
  const string = (value, name, limit = 2000) => { if (typeof value !== 'string' || !value.trim() || value.length > limit) fail(`${name}を文字列で指定してください。`); };
  const date = (value, name) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail(`${name}はISO 8601の日付文字列（YYYY-MM-DD）です。`);
  };
  only(c, ['version', 'timer', 'display', 'audio'], '設定');
  if (String(c.version) !== '0.2') fail('正規化後のversionは0.2です。');
  only(c.timer, ['act_seconds', 'rest_seconds', 'rounds', 'progression', 'countdown_seconds', 'minute_interval_seconds', 'warning_before_seconds'], 'timer');
  const t = c.timer;
  range(t.act_seconds, 1, 86400, 'ACT秒'); range(t.rest_seconds, 0, 86400, 'REST秒'); range(t.rounds, 1, 999, '繰り返し', true);
  range(t.countdown_seconds, 0, 30, '予告秒', true); range(t.minute_interval_seconds, 1, 86400, '定期ベル間隔'); range(t.warning_before_seconds, 0, 86400, '終了前ベル秒');
  if (!['auto', 'manual'].includes(t.progression)) fail('進行方式はautoまたはmanualです。');
  only(c.display, ['title', 'show_tenths', 'accent'], 'display');
  if (typeof c.display.title !== 'string' || c.display.title.length > 80) fail('タイトルは80文字以内の文字列です。');
  if (typeof c.display.show_tenths !== 'boolean') fail('show_tenthsはtrue/falseです。');
  if (!/^#[0-9a-f]{6}$/i.test(c.display.accent)) fail('アクセント色は#と6桁の16進数です。');
  only(c.audio, ['enabled', 'volume', 'catalog', 'local_max_bytes', ...SOUND_KEYS], 'audio');
  if (typeof c.audio.enabled !== 'boolean') fail('audio.enabledはtrue/falseです。');
  range(c.audio.volume, 0, 1, '全体音量'); range(c.audio.local_max_bytes, 1, 100 * 1024 * 1024, 'ローカル音源の上限バイト', true);
  object(c.audio.catalog, 'audio.catalog');
  if (Object.keys(c.audio.catalog).length > 200) fail('カタログは200件以内です。');
  for (const [id, sound] of Object.entries(c.audio.catalog)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) fail(`音源ID「${id}」が不正です。`);
    only(sound, ['name', 'description', 'source', 'provider', 'attribution_url', 'license', 'rights_holder'], `catalog.${id}`);
    string(sound.name, `${id}.name`, 120); validateSource(sound.source);
    only(sound.description, ['text', 'language', 'author', 'created', 'modified'], `${id}.description`);
    const d = sound.description;
    string(d.text, `${id}.description.text`); string(d.language, `${id}.description.language`, 80);
    try { if (!Intl.getCanonicalLocales(d.language).length) fail('言語コードが空です。'); } catch { fail(`${id}.description.languageはBCP 47の言語コードです。`); }
    if (d.author !== null) string(d.author, `${id}.description.author`, 200);
    date(d.created, `${id}.description.created`); if (d.modified !== undefined) date(d.modified, `${id}.description.modified`);
    for (const field of ['provider', 'license', 'rights_holder']) if (sound[field] !== undefined && sound[field] !== null) string(sound[field], `${id}.${field}`);
    if (sound.attribution_url !== undefined) { string(sound.attribution_url, `${id}.attribution_url`); if (!/^https?:\/\//i.test(sound.attribution_url)) fail('出典URLはHTTP(S)で指定してください。'); new URL(sound.attribution_url); }
  }
  for (const key of SOUND_KEYS) {
    const s = c.audio[key]; only(s, ['selected', 'volume', 'count', 'interval_seconds'], `audio.${key}`);
    if (!Object.hasOwn(c.audio.catalog, s.selected)) fail(`${key}の音源IDが見つかりません。`);
    range(s.volume, 0, 1, `${key}音量`); range(s.count, 1, 10, `${key}回数`, true); range(s.interval_seconds, 0.05, 5, `${key}再生間隔`);
  }
  return c;
}
// 設定取得が失敗しても合成音で起動できる最小の緊急設定。
export function emergencyConfig() {
  return { version: '0.2', timer: { act_seconds: 600, rest_seconds: 60, rounds: 3, progression: 'auto', countdown_seconds: 3, minute_interval_seconds: 60, warning_before_seconds: 60 }, display: { title: 'INTERVAL TIMER', show_tenths: false, accent: '#c4f36b' }, audio: { enabled: true, volume: 0.7, local_max_bytes: 20971520, catalog: builtinCatalog(), ...Object.fromEntries(SOUND_KEYS.map(key => [key, { selected: FALLBACK_IDS[key], volume: key === 'minute' || key === 'warning' ? 0.3 : 0.8, count: key === 'end' ? 5 : key === 'warning' ? 2 : 1, interval_seconds: key === 'end' ? 0.2 : key === 'warning' ? 0.18 : 0.15 }])) } };
}
