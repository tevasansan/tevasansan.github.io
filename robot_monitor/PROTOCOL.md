# Web通信

BLE UUIDと12バイト操作パケットは従来どおり。CALIBRATE=1、ESTOP=2、POWER_OFF=3、POWER_RESTART=4。
PWR行はCH32のCRC付きフォーマットをそのまま受信。詳細はprogram/POWER_PROTOCOL.md。
P_ACK,webSeq,operation,result は電源基板の実行結果。
C_ACK,webSeq,result,errors はQDD基板の実行結果。result=1受付/2実行中/3完了/4拒否/5失敗/6中止。
CAN,1824,alive,errors,flags,stage,limits,done は0x720の状態。マスクは10進数、stage/limits/done=-1は更新なし。
ACT,id,state,position,speed,current,torque,error の論理ID6〜8がQDD1〜3。未計測値は空欄。
ADC診断行はログへ表示。未知の行も受信ログへ保存。サーバーへの送信や自動コマンド再送はありません。
