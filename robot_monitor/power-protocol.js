export const STATES={0:'プリチャージ中',1:'主リレー接点安定待ち',2:'電源ON',3:'起動・再投入待ち',99:'電源遮断'};
export const ERRORS={0:'正常',1:'低電圧',2:'過電圧',3:'過電流',4:'プリチャージ失敗',5:'ADC異常',6:'緊急停止（ラッチ）'};
export const RESULTS={1:'電源基板で処理済み',2:'再投入シーケンス実行中',3:'拒否：緊急停止入力あり',4:'拒否：電圧・電流・ADC異常',5:'再投入失敗：電源状態を確認',6:'未実装の指令'};
export function crc16(text){let crc=0xffff;for(const b of new TextEncoder().encode(text)){crc^=b<<8;for(let i=0;i<8;i++)crc=((crc<<1)^((crc&0x8000)?0x1021:0))&0xffff;}return crc;}
export function decodePower(raw){
 if(!raw.startsWith('PWR,'))return null;
 const match=/^(.*)\*([0-9a-fA-F]{4})$/.exec(raw);if(!match||crc16(match[1])!==parseInt(match[2],16))return {kind:'invalid'};
 const f=match[1].split(',');if(f.length!==13||f.slice(1).some(s=>!/^(-?\d+)$/.test(s)))return {kind:'invalid'};
 const n=f.slice(1).map(Number),[version,uptime,state,error,flags,vmin,vmax,imin,imax,seq,op,result]=n;
 if(n.some(x=>!Number.isSafeInteger(x))||version!==1||uptime<0||uptime>0xffffffff||!(state in STATES)||!(error in ERRORS)||flags<0||flags>31||vmin<0||vmax>200000||vmin>vmax||imin< -500000||imax>500000||imin>imax||seq<0||seq>0xffffffff||op<0||op>255||result<0||result>6)return {kind:'invalid'};
 const valid=!!(flags&16);
 return {kind:'power',uptime,stateCode:state,errorCode:error,state:STATES[state],error:ERRORS[error],flags,main:!!(flags&1),pre:!!(flags&2),regen:!!(flags&4),estop:!!(flags&8),valid,seq,op,result,
 voltage:null,current:null,voltageMin:valid?vmin/1000:null,voltageMax:valid?vmax/1000:null,currentMin:valid?imin/1000:null,currentMax:valid?imax/1000:null};
}
export function demoPower(t){const v=24600+Math.round(Math.sin(t*.1)*120),i=1800+Math.round(Math.sin(t*.13)*600);const s=`PWR,1,${t*100},2,0,17,${v-90},${v+100},${i-300},${i+350},0,0,0`;return s+'*'+crc16(s).toString(16).padStart(4,'0').toUpperCase();}
