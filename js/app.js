// ===== CONFIG =====
const CONFIG = {
  webhookUrl: localStorage.getItem('webhookUrl') || 'https://103.82.195.87/webhook/ai-orchestrator',
  // n8n VPS: 103.82.195.87 | WFL1 ID: EQ0tkGzUdSQX16bu | WFL2 ID: wwM3d54FCIhOo5MB
  botName: 'Trợ lý AI',
};

// ===== STATE =====
let chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
let isProcessing = false;

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

  // Add to history
  chatHistory.push({ role: 'user', content: text });
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

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
        source: 'pwa-app'
      })
    });

    hideTyping();

    if (!response.ok) throw new Error(`Lỗi server: ${response.status}`);

    const data = await response.json();
    const reply = data.result || data.message || data.output || JSON.stringify(data);

    appendMessage('ai', reply, getTimeStr());
    chatHistory.push({ role: 'assistant', content: reply });
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));

  } catch (err) {
    hideTyping();
    const errMsg = err.message.includes('Failed to fetch')
      ? '⚠️ Không kết nối được tới server. Vui lòng kiểm tra:\n1. VPS đang chạy\n2. URL webhook trong Cài đặt\n3. Đã chấp nhận cert SSL chưa?'
      : `❌ Lỗi: ${err.message}`;
    appendMessage('ai', errMsg, getTimeStr());
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
  if (confirm('Xóa toàn bộ lịch sử hội thoại?')) {
    chatHistory = [];
    localStorage.removeItem('chatHistory');
    const msgs = chatArea.querySelectorAll('.msg-group');
    msgs.forEach(m => m.remove());
    showWelcome();
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

// ===== INIT =====
function init() {
  renderQuickActions();

  // Restore chat history
  if (chatHistory.length === 0) {
    showWelcome();
  } else {
    chatHistory.forEach(msg => {
      appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.content, '');
    });
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  msgInput.focus();
}

init();
