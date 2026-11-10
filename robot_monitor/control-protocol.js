import {numeric} from './core.js';
export const RX_UUID='6e400002-b5a3-f393-e0a9-e50e24dcca9e';
export const ACTUATORS=[
 ...Array.from({length:5},(_,i)=>({id:i+1,name:`BLDC ${i+1}`,model:'CHP-42GP-BL4260',type:'BLDC'})),
 ...Array.from({length:3},(_,i)=>({id:i+6,name:`QDD ${i+1}`,model:'GIM6010-8',type:'QDD'})),
 ...Array.from({length:2},(_,i)=>({id:i+9,name:`Servo ${i+1}`,model:'STS3215',type:'SERVO'}))
];
export const OPS={CALIBRATE:1,ESTOP:2,POWER_OFF:3,ENABLE:16,DISABLE:17,STOP:18,SET_SPEED:19,SET_POSITION:20,SET_TORQUE:21};
export const MODES={BLDC:[['SET_SPEED','速度','rpm']],QDD:[['SET_POSITION','位置','deg'],['SET_TORQUE','トルク','N·m']],SERVO:[['SET_POSITION','位置','deg']]};
export function supports(id,op){const a=ACTUATORS.find(x=>x.id===id);return !!a&&(['ENABLE','DISABLE','STOP'].includes(op)||MODES[a.type].some(x=>x[0]===op));}
export function encodeCommand(seq,op,target=0,value=0){
 if(!Number.isInteger(seq)||seq<1||seq>0xffffffff||!(op in OPS)||!Number.isFinite(value)||!Number.isFinite(Math.fround(value)))throw new Error('指令値が不正です');
 const global=['CALIBRATE','ESTOP','POWER_OFF'].includes(op);
 if(global?(target!==0||value!==0):!supports(target,op))throw new Error('対象と指令の組み合わせが不正です');
 if(['ENABLE','DISABLE','STOP'].includes(op)&&value!==0)throw new Error('この指令に値は指定できません');
 const bytes=new Uint8Array(12),dv=new DataView(bytes.buffer);bytes[0]=1;bytes[1]=OPS[op];bytes[2]=target;dv.setUint32(4,seq,true);dv.setFloat32(8,value,true);return bytes;
}
export function decodeSpecial(fields){
 if(!fields)return null;
 if(fields[0]==='ACT'){
  if(fields.length!==8)return {kind:'invalid'};
  const id=Number(fields[1]);if(!/^\d+$/.test(fields[1])||!ACTUATORS.some(a=>a.id===id))return {kind:'invalid'};
  const nums=fields.slice(3,7).map(numeric);if(fields.slice(3,7).some((s,i)=>s!==''&&nums[i]===null))return {kind:'invalid'};
  return {kind:'actuator',id,state:fields[2],position:nums[0],speed:nums[1],current:nums[2],torque:nums[3],error:fields[7]};
 }
 if(fields[0]==='ACK'){
  const seq=Number(fields[1]);if(fields.length!==3||!/^\d+$/.test(fields[1])||!Number.isInteger(seq)||seq<1||seq>0xffffffff||fields[2]!=='FORWARDED')return {kind:'invalid'};
  return {kind:'ack',seq};
 }
 return null;
}
export function describeCommand(seq,op,target,value){return ['CMD',seq,...(target?['ACT',target,op,value]:[op])].join(',');}
