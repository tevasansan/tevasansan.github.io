# Web通信

BLE UUIDと12バイト操作パケットは従来どおり。CALIBRATE=1、ESTOP=2、POWER_OFF=3、POWER_RESTART=4。
PWR行はCH32のCRC付きフォーマットをそのまま受信。詳細はprogram/POWER_PROTOCOL.md。
P_ACK,webSeq,operation,result は電源基板の実行結果。
C_ACK,webSeq,result,errors はQDD基板の実行結果。result=1受付/2実行中/3完了/4拒否/5失敗/6中止。
CAN,1824,alive,errors,flags,stage,limits,done は従来どおり8項目。マスクは10進数、状態値=-1は更新なし。
CAL,stage,axis,phase,done は追加の原点出し詳細。旧Webはこの行を無視し、CAN行の表示を継続できます。
axis=0/1/2はQDD1/2/3、3はDC、4は全軸終了。stage=0待機/1停止確認/2有効化/3探索/4原点記録/5完了。phase=1離脱/2接近/3入力安定確認/4終了/5失敗。
直前の10項目CAN行も新Webでは引き続き読み取れます。
ACT,id,state,position,speed,current,torque,error の論理ID6〜8がQDD1〜3。未計測値は空欄。
ADC診断行はログへ表示。未知の行も受信ログへ保存。サーバーへの送信や自動コマンド再送はありません。
