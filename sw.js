// Service Worker - 价值投资分析器 PWA
const CACHE_VERSION = 'sva-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// 需要预缓存的静态资源
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './auth.js',
    './cloud-sync.js',
    './supabase-config.js',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './icon-512.png',
    'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// 安装：预缓存静态资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return Promise.allSettled(
                STATIC_ASSETS.map(url => cache.add(url))
            );
        }).then(() => {
            return self.skipWaiting();
        })
    );
});

// 激活：清理所有旧版本缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => !key.startsWith(CACHE_VERSION))
                    .map(key => caches.delete(key))
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// 请求拦截
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API 请求：网络优先，失败时用缓存
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const cloned = response.clone();
                        caches.open(API_CACHE).then(cache => {
                            cache.put(event.request, cloned);
                            setTimeout(() => {
                                cache.delete(event.request);
                            }, 5 * 60 * 1000);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // HTML/JS/CSS：网络优先（确保用户拿到最新版本），失败时用缓存
    const isLocalAsset = url.origin === self.location.origin;
    if (isLocalAsset) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const cloned = response.clone();
                        caches.open(STATIC_CACHE).then(cache => {
                            cache.put(event.request, cloned);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request);
                })
        );
        return;
    }

    // 外部CDN资源：缓存优先（减少加载时间），失败时走网络
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                return response;
            });
        })
    );
});

// 接收消息：手动更新缓存
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
