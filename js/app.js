// ===== CONFIG =====
const CONFIG = {
  webhookUrl: localStorage.getItem('webhookUrl') || 'https://103.82.195.87/webhook/ai-orchestrator',
  pushServerUrl: 'https://103.82.195.87/push',
  vapidPublicKey: 'BB7YphPy5ZbDpecs8B9lhOnLoAQ7aSTHEUKVhxV7PH8ZITMSf0pTwYvi9SBh794p-E3GNyyiP4DJPb4iQHYogmI',
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

    // Request push notification permission after login (not on page load)
    setTimeout(() => requestNotificationPermission(), 2000);
  } else {
    currentUser = null;
    loginOverlay.style.display = 'flex';
    chatHistory = [];
    userSkills = [];
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeSkills) unsubscribeSkills();
  }
});

document.getElementById('login-google-btn').addEventListener('click', async () => {
  const btn = document.getElementById('login-google-btn');
  btn.disabled = true;
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    btn.disabled = false;
    if (err.code === 'auth/popup-blocked') {
      // Chrome blocked the popup — show instructions
      const msg = document.createElement('div');
      msg.style.cssText = 'margin-top:12px;padding:10px 14px;background:#ff4d4f22;border:1px solid #ff4d4f66;border-radius:8px;color:#ff8080;font-size:13px;line-height:1.6;text-align:left';
      msg.innerHTML = '🚫 <strong>Chrome đã chặn popup!</strong><br>Nhìn lên thanh địa chỉ → click icon 🔒 hoặc 🚫 → chọn <strong>"Luôn cho phép popup"</strong> → Thử lại.';
      const existing = document.getElementById('popup-warning');
      if (existing) existing.remove();
      msg.id = 'popup-warning';
      btn.parentNode.insertBefore(msg, btn.nextSibling);
    } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      console.error('Login error:', err.code, err.message);
    }
  }
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
    .replace(/`(.*?)`/g, '<code style="background:#2a2a4a;padding:1px 6px;border-radius:4px;font-size:13px;white-space:normal">$1</code>')
    .replace(/✅|🎉/g, '<span style="font-size:16px">$&</span>');
    // Không cần replace \n→<br> vì CSS white-space:pre-wrap xử lý rồi
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

// ===== GSC EMAIL SELECTOR =====
const GSC_REGISTRY_URL = 'https://103.82.195.87/webhook/get-gsc-emails';

function detectGscIntent(text) {
  return /th[eê]m\s*(gsc|google search console|search console)/i.test(text) ||
         /add\s*(gsc|google search console)/i.test(text) ||
         /(gsc|search console).*(domain|web|site)/i.test(text);
}

function detectEmailListIntent(text) {
  return /(email|gmail|tài khoản).*(sẵn sàng|khả dụng|có thể|dùng|thêm gsc)/i.test(text) ||
         /(sẵn sàng|khả dụng).*(email|gmail)/i.test(text) ||
         /email nào.*(thêm|add|gsc)/i.test(text) ||
         /các email/i.test(text) ||
         /list.*email/i.test(text);
}

function extractDomain(text) {
  const m = text.match(/https?:\/\/[^\s,]+/i) || text.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/i);
  return m ? m[0] : null;
}

