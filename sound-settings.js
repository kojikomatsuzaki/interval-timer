import { SOUND_KEYS, sourceId, description } from './catalog.js?v=0.2-release1';
import { validateSource } from './config.js?v=0.2';
// ===== 音源選択UI。ローカル選択は永続設定を変更しない =====
export class SoundSettings {
  constructor(container,local,player,config,editable,report,cancelPreview) {
    Object.assign(this,{container,local,player,config,editable,report,cancelPreview});
    const names={countdown:'開始予告',start:'ACT開始',minute:'ACT中の定期通知',warning:'終了前の警告',end:'ACT終了'};
    for(const key of SOUND_KEYS) {
      const section=document.createElement('section'); section.className='sound-setting';
      section.innerHTML=`<h3>${names[key]}</h3><div class="fields"><label class="source">音源<select data-sound="${key}" data-path="audio.${key}.selected"></select></label><label>音量<input type="number" min="0" max="1" step="any" data-path="audio.${key}.volume" required></label><label>再生回数<input type="number" min="1" max="10" step="1" data-path="audio.${key}.count" required></label><label>間隔（秒）<input type="number" min="0.05" max="5" step="any" data-path="audio.${key}.interval_seconds" required></label></div><p data-description="${key}" class="muted"></p><p data-local="${key}" class="local-note"></p><input type="file" data-file="${key}" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,.opus,.aif,.aiff" hidden><button type="button" data-choose="${key}">自分の音源を選ぶ</button> <button type="button" data-preview="${key}">試聴</button> <button type="button" data-clear="${key}">標準音源に戻す</button>`;
      container.append(section);
    }
    container.addEventListener('change',e=>this.change(e));
    container.addEventListener('click',e=>{const choose=e.target.dataset.choose;if(choose&&editable()){cancelPreview();this.file(choose).click();return;}const key=e.target.dataset.clear;if(key&&editable()){cancelPreview();local.clear(key);this.update(key);this.report('ローカル音源を解除しました。');}});
    for(const key of SOUND_KEYS) {
      const file=this.file(key);
      file.addEventListener('cancel',()=>this.update(key));
      file.addEventListener('change',async()=>{
        if(!editable())return;
        cancelPreview(); const selected=file.files[0]; file.value='';
        if(!selected){this.update(key);return;}
        try {const ok=await local.select(key,selected,bytes=>player().decode(bytes));if(ok)this.report('ローカル音源を選択しました。このページだけで有効です。');}
        catch(error){this.report(error.message,true);}
        this.update(key);
      });
    }
  }
  select(key){return this.container.querySelector(`[data-sound="${key}"]`);}
  file(key){return this.container.querySelector(`[data-file="${key}"]`);}
  sync(config) {
    this.catalog=structuredClone(config.audio.catalog);
    for(const key of SOUND_KEYS) {
      const select=this.select(key);select.replaceChildren();
      for(const [id,sound] of Object.entries(this.catalog))select.add(new Option(sound.name,id));
      select.add(new Option('自分の音源を使用…','__local'));select.add(new Option('URL・相対パスを指定…','__url'));
      select.value=config.audio[key].selected; select.dataset.standard=select.value;this.update(key);
    }
  }
  update(key) {
    const select=this.select(key), entry=this.local.get(key);
    // data-path always represents the remembered standard selection, never a Blob URL.
    select.value=select.dataset.standard;
    this.container.querySelector(`[data-description="${key}"]`).textContent=this.catalog?.[select.value]?.description.text||'';
    this.container.querySelector(`[data-local="${key}"]`).textContent=entry?`現在は自分の音源「${entry.name}」を使用中（再読み込みで解除）。保存・YAML書き出しは上の標準音源です。`:'';
    this.container.querySelector(`[data-clear="${key}"]`).disabled=!entry;
  }
  change(e) {
    const key=e.target.dataset.sound;if(!key||!this.editable())return;
    const select=e.target;this.cancelPreview();
    if(select.value==='__local'){select.value=select.dataset.standard;this.report('ファイル選択が開かない場合は「自分の音源を選ぶ」を押してください。');this.file(key).click();return;}
    if(select.value==='__url'){
      const source=window.prompt('HTTP(S) URLまたは相対パス（外部URLにはCORS許可が必要です）');
      if(!source){this.update(key);return;}
      try { validateSource(source); } catch(error) { this.update(key);this.report(error.message,true);return; }
      const id=sourceId(source);
      this.catalog[id]={name:'指定URLの音源',source,description:description('利用者がURL・相対パスで指定した音源です。権利情報は未確認です。')};
      select.add(new Option(this.catalog[id].name,id),select.options.length-2);select.value=id;
    }
    this.local.clear(key);select.dataset.standard=select.value;this.update(key);select.dispatchEvent(new Event('input',{bubbles:true}));
  }
}
