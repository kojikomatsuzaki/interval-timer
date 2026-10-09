// ===== 1. 単調増加時計に基づくタイマー（DOM・音声から独立） =====
export class TimerEngine {
  constructor(config, emit = () => {}) { this.config = config; this.emit = emit; this.reset(); }
  reset() { this.phase = 'idle'; this.round = 1; this.running = false; this.elapsed = 0; this.startedAt = 0; this.pending = null; this.serial = (this.serial || 0) + 1; this.sent = new Set(); }
  duration() {
    const t = this.config.timer;
    return ({countdown:t.countdown_seconds,act:t.act_seconds,rest:t.rest_seconds}[this.phase] || 0) * 1000;
  }
  enter(phase, at) { this.phase = phase; this.startedAt = at; this.elapsed = 0; this.serial++; this.sent.clear(); this.running = true; if (phase === 'act') this.emit({ id:`${this.serial}:start`, key:'start', at }); }
  start(now) {
    if (this.running || this.phase === 'complete') return;
    if (this.phase === 'idle') this.enter(this.config.timer.countdown_seconds ? 'countdown' : 'act', now);
    else if (this.pending) { const next = this.pending; this.pending = null; this.enter(next, now); }
    else { this.startedAt = now - this.elapsed; this.running = true; }
    this.tick(now);
  }
  pause(now) { this.tick(now); if (this.running) { this.elapsed = now - this.startedAt; this.running = false; } }
  // ===== 2. 音声のマイルストーン（終了前ベルは毎分ベルより優先） =====
  markers() {
    const t = this.config.timer, result = [], d = this.duration();
    if (this.phase === 'countdown') for (let s=0;s<t.countdown_seconds;s++) result.push([s*1000,'countdown']);
    if (this.phase === 'rest') for (let s=Math.min(t.countdown_seconds, Math.floor(t.rest_seconds));s>=1;s--) result.push([d-s*1000,'countdown']);
    if (this.phase === 'act') {
      const warning = d - t.warning_before_seconds*1000;
      for (let at=t.minute_interval_seconds*1000;at<d;at+=t.minute_interval_seconds*1000) if (Math.abs(at-warning)>0.01 || !t.warning_before_seconds) result.push([at,'minute']);
      if (t.warning_before_seconds > 0 && warning > 0) result.push([warning,'warning']);
      result.push([d,'end']);
    }
    return result.sort((a,b)=>a[0]-b[0]);
  }
  signals(now, lookahead = 0) {
    if (!this.running) return [];
    return this.markers().filter(([at,key])=> !this.sent.has(`${at}:${key}`) && this.startedAt+at <= now+lookahead).map(([at,key])=>({id:`${this.serial}:${at}:${key}`,at:this.startedAt+at,key}));
  }
  // ===== 3. 境界を越えた遅延も次区間に引き継ぎ、累積誤差を防止 =====
  tick(now) {
    let transitions = 0;
    while (this.running) {
      for (const event of this.signals(now)) {
        this.sent.add(event.id.slice(event.id.indexOf(':')+1));
        // 非表示・スリープ後に過去のベルを一斉再生しない。
        if (now-event.at <= 500) this.emit(event);
      }
      this.elapsed = Math.max(0,now-this.startedAt);
      if (this.elapsed < this.duration()) break;
      const boundary = this.startedAt + this.duration();
      let next;
      if (this.phase === 'countdown') next = 'act';
      else if (this.phase === 'act') {
        if (this.round >= this.config.timer.rounds) { this.phase = 'complete'; this.running = false; this.elapsed = this.config.timer.act_seconds*1000; break; }
        next = this.config.timer.rest_seconds ? 'rest' : (this.config.timer.countdown_seconds ? 'countdown' : 'act');
        if (next !== 'rest') this.round++;
      } else if (this.phase === 'rest') { this.round++; next = this.config.timer.progression === 'manual' && this.config.timer.countdown_seconds ? 'countdown' : 'act'; }
      if (this.config.timer.progression === 'manual' && this.phase !== 'countdown') { this.running = false; this.pending = next; this.elapsed = this.duration(); break; }
      this.enter(next,boundary);
      if (++transitions > 4000) throw new Error('タイマーの区間数が上限を超えました。');
    }
    return this.snapshot();
  }
  snapshot() { return {phase:this.phase, round:this.round, running:this.running, elapsed:this.elapsed, remaining:Math.max(0,this.duration()-this.elapsed),pending:this.pending}; }
}
