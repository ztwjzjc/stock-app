// ============================================================
// Supabase 配置 - 云端数据存储与同步
// ============================================================
// 使用前请完成以下步骤：
// 1. 访问 https://supabase.com 创建免费项目
// 2. 在项目 Settings > API 中找到 Project URL 和 anon public key
// 3. 在 SQL Editor 中执行 schema.sql 创建数据库表
// 4. 将下面的 URL 和 KEY 替换为你的项目信息
// ============================================================

const SUPABASE_URL = 'https://thaozwcxqsqzcdsdbgtv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoYW96d2N4cXNxemNkc2RiZ3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NjI5NDcsImV4cCI6MjEwMTMzODk0N30.RVSqXnhYLPqsL8pWlVD-1-oCe8KJITskT-989_pfpzQ';

// 判断是否已配置
const SUPABASE_CONFIGURED = SUPABASE_URL !== 'YOUR_SUPABASE_URL'
    && SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY'
    && typeof window.supabase !== 'undefined';

// 创建 Supabase 客户端
let supabaseClient = null;

function initSupabase() {
    if (!SUPABASE_CONFIGURED) {
        console.log('[Supabase] 未配置，云端功能不可用。请编辑 supabase-config.js 填入项目信息。');
        return null;
    }
    if (supabaseClient) return supabaseClient;

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            },
            realtime: {
                params: { eventsPerSecond: 2 }
            }
        });
        console.log('[Supabase] 客户端初始化成功');
        return supabaseClient;
    } catch (e) {
        console.error('[Supabase] 初始化失败:', e);
        return null;
    }
}

// 获取当前登录用户
function getCurrentUser() {
    if (!supabaseClient) return null;
    const session = supabaseClient.auth.getSession();
    // supabase v2: getSession is async, but we also have a sync way
    return supabaseClient.auth.getUser();
}

// 导出供其他模块使用
window.svaSupabase = {
    getClient: () => supabaseClient,
    isConfigured: () => SUPABASE_CONFIGURED,
    init: initSupabase
};
