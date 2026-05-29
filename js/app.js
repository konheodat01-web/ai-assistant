// ===== CONFIG =====
const CONFIG = {
  webhookUrl: localStorage.getItem('webhookUrl') || 'https://103.82.195.87/webhook/ai-orchestrator',
  pushServerUrl: 'https://103.82.195.87/push',
  vapidPublicKey: 'BNpXnlHm5tfuilpDZLBu5x-2brayp_XvSbYwFXBbAy36UlcSQQOl263zxQ2jeq8oIJbN1FvUK0uyVPngPIlp7Ew',
  botName: 'Trợ lý AI',
};

// ===== FIREBASE CONFIG & INIT =====
const firebaseConfig = {
  apiKey: "AIzaSyBfWldaesyZpAepyI8DQoYS3qv5YV1Y8dk",
  authDomain: "task-manager-ac80a.firebaseapp.com",
  databaseURL: "https://task-manager-ac80a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "task-manager-ac80a",
  storageBucket: "task-manager-ac80a.firebasestorage.app",
  messagingSenderId: "102128220358",
  appId: "1:102128220358:web:8d1423e0ade80bf59ebfc7",
  measurementId: "G-5TZ2KSK268"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// ===== USER SETTINGS =====
const userSettings = JSON.parse(localStorage.getItem('userSettings') || '{"name":"Chủ hệ thống"}');
function saveSettings() { localStorage.setItem('userSettings', JSON.stringify(userSettings)); }

// ===== STATE =====
let chatHistory = [];
let isProcessing = false;
let currentUser = null;
let unsubscribeMessages = null;
let unsubscribeSkills = null;
let userSkills = [];
let currentMode = 'normal'; // 'normal', 'expert', 'learning'

// ===== DOM REFS =====
const chatArea = document.getElementById('chat-area');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const settingsOverlay = document.getElementById('settings-overlay');
const loginOverlay = document.getElementById('login-overlay');
const logoutBtn = document.getElementById('logout-btn');

// Xu ly ket qua redirect tu Google
auth.getRedirectResult().then(result => {
  // Redirect da duoc xu ly boi onAuthStateChanged, khong can lam gi them
}).catch(err => {
  console.error('Redirect login error:', err.message);
});

// ===== AUTH STATE CHANGED =====
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    loginOverlay.style.display = 'none';
    
    // Cap nhat Header
    document.getElementById('user-name').textContent = user.displayName || 'Trợ lý AI';
    if(user.photoURL) document.getElementById('user-avatar').innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    document.getElementById('user-status').textContent = 'Đã đồng bộ • Online';
    
    userSettings.name = user.displayName;
    saveSettings();

    loadMessages();
    loadSkills();
  } else {
    currentUser = null;
    loginOverlay.style.display = 'flex';
    chatHistory = [];
    userSkills = [];
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeSkills) unsubscribeSkills();
  }
});

document.getElementById('login-google-btn').addEventListener('click', () => {
  // Thay thế signInWithPopup bằng signInWithRedirect để sửa lỗi Cross-Origin-Opener-Policy trên Github Pages
  auth.signInWithRedirect(provider);
});

logoutBtn.addEventListener('click', () => {
  auth.signOut();
  location.reload();
});

// ===== LOAD FIRESTORE MESSAGES =====
function loadMessages() {
  const msgsRef = db.collection('users').doc(currentUser.uid).collection('messages').orderBy('timestamp', 'asc');
  
  // Xóa tin nhắn cũ trên UI
  const msgs = chatArea.querySelectorAll('.msg-group');
  msgs.forEach(m => m.remove());
  const welcomeMsg = document.getElementById('welcome-msg');
  if (welcomeMsg) welcomeMsg.remove();
  
  chatHistory = []; 
  
  unsubscribeMessages = msgsRef.onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const data = change.doc.data();
        chatHistory.push(data); // Dùng history này gửi lên WFL1
        if (!data.isHidden) {
          appendMessage(data.role, data.content, data.time);
        }
      }
    });
    
    if (chatHistory.length === 0) {
      showWelcome();
    } else {
      const welcomeMsg = document.getElementById('welcome-msg');
      if (welcomeMsg) welcomeMsg.remove();
    }
  });
}