async function fetchAvailableEmails() {
  try {
    const res = await fetch(GSC_REGISTRY_URL, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.emails || [];
  } catch(e) {
    return [];
  }
}

function showEmailSelector(domain, emails, originalText) {
  // Xóa selector cũ nếu có
  document.getElementById('gsc-email-selector')?.remove();

  const group = document.createElement('div');
  group.className = 'msg-group assistant';
  group.id = 'gsc-email-selector';

  let content = '';
  if (emails.length === 0) {
    content = `
      <div class="bubble" style="max-width:340px">
        <div style="font-weight:600;margin-bottom:8px">🔍 Thêm GSC cho <code style="background:#2a2a4a;padding:2px 6px;border-radius:4px;font-size:12px">${domain || 'domain'}</code></div>
        <div style="color:#ff8080;margin-bottom:10px">⚠️ Hiện tại không có email Google nào khả dụng.</div>
        <div style="color:#aaa;font-size:13px;line-height:1.6">→ Mở Chrome → vào <strong>search.google.com/search-console</strong><br>→ Extension sẽ tự động đồng bộ cookie.</div>
      </div>`;
  } else {
    const chips = emails.map(e => {
      const ago = e.minutesAgo < 60 ? `${e.minutesAgo}ph` : `${Math.round(e.minutesAgo/60)}h`;
      return `<button onclick="selectGscEmail('${e.email}','${originalText.replace(/'/g,'\\\'')}')" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#1a1a3e,#2a2a5e);border:1px solid #4facfe55;border-radius:20px;color:#e0e0ff;padding:8px 14px;cursor:pointer;font-size:13px;margin:4px;transition:all 0.2s" onmouseover="this.style.borderColor='#4facfe';this.style.background='linear-gradient(135deg,#2a2a5e,#3a3aff44)'" onmouseout="this.style.borderColor='#4facfe55';this.style.background='linear-gradient(135deg,#1a1a3e,#2a2a5e)'">
        <span>📧</span><span>${e.email}</span><span style="color:#4facfe;font-size:11px">${ago} trước</span>
      </button>`;
    }).join('');
    content = `
      <div class="bubble" style="max-width:400px">
        <div style="font-weight:600;margin-bottom:8px">🔍 Thêm GSC cho <code style="background:#2a2a4a;padding:2px 6px;border-radius:4px;font-size:12px">${domain || 'domain'}</code></div>
        <div style="color:#aaa;font-size:13px;margin-bottom:10px">Chọn email Google để đăng nhập GSC:</div>
        <div style="display:flex;flex-wrap:wrap;gap:2px">${chips}</div>
      </div>`;
  }

  group.innerHTML = `<div class="msg-row"><div class="msg-avatar">🤖</div>${content}</div><div class="msg-time">${getTimeStr()}</div>`;
  chatArea.insertBefore(group, typingIndicator);
  scrollToBottom();
}

window.selectGscEmail = function(email, originalText) {
  // Xóa selector
  document.getElementById('gsc-email-selector')?.remove();
  // Chỉ gửi email — không ghép câu hỏi gốc vào
  msgInput.value = email;
  autoResize();
  sendMessage();
};

// ===== SEND MESSAGE =====
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || isProcessing || !currentUser) return;

  // ===== GSC EMAIL INTERCEPT (không cần AI, xử lý ngay) =====
  const isGscAdd = detectGscIntent(text) && !text.includes('@');
  const isEmailListQuery = detectEmailListIntent(text) && !text.includes('@');

  if (isGscAdd || isEmailListQuery) {
    const domain = isGscAdd ? extractDomain(text) : null;
    msgInput.value = '';
    autoResize();
    // Hiện tin nhắn user trước
    await db.collection('users').doc(currentUser.uid).collection('messages').add({
      role: 'user', content: text, time: getTimeStr(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Lấy danh sách email khả dụng
    showTyping();
    const emails = await fetchAvailableEmails();
    hideTyping();
    showEmailSelector(domain, emails, text);
    return;
  }

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

  // ===== CLIENT-SIDE SKILL DETECTION (không cần chờ n8n) =====
  const skillMatch = text.match(/^(?:học kỹ năng(?: mới)?|dạy kỹ năng|ghi nhớ kỹ năng)[:\-]\s*(.+)/is);
  if (skillMatch && currentUser) {
    const rawSkill = skillMatch[1].trim();
    showTyping();

    // === Normalize skill qua Groq để tránh hiểu nhầm ===
    let skillContent = rawSkill;
    let skillName = rawSkill.length > 40 ? rawSkill.substring(0, 40) + '...' : rawSkill;
    try {
      const webhookUrl = localStorage.getItem('webhookUrl') || CONFIG.webhookUrl;
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10000);
      const normRes = await fetch(webhookUrl, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Hãy diễn đạt lại yêu cầu sau thành 1 câu instruction rõ ràng, cụ thể, không mơ hồ để AI luôn hiểu đúng (chỉ trả về câu instruction, không giải thích): "${rawSkill}"`,
          history: [], skills: [], mode: 'normal',
          source: 'skill-normalize'
        })
      });
      if (normRes.ok) {
        const normData = await normRes.json();
        const normalized = (normData.result || '').trim().replace(/^["']|["']$/g, '');
        if (normalized && normalized.length > 5 && normalized.length < 300) {
          skillContent = normalized;
          skillName = normalized.length > 40 ? normalized.substring(0, 40) + '...' : normalized;
        }
      }
    } catch(e) { /* normalize thất bại → dùng raw skill */ }

    hideTyping();
    try {
      await db.collection('users').doc(currentUser.uid).collection('skills').add({
        name: skillName,
        content: skillContent,
        original: rawSkill, // Lưu bản gốc để tham khảo
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      await db.collection('users').doc(currentUser.uid).collection('messages').add({
        role: 'assistant',
        content: `✅ **Đã học kỹ năng mới!**\n\n📝 **Bản gốc:** "${rawSkill}"\n🎯 **Đã chuẩn hóa thành:** "${skillContent}"\n\nTôi sẽ áp dụng chính xác trong các câu trả lời sau.`,
        time: getTimeStr(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      await db.collection('users').doc(currentUser.uid).collection('messages').add({
        role: 'assistant', content: `❌ Lỗi lưu kỹ năng: ${e.message}`,
        time: getTimeStr(), timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    isProcessing = false; sendBtn.disabled = false; msgInput.focus();
    return;
  }



  // Nếu đang ở CHẾ ĐỘ HỌC TẬP -> Đẩy thẳng lên Qdrant, KHÔNG hỏi AI
  if (currentMode === 'learning') {
    isProcessing = true;
    showTyping();
    try {
      const textBlob = new Blob([text], { type: 'text/plain' });
      const textFile = new File([textBlob], `KienThucNhanh_${Date.now()}.txt`);
      const formData = new FormData();
      formData.append('data', textFile);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const res = await fetch('https://103.82.195.87/webhook/upload-docs', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeout);
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
    const ctrl = new AbortController();
    const wt = setTimeout(() => ctrl.abort(), 30000); // 30s timeout

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
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
        const savePromise = db.collection('users').doc(currentUser.uid).collection('skills').add({
          name: data.tool_args.skill_name || 'Kỹ năng mới',
          content: data.tool_args.instructions || '',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000));
        await Promise.race([savePromise, timeoutPromise]);
        reply = `✅ **Đã ghi nhớ kỹ năng mới:** ${data.tool_args.skill_name}`;
      } catch (err) {
        reply = err.message === 'timeout'
          ? `⚠️ **Lưu kỹ năng chậm** — sẽ thử lại lần sau. AI đã nhớ trong phiên này.`
          : `❌ Lỗi khi lưu kỹ năng: ${err.message}`;
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

// ===== NOTIFICATION BELL BUTTON =====
function updateBellUI() {
  const icon = document.getElementById('notif-bell-icon');
  const label = document.getElementById('notif-bell-label');
  const btn = document.getElementById('notif-bell-btn');
  if (!icon || !label) return;
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  if (perm === 'granted') {
    icon.textContent = '🔔';
    label.textContent = 'Thông báo — Đang BẬT';
    label.style.color = '#00b96b';
    btn.style.opacity = '1';
  } else if (perm === 'denied') {
    icon.textContent = '🔕';
    label.textContent = 'Thông báo — Bị chặn';
    label.style.color = '#ff4d4f';
    btn.style.opacity = '0.8';
  } else {
    icon.textContent = '🔔';
    label.textContent = 'Thông báo — Chưa bật';
    label.style.color = '#ffa940';
    btn.style.opacity = '0.9';
  }
}

function initBellBtn() {
  const bellBtn = document.getElementById('notif-bell-btn');
  if (!bellBtn) return;

  updateBellUI();

  bellBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); // Giữ dropdown mở khi click
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';

    if (perm === 'granted') {
      showBellToast('🔔 Thông báo đang BẬT', 'Bạn sẽ nhận được cảnh báo từ hệ thống kể cả khi thu nhỏ app.', '#00b96b');
    } else if (perm === 'denied') {
      showBellToast('🔕 Thông báo đang BỊ CHẶN', 'Vào thanh địa chỉ → click 🔒 → Site settings → Notifications → chọn Allow → Reload trang.', '#ff4d4f');
    } else if (perm === 'unsupported') {
      showBellToast('⚠️ Không hỗ trợ', 'Trình duyệt này không hỗ trợ push notification.', '#ffa940');
    } else {
      const result = await Notification.requestPermission();
      updateBellUI();
      if (result === 'granted') {
        await subscribePush();
        showBellToast('🔔 Đã bật thông báo!', 'Bạn sẽ nhận được cảnh báo từ hệ thống ngay cả khi thu nhỏ app.', '#00b96b');
      } else {
        showBellToast('🔕 Đã từ chối', 'Vào Site Settings → Notifications → Allow để bật lại.', '#ff4d4f');
      }
    }
  });
}

function showBellToast(title, msg, color) {
  const existing = document.getElementById('bell-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'bell-toast';
  toast.style.cssText = `position:fixed;top:70px;right:12px;z-index:9999;background:#1a1a2e;border:1px solid ${color}55;border-left:3px solid ${color};border-radius:10px;padding:12px 16px;max-width:280px;box-shadow:0 8px 24px #0008;animation:fadeInUp 0.2s ease`;
  toast.innerHTML = `<div style="font-weight:600;color:${color};margin-bottom:4px;font-size:13px">${title}</div><div style="color:#aaa;font-size:12px;line-height:1.5">${msg}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
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

    // Include uid so n8n can target specific user
    const subData = sub.toJSON();
    subData.uid = currentUser?.uid || 'unknown';
    await fetch(CONFIG.pushServerUrl + '/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subData)
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
      // Permission request moved to after login
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
  initBellBtn();
}

window.onload = init;
