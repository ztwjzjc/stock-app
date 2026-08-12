/* ============================================================
 * 价值投资分析器 - 后端代理服务器
 * 提供静态文件服务 + A股/港股数据API代理
 * 数据来源：东方财富网公开接口 + 腾讯行情接口
 * ============================================================ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8090;
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

// ==================== 工具函数 ====================

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

// 获取原始文本（用于非JSON接口）
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
// A股：6位数字代码（6开头=沪，0/3开头=深，8/4开头=北）
// 港股：5位数字代码（统一用hk前缀）
function getMarketPrefix(code) {
    // 港股：5位数字
    if (/^\d{5}$/.test(code)) {
        return { secid: '116', suffix: 'HK', tencentPrefix: 'hk', isHK: true, f10Base: 'PC_HKF10' };
    }
    // A股：6位数字
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

// ==================== API: 实时行情（腾讯接口） ====================
async function getQuote(code) {
    const prefix = getMarketPrefix(code);
    const tencentCode = prefix.tencentPrefix + code;
    const buf = await fetchText(`https://qt.gtimg.cn/q=${tencentCode}`);
    const text = buf.toString('latin1');
    const parts = text.split('~');

    if (parts.length < 10) throw new Error('未找到该股票，请检查代码');

    // 港股和A股的腾讯行情字段位置不同
    // A股: peTtm=parts[39], peDynamic=parts[52], pb=parts[46], totalShares=parts[72]
    // 港股: peTtm=parts[39], peDynamic=parts[71], pb=parts[72], totalShares=parts[69]
    let name = code;
    let industry = '';
    let peDynamic, pb, totalShares;

    if (prefix.isHK) {
        // 港股字段位置
        peDynamic = parseFloat(parts[71]);  // 市盈率(动)
        pb = parseFloat(parts[72]);          // 市净率
        totalShares = parseFloat(parts[69]); // 总股本

        // 港股名称：优先用 PC_HKF10/CompanyProfile/PageAjax
        try {
            const profileRes = await fetchJSON(
                `https://emweb.securities.eastmoney.com/PC_HKF10/CompanyProfile/PageAjax?code=${code}`
            );
            if (profileRes.zqzl) {
                name = profileRes.zqzl.zqjc || name;
            }
        } catch (e) {
            // fallback: 用搜索API获取名称
            try {
                const searchRes = await fetchJSON(
                    `https://searchapi.eastmoney.com/api/suggest/get?input=${code}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=5`
                );
                if (searchRes.QuotationCodeTable && searchRes.QuotationCodeTable.Data) {
                    const hkMatch = searchRes.QuotationCodeTable.Data.find(
                        s => String(s.MktNum) === '116' && s.Code === code
                    );
                    if (hkMatch) name = hkMatch.Name;
                }
            } catch (e2) { /* 用code作为fallback */ }
        }
    } else {
        // A股字段位置
        peDynamic = parseFloat(parts[52]);   // 市盈率(动)
        pb = parseFloat(parts[46]);           // 市净率
        totalShares = parseFloat(parts[72]);  // 总股本

        // A股名称和行业：用 PC_HSF10/CompanySurvey/CompanySurveyAjax
        try {
            const f10Code = prefix.suffix + code;
            const f10Res = await fetchJSON(
                `https://emweb.securities.eastmoney.com/${prefix.f10Base}/CompanySurvey/CompanySurveyAjax?code=${f10Code}`
            );
            if (f10Res.jbzl) {
                name = f10Res.jbzl.agjc || f10Res.jbzl.gszjc || name;
                industry = f10Res.jbzl.sshy || f10Res.jbzl.industry || '';
            }
        } catch (e) { /* 用code作为fallback */ }
    }

    const price = parseFloat(parts[3]);
    const peTtm = parseFloat(parts[39]);      // 市盈率(TTM) - A股港股位置相同
    const marketCap = parseFloat(parts[44]);   // 总市值（亿）- A股港股位置相同

    return {
        code: code,
        name: name,
        industry: industry,
        price: isNaN(price) ? null : price,
        prevClose: parseFloat(parts[4]) || null,
        totalShares: isNaN(totalShares) ? null : totalShares,
        marketCap: isNaN(marketCap) ? null : marketCap,
        circMarketCap: parseFloat(parts[45]) || null,
        pe: isNaN(peDynamic) ? null : peDynamic,
        peTtm: isNaN(peTtm) ? null : peTtm,
        pb: isNaN(pb) ? null : pb,
        isHK: prefix.isHK,
        currency: prefix.isHK ? 'HKD' : 'CNY'
    };
}

