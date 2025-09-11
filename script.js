const firebaseConfig = {
  apiKey: "AIzaSyDS3Tlr9Oc4z5Kz2Zg72p9VRayPSAbmwTw",
  authDomain: "config-f5509.firebaseapp.com",
  databaseURL: "https://config-f5509-default-rtdb.firebaseio.com",
  projectId: "config-f5509",
  storageBucket: "config-f5509.appspot.com",
  messagingSenderId: "513023904601",
  appId: "1:513023904601:web:1846aa87aec5de306e1a48",
  measurementId: "G-KT2LZC2EED"
};

const ACHIEVEMENTS_MASTER = {
  'mini_wai':     { title: 'ミニワイ🥹', description: 'ユーザーレベル5到達。' },
  'puyuyu':       { title: 'ぷゆゆ🥺', description: 'ユーザーレベル10到達。' },
  'teriri':       { title: 'てりり😠', description: 'ユーザーレベル30到達。' },
  'yumechan':     { title: 'ゆめちゃん🤥', description: 'ユーザーレベル60到達。' },
  'saikyo_ode':   { title: '最強の、おでw😃', description: 'ユーザーレベル1000到達。' },
  'hanchou':      { title: 'ハンチョウ😎', description: '!dice 3d6で出目が4,5,6（順不同）。' },
  'eye_puyuyu':   { title: '”眼”のぷゆゆ🧿', description: '隠しコマンドを使用する。' },
  'king_puyuyu':  { title: '👑キングぷゆゆ', description: '自身のスレッドが1000レスに到達。' },
  'popular_puyuyu': { title: '人気者🥺', description: '自身の投稿に🥺のリアクションが10個付く。' }
};

const NG_WORDS = ['바보', '멍청이', '죽어', '死ね', 'バカ', '馬鹿', 'kill', 'idiot'];
const ADMIN_IDS = ['W4ZZKXRY9CS'];
document.addEventListener('DOMContentLoaded', () => { main(); });

