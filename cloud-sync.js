// ============================================================
// 云端同步模块 - 自选股数据在多设备间自动同步
// ============================================================
// 策略：
// - 登录后：从云端拉取数据，合并到本地
// - 本地变更：立即写入 localStorage + 延迟推送云端（防抖）
// - 实时订阅：云端变更时自动更新本地 UI
// - 离线时：仅写 localStorage，上线后自动同步
// ============================================================

let realtimeChannel = null;
let syncTimer = null;
let isPulling = false;

// 推送到云端的防抖延迟（毫秒）
const SYNC_DEBOUNCE_MS = 1500;

// 从云端拉取自选股
async function pullWatchlist() {
    const sb = window.svaSupabase.getClient();
    if (!sb || !window.svaAuth.isLoggedIn()) return;

    isPulling = true;
    window.svaAuth.updateSyncBadge('syncing');

    try {
        const { data, error } = await sb
            .from('watchlist')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        // 将云端数据转换为本地格式
        const cloudList = (data || []).map(row => ({
            code: row.code,
            name: row.name,
            score: row.score || 0,
            conclusion: row.conclusion || '',
            currentPrice: row.current_price,
            fairPrice: row.fair_price,
            safetyMarginPct: row.safety_margin_pct,
            action: row.action || '—',
            timestamp: new Date(row.updated_at).getTime(),
            data: row.data || {}
        }));

        // 合并云端和本地数据
        const localList = getWatchlist();
        const merged = mergeWatchlists(localList, cloudList);

        // 更新本地存储
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(merged));
        renderWatchlist();

        window.svaAuth.updateSyncBadge('synced');
        console.log(`[Cloud] 拉取完成: 云端 ${cloudList.length} 条, 本地 ${localList.length} 条, 合并后 ${merged.length} 条`);
    } catch (err) {
        console.error('[Cloud] 拉取失败:', err);
        window.svaAuth.updateSyncBadge('error');
    } finally {
        isPulling = false;
    }
}

// 合并本地和云端列表（以 timestamp 为准，取最新）
function mergeWatchlists(local, cloud) {
    const map = new Map();

    // 先放入本地数据
    local.forEach(item => {
        map.set(item.code, item);
    });

    // 云端数据覆盖（如果更新）
    cloud.forEach(item => {
        const existing = map.get(item.code);
        if (!existing || (item.timestamp || 0) > (existing.timestamp || 0)) {
            map.set(item.code, item);
        }
    });

    return Array.from(map.values());
}

// 推送单个自选股到云端
async function pushWatchlistItem(item) {
    const sb = window.svaSupabase.getClient();
    if (!sb || !window.svaAuth.isLoggedIn()) return;

    const userId = window.svaAuth.getCurrentUserId();
    if (!userId) return;

    const row = {
        user_id: userId,
        code: item.code,
        name: item.name,
        score: item.score || 0,
        conclusion: item.conclusion || '',
        current_price: item.currentPrice,
        fair_price: item.fairPrice,
        safety_margin_pct: item.safetyMarginPct,
        action: item.action || '—',
        data: item.data || {},
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await sb
            .from('watchlist')
            .upsert(row, { onConflict: 'user_id,code' });

        if (error) throw error;
        window.svaAuth.updateSyncBadge('synced');
    } catch (err) {
        console.error('[Cloud] 推送失败:', err);
        window.svaAuth.updateSyncBadge('error');
    }
}

// 删除云端自选股
async function deleteCloudWatchlistItem(code) {
    const sb = window.svaSupabase.getClient();
    if (!sb || !window.svaAuth.isLoggedIn()) return;

    try {
        const { error } = await sb
            .from('watchlist')
            .delete()
            .eq('code', code);

        if (error) throw error;
        window.svaAuth.updateSyncBadge('synced');
    } catch (err) {
        console.error('[Cloud] 删除失败:', err);
        window.svaAuth.updateSyncBadge('error');
    }
}

