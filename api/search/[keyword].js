const { fetchJSON, sendJSON } = require('../_lib');

// ==================== API: 股票搜索 ====================
async function searchStock(keyword) {
    const apiUrl = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=15`;
    const json = await fetchJSON(apiUrl);

    if (!json.QuotationCodeTable || !json.QuotationCodeTable.Data) return [];

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
        const code = mkt === '116' ? s.Code.padStart(5, '0') : s.Code;
        return {
            code: code,
            name: s.Name,
            market: market,
            marketLabel: marketLabel
        };
    });
}

module.exports = async (req, res) => {
    const keyword = req.query.keyword;
    if (!keyword) {
        return sendJSON(res, { error: '请输入搜索关键词' }, 400);
    }
    try {
        const data = await searchStock(keyword);
        return sendJSON(res, { success: true, data });
    } catch (e) {
        return sendJSON(res, { success: false, error: e.message }, 500);
    }
};
