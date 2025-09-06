// Firebase Functionsを動かすための基本的なおまじない
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// JST (日本標準時) でスケジュールを設定するための設定
const timezone = "Asia/Tokyo";

// 'pruneOldThreads' という名前の関数を定義
// 毎日、日本時間の午前4時00分に自動で実行されるようにスケジュール
exports.pruneOldThreads = functions.region("asia-northeast1") // 東京リージョンを指定
  .pubsub.schedule("0 4 * * *").timeZone(timezone)
  .onRun(async (context) => {
    // データベースへの参照を取得
    const db = admin.database();

    // 2日前 (48時間前) の時刻を計算
    const now = Date.now();
    const cutoff = now - 2 * 24 * 60 * 60 * 1000; // 48時間前のミリ秒

    // スレッド一覧のメタデータを取得
    const metadataRef = db.ref("/threadMetadata");
    const snapshot = await metadataRef.orderByChild("lastUpdatedAt").endAt(cutoff).once("value");

    // 削除対象がなければ、ここで処理を終了
    if (!snapshot.exists()) {
      console.log("削除対象のスレッドはありませんでした。");
      return null;
    }

    // 削除オペレーションをまとめるためのオブジェクト
    const updates = {};
    let count = 0;

    // 取得した古いスレッドを一つずつ処理
    snapshot.forEach((childSnapshot) => {
      const threadId = childSnapshot.key;
      // このIDのスレッドを3つの場所から削除するよう予約
      updates[`/threads/${threadId}`] = null;
      updates[`/threadMetadata/${threadId}`] = null;
      updates[`/viewers/${threadId}`] = null;
      count++;
    });

    // 予約した全ての削除オペレーションを一度に実行
    await db.ref().update(updates);

    console.log(`${count}件の古いスレッドを削除しました。`);
    return null;
  });