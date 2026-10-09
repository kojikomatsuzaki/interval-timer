// ===== 1. ページ内だけのローカル音源。永続設定とは完全に分離 =====
export class LocalAudioStore {
  constructor({ maxBytes = 20 * 1024 * 1024, onChange = () => {} } = {}) {
    this.maxBytes = maxBytes; this.onChange = onChange; this.entries = new Map(); this.operations = new Map();
  }
  get(key) { return this.entries.get(key); }
  async select(key, file, decode) {
    if (!file) return false;
    const token = (this.operations.get(key) || 0) + 1; this.operations.set(key, token);
    if (file.size === 0) throw new Error('空のファイルは使用できません。');
    if (file.size > this.maxBytes) throw new Error(`音源は${Math.round(this.maxBytes / 1024 / 1024)}MB以内にしてください。`);
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|webm|opus|aif|aiff)$/i.test(file.name)) throw new Error('MP3・WAVなどの音声ファイルを選択してください。');
    const url = URL.createObjectURL(file);
    try {
      // Blob URLの読み込みはブラウザ内のメモリから。サーバーへの送信はしない。
      const response = await fetch(url);
      const buffer = await decode(await response.arrayBuffer());
      if (this.operations.get(key) !== token) { URL.revokeObjectURL(url); return false; }
      const previous = this.entries.get(key);
      this.entries.set(key, { url, buffer, name: file.name, size: file.size });
      if (previous) URL.revokeObjectURL(previous.url);
      this.onChange(key); return true;
    } catch (error) {
      URL.revokeObjectURL(url);
      if (this.operations.get(key) !== token) return false;
      throw new Error(`音声を読み込めません。ブラウザで対応しているファイルを選んでください。（${error.message}）`);
    }
  }
  clear(key) {
    this.operations.set(key, (this.operations.get(key) || 0) + 1);
    const previous = this.entries.get(key);
    if (previous) URL.revokeObjectURL(previous.url);
    this.entries.delete(key); this.onChange(key);
  }
  cancelPending() { for (const key of this.operations.keys()) this.operations.set(key,this.operations.get(key)+1); }
  dispose() { for (const key of new Set([...this.entries.keys(), ...this.operations.keys()])) this.clear(key); }
}
