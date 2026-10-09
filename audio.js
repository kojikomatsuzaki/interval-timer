// ===== 1. ユーザー操作で音声を有効化・独自音源を準備 =====
export class AudioPlayer {
  constructor(config, report) { this.config = config; this.report = report; this.buffers = new Map(); this.nodes = new Set(); this.scheduled = new Set(); }
  async unlock() {
    this.context ||= new (window.AudioContext || window.webkitAudioContext)();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('音声が有効になりません。もう一度STARTを押してください。');
    await Promise.all(Object.entries(this.config.audio).filter(([,s])=>s?.source && !s.source.startsWith('synth:')).map(async ([key,s])=>{
      if (this.buffers.has(s.source)) return;
      try {
        const response = await fetch(s.source, { signal:AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.buffers.set(s.source,await this.context.decodeAudioData(await response.arrayBuffer()));
      } catch(e) { this.report(`${key}音源を読み込めないため合成音で再生します: ${e.message}`); }
    }));
  }
  // ===== 2. Web Audio時計に予約。連打の間隔は描画更新に依存しない =====
  play(event, now = performance.now()) {
    if (!this.context || !this.config.audio.enabled || this.scheduled.has(event.id)) return;
    this.scheduled.add(event.id);
    if (this.scheduled.size > 10000) this.scheduled = new Set([event.id]);
    const s = this.config.audio[event.key], time = this.context.currentTime + Math.max(0,(event.at-now)/1000);
    const volume = this.config.audio.volume*s.volume;
    for (let i=0;i<s.count;i++) {
      const at = time+i*s.interval_seconds, buffer = this.buffers.get(s.source);
      if (buffer) {
        const source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = buffer; gain.gain.value = volume; source.connect(gain).connect(this.context.destination); this.track(source,gain); source.start(at);
      } else {
        const fallback = {countdown:'beep',start:'horn',minute:'bell',warning:'bell',end:'gong'}[event.key];
        this.synth(s.source.startsWith('synth:') ? s.source.slice(6) : fallback, at, volume);
      }
    }
  }
  track(node,gain) { this.nodes.add(node); node.onended = () => { this.nodes.delete(node); node.disconnect(); gain.disconnect(); }; }
  // ===== 3. 電子音・ホーン・ベル・ゴングの合成 =====
  synth(kind,at,volume) {
    const voices = kind === 'horn' ? [[220,1],[277.18,0.65],[329.63,0.5]] : kind === 'gong' ? [[150,1],[236,0.65],[317,0.45],[431,0.2],[677,0.12]] : kind === 'bell' ? [[1047,1],[1660,0.35],[2360,0.15]] : [[880,1]];
    const duration = {beep:0.12,horn:0.75,bell:0.65,gong:1.2}[kind];
    for (const [frequency,weight] of voices) {
      const osc=this.context.createOscillator(), gain=this.context.createGain(); osc.type=kind==='horn'?'sawtooth':'sine';
      osc.frequency.setValueAtTime(frequency,at);
      if (kind==='horn') osc.frequency.exponentialRampToValueAtTime(frequency*0.85,at+duration);
      gain.gain.setValueAtTime(0,at); gain.gain.linearRampToValueAtTime(volume*weight*0.15,at+0.008); gain.gain.exponentialRampToValueAtTime(0.0001,at+duration);
      osc.connect(gain).connect(this.context.destination); this.track(osc,gain); osc.start(at); osc.stop(at+duration+0.02);
    }
  }
  cancel() { for (const node of this.nodes) { try { node.stop(); } catch {} } this.nodes.clear(); this.scheduled.clear(); }
}
