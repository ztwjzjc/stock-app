const { fetchJSON, fetchText, getMarketPrefix, sendJSON, validateCode } = require('../_lib');

// ==================== API: 实时行情（腾讯接口） ====================
async function getQuote(code) {
    const prefix = getMarketPrefix(code);
    const tencentCode = prefix.tencentPrefix + code;
    const buf = await fetchText(`https://qt.gtimg.cn/q=${tencentCode}`);
    const text = buf.toString('latin1');
    const parts = text.split('~');

    if (parts.length < 10) throw new Error('未找到该股票，请检查代码');

    let name = code;
    let industry = '';
    let peDynamic, pb, totalShares;

    if (prefix.isHK) {
        peDynamic = parseFloat(parts[71]);
        pb = parseFloat(parts[72]);
        totalShares = parseFloat(parts[69]);

        try {
            const profileRes = await fetchJSON(
                `https://emweb.securities.eastmoney.com/PC_HKF10/CompanyProfile/PageAjax?code=${code}`
            );
            if (profileRes.zqzl) {
                name = profileRes.zqzl.zqjc || name;
            }
        } catch (e) {
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
            } catch (e2) { }
        }
    } else {
        peDynamic = parseFloat(parts[52]);
        pb = parseFloat(parts[46]);
        totalShares = parseFloat(parts[72]);

        try {
            const f10Code = prefix.suffix + code;
            const f10Res = await fetchJSON(
                `https://emweb.securities.eastmoney.com/${prefix.f10Base}/CompanySurvey/CompanySurveyAjax?code=${f10Code}`
            );
            if (f10Res.jbzl) {
                name = f10Res.jbzl.agjc || f10Res.jbzl.gszjc || name;
                industry = f10Res.jbzl.sshy || f10Res.jbzl.industry || '';
            }
        } catch (e) { }
    }

    const price = parseFloat(parts[3]);
    const peTtm = parseFloat(parts[39]);
    const marketCap = parseFloat(parts[44]);

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

module.exports = async (req, res) => {
    const code = req.query.code;
    if (!code || !validateCode(code)) {
        return sendJSON(res, { error: '股票代码格式不正确，请输入5位(港股)或6位(A股)数字' }, 400);
    }
    try {
        const data = await getQuote(code);
        return sendJSON(res, { success: true, data });
    } catch (e) {
        return sendJSON(res, { success: false, error: e.message }, 500);
    }
};
