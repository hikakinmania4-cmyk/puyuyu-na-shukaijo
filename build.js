// build.js

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const admin = require('firebase-admin');

// GitHub Actionsから渡される秘密のキーを読み込む設定です。
// process.env.FIREBASE_SERVICE_ACCOUNT の部分は、後でGitHub側で設定します。
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // ▼▼▼ あなたのデータベースURLに書き換えてください ▼▼▼
  databaseURL: "https://config-f5509-default-rtdb.firebaseio.com" 
});

const db = admin.database();

// 生成したHTMLファイルを出力するフォルダ名を 'dist' とします。
const OUTPUT_DIR = path.join(__dirname, 'dist'); 

async function buildSite() {
  try {
    console.log('Build process started...');
    
    // 出力先フォルダ 'dist' がなければ、新しく作成します。
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR);
    }

    // --- スレッド一覧ページのデータをFirebaseから取得 ---
    console.log('Fetching thread metadata from Firebase...');
    const metaRef = db.ref('threadMetadata').orderByChild('lastUpdatedAt');
    const metaSnapshot = await metaRef.once('value');
    // アーカイブされていないスレッドだけをフィルタリングして、新しい順に並べ替えます。
    const allThreads = metaSnapshot.val() ? Object.values(metaSnapshot.val()).filter(t => t && t.title && !t.isArchived).sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt) : [];
    console.log(`Successfully fetched ${allThreads.length} active threads.`);

    // --- index.html の生成 ---
    console.log('Rendering index.html...');
    const templatePath = path.join(__dirname, 'views', 'index.ejs');
    // ejs.renderFileを使って、テンプレートとデータを合体させます。
    const indexHtml = await ejs.renderFile(templatePath, { allThreads: allThreads });
    // 完成したHTMLを dist/index.html として保存します。
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);
    console.log('Successfully generated: dist/index.html');

    // 将来的には、ここで各スレッド詳細ページ (thread-xxxx.html) もループで生成できます。
    
    console.log('Build process finished successfully! ✨');
    // 正常に終了したことをシステムに伝えます。
    process.exit(0);

  } catch (error) {
    console.error("❌ Build failed:", error);
    // エラーが発生したことをシステムに伝えます。
    process.exit(1);
  }
}

// このプログラムを実行します。
buildSite();