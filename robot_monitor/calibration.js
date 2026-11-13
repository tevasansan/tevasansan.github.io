// 通信状態と基板エラーは別物。エラーは内容を表示し、一律には操作を禁止しない。
const ERRORS = [
 [0x0001,'親の生存通知なし'], [0x0002,'親からの動作許可なし'],
 [0x0004,'QDDの情報が未受信／古い'], [0x0008,'モーター異常'],
 [0x0010,'リミット待ち時間超過'], [0x0020,'送信受付失敗の履歴'],
 [0x0040,'旧ファームの未設定フラグ'], [0x0080,'子の生存通知なし'],
 [0x0100,'電源が動作可能状態でない'], [0x0200,'原点出し中止'],
 [0x0400,'旧診断：受信キュー溢れ'], [0x0800,'旧診断：CAN内部受信エラー']
];
export function describeCanErrors(errors) {
 if(!errors) return 'なし';
 const labels=ERRORS.filter(([bit])=>errors&bit).map(([,label])=>label);
 if(errors&0xf000)labels.push('未定義エラー');
 return labels.join(' / ');
}
export function calibrationBlockReason({available,power,can,now,pending}) {
 if(!available)return 'Bluetoothの操作接続が必要です';
 if(!power||now-power.t>=1000||!power.valid)return '電源情報を待っています';
 if(power.stateCode!==2||power.errorCode!==0||power.estop)return '電源を通常運転状態にしてください';
 if(!can||now-can.t>=1000||!can.alive)return 'QDD基板の生存通知を待っています';
 if((can.flags&2)||pending)return 'キャリブレーション実行中です';
 return '';
}
export function calibrationProgress(can) {
 const axis=can.axis>=0&&can.axis<3?`QDD ${can.axis+1}`:can.axis===3?'DCモーター':'全軸';
 if(can.stage===1)return '準備：全QDDの停止確認';
 if(can.stage===2)return `準備：${can.axis<3?axis:'全QDD'}の速度制御を有効化`;
 if(can.stage===3)return `${axis}：${({1:'リミットから離脱',2:'リミットへ接近',3:'停止・入力の安定確認'})[can.phase]||'原点探索中'}`;
 if(can.stage===4)return '全軸停止・QDDの原点を記録';
 if(can.stage===5||(can.flags&4))return '完了';
 return '待機／停止';
}
