// ============================================================
// 认证模块 - 邮箱密码注册/登录/登出
// ============================================================

// 当前用户状态
let currentUser = null;

// 初始化认证
async function initAuth() {
    const sb = window.svaSupabase.init();
    if (!sb) {
        updateAuthUI(null);
        return;
    }

    // 检查已有会话
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        currentUser = session.user;
        updateAuthUI(currentUser);
        // 登录后拉取云端数据
        if (window.svaCloud) {
            window.svaCloud.pullWatchlist();
            window.svaCloud.subscribeWatchlist();
        }
    }

    // 监听认证状态变化
    sb.auth.onAuthStateChange(async (event, session) => {
        console.log('[Auth] 状态变化:', event);
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            updateAuthUI(currentUser);
            if (window.svaCloud) {
                await window.svaCloud.pullWatchlist();
                window.svaCloud.subscribeWatchlist();
            }
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            if (window.svaCloud) {
                window.svaCloud.unsubscribeWatchlist();
            }
            updateAuthUI(null);
            // 登出后清除云端数据引用，保留本地缓存
            renderWatchlist();
        }
    });
}

// 更新认证 UI
function updateAuthUI(user) {
    const container = document.getElementById('authArea');
    if (!container) return;

    if (user) {
        const email = user.email || '';
        const displayName = email.split('@')[0];
        container.innerHTML = `
            <div class="auth-user">
                <span class="auth-user-icon">👤</span>
                <span class="auth-user-name" title="${email}">${displayName}</span>
                <span class="auth-sync-badge" id="syncBadge" title="云端同步状态">☁️</span>
                <button class="btn btn-ghost btn-sm" onclick="showLogoutConfirm()">登出</button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <button class="btn btn-ghost btn-sm" onclick="showAuthModal('login')">登录</button>
            <button class="btn btn-primary btn-sm" onclick="showAuthModal('register')">注册</button>
        `;
    }
}