// ==================== API: 财务三表 ====================

// 港股财报：将长表格式（每行一个指标）转为键值Map
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

async function getHKFinance(code) {
    // 港股财报使用datacenter API的长表格式
    // 尝试最近3个年报日期
    const dates = ['2025-12-31', '2024-12-31', '2023-12-31'];
    const dcBase = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';
    const dcHeaders = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://emweb.securities.eastmoney.com/' };

    let reportDate = null;
    let bsMap = null, isMap = null, cfMap = null;

    for (const date of dates) {
        try {
            const dateFilter = `(SECURITY_CODE=%22${code}%22)(REPORT_DATE=%27${date}%27)`;
            const [bsRes, isRes, cfRes] = await Promise.all([
                fetchJSON(`${dcBase}?reportName=RPT_HKF10_FN_BALANCE_PC&columns=ALL&filter=${dateFilter}&pageSize=100&pageNumber=1`),
                fetchJSON(`${dcBase}?reportName=RPT_HKF10_FN_INCOME_PC&columns=ALL&filter=${dateFilter}&pageSize=100&pageNumber=1`),
                fetchJSON(`${dcBase}?reportName=RPT_HKF10_FN_CASHFLOW_PC&columns=ALL&filter=${dateFilter}&pageSize=100&pageNumber=1`)
            ]);

            if (bsRes.result && bsRes.result.data && bsRes.result.data.length > 0 &&
                isRes.result && isRes.result.data && isRes.result.data.length > 0 &&
                cfRes.result && cfRes.result.data && cfRes.result.data.length > 0) {
                reportDate = date;
                bsMap = hkFinanceToMap(bsRes.result.data);
                isMap = hkFinanceToMap(isRes.result.data);
                cfMap = hkFinanceToMap(cfRes.result.data);
                break;
            }
        } catch (e) { continue; }
    }

    if (!bsMap) throw new Error('未获取到港股财务报表数据');

    // 港币转亿元（API返回的是原始货币单位，通常是港元）
    const toYiHK = (v) => {
        if (v === null || v === undefined) return null;
        return parseFloat((v / 1e8).toFixed(2));
    };

    // 有息负债 = 短期贷款 + 长期贷款
    const interestDebt = (bsMap['短期贷款'] || 0) + (bsMap['长期贷款'] || 0);

    // 毛利率计算
    const revenue = isMap['营运收入'] || isMap['营业额'] || 0;
    const grossProfit = isMap['毛利'] !== undefined ? isMap['毛利'] : null;
    const grossMargin = grossProfit !== null && revenue > 0 ?
        parseFloat((grossProfit / revenue * 100).toFixed(2)) : null;

    // 销售费用占比
    const salesExpense = isMap['销售及分销费用'] || 0;
    const salesExpenseRatio = revenue > 0 ?
        parseFloat((salesExpense / revenue * 100).toFixed(2)) : null;

    // 资本性支出 = 购建固定资产 + 购建无形资产及其他资产
    const capex = (cfMap['购建固定资产'] || 0) + (cfMap['购建无形资产及其他资产'] || 0);
    const operatingCF = cfMap['经营业务现金净额'] || 0;

    return {
        reportDate: reportDate,
        isHK: true,
        balanceSheet: {
            totalAssets: toYiHK(bsMap['总资产']),
            totalLiabilities: toYiHK(bsMap['总负债']),
            interestDebt: toYiHK(interestDebt),
            netAssets: toYiHK(bsMap['净资产']),
            cash: toYiHK(bsMap['现金及等价物']),
            goodwill: null, // 港股报表不单独列示商誉
            accountsReceivable: toYiHK(bsMap['应收帐款']),
            inventory: toYiHK(bsMap['存货']),
            currentAssets: toYiHK(bsMap['流动资产合计']),
            currentLiabilities: toYiHK(bsMap['流动负债合计']),
            contractLiabilities: toYiHK(bsMap['递延收入(流动)'])
        },
        incomeStatement: {
            revenue: toYiHK(revenue),
            operatingProfit: toYiHK(isMap['经营溢利']),
            netProfit: toYiHK(isMap['股东应占溢利']),
            nonRecurringProfit: null, // 港股不单独列示扣非净利
            grossMargin: grossMargin,
            salesExpenseRatio: salesExpenseRatio
        },
        cashFlow: {
            operatingCF: toYiHK(operatingCF),
            capex: toYiHK(capex),
            freeCF: toYiHK(operatingCF - capex),
            fcfRevenueRatio: revenue > 0 ?
                parseFloat(((operatingCF - capex) / revenue * 100).toFixed(2)) : null
        }
    };
}

