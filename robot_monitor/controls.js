import {ACTUATORS,MODES,OPS,encodeCommand,describeCommand} from './control-protocol.js';
import {RESULTS} from './power-protocol.js';
const $=id=>document.getElementById(id);
export function createControls({isConnected,isDemo,getRX,getStale,getPower}){
 let sending=false,epoch=0,seq=Math.floor(Date.now()%3000000000),history=[],states=new Map(),can=null;
 const pending=new Map(),rows=new Map();
 const number=v=>v===null||v===undefined?'—':v.toLocaleString('en-US',{maximumFractionDigits:2});
 const allButtons=[];
 for(const actuator of ACTUATORS){
  const tr=document.createElement('tr');
  const name=document.createElement('td');const wrap=document.createElement('div');wrap.className='actuator-name';const id=document.createElement('span');id.className='actuator-id';id.textContent=String(actuator.id).padStart(2,'0');const names=document.createElement('div');const strong=document.createElement('strong');strong.textContent=actuator.name;const model=document.createElement('small');model.textContent=actuator.model;names.append(strong,model);wrap.append(id,names);name.append(wrap);tr.append(name);
  const status=document.createElement('td'),state=document.createElement('div'),age=document.createElement('div');state.className='act-state';state.textContent='未受信';age.className='act-age';age.textContent='—';status.append(state,age);tr.append(status);
  const values={};for(const key of ['position','speed','current','torque','error']){const td=document.createElement('td');td.textContent='—';if(key==='error')td.className='act-error';values[key]=td;tr.append(td);}
  const control=document.createElement('td'),group=document.createElement('div');group.className='debug-controls';const select=document.createElement('select');select.setAttribute('aria-label',`${actuator.name} 指令`);
  for(const [op,label,unit] of [...MODES[actuator.type],['ENABLE','有効化',''],['DISABLE','無効化','']]){const option=document.createElement('option');option.value=op;option.textContent=label;option.dataset.unit=unit;select.append(option);}
  const input=document.createElement('input');input.type='number';input.step='any';input.placeholder='目標値';input.setAttribute('aria-label',`${actuator.name} 目標値`);
  const unit=document.createElement('span');unit.className='unit-hint';unit.textContent=select.selectedOptions[0].dataset.unit;
  const send=document.createElement('button');send.textContent='送信';send.setAttribute('aria-label',`${actuator.name} 指令送信`);
  const stop=document.createElement('button');stop.textContent='停止';stop.className='act-stop';stop.setAttribute('aria-label',`${actuator.name} 停止`);
  select.onchange=()=>{unit.textContent=select.selectedOptions[0].dataset.unit;input.disabled=!unit.textContent;};
  send.onclick=()=>{if(!input.disabled&&(input.value===''||!input.checkValidity())){input.reportValidity();showLocalError(`${actuator.name}: 目標値を入力してください`);return;}sendCommand(select.value,actuator.id,input.disabled?0:Number(input.value));};
  stop.onclick=()=>sendCommand('STOP',actuator.id,0);group.append(select,input,unit,send,stop);control.append(group);tr.append(control);$('actuatorBody').append(tr);rows.set(actuator.id,{state,age,values});allButtons.push(send,stop);
 }
 for(const [id,op] of [['calibrate','CALIBRATE'],['emergencyStop','ESTOP'],['powerOff','POWER_OFF'],['powerRestart','POWER_RESTART']]){$(id).onclick=()=>sendCommand(op,0,0);allButtons.push($(id));}
 function showLocalError(message){$('controlAvailability').textContent=message;}
 function renderHistory(){const f=document.createDocumentFragment();for(const h of history){const li=document.createElement('li');const t=document.createElement('time');t.textContent=new Date(h.t).toLocaleTimeString('ja-JP',{hour12:false});const code=document.createElement('code');code.textContent=h.text;const result=document.createElement('span');result.className='result'+(h.failed?' failed':'');result.textContent=h.result;li.append(t,code,result);f.append(li);}$('commandHistory').replaceChildren(f);$('noCommands').hidden=history.length>0;}
 function enableControls(){
  const available=isConnected()&&(isDemo()||!!getRX()),power=getPower(),fresh=power&&Date.now()-power.t<1000;
  for(const b of allButtons){const implemented=['calibrate','emergencyStop','powerOff','powerRestart'].includes(b.id);b.disabled=!available||sending||!implemented;
    if(b.id==='calibrate')b.disabled=b.disabled||!fresh||!power.valid||power.stateCode!==2||power.errorCode!==0||!can?.alive||Date.now()-can.t>=1000||!!(can.errors&0x4f)||!!(can.flags&2)||[...pending.values()].some(r=>r.op==='CALIBRATE');
    if(b.id==='powerRestart')b.disabled=b.disabled||!fresh||!power.valid||power.estop||[...pending.values()].some(r=>r.op==='POWER_RESTART');
  }
 }
 async function sendCommand(op,target,value){
  if(sending||!isConnected()||(!isDemo()&&!getRX()))return;
  if(op==='POWER_RESTART'&&!isDemo()&&!window.confirm('モーター電源を一度遮断し、プリチャージから再投入します。操作入力を中立にして実行してください。'))return;
  const commandSeq=++seq;if(seq>=0xffffffff)seq=0;
  let data;try{data=encodeCommand(commandSeq,op,target,value);}catch(e){showLocalError(e.message);return;}
  const row={op,seq:commandSeq,t:Date.now(),text:describeCommand(commandSeq,op,target,value),result:'BLE送信中…'};history.unshift(row);history=history.slice(0,50);pending.set(commandSeq,row);renderHistory();sending=true;enableControls();const currentEpoch=epoch;
  try{
   if(isDemo()){
    row.result='デモ：指令生成のみ（未送信）';pending.delete(commandSeq);
   }else{
    // A complete 12-byte command fits into the default 20-byte ATT write payload.
    // Never retry robot commands automatically.
    await getRX().writeValueWithResponse(data);
    if(epoch!==currentEpoch)return;
    if(pending.has(commandSeq))row.result='BLE受信済み · 基板の応答待ち';
   }
  }catch(error){if(epoch!==currentEpoch)return;pending.delete(commandSeq);row.result='送信結果不明：'+error.message;row.failed=true;}
  finally{if(epoch===currentEpoch){sending=false;enableControls();renderHistory();}}
 }
 function consume(message,t){
  if(message.kind==='can'){can={...message,t};}
  else if(message.kind==='canAck'){
   const row=pending.get(message.seq);if(!row||row.op!=='CALIBRATE')return;
   row.result=({1:'QDD基板が受理',2:'キャリブレーション実行中',3:'キャリブレーション完了',4:'指令拒否',5:'キャリブレーション失敗',6:'キャリブレーション中止'})[message.result]+(message.errors?` / エラー 0x${message.errors.toString(16)}`:'');
   row.failed=message.result>=4;
   if(message.result>=3)pending.delete(message.seq);
   renderHistory();
  }
  else if(message.kind==='actuator'){states.set(message.id,{...message,t});}
  else if(message.kind==='ack'){const row=pending.get(message.seq);if(row){row.result='UART転送済み · 電源基板の応答待ち';renderHistory();}}
  else if(message.kind==='powerAck'){
   const row=pending.get(message.seq);if(!row||OPS[row.op]!==message.op)return;
   row.result=message.result===1?(row.op==='POWER_RESTART'?'電源再投入完了':row.op==='ESTOP'?'停止ラッチ設定済み':'主・プリチャージ出力OFF'):RESULTS[message.result];
   row.failed=message.result>=3;
   if(message.result!==2)pending.delete(message.seq);
   renderHistory();
  }
 }
 function tick(){
  const now=Date.now();let count=0;for(const [id,row] of rows){const s=states.get(id);if(!s){row.state.textContent='未受信';row.age.textContent='—';row.age.classList.remove('stale');for(const td of Object.values(row.values))td.textContent='—';continue;}count++;const stale=now-s.t>getStale()*1000;row.state.textContent=s.state||'—';row.state.title=s.state;row.age.textContent=stale?`更新停止 · ${Math.floor((now-s.t)/1000)}秒前`:`${Math.floor((now-s.t)/1000)}秒前`;row.age.classList.toggle('stale',stale);for(const [key,td] of Object.entries(row.values)){td.textContent=key==='error'?(s.error||'—'):number(s[key]);td.title=td.textContent;}}
  const canFresh=can&&now-can.t<1000;
  $('canState').textContent=!canFresh?'更新なし':can.alive?'接続中':'通信断';
  $('canErrors').textContent=!canFresh||!can.alive?'—':`0x${can.errors.toString(16).padStart(4,'0')}`;
  $('canLimits').textContent=!canFresh||!can.alive||can.limits<0?'—':Array.from({length:4},(_,i)=>`${i+1}: ${can.limits&(1<<i)?'ON':'OFF'}`).join(' / ');
  $('canHome').textContent=!canFresh||!can.alive||can.done<0?'—':`${can.flags&2?'実行中':can.flags&4?'完了':'待機'} / 完了軸 ${[0,1,2,3].filter(i=>can.done&(1<<i)).map(i=>i+1).join(',')||'なし'}`;
  $('actuatorSummary').textContent=`${count} / ${ACTUATORS.length} 受信`;
  let changed=false;for(const [id,row] of pending){if(now-row.t>(row.op==='CALIBRATE'?95000:10000)){row.result='基板の完了応答なし（結果不明・再送なし）';row.failed=true;pending.delete(id);changed=true;}}if(changed)renderHistory();enableControls();
 }
 function reset(){epoch++;pending.clear();states.clear();can=null;history=[];sending=false;renderHistory();$('controlAvailability').textContent=isDemo()?'デモ：ボタンは指令生成のみ。実機への送信は行いません。':getRX()?'電源操作とQDD基板のキャリブレーションに対応。個別モーター操作は未実装です。':'受信専用のファームウェアです。操作するにはArduino側を更新してください。';tick();}
 function disconnect(){epoch++;sending=false;for(const row of pending.values()){row.result='切断：転送結果不明（再送なし）';row.failed=true;}pending.clear();enableControls();renderHistory();}
 return {consume,tick,reset,disconnect};
}
