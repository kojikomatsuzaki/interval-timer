// ===== 1. YAML読み書き =====
import { load, dump, JSON_SCHEMA } from './vendor/js-yaml.mjs';
export const soundKeys = ['countdown', 'start', 'minute', 'warning', 'end'];
export function parseConfig(text) {
  const c = load(text, { schema: JSON_SCHEMA });
  validate(c);
  return c;
}
export function serialize(c) { return dump(c, { noRefs: true, lineWidth: 100 }); }
// ===== 2. 設定検証（画面とYAMLで共通） =====
export function validate(c) {
  const fail = m => { throw new Error(m); };
  const object = (v, name) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${name}はオブジェクトで指定してください。`); };
  const range = (v, min, max, name, integer = false) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) fail(`${name}: ${min}〜${max}${integer ? 'の整数' : ''}で指定してください。`);
  };
  const only = (v, keys, name) => { object(v, name); for (const key of Object.keys(v)) if (!keys.includes(key)) fail(`${name}.${key}は未対応の設定です。`); };
  only(c, ['version','timer','display','audio'], '設定');
  if (String(c.version) !== '0.1') fail('versionは0.1を指定してください。');
  only(c.timer, ['act_seconds','rest_seconds','rounds','progression','countdown_seconds','minute_interval_seconds','warning_before_seconds'], 'timer');
  const t = c.timer;
  range(t.act_seconds, 1, 86400, 'ACT秒'); range(t.rest_seconds, 0, 86400, 'REST秒');
  range(t.rounds, 1, 999, '繰り返し', true); range(t.countdown_seconds, 0, 30, '予告秒', true);
  range(t.minute_interval_seconds, 1, 86400, '定期ベル間隔'); range(t.warning_before_seconds, 0, 86400, '終了前ベル秒');
  if (!['auto','manual'].includes(t.progression)) fail('進行方式はautoまたはmanualです。');
  only(c.display, ['title','show_tenths','accent'], 'display');
  if (typeof c.display.title !== 'string' || c.display.title.length > 80) fail('タイトルは80文字以内の文字列です。');
  if (typeof c.display.show_tenths !== 'boolean') fail('show_tenthsはtrue/falseです。');
  if (!/^#[0-9a-f]{6}$/i.test(c.display.accent)) fail('アクセント色は#と6桁の16進数で指定してください。');
  only(c.audio, ['enabled','volume',...soundKeys], 'audio');
  if (typeof c.audio.enabled !== 'boolean') fail('audio.enabledはtrue/falseです。');
  range(c.audio.volume, 0, 1, '全体音量');
  for (const key of soundKeys) {
    const s = c.audio[key]; only(s, ['source','volume','count','interval_seconds'], `audio.${key}`);
    range(s.volume, 0, 1, `${key}音量`); range(s.count, 1, 10, `${key}回数`, true); range(s.interval_seconds, 0.05, 5, `${key}再生間隔`);
    if (typeof s.source !== 'string' || !s.source.trim()) fail(`${key}音源を指定してください。`);
    if (s.source.startsWith('synth:')) { if (!['synth:beep','synth:horn','synth:bell','synth:gong'].includes(s.source)) fail(`${key}の合成音が不正です。`); }
    else {
      const url = new URL(s.source, 'https://example.com/interval-timer/');
      if (!['https:','http:'].includes(url.protocol)) fail('音源は相対パスかHTTP(S) URLを指定してください。');
    }
  }
  return c;
}
