(function () {
    const initEliteWidget = async () => {
        if (document.getElementById('ai-chat-wrapper')) return;

        const script = document.getElementById('elite-ai-script');
        if (!script) return;

        const BASE = 'https://cdn.jsdelivr.net/gh/ThangRai/elite-widget@main/';
        const userToken = script.getAttribute('data-token');
        const apiPath   = script.getAttribute('data-api');

        // ── Load assets ───────────────────────────────────────────────
        [
            { type: 'link',   rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css' },
            { type: 'link',   rel: 'stylesheet', href: BASE + 'widget-style.css' },
            { type: 'script', src: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js' },
            { type: 'script', src: 'https://cdn.jsdelivr.net/npm/emoji-mart@latest/dist/browser.js' }
        ].forEach(a => {
            const el = document.createElement(a.type);
            if (a.type === 'link') { el.rel = a.rel; el.href = a.href; }
            else el.src = a.src;
            document.head.appendChild(el);
        });

        // ── Load config từ DB ─────────────────────────────────────────
        const DEFAULT_CFG = {
            bot_name:                'Elite AI Assistant',
            bot_status:              'Online',
            bot_tooltip:             'Chào bạn! Cần Elite AI hỗ trợ gì không? ✨',
            bot_welcome:             'Chào bạn! Elite AI đã sẵn sàng hỗ trợ bạn.',
            bot_icon_type:           'fa',
            bot_icon_value:          'fa-brain',
            bot_launcher_icon_type:  'fa',
            bot_launcher_icon_value: 'fa-robot',
            bot_color:               '#7ee787',
        };

        let cfg = { ...DEFAULT_CFG };

        try {
            const res = await fetch(BASE + 'widget_config_bot.php?token=' + encodeURIComponent(userToken), {
                method: 'GET',
                cache:  'default'
            });
            if (res.ok) {
                const data = await res.json();
                cfg = { ...DEFAULT_CFG, ...data };
            }
        } catch (e) {
            // Không load được config → dùng mặc định, widget vẫn chạy bình thường
            console.warn('[EliteWidget] Không tải được config, dùng mặc định.');
        }

        // ── Helper render icon ────────────────────────────────────────
        const renderIcon = (type, value, size) => {
            if (type === 'image' && value) {
                return `<img src="${value}" alt="bot"
                    style="width:${size};height:${size};border-radius:50%;object-fit:cover;display:block;">`;
            }
            return `<i class="fas ${value || 'fa-robot'}"></i>`;
        };

        // ── Apply brand color vào CSS variable ────────────────────────
        document.documentElement.style.setProperty('--elite-color', cfg.bot_color);

        // ── Session ID ────────────────────────────────────────────────
        if (!sessionStorage.getItem('elite_chat_session_id')) {
            sessionStorage.setItem('elite_chat_session_id',
                'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
        }
        const currentSessionId = sessionStorage.getItem('elite_chat_session_id');

        // ── Lịch sử chat ─────────────────────────────────────────────
        const HISTORY_KEY = 'elite_chat_history_' + currentSessionId;
        let chatHistory = [];
        try { chatHistory = JSON.parse(sessionStorage.getItem(HISTORY_KEY)) || []; } catch (e) { chatHistory = []; }

        const saveHistory = () => {
            try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory.slice(-60))); } catch (e) {}
        };

        // ── Rate limit phía client ────────────────────────────────────
        let msgTimestamps = [];
        const RATE_LIMIT  = 10;
        const RATE_WINDOW = 60 * 1000;

        const isRateLimited = () => {
            const now = Date.now();
            msgTimestamps = msgTimestamps.filter(t => now - t < RATE_WINDOW);
            return msgTimestamps.length >= RATE_LIMIT;
        };

        // ── Âm thanh ─────────────────────────────────────────────────
        const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
        notificationSound.volume = 1.0;

        // ── Render HTML với config động ───────────────────────────────
        const wrapper = document.createElement('div');
        wrapper.id = 'ai-chat-wrapper';
        wrapper.innerHTML = `
            <div id="chat-tooltip" class="chat-tooltip-hidden">
                ${cfg.bot_tooltip}
                <div class="tooltip-arrow"></div>
            </div>

            <button id="chat-launcher" class="btn-elite-chat">
                ${renderIcon(cfg.bot_launcher_icon_type, cfg.bot_launcher_icon_value, '22px')}
                <span class="chat-badge">AI</span>
            </button>

            <div id="chat-window">
                <div class="chat-header">
                    <div style="display:flex;align-items:center;flex-grow:1;">
                        <div class="bot-avatar">
                            ${renderIcon(cfg.bot_icon_type, cfg.bot_icon_value, '28px')}
                        </div>
                        <div style="margin-left:10px;">
                            <h6 style="margin:0;color:white;font-size:14px;">${cfg.bot_name}</h6>
                            <small style="color:${cfg.bot_color};font-size:11px;">
                                <i class="fas fa-circle" style="font-size:7px;"></i> ${cfg.bot_status}
                            </small>
                        </div>
                    </div>
                    <div class="chat-controls">
                        <button id="refresh-chat" title="Làm mới"><i class="fas fa-sync-alt"></i></button>
                        <button id="expand-chat"  title="Toàn màn hình"><i class="fas fa-expand-alt"></i></button>
                        <button id="close-chat" style="font-size:20px;">&times;</button>
                    </div>
                </div>

                <div id="chat-body" class="chat-body"></div>

                <div class="chat-footer">
                    <div class="chat-toolbar" style="display:flex;gap:18px;padding:6px 12px;background:rgba(255,255,255,0.03);border-top:1px solid #30363d;justify-content:space-around;">
                        <button id="btn-emoji"         title="Emoji"            style="background:unset;width:unset;height:unset;"><i class="far fa-smile"></i></button>
                        <button id="btn-map"           title="Địa chỉ"          style="background:unset;width:unset;height:unset;"><i class="fas fa-map-marker-alt"></i></button>
                        <button id="btn-call"          title="Gọi ngay"         style="background:unset;width:unset;height:unset;"><i class="fas fa-phone-volume"></i></button>
                        <button id="btn-send-phone"    title="Để lại thông tin" style="background:unset;width:unset;height:unset;"><i class="fas fa-address-card"></i></button>
                        <button id="btn-contact-human" title="Gặp tư vấn viên" style="background:unset;width:unset;height:unset;"><i class="fas fa-user-tie"></i></button>
                        <button id="btn-price"         title="Bảng giá"         style="background:unset;width:unset;height:unset;"><i class="fas fa-tags"></i></button>
                    </div>

                    <div style="display:flex;align-items:center;padding:10px;position:relative;">
                        <input type="text" id="user-input" placeholder="Nhập tin nhắn..." autocomplete="off" style="flex-grow:1;">
                        <button id="send-msg" style="margin-left:8px;background:${cfg.bot_color};">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>

                    <div id="emoji-picker-container" style="display:none;position:absolute;bottom:110px;right:10px;z-index:9999;"></div>
                    <div style="text-align:center;padding:2px 0 8px;font-size:10px;opacity:0.5;color:white;font-family:sans-serif;">
                        Powered by <span style="font-weight:bold;color:${cfg.bot_color};">ThangWeb AI</span>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(wrapper);

        const windowChat = document.getElementById('chat-window');
        const input      = document.getElementById('user-input');
        const body       = document.getElementById('chat-body');

        // ── Render markdown an toàn ───────────────────────────────────
        const renderMarkdown = (text) => {
            if (typeof marked === 'undefined') return text.replace(/\n/g, '<br>');
            marked.setOptions({ breaks: true, gfm: true });
            const html = marked.parse(text);
            const div = document.createElement('div');
            div.innerHTML = html;
            div.querySelectorAll('a').forEach(a => {
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
                a.style.cssText = `color:${cfg.bot_color};text-decoration:underline;cursor:pointer;`;
            });
            return div.innerHTML;
        };

        // ── Thêm tin nhắn vào giao diện ──────────────────────────────
        const now = () => {
            const d = new Date();
            return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        };

        const appendMessage = (text, className, isMarkdown = false, time = null, save = true, isHTML = false) => {
            const t = time || now();
            const msgDiv  = document.createElement('div');
            msgDiv.className = className;

            const content = document.createElement('div');
            content.className = 'msg-content';
            if (isHTML) {
                content.innerHTML = text;
            } else if (isMarkdown) {
                content.innerHTML = renderMarkdown(text);
                content.querySelectorAll('pre code').forEach(block => {
                    block.style.cssText = 'display:block;background:#0d1117;padding:10px;border-radius:6px;overflow-x:auto;font-size:12px;';
                });
                content.querySelectorAll('a').forEach(a => {
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener noreferrer');
                    a.style.cssText = `color:${cfg.bot_color};text-decoration:underline;cursor:pointer;`;
                });
            } else {
                content.innerText = text;
            }

            const footer = document.createElement('div');
            footer.style.cssText = 'display:flex;align-items:center;justify-content:' +
                (className === 'user-msg' ? 'flex-end' : 'space-between') + ';margin-top:5px;gap:8px;';

            const timeTag = document.createElement('small');
            timeTag.style.cssText = 'font-size:9px;opacity:0.6;';
            timeTag.innerText = t;
            footer.appendChild(timeTag);

            if (className === 'ai-msg') {
                const copyBtn = document.createElement('button');
                copyBtn.title = 'Sao chép';
                copyBtn.style.cssText = `background:none;border:none;cursor:pointer;color:${cfg.bot_color};font-size:11px;padding:0 4px;opacity:0.7;`;
                copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                copyBtn.onclick = () => {
                    const plain = content.innerText || content.textContent;
                    navigator.clipboard.writeText(plain).then(() => {
                        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => { copyBtn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
                    });
                };
                footer.appendChild(copyBtn);
            }

            msgDiv.appendChild(content);
            msgDiv.appendChild(footer);
            body.appendChild(msgDiv);
            body.scrollTop = body.scrollHeight;

            if (save) {
                chatHistory.push({ text, className, isMarkdown, isHTML, time: t });
                saveHistory();
            }

            return msgDiv;
        };

        // ── Khôi phục lịch sử ─────────────────────────────────────────
        const restoreHistory = () => {
            if (chatHistory.length > 0) {
                chatHistory.forEach(m => appendMessage(m.text, m.className, m.isMarkdown, m.time, false, m.isHTML || false));
            } else {
                // Dùng welcome message từ config DB
                appendMessage(cfg.bot_welcome, 'ai-msg', false, now(), true);
            }
        };

        const waitForMarked = (callback, tries = 0) => {
            if (typeof marked !== 'undefined') callback();
            else if (tries < 30) setTimeout(() => waitForMarked(callback, tries + 1), 100);
            else callback();
        };

        waitForMarked(restoreHistory);

        // ── Typing indicator ──────────────────────────────────────────
        const showTyping = () => {
            const id = 'typing-' + Date.now();
            const div = document.createElement('div');
            div.className = 'ai-msg typing-indicator';
            div.id = id;
            div.innerHTML = '<span></span><span></span><span></span>';
            body.appendChild(div);
            body.scrollTop = body.scrollHeight;
            return id;
        };

        // ── Quick replies ─────────────────────────────────────────────
        const showQuickReplies = (suggestions) => {
            if (!suggestions || !suggestions.length) return;
            const existing = document.getElementById('quick-replies-box');
            if (existing) existing.remove();

            const box = document.createElement('div');
            box.id = 'quick-replies-box';
            box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;';

            suggestions.forEach(s => {
                const btn = document.createElement('button');
                btn.style.cssText = `font-size:11px;padding:4px 10px;border:1px solid #30363d;border-radius:12px;background:transparent;color:${cfg.bot_color};cursor:pointer;white-space:nowrap;`;
                btn.innerText = s;
                btn.onclick = () => { box.remove(); handleSend(s); };
                box.appendChild(btn);
            });

            body.appendChild(box);
            body.scrollTop = body.scrollHeight;
        };

        const defaultSuggestions = [
            'Cho tôi xem bảng giá',
            'Liên hệ tư vấn viên',
            'Hướng dẫn đăng ký Chatbot',
            'Tìm hiểu thêm về dịch vụ'
        ];

        // ── Gửi tin nhắn ─────────────────────────────────────────────
        let isSending = false;

        const handleSend = async (customText = null) => {
            if (isSending) return;

            const text = customText || input.value.trim();
            if (!text) return;

            if (isRateLimited()) {
                appendMessage('⚠️ Bạn đang gửi quá nhanh. Vui lòng chờ một chút!', 'ai-msg');
                return;
            }

            if (!customText) input.value = '';
            document.getElementById('emoji-picker-container').style.display = 'none';

            const qr = document.getElementById('quick-replies-box');
            if (qr) qr.remove();

            appendMessage(text, 'user-msg', false);
            msgTimestamps.push(Date.now());

            isSending = true;
            document.getElementById('send-msg').disabled = true;

            const typingId = showTyping();

            try {
                const response = await fetch(apiPath, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text, token: userToken, session_id: currentSessionId })
                });

                document.getElementById(typingId)?.remove();
                if (!response.ok) throw new Error('HTTP ' + response.status);

                const data = await response.json();
                notificationSound.play().catch(() => {});

                const reply     = data.choices?.[0]?.message?.content || 'AI đang bận, vui lòng thử lại!';
                const replyTime = data.choices?.[0]?.message?.time    || now();

                appendMessage(reply, 'ai-msg', true, replyTime);

                const suggestions = data.suggestions || defaultSuggestions;
                showQuickReplies(suggestions);

            } catch (e) {
                document.getElementById(typingId)?.remove();
                try {
                    const retry = await fetch(apiPath, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: text, token: userToken, session_id: currentSessionId })
                    });
                    const data  = await retry.json();
                    const reply = data.choices?.[0]?.message?.content || 'Lỗi kết nối!';
                    appendMessage(reply, 'ai-msg', true);
                } catch (e2) {
                    appendMessage('❌ Mất kết nối. Vui lòng thử lại sau.', 'ai-msg');
                }
            } finally {
                isSending = false;
                document.getElementById('send-msg').disabled = false;
            }
        };

        // ── Toolbar buttons ───────────────────────────────────────────
        document.getElementById('btn-emoji').onclick = (e) => {
            e.stopPropagation();
            const container = document.getElementById('emoji-picker-container');
            if (container.style.display === 'none') {
                container.style.display = 'block';
                if (!container.innerHTML) {
                    const picker = new EmojiMart.Picker({
                        theme: 'dark',
                        onEmojiSelect: (emoji) => { input.value += emoji.native; input.focus(); }
                    });
                    container.appendChild(picker);
                }
            } else container.style.display = 'none';
        };

        document.getElementById('btn-map').onclick   = () => handleSend('Cho tôi xin địa chỉ và vị trí.');
        document.getElementById('btn-price').onclick = () => handleSend('Gửi cho tôi bảng giá chi tiết.');
        document.getElementById('btn-call').onclick  = () => handleSend('Cho tôi số điện thoại hotline liên hệ.');

        document.getElementById('btn-send-phone').onclick = () => {
            const contactHTML = `
                <div class="contact-form-box">
                    <p style="margin:0 0 8px;font-size:12px;color:${cfg.bot_color};font-weight:bold;">
                        <i class="fas fa-address-card"></i> ĐỂ LẠI THÔNG TIN
                    </p>
                    <div style="display:flex;gap:5px;">
                        <input type="number" id="contact-phone" placeholder="SĐT của bạn..."
                            style="width:70%;font-size:12px;padding:6px;background:#0d1117;color:white;border:1px solid #30363d;border-radius:4px;">
                        <button id="submit-contact"
                            style="background:${cfg.bot_color};border:none;color:#0d1117;font-weight:bold;font-size:11px;padding:0 10px;cursor:pointer;border-radius:4px;">
                            GỬI
                        </button>
                    </div>
                </div>`;
            appendMessage(contactHTML, 'ai-msg', false, null, true, true);
        };

        document.getElementById('btn-contact-human').onclick = async () => {
            appendMessage('Tôi muốn gặp nhân viên.', 'user-msg');
            const typingId = showTyping();
            try {
                const response = await fetch(apiPath, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'Yêu cầu hỗ trợ trực tiếp', token: userToken, type: 'HUMAN_REQUEST', session_id: currentSessionId })
                });
                const data = await response.json();
                document.getElementById(typingId)?.remove();
                notificationSound.play().catch(() => {});
                const msg = data.choices?.[0]?.message?.content || '🔔 Đã thông báo cho nhân viên hỗ trợ!';
                appendMessage(msg, 'ai-msg', true);
            } catch (e) {
                document.getElementById(typingId)?.remove();
                appendMessage('Hệ thống bận, vui lòng thử lại!', 'ai-msg');
            }
        };

        // ── Submit contact form ───────────────────────────────────────
        document.addEventListener('click', async (e) => {
            if (e.target && e.target.id === 'submit-contact') {
                const phoneInput = document.getElementById('contact-phone');
                if (!phoneInput || phoneInput.value.length < 10) return alert('SĐT không hợp lệ!');
                e.target.disabled = true;
                try {
                    await fetch(apiPath, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: phoneInput.value, token: userToken, type: 'CONTACT_LEAD', session_id: currentSessionId })
                    });
                    notificationSound.play().catch(() => {});
                    const formBox = e.target.closest('.contact-form-box');
                    formBox.innerHTML = `<small style='color:${cfg.bot_color};'>✓ Cảm ơn bạn, chúng tôi sẽ gọi lại ngay!</small>`;
                    const doneHTML = `<div class='contact-form-box'><small style='color:${cfg.bot_color};'>✓ Cảm ơn bạn, chúng tôi sẽ gọi lại ngay!</small></div>`;
                    const idx = chatHistory.findIndex(m => m.isHTML && m.text.includes('contact-form-box'));
                    if (idx !== -1) { chatHistory[idx].text = doneHTML; saveHistory(); }
                } catch (err) { alert('Lỗi!'); e.target.disabled = false; }
            }
        });

        // ── Launcher / close / expand / refresh ──────────────────────
        document.getElementById('chat-launcher').onclick = () => {
            windowChat.classList.toggle('chat-window-show');
            document.getElementById('chat-tooltip')?.classList.add('chat-tooltip-hidden');
            if (windowChat.classList.contains('chat-window-show')) input.focus();
        };

        document.getElementById('close-chat').onclick   = () => windowChat.classList.remove('chat-window-show');

        document.getElementById('expand-chat').onclick  = function () {
            windowChat.classList.toggle('chat-fullscreen');
            this.innerHTML = windowChat.classList.contains('chat-fullscreen')
                ? '<i class="fas fa-compress-alt"></i>'
                : '<i class="fas fa-expand-alt"></i>';
        };

        document.getElementById('refresh-chat').onclick = () => {
            if (confirm('Làm mới hội thoại? Lịch sử chat sẽ bị xóa.')) {
                sessionStorage.removeItem(HISTORY_KEY);
                sessionStorage.removeItem('elite_chat_session_id');
                location.reload();
            }
        };

        // ── Send + Enter ──────────────────────────────────────────────
        let debounceTimer;
        document.getElementById('send-msg').onclick = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => handleSend(), 300);
        };
        input.onkeypress = (e) => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); };

        // ── Đóng emoji khi click ngoài ────────────────────────────────
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#emoji-picker-container') && !e.target.closest('#btn-emoji'))
                document.getElementById('emoji-picker-container').style.display = 'none';
        });

        // ── Tooltip sau 5 giây ────────────────────────────────────────
        setTimeout(() => {
            if (!windowChat.classList.contains('chat-window-show'))
                document.getElementById('chat-tooltip')?.classList.remove('chat-tooltip-hidden');
        }, 5000);
    };

    if (document.readyState === 'complete') initEliteWidget();
    else window.addEventListener('load', initEliteWidget);
})();
