// ===== 1. カタログの共通処理（YAMLと再生処理を分離） =====
export const SOUND_KEYS = ['countdown', 'start', 'minute', 'warning', 'end'];
export const FALLBACK_IDS = { countdown: 'countdown_beep', start: 'electronic_horn', minute: 'electronic_bell', warning: 'electronic_bell', end: 'electronic_gong' };
export const SILENCE = 'silence';
export function description(text) {
  return { text, language: 'ja', author: 'OpenAI Codex（AI草稿）', created: '2026-10-09' };
}
export function builtinCatalog() {
  return Object.fromEntries([
    ['countdown_beep', '電子ビープ', 'synth:beep', '開始予告に使う短い電子音です。'],
    ['electronic_horn', '合成ホーン', 'synth:horn', 'ACT開始を知らせる合成ホーンです。'],
    ['electronic_bell', '合成ベル', 'synth:bell', '毎分の通知や終了前の警告に使う合成ベルです。'],
    ['electronic_gong', '合成ゴング', 'synth:gong', 'ACT終了を知らせる合成ゴングです。'],
    ['silent', '無音', SILENCE, 'この通知だけを無音にします。'],
  ].map(([id, name, source, text]) => [id, { name, source, description: description(text), provider: 'Interval Timer（プログラム生成）' }]));
}
export function resolveSound(config, key) {
  const selected = config.audio[key]?.selected;
  return config.audio.catalog[selected] || builtinCatalog()[FALLBACK_IDS[key]];
}
// 旧形式の任意URLも安定したIDへ移行。音声データは設定に含めない。
export function sourceId(source) {
  let hash = 2166136261;
  for (const char of source) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `source_${(hash >>> 0).toString(16)}`;
}

// 配信終了した第三者音源は、保存済み設定・旧YAMLからも代替音へ移行する。
export function retiredSourceReplacement(source) {
  if (typeof source !== 'string') return;
  const base = 'https://kojikomatsuzaki.github.io/interval-timer/';
  let url; try { url = new URL(source, base); } catch { return; }
  if (url.origin !== new URL(base).origin) return;
  const replacements = { 'reggaehorn.mp3': 'short_horn', 'counterbell.mp3': 'electronic_bell', 'gon3times.mp3': 'electronic_gong' };
  return replacements[url.pathname.replace(/^\/interval-timer\/audio\//, '')];
}
