// ===== CONFIG =====
const CONFIG = {
  webhookUrl: localStorage.getItem('webhookUrl') || 'https://103.82.195.87/webhook/ai-orchestrator',
  pushServerUrl: 'https://103.82.195.87/push',
  vapidPublicKey: 'BNpXnlHm5tfuilpDZLBu5x-2brayp_XvSbYwFXBbAy36UlcSQQOl263zxQ2jeq8oIJbN1FvUK0uyVPngPIlp7Ew',
  botName: 'Trợ lý AI',
};

// ===== USER SETTINGS =====
const userSettings = JSON.parse(localStorage.getItem('userSettings') || '{"name":"Chủ hệ thống"}');
function saveSettings() { localStorage.setItem('userSettings', JSON.stringify(userSettings)); }

// ===== STATE =====
let chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
let isProcessing = false;

// Lưu lịch sử ngay lập tức - gọi sau mỗi thay đổi
function saveHistory() {
  try {
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
  } catch(e) {
    // localStorage đầy, xóa tin cũ nhất
    if (chatHistory.length > 50) chatHistory = chatHistory.slice(-50);
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
  }
}

// ===== DOM REFS =====
const chatArea = document.getElementById('chat-area');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const settingsOverlay = document.getElementById('settings-overlay');

// ===== QUICK ACTIONS =====
const QUICK_ACTIONS = [
  { icon: '🔍', label: 'Kiểm tra GSC', msg: 'Kiểm tra trạng thái GSC cho tất cả domain trong danh sách' },
  { icon: '✅', label: 'Thêm GSC', msg: 'Thêm GSC cho ' },
  { icon: '🗺️', label: 'Nộp Sitemap', msg: 'Nộp sitemap cho ' },
  { icon: '📝', label: 'Viết bài SEO', msg: 'Viết bài SEO về chủ đề: ' },
  { icon: '📊', label: 'Báo cáo', msg: 'Báo cáo tổng hợp hôm nay' },
];

function renderQuickActions() {
  const container = document.getElementById('quick-actions');
  container.innerHTML = QUICK_ACTIONS.map((a, i) =>
    `<button class="quick-btn" onclick="useQuickAction(${i})"><span>${a.icon}</span>${a.label}</button>`
  ).join('');
}

function useQuickAction(i) {
  const action = QUICK_ACTIONS[i];
  msgInput.value = action.msg;
  msgInput.focus();
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.quick-btn')[i].classList.add('active');
  autoResize();
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
  // Convert markdown-like formatting
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
  if (!text || isProcessing) return;

  isProcessing = true;
  sendBtn.disabled = true;
  msgInput.value = '';
  autoResize();
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));

  // Show user message
  const timeStr = getTimeStr();
  appendMessage('user', text, timeStr);

  // Lưu tin nhắn user ngay lập tức
  chatHistory.push({ role: 'user', content: text, time: timeStr });
  saveHistory(); // ← lưu ngay, không chờ AI

  // Show typing
  showTyping();

  try {
    const webhookUrl = localStorage.getItem('webhookUrl') || CONFIG.webhookUrl;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(-10),
        timestamp: new Date().toISOString(),
        source: 'pwa-app',
        userName: userSettings.name  // ← gửi tên user cho AI
      })
    });

    hideTyping();

    if (!response.ok) throw new Error(`Lỗi server: ${response.status}`);

    const data = await response.json();
    const reply = data.result || data.message || data.output || JSON.stringify(data);

    const aiTime = getTimeStr();
    appendMessage('ai', reply, aiTime);
    chatHistory.push({ role: 'assistant', content: reply, time: aiTime });
    saveHistory(); // ← lưu sau khi AI trả lời

  } catch (err) {
    hideTyping();
    // Lịch sử user message đã được lưu trước đó (saveHistory đã gọi)
    // Chỉ thông báo lỗi, KHÔNG xóa lịch sử
    const errMsg = err.message.includes('Failed to fetch') || err.message.includes('NetworkError')
      ? '⚠️ Không kết nối được tới server.\n\n👉 Vui lòng mở tab mới, vào **https://103.82.195.87** và bấm **Advanced → Proceed** để chấp nhận SSL cert, rồi thử lại.'
      : `❌ Lỗi: ${err.message}`;
    appendMessage('ai', errMsg, getTimeStr());
    // Không lưu tin nhắn lỗi vào history
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
    appendMessage('ai', '✅ Đã lưu cài đặt! Webhook URL đã được cập nhật.', getTimeStr());
  }
});

// ===== CLEAR CHAT =====
document.getElementById('clear-btn').addEventListener('click', () => {
  // Yêu cầu xác nhận 2 lần để tránh xóa nhầm
  if (confirm('⚠️ Bạn muốn xóa toàn bộ lịch sử hội thoại?\n\nHành động này không thể hoàn tác!')) {
    if (confirm('Xác nhận lần 2: Thực sự muốn xóa hết?')) {
      chatHistory = [];
      localStorage.removeItem('chatHistory');
      const msgs = chatArea.querySelectorAll('.msg-group');
      msgs.forEach(m => m.remove());
      showWelcome();
    }
  }
});

function showWelcome() {
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
    if (sub) return; // Đã đăng ký rồi

    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(CONFIG.vapidPublicKey)
    });

    // Gửi subscription lên push server
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
  renderQuickActions();

  // Khôi phục lịch sử chat từ localStorage
  if (chatHistory.length === 0) {
    showWelcome();
  } else {
    chatHistory.forEach(msg => {
      const role = msg.role === 'user' ? 'user' : 'ai';
      appendMessage(role, msg.content, msg.time || '');
    });
    // Scroll xuống tin mới nhất
    setTimeout(() => scrollToBottom(), 100);
  }

  // Register service worker + push
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('SW registered');
      // Hỏi xin quyền notification sau 3 giây (không hỏi ngay khi vào)
      setTimeout(() => requestNotificationPermission(), 3000);
    }).catch(() => {});
  }

  msgInput.focus();
}

init();