// 显示认证模态框
function showAuthModal(mode) {
    // 确保客户端已初始化（防止用户在页面加载完成前点击）
    let sb = window.svaSupabase.getClient();
    if (!sb) {
        sb = window.svaSupabase.init();
    }
    if (!sb) {
        alert('云端功能未配置。\n\n请按以下步骤操作：\n1. 访问 supabase.com 创建项目\n2. 执行 schema.sql\n3. 编辑 supabase-config.js 填入 URL 和 Key');
        return;
    }

    const isLogin = mode === 'login';
    const modal = document.createElement('div');
    modal.className = 'auth-modal-overlay';
    modal.id = 'authModal';
    modal.innerHTML = `
        <div class="auth-modal">
            <div class="auth-modal-header">
                <h2>${isLogin ? '登录' : '注册'}</h2>
                <button class="auth-close" onclick="closeAuthModal()">✕</button>
            </div>
            <div class="auth-modal-body">
                <div class="auth-tab-row">
                    <button class="auth-tab ${isLogin ? 'active' : ''}" onclick="switchAuthTab('login')">登录</button>
                    <button class="auth-tab ${!isLogin ? 'active' : ''}" onclick="switchAuthTab('register')">注册</button>
                </div>
                <form id="authForm" onsubmit="handleAuthSubmit(event, '${mode}')">
                    <div class="auth-field">
                        <label>邮箱</label>
                        <input type="email" id="authEmail" placeholder="your@email.com" required autocomplete="email">
                    </div>
                    <div class="auth-field">
                        <label>密码</label>
                        <input type="password" id="authPassword" placeholder="至少6位" required minlength="6" autocomplete="${isLogin ? 'current-password' : 'new-password'}">
                    </div>
                    <div id="authError" class="auth-error"></div>
                    <button type="submit" class="btn btn-primary auth-submit-btn">
                        ${isLogin ? '登录' : '注册'}
                    </button>
                </form>
                ${!isLogin ? '<p class="auth-hint">注册后即可在多设备间同步自选股数据</p>' : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAuthModal();
    });

    // 聚焦邮箱输入框
    setTimeout(() => document.getElementById('authEmail')?.focus(), 100);
}

// 切换登录/注册标签
function switchAuthTab(mode) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    closeAuthModal();
    showAuthModal(mode);
}

// 关闭认证模态框
function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.remove();
}

// 处理登录/注册提交
async function handleAuthSubmit(event, mode) {
    event.preventDefault();
    const sb = window.svaSupabase.getClient();
    if (!sb) return;

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorEl = document.getElementById('authError');
    const submitBtn = document.querySelector('.auth-submit-btn');

    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? '登录中...' : '注册中...';

    try {
        if (mode === 'register') {
            const { data, error } = await sb.auth.signUp({ email, password });
            if (error) throw error;

            if (data.user && !data.session) {
                // 需要邮箱确认
                errorEl.className = 'auth-error auth-success';
                errorEl.textContent = '注册成功！请检查邮箱确认链接，确认后即可登录。';
                submitBtn.style.display = 'none';
            } else {
                // 直接登录成功
                closeAuthModal();
                showFetchStatus('success', `✓ 注册成功，欢迎加入！`);
            }
        } else {
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw error;

            closeAuthModal();
            showFetchStatus('success', `✓ 登录成功，正在同步数据...`);
        }
    } catch (err) {
        errorEl.className = 'auth-error';
        errorEl.textContent = formatAuthError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'login' ? '登录' : '注册';
    }
}

// 格式化认证错误信息
function formatAuthError(msg) {
    const errorMap = {
        'Invalid login credentials': '邮箱或密码错误',
        'User already registered': '该邮箱已注册，请直接登录',
        'Password should be at least 6 characters': '密码至少需要6位字符',
        'Email not confirmed': '邮箱未确认，请检查邮箱中的确认链接',
        'rate limit exceeded': '操作过于频繁，请稍后再试',
        'Unable to validate email address': '邮箱格式不正确'
    };
    for (const [key, val] of Object.entries(errorMap)) {
        if (msg.toLowerCase().includes(key.toLowerCase())) return val;
    }
    return msg;
}

// 显示登出确认
function showLogoutConfirm() {
    const modal = document.createElement('div');
    modal.className = 'auth-modal-overlay';
    modal.id = 'authModal';
    modal.innerHTML = `
        <div class="auth-modal" style="max-width:360px">
            <div class="auth-modal-header">
                <h2>确认登出</h2>
                <button class="auth-close" onclick="closeAuthModal()">✕</button>
            </div>
            <div class="auth-modal-body">
                <p style="margin-bottom:16px;color:var(--color-text-muted)">登出后本地数据仍保留，但不再与云端同步。</p>
                <div style="display:flex;gap:8px;justify-content:flex-end">
                    <button class="btn btn-ghost" onclick="closeAuthModal()">取消</button>
                    <button class="btn btn-primary" onclick="doLogout()">确认登出</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAuthModal();
    });
}

// 执行登出
async function doLogout() {
    const sb = window.svaSupabase.getClient();
    if (!sb) return;

    closeAuthModal();
    await sb.auth.signOut();
    showFetchStatus('success', '已登出，云端同步已停止');
}

// 检查是否已登录
function isLoggedIn() {
    return currentUser !== null;
}

// 获取当前用户ID
function getCurrentUserId() {
    return currentUser?.id || null;
}

// 更新同步状态徽章
function updateSyncBadge(status) {
    const badge = document.getElementById('syncBadge');
    if (!badge) return;

    const statusMap = {
        synced: { icon: '☁️', title: '已同步', class: 'synced' },
        syncing: { icon: '🔄', title: '同步中...', class: 'syncing' },
        offline: { icon: '📱', title: '离线模式（本地保存）', class: 'offline' },
        error: { icon: '⚠️', title: '同步失败', class: 'error' }
    };

    const s = statusMap[status] || statusMap.offline;
    badge.textContent = s.icon;
    badge.title = s.title;
    badge.className = `auth-sync-badge ${s.class}`;
}

// 暴露到全局
window.svaAuth = {
    init: initAuth,
    isLoggedIn,
    getCurrentUserId,
    updateSyncBadge
};