async function getFinance(code) {
    const prefix = getMarketPrefix(code);

    // 港股财报：使用datacenter API的港股专用接口
    if (prefix.isHK) {
        return await getHKFinance(code);
    }

    const f10Code = prefix.suffix + code;
    const f10Base = prefix.f10Base;

    const dates = ['2025-12-31', '2024-12-31', '2023-12-31'];

    let reportDate = null;
    let balanceSheet = null;
    let incomeStatement = null;
    let cashFlow = null;

    for (const date of dates) {
        try {
            const [bs, is, cf] = await Promise.all([
                fetchJSON(`https://emweb.securities.eastmoney.com/${f10Base}/NewFinanceAnalysis/zcfzbAjaxNew?companyType=4&reportDateType=0&reportType=1&dates=${date}&code=${f10Code}`),
                fetchJSON(`https://emweb.securities.eastmoney.com/${f10Base}/NewFinanceAnalysis/lrbAjaxNew?companyType=4&reportDateType=0&reportType=1&dates=${date}&code=${f10Code}`),
                fetchJSON(`https://emweb.securities.eastmoney.com/${f10Base}/NewFinanceAnalysis/xjllbAjaxNew?companyType=4&reportDateType=0&reportType=1&dates=${date}&code=${f10Code}`)
            ]);
            if (bs.data && is.data && cf.data) {
                reportDate = date;
                balanceSheet = bs.data[0];
                incomeStatement = is.data[0];
                cashFlow = cf.data[0];
                break;
            }
        } catch (e) { continue; }
    }

    if (!balanceSheet) throw new Error('未获取到财务报表数据');

    // 有息负债 = 短期借款 + 长期借款 + 应付债券 + 一年内到期的非流动负债
    const interestDebt = (balanceSheet.SHORT_LOAN || 0) + (balanceSheet.LONG_LOAN || 0) +
                         (balanceSheet.BOND_PAYABLE || 0) + (balanceSheet.NONCURRENT_LIAB_DUE_WITHIN_1Y || 0);

    const result = {
        reportDate: reportDate,
        // 资产负债表
        balanceSheet: {
            totalAssets: toYi(balanceSheet.TOTAL_ASSETS),
            totalLiabilities: toYi(balanceSheet.TOTAL_LIABILITIES),
            interestDebt: toYi(interestDebt),
            netAssets: toYi(balanceSheet.TOTAL_EQUITY),
            cash: toYi(balanceSheet.MONETARYFUNDS),
            goodwill: toYi(balanceSheet.GOODWILL || 0),
            accountsReceivable: toYi(balanceSheet.ACCOUNTS_RECE),
            inventory: toYi(balanceSheet.INVENTORY),
            currentAssets: toYi(balanceSheet.TOTAL_CURRENT_ASSETS),
            currentLiabilities: toYi(balanceSheet.TOTAL_CURRENT_LIAB),
            contractLiabilities: toYi(balanceSheet.CONTRACT_LIAB)
        },
        // 利润表
        incomeStatement: {
            revenue: toYi(incomeStatement.TOTAL_OPERATE_INCOME),
            operatingProfit: toYi(incomeStatement.OPERATE_PROFIT),
            netProfit: toYi(incomeStatement.PARENT_NETPROFIT),
            nonRecurringProfit: toYi(incomeStatement.DEDUCT_PARENT_NETPROFIT),
            grossMargin: incomeStatement.OPERATE_INCOME > 0 ?
                parseFloat(((incomeStatement.OPERATE_INCOME - incomeStatement.OPERATE_COST) / incomeStatement.OPERATE_INCOME * 100).toFixed(2)) : null,
            salesExpenseRatio: incomeStatement.TOTAL_OPERATE_INCOME > 0 ?
                parseFloat((incomeStatement.SALE_EXPENSE / incomeStatement.TOTAL_OPERATE_INCOME * 100).toFixed(2)) : null
        },
        // 现金流量表
        cashFlow: {
            operatingCF: toYi(cashFlow.NETCASH_OPERATE),
            capex: toYi(cashFlow.CONSTRUCT_LONG_ASSET),
            freeCF: toYi(cashFlow.NETCASH_OPERATE - cashFlow.CONSTRUCT_LONG_ASSET),
            fcfRevenueRatio: incomeStatement.TOTAL_OPERATE_INCOME > 0 ?
                parseFloat(((cashFlow.NETCASH_OPERATE - cashFlow.CONSTRUCT_LONG_ASSET) / incomeStatement.TOTAL_OPERATE_INCOME * 100).toFixed(2)) : null
        }
    };

    return result;
}