function main() {
  let audioContext = null;
  const initAudioContext = () => {
    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
      } catch (e) {
        console.error("AudioContextの初期化に失敗しました", e);
      }
    } else if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    document.body.removeEventListener('click', initAudioContext, { once: true });
    document.body.removeEventListener('keydown', initAudioContext, { once: true });
  };
  document.body.addEventListener('click', initAudioContext, { once: true });
  document.body.addEventListener('keydown', initAudioContext, { once: true });

  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
    document.getElementById('app').innerHTML = `<div class="card"><h2>🚨 設定が必要です！</h2><p>HTMLファイル内の <code>firebaseConfig</code> が未設定です。</p></div>`; return;
  }
  try { firebase.initializeApp(firebaseConfig); } catch (e) { alert("Firebaseの初期化に失敗しました。"); return; }
  const db = firebase.database();

  let globalBanList = {};
  let myTotalExp = 0;
  let loadingInterval = null;
  let currentEditState = null;
  let drawingDataUrl = null;
  let heartbeatInterval = null;
  let janitorInterval = null;
  let searchWorker = null;
  let drawingEventListeners = [];

  const banRef = db.ref('globalBan');
  banRef.on('value', (snapshot) => {
      globalBanList = snapshot.val() || {};
      const currentThreadId = location.hash.startsWith('#thread-') ? location.hash.replace('#thread-','') : null;
      if (currentThreadId && document.getElementById('postsContainer')) {
          Promise.all([
              db.ref('threads/' + currentThreadId).once('value'),
              db.ref('userLevels').once('value'),
              db.ref('userAchievements').once('value')
          ]).then(([threadSnapshot, userLevelsSnapshot, achievementsSnapshot]) => {
              const threadData = threadSnapshot.val();
              userLevelsCache = userLevelsSnapshot.val() || {};
              userAchievementsCache = achievementsSnapshot.val() || {};
              if (threadData) {
                // 必要ならここで再描画
              }
          });
      }
  });

  let activeDataListener = null, activeViewersListener = null, myConnectionRef = null, allThreads = [], currentViewers = 0, currentPage = 1;
  let activeUnreadListeners = [];
  let unreadStatus = {};
  let repliesToMe = {};
  let myPostNumbersCache = {};
  let threadDataCache = {};
  let userLevelsCache = {}; 
  let userAchievementsCache = {};
  let effectObserver = null;
  let pendingAchievementsCache = {};
  let activeAchievementListener = null;

  const THREADS_PER_PAGE = 15;

  function cleanupListeners() {
    if(activeDataListener){
        if (Array.isArray(activeDataListener)) {
            activeDataListener.forEach(l => l.ref.off(l.type, l.callback));
        } else if (activeDataListener.ref && activeDataListener.callback) {
            activeDataListener.ref.off('value', activeDataListener.callback);
        }
        activeDataListener = null;
    }
    if(activeViewersListener){ activeViewersListener.ref.off('value', activeViewersListener.callback); activeViewersListener = null; }
    if(myConnectionRef){ myConnectionRef.remove(); myConnectionRef = null; }
    if(effectObserver) { effectObserver.disconnect(); effectObserver = null; }
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    if(janitorInterval) clearInterval(janitorInterval);
    heartbeatInterval = null;
    janitorInterval = null;
    
    drawingEventListeners.forEach(({element, type, handler, options}) => {
        element.removeEventListener(type, handler, options);
    });
    drawingEventListeners = [];
    
    if (activeAchievementListener) {
        activeAchievementListener.ref.off('value', activeAchievementListener.callback);
        activeAchievementListener = null;
    }
  }
  const PERMANENT_ID_COOKIE = 'puyuyun_permanent_id_v2';
  const DAILY_ID_COOKIE = 'puyuyun_daily_id_v2';
  const USERNAME_COOKIE = 'puyuyun_username_v1';
  const LAST_POST_TIME_KEY = 'puyuyun_last_post_time';
  const EFFECT_COOLDOWN_KEY = 'puyuyun_effect_cooldown';
  const POST_INTERVAL_SECONDS = 10;
  const EFFECT_COOLDOWN_SECONDS = 30;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const POST_LIMIT = 1000;
  const TITLE_LIMIT = 25;
  const NAME_LIMIT = 11;
  const TEXT_LIMIT = 1000;
  const MAX_NEWLINES = 30;
  const MAX_CONSECUTIVE_NEWLINES = 2;
  const VOTE_OPTION_LIMIT = 15;
  const HISTORY_KEY = 'puyuyun_history_v1';
  const THEME_KEY = 'puyuyun_theme';
  const NAME_HISTORY_KEY = 'puyuyun_name_history_v1';
  const NG_SETTINGS_KEY = 'puyuyun_ng_settings_v1';
  const SOUND_SETTINGS_KEY = 'puyuyun_sound_settings_v1';
  const NEXT_THREAD_DATA_KEY = 'puyuyun_next_thread_data';
  const DAILY_ACTIVITY_KEY = 'puyuyun_daily_activity_v1';
  
  const REACTION_PAIRS = { '🥺': '🥹', '😎': '🤓', '😅': '😓' };
  const BASE_REACTIONS = Object.keys(REACTION_PAIRS);
  
  function startLoadingAnimation(element, text = '読み込み中') {
    if (loadingInterval) clearInterval(loadingInterval);
    const emojiSequence = ['🥺', '🌔', '🌓', '🌒', '🌑', '🌘', '🌗', '🌖', '🤡'];
    let currentIndex = 0;
    const textSpan = document.createElement('span');
    textSpan.textContent = `${text}… `;
    const emojiSpan = document.createElement('span');
    emojiSpan.textContent = emojiSequence[currentIndex];
    element.innerHTML = ''; 
    element.appendChild(textSpan);
    element.appendChild(emojiSpan);
    loadingInterval = setInterval(() => {
      currentIndex = (currentIndex + 1) % emojiSequence.length;
      emojiSpan.textContent = emojiSequence[currentIndex];
    }, 150);
  }

  function stopLoadingAnimation() {
      if (loadingInterval) {
          clearInterval(loadingInterval);
          loadingInterval = null;
      }
  }
  
  function loadNameHistory() { try { return JSON.parse(localStorage.getItem(NAME_HISTORY_KEY)) || []; } catch(e) { return []; } }
  function saveNameHistory(history) { localStorage.setItem(NAME_HISTORY_KEY, JSON.stringify(history)); }
  function loadNgSettings() { try { return JSON.parse(localStorage.getItem(NG_SETTINGS_KEY)) || {}; } catch(e) { return {}; } }
  function saveNgSettings(settings) { localStorage.setItem(NG_SETTINGS_KEY, JSON.stringify(settings)); }
  function loadSoundSettings() { try { return JSON.parse(localStorage.getItem(SOUND_SETTINGS_KEY)) || { enabled: true }; } catch(e) { return { enabled: true }; } }
  function saveSoundSettings(settings) { localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings)); }
  function loadDailyActivity() { try { return JSON.parse(localStorage.getItem(DAILY_ACTIVITY_KEY)) || { date: '', postCount: 0 }; } catch(e) { return { date: '', postCount: 0 }; } }
  function saveDailyActivity(activity) { localStorage.setItem(DAILY_ACTIVITY_KEY, JSON.stringify(activity)); }

  function uid(l=10){return Math.random().toString(36).slice(2,2+l).toUpperCase();}
  function setCookie(n,v,d=365){const e=new Date();e.setTime(e.getTime()+(d*24*60*60*1000));document.cookie=`${n}=${encodeURIComponent(v)};expires=${e.toUTCString()};path=/;SameSite=Lax;Secure`;}
  function getCookie(n){const kv=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(n+'='));return kv?decodeURIComponent(kv.split('=')[1]):null;}
  function escapeHTML(s){if(s==null)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function formatTimestamp(ts) {
    const d = new Date(ts);
    const M = (d.getMonth() + 1).toString().padStart(2, '0');
    const D = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${M}/${D} ${h}:${m}`;
  }
  function formatTimeLeft(timeLeft) {
    if (timeLeft <= 0) return '締め切り';
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    let timeString = '';
    if (days > 0) timeString += `${days}日 `;
    if (hours > 0 || days > 0) timeString += `${String(hours).padStart(2,'0')}:`;
    timeString += `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    return timeString;
  }
  function getJstDateString() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(now);
  }
  function getJstDateStringFromTimestamp(ts) {
    const d = new Date(ts);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 2000;
      opacity: 0;
      transition: opacity 0.5s, bottom 0.5s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.bottom = '30px';
    }, 10);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.bottom = '20px';
      setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  async function unlockAchievement(userId, achievementId) {
    if (!ACHIEVEMENTS_MASTER[achievementId]) return;
    const achievementRef = db.ref(`userAchievements/${userId}/achievements/${achievementId}`);
    const snapshot = await achievementRef.once('value');
    if (!snapshot.exists()) {
      await achievementRef.set(true);
      const achievement = ACHIEVEMENTS_MASTER[achievementId];
      showToast(`🏆 実績を解除しました：【${achievement.title}】`);
      const soundSettings = loadSoundSettings();
      if (soundSettings.enabled) {
        if(audioContext && audioContext.state === 'running') {
            const sound = document.getElementById('notificationSound');
            sound.currentTime = 0;
            sound.play().catch(e => { console.error("サウンド再生に失敗:", e); });
        }
      }
    }
  }
  
  function getMomentumScore(thread) {
    let score = 0;
    const now = Date.now();
    const minutesSinceLastPost = (now - thread.lastUpdatedAt) / (1000 * 60);
    if (minutesSinceLastPost < 1) score += 50;
    else if (minutesSinceLastPost < 10) score += 20;
    else if (minutesSinceLastPost < 60) score += 5;
    const viewers = thread.viewerCount || 0;
    if (viewers >= 10) score += 40;
    else if (viewers >= 5) score += 20;
    else if (viewers >= 3) score += 10;
    return score;
  }

  function getMomentumEmoji(thread) {
    if (thread.tags && thread.tags.includes('レベル上げ')) return '';
    const score = getMomentumScore(thread);
    if (score >= 70) return '🚀';
    if (score >= 40) return '🔥🔥🔥';
    if (score >= 20) return '🔥🔥';
    if (score >= 1) return '🔥';
    return '';
  }

  function renderContent(s, post = null) {
      let content = escapeHTML(s);
      if(content.match(/javascript:/i)) return '[XSS Alert]';

      content = content.replace(/&gt;&gt;(\d+)/g, '<a href="#" data-action="quote" data-num="$1">&gt;&gt;$1</a>');
      
      const urlRegex = /(https?:\/\/[^\s<>"'()]+)/g;
      content = content.replace(urlRegex, (url) => {
          const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
          const twitterRegex = /https?:\/\/(?:twitter|x)\.com\/(?:\w+)\/status\/\d+/;
          const mediaRegex = /\.(?:jpg|jpeg|png|gif|webp|mp4|webm)$/i;

          const youtubeMatch = url.match(youtubeRegex);
          if (youtubeMatch) {
              return `<div class="embed-container"><iframe src="https://www.youtube.com/embed/${youtubeMatch[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
          }
          if (url.match(twitterRegex)) {
              return `<blockquote class="twitter-tweet" data-dnt="true"><a href="${url}">${url}</a></blockquote>`;
          }
          if (url.match(mediaRegex)) {
              if (url.toLowerCase().match(/\.(?:mp4|webm)$/)) {
                  return `<video src="${url}" controls class="embedded-video"></video>`;
              } else {
                  return `<img src="${url}" class="post-image" data-action="open-lightbox">`;
              }
          }
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      });

      let voteIndex = 0;
      const voteRegex = /\[vote\((\d+)\):([^\]]+)\]/g;
      content = content.replace(voteRegex, (match, p1, p2) => {
          const deadlineTimestamp = parseInt(p1, 10);
          const options = p2.split(',').map(opt => opt.trim());
          const isExpired = deadlineTimestamp > 0 && Date.now() > deadlineTimestamp;
          const voteId = post ? `vote-${post.id}-${voteIndex++}` : `vote-preview-${voteIndex++}`;
          const threadId = location.hash.startsWith('#thread-') ? location.hash.replace('#thread-', '') : null;
          if (!post || !threadId) {
              return `<div class="vote-box">${options.map(opt => `<button class="btn small" disabled>${escapeHTML(opt)}</button>`).join(' ')}</div>`;
          }
          const currentUser = getUser();
          const votes = post.votes || {};
          const myVote = votes[currentUser.permanentId];
          let voteCounts = {};
          options.forEach(opt => { voteCounts[opt] = 0; });
          Object.values(votes).forEach(votedOption => {
              if (voteCounts[votedOption] !== undefined) voteCounts[votedOption]++;
          });
          const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
          let headerHtml = '';
          if (isExpired) {
              headerHtml = `<div class="small-muted" style="margin-bottom:8px; text-align:center; font-weight:bold;">このアンケートは締め切られました</div>`;
          } else if (deadlineTimestamp > 0) {
              const timeLeft = deadlineTimestamp - Date.now();
              const initialCountdownText = formatTimeLeft(timeLeft);
              headerHtml = `<div class="small-muted" style="margin-bottom:8px; text-align:center; font-weight:bold;">
                              <span>⏰ 投票終了まで: </span>
                              <span class="vote-countdown" data-deadline="${deadlineTimestamp}">${initialCountdownText}</span>
                          </div>`;
          }
          const optionsHtml = options.map(opt => {
              const count = voteCounts[opt] || 0;
              const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
              const isVotedByUser = myVote === opt;
              const containerClass = `vote-option-bar-container ${isVotedByUser ? 'voted-by-user' : ''} ${isExpired ? 'expired' : ''}`;
              const dataAction = isExpired ? '' : `data-action="vote" data-thread-id="${threadId}" data-post-id="${post.id}" data-vote-option="${escapeHTML(opt)}"`;
              return `
                  <div class="${containerClass}" ${dataAction}>
                      <span class="vote-label">${escapeHTML(opt)}</span>
                      <div class="vote-bar-wrapper">
                          <div class="vote-option-bar" style="width: ${percentage}%;"></div>
                      </div>
                      <span class="vote-result">${count}票 (${percentage.toFixed(1)}%)</span>
                  </div>
              `;
          }).join('');
          return `<div class="vote-box" id="${voteId}">${headerHtml}${optionsHtml}</div>`;
      });

      const diceResultRegex = /\[(\d+D\d+)=([\d\s]+)\s\(([\d,\s]+)\)\]/g;
      content = content.replace(diceResultRegex, (match, type, sum, rolls) => {
          if (rolls.includes(',')) {
              const highlightedRolls = rolls.replace(/(\d+)/g, `<span class="dice-result">$1</span>`);
              return `<span class="dice-result">${sum}</span> (${highlightedRolls})`;
          } else {
              return `<span class="dice-result">${sum}</span>`;
          }
      });
      return content.replace(/\n/g, '<br>');
  }
  
  function ensureUser() {
    let permanentId = getCookie(PERMANENT_ID_COOKIE);
    if (!permanentId) {
      const oldId = getCookie('puyuyun_permanent_id_v1');
      if (oldId) {
        permanentId = oldId;
        setCookie(PERMANENT_ID_COOKIE, permanentId, 365 * 10);
      } else {
        permanentId = uid(16);
        setCookie(PERMANENT_ID_COOKIE, permanentId, 365 * 10);
      }
    }
    const todayStr = getJstDateString();
    let dailyInfo = {}; try { dailyInfo = JSON.parse(getCookie(DAILY_ID_COOKIE) || '{}'); } catch (e) {}
    if (dailyInfo.date !== todayStr || !dailyInfo.id) {
        dailyInfo = { id: uid(8), date: todayStr };
        setCookie(DAILY_ID_COOKIE, JSON.stringify(dailyInfo), 1);
    }
    let username = getCookie(USERNAME_COOKIE) || 'そのへんのミニワイ🥹';
    return { permanentId, id: dailyInfo.id, name: username };
  }
  
  function getLevel(exp) {
    return (exp || 0) + 1;
  }

  function setUserName(n){
      if (n.length > NAME_LIMIT) {
        alert(`名前は${NAME_LIMIT}文字以内にしてください。`);
        return false;
      }
      setCookie(USERNAME_COOKIE, n, 365);
      const history = loadNameHistory();
      const newHistory = history.filter(item => item.name !== n);
      newHistory.unshift({ name: n, changedAt: Date.now() });
      if (newHistory.length > 20) newHistory.pop();
      saveNameHistory(newHistory);
      refreshHeader();
      const newNameInput = document.getElementById('newName');
      if (newNameInput) newNameInput.value = n;
      const replyNameInput = document.getElementById('replyName');
      if (replyNameInput) replyNameInput.value = n;
      return true;
  }
  function getUser(){return ensureUser();}
  function refreshHeader(){document.getElementById('userDisplay').textContent=`あなた: ${getUser().name}`;}
  function loadHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY))||[];}catch(e){return[];}}
  function saveHistory(h){localStorage.setItem(HISTORY_KEY,JSON.stringify(h));}
  function addToHistory(id,title,lastUpdatedAt){let h=loadHistory();h=h.filter(i=>i.id!==id);h.unshift({id,title,lastUpdatedAt,visitedAt:Date.now()});if(h.length>50)h.pop();saveHistory(h);}
  function removeFromHistory(id){let h=loadHistory();h=h.filter(i=>i.id!==id);saveHistory(h);}
  function goHome(){location.hash='';}

  function displayThreads(threadsToDisplay, sortMode = 'newPost', tagFilter = null, isReversed = false, page = 1, searchTerm = null) {
    const c = document.getElementById('threadListContainer'); 
    const p = document.getElementById('paginationContainer');
    if(!c || !p) return;
  
    const ngSettings = loadNgSettings();
    const hideWords = Object.keys(ngSettings).filter(word => ngSettings[word] === 'hide');
    const redWords = Object.keys(ngSettings).filter(word => ngSettings[word] === 'red');
  
    let displayableThreads = threadsToDisplay;
  
    if (sortMode === 'manyRes') {
        displayableThreads = displayableThreads.filter(t => t.postCounter < POST_LIMIT);
    }
    
    if (tagFilter) {
      displayableThreads = displayableThreads.filter(t => (t.tags || []).includes(tagFilter));
    }
    
    let sortedThreads = [...displayableThreads].sort((a, b) => {
      if (sortMode === 'newPost') return b.lastUpdatedAt - a.lastUpdatedAt;
      if (sortMode === 'newThread') return b.createdAt - a.createdAt;
      if (sortMode === 'manyRes') return (b.postCounter || 0) - (a.postCounter || 0);
      if (sortMode === 'momentum') {
        const scoreA = getMomentumScore(a);
        const scoreB = getMomentumScore(b);
        return scoreB - scoreA;
      }
      return 0;
    });
  
    if (isReversed) {
        sortedThreads.reverse();
    }
  
    const threadsAfterNgFilter = sortedThreads.filter(t => {
        const title = t.title || ''; 
        return !hideWords.some(word => title.toLowerCase().includes(word.toLowerCase()));
    });
    
    const totalPages = Math.max(1, Math.ceil(threadsAfterNgFilter.length / THREADS_PER_PAGE));
    currentPage = Math.min(page, totalPages);
    
    const startIndex = (currentPage - 1) * THREADS_PER_PAGE;
    const endIndex = startIndex + THREADS_PER_PAGE;
    const pagedThreads = threadsAfterNgFilter.slice(startIndex, endIndex);
  
    if(pagedThreads.length===0){
      c.innerHTML=`<div class="small-muted">${tagFilter ? `タグ「${escapeHTML(tagFilter)}」が付いたスレッドはありません。` : '該当するスレッドがありません'}</div>`;
      p.innerHTML = '';
    } else {
      c.innerHTML='';
      pagedThreads.forEach(t=>{
        const postCount = t.postCounter || 0;
        const momentumEmoji = getMomentumEmoji(t);
        const imgHtml = t.previewImg ? `<img src="${t.previewImg}" class="thread-preview-img" alt="preview">` : '';
        const tagsHtml = (t.tags || []).map(tag => `<a href="#" class="tag" data-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</a>`).join('');
        
        const title = t.title || '';
        const titleContainsRedWord = redWords.some(word => title.toLowerCase().includes(word.toLowerCase()));
        const titleClass = titleContainsRedWord ? 'thread-link ng-word-red' : 'thread-link';
        
        let displayTitle = escapeHTML(title.replace(/#[\p{L}\p{N}_]+/ug, '').replace(/(\r\n|\n|\r)/gm, "").trim());
  
        const lockIcon = t.levelRestriction > 0 ? '🔒' : '';
  
        if (searchTerm && searchTerm.trim() !== '') {
          try {
            const regex = new RegExp(escapeHTML(searchTerm.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            displayTitle = displayTitle.replace(regex, `<span class="search-highlight">$&</span>`);
          } catch (e) { /* Invalid regex, do nothing */ }
        }
  
        const i=document.createElement('div');
        i.className='thread-item';
        i.innerHTML=`
          ${imgHtml}
          <div class="thread-info">
            <div class="thread-title-wrapper">
              <a class="${titleClass}" href="#thread-${t.id}">${lockIcon}${displayTitle}</a>
            </div>
            <div class="thread-tags">${tagsHtml}</div>
          </div>
          <div class="thread-meta-info">
            <div class="meta">${postCount}レス</div>
            <div class="meta">${momentumEmoji}</div>
          </div>`;
        c.appendChild(i);
      });
      document.querySelectorAll('.tag').forEach(tagEl => {
        tagEl.onclick = (e) => {
            e.preventDefault();
            const tag = e.target.dataset.tag;
            document.getElementById('searchInput').value = `#${tag}`;
            document.getElementById('searchBtn').click();
        };
      });
  
      p.innerHTML = `
        <div class="pagination-controls">
          <button id="prevPageBtn" class="btn small" ${currentPage === 1 ? 'disabled' : ''}>前へ</button>
          <span class="small-muted">${currentPage} / ${totalPages} ページ</span>
          <button id="nextPageBtn" class="btn small" ${currentPage === totalPages ? 'disabled' : ''}>次へ</button>
        </div>
      `;
      document.getElementById('prevPageBtn').onclick = () => { if(currentPage > 1) { currentPage--; window.performDisplay(); } };
      document.getElementById('nextPageBtn').onclick = () => { if(currentPage < totalPages) { currentPage++; window.performDisplay(); } };
    }
  }

  async function getOkachimachiWeather() {
    const url = `https://asia-northeast1-config-f5509.cloudfunctions.net/getWeather`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`天気情報の取得に失敗しました: ${response.statusText}`);
      }
      const data = await response.json();
      
      const weatherDescription = data.weather[0]?.description || '不明';
      const weatherIcon = ((icon) => {
        const map = {
          '01d': '☀️', '01n': '🌙', '02d': '🌤️', '02n': '☁️',
          '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
          '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌧️',
          '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️',
          '50d': '🌫️', '50n': '🌫️'
        };
        return map[icon] || '';
      })(data.weather[0]?.icon);
      
      const temp = data.main?.temp?.toFixed(1) || 'N/A';
      const humidity = data.main?.humidity || 'N/A';
      const windSpeed = data.wind?.speed?.toFixed(1) || 'N/A';

      const weatherText = `【現在の御徒町の天気情報】
天気: ${weatherDescription} ${weatherIcon}
気温: ${temp}℃
湿度: ${humidity}%
風速: ${windSpeed} m/s
--------------------
`;
      return weatherText;
    } catch (error) {
      console.error("天気情報の取得エラー:", error);
      return '【天気情報の取得に失敗しました】\n';
    }
  }

  function renderHome() {
    currentPage = 1; 
    document.getElementById('app').innerHTML = `<div class="card"><h2>新しいスレッドを作成</h2><input id="newTitle" type="text" placeholder="タイトル（#タグ でタグ付けできます）" style="margin-bottom:8px;"><input id="newName" type="text" placeholder="名前（任意）" value="${escapeHTML(getUser().name)}" style="margin-bottom:8px;"><textarea id="newText" placeholder="本文"></textarea><div class="controls" style="justify-content:flex-start; margin-top:8px; gap:8px;"><button id="createVoteBtn" class="btn small">アンケート作成</button><button id="createDrawBtn" class="btn small">🎨 お絵描き</button></div>
    <div style="margin-top:8px;"><label for="levelRestrictionSelect" class="small-muted">レベル制限:</label><select id="levelRestrictionSelect"><option value="0">無制限</option><option value="10">Lv.10以上</option><option value="30">Lv.30以上</option><option value="60">Lv.60以上</option><option value="250">Lv.250以上</option><option value="500">Lv.500以上</option><option value="1000">Lv.1000以上</option></select></div>
    <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;"><div id="newImageContainer"><input id="newImage" type="file" accept="image/*"></div><button class="btn" id="createThreadBtn">スレ作成</button></div></div><div class="card"><h2>スレッド一覧</h2><div class="search-box"><input type="text" id="searchInput" placeholder="タイトル検索 or #タグ名"><button id="searchBtn" class="btn small">検索</button><button id="clearSearchBtn" class="btn small">クリア</button><a href="#memories" class="btn small" style="margin-left:auto; text-decoration:none;">🏆 メモリーズ</a></div><div class="sort-box"><span class="small-muted">並び替え:</span><select id="sortSelect"><option value="newPost" selected>新着レス順</option><option value="newThread">スレ立て順</option><option value="manyRes">レス数順</option><option value="momentum">勢い順</option></select><label for="sortReverseCheckbox" class="small-muted" style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="sortReverseCheckbox">逆順</label></div><div id="threadListContainer"></div><div id="paginationContainer"></div></div>`;
    const threadListContainer = document.getElementById('threadListContainer');
    startLoadingAnimation(threadListContainer);
    const sortSelect = document.getElementById('sortSelect');
    const searchInput = document.getElementById('searchInput');
    const reverseCheckbox = document.getElementById('sortReverseCheckbox');
    
    window.performDisplay = () => {
        stopLoadingAnimation();
        const sortMode = sortSelect.value;
        const searchTerm = searchInput.value.trim();
        const isReversed = reverseCheckbox.checked;

        let sourceThreads;
        let filteredThreads;
        
        const activeThreads = allThreads.filter(t => !t.isArchived && !t.isHallOfFame);

        if (searchTerm.toLowerCase() === '#レベル上げ') {
            sourceThreads = allThreads;
            const tag = searchTerm.substring(1);
            filteredThreads = sourceThreads.filter(t => (t.tags || []).includes(tag));
            displayThreads(filteredThreads, sortMode, tag, isReversed, currentPage, null);

        } else if (searchTerm.startsWith('#')) {
            sourceThreads = activeThreads.filter(t => !(t.tags || []).includes('レベル上げ'));
            const tag = searchTerm.substring(1);
            filteredThreads = sourceThreads.filter(t => (t.tags || []).includes(tag));
            displayThreads(filteredThreads, sortMode, tag, isReversed, currentPage, null);

        } else {
            sourceThreads = activeThreads.filter(t => !(t.tags || []).includes('レベル上げ'));
            filteredThreads = searchTerm ? sourceThreads.filter(t => (t.title || '').toLowerCase().includes(searchTerm.toLowerCase())) : sourceThreads;
            displayThreads(filteredThreads, sortMode, null, isReversed, currentPage, searchTerm);
        }
    }

    sortSelect.onchange = () => { currentPage = 1; performDisplay(); };
    reverseCheckbox.onchange = performDisplay;
    document.getElementById('searchBtn').onclick = () => { currentPage = 1; performDisplay(); };
    document.getElementById('clearSearchBtn').onclick=()=>{ searchInput.value=''; currentPage = 1; performDisplay(); };
    searchInput.onkeydown=(e)=>{if(e.key==='Enter') { currentPage = 1; performDisplay(); }};
    
    document.getElementById('createThreadBtn').onclick=async()=>{
      const b=document.getElementById('createThreadBtn');
      try{
        const u=getUser();
        if (globalBanList[u.permanentId]) throw new Error('あなたはこの掲示板から追放されています。');
        const t = document.getElementById('newTitle').value.replace(/(\r\n|\n|\r)/gm, "").trim();
        const n = document.getElementById('newName').value.trim();
        
        let rawText = document.getElementById('newText').value;
        
        if (t.includes('御徒町')) {
            b.disabled = true;
            b.textContent = '天気情報取得中...';
            const weatherInfo = await getOkachimachiWeather();
            if (weatherInfo.startsWith('【天気情報の取得に失敗しました】')) {
                alert('天気情報の取得に失敗しました。少し時間をおいて再度お試しください。');
                throw new Error('天気情報取得失敗');
            }
            rawText = weatherInfo + rawText;
        }

        let postData = { text: rawText };
        postData = processSpecialCommands(postData, u);
        rawText = postData.text;

        const x = rawText.trim();
        const levelRestriction = parseInt(document.getElementById('levelRestrictionSelect').value, 10);
        
        const fileInput = document.getElementById('newImage');
        const f = fileInput ? fileInput.files[0] : null;

        const titleWithoutTags = t.replace(/#[\p{L}\p{N}_]+/ug,'').trim();
        if (!titleWithoutTags) throw new Error('タイトルを入力してください');
        
        const hasContent = x || f || drawingDataUrl || postData.effect;
        if (!hasContent) throw new Error('本文・画像・お絵描きのいずれかが必要です');
        
        if(drawingDataUrl && (drawingDataUrl.length * 0.75 > MAX_IMAGE_BYTES)) throw new Error(`お絵描き画像のサイズが大きすぎます。`);
        if(t.length>TITLE_LIMIT)throw new Error(`タイトルは${TITLE_LIMIT}文字以内にしてください。`);
        if(rawText.length>TEXT_LIMIT)throw new Error(`本文は${TEXT_LIMIT}文字以内にしてください。`);
        if((rawText.match(/\n/g) || []).length > MAX_NEWLINES) throw new Error(`改行は${MAX_NEWLINES}回までです。`);
        if(rawText.match(new RegExp(`\\n{${MAX_CONSECUTIVE_NEWLINES + 1},}`))) throw new Error(`連続した改行は${MAX_CONSECUTIVE_NEWLINES}回までです。`);
        if(n.length>NAME_LIMIT)throw new Error(`名前は${NAME_LIMIT}文字以内にしてください。`);
        if(containsNGWord(t)||containsNGWord(x)||containsNGWord(n))throw new Error('不適切な単語が含まれています。');
        
        b.disabled=true;b.textContent='作成中...';
        if(n&&n!==u.name){if(!setUserName(n))throw new Error(`名前は${NAME_LIMIT}文字以内にしてください。`);}
        
        const i = drawingDataUrl ? drawingDataUrl : (f ? await readFileAsDataURL(f) : null);
        
        let previewImg = null;
        if (i) {
            try {
                previewImg = await createThumbnail(i, 60, 60);
            } catch (thumbError) {
                console.error("サムネイルの作成に失敗:", thumbError);
                previewImg = null;
            }
        }

        const threadRef=db.ref('threads').push();
        const threadId = threadRef.key;
        const firstPostId = threadRef.key;
        const tags=t.match(/#[\p{L}\p{N}_]+/ug)?.map(tag=>tag.substring(1))||[];
        const now=Date.now();
        
        const firstPost = {id:firstPostId,author:u,text:x,img:i,createdAt:now};
        if(postData.effect) firstPost.effect = postData.effect;

        const newThreadData={id:threadId,title:t,createdAt:now,lastUpdatedAt:now,op:u,posts:{[firstPostId]:firstPost},postCounter:1,tags:tags};
        if (levelRestriction > 0) newThreadData.levelRestriction = levelRestriction;
        
        const threadMetadata = {id: threadId, title: t, createdAt: now, lastUpdatedAt: now, op: u, postCounter: 1, tags: tags, levelRestriction: levelRestriction, viewerCount: 0, previewImg, isArchived: false, isHallOfFame: false };
        const updates = {};
        updates['/threads/' + threadId] = newThreadData;
        updates['/threadMetadata/' + threadId] = threadMetadata;
        await db.ref().update(updates);
        
        let currentActivity = loadDailyActivity();
        const todayStr = getJstDateString();
        currentActivity.date === todayStr ? currentActivity.postCount++ : currentActivity = { date: todayStr, postCount: 1 };
        saveDailyActivity(currentActivity);
        
        localStorage.setItem(LAST_POST_TIME_KEY,now.toString());
        if(postData.effect) localStorage.setItem(EFFECT_COOLDOWN_KEY, now.toString());
        
        drawingDataUrl = null;
        location.hash='thread-'+threadId;
        renderApp();
      }catch(e){
        if (e.message !== '天気情報取得失敗') {
            alert('エラー: '+e.message);
        }
      } finally {
        if(b){b.disabled=false;b.textContent='スレ作成';}
      }
    };
    setupVoteModal('newText');
    setupDrawingModal('newImageContainer');
    const nextThreadDataJSON = localStorage.getItem(NEXT_THREAD_DATA_KEY);
    if (nextThreadDataJSON) {
        try {
            const nextThreadData = JSON.parse(nextThreadDataJSON);
            document.getElementById('newTitle').value = nextThreadData.title;
            document.getElementById('newText').value = nextThreadData.text;
            localStorage.removeItem(NEXT_THREAD_DATA_KEY);
        } catch(e) {
            localStorage.removeItem(NEXT_THREAD_DATA_KEY);
        }
    }
  }
  
  async function renderHistoryPage() {
    document.getElementById('app').innerHTML = `<div class="card"><h2>📜 閲覧履歴</h2><div id="historyListContainer"></div></div>`;
    const c = document.getElementById('historyListContainer');
    startLoadingAnimation(c, '履歴を読み込み中');
    
    const history = loadHistory();
    if (history.length === 0) {
        stopLoadingAnimation();
        c.innerHTML = '<div class="small-muted">まだ閲覧履歴がありません。</div>';
        return;
    }

    try {
        const metaSnapshot = await db.ref('threadMetadata').once('value');
        const allMeta = metaSnapshot.val() || {};
        let wasUpdated = false;

        const validHistory = history.filter(item => {
            const meta = allMeta[item.id];
            const isStillValid = meta && !meta.isArchived;
            if (!isStillValid) wasUpdated = true;
            return isStillValid;
        });

        if (wasUpdated) {
            saveHistory(validHistory);
        }

        stopLoadingAnimation();
        if (validHistory.length === 0) {
            c.innerHTML = '<div class="small-muted">まだ閲覧履歴がありません。</div>';
            return;
        }

        c.innerHTML = '';
        validHistory.forEach((item) => {
            const unreadCount = unreadStatus[item.id] || 0;
            const unreadHtml = `<div class="unread-notification" id="unread-container-${item.id}" ${unreadCount > 0 ? '' : 'style="display:none;"'}>
                                    <span class="badge-new" id="unread-badge-${item.id}">あなたへの新着レス: ${unreadCount}件</span>
                                </div>`;
            // ▼▼▼ BUG FIX: Correctly check for pending achievements ▼▼▼
            const hasPendingAchievement = Object.values(pendingAchievementsCache).includes(item.id);
            const achievementHtml = hasPendingAchievement ? `<div class="history-achievement-notify">🏆 新しい実績を解除しました！</div>` : '';
            const postCount = allMeta[item.id]?.postCounter || 0;

            const i = document.createElement('div');
            i.className = 'history-item';
            i.innerHTML = `
                <div class="thread-info">
                    <a class="thread-link" href="#thread-${item.id}">${escapeHTML(item.title)}</a>
                    ${unreadHtml}
                    ${achievementHtml}
                    <span class="history-item-res-count meta">(${postCount}レス)</span>
                </div>
                <div class="thread-meta-info">
                    <div class="small-muted">${formatTimestamp(item.visitedAt)}</div>
                </div>`;
            c.appendChild(i);
        });
    } catch (e) {
        console.error("履歴の読み込みまたはフィルタリングに失敗:", e);
        stopLoadingAnimation();
        c.innerHTML = '<div class="banned-note">履歴の読み込みに失敗しました。</div>';
    }
  }

  async function renderMemoriesPage() {
    document.getElementById('app').innerHTML = `<div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h2>殿堂入り👑スレ一覧</h2>
            <div>
                <a href="#" class="btn small">🏠 集会所に戻る</a>
                <button id="refreshMemoriesBtn" class="btn small">🔄 更新</button>
            </div>
        </div>
        <div id="memoriesListContainer"></div>
    </div>`;

    document.querySelector('a[href="#"]').onclick = (e) => { e.preventDefault(); goHome(); };
    document.getElementById('refreshMemoriesBtn').onclick = renderMemoriesPage;

    const container = document.getElementById('memoriesListContainer');
    startLoadingAnimation(container);

    try {
        const metaRef = db.ref('threadMetadata').orderByChild('isHallOfFame').equalTo(true);
        const snapshot = await metaRef.once('value');
        stopLoadingAnimation();

        if (!snapshot.exists()) {
            container.innerHTML = '<div class="small-muted">まだ殿堂入りしたスレッドはありません。</div>';
            return;
        }

        const hallOfFameThreads = Object.values(snapshot.val()).sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
        
        container.innerHTML = '';
        hallOfFameThreads.forEach(t => {
            const i=document.createElement('div');
            i.className='thread-item';
            i.innerHTML=`
              <div class="thread-info">
                <a class="thread-link" href="#thread-${t.id}">${escapeHTML(t.title)}</a>
              </div>
              <div class="thread-meta-info">
                <div class="meta">${t.postCounter}レス</div>
                <div class="meta small-muted">${formatTimestamp(t.lastUpdatedAt)}</div>
              </div>`;
            container.appendChild(i);
        });

    } catch (error) {
        stopLoadingAnimation();
        container.innerHTML = `<div class="banned-note">殿堂入りスレッドの読み込みに失敗しました: ${error.message}</div>`;
    }
  }

  async function renderSettingsPage() {
    cleanupListeners();
    const user = getUser();
    myTotalExp = (await db.ref(`userLevels/${user.permanentId}/exp`).once('value')).val() || 0;
    const userLevel = getLevel(myTotalExp);
    
    if (userLevel >= 1000) await unlockAchievement(user.permanentId, 'saikyo_ode');
    if (userLevel >= 60) await unlockAchievement(user.permanentId, 'yumechan');
    if (userLevel >= 30) await unlockAchievement(user.permanentId, 'teriri');
    if (userLevel >= 10) await unlockAchievement(user.permanentId, 'puyuyu');
    if (userLevel >= 5) await unlockAchievement(user.permanentId, 'mini_wai');
    
    const achievementsSnapshot = await db.ref(`userAchievements/${user.permanentId}`).once('value');
    const myAchievements = achievementsSnapshot.val() || { achievements: {}, equippedAchievement: null };
    const unlockedAchievements = myAchievements.achievements ? Object.keys(myAchievements.achievements) : [];
    const soundSettings = loadSoundSettings();
    document.getElementById('app').innerHTML = `
      <div class="card">
        <h2>プロフィール設定</h2>
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <input type="text" id="settingsNameInput" value="${escapeHTML(user.name)}" placeholder="新しい名前">
          <button id="settingsSaveNameBtn" class="btn small">変更</button>
        </div>
        <div style="margin-bottom:12px;">
          <label for="titleSelect" class="small-muted">称号設定:</label>
          <select id="titleSelect" style="width:100%;"></select>
        </div>
        <div style="font-size:13px; display:flex; flex-direction:column; gap:8px;">
          <div style="font-weight:bold;">あなたのレベル: Lv. ${userLevel}</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span>Permanent ID: ${user.permanentId}</span>
            <button class="btn small" data-copy-text="${user.permanentId}">コピー</button>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span>Daily ID: ${user.id}</span>
            <button class="btn small" data-copy-text="${user.id}">コピー</button>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>実績一覧</h2>
        <div id="achievementsListContainer"></div>
      </div>
      <div class="card">
        <h2>通知設定</h2>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="soundToggleCheckbox" ${soundSettings.enabled ? 'checked' : ''}>
            <span>自分宛てのレスがあった時に通知音を鳴らす</span>
        </label>
      </div>
      <div class="card">
        <h2>名前変更履歴</h2>
        <div id="nameHistoryContainer" style="font-size:13px;"></div>
      </div>
      <div class="card">
        <h2>自分の投稿を検索</h2>
        <div class="search-box">
          <input type="text" id="myPostSearchInput" placeholder="キーワード検索">
          <button id="myPostSearchBtn" class="btn small">検索</button>
        </div>
        <div id="myPostSearchResults"></div>
      </div>
      <div class="card">
        <h2>NGワード設定</h2>
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <input type="text" id="ngWordInput" placeholder="NGワード" style="flex-grow:1;">
          <select id="ngActionSelect">
            <option value="hide">投稿を非表示</option>
            <option value="red">単語を赤文字</option>
          </select>
          <button id="addNgWordBtn" class="btn small">追加</button>
        </div>
        <div id="ngWordsListContainer"></div>
      </div>
    `;

    const titleSelect = document.getElementById('titleSelect');
    const noTitleOption = document.createElement('option');
    noTitleOption.value = "none";
    noTitleOption.textContent = "称号なし";
    titleSelect.appendChild(noTitleOption);

    unlockedAchievements.forEach(achId => {
        if (ACHIEVEMENTS_MASTER[achId]) {
            const option = document.createElement('option');
            option.value = achId;
            option.textContent = ACHIEVEMENTS_MASTER[achId].title;
            titleSelect.appendChild(option);
        }
    });
    titleSelect.value = myAchievements.equippedAchievement || "none";

    titleSelect.onchange = async () => {
        const selectedTitleId = titleSelect.value;
        try {
            const valueToSet = selectedTitleId === "none" ? null : selectedTitleId;
            await db.ref(`userAchievements/${user.permanentId}/equippedAchievement`).set(valueToSet);
            showToast('称号を変更しました！');
        } catch (e) {
            alert('称号の変更に失敗しました。');
        }
    };
    
    const achievementsListContainer = document.getElementById('achievementsListContainer');
    Object.keys(ACHIEVEMENTS_MASTER).forEach(achId => {
        const achData = ACHIEVEMENTS_MASTER[achId];
        const isUnlocked = unlockedAchievements.includes(achId);
        const item = document.createElement('div');
        item.className = 'achievement-item';
        item.innerHTML = `
            <div class="achievement-info">
                <div class="achievement-title">${achData.title}</div>
                <div class="achievement-desc">${achData.description}</div>
            </div>
            <span class="achievement-status ${isUnlocked ? 'status-unlocked' : 'status-locked'}">${isUnlocked ? '獲得済み' : '未獲得'}</span>
        `;
        achievementsListContainer.appendChild(item);
    });

    document.getElementById('settingsSaveNameBtn').onclick = () => {
      const newName = document.getElementById('settingsNameInput').value.trim();
      if(newName && !containsNGWord(newName)) {
        if(setUserName(newName)) {
          alert('名前を変更しました。');
          renderSettingsPage();
        }
      } else {
        alert('名前が空か、不適切な単語が含まれています。');
      }
    };
    document.querySelectorAll('[data-copy-text]').forEach(btn => {
      btn.onclick = (e) => {
        navigator.clipboard.writeText(e.target.dataset.copyText).then(() => {
          const originalText = e.target.textContent;
          e.target.textContent = 'OK!';
          setTimeout(() => { e.target.textContent = originalText; }, 1000);
        });
      };
    });
    document.getElementById('soundToggleCheckbox').onchange = (e) => {
        saveSoundSettings({ enabled: e.target.checked });
    };
    const nameHistoryContainer = document.getElementById('nameHistoryContainer');
    const nameHistory = loadNameHistory();
    nameHistoryContainer.innerHTML = nameHistory.length > 0
      ? nameHistory.map(h => `<div><span class="small-muted">${formatTimestamp(h.changedAt)}</span> → <b>${escapeHTML(h.name)}</b></div>`).join('')
      : '<div class="small-muted">変更履歴はありません。</div>';
    
    document.getElementById('myPostSearchBtn').onclick = () => {
        const keyword = document.getElementById('myPostSearchInput').value.trim();
        const resultsContainer = document.getElementById('myPostSearchResults');
        if (!keyword) {
            resultsContainer.innerHTML = '<div class="small-muted">キーワードを入力してください。</div>';
            return;
        }
        if (searchWorker) {
            searchWorker.terminate();
        }
        startLoadingAnimation(resultsContainer, 'あなたの投稿を検索中');
        const workerScript = `
            let db;
            self.onmessage = async (e) => {
                const { command, firebaseConfig, history, userId, keyword } = e.data;
                if (command === 'initialize') {
                    importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
                    importScripts("https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js");
                    try {
                        if (!firebase.apps.length) {
                           firebase.initializeApp(firebaseConfig);
                        }
                        db = firebase.database();
                        self.postMessage({ status: 'initialized' });
                    } catch (err) {
                        self.postMessage({ status: 'error', message: err.message });
                    }
                } else if (command === 'search') {
                    try {
                        const results = [];
                        const totalThreads = history.length;
                        for (let i = 0; i < totalThreads; i++) {
                            const threadInfo = history[i];
                            const postsSnapshot = await db.ref('threads/' + threadInfo.id + '/posts').once('value');
                            if (postsSnapshot.exists()) {
                                const posts = postsSnapshot.val();
                                for (const postId in posts) {
                                    const post = posts[postId];
                                    if (post.author && post.author.permanentId === userId && post.text && post.text.toLowerCase().includes(keyword.toLowerCase())) {
                                        results.push({ thread: threadInfo, post });
                                    }
                                }
                            }
                            self.postMessage({ status: 'progress', progress: Math.round(((i + 1) / totalThreads) * 100) });
                        }
                        self.postMessage({ status: 'complete', results });
                    } catch (err) {
                        self.postMessage({ status: 'error', message: err.message });
                    }
                }
            };
        `;
        searchWorker = new Worker(URL.createObjectURL(new Blob([workerScript])));
        
        searchWorker.onmessage = (e) => {
            const { status, message, progress, results } = e.data;
            if (status === 'initialized') {
                searchWorker.postMessage({ command: 'search', history: loadHistory(), userId: getUser().permanentId, keyword });
            } else if (status === 'progress') {
                const textSpan = resultsContainer.querySelector('span');
                if(textSpan) textSpan.textContent = `あなたの投稿を検索中… ${progress}%`;
            } else if (status === 'complete') {
                stopLoadingAnimation();
                resultsContainer.innerHTML = results.length > 0
                  ? results.sort((a,b) => b.post.createdAt - a.post.createdAt).map(item => `
                    <div style="border-top:1px solid var(--border-color); padding: 8px 0;">
                      <div class="small-muted">スレ: <a href="#thread-${item.thread.id}">${escapeHTML(item.thread.title)}</a> (${formatTimestamp(item.post.createdAt)})</div>
                      <div class="body">${renderContent(item.post.text)}</div>
                    </div>`).join('')
                  : `<div class="small-muted">「${escapeHTML(keyword)}」に一致する投稿は見つかりませんでした。</div>`;
                
                searchWorker.terminate();
                searchWorker = null;
            } else if (status === 'error') {
                stopLoadingAnimation();
                resultsContainer.innerHTML = `<div class="banned-note">検索に失敗しました: ${message}</div>`;
                searchWorker.terminate();
                searchWorker = null;
            }
        };
        searchWorker.postMessage({ command: 'initialize', firebaseConfig });
    };

    const ngWordInput = document.getElementById('ngWordInput');
    const ngActionSelect = document.getElementById('ngActionSelect');
    const addNgWordBtn = document.getElementById('addNgWordBtn');
    const ngWordsListContainer = document.getElementById('ngWordsListContainer');
    function renderNgList() {
      const settings = loadNgSettings();
      const words = Object.keys(settings);
      ngWordsListContainer.innerHTML = words.length > 0
        ? words.map(word => `
          <div style="display:flex; align-items:center; gap:8px; font-size:13px; padding: 4px 0;">
            <span style="flex-grow:1;"><b>${escapeHTML(word)}</b> → <span class="small-muted">${settings[word] === 'hide' ? '非表示' : '赤文字'}</span></span>
            <button class="btn small warn" data-ng-word="${escapeHTML(word)}">削除</button>
          </div>`).join('')
        : '<div class="small-muted">NGワードは設定されていません。</div>';
      ngWordsListContainer.querySelectorAll('[data-ng-word]').forEach(btn => {
        btn.onclick = (e) => {
          const wordToDelete = e.target.dataset.ngWord;
          const currentSettings = loadNgSettings();
          delete currentSettings[wordToDelete];
          saveNgSettings(currentSettings);
          renderNgList();
        };
      });
    }
    addNgWordBtn.onclick = () => {
      const word = ngWordInput.value.trim();
      if (word) {
        const settings = loadNgSettings();
        settings[word] = ngActionSelect.value;
        saveNgSettings(settings);
        ngWordInput.value = '';
        renderNgList();
      }
    };
    renderNgList();
  }
  
  function generatePostHtml(post, idx, t, anchorCounts) {
    const u = getUser(), o = t.op && t.op.permanentId === u.permanentId, isAdm = ADMIN_IDS.includes(u.permanentId);
    
    const authorId = post.author.permanentId;
    const exp = (userLevelsCache[authorId] && userLevelsCache[authorId].exp) || 0;
    const l = getLevel(exp);
    
    const authorAchievements = userAchievementsCache[authorId];
    let titleText;
    const equipped = authorAchievements ? authorAchievements.equippedAchievement : null;
    if (equipped && ACHIEVEMENTS_MASTER[equipped]) {
        titleText = ACHIEVEMENTS_MASTER[equipped].title;
    } else {
        titleText = `Lv. ${l}`;
    }

    const b=t.banned&&t.banned[authorId],gb=globalBanList[authorId];
    const reacs=post.reactions||{};
    const mR=reacs[u.permanentId];
    
    let aH=`<b class="post-author" data-action="show-profile" data-name="${escapeHTML(post.author.name)}" data-id="${authorId}" data-isopadm="${o||isAdm}" data-daily-id="${post.author.id}" data-post-timestamp="${post.createdAt}" data-thread-id="${t.id}">${escapeHTML(post.author.name)}</b> <span class="badge-level" title="Lv.${l}">${titleText}</span>`;
    if(authorId===t.op.permanentId) aH+=` <span class="badge-op">主</span>`;
    if(anchorCounts[post.id]) { aH += ` <span class="badge-anchor" data-action="show-anchors" data-thread-id="${t.id}" data-post-id="${post.id}">${anchorCounts[post.id]}</span>`; }
    
    const rC={}; BASE_REACTIONS.forEach(r=>rC[r]=0);
    Object.values(reacs).forEach(reac=>{if(rC[reac]!==undefined)rC[reac]++;});
    
    let ctlH=BASE_REACTIONS.map(bR=>{
      const count=rC[bR];
      const iMR=mR===bR;
      const dR=iMR?REACTION_PAIRS[bR]:bR;
      return`<button class="btn small ${iMR?'liked':''}" data-action="react" data-thread-id="${t.id}" data-post-id="${post.id}" data-reac="${bR}">${dR} ${count}</button>`;
    }).join(' ');

    if(u.permanentId===authorId||o||isAdm) ctlH+=` <button class="btn small warn" data-action="delete-post" data-thread-id="${t.id}" data-post-id="${post.id}">削除</button>`;
    if(u.permanentId===authorId) ctlH+=` <button class="btn small" data-action="edit-post" data-thread-id="${t.id}" data-post-id="${post.id}">編集</button>`;
    
    const ngSettings = loadNgSettings();
    const ngWords = Object.keys(ngSettings);
    let pB=post.deleted?`<div class="deleted-note">[削除されました]</div>`:`<div class="body">${renderContent(post.text,post)}</div>${post.img?`<img src="${post.img}" class="post-image" data-action="open-lightbox">`:''}`;
    if (!post.deleted) {
      let isHidden = false;
      let processedText = renderContent(post.text, post);
      for (const word of ngWords) {
        if (post.text.toLowerCase().includes(word.toLowerCase())) {
          if (ngSettings[word] === 'hide') {
            pB = `<div class="ng-hidden-post">[NGワードに一致したため非表示]</div>`; isHidden = true; break; 
          } else if (ngSettings[word] === 'red') {
            const regex = new RegExp(escapeHTML(word), 'gi');
            processedText = processedText.replace(regex, `<span class="ng-word-red">${escapeHTML(word)}</span>`);
          }
        }
      }
      if (!isHidden) { pB = `<div class="body">${processedText}</div>${post.img?`<img src="${post.img}" class="post-image" data-action="open-lightbox">`:''}`; }
    }
    const mainContent = b||gb ? `<div class="banned-note">${gb?'[このユーザーはBANされています]':'[このユーザーはこのスレでアク禁されています]'}</div>` : `${pB}<div class="controls">${ctlH}<span class="timestamp small-muted">${formatTimestamp(post.createdAt)}</span></div>`;
    
    const effectAttr = post.effect ? `data-effect="${post.effect}"` : '';
    return `<div class="post" data-post-id="${post.id}" ${effectAttr}><div class="meta"><span class="no" data-action="insert-quote-number" data-num="${idx}">No.${idx}</span>${aH}</div>${mainContent}</div>`;
  }

  function fullRenderThreadView(id, t) {
    const u = getUser(), o = t.op && t.op.permanentId === u.permanentId, isAdm = ADMIN_IDS.includes(u.permanentId);
    let deleteBtnHtml = (o || isAdm) ? `<button class="btn small warn" data-action="delete-thread" data-thread-id="${id}" style="margin-left:auto;">スレッド削除</button>` : '';
    const posts = Object.values(t.posts || {}).sort((a, b) => a.createdAt - b.createdAt);
    const pC = posts.length;
    let rF = '';
    if (pC >= POST_LIMIT) {
        rF = (o) ? `<div style="text-align:center; padding:10px;"><button class="btn" onclick="window.prepareNextThread('${id}')">次スレを作成</button></div>` : `<div class="banned-note" style="text-align:center;padding:10px;">このスレッドは${POST_LIMIT}レスに達しました。</div>`;
    } else {
        rF = `<h4>レス投稿</h4><input id="replyName" type="text" placeholder="名前" value="${escapeHTML(u.name)}" style="margin-bottom:8px;"><small class="small-muted" style="display:block;margin-top:-6px;margin-bottom:8px;">名前欄に sage と入力するとスレッドがトップに上がらなくなります。</small><textarea id="replyText" placeholder="本文"></textarea><div class="controls" style="justify-content:flex-start; margin-top:8px; gap:8px;"><button id="createVoteBtn" class="btn small">アンケート作成</button><button id="createDrawBtn" class="btn small">🎨 お絵描き</button></div><div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;"><div id="replyImageContainer"><input id="replyImage" type="file" accept="image/*"></div><button class="btn" id="replyBtn">投稿</button></div>`;
    }
    const anchorCounts = {};
    posts.forEach((p, postIndex) => {
        if (p.text) {
            const anchors = p.text.match(/>>(\d+)/g) || [];
            anchors.forEach(anchor => {
                const postNum = parseInt(anchor.replace('>>', ''), 10);
                if(postNum > 0 && postNum <= posts.length){
                    const targetPostId = posts[postNum - 1].id;
                    anchorCounts[targetPostId] = (anchorCounts[targetPostId] || 0) + 1;
                }
            });
        }
    });
    const postsHtml = posts.map((post, idx) => generatePostHtml(post, idx + 1, t, anchorCounts)).join('');
    document.getElementById('app').innerHTML = `<div class="card"><div class="thread-header"><div class="thread-header-main"><h2>${escapeHTML(t.title)}</h2></div><div class="thread-header-meta"><div class="small-muted">作成: ${formatTimestamp(t.createdAt)}</div><div class="small-muted" style="margin-top:4px;">閲覧中: <span id="viewer-count">${currentViewers}</span>人</div></div></div><div style="display:flex; justify-content:flex-end; margin-bottom:8px;">${deleteBtnHtml}</div><div class="search-box" style="padding: 12px; background: var(--bg); border-radius: 8px; margin-bottom: 12px;"><input type="text" id="threadSearchInput" placeholder="このスレ内を検索"><button id="threadSearchBtn" class="btn small">検索</button><button id="threadSearchClearBtn" class="btn small">クリア</button></div></div><div class="card" id="postsContainer">${postsHtml}</div><div class="card">${rF}</div>`;
    
    if(window.twttr && twttr.widgets) twttr.widgets.load(document.getElementById('postsContainer'));
    
    if (pC < POST_LIMIT) {
        document.getElementById('replyBtn').onclick = () => postReply(id);
        setupVoteModal('replyText');
        setupDrawingModal('replyImageContainer');
    }
    const searchInput = document.getElementById('threadSearchInput');
    const searchBtn = document.getElementById('threadSearchBtn');
    const clearBtn = document.getElementById('threadSearchClearBtn');
    const updateHighlighting = (keyword) => {
        document.querySelectorAll('#postsContainer .post .body').forEach(body => {
            body.querySelectorAll('span.search-highlight').forEach(span => span.replaceWith(...span.childNodes));
            body.normalize(); 
            if (keyword && keyword.trim() !== '') {
                try {
                  const regex = new RegExp(escapeHTML(keyword.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                  body.innerHTML = body.innerHTML.replace(regex, `<span class="search-highlight">$&</span>`);
                } catch(e) { /* Invalid regex */ }
            }
        });
    };
    const performSearch = () => {
        const keyword = searchInput.value.trim();
        updateHighlighting(keyword);
        document.querySelectorAll('#postsContainer .post').forEach(post => {
            const body = post.querySelector('.body');
            post.style.display = (!body || keyword === '' || body.textContent.toLowerCase().includes(keyword.toLowerCase())) ? 'block' : 'none';
        });
    };
    searchBtn.onclick = performSearch;
    searchInput.onkeydown = (e) => { if (e.key === 'Enter') performSearch(); };
    clearBtn.onclick = () => { searchInput.value = ''; performSearch(); };
  }

  function updateThreadViewSmart(id, t) {
    if (!t) { removeFromHistory(id); goHome(); return; }
    const postsContainer = document.getElementById('postsContainer');
    if (!postsContainer) return;
    const u = getUser();
    const newPosts = Object.values(t.posts || {}).sort((a, b) => a.createdAt - b.createdAt);
    const anchorCounts = {};
    newPosts.forEach((p, postIndex) => {
        if (p.text) {
            (p.text.match(/>>(\d+)/g) || []).forEach(anchor => {
                const postNum = parseInt(anchor.replace('>>', ''), 10);
                if(postNum > 0 && postNum <= newPosts.length){
                    const targetPostId = newPosts[postNum - 1].id;
                    anchorCounts[targetPostId] = (anchorCounts[targetPostId] || 0) + 1;
                }
            });
        }
    });
    const existingPostElements = postsContainer.querySelectorAll('.post');
    if (newPosts.length > existingPostElements.length) {
      for (let i = existingPostElements.length; i < newPosts.length; i++) {
        const postHtml = generatePostHtml(newPosts[i], i + 1, t, anchorCounts);
        postsContainer.insertAdjacentHTML('beforeend', postHtml);
        if (window.twttr && twttr.widgets) twttr.widgets.load(postsContainer.lastElementChild);
      }
    }
    newPosts.forEach((post, idx) => {
        const postElement = postsContainer.querySelector(`[data-post-id="${post.id}"]`);
        if (!postElement) return;
        if (currentEditState && post.id === currentEditState.postId) {
            const reacs = post.reactions || {};
            postElement.querySelectorAll('[data-action="react"]').forEach(btn => {
                const reacType = btn.dataset.reac;
                let count = Object.values(reacs).filter(r => r === reacType).length;
                const isMyReaction = reacs[u.permanentId] === reacType;
                btn.textContent = `${isMyReaction ? REACTION_PAIRS[reacType] : reacType} ${count}`;
                btn.classList.toggle('liked', isMyReaction);
            });
            return; 
        }
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = generatePostHtml(post, idx + 1, t, anchorCounts);
        if (tempDiv.firstChild && postElement.innerHTML !== tempDiv.firstChild.innerHTML) {
          postElement.replaceWith(tempDiv.firstChild);
        }
    });
    if(effectObserver) {
        document.querySelectorAll('[data-effect]:not(.observed)').forEach(el => {
            effectObserver.observe(el);
            el.classList.add('observed');
        });
    }
  }

  function setupEffectObserver() {
    if (effectObserver) {
        effectObserver.disconnect();
    }
    effectObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const postElement = entry.target;
                const effect = postElement.dataset.effect;
                const activeClass = `effect-${effect}-active`;
                
                postElement.classList.add(activeClass);

                setTimeout(() => {
                    postElement.classList.remove(activeClass);
                }, 3000);
                
                effectObserver.unobserve(postElement);
            }
        });
    });

    document.querySelectorAll('[data-effect]').forEach(el => {
        effectObserver.observe(el);
        el.classList.add('observed');
    });
  }

  async function renderThread(id) {
    document.getElementById('app').innerHTML=`<div class="card" id="loading-container"></div>`;
    startLoadingAnimation(document.getElementById('loading-container'));
    
    try {
      const [threadSnapshot, userLevelsSnapshot, achievementsSnapshot, pendingAchievementsSnapshot] = await Promise.all([
          db.ref('threads/'+id).once('value'),
          db.ref('userLevels').once('value'),
          db.ref('userAchievements').once('value'),
          db.ref(`pendingAchievements/${getUser().permanentId}`).once('value')
      ]);

      const threadData = threadSnapshot.val();
      userLevelsCache = userLevelsSnapshot.val() || {};
      userAchievementsCache = achievementsSnapshot.val() || {};
      const pending = pendingAchievementsSnapshot.val();

      if (pending) {
          const updates = {};
          for (const achId in pending) {
              if (pending[achId] === id) {
                  unlockAchievement(getUser().permanentId, achId);
                  updates[achId] = null;
              }
          }
          if (Object.keys(updates).length > 0) {
              db.ref(`pendingAchievements/${getUser().permanentId}`).update(updates);
          }
      }

      if (!threadData) {
          stopLoadingAnimation();
          document.getElementById('app').innerHTML = `<div class="card"><div class="banned-note">スレッドが見つからないか、削除されました。</div></div>`;
          removeFromHistory(id);
          return;
      }
      
      myTotalExp = (userLevelsCache[getUser().permanentId] && userLevelsCache[getUser().permanentId].exp) || 0;
      
      if(threadData.levelRestriction > 0 && getLevel(myTotalExp) < threadData.levelRestriction) {
          stopLoadingAnimation();
          document.getElementById('app').innerHTML = `<div class="card"><div class="banned-note">このスレッドを閲覧・投稿するには Lv.${threadData.levelRestriction} 以上が必要です。</div></div>`;
          return;
      }
      if (unreadStatus[id]) {
          unreadStatus[id] = 0;
          updateTotalUnreadBadge();
      }
      addToHistory(id, threadData.title, threadData.lastUpdatedAt);
      stopLoadingAnimation();
      fullRenderThreadView(id, threadData);
      
      setupEffectObserver();
      
      const vRef = db.ref('viewers/' + id);
      myConnectionRef = vRef.child(getUser().permanentId);

      const startHeartbeat = () => {
          myConnectionRef.set(firebase.database.ServerValue.TIMESTAMP);
          myConnectionRef.onDisconnect().remove();
          heartbeatInterval = setInterval(() => {
              if (myConnectionRef) myConnectionRef.set(firebase.database.ServerValue.TIMESTAMP);
          }, 30000);
      };

      const startJanitor = () => {
          janitorInterval = setInterval(() => {
              const now = Date.now();
              vRef.once('value', snapshot => {
                  const updates = {};
                  let hasUpdate = false;
                  snapshot.forEach(child => {
                      if (now - child.val() > 60000) {
                          updates[child.key] = null;
                          hasUpdate = true;
                      }
                  });
                  if (hasUpdate) vRef.update(updates);
              });
          }, 60000);
      };

      startHeartbeat();
      startJanitor();

      const vCb = vRef.on('value', s => {
          currentViewers = s.numChildren();
          if(location.hash === '#thread-' + id) {
              db.ref('threadMetadata/' + id + '/viewerCount').set(currentViewers);
              const e = document.getElementById('viewer-count');
              if(e) e.textContent = currentViewers;
          }
      });
      activeViewersListener={ref:vRef,callback:vCb};

      const cb = db.ref('threads/'+id).on('value', s => {
          const currentData = s.val();
          if (currentData) {
              updateThreadViewSmart(id, currentData);
          } else {
               updateThreadViewSmart(id, null);
          }
      }, e => { console.error(e); document.getElementById('app').innerHTML = `<div class="card"><div class="banned-note">スレッドの読み込みに失敗しました。</div></div>`;});
      activeDataListener={ref:db.ref('threads/'+id),callback:cb};
    } catch (e) {
        console.error("スレッドの読み込み中にエラーが発生しました:", e);
        stopLoadingAnimation();
        document.getElementById('app').innerHTML = `<div class="card"><div class="banned-note">スレッドの読み込みに失敗しました。ページを再読み込みしてください。</div></div>`;
    }
  }

  function processSpecialCommands(postData, user) {
      const effectRegex = /!(shake|rainbow)/i;
      const effectMatch = postData.text.match(effectRegex);
      if (effectMatch) {
          const lastUsed = parseInt(localStorage.getItem(EFFECT_COOLDOWN_KEY), 10) || 0;
          if (Date.now() - lastUsed < EFFECT_COOLDOWN_SECONDS * 1000) {
              throw new Error(`隠しコマンドは${EFFECT_COOLDOWN_SECONDS}秒に1回までです。`);
          }
          postData.effect = effectMatch[1].toLowerCase();
          postData.text = postData.text.replace(effectRegex, '').trim();
          unlockAchievement(user.permanentId, 'eye_puyuyu');
      }

      const omikujiRegex = /!omikuji/i;
      if (postData.text.match(omikujiRegex)) {
          const results = [
              { name: '🥺大吉👑', text: 'いいことがありそうだ✋🥺何をやってもうまくいくでしょう✋😁', effect: 'rainbow' },
              { name: '🤥中吉😳', text: '家の前におかちが落ちてるでしょう✋🥺よかったね✋🥺', effect: null },
              { name: '🥺吉🥺', text: '普通の1日になりそう✋🥺', effect: null },
              { name: '😠凶🤓', text: '電通案件だぞ😠', effect: null },
              { name: '😡大凶😡', text: '離婚確定、2人の子供の親権も取られるだろう✋😡🤚', effect: 'shake' }
          ];
          const items = ['ちっちゃい電気💡', 'じょうち🧑‍💼', 'ガンプラ', 'うんち💩', 'ミニワイ🥹'];
          
          const seed = user.id + getJstDateString();
          let hash = 0;
          for (let i = 0; i < seed.length; i++) {
              const char = seed.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash;
          }
          const randomValue = Math.abs(hash);
          
          const resultIndex = randomValue % results.length;
          const itemIndex = randomValue % items.length;
          
          const result = results[resultIndex];
          const item = items[itemIndex];
          
          const omikujiText = `${result.name}\n${result.text}\nラッキーアイテム: ${item}`;
          postData.text = postData.text.replace(omikujiRegex, omikujiText);
          
          if (result.effect) {
              postData.effect = result.effect;
          }
      }

      postData.text = processDiceCommands(postData.text, user);

      return postData;
  }

  function processDiceCommands(text, user) {
    const diceRegex = /!dice(\s+(\d+)d(\d+))?/gi;
    return text.replace(diceRegex, (match, details, countStr, facesStr) => {
        let count = details ? parseInt(countStr, 10) || 1 : 1;
        let faces = details ? parseInt(facesStr, 10) || 100 : 100;
        count = Math.max(1, Math.min(count, 20)); 
        faces = Math.max(1, Math.min(faces, 10000));
        const rolls = Array.from({length: count}, () => Math.floor(Math.random() * faces) + 1);
        const sum = rolls.reduce((a, b) => a + b, 0);
        if (count === 3 && faces === 6) {
            const sortedRolls = [...rolls].sort((a, b) => a - b);
            if (sortedRolls.join(',') === '4,5,6') {
                unlockAchievement(user.permanentId, 'hanchou');
            }
        }
        return `[${count}D${faces}=${sum} (${rolls.join(', ')})]`;
    });
  }

  async function postReply(id) {
    const b=document.getElementById('replyBtn');b.disabled=true;
    try {
        const threadSnapshot = await db.ref(`threads/${id}`).once('value');
        const threadData = threadSnapshot.val();
        if (!threadData) throw new Error('スレッドが見つかりません。');
        const isLevelUpThread = threadData.tags && threadData.tags.includes('レベル上げ');
        if (!isLevelUpThread) {
            const lastPostTime=localStorage.getItem(LAST_POST_TIME_KEY);
            if(lastPostTime&&Date.now()-parseInt(lastPostTime)<POST_INTERVAL_SECONDS*1000) throw new Error(`投稿は${POST_INTERVAL_SECONDS}秒に1回までです。`);
        }
        const u=getUser();
        if((await db.ref(`globalBan/${u.permanentId}`).once('value')).val()) throw new Error('あなたはこの掲示板から追放されています。');
        if(threadData.postCounter >= POST_LIMIT) throw new Error(`このスレッドは${POST_LIMIT}レスの上限に達しました。`);
        
        const cU=getUser();const nN=document.getElementById('replyName').value.trim();const iS=nN.toLowerCase()==='sage';const fN=iS?cU.name:(nN||cU.name);
        
        let rawText = document.getElementById('replyText').value;
        let postData = { text: rawText };
        postData = processSpecialCommands(postData, u);
        rawText = postData.text;

        const t = rawText.trim();
        
        const fileInput = document.getElementById('replyImage');
        const f = fileInput ? fileInput.files[0] : null;

        const hasContent = t || f || drawingDataUrl || postData.effect;
        if (!hasContent) throw new Error('本文・画像・お絵描きのいずれかが必要です');

        if(drawingDataUrl && (drawingDataUrl.length * 0.75 > MAX_IMAGE_BYTES)) throw new Error(`お絵描き画像のサイズが大きすぎます。`);
        if(t.length > TEXT_LIMIT) throw new Error(`本文は${TEXT_LIMIT}文字以内にしてください。`);
        if((rawText.match(/\n/g) || []).length > MAX_NEWLINES) throw new Error(`改行は${MAX_NEWLINES}回までです。`);
        if(rawText.match(new RegExp(`\\n{${MAX_CONSECUTIVE_NEWLINES + 1},}`))) throw new Error(`連続した改行は${MAX_CONSECUTIVE_NEWLINES}回までです。`);
        if(fN.length>NAME_LIMIT)throw new Error(`名前は${NAME_LIMIT}文字以内にしてください。`);
        if(fN&&fN!==cU.name){if(!setUserName(fN))throw new Error(`名前は${NAME_LIMIT}文字以内にしてください。`);}
        if(containsNGWord(t)||containsNGWord(fN))throw new Error('不適切な単語が含まれています。');
        if(threadData.banned && threadData.banned[cU.permanentId]) throw new Error('あなたはこのスレッドでアク禁されています。');
        
        const i = drawingDataUrl ? drawingDataUrl : (f ? await readFileAsDataURL(f) : null);
        const nPR=db.ref(`threads/${id}/posts`).push();
        const nPK=nPR.key;
        const pD={id:nPK,author:cU,text:t,img:i,createdAt:Date.now()};
        if (postData.effect) pD.effect = postData.effect;

        const newPostCount = (threadData.postCounter || 0) + 1;
        const threadUpdates = {};
        threadUpdates['/posts/' + nPK] = pD;
        threadUpdates['/postCounter'] = newPostCount;

        if(!iS && !isLevelUpThread){
            threadUpdates['/lastUpdatedAt'] = firebase.database.ServerValue.TIMESTAMP;
        }
        await db.ref('threads/' + id).update(threadUpdates);

        const metaUpdates = {};
        metaUpdates['/postCounter'] = newPostCount;
        if(!iS && !isLevelUpThread){
            metaUpdates['/lastUpdatedAt'] = firebase.database.ServerValue.TIMESTAMP;
        }
        if (newPostCount >= POST_LIMIT) {
            metaUpdates['/isHallOfFame'] = true;
        }
        await db.ref('threadMetadata/' + id).update(metaUpdates);
        
        let currentActivity = loadDailyActivity();
        const todayStr = getJstDateString();
        currentActivity.date === todayStr ? currentActivity.postCount++ : currentActivity = { date: todayStr, postCount: 1 };
        saveDailyActivity(currentActivity);
        
        if (newPostCount >= POST_LIMIT && threadData.op.permanentId) {
            const opId = threadData.op.permanentId;
            const userAchievements = (await db.ref(`userAchievements/${opId}/achievements`).once('value')).val() || {};
            if (!userAchievements.king_puyuyu) {
                const viewers = (await db.ref(`viewers/${id}`).once('value')).val() || {};
                if (viewers[opId]) {
                    unlockAchievement(opId, 'king_puyuyu');
                } else {
                    db.ref(`pendingAchievements/${opId}/king_puyuyu`).set(id);
                }
            }
        }
        
        localStorage.setItem(LAST_POST_TIME_KEY,Date.now().toString());
        if(postData.effect) localStorage.setItem(EFFECT_COOLDOWN_KEY, Date.now().toString());

        document.getElementById('replyText').value='';
        drawingDataUrl = null;
        const imgContainer = document.getElementById('replyImageContainer');
        imgContainer.innerHTML = '<input id="replyImage" type="file" accept="image/*">';
    }catch(e){
        alert('投稿エラー: '+e.message);
    }finally{
        if(b) b.disabled=false;
    }
  }
  
  function containsNGWord(t){const l=t.toLowerCase();return NG_WORDS.some(w=>l.includes(w.toLowerCase()));}
  function readFileAsDataURL(f){if(!f.type.startsWith('image/'))throw new Error('画像ファイルを選択してください');if(f.size>MAX_IMAGE_BYTES)throw new Error(`画像サイズは${MAX_IMAGE_BYTES/1024/1024}MB以下にしてください`);return new Promise((s,j)=>{const r=new FileReader();r.onload=()=>s(r.result);r.onerror=j;r.readAsDataURL(f);});}

  function createThumbnail(dataUrl, maxWidth, maxHeight) {
      return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              let width = img.width;
              let height = img.height;

              if (width > height) {
                  if (width > maxWidth) {
                      height *= maxWidth / width;
                      width = maxWidth;
                  }
              } else {
                  if (height > maxHeight) {
                      width *= maxHeight / height;
                      height = maxHeight;
                  }
              }
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = (err) => reject(err);
          img.src = dataUrl;
      });
  }

  function setupVoteModal(textareaId){
    const oB=document.getElementById('createVoteBtn');if(!oB)return;
    const m=document.getElementById('voteModal'),cM=document.getElementById('closeVoteModalBtn'),aO=document.getElementById('addVoteOptionBtn'),iB=document.getElementById('insertVoteBtn'),con=document.getElementById('voteOptionsContainer'),dS=document.getElementById('voteDeadlineSelect');
    
    const handler = () => { m.style.display = 'flex'; };
    oB.addEventListener('click', handler);
    drawingEventListeners.push({ element: oB, type: 'click', handler });

    cM.onclick=()=>{m.style.display='none';};
    m.onclick=(e)=>{if(e.target===e.currentTarget)m.style.display='none';};
    aO.onclick=()=>{if(con.children.length<10){const i=document.createElement('input');i.type='text';i.className='vote-option-input';i.placeholder=`選択肢${con.children.length+1}`;i.style.marginBottom='8px';con.appendChild(i);}};
    iB.onclick=()=>{const opts=Array.from(con.getElementsByClassName('vote-option-input')).map(i=>i.value.trim()).filter(v=>v!=='');if(opts.length<2){alert('有効な選択肢を2つ以上入力してください。');return;}if(new Set(opts).size!==opts.length){alert('選択肢が重複しています。');return;}if(opts.some(o=>o.length>VOTE_OPTION_LIMIT)){alert(`選択肢は${VOTE_OPTION_LIMIT}文字以内にしてください。`);return;}const deadline=parseInt(dS.value,10)>0?Date.now()+parseInt(dS.value,10):0;const tag=`[vote(${deadline}):${opts.join(',')}]`;document.getElementById(textareaId).value+=`\n${tag}\n`;m.style.display='none';};
  }
  
  function setupDrawingModal(imageContainerId) {
    const drawBtn = document.getElementById('createDrawBtn');
    if (!drawBtn) return;
    const modal = document.getElementById('drawingModal'),
          closeBtn = document.getElementById('closeDrawingModalBtn'),
          canvas = document.getElementById('drawingCanvas'),
          ctx = canvas.getContext('2d', { willReadFrequently: true }),
          bgColorPicker = document.getElementById('bgColorPicker'),
          colorPicker = document.getElementById('colorPicker'),
          brushSizeSlider = document.getElementById('brushSize'),
          brushSizeValue = document.getElementById('brushSizeValue'),
          clearBtn = document.getElementById('clearCanvasBtn'),
          insertBtn = document.getElementById('insertDrawingBtn'),
          undoBtn = document.getElementById('undoBtn'),
          redoBtn = document.getElementById('redoBtn'),
          penBtn = document.getElementById('penBtn'),
          markerBtn = document.getElementById('markerBtn'),
          sprayBtn = document.getElementById('sprayBtn'),
          fillBtn = document.getElementById('fillBtn'),
          eraserBtn = document.getElementById('eraserBtn');
    
    let isDrawing = false, lastX = 0, lastY = 0;
    let currentTool = 'pen';
    let currentBgColor = '#FFFFFF';
    
    let history = [];
    let historyIndex = -1;
    const HISTORY_LIMIT = 30;

    const getPointerPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { 
            x: (clientX - rect.left) * (canvas.width / rect.width), 
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };
    
    const updateHistory = () => {
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push({
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
            bgColor: currentBgColor 
        });
        if (history.length > HISTORY_LIMIT) {
            history.shift();
        }
        historyIndex = history.length - 1;
        updateUndoRedoButtons();
    };

    const updateUndoRedoButtons = () => {
        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex >= history.length - 1;
    };

    const restoreHistory = () => {
        const historyEntry = history[historyIndex];
        if (historyEntry) {
            ctx.putImageData(historyEntry.imageData, 0, 0);
            currentBgColor = historyEntry.bgColor;
            bgColorPicker.value = historyEntry.bgColor;
        }
    };
    
    const undo = () => {
        if (historyIndex > 0) {
            historyIndex--;
            restoreHistory();
            updateUndoRedoButtons();
        }
    };
    
    const redo = () => {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            restoreHistory();
            updateUndoRedoButtons();
        }
    };

    const fillBackground = (save = true) => {
        ctx.fillStyle = currentBgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if(save) updateHistory();
    };

    const setActiveTool = (tool) => {
        currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`${tool}Btn`)?.classList.add('active');
        canvas.style.cursor = tool === 'fill' ? 'copy' : 'crosshair';
    };

    const setBrush = () => {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1.0;
      ctx.lineWidth = brushSizeSlider.value;
      
      switch (currentTool) {
        case 'eraser':
            ctx.strokeStyle = currentBgColor;
            break;
        case 'marker':
            ctx.strokeStyle = colorPicker.value;
            ctx.globalAlpha = 0.2;
            break;
        case 'spray':
        case 'pen':
        default:
            ctx.strokeStyle = colorPicker.value;
            break;
      }
    };
    
    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        setBrush();
        const { x, y } = getPointerPos(e);

        if (currentTool === 'spray') {
            const density = brushSizeSlider.value * 2;
            const radius = brushSizeSlider.value;
            ctx.fillStyle = colorPicker.value;
            for (let i = density; i--; ) {
                const angle = Math.random() * 2 * Math.PI;
                const r = Math.random() * radius;
                ctx.fillRect(x + r * Math.cos(angle), y + r * Math.sin(angle), 1, 1);
            }
        } else {
            ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke();
        }
        [lastX, lastY] = [x, y];
    };
    
    const startDrawing = (e) => {
        if (currentTool === 'fill') { floodFill(getPointerPos(e)); return; }
        isDrawing = true;
        const { x, y } = getPointerPos(e);
        [lastX, lastY] = [x, y];
        draw(e);
    };
    
    const stopDrawing = () => {
        if (isDrawing) { isDrawing = false; updateHistory(); }
    };
    
    const floodFill = ({x, y}) => {
        const w = canvas.width, h = canvas.height;
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || x >= w || y < 0 || y >= h) return;
        
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const startPos = (y * w + x) * 4;
        
        const startR = data[startPos], startG = data[startPos+1], startB = data[startPos+2];
        const hexToRgb = (hex) => { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null; };
        const fillRgb = hexToRgb(colorPicker.value);
        if (!fillRgb || (startR === fillRgb.r && startG === fillRgb.g && startB === fillRgb.b)) return;
        
        const tolerance = 32;
        const colorMatch = (pos) => {
            const dr = data[pos] - startR, dg = data[pos+1] - startG, db = data[pos+2] - startB;
            return (dr*dr + dg*dg + db*db) < tolerance * tolerance;
        };

        const pixelsToCheck = [[x, y]];
        const processed = new Uint8Array(w * h);

        while (pixelsToCheck.length > 0) {
            const [px, py] = pixelsToCheck.pop();
            const currentIdx = py * w + px;
            if (processed[currentIdx] === 1) continue;
            processed[currentIdx] = 1;

            const currentPos = currentIdx * 4;
            if (!colorMatch(currentPos)) continue;

            data[currentPos] = fillRgb.r; data[currentPos+1] = fillRgb.g; data[currentPos+2] = fillRgb.b; data[currentPos+3] = 255;
            
            if(px + 1 < w) pixelsToCheck.push([px + 1, py]);
            if(px - 1 >= 0) pixelsToCheck.push([px - 1, py]);
            if(py + 1 < h) pixelsToCheck.push([px, py + 1]);
            if(py - 1 >= 0) pixelsToCheck.push([px, py - 1]);
        }
        ctx.putImageData(imageData, 0, 0);
        updateHistory();
    };
    
    const eventHandlers = {
        bgColorChange: () => { currentBgColor = bgColorPicker.value; fillBackground(true); },
        start: (e) => startDrawing(e),
        move: (e) => draw(e),
        stop: () => stopDrawing(),
        toolPen: () => setActiveTool('pen'),
        toolMarker: () => setActiveTool('marker'),
        toolSpray: () => setActiveTool('spray'),
        toolFill: () => setActiveTool('fill'),
        toolEraser: () => setActiveTool('eraser'),
        undo: () => undo(),
        redo: () => redo(),
        clear: () => { if(confirm('キャンバスを全消ししますか？')) { currentBgColor = '#FFFFFF'; bgColorPicker.value = '#FFFFFF'; fillBackground(true); } },
        show: () => {
            modal.style.display = 'flex';
            history = []; historyIndex = -1;
            currentBgColor = '#FFFFFF'; bgColorPicker.value = '#FFFFFF';
            setActiveTool('pen');
            fillBackground(true);
        },
        hide: () => modal.style.display = 'none',
        hideOverlay: (e) => { if (e.target === e.currentTarget) modal.style.display = 'none'; },
        insert: () => {
            drawingDataUrl = canvas.toDataURL('image/png');
            const imageContainer = document.getElementById(imageContainerId);
            imageContainer.innerHTML = `<div id="drawingPreviewContainer"><img id="drawingPreview" src="${drawingDataUrl}"><button id="clearDrawingBtn" class="btn small warn">絵を削除</button></div>`;
            document.getElementById('clearDrawingBtn').onclick = () => {
                drawingDataUrl = null;
                imageContainer.innerHTML = `<input id="${imageContainerId === 'newImageContainer' ? 'newImage' : 'replyImage'}" type="file" accept="image/*">`;
            };
            modal.style.display = 'none';
        }
    };

    const addManagedListener = (element, type, handler, options = {}) => {
        element.addEventListener(type, handler, options);
        drawingEventListeners.push({ element, type, handler, options });
    };
    
    addManagedListener(drawBtn, 'click', eventHandlers.show);
    addManagedListener(closeBtn, 'click', eventHandlers.hide);
    addManagedListener(modal, 'click', eventHandlers.hideOverlay);
    addManagedListener(bgColorPicker, 'change', eventHandlers.bgColorChange);
    addManagedListener(canvas, 'mousedown', eventHandlers.start);
    addManagedListener(canvas, 'mousemove', eventHandlers.move);
    addManagedListener(canvas, 'mouseup', eventHandlers.stop);
    addManagedListener(canvas, 'mouseout', eventHandlers.stop);
    addManagedListener(canvas, 'touchstart', eventHandlers.start, { passive: false });
    addManagedListener(canvas, 'touchmove', eventHandlers.move, { passive: false });
    addManagedListener(canvas, 'touchend', eventHandlers.stop);
    addManagedListener(penBtn, 'click', eventHandlers.toolPen);
    addManagedListener(markerBtn, 'click', eventHandlers.toolMarker);
    addManagedListener(sprayBtn, 'click', eventHandlers.toolSpray);
    addManagedListener(fillBtn, 'click', eventHandlers.toolFill);
    addManagedListener(eraserBtn, 'click', eventHandlers.toolEraser);
    addManagedListener(undoBtn, 'click', eventHandlers.undo);
    addManagedListener(redoBtn, 'click', eventHandlers.redo);
    addManagedListener(clearBtn, 'click', eventHandlers.clear);
    addManagedListener(insertBtn, 'click', eventHandlers.insert);
    addManagedListener(brushSizeSlider, 'input', () => { brushSizeValue.textContent = brushSizeSlider.value; });
  }

  window.react = async (threadId, postId, reac) => {
    const user = getUser();
    const reacRef = db.ref(`threads/${threadId}/posts/${postId}/reactions/${user.permanentId}`);
    
    const postAuthorSnapshot = await db.ref(`threads/${threadId}/posts/${postId}/author/permanentId`).once('value');
    const authorId = postAuthorSnapshot.val();

    await reacRef.transaction(currentReac => (currentReac === reac ? null : reac));

    if (reac === '🥺' && authorId) {
        const userAchievements = (await db.ref(`userAchievements/${authorId}/achievements`).once('value')).val() || {};
        if (userAchievements.popular_puyuyu) return;

        const allReactionsSnapshot = await db.ref(`threads/${threadId}/posts/${postId}/reactions`).once('value');
        const allReactions = allReactionsSnapshot.val() || {};
        const puyoyuCount = Object.values(allReactions).filter(r => r === '🥺').length;

        if (puyoyuCount >= 10) {
            const viewers = (await db.ref(`viewers/${threadId}`).once('value')).val() || {};
            if (viewers[authorId]) {
                unlockAchievement(authorId, 'popular_puyuyu');
            } else {
                db.ref(`pendingAchievements/${authorId}/popular_puyuyu`).set(threadId);
            }
        }
    }
  };
  
  function exitEditMode(options = {}) {
      if (!currentEditState) return;
      const { postElement, originalControlsHTML, originalBodyHTML } = currentEditState;
      const bodyContainer = postElement.querySelector('.body-container');
      const controls = postElement.querySelector('.controls');
      if (options.postWasDeleted) {
          postElement.children[1].innerHTML = '<div class="deleted-note">[削除されました]</div>';
      } else {
          const newBody = document.createElement('div');
          newBody.className = 'body';
          newBody.innerHTML = options.newText ? renderContent(options.newText) : originalBodyHTML;
          if (bodyContainer) bodyContainer.replaceWith(newBody);
          if (controls) controls.innerHTML = originalControlsHTML;
          if (options.newText) {
            if(window.twttr && twttr.widgets) twttr.widgets.load(postElement);
          }
      }
      currentEditState = null;
  }

  window.editPost = async (threadId, postId) => {
      if (currentEditState) exitEditMode();
      const postRef = db.ref(`threads/${threadId}/posts/${postId}`);
      const snapshot = await postRef.once('value');
      const originalPost = snapshot.val();
      if (!originalPost || originalPost.author.permanentId !== getUser().permanentId) return alert('自分の投稿しか編集できません');
      const postElement = document.querySelector(`[data-post-id="${postId}"]`);
      if (!postElement) return;
      const bodyElement = postElement.querySelector('.body');
      const controlsElement = postElement.querySelector('.controls');
      const bodyContainer = document.createElement('div');
      bodyContainer.className = 'body-container';
      bodyElement.replaceWith(bodyContainer);
      const originalBodyHTML = renderContent(originalPost.text, originalPost);
      const originalControlsHTML = controlsElement.innerHTML;
      currentEditState = { postId, threadId, postElement, originalBodyHTML, originalControlsHTML };
      const textarea = document.createElement('textarea');
      textarea.value = originalPost.text;
      textarea.style.cssText = 'width: 100%; min-height: 120px; resize: vertical; margin-top: 8px;';
      bodyContainer.innerHTML = '';
      bodyContainer.appendChild(textarea);
      textarea.focus();
      controlsElement.innerHTML = '';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn small';
      saveBtn.textContent = '保存';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn small warn';
      cancelBtn.textContent = 'キャンセル';
      controlsElement.appendChild(cancelBtn);
      controlsElement.appendChild(saveBtn);
      saveBtn.onclick = async () => {
          let newText = textarea.value;
          if (newText.trim() === '' && !originalPost.effect) return alert('本文を空にすることはできません。');
          if (newText.length > TEXT_LIMIT) return alert(`本文は${TEXT_LIMIT}文字以内にしてください。`);
          if (containsNGWord(newText)) return alert('不適切な単語が含まれています。');
          
          let postData = { text: newText };
          postData = processSpecialCommands(postData, getUser());
          newText = postData.text;

          saveBtn.disabled = true;
          saveBtn.textContent = '保存中...';
          try {
              const updateData = { text: newText.trim() };
              if(postData.effect) updateData.effect = postData.effect; else updateData.effect = null;
              await postRef.update(updateData);
              exitEditMode({ newText: newText.trim() });
          } catch (e) {
              alert('保存に失敗しました: ' + e.message);
              exitEditMode();
          }
      };
      cancelBtn.onclick = () => exitEditMode();
  };
  
  window.deletePost=(t,p)=>{if(confirm('この投稿を削除しますか？'))db.ref().update({[`threads/${t}/posts/${p}/text`]:'',[`threads/${t}/posts/${p}/img`]:null,[`threads/${t}/posts/${p}/deleted`]:true});};
  
  window.toggleGlobalBan = async (userPermanentId, name) => {
    const btn = event.target;
    btn.disabled = true;
    try {
      const ref = db.ref(`globalBan/${userPermanentId}`);
      const snapshot = await ref.once('value');
      const actionText = snapshot.val() ? '永久追放を解除' : '永久追放';
      if (confirm(`${name} を ${actionText} しますか？`)) {
        await ref.set(snapshot.val() ? null : true);
        alert(`${name} の${actionText}に成功しました。`);
      }
    } catch (e) {
      alert("処理に失敗しました: " + e.message);
    } finally {
      btn.disabled = false;
    }
  };

  window.showUserProfile = async (name, permanentId, isOpAdm, dailyId, postTimestamp, threadId) => {
    const modal = document.getElementById('profileModal'), 
          nameEl = document.getElementById('profileName'), 
          idEl = document.getElementById('profileId'), 
          postsListEl = document.getElementById('profilePostsList'), 
          controlsEl = document.getElementById('profileControls');
    
    nameEl.textContent = name;
    idEl.textContent = `Daily ID: ${dailyId}`;
    controlsEl.innerHTML = '';
    startLoadingAnimation(postsListEl, '今日の投稿を検索中');
    
    const currentUser = getUser();
    if((isOpAdm || ADMIN_IDS.includes(currentUser.permanentId)) && currentUser.permanentId !== permanentId) {
      const threadRef = db.ref(`threads/${threadId}`);
      const threadData = (await threadRef.once('value')).val();
      if (threadData && (threadData.op.permanentId === currentUser.permanentId || ADMIN_IDS.includes(currentUser.permanentId))) {
        const isBanned = threadData.banned && threadData.banned[permanentId];
        controlsEl.innerHTML += `<button class="btn small warn" onclick="window.toggleBan('${threadId}', '${permanentId}', '${escapeHTML(name).replace(/'/g, "\\'")}')">${isBanned ? 'このスレのアク禁解除' : 'このスレでアク禁'}</button>`;
      }
      if(ADMIN_IDS.includes(currentUser.permanentId)) {
        const isGloballyBanned = (await db.ref(`globalBan/${permanentId}`).once('value')).val();
        controlsEl.innerHTML += `<button class="btn small warn" onclick="window.toggleGlobalBan('${permanentId}', '${escapeHTML(name).replace(/'/g, "\\'")}')">${isGloballyBanned ? '永久追放を解除' : '永久追放'}</button>`;
      }
    }
    modal.style.display = 'flex';
    
    try {
      const targetDateStr = getJstDateStringFromTimestamp(parseInt(postTimestamp, 10));
      const history = loadHistory();
      let allFoundPosts = [];

      const promises = history.map(async (item) => {
          const postsSnapshot = await db.ref('threads/' + item.id + '/posts').orderByChild('author/permanentId').equalTo(permanentId).once('value');
          if (postsSnapshot.exists()) {
              const posts = postsSnapshot.val();
              const dailyPostsInThread = Object.values(posts).filter(post => {
                  return getJstDateStringFromTimestamp(post.createdAt) === targetDateStr;
              }).map(post => ({...post, threadTitle: item.title, threadId: item.id}));
              allFoundPosts.push(...dailyPostsInThread);
          }
      });
      
      await Promise.all(promises);

      const uniquePosts = Array.from(new Map(allFoundPosts.map(p => [p.id, p])).values());
      uniquePosts.sort((a, b) => b.createdAt - a.createdAt);
      
      stopLoadingAnimation();
      if (uniquePosts.length > 0) {
          const allPostsInCurrentThread = Object.values(threadDataCache[threadId] || {}).sort((a,b)=>a.createdAt-b.createdAt);
          postsListEl.innerHTML = uniquePosts.map(post => {
              let postNumText = '';
              if (post.threadId === threadId) {
                  const num = allPostsInCurrentThread.findIndex(p => p.id === post.id);
                  if (num !== -1) postNumText = `No.${num + 1}`;
              }
              return `<div class="post" style="border-bottom: 1px solid var(--border-color); padding: 8px 0;">
                  <div class="small-muted">スレ: <a href="#thread-${post.threadId}" onclick="window.closeUserProfile()">${escapeHTML(post.threadTitle)}</a> ${postNumText} (${formatTimestamp(post.createdAt)})</div>
                  <div class="body">${renderContent(post.text, post)}</div>
              </div>`;
          }).join('');
      } else {
          postsListEl.innerHTML = '<div class="small-muted">この日の投稿は見つかりませんでした。</div>';
      }
    } catch (e) {
      stopLoadingAnimation();
      postsListEl.innerHTML = `<div class="banned-note">投稿の読み込みに失敗しました: ${e.message}</div>`;
    }
  };
  
  window.prepareNextThread = async (threadId) => {
    try {
        const snapshot = await db.ref(`threads/${threadId}`).once('value');
        const thread = snapshot.val();
        if (!thread) return;
        const partMatch = thread.title.match(/Part\.(\d+)/);
        const newTitle = partMatch ? thread.title.replace(/Part\.\d+/, `Part.${parseInt(partMatch[1]) + 1}`) : `${thread.title} Part.2`;
        const newText = `前スレ：${location.origin}${location.pathname}#thread-${thread.id}\n\n`;
        localStorage.setItem(NEXT_THREAD_DATA_KEY, JSON.stringify({ title: newTitle, text: newText }));
        goHome();
    } catch(e) {
        alert('次スレの準備に失敗しました: ' + e.message);
    }
  };
  
  window.showAnchors = async (targetPostId, threadId) => {
      const modal = document.getElementById('anchorModal'), body = document.getElementById('anchorModalBody');
      startLoadingAnimation(body);
      modal.style.display = 'flex';
      try {
          const thread = (await db.ref(`threads/${threadId}`).once('value')).val();
          if (!thread || !thread.posts) throw new Error('スレッドが見つかりません。');
          const allPosts = Object.values(thread.posts).sort((a, b) => a.createdAt - b.createdAt);
          const targetPostIndex = allPosts.findIndex(p => p.id === targetPostId) + 1;
          const anchorPosts = allPosts.filter(p => p.text && (p.text.match(/>>(\d+)/g) || []).some(a => parseInt(a.replace('>>', '')) === targetPostIndex));
          stopLoadingAnimation();
          body.innerHTML = anchorPosts.length > 0
            ? anchorPosts.map(post => `<div class="post"><div class="meta"><b class="post-author">${escapeHTML(post.author.name)}</b> <span class="small-muted">${formatTimestamp(post.createdAt)}</span></div><div class="body">${renderContent(post.text)}</div></div>`).join('')
            : '<div class="small-muted">この投稿への返信はありません。</div>';
          
          if(window.twttr && twttr.widgets) twttr.widgets.load(body);
      } catch(e) {
          stopLoadingAnimation();
          body.innerHTML = `<div class="banned-note">返信の読み込みに失敗しました: ${e.message}</div>`;
      }
  };

  window.closeUserProfile=()=>{document.getElementById('profileModal').style.display='none';};
  window.goToPost=(t,p)=>{window.closeUserProfile();location.hash='thread-'+t;setTimeout(()=>{const e=document.querySelector(`[data-post-id="${p}"]`);if(e){e.scrollIntoView({behavior:'smooth',block:'center'});e.style.transition='background-color 0.5s';e.style.backgroundColor='rgba(21,101,192,0.1)';setTimeout(()=>e.style.backgroundColor='',2000);}},500);};
  
  function applyTheme(t){const b=document.getElementById('themeToggleBtn');if(t==='dark'){document.body.classList.add('dark-mode');if(b)b.textContent='☀️';}else{document.body.classList.remove('dark-mode');if(b)b.textContent='🌙';}}

  async function awardDailyBonusIfNeeded() {
    const user = getUser();
    let activity = loadDailyActivity();
    const todayStr = getJstDateString();
    if (todayStr !== activity.date && activity.postCount > 0) {
        const bonus = Math.floor(activity.postCount / 2);
        if (bonus > 0) {
            const expRef = db.ref(`userLevels/${user.permanentId}/exp`);
            await expRef.transaction(currentExp => (currentExp || 0) + bonus);
        }
        activity = { date: todayStr, postCount: 0 };
        saveDailyActivity(activity);
    }
  }

  async function getMyPostNumbersInThread(threadId, myId) {
    if (!threadId) return new Set();
    if (myPostNumbersCache[threadId]) return myPostNumbersCache[threadId];
    
    try {
        const snapshot = await db.ref(`threads/${threadId}/posts`).once('value');
        const posts = snapshot.val() || {}; 
        
        threadDataCache[threadId] = posts;
        const sortedPosts = Object.values(posts).sort((a, b) => a.createdAt - b.createdAt);
        const myPostNumbers = new Set(sortedPosts.map((p, i) => p.author && p.author.permanentId === myId ? i + 1 : null).filter(Boolean));
        myPostNumbersCache[threadId] = myPostNumbers;
        return myPostNumbers;
    } catch (error) {
        console.error(`Error fetching posts for thread ${threadId}:`, error);
        return new Set();
    }
  }

  function updateTotalUnreadBadge() {
    const unreadBadge = document.getElementById('historyUnreadBadge');
    const achBadge = document.getElementById('achievementBadge');
    if (!unreadBadge || !achBadge) return;
    
    const totalUnread = Object.values(unreadStatus).reduce((sum, count) => sum + count, 0);
    if (totalUnread > 0) {
        unreadBadge.textContent = totalUnread > 9 ? '9+' : totalUnread;
        unreadBadge.style.display = 'inline-flex';
    } else {
        unreadBadge.style.display = 'none';
    }
    
    const hasPendingAch = Object.keys(pendingAchievementsCache).length > 0;
    achBadge.style.display = hasPendingAch ? 'inline-flex' : 'none';
    achBadge.textContent = '!';
  }

  async function setupUnreadListeners() {
    activeUnreadListeners.forEach(l => { l.ref.off(l.type, l.callback); });
    activeUnreadListeners = []; unreadStatus = {}; repliesToMe = {};
    updateTotalUnreadBadge();
    const myId = getUser().permanentId;
    
    const achRef = db.ref(`pendingAchievements/${myId}`);
    const achCallback = achRef.on('value', snapshot => {
        pendingAchievementsCache = snapshot.val() || {};
        updateTotalUnreadBadge();
    });
    activeAchievementListener = { ref: achRef, callback: achCallback };
    
    const history = loadHistory();
    for (const item of history) {
      if (!item || !item.id) continue;
      
      unreadStatus[item.id] = 0;
      repliesToMe[item.id] = new Set();
      const myPostNumbers = await getMyPostNumbersInThread(item.id, myId);
      if (myPostNumbers.size > 0) {
          const postsRef = db.ref(`threads/${item.id}/posts`);
          const addQuery = postsRef.orderByChild('createdAt').startAt(item.visitedAt + 1);
          const addCallback = addQuery.on('child_added', snapshot => {
              const newPost = snapshot.val();
              if (!newPost || !newPost.text || (newPost.author && newPost.author.permanentId === myId)) return;
              if ((newPost.text.match(/>>(\d+)/g) || []).some(a => myPostNumbers.has(parseInt(a.replace('>>', ''))))) {
                  unreadStatus[item.id]++;
                  repliesToMe[item.id].add(newPost.id); 
                  updateTotalUnreadBadge();
                  if (loadSoundSettings().enabled) {
                      const sound = document.getElementById('notificationSound');
                      sound.currentTime = 0;
                      sound.play().catch(e => { /* Autoplay was prevented */ });
                  }
                  if (location.hash === '#history') {
                      const container = document.getElementById(`unread-container-${item.id}`);
                      const badge = document.getElementById(`unread-badge-${item.id}`);
                      if (container && badge) {
                          badge.textContent = `あなたへの新着レス: ${unreadStatus[item.id]}件`;
                          container.style.display = 'block';
                      }
                  }
              }
          });
          activeUnreadListeners.push({ ref: addQuery, type: 'child_added', callback: addCallback });
          const changeCallback = postsRef.on('child_changed', snapshot => {
              const changedPost = snapshot.val();
              if (changedPost.deleted && repliesToMe[item.id].has(changedPost.id)) {
                  unreadStatus[item.id] = Math.max(0, unreadStatus[item.id] - 1);
                  repliesToMe[item.id].delete(changedPost.id); 
                  updateTotalUnreadBadge();
                  if (location.hash === '#history') {
                      const container = document.getElementById(`unread-container-${item.id}`);
                      const badge = document.getElementById(`unread-badge-${item.id}`);
                      if (container && badge) {
                          unreadStatus[item.id] > 0
                            ? badge.textContent = `あなたへの新着レス: ${unreadStatus[item.id]}件`
                            : container.style.display = 'none';
                      }
                  }
              }
          });
          activeUnreadListeners.push({ ref: postsRef, type: 'child_changed', callback: changeCallback });
      }
    }
  }
  
  async function runArchiveCheckIfNeeded() {
      try {
          const stateRef = db.ref('appState/lastArchiveCheckTimestamp');
          const snapshot = await stateRef.once('value');
          const lastCheck = snapshot.val() || 0;
          const now = Date.now();
          const ONE_DAY_MS = 24 * 60 * 60 * 1000;

          if (now - lastCheck > ONE_DAY_MS) {
              await stateRef.set(now);

              const metaRef = db.ref('threadMetadata');
              const metaSnapshot = await metaRef.orderByChild('lastUpdatedAt').once('value');
              const allMeta = metaSnapshot.val();
              if (!allMeta) return;

              const updates = {};
              const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

              for (const threadId in allMeta) {
                  const thread = allMeta[threadId];
                  const tags = thread.tags || [];
                  const isExempt = tags.includes('ぷゆゆ名鑑') || tags.includes('レベル上げ');

                  if (!thread.isArchived && !isExempt && !thread.isHallOfFame && (now - thread.lastUpdatedAt > SEVEN_DAYS_MS)) {
                      updates[`/threadMetadata/${threadId}/isArchived`] = true;
                  }
              }

              if (Object.keys(updates).length > 0) {
                  await db.ref().update(updates);
              }
          }
      } catch (error) {
          console.error("スレッドの自動整理に失敗しました:", error);
      }
  }

  async function renderApp(){
    exitEditMode();
    cleanupListeners();
    currentViewers = 0;
    refreshHeader();
    
    await runArchiveCheckIfNeeded();
    await setupUnreadListeners();

    const h=location.hash||'#';
    if (h.startsWith('#thread-')) {
      await renderThread(h.replace('#thread-',''));
    } else if (h === '#history') {
      await renderHistoryPage();
    } else if (h === '#settings') {
      renderSettingsPage();
    } else if (h === '#memories') {
      await renderMemoriesPage();
    } else {
      renderHome();
      const ref = db.ref('threadMetadata'); 
      const cb = ref.orderByChild('lastUpdatedAt').on('value', s => {
        stopLoadingAnimation();
        allThreads = s.val() ? Object.values(s.val()).filter(t => t && t.title).sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt) : [];
        if (typeof window.performDisplay === 'function') performDisplay();
      }, e => { 
        stopLoadingAnimation();
        const c = document.getElementById('threadListContainer');
        if(c) c.innerHTML = `<div class="card"><div class="banned-note">データの読み込みに失敗しました。</div></div>`;
      });
      activeDataListener = { ref, callback: cb };
    }
  }
  
  window.castVote = async (threadId, postId, option) => {
    try {
        const postText = (await db.ref(`threads/${threadId}/posts/${postId}/text`).once('value')).val();
        if (postText && postText.match(/\[vote\((\d+)\):/)) {
            const deadline = parseInt(RegExp.$1, 10);
            if (deadline > 0 && Date.now() > deadline) return alert('このアンケートは締め切られています。');
        }
        db.ref(`threads/${threadId}/posts/${postId}/votes/${getUser().permanentId}`).transaction(v => v === option ? null : option);
    } catch (e) {
        alert("投票に失敗しました: " + e.message);
    }
  };

  document.getElementById('homeBtn').onclick=goHome;
  document.getElementById('historyBtn').onclick=()=>location.hash='history';
  document.getElementById('settingsBtn').onclick=()=>location.hash='settings';
  document.getElementById('refreshBtn').onclick=()=>renderApp();
  document.getElementById('themeToggleBtn').onclick=()=>{const nT=document.body.classList.contains('dark-mode')?'light':'dark';localStorage.setItem(THEME_KEY,nT);applyTheme(nT);};
  document.getElementById('closeProfileBtn').onclick=window.closeUserProfile;
  document.getElementById('profileModal').onclick=(e)=>{if(e.target===e.currentTarget)window.closeUserProfile();};
  const lightbox = document.getElementById('imageLightbox');
  lightbox.onclick=()=>lightbox.style.display='none';
  const anchorModal = document.getElementById('anchorModal');
  document.getElementById('closeAnchorModalBtn').onclick=()=>anchorModal.style.display='none';
  anchorModal.onclick=(e)=>{if(e.target===e.currentTarget)anchorModal.style.display='none';};

  applyTheme(localStorage.getItem(THEME_KEY)||'light');
  window.addEventListener('hashchange', renderApp);
  
  awardDailyBonusIfNeeded();
  
  setInterval(() => {
    document.querySelectorAll('.vote-countdown').forEach(el => {
      const timeLeft = parseInt(el.dataset.deadline, 10) - Date.now();
      const newText = formatTimeLeft(timeLeft);
      if (el.textContent !== newText) el.textContent = newText;
      if (timeLeft <= 0) el.classList.remove('vote-countdown');
    });
  }, 1000);

  renderApp();

  document.body.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const { action, threadId, postId, reac, name, id, isopadm, num, voteOption, dailyId, postTimestamp } = target.dataset;
    if (action === 'react') window.react(threadId, postId, reac);
    else if (action === 'delete-post') window.deletePost(threadId, postId);
    else if (action === 'edit-post') window.editPost(threadId, postId);
    else if (action === 'show-profile') window.showUserProfile(name, id, isopadm === 'true', dailyId, postTimestamp, threadId);
    else if (action === 'open-lightbox') { lightbox.style.display='flex'; document.getElementById('lightboxImage').src=target.src; }
    else if (action === 'delete-thread') {
      if(confirm('本当にこのスレッドを削除しますか？\nこの操作は取り消せません。')){
        try {
          await db.ref().update({[`/threads/${threadId}`]:null,[`/threadMetadata/${threadId}`]:null,[`/viewers/${threadId}`]:null});
          allThreads = allThreads.filter(t => t.id !== threadId);
          alert('スレッドの削除に成功しました。');
          goHome();
        } catch (err) {
          alert('スレッドの削除に失敗しました: ' + err.message);
        }
      }
    }
    else if (action === 'quote') { 
        e.preventDefault();
        const targetPostNum = parseInt(num, 10);
        const currentThreadId = location.hash.replace('#thread-','');
        try {
            const posts = (await db.ref(`threads/${currentThreadId}/posts`).once('value')).val() || {};
            const targetPost = Object.values(posts).sort((a,b) => a.createdAt - b.createdAt)[targetPostNum - 1];
            if (targetPost) {
                const targetElement = document.querySelector(`[data-post-id="${targetPost.id}"]`);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetElement.style.transition = 'background-color 0.5s';
                    targetElement.style.backgroundColor = 'rgba(21,101,192,0.1)';
                    setTimeout(() => { targetElement.style.backgroundColor = ''; }, 2000);
                }
            } else {
                alert(`投稿 No.${targetPostNum} が見つかりませんでした。`);
            }
        } catch (err) {
            alert('投稿の取得に失敗しました: ' + err.message);
        }
    }
    else if (action === 'insert-quote-number') { 
        e.preventDefault();
        const replyTextarea = document.getElementById('replyText');
        if (replyTextarea) {
            replyTextarea.value += `>>${parseInt(num, 10)} `;
            replyTextarea.focus();
        }
    }
    else if (action === 'vote') window.castVote(threadId, postId, voteOption);
    else if (action === 'show-anchors') window.showAnchors(postId, threadId);
  });
}
