// ==========================================================
// ヘーパイストスの自動人形の魂 (search-worker.js)
// ==========================================================

// 1. 神々の国の場所と、そこへアクセスするための道具を工房に持ち込む
importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js");

let db;

// 2. 主（メインHTML）からの命令を待つ
self.onmessage = function(e) {
    const { command, firebaseConfig, allThreadsMeta, userId, keyword } = e.data;

    // 最初の命令で、工房から神々の国へ接続する
    if (command === 'initialize' && firebaseConfig) {
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            // 準備完了を主に報告
            self.postMessage({ status: 'initialized' });
        } catch (error) {
            // 接続失敗を主に報告
            self.postMessage({ status: 'error', message: 'Firebase initialization failed in worker.' });
        }
        return;
    }

    // 検索命令が来たら、作業を開始する
    if (command === 'search' && db) {
        performSearch(allThreadsMeta, userId, keyword);
    }
};

// 3. 命令を実行する（非常に重い作業）
async function performSearch(allThreadsMeta, userId, keyword) {
    const results = [];
    // 進捗状況を主に報告
    self.postMessage({ status: 'progress', message: '全スレッドの調査を開始します…' });

    try {
        // 全てのスレッドの書庫（posts）を一つずつ確認する
        for (let i = 0; i < allThreadsMeta.length; i++) {
            const meta = allThreadsMeta[i];
            const postsSnapshot = await db.ref(`threads/${meta.id}/posts`).once('value');
            const posts = postsSnapshot.val();
            
            if (posts) {
                for (const postId in posts) {
                    const post = posts[postId];
                    
                    // 条件に合う投稿を探す
                    const isTargetUser = post.author && post.author.permanentId === userId;
                    const hasKeyword = keyword ? post.text && post.text.toLowerCase().includes(keyword.toLowerCase()) : true;

                    if (isTargetUser && hasKeyword) {
                        results.push({ thread: meta, post: post });
                    }
                }
            }
            // 進捗をパーセントで報告
            self.postMessage({ status: 'progress', progress: Math.round(((i + 1) / allThreadsMeta.length) * 100) });
        }
        // 全ての作業が完了したことを、結果と共に主に報告
        self.postMessage({ status: 'complete', results: results });
    } catch (error) {
        // 作業失敗を主に報告
        self.postMessage({ status: 'error', message: error.message });
    }
                }