// ==================== API: 5年历史财务指标 ====================
async function getHistory(code) {
    const prefix = getMarketPrefix(code);

    // 港股历史财务指标：使用datacenter API的港股主要指标接口
    if (prefix.isHK) {
        const dcBase = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';
        // DATE_TYPE_CODE='001' = 年报
        const apiUrl = `${dcBase}?reportName=RPT_HKF10_FN_MAININDICATOR&columns=ALL&filter=(SECURITY_CODE=%22${code}%22)(DATE_TYPE_CODE=%22001%22)&pageSize=30&pageNumber=1`;
        const json = await fetchJSON(apiUrl);

        if (!json.result || !json.result.data) throw new Error('未获取到港股历史数据');

        // 按报告日期降序排列，取最近5年年报
        const annualReports = json.result.data
            .filter(r => r.REPORT_DATE && r.REPORT_DATE.includes('12-31'))
            .sort((a, b) => b.REPORT_DATE.localeCompare(a.REPORT_DATE))
            .slice(0, 5);

        return annualReports.map(r => ({
            year: r.REPORT_DATE ? r.REPORT_DATE.substring(0, 4) : '',
            revenue: toYi(r.OPERATE_INCOME),
            netProfit: toYi(r.HOLDER_PROFIT),
            roe: r.ROE_AVG ? parseFloat(r.ROE_AVG.toFixed(2)) : null,
            grossMargin: r.GROSS_PROFIT_RATIO ? parseFloat(r.GROSS_PROFIT_RATIO.toFixed(2)) : null,
            eps: r.BASIC_EPS,
            revenueGrowth: r.OPERATE_INCOME_YOY ? parseFloat(r.OPERATE_INCOME_YOY.toFixed(2)) : null,
            profitGrowth: r.HOLDER_PROFIT_YOY ? parseFloat(r.HOLDER_PROFIT_YOY.toFixed(2)) : null,
            bps: r.BPS ? parseFloat(r.BPS.toFixed(2)) : null,
            ocfPerShare: r.PER_NETCASH_OPERATE ? parseFloat(r.PER_NETCASH_OPERATE.toFixed(2)) : null
        }));
    }

    const apiUrl = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=ALL&filter=(SECURITY_CODE=%22${code}%22)&pageSize=24&pageNumber=1&sortTypes=-1&sortColumns=REPORTDATE`;
    const json = await fetchJSON(apiUrl);

    if (!json.result || !json.result.data) throw new Error('未获取到历史数据');

    // 只取年报（REPORTDATE 以 12-31 结尾）
    const annualReports = json.result.data.filter(r => r.REPORTDATE && r.REPORTDATE.includes('12-31')).slice(0, 5);

    return annualReports.map(r => ({
        year: r.REPORTDATE ? r.REPORTDATE.substring(0, 4) : '',
        revenue: toYi(r.TOTAL_OPERATE_INCOME),
        netProfit: toYi(r.PARENT_NETPROFIT),
        roe: r.WEIGHTAVG_ROE ? parseFloat(r.WEIGHTAVG_ROE.toFixed(2)) : null,
        grossMargin: r.XSMLL ? parseFloat(r.XSMLL.toFixed(2)) : null,
        eps: r.BASIC_EPS,
        revenueGrowth: r.YSTZ ? parseFloat(r.YSTZ.toFixed(2)) : null,
        profitGrowth: r.SJLTZ ? parseFloat(r.SJLTZ.toFixed(2)) : null,
        bps: r.BPS ? parseFloat(r.BPS.toFixed(2)) : null,
        ocfPerShare: r.MGJYXJJE ? parseFloat(r.MGJYXJJE.toFixed(2)) : null
    }));
}

// ==================== API: 股票搜索 ====================
async function searchStock(keyword) {
    const apiUrl = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=15`;
    const json = await fetchJSON(apiUrl);

    if (!json.QuotationCodeTable || !json.QuotationCodeTable.Data) return [];

    // 包含沪深A股(MktNum=0/1)和港股(MktNum=116)
    return json.QuotationCodeTable.Data.filter(s => {
        const mkt = String(s.MktNum);
        return mkt === '0' || mkt === '1' || mkt === '116';
    }).map(s => {
        const mkt = String(s.MktNum);
        let market, marketLabel;
        if (mkt === '116') {
            market = 'HK';
            marketLabel = '港股';
        } else if (mkt === '1') {
            market = 'SH';
            marketLabel = '沪市';
        } else {
            market = 'SZ';
            marketLabel = '深市';
        }
        // 港股代码补零到5位
        const code = mkt === '116' ? s.Code.padStart(5, '0') : s.Code;
        return {
            code: code,
            name: s.Name,
            market: market,
            marketLabel: marketLabel
        };
    });
}