// 批量同步本地 watchlist 到云端（用于刷新价格后）
async function pushAllWatchlist() {
    const sb = window.svaSupabase.getClient();
    if (!sb || !window.svaAuth.isLoggedIn()) return;

    window.svaAuth.updateSyncBadge('syncing');
    const list = getWatchlist();
    const userId = window.svaAuth.getCurrentUserId();

    let success = 0;
    for (const item of list) {
        const row = {
            user_id: userId,
            code: item.code,
            name: item.name,
            score: item.score || 0,
            conclusion: item.conclusion || '',
            current_price: item.currentPrice,
            fair_price: item.fairPrice,
            safety_margin_pct: item.safetyMarginPct,
            action: item.action || '—',
            data: item.data || {},
            updated_at: new Date().toISOString()
        };

        try {
            const { error } = await sb
                .from('watchlist')
                .upsert(row, { onConflict: 'user_id,code' });
            if (!error) success++;
        } catch (e) { /* 忽略单个失败 */ }
    }

    window.svaAuth.updateSyncBadge(success === list.length ? 'synced' : 'error');
    console.log(`[Cloud] 批量推送完成: ${success}/${list.length}`);
}

// 防抖推送：本地保存自选股后延迟推送
function debouncedPush(item) {
    if (!window.svaAuth.isLoggedIn()) return;

    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        pushWatchlistItem(item);
    }, SYNC_DEBOUNCE_MS);
}

// 订阅云端实时变更
function subscribeWatchlist() {
    const sb = window.svaSupabase.getClient();
    if (!sb || !window.svaAuth.isLoggedIn()) return;

    // 取消旧订阅
    unsubscribeWatchlist();

    realtimeChannel = sb
        .channel('watchlist-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'watchlist',
            filter: `user_id=eq.${window.svaAuth.getCurrentUserId()}`
        }, (payload) => {
            console.log('[Cloud] 实时变更:', payload.eventType);

            // 避免自己推送的数据触发重复更新
            if (isPulling) return;

            handleRealtimeChange(payload);
        })
        .subscribe();
}

// 取消订阅
function unsubscribeWatchlist() {
    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
    }
}

// 处理实时变更
function handleRealtimeChange(payload) {
    const eventType = payload.eventType;
    const row = payload.new || payload.old;

    if (!row || !row.code) return;

    const localList = getWatchlist();

    if (eventType === 'DELETE') {
        const filtered = localList.filter(w => w.code !== row.code);
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(filtered));
        renderWatchlist();
        return;
    }

    // INSERT 或 UPDATE
    const cloudItem = {
        code: row.code,
        name: row.name,
        score: row.score || 0,
        conclusion: row.conclusion || '',
        currentPrice: row.current_price,
        fairPrice: row.fair_price,
        safetyMarginPct: row.safety_margin_pct,
        action: row.action || '—',
        timestamp: new Date(row.updated_at).getTime(),
        data: row.data || {}
    };

    const idx = localList.findIndex(w => w.code === row.code);
    if (idx >= 0) {
        // 只在云端数据更新时覆盖
        if ((cloudItem.timestamp || 0) > (localList[idx].timestamp || 0)) {
            localList[idx] = cloudItem;
        }
    } else {
        localList.unshift(cloudItem);
    }

    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(localList));
    renderWatchlist();
    window.svaAuth.updateSyncBadge('synced');
}

// 在线状态检测
window.addEventListener('online', async () => {
    console.log('[Cloud] 网络恢复，开始同步');
    if (window.svaAuth.isLoggedIn()) {
        await pullWatchlist();
        await pushAllWatchlist();
    }
});

window.addEventListener('offline', () => {
    console.log('[Cloud] 网络断开，切换到离线模式');
    window.svaAuth.updateSyncBadge('offline');
});

// 暴露到全局
window.svaCloud = {
    pullWatchlist,
    pushWatchlistItem,
    pushAllWatchlist,
    deleteCloudWatchlistItem,
    debouncedPush,
    subscribeWatchlist,
    unsubscribeWatchlist
};
