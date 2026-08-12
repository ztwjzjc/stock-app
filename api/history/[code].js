const { fetchJSON, getMarketPrefix, toYi, sendJSON, validateCode } = require('../_lib');

// ==================== API: 5年历史财务指标 ====================
async function getHistory(code) {
    const prefix = getMarketPrefix(code);

    // 港股历史财务指标
    if (prefix.isHK) {
        const dcBase = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';
        const apiUrl = `${dcBase}?reportName=RPT_HKF10_FN_MAININDICATOR&columns=ALL&filter=(SECURITY_CODE=%22${code}%22)(DATE_TYPE_CODE=%22001%22)&pageSize=30&pageNumber=1`;
        const json = await fetchJSON(apiUrl);

        if (!json.result || !json.result.data) throw new Error('未获取到港股历史数据');

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

    // A股历史
    const apiUrl = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=ALL&filter=(SECURITY_CODE=%22${code}%22)&pageSize=24&pageNumber=1&sortTypes=-1&sortColumns=REPORTDATE`;
    const json = await fetchJSON(apiUrl);

    if (!json.result || !json.result.data) throw new Error('未获取到历史数据');

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

module.exports = async (req, res) => {
    const code = req.query.code;
    if (!code || !validateCode(code)) {
        return sendJSON(res, { error: '股票代码格式不正确' }, 400);
    }
    try {
        const data = await getHistory(code);
        return sendJSON(res, { success: true, data });
    } catch (e) {
        return sendJSON(res, { success: false, error: e.message }, 500);
    }
};