// ==================== 路由处理 ====================
async function handleApi(req, res, pathname) {
    try {
        // /api/quote/600519 或 /api/quote/00700
        if (pathname.startsWith('/api/quote/')) {
            const code = pathname.split('/').pop();
            if (!/^\d{5,6}$/.test(code)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '股票代码格式不正确，请输入5位(港股)或6位(A股)数字' }));
                return;
            }
            const data = await getQuote(code);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, data }));
            return;
        }

        // /api/finance/600519
        if (pathname.startsWith('/api/finance/')) {
            const code = pathname.split('/').pop();
            if (!/^\d{5,6}$/.test(code)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '股票代码格式不正确' }));
                return;
            }
            const data = await getFinance(code);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, data }));
            return;
        }

        // /api/history/600519
        if (pathname.startsWith('/api/history/')) {
            const code = pathname.split('/').pop();
            if (!/^\d{5,6}$/.test(code)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '股票代码格式不正确' }));
                return;
            }
            const data = await getHistory(code);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, data }));
            return;
        }

        // /api/search/茅台
        if (pathname.startsWith('/api/search/')) {
            const keyword = decodeURIComponent(pathname.split('/').slice(3).join('/'));
            if (!keyword) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '请输入搜索关键词' }));
                return;
            }
            const data = await searchStock(keyword);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, data }));
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'API not found' }));
    } catch (e) {
        console.error('API Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
    }
}

// ==================== 静态文件服务 ====================
function serveStatic(req, res, pathname) {
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const fullPath = path.join(__dirname, filePath);

    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    const ext = path.extname(fullPath);
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Internal error');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.end(data);
    });
}

// ==================== 启动服务器 ====================
const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    if (pathname.startsWith('/api/')) {
        handleApi(req, res, pathname);
    } else {
        serveStatic(req, res, pathname);
    }
});

server.listen(PORT, () => {
    console.log(`价值投资分析器服务器运行中: http://localhost:${PORT}`);
    console.log(`API端点 (支持A股6位代码 + 港股5位代码):`);
    console.log(`  GET /api/quote/:code   - 实时行情`);
    console.log(`  GET /api/finance/:code - 财务三表`);
    console.log(`  GET /api/history/:code - 5年历史指标`);
    console.log(`  GET /api/search/:keyword - 股票搜索`);
});
