export const DEFAULT_MAPPING={state:1,error:2,voltage:5,voltageMin:5,voltageMax:5,current:null,currentMin:3,currentMax:4,voltageScale:1,currentScale:1,staleSeconds:3};
export function parseCSV(text){
  const fields=[];let field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
    else if(c===','){fields.push(field);field='';closed=false;}
    else if(c==='"'){if(field.length||closed)return null;quoted=true;}
    else{if(closed)return null;field+=c;}
  }
  if(quoted)return null;fields.push(field);return fields;
}
export function numeric(value){
  if(typeof value!=='string'||!value.trim()||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
export function mapped(fields,cfg){
  if(!fields||!cfg)return null;
  const raw=key=>cfg[key]===null?null:fields[cfg[key]-1]??null;
  const num=(key,scale)=>{const n=numeric(raw(key));const result=n===null?null:n*scale;return Number.isFinite(result)?result:null;};
  const result={state:raw('state'),error:raw('error')};
  for(const kind of ['voltage','current']){
    result[kind]=num(kind,cfg[kind+'Scale']);result[kind+'Min']=num(kind+'Min',cfg[kind+'Scale']);result[kind+'Max']=num(kind+'Max',cfg[kind+'Scale']);
    if(result[kind+'Min']!==null&&result[kind+'Max']!==null&&result[kind+'Min']>result[kind+'Max']){result[kind+'Min']=null;result[kind+'Max']=null;result[kind+'Invalid']=true;}
  }
  return result;
}
export function validMapping(cfg){
  return cfg&&Object.keys(DEFAULT_MAPPING).every(k=>{
    const n=cfg[k];if(k.endsWith('Scale'))return typeof n==='number'&&Number.isFinite(n)&&n>0;
    if(k==='staleSeconds')return Number.isInteger(n)&&n>=1&&n<=300;
    return n===null||Number.isInteger(n)&&n>=1&&n<=256;
  });
}
export class LineDecoder{
  constructor(onLine,onOverflow=()=>{},max=4096){this.onLine=onLine;this.onOverflow=onOverflow;this.max=max;this.reset();}
  reset(){this.decoder=new TextDecoder();this.pending='';this.discard=false;}
  push(bytes){const text=this.decoder.decode(bytes,{stream:true});for(const c of text){
    if(c==='\n'){if(!this.discard&&this.pending.length)this.onLine(this.pending.endsWith('\r')?this.pending.slice(0,-1):this.pending);this.pending='';this.discard=false;}
    else if(!this.discard){this.pending+=c;if(this.pending.length>this.max){this.pending='';this.discard=true;this.onOverflow();}}
  }}
}
