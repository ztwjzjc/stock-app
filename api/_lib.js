/* ============================================================
 * 共享工具函数 - Vercel Serverless Functions 共用
 * ============================================================ */
const https = require('https');

// 获取JSON
function fetchJSON(fetchUrl) {
    return new Promise((resolve, reject) => {
        https.get(fetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://quote.eastmoney.com/'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('JSON解析失败: ' + data.slice(0, 200)));
                }
            });
        }).on('error', reject);
    });
}

// 获取原始文本
function fetchText(fetchUrl) {
    return new Promise((resolve, reject) => {
        https.get(fetchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

// 判断市场前缀
function getMarketPrefix(code) {
    if (/^\d{5}$/.test(code)) {
        return { secid: '116', suffix: 'HK', tencentPrefix: 'hk', isHK: true, f10Base: 'PC_HKF10' };
    }
    if (code.startsWith('6')) return { secid: '1', suffix: 'SH', tencentPrefix: 'sh', isHK: false, f10Base: 'PC_HSF10' };
    if (code.startsWith('0') || code.startsWith('3')) return { secid: '0', suffix: 'SZ', tencentPrefix: 'sz', isHK: false, f10Base: 'PC_HSF10' };
    if (code.startsWith('8') || code.startsWith('4')) return { secid: '0', suffix: 'BJ', tencentPrefix: 'bj', isHK: false, f10Base: 'PC_HSF10' };
    return { secid: '1', suffix: 'SH', tencentPrefix: 'sh', isHK: false, f10Base: 'PC_HSF10' };
}

// 数值安全转换
function safeNum(v, divisor = 1) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n / divisor;
}

// 元转亿元
function toYi(v) {
    if (v === null || v === undefined) return null;
    return parseFloat((v / 1e8).toFixed(2));
}

// 港股财报：长表格式转键值Map
function hkFinanceToMap(data) {
    const map = {};
    if (!data) return map;
    for (const row of data) {
        if (row.STD_ITEM_NAME && row.AMOUNT !== null && row.AMOUNT !== undefined) {
            map[row.STD_ITEM_NAME] = row.AMOUNT;
        }
    }
    return map;
}

// CORS + JSON响应
function sendJSON(res, data, status = 200) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(status).json(data);
}

// 参数验证
function validateCode(code) {
    return /^\d{5,6}$/.test(code);
}

module.exports = { fetchJSON, fetchText, getMarketPrefix, safeNum, toYi, hkFinanceToMap, sendJSON, validateCode };