// ===== LOAD FIRESTORE SKILLS =====
function loadSkills() {
  const skillsRef = db.collection('users').doc(currentUser.uid).collection('skills').orderBy('timestamp', 'desc');
  unsubscribeSkills = skillsRef.onSnapshot(snapshot => {
    userSkills = [];
    const container = document.getElementById('skills-list-container');
    container.innerHTML = '';
    
    if (snapshot.empty) {
      container.innerHTML = '<div style="color:#888; font-size:13px; text-align:center; padding: 20px;">Bạn chưa dạy AI kỹ năng nào.</div>';
      return;
    }

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      userSkills.push({ id: doc.id, ...data });
      
      const el = document.createElement('div');
      el.style.cssText = 'background: #1a1a2e; padding: 12px; border-radius: 8px; border: 1px solid #333; position: relative;';
      el.innerHTML = `
        <div style="font-weight: 600; color: #4facfe; margin-bottom: 5px; font-size: 14px;">${data.name}</div>
        <div style="font-size: 13px; color: #ccc; line-height: 1.4; white-space: pre-wrap;">${data.content}</div>
        <button class="delete-skill-btn" data-id="${doc.id}" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: #ff4d4f; cursor: pointer; font-size: 16px;">🗑️</button>
      `;
      container.appendChild(el);
    });

    // Gắn sự kiện xóa
    container.querySelectorAll('.delete-skill-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        if (confirm('Bạn có chắc muốn xóa kỹ năng này?')) {
          await db.collection('users').doc(currentUser.uid).collection('skills').doc(id).delete();
        }
      });
    });
  });
}

// ===== RENDER MESSAGES =====
function getTimeStr() {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function appendMessage(role, content, time) {
  const isUser = role === 'user';
  const group = document.createElement('div');
  group.className = `msg-group ${role}`;

  const formatted = formatContent(content);
  const timeStr = time || getTimeStr();

  group.innerHTML = `
    <div class="msg-row">
      ${!isUser ? `<div class="msg-avatar">🤖</div>` : ''}
      <div class="bubble">${formatted}</div>
    </div>
    <div class="msg-time">${timeStr}</div>
  `;

  chatArea.insertBefore(group, typingIndicator);
  scrollToBottom();
  return group;
}

function formatContent(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#2a2a4a;padding:1px 6px;border-radius:4px;font-size:13px">$1</code>')
    .replace(/✅|🎉/g, '<span style="font-size:16px">$&</span>')
    .replace(/\n/g, '<br>');
}

function showTyping() {
  typingIndicator.classList.add('show');
  scrollToBottom();
}

function hideTyping() {
  typingIndicator.classList.remove('show');
}

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ===== SEND MESSAGE =====
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || isProcessing || !currentUser) return;

  isProcessing = true;
  sendBtn.disabled = true;
  msgInput.value = '';
  autoResize();

  const timeStr = getTimeStr();
  const userMsg = {
    role: 'user',
    content: text,
    time: timeStr,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  // Lưu tin nhắn lên Firebase → UI sẽ tự render thông qua onSnapshot
  await db.collection('users').doc(currentUser.uid).collection('messages').add(userMsg);

  // Nếu đang ở CHẾ ĐỘ HỌC TẬP -> Đẩy thẳng lên Qdrant, KHÔNG hỏi AI
  if (currentMode === 'learning') {
    isProcessing = true;
    showTyping();
    try {
      const textBlob = new Blob([text], { type: 'text/plain' });
      const textFile = new File([textBlob], `KienThucNhanh_${Date.now()}.txt`);
      const formData = new FormData();
      formData.append('data', textFile);
      
      const res = await fetch('https://103.82.195.87/webhook/upload-docs', {
        method: 'POST',
        body: formData
      });
      await res.json();
      
      await db.collection('users').doc(currentUser.uid).collection('messages').add({
        role: 'assistant',
        content: `📚 **Đã học thuộc!** Kiến thức vừa rồi đã được cất vào Second Brain.`,
        time: getTimeStr(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(err) {
      await db.collection('users').doc(currentUser.uid).collection('messages').add({
        role: 'assistant',
        content: `❌ Lỗi khi học kiến thức mới: ${err.message}`,
        time: getTimeStr(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    isProcessing = false;
    hideTyping();
    msgInput.focus();
    return;
  }

  showTyping();

  try {
    const webhookUrl = localStorage.getItem('webhookUrl') || CONFIG.webhookUrl;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        // Gửi history thuần không có Firebase serverTimestamp field để tránh lỗi json
        history: chatHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
        skills: userSkills.map(s => ({ name: s.name, content: s.content })), // Truyền kỹ năng vào cho WFL1
        mode: currentMode,
        timestamp: new Date().toISOString(),
        source: 'pwa-app',
        userName: userSettings.name 
      })
    });

    hideTyping();

    if (!response.ok) throw new Error(`Lỗi server: ${response.status}`);

    const data = await response.json();
    let reply = data.result || data.message || data.output || JSON.stringify(data);

    // XỬ LÝ CLIENT-SIDE TOOLS
    if (data.tool_executed === 'save_skill') {
      try {
        await db.collection('users').doc(currentUser.uid).collection('skills').add({
          name: data.tool_args.skill_name || 'Kỹ năng mới',
          content: data.tool_args.instructions || '',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        reply = `✅ **Đã ghi nhớ kỹ năng mới:** ${data.tool_args.skill_name}`;
      } catch (err) {
        reply = `❌ Lỗi khi lưu kỹ năng: ${err.message}`;
      }
    } else if (data.tool_executed === 'search_second_brain') {
      reply = `🔍 Đang lục lọi trong Second Brain với từ khóa: **${data.tool_args.query}**...`;
      // PWA tự động gọi WFL6 để tìm kiếm
      fetch(`https://103.82.195.87/webhook/search-brain?q=${encodeURIComponent(data.tool_args.query)}`)
        .then(res => res.json())
        .then(searchData => {
           let docs = searchData.chunks && searchData.chunks.length > 0 ? searchData.chunks.join('\\n\\n---\\n\\n') : 'Không tìm thấy tài liệu nào liên quan.';
           const hiddenMsg = `[KẾT QUẢ TÌM KIẾM SECOND BRAIN CHO TỪ KHÓA: ${data.tool_args.query}]\\n\\n${docs}\\n\\nDựa vào các tài liệu trên, hãy trả lời câu hỏi gốc của tôi.`;
           autoReplyToAi(hiddenMsg);
        })
        .catch(err => console.error("Lỗi search second brain:", err));
    }

    // Lưu phản hồi của AI lên Firebase → UI tự render
    await db.collection('users').doc(currentUser.uid).collection('messages').add({
      role: 'assistant',
      content: reply,
      time: getTimeStr(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

  } catch (err) {
    hideTyping();
    const errMsg = err.message.includes('Failed to fetch') || err.message.includes('NetworkError')
      ? '⚠️ Không kết nối được tới server.\\n\\n👉 Vui lòng mở tab mới, vào **https://103.82.195.87** và bấm **Advanced → Proceed** để chấp nhận SSL cert, rồi thử lại.'
      : `❌ Lỗi: ${err.message}`;
      
    await db.collection('users').doc(currentUser.uid).collection('messages').add({
      role: 'assistant',
      content: errMsg,
      time: getTimeStr(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  isProcessing = false;
  sendBtn.disabled = false;
  msgInput.focus();
}

// ===== AUTO REPLY (Dành cho Tools) =====
async function autoReplyToAi(text) {
  // Lưu vào Firebase dạng tin ẩn
  await db.collection('users').doc(currentUser.uid).collection('messages').add({
    role: 'user',
    content: text,
    time: getTimeStr(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    isHidden: true
  });
  
  // Đợi Firebase update local (khoảng 1s)
  setTimeout(async () => {
    isProcessing = true;
    showTyping();
    try {
      const webhookUrl = localStorage.getItem('webhookUrl') || CONFIG.webhookUrl;
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
          skills: userSkills.map(s => ({ name: s.name, content: s.content })),
          mode: currentMode,
          timestamp: new Date().toISOString(),
          source: 'pwa-app',
          userName: userSettings.name 
        })
      });
      const data = await response.json();
      const reply = data.result || data.message || data.output || JSON.stringify(data);
      await db.collection('users').doc(currentUser.uid).collection('messages').add({
        role: 'assistant',
        content: reply,
        time: getTimeStr(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(err) {
      console.error(err);
    }
    isProcessing = false;
    hideTyping();
  }, 1000);
}

// ===== INPUT HANDLING =====
function autoResize() {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
}

msgInput.addEventListener('input', autoResize);
msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.addEventListener('click', sendMessage);

// ===== UI OVERHAUL LOGIC =====
const mainMenuBtn = document.getElementById('main-menu-btn');
const mainMenuContent = document.getElementById('main-menu-content');
const actionPlusBtn = document.getElementById('action-plus-btn');
const actionUploadMenu = document.getElementById('action-upload-menu');
const modeToggleBtn = document.getElementById('mode-toggle-btn');
const modeMenu = document.getElementById('mode-menu');
const modeIcon = document.getElementById('mode-icon');
const modeTextShort = document.getElementById('mode-text-short');
const modeItems = document.querySelectorAll('.mode-item');

function closeAllMenus() {
  if (mainMenuContent) mainMenuContent.classList.remove('show');
  if (actionUploadMenu) actionUploadMenu.classList.remove('show');
  if (modeMenu) modeMenu.classList.remove('show');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.settings-dropdown') && !e.target.closest('.action-menu-wrapper')) {
    closeAllMenus();
  }
});

if (mainMenuBtn) {
  mainMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = mainMenuContent.classList.contains('show');
    closeAllMenus();
    if (!isShowing) mainMenuContent.classList.add('show');
  });
}

if (actionPlusBtn) {
  actionPlusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = actionUploadMenu.classList.contains('show');
    closeAllMenus();
    if (!isShowing) actionUploadMenu.classList.add('show');
  });
}

if (modeToggleBtn) {
  modeToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = modeMenu.classList.contains('show');
    closeAllMenus();
    if (!isShowing) modeMenu.classList.add('show');
  });
}

modeItems.forEach(item => {
  item.addEventListener('click', () => {
    modeItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentMode = item.dataset.mode;
    
    if (currentMode === 'expert') {
      modeIcon.textContent = '🧠'; modeTextShort.textContent = 'Chuyên gia';
      modeToggleBtn.style.color = '#4facfe';
      msgInput.placeholder = "Hỏi Second Brain...";
    } else if (currentMode === 'learning') {
      modeIcon.textContent = '📚'; modeTextShort.textContent = 'Học tập';
      modeToggleBtn.style.color = '#ff9900';
      msgInput.placeholder = "Nạp kiến thức ngắn...";
    } else {
      modeIcon.textContent = '⚡'; modeTextShort.textContent = 'Flash';
      modeToggleBtn.style.color = 'var(--text-primary)';
      msgInput.placeholder = "Hỏi AI Assistant...";
    }
    closeAllMenus();
  });
});

// ===== UPLOAD TÀI LIỆU (SECOND BRAIN) =====
const docUpload = document.getElementById('doc-upload');
docUpload.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Tạo tin nhắn thông báo upload lên Firebase
    await db.collection('users').doc(currentUser.uid).collection('messages').add({
      role: 'assistant',
      content: `⏳ Đang nạp tài liệu: **${file.name}** vào Second Brain...`,
      time: getTimeStr(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    try {
      const formData = new FormData();
      formData.append('data', file);
      
      const res = await fetch('https://103.82.195.87/webhook/upload-docs', {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      await db.collection('users').doc(currentUser.uid).collection('messages').add({
        role: 'assistant',
        content: `✅ Đã nạp thành công **${file.name}**! Tài liệu này đã được lưu vĩnh viễn vào hệ thống.`,
        time: getTimeStr(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      await db.collection('users').doc(currentUser.uid).collection('messages').add({
        role: 'assistant',
        content: `❌ Lỗi nạp tài liệu **${file.name}**: ${err.message}`,
        time: getTimeStr(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }
  docUpload.value = '';
});

// ===== SETTINGS & SKILLS UI =====
document.getElementById('settings-btn').addEventListener('click', () => {
  document.getElementById('setting-webhook').value = localStorage.getItem('webhookUrl') || CONFIG.webhookUrl;
  settingsOverlay.style.display = 'flex';
});

document.getElementById('settings-close').addEventListener('click', () => {
  settingsOverlay.style.display = 'none';
});

document.getElementById('save-settings').addEventListener('click', () => {
  const url = document.getElementById('setting-webhook').value.trim();
  if (url) {
    localStorage.setItem('webhookUrl', url);
    CONFIG.webhookUrl = url;
  }
  settingsOverlay.style.display = 'none';
  appendMessage('assistant', '✅ Đã lưu cấu hình mạng. Bạn có thể chat tiếp!');
});

// SKILLS UI
const skillsOverlay = document.getElementById('skills-overlay');
document.getElementById('skills-btn').addEventListener('click', () => {
  skillsOverlay.style.display = 'flex';
});

document.getElementById('skills-close').addEventListener('click', () => {
  skillsOverlay.style.display = 'none';
});

document.getElementById('btn-add-skill').addEventListener('click', async () => {
  const nameInput = document.getElementById('new-skill-name');
  const contentInput = document.getElementById('new-skill-content');
  const name = nameInput.value.trim();
  const content = contentInput.value.trim();
  
  if (!name || !content || !currentUser) return alert('Vui lòng nhập đủ tên và nội dung!');
  
  await db.collection('users').doc(currentUser.uid).collection('skills').add({
    name: name,
    content: content,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  nameInput.value = '';
  contentInput.value = '';
});

// ===== CLEAR CHAT =====
document.getElementById('clear-chat-btn').addEventListener('click', async () => {
  if (!currentUser) return;
  
  if (confirm('⚠️ Bạn muốn xóa toàn bộ lịch sử hội thoại trên TẤT CẢ thiết bị?\\n\\nHành động này không thể hoàn tác!')) {
    if (confirm('Xác nhận lần 2: Thực sự muốn xóa hết?')) {
      // Xóa hàng loạt trên Firestore
      const msgsRef = db.collection('users').doc(currentUser.uid).collection('messages');
      const snapshot = await msgsRef.get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      
      const msgs = chatArea.querySelectorAll('.msg-group');
      msgs.forEach(m => m.remove());
      chatHistory = [];
      showWelcome();
    }
  }
});

function showWelcome() {
  if(document.getElementById('welcome-msg')) return;
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.id = 'welcome-msg';
  welcome.innerHTML = `
    <div class="welcome-icon">🤖</div>
    <h2>Xin chào!</h2>
    <p>Tôi là trợ lý AI của bạn.<br>
    Hãy nhắn lệnh hoặc đặt câu hỏi.<br>
    Ví dụ: <em>"Thêm GSC cho abc.com"</em></p>
  `;
  chatArea.insertBefore(welcome, typingIndicator);
}

// ===== PUSH NOTIFICATIONS =====
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) return;

    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(CONFIG.vapidPublicKey)
    });

    await fetch(CONFIG.pushServerUrl + '/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
    console.log('✅ Push notification đã đăng ký!');
  } catch(e) {
    console.log('Push sub error:', e.message);
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    subscribePush();
    return;
  }
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') subscribePush();
  }
}

// ===== INIT =====
function init() {
  // Register service worker + push
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('SW registered');
      setTimeout(() => requestNotificationPermission(), 3000);
    }).catch(() => {});

    // Lắng nghe tín hiệu báo lỗi từ Service Worker (do n8n Push về)
    navigator.serviceWorker.addEventListener('message', async event => {
      if (event.data && event.data.type === 'push_received') {
        const payload = event.data.data;
        // Nếu là báo lỗi (isError) và user đang đăng nhập
        if (payload.isError && currentUser) {
          try {
            await db.collection('users').doc(currentUser.uid).collection('messages').add({
              role: 'assistant',
              content: `❌ **LỖI HỆ THỐNG:**\n\n${payload.body}`,
              time: getTimeStr(),
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
          } catch(e) { console.error('Lỗi ghi log:', e); }
        }
      }
    });
  }

  msgInput.focus();
}

window.onload = init;
