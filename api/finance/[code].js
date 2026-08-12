const { fetchJSON, getMarketPrefix, toYi, hkFinanceToMap, sendJSON, validateCode } = require('../_lib');

// ==================== 港股财报 ====================
async function getHKFinance(code) {
    const dates = ['2025-12-31', '2024-12-31', '2023-12-31'];
    const dcBase = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';

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

    const toYiHK = (v) => {
        if (v === null || v === undefined) return null;
        return parseFloat((v / 1e8).toFixed(2));
    };

    const interestDebt = (bsMap['短期贷款'] || 0) + (bsMap['长期贷款'] || 0);
    const revenue = isMap['营运收入'] || isMap['营业额'] || 0;
    const grossProfit = isMap['毛利'] !== undefined ? isMap['毛利'] : null;
    const grossMargin = grossProfit !== null && revenue > 0 ?
        parseFloat((grossProfit / revenue * 100).toFixed(2)) : null;
    const salesExpense = isMap['销售及分销费用'] || 0;
    const salesExpenseRatio = revenue > 0 ?
        parseFloat((salesExpense / revenue * 100).toFixed(2)) : null;
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
            goodwill: null,
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
            nonRecurringProfit: null,
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

// ==================== A股财报 ====================
async function getFinance(code) {
    const prefix = getMarketPrefix(code);

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

    const interestDebt = (balanceSheet.SHORT_LOAN || 0) + (balanceSheet.LONG_LOAN || 0) +
                         (balanceSheet.BOND_PAYABLE || 0) + (balanceSheet.NONCURRENT_LIAB_DUE_WITHIN_1Y || 0);

    return {
        reportDate: reportDate,
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
        cashFlow: {
            operatingCF: toYi(cashFlow.NETCASH_OPERATE),
            capex: toYi(cashFlow.CONSTRUCT_LONG_ASSET),
            freeCF: toYi(cashFlow.NETCASH_OPERATE - cashFlow.CONSTRUCT_LONG_ASSET),
            fcfRevenueRatio: incomeStatement.TOTAL_OPERATE_INCOME > 0 ?
                parseFloat(((cashFlow.NETCASH_OPERATE - cashFlow.CONSTRUCT_LONG_ASSET) / incomeStatement.TOTAL_OPERATE_INCOME * 100).toFixed(2)) : null
        }
    };
}

module.exports = async (req, res) => {
    const code = req.query.code;
    if (!code || !validateCode(code)) {
        return sendJSON(res, { error: '股票代码格式不正确' }, 400);
    }
    try {
        const data = await getFinance(code);
        return sendJSON(res, { success: true, data });
    } catch (e) {
        return sendJSON(res, { success: false, error: e.message }, 500);
    }
};
