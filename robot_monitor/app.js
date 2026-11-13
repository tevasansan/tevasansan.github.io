import {RX_UUID,decodeSpecial,ACTUATORS} from './control-protocol.js?v=20261113-cal2';
import {createControls} from './controls.js?v=20261113-cal2';
import {parseCSV,LineDecoder} from './core.js?v=20261113-cal2';
import {decodePower,demoPower} from './power-protocol.js?v=20261113-cal2';
const $=id=>document.getElementById(id);
const SERVICE='6e400001-b5a3-f393-e0a9-e50e24dcca9e',TX='6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const config={staleSeconds:1};
let rxCharacteristic=null,lastStatus=null;
let device,characteristic,connected=false,connecting=false,demo=false,demoTimer,sessionStart=0,lastReceived=0;
let sequence=0,records=[],samples=[],limit=1000,windowSeconds=60,logsPaused=false,frozenLogs=null,search='',dirtyLogs=false,invalidLines=0,overflowLines=0;
const controls=createControls({isConnected:()=>connected,isDemo:()=>demo,getRX:()=>rxCharacteristic,getStale:()=>1,getPower:()=>lastStatus?{...lastStatus.power,t:lastStatus.t}:null});
function selectTab(name){for(const key of ['status','control']){const selected=key===name;$(key+'Tab').setAttribute('aria-selected',String(selected));$(key+'Tab').tabIndex=selected?0:-1;$(key+'Panel').hidden=!selected;}if(name==='status'){renderLogs();drawCharts();}}
for(const name of ['status','control']){$(name+'Tab').onclick=()=>selectTab(name);$(name+'Tab').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'status':e.key==='End'?'control':name==='status'?'control':'status';selectTab(next);$(next+'Tab').focus();}};}
const stream=new LineDecoder(receiveLine,()=>{overflowLines++;dirtyLogs=true;});
const fmt=n=>n===null||n===undefined?'—':n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const time=t=>new Date(t).toLocaleTimeString('ja-JP',{hour12:false})+'.'+String(t%1000).padStart(3,'0');
function receiveLine(raw){
 const fields=parseCSV(raw),power=decodePower(raw),special=power||decodeSpecial(fields);
 if(!fields||special?.kind==='invalid')invalidLines++;
 const row={id:++sequence,t:Date.now(),raw,fields,power:power?.kind==='power'?power:null};
 records.unshift(row);if(records.length>limit)records.length=limit;
 if(row.power){lastStatus=row;samples.push(row);const cutoff=row.t-600000;while(samples.length&&(samples[0].t<cutoff||samples.length>6000))samples.shift();}
 else if(special)controls.consume(special,row.t);
 lastReceived=row.t;dirtyLogs=true;
}
function enterDashboard(){connected=true;lastStatus=null;controls.reset();selectTab('status');sessionStart=Date.now();lastReceived=0;stream.reset();records=[];samples=[];sequence=invalidLines=overflowLines=0;logsPaused=false;frozenLogs=null;search='';$('logSearch').value='';$('pauseLogs').textContent='表示を一時停止';dirtyLogs=true;$('waiting').hidden=true;$('dashboard').hidden=false;$('demoBanner').hidden=!demo;$('deviceName').textContent=demo?'DEMO / SIMULATED DATA':device?.name||'ROBOTLOGS';$('connectionError').textContent='';updateMetrics();renderLogs();drawCharts();}
function disconnected(){connected=false;rxCharacteristic=null;controls.disconnect();stream.reset();characteristic?.removeEventListener('characteristicvaluechanged',onNotification);characteristic=null;$('dashboard').hidden=true;$('waiting').hidden=false;$('connect').disabled=false;$('connect').querySelector('span').textContent='接続する';$('connectionError').textContent='接続が切れました。もう一度接続してください。';}
function onNotification(event){stream.push(event.target.value);}
async function connect(){
 if(connecting)return;connecting=true;$('connect').disabled=true;$('connect').querySelector('span').textContent='接続中…';$('connectionError').textContent='';
 try{
  if(!window.isSecureContext)throw new Error('HTTPSまたはlocalhostで開いてください。');
  if(!navigator.bluetooth)throw new Error('このブラウザはWeb Bluetoothに対応していません。AndroidまたはPCのChromeで開いてください。');
  device=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE]}]});
  device.addEventListener('gattserverdisconnected',disconnected,{once:true});
  const server=await device.gatt.connect();const service=await server.getPrimaryService(SERVICE);characteristic=await service.getCharacteristic(TX);
  rxCharacteristic=null;try{const rx=await service.getCharacteristic(RX_UUID);if(rx.properties.write)rxCharacteristic=rx;}catch(error){if(error.name!=='NotFoundError')throw error;}
  stream.reset();characteristic.addEventListener('characteristicvaluechanged',onNotification);await characteristic.startNotifications();
  if(!device.gatt.connected)throw new Error('通知を開始する前に切断されました。再接続してください。');
  enterDashboard();
 }catch(error){device?.gatt?.disconnect();$('connectionError').textContent=error.name==='NotFoundError'?'デバイスの選択がキャンセルされました。':`接続できませんでした。${error.message}`;}
 finally{connecting=false;$('connect').disabled=false;$('connect').querySelector('span').textContent='接続する';}
}
$('connect').onclick=connect;$('disconnect').onclick=()=>{if(demo){stopDemo();return;}device?.gatt.disconnect();};
function updateMetrics(){const latest=lastStatus?.power;for(const k of ['state','error']){$(k+'Value').textContent=latest?.[k]??'—';$(k+'Value').title=latest?.[k]??'';}
 const age=lastStatus?(Date.now()-lastStatus.t)/1000:Infinity;const stale=age>(config?.staleSeconds||3);$('stateHint').textContent=!lastStatus?'電源基板の情報待ち':(Date.now()-lastStatus.t)>(config?.staleSeconds||3)*1000?'状態更新なし':'電源基板から受信中';$('stateDot').style.background=stale?'#c8b17d':'#2d9577';
 for(const k of ['voltage','current']){const value=latest?.[k]??null,low=latest?.[k+'Min']??null,high=latest?.[k+'Max']??null;$(k+'Value').textContent=value!==null?fmt(value):low!==null&&high!==null?`${fmt(low)}–${fmt(high)}`:'—';$(k+'Range').textContent=latest?.[k+'Invalid']?'範囲が不正です':`100ms最小 ${fmt(low)} / 最大 ${fmt(high)}`;}
 for(const [id,key] of [['mainRelay','main'],['preRelay','pre'],['regenRelay','regen'],['estopInput','estop']]){
   const e=$(id);e.textContent=!latest?'未受信':stale?'更新停止':key==='estop'?(latest[key]?'作動中':!latest.main||latest.stateCode===1?'判定待ち / 対象外':'正常'):key==='regen'?(latest[key]?'ON · 抵抗遮断':'OFF · 抵抗導通'):(latest[key]?'ON':'OFF');e.classList.toggle('active',!!latest?.[key]&&!stale);
 }
 $('powerAge').textContent=!latest?'CH32からの受信待ち':stale?'電源情報が更新されていません':`基板稼働 ${Math.floor(latest.uptime/1000)}秒 · ADC ${latest.valid?'有効':latest.stateCode===3?'安定待ち':'無効'}`;
 $('errorHint').textContent=stale?'表示は最終受信時の値':latest?.errorCode?'保護停止は再投入操作まで保持':'保護異常なし';
 $('connectionBadge').classList.toggle('stale',stale);$('connectionBadge').replaceChildren();const i=document.createElement('i');$('connectionBadge').append(i,document.createTextNode(demo?'デモ':!lastStatus?'電源情報待ち':stale?'更新停止':'接続中'));
 $('updated').textContent=!lastStatus?'電源情報待ち':`${Math.floor(age)}秒前に受信`;const seconds=Math.floor((Date.now()-sessionStart)/1000);$('sessionTime').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function drawCharts(){if(!connected||$('statusPanel').hidden)return;for(const kind of ['voltage','current'])drawChart(kind);}
function drawChart(kind){
 const canvas=$(kind+'Chart'),rect=canvas.getBoundingClientRect();if(!rect.width)return;
 const ratio=window.devicePixelRatio||1;canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
 const w=rect.width,h=rect.height,L=49,R=12,T=12,B=29,pw=w-L-R,ph=h-T-B,end=Date.now(),start=end-windowSeconds*1000;
 const points=samples.filter(r=>r.t>=start).map(r=>({t:r.t,...r.power}));
 const keys=[kind+'Min',kind+'Max',kind],values=points.flatMap(p=>keys.map(k=>p[k]).filter(v=>typeof v==='number'&&Number.isFinite(v)));
 let min=0,max=1;if(values.length){min=Math.min(...values);max=Math.max(...values);const pad=Math.max((max-min)*.18,.1,Math.abs(max)*.015);min-=pad;max+=pad;}
 const x=t=>L+(t-start)/(end-start)*pw,y=v=>T+(max-v)/(max-min)*ph;
 ctx.font='10px -apple-system,BlinkMacSystemFont,sans-serif';ctx.lineWidth=1;ctx.textBaseline='middle';ctx.textAlign='right';
 for(let j=0;j<=4;j++){const yy=T+ph*j/4;ctx.strokeStyle='#edf1ed';ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(w-R,yy);ctx.stroke();ctx.fillStyle='#9daaa0';const n=max-(max-min)*j/4;ctx.fillText(Math.abs(n)>=1000?n.toExponential(1):n.toFixed(max-min<1?2:1),L-10,yy);}
 ctx.textAlign='center';for(let j=0;j<=4;j++){const t=start+(end-start)*j/4;const label=new Date(t).toLocaleTimeString('ja-JP',{minute:'2-digit',second:'2-digit',hour12:false});ctx.fillText(label,L+pw*j/4,h-10);}
 const color=kind==='voltage'?'#168477':'#b37c29',fill=kind==='voltage'?'rgba(22,132,119,.13)':'rgba(179,124,41,.14)';
 ctx.save();ctx.beginPath();ctx.rect(L,T,pw,ph);ctx.clip();
 function segments(required){const groups=[];let group=[];for(const p of points){if(required.some(k=>p[k]===null||p[k]===undefined)){if(group.length)groups.push(group);group=[];continue;}if(group.length&&p.t-group.at(-1).t>(config?.staleSeconds||3)*1000){groups.push(group);group=[];}group.push(p);}if(group.length)groups.push(group);return groups;}
 for(const group of segments([kind+'Min',kind+'Max'])){ctx.beginPath();group.forEach((p,i)=>i?ctx.lineTo(x(p.t),y(p[kind+'Max'])):ctx.moveTo(x(p.t),y(p[kind+'Max'])));[...group].reverse().forEach(p=>ctx.lineTo(x(p.t),y(p[kind+'Min'])));ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
 for(const key of keys){ctx.setLineDash(key===kind?[3,4]:[]);ctx.strokeStyle=color;ctx.lineWidth=key===kind?1.3:1.7;for(const group of segments([key])){ctx.beginPath();group.forEach((p,i)=>i?ctx.lineTo(x(p.t),y(p[key])):ctx.moveTo(x(p.t),y(p[key])));ctx.stroke();if(group.length===1){ctx.beginPath();ctx.arc(x(group[0].t),y(group[0][key]),2,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}}}
 ctx.restore();$(kind+'Empty').hidden=values.length>0;$(kind+'Empty').textContent=!lastStatus?'電源基板の情報を待っています':'ADC値が無効です';
}
function renderLogs(){
 const viewport=$('logViewport'),atTop=viewport.scrollTop<5,oldTop=viewport.scrollTop;const firstVisible=[...$('logBody').children].find(row=>row.offsetTop+row.offsetHeight>oldTop+32);const anchor=firstVisible?{id:firstVisible.dataset.id,offset:firstVisible.offsetTop-oldTop}:null;
 const source=logsPaused?frozenLogs:records;const shown=source.filter(r=>!search||r.raw.toLowerCase().includes(search));const frag=document.createDocumentFragment();for(const row of shown){const tr=document.createElement('tr');tr.dataset.id=row.id;for(const value of [row.id,time(row.t),row.raw]){const td=document.createElement('td');td.textContent=value;tr.append(td);}frag.append(tr);}$('logBody').replaceChildren(frag);
 if(!atTop&&anchor){const target=[...$('logBody').children].find(r=>r.dataset.id===anchor.id);viewport.scrollTop=target?target.offsetTop-anchor.offset:oldTop;}else viewport.scrollTop=0;
 $('noLogs').hidden=shown.length>0;$('noLogs').textContent=records.length?'一致するログがありません':'まだログを受信していません';$('logCount').textContent=source.length.toLocaleString();$('receiveStats').textContent=`${sequence.toLocaleString()}行受信 · ${records.length.toLocaleString()}行保持${invalidLines?` · CSV形式不正 ${invalidLines}行`:''}${overflowLines?` · 長さ超過 ${overflowLines}行`:''}`;$('logState').textContent=logsPaused?'PAUSED':'LIVE';dirtyLogs=false;
}
$('logLimit').onchange=e=>{limit=Number(e.target.value);records.length=Math.min(records.length,limit);if(frozenLogs)frozenLogs.length=Math.min(frozenLogs.length,limit);dirtyLogs=true;};
$('logSearch').oninput=e=>{search=e.target.value.toLowerCase();$('logViewport').scrollTop=0;dirtyLogs=true;};
$('pauseLogs').onclick=()=>{logsPaused=!logsPaused;frozenLogs=logsPaused?[...records]:null;$('pauseLogs').textContent=logsPaused?'表示を再開':'表示を一時停止';dirtyLogs=true;};
$('latest').onclick=()=>{logsPaused=false;frozenLogs=null;$('pauseLogs').textContent='表示を一時停止';$('logViewport').scrollTop=0;dirtyLogs=true;};
$('download').onclick=()=>{const escape=s=>'"'+String(s).replaceAll('"','""')+'"';const csv='\ufeffsequence,received_at,raw_csv\r\n'+[...records].reverse().map(r=>[r.id,escape(new Date(r.t).toISOString()),escape(r.raw)].join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='robot-log-'+new Date().toISOString().replaceAll(':','-')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
for(const b of document.querySelectorAll('[data-window]')){b.setAttribute('aria-pressed',String(Number(b.dataset.window)===windowSeconds));b.onclick=()=>{windowSeconds=Number(b.dataset.window);for(const x of document.querySelectorAll('[data-window]')){x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));}drawCharts();};}
let lastDraw=0;setInterval(()=>{if(!connected)return;controls.tick();updateMetrics();if(!$('statusPanel').hidden&&dirtyLogs&&(!logsPaused||$('logState').textContent!=='PAUSED'))renderLogs();if(Date.now()-lastDraw>=500){drawCharts();lastDraw=Date.now();}},250);
// Search / retention changes must also render when the log view is paused.
for(const element of [$('logSearch'),$('logLimit')])element.addEventListener('change',renderLogs);
$('logSearch').addEventListener('input',()=>{if(logsPaused)renderLogs();});
new ResizeObserver(drawCharts).observe($('dashboard'));
function stopDemo(){clearInterval(demoTimer);demo=false;const u=new URL(location.href);u.searchParams.delete('demo');history.replaceState(null,'',u);disconnected();$('connectionError').textContent='';}
$('exitDemo').onclick=stopDemo;
if(new URLSearchParams(location.search).get('demo')==='1'){
 demo=true;enterDashboard();const now=Date.now();
 for(let i=0;i<180;i++){receiveLine(demoPower(i));samples.at(-1).t=now-(179-i)*100;}
 let i=180;demoTimer=setInterval(()=>receiveLine(demoPower(i++)),100);
}
