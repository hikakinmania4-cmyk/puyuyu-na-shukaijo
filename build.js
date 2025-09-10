// build.js (最終完成版)

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const admin = require('firebase-admin');

// GitHub Actionsから渡される秘密のキーを読み込む設定
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://config-f5509-default-rtdb.firebaseio.com" // あなたのデータベースURL
});

const db = admin.database();

// 生成したHTMLファイルを出力するフォルダ名
const OUTPUT_DIR = path.join(__dirname, 'dist'); 

async function buildSite() {
  try {
    console.log('Build process started...');
    
    // 出力先フォルダ 'dist' がなければ、新しく作成
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR);
    }

    // --- 1. 全スレッドの完全なデータをFirebaseから一度に取得 ---
    console.log('Fetching all threads data from Firebase...');
    const threadsRef = db.ref('threads');
    const threadsSnapshot = await threadsRef.once('value');
    const allThreadsData = threadsSnapshot.val() || {};
    
    // index.html用に、アーカイブされていないスレッドをフィルタリングして新しい順にソート
    const threadsForIndex = Object.values(allThreadsData)
        .filter(t => t && t.title && !t.isArchived)
        .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
    console.log(`Successfully fetched ${threadsForIndex.length} active threads.`);

    // --- 2. index.html（スレッド一覧ページ）の生成 ---
    console.log('Rendering index.html...');
    const indexPath = path.join(__dirname, 'views', 'index.ejs');
    const indexHtml = await ejs.renderFile(indexPath, { allThreads: threadsForIndex });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);
    console.log('Successfully generated: dist/index.html');

    // --- 3. 全てのスレッド詳細ページの生成 ---
    console.log('Rendering individual thread pages...');
    const threadTemplatePath = path.join(__dirname, 'views', 'thread.ejs');
    
    // ループを使って、アクティブなスレッドのページを一つずつ生成
    for (const thread of threadsForIndex) {
      // 投稿を時系列順にソート
      const posts = Object.values(thread.posts || {}).sort((a, b) => a.createdAt - b.createdAt);
      
      // テンプレートとデータを合体させてHTMLを生成
      const threadHtml = await ejs.renderFile(threadTemplatePath, { thread: thread, posts: posts });
      
      // thread-xxxx.html という名前でファイルを出力
      const outputFilename = `thread-${thread.id}.html`;
      fs.writeFileSync(path.join(OUTPUT_DIR, outputFilename), threadHtml);
      console.log(` -> Generated: ${outputFilename}`);
    }
    
    console.log('Build process finished successfully! ✨');
    // 正常終了をシステムに伝える
    process.exit(0);

  } catch (error) {
    console.error("❌ Build failed:", error);
    // 異常終了をシステムに伝える
    process.exit(1);
  }
}

// プログラムを実行
buildSite();