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

// ===== DOM REFS =====
const chatArea = document.getElementById('chat-area');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const settingsOverlay = document.getElementById('settings-overlay');
const loginOverlay = document.getElementById('login-overlay');
const logoutBtn = document.getElementById('logout-btn');

// ===== AUTH STATE CHANGED =====
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    loginOverlay.style.display = 'none';
    logoutBtn.style.display = 'block';
    
    // Cập nhật Header
    document.getElementById('user-name').textContent = user.displayName || 'Trợ lý AI';
    if(user.photoURL) document.getElementById('user-avatar').innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    document.getElementById('user-status').textContent = 'Đã đồng bộ • Online';
    
    userSettings.name = user.displayName;
    saveSettings();

    loadMessages();
  } else {
    currentUser = null;
    loginOverlay.style.display = 'flex';
    logoutBtn.style.display = 'none';
    chatHistory = [];
    if (unsubscribeMessages) unsubscribeMessages();
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
        appendMessage(data.role, data.content, data.time);
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
        timestamp: new Date().toISOString(),
        source: 'pwa-app',
        userName: userSettings.name 
      })
    });

    hideTyping();

    if (!response.ok) throw new Error(`Lỗi server: ${response.status}`);

    const data = await response.json();
    const reply = data.result || data.message || data.output || JSON.stringify(data);

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

// ===== SETTINGS =====
document.getElementById('settings-btn').addEventListener('click', () => {
  document.getElementById('setting-webhook').value = localStorage.getItem('webhookUrl') || CONFIG.webhookUrl;
  settingsOverlay.classList.add('show');
});

document.getElementById('settings-overlay').addEventListener('click', e => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove('show');
});

document.getElementById('settings-close').addEventListener('click', () => {
  settingsOverlay.classList.remove('show');
});

document.getElementById('save-settings').addEventListener('click', () => {
  const url = document.getElementById('setting-webhook').value.trim();
  if (url) {
    localStorage.setItem('webhookUrl', url);
    settingsOverlay.classList.remove('show');
    // Save system message directly to UI
    appendMessage('assistant', '✅ Đã lưu cài đặt! Webhook URL đã được cập nhật.', getTimeStr());
  }
});

// ===== CLEAR CHAT =====
document.getElementById('clear-btn').addEventListener('click', async () => {
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
