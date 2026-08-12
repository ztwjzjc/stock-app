/* ============================================================
 * 价值投资分析器 - 基于《股市真规则》五步分析法
 * 核心分析引擎
 * ============================================================ */

// ==================== 数据定义 ====================

// 第一步：8项初筛指标
const screenItems = [
    {
        id: 'screen1',
        title: '盈利历史',
        desc: '过去5年中至少有4年营业利润为正，说明公司具备持续赚钱的能力。',
        unit: '年',
        placeholder: '如：5'
    },
    {
        id: 'screen2',
        title: '经营现金流',
        desc: '经营现金流持续为正，且多数年份≥净利润。现金流是利润的试金石。',
        unit: '',
        placeholder: '通过/不通过'
    },
    {
        id: 'screen3',
        title: 'ROE（净资产收益率）',
        desc: '非金融公司连续5年ROE>10%（最好>15%），且非高杠杆驱动。',
        unit: '%',
        placeholder: '如：18.5'
    },
    {
        id: 'screen4',
        title: '盈利稳定性',
        desc: '净利润不忽高忽低，无明显的一次性损益主导。',
        unit: '',
        placeholder: '通过/不通过'
    },
    {
        id: 'screen5',
        title: '负债水平',
        desc: '有息负债率<40%，流动比率>1.5。负债过高是定时炸弹。',
        unit: '%',
        placeholder: '如：25'
    },
    {
        id: 'screen6',
        title: '自由现金流',
        desc: 'FCF/销售收入>5%，或负值但有合理解释（如高速扩张期）。',
        unit: '%',
        placeholder: '如：8.5'
    },
    {
        id: 'screen7',
        title: '非经常性费用',
        desc: '无连续的重组费、减值费等"一次性"项目。频繁"一次性"是红旗。',
        unit: '',
        placeholder: '通过/不通过'
    },
    {
        id: 'screen8',
        title: '股本稀释',
        desc: '发行在外股票数年增长率<2%。频繁增发摊薄股东权益。',
        unit: '%',
        placeholder: '如：1.2'
    }
];

// 第二步：5大护城河
const moatTypes = [
    {
        id: 'moat1',
        icon: '🏆',
        name: '无形资产',
        feature: '品牌溢价、专利、许可证——竞争对手无法合法复制',
        metric: '毛利率持续高于行业10个百分点以上'
    },
    {
        id: 'moat2',
        icon: '⚙️',
        name: '成本优势',
        feature: '规模效应、工艺领先、地理位置——以更低成本生产',
        metric: '营业利润率比行业平均高5个百分点'
    },
    {
        id: 'moat3',
        icon: '🔒',
        name: '高转换成本',
        feature: '客户迁移代价极高——换供应商太痛苦',
        metric: '客户留存率>90%，收入可预测性强'
    },
    {
        id: 'moat4',
        icon: '🌐',
        name: '网络效应',
        feature: '用户越多价值越大——先发者赢者通吃',
        metric: '市场份额持续扩大，边际成本递减'
    },
    {
        id: 'moat5',
        icon: '🏰',
        name: '高进入壁垒',
        feature: '资本需求、行政许可、资源垄断——新玩家进不来',
        metric: '长期ROE>20%且无新进入者'
    }
];

// 第四步：管理层三维度
const managementDimensions = [
    {
        id: 'mgmt1',
        title: '报酬',
        question: '管理层薪酬是否合理？是否与长期业绩挂钩？',
        good: { title: '✓ 好信号', desc: '薪酬与长期业绩挂钩；高比例股权持有；不滥用期权' },
        bad: { title: '✗ 红牌', desc: '贷款被豁免；为收购支付巨额奖金；期权稀释严重' }
    },
    {
        id: 'mgmt2',
        title: '性格',
        question: '管理层是否坦率诚实？有无利益冲突？',
        good: { title: '✓ 好信号', desc: '坦率承认错误；无频繁关联交易；董事会独立' },
        bad: { title: '✗ 红牌', desc: '家庭成员任要职；回避敏感问题；过度自我宣传' }
    },
    {
        id: 'mgmt3',
        title: '运作',
        question: '资本配置是否理性？是否聚焦主业？',
        good: { title: '✓ 好信号', desc: '聚焦主业；理性回购分红；信息披露透明' },
        bad: { title: '✗ 红牌', desc: '频繁跨界收购；股份数连年增长>5%；隐瞒分项数据' }
    }
];

// ==================== 状态管理 ====================
const state = {
    currentStep: 1,
    screenResults: {},  // {screen1: {value, pass}, ...}
    selectedMoats: [],   // ['moat1', 'moat3']
    mgmtResults: {},     // {mgmt1: 'good', mgmt2: 'bad', ...}
    stepStatus: { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' },
    historyData: null,   // 5年历史数据缓存
    lastScore: 0,
    lastConclusion: '',
    lastHealthCheck: null, // 缓存健康检查结果，避免重复调用
    isHK: false,         // 是否港股
    currency: 'CNY'      // 货币代码
};

// 货币符号辅助函数
function curSym() { return state.isHK ? 'HK$' : '¥'; }
function curUnit() { return state.isHK ? '亿港元' : '亿元'; }
function curPerShare() { return state.isHK ? '港元/股' : '元/股'; }

// 更新HTML中所有动态货币标签
function updateCurrencyLabels() {
    const unit = curUnit();
    const perShare = curPerShare();
    document.querySelectorAll('.dyn-cur-unit').forEach(el => {
        el.textContent = el.textContent.replace(/亿[元港元]+/, unit);
        // 兜底：如果没匹配到，直接设为含unit的文本
        if (!el.textContent.includes(unit)) {
            el.textContent = el.textContent.replace('亿元', unit).replace('亿港元', unit);
        }
    });
    document.querySelectorAll('.dyn-cur-pershare').forEach(el => {
        el.textContent = el.textContent.replace(/元\/股|港元\/股/, perShare);
    });
}

// 图表实例管理
const charts = {};

// localStorage 键名
const STORAGE_KEY = 'sva_current';
const WATCHLIST_KEY = 'sva_watchlist';

// ==================== 初始化 ====================
function init() {
    renderScreenChecklist();
    renderMoatGrid();
    renderManagementGrid();
    bindFinancialInputs();
    bindValuationInputs();
    renderWatchlist();
    updateSortButtons();
    updateProgress();

    // 回车触发获取数据
    document.getElementById('fetchCode').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (/^\d{5,6}$/.test(val)) {
                fetchStockData();
            } else if (val.length >= 1) {
                searchStock(val);
            }
        }
    });

    // 输入搜索（防抖）
    let searchTimer = null;
    document.getElementById('fetchCode').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const val = e.target.value.trim();
        if (val.length >= 1 && !/^\d{5,6}$/.test(val)) {
            searchTimer = setTimeout(() => searchStock(val), 300);
        } else {
            document.getElementById('searchResults').innerHTML = '';
        }
        // 代码同步
        if (/^\d{5,6}$/.test(val)) {
            document.getElementById('stockCode').value = val;
        }
    });

    // 自动保存：监听所有 input/select 变化
    document.addEventListener('change', autoSave);
    setInterval(autoSave, 5000); // 定时保存兜底

    // 尝试恢复上次数据
    restoreState();

    // 确保估值结果在页面加载后一定被计算一次
    updateValuation();
}

// ==================== 步骤导航 ====================
function goToStep(step) {
    state.currentStep = step;
    document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.step-item').forEach(s => s.classList.remove('active'));
    document.getElementById('step-' + step).classList.add('active');
    document.querySelector(`.step-item[data-step="${step}"]`).classList.add('active');

    if (step === 3) evaluateStep3();
    if (step === 5) updateValuation();
    if (step === 6) generateReport();
    autoSave();
}

function updateProgress() {
    let completed = 0;
    [1, 2, 3, 4, 5].forEach(s => {
        if (state.stepStatus[s] === 'pass' || state.stepStatus[s] === 'fail') completed++;
        const el = document.getElementById('status-' + s);
        if (el) {
            el.className = 'step-status ' + (state.stepStatus[s] === 'pass' ? 'pass' : state.stepStatus[s] === 'fail' ? 'fail' : 'pending');
            el.textContent = state.stepStatus[s] === 'pass' ? '✓' : state.stepStatus[s] === 'fail' ? '✗' : '';
        }
    });
    const pct = Math.round((completed / 5) * 100);
    document.getElementById('progressPercent').textContent = pct + '%';
    document.getElementById('progressFill').style.width = pct + '%';
}

// ==================== 第一步：十分钟初筛 ====================
function renderScreenChecklist() {
    const container = document.getElementById('screenChecklist');
    container.innerHTML = screenItems.map((item, i) => `
        <div class="checklist-item" id="item-${item.id}">
            <div class="checklist-left">
                <div class="checklist-num">${i + 1}</div>
                <div class="checklist-content">
                    <div class="checklist-title">${item.title}</div>
                    <div class="checklist-desc">${item.desc}</div>
                </div>
            </div>
            <div class="checklist-right">
                <div class="checklist-input">
                    <input type="text" id="${item.id}-input" placeholder="${item.placeholder}" onchange="evaluateScreen('${item.id}')">
                </div>
                <div class="checklist-toggle">
                    <button class="toggle-btn" id="${item.id}-pass" onclick="setScreenResult('${item.id}', 'pass')">通过</button>
                    <button class="toggle-btn" id="${item.id}-fail" onclick="setScreenResult('${item.id}', 'fail')">不通过</button>
                </div>
            </div>
        </div>
    `).join('');
}

function setScreenResult(id, result) {
    state.screenResults[id] = state.screenResults[id] || {};
    state.screenResults[id].pass = result === 'pass';

    // 更新按钮样式
    document.getElementById(`${id}-pass`).classList.remove('active', 'pass');
    document.getElementById(`${id}-fail`).classList.remove('active', 'fail');
    document.getElementById(`${id}-${result}`).classList.add('active', result);

    // 更新卡片样式
    const item = document.getElementById(`item-${id}`);
    item.classList.remove('pass', 'fail');
    item.classList.add(result);

    evaluateScreen1();
}

function evaluateScreen(id) {
    const input = document.getElementById(`${id}-input`).value.trim();
    if (input) {
        state.screenResults[id] = state.screenResults[id] || {};
        state.screenResults[id].value = input;
    }
    evaluateScreen1();
}

function evaluateScreen1() {
    const total = screenItems.length;
    let passCount = 0;
    let failCount = 0;
    let unanswered = 0;

    screenItems.forEach(item => {
        const r = state.screenResults[item.id];
        if (r && r.pass === true) passCount++;
        else if (r && r.pass === false) failCount++;
        else unanswered++;
    });

    const badge = document.getElementById('step1Badge');
    const text = document.getElementById('step1Text');

    if (failCount > 0) {
        badge.className = 'result-badge fail';
        badge.textContent = '未通过';
        text.textContent = `${failCount}项未通过 — 建议放弃，不进入深度分析`;
        state.stepStatus[1] = 'fail';
    } else if (unanswered === 0 && passCount === total) {
        badge.className = 'result-badge pass';
        badge.textContent = '全部通过';
        text.textContent = '8项硬指标全部通过，进入护城河分析';
        state.stepStatus[1] = 'pass';
    } else {
        badge.className = 'result-badge';
        badge.textContent = '评估中';
        text.textContent = `已通过 ${passCount}/${total}，待评估 ${unanswered} 项`;
        state.stepStatus[1] = 'pending';
    }

    updateProgress();
}

// ==================== 第二步：护城河 ====================
function renderMoatGrid() {
    const container = document.getElementById('moatGrid');
    container.innerHTML = moatTypes.map(m => `
        <div class="moat-card" id="${m.id}" onclick="toggleMoat('${m.id}')">
            <div class="moat-icon">${m.icon}</div>
            <div class="moat-name">${m.name}</div>
            <div class="moat-feature">${m.feature}</div>
            <div class="moat-metric">${m.metric}</div>
        </div>
    `).join('');
}

function toggleMoat(id) {
    const idx = state.selectedMoats.indexOf(id);
    if (idx > -1) {
        state.selectedMoats.splice(idx, 1);
        document.getElementById(id).classList.remove('selected');
    } else {
        state.selectedMoats.push(id);
        document.getElementById(id).classList.add('selected');
    }
    evaluateMoat();
}

function evaluateMoat() {
    const badge = document.getElementById('step2Badge');
    const text = document.getElementById('step2Text');
    const avgROE = parseFloat(document.getElementById('avgROE').value);
    const avgGrossMargin = parseFloat(document.getElementById('avgGrossMargin').value);
    const fcfRatio = parseFloat(document.getElementById('fcfRatio').value);
    const marginTrend = document.getElementById('marginTrend').value;

    const hasMoat = state.selectedMoats.length > 0;
    let validations = 0;
    let totalValidations = 0;
    let validationDetails = [];

    if (!isNaN(avgROE)) {
        totalValidations++;
        if (avgROE > 15) { validations++; validationDetails.push('ROE>15%'); }
        else if (avgROE > 10) { validationDetails.push('ROE 10-15%'); }
        else { validationDetails.push('ROE<10%'); }
    }
    if (!isNaN(avgGrossMargin)) {
        totalValidations++;
        validationDetails.push(`毛利率${avgGrossMargin}%`);
    }
    if (!isNaN(fcfRatio)) {
        totalValidations++;
        if (fcfRatio > 5) { validations++; validationDetails.push('FCF/收入>5%'); }
        else { validationDetails.push('FCF/收入<5%'); }
    }
    if (marginTrend) {
        totalValidations++;
        if (marginTrend === 'stable') { validations++; validationDetails.push('毛利率稳定'); }
        else { validationDetails.push('毛利率下降'); }
    }

    if (!hasMoat && totalValidations === 0) {
        badge.className = 'result-badge';
        badge.textContent = '待评估';
        text.textContent = '请选择护城河类型并填写财务验证指标';
        state.stepStatus[2] = 'pending';
    } else if (!hasMoat) {
        badge.className = 'result-badge warning';
        badge.textContent = '无明确护城河';
        text.textContent = '未识别到护城河来源，要求60%安全边际或放弃';
        state.stepStatus[2] = 'fail';
    } else if (validations >= 3) {
        badge.className = 'result-badge pass';
        badge.textContent = '护城河稳固';
        text.textContent = `识别到${state.selectedMoats.length}个护城河，财务验证${validations}/${totalValidations}项达标 — ${validationDetails.join('、')}`;
        state.stepStatus[2] = 'pass';
    } else if (validations >= 1) {
        badge.className = 'result-badge warning';
        badge.textContent = '护城河待验证';
        text.textContent = `识别到${state.selectedMoats.length}个护城河，但财务验证仅${validations}/${totalValidations}项达标 — ${validationDetails.join('、')}`;
        state.stepStatus[2] = 'pending';
    } else {
        badge.className = 'result-badge warning';
        badge.textContent = '护城河待验证';
        text.textContent = `识别到${state.selectedMoats.length}个护城河，请补充财务验证指标`;
        state.stepStatus[2] = 'pending';
    }

    updateProgress();
}

// ==================== 第三步：财务三表 ====================
function bindFinancialInputs() {
    const ids = ['totalAssets', 'totalLiabilities', 'interestDebt', 'netAssets', 'cash',
        'goodwill', 'accountsReceivable', 'inventory', 'currentAssets', 'currentLiabilities',
        'contractLiabilities', 'revenue', 'operatingProfit', 'netProfit', 'nonRecurringProfit',
        'grossMargin', 'salesExpenseRatio', 'operatingCF', 'capex'];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                calcFreeCF();
                updateHealthCheck();
                evaluateStep3();
            });
        }
    });
}

function calcFreeCF() {
    const ocf = parseFloat(document.getElementById('operatingCF').value);
    const capex = parseFloat(document.getElementById('capex').value);
    const revenue = parseFloat(document.getElementById('revenue').value);

    if (!isNaN(ocf) && !isNaN(capex)) {
        const fcf = ocf - capex;
        document.getElementById('freeCF').value = fcf.toFixed(2) + ' ' + curUnit();

        if (!isNaN(revenue) && revenue > 0) {
            const ratio = (fcf / revenue * 100).toFixed(1);
            document.getElementById('fcfRevenueRatio').value = ratio + '%';
        }
    }
}

function updateHealthCheck() {
    const items = [];
    const industry = document.getElementById('stockIndustry').value;

    // 获取数据
    const totalAssets = parseFloat(document.getElementById('totalAssets').value);
    const totalLiabilities = parseFloat(document.getElementById('totalLiabilities').value);
    const interestDebt = parseFloat(document.getElementById('interestDebt').value);
    const netAssets = parseFloat(document.getElementById('netAssets').value);
    const cash = parseFloat(document.getElementById('cash').value);
    const goodwill = parseFloat(document.getElementById('goodwill').value);
    const accountsReceivable = parseFloat(document.getElementById('accountsReceivable').value);
    const inventory = parseFloat(document.getElementById('inventory').value);
    const currentAssets = parseFloat(document.getElementById('currentAssets').value);
    const currentLiabilities = parseFloat(document.getElementById('currentLiabilities').value);
    const contractLiabilities = parseFloat(document.getElementById('contractLiabilities').value);
    const revenue = parseFloat(document.getElementById('revenue').value);
    const operatingProfit = parseFloat(document.getElementById('operatingProfit').value);
    const netProfit = parseFloat(document.getElementById('netProfit').value);
    const nonRecurringProfit = parseFloat(document.getElementById('nonRecurringProfit').value);
    const grossMargin = parseFloat(document.getElementById('grossMargin').value);
    const operatingCF = parseFloat(document.getElementById('operatingCF').value);
    const capex = parseFloat(document.getElementById('capex').value);

    let dangerCount = 0;
    let warningCount = 0;
    let healthyCount = 0;

    // 1. 有息负债率
    if (!isNaN(interestDebt) && !isNaN(totalAssets) && totalAssets > 0) {
        const ratio = (interestDebt / totalAssets * 100).toFixed(1);
        if (interestDebt / totalAssets > 0.6) {
            items.push({ level: 'danger', icon: '🔴', text: `有息负债率 <strong>${ratio}%</strong> — 超过60%红线，偿债风险高` });
            dangerCount++;
        } else if (interestDebt / totalAssets > 0.4) {
            items.push({ level: 'warning', icon: '🟡', text: `有息负债率 <strong>${ratio}%</strong> — 偏高（40%-60%），需关注` });
            warningCount++;
        } else {
            items.push({ level: 'healthy', icon: '🟢', text: `有息负债率 <strong>${ratio}%</strong> — 健康（<40%）` });
            healthyCount++;
        }
    }

    // 2. 经营现金流 vs 净利润
    if (!isNaN(operatingCF) && !isNaN(netProfit)) {
        if (operatingCF >= netProfit) {
            items.push({ level: 'healthy', icon: '🟢', text: `经营现金流(${operatingCF}) ≥ 净利润(${netProfit}) — 现金流质量优秀` });
            healthyCount++;
        } else if (operatingCF >= netProfit * 0.8) {
            items.push({ level: 'warning', icon: '🟡', text: `经营现金流(${operatingCF}) < 净利润(${netProfit}) — 现金流略低于利润，需关注` });
            warningCount++;
        } else {
            items.push({ level: 'danger', icon: '🔴', text: `经营现金流(${operatingCF}) 远低于净利润(${netProfit}) — 利润质量存疑` });
            dangerCount++;
        }
    }

    // 3. 商誉/净资产
    if (!isNaN(goodwill) && !isNaN(netAssets) && netAssets > 0) {
        const ratio = (goodwill / netAssets * 100).toFixed(1);
        if (goodwill / netAssets > 0.4) {
            items.push({ level: 'danger', icon: '🔴', text: `商誉/净资产 <strong>${ratio}%</strong> — 超过40%，减值风险大` });
            dangerCount++;
        } else if (goodwill / netAssets > 0.2) {
            items.push({ level: 'warning', icon: '🟡', text: `商誉/净资产 <strong>${ratio}%</strong> — 偏高（20%-40%）` });
            warningCount++;
        } else {
            items.push({ level: 'healthy', icon: '🟢', text: `商誉/净资产 <strong>${ratio}%</strong> — 安全（<20%）` });
            healthyCount++;
        }
    }

    // 4. 应收账款/营业收入
    if (!isNaN(accountsReceivable) && !isNaN(revenue) && revenue > 0) {
        const ratio = (accountsReceivable / revenue * 100).toFixed(1);
        if (accountsReceivable / revenue > 0.5) {
            items.push({ level: 'danger', icon: '🔴', text: `应收账款/收入 <strong>${ratio}%</strong> — 超过50%，回款风险高` });
            dangerCount++;
        } else if (accountsReceivable / revenue > 0.3) {
            items.push({ level: 'warning', icon: '🟡', text: `应收账款/收入 <strong>${ratio}%</strong> — 偏高（30%-50%）` });
            warningCount++;
        } else {
            items.push({ level: 'healthy', icon: '🟢', text: `应收账款/收入 <strong>${ratio}%</strong> — 健康（<30%）` });
            healthyCount++;
        }
    }

    // 5. 存贷双高检测
    if (!isNaN(cash) && !isNaN(interestDebt) && !isNaN(totalAssets) && totalAssets > 0) {
        const cashRatio = cash / totalAssets;
        const debtRatio = interestDebt / totalAssets;
        if (cashRatio > 0.2 && debtRatio > 0.2) {
            items.push({ level: 'danger', icon: '🔴', text: `存贷双高预警 — 货币资金(${cash})和有息负债(${interestDebt})同时处于高位` });
            dangerCount++;
        }
    }

    // 6. 流动比率
    if (!isNaN(currentAssets) && !isNaN(currentLiabilities) && currentLiabilities > 0) {
        const ratio = (currentAssets / currentLiabilities).toFixed(2);
        if (currentAssets / currentLiabilities > 1.5) {
            items.push({ level: 'healthy', icon: '🟢', text: `流动比率 <strong>${ratio}</strong> — 短期偿债能力充足（>1.5）` });
            healthyCount++;
        } else {
            items.push({ level: 'warning', icon: '🟡', text: `流动比率 <strong>${ratio}</strong> — 偏低（<1.5），关注短期偿债` });
            warningCount++;
        }
    }

    // 7. 扣非净利占比
    if (!isNaN(nonRecurringProfit) && !isNaN(netProfit) && netProfit > 0) {
        const ratio = (nonRecurringProfit / netProfit * 100).toFixed(1);
        if (nonRecurringProfit / netProfit > 0.9) {
            items.push({ level: 'healthy', icon: '🟢', text: `扣非净利占比 <strong>${ratio}%</strong> — 利润质量高（>90%）` });
            healthyCount++;
        } else {
            items.push({ level: 'warning', icon: '🟡', text: `扣非净利占比 <strong>${ratio}%</strong> — 一次性损益占比偏高（<90%）` });
            warningCount++;
        }
    }

    // 8. 自由现金流
    if (!isNaN(operatingCF) && !isNaN(capex) && !isNaN(revenue) && revenue > 0) {
        const fcf = operatingCF - capex;
        const ratio = (fcf / revenue * 100).toFixed(1);
        if (fcf / revenue > 0.05) {
            items.push({ level: 'healthy', icon: '🟢', text: `自由现金流/收入 <strong>${ratio}%</strong> — 造血能力强（>5%）` });
            healthyCount++;
        } else if (fcf > 0) {
            items.push({ level: 'warning', icon: '🟡', text: `自由现金流/收入 <strong>${ratio}%</strong> — 偏低但为正` });
            warningCount++;
        } else {
            items.push({ level: 'danger', icon: '🔴', text: `自由现金流为负（${fcf.toFixed(2)}亿）— 需核实是否为高速扩张期` });
            dangerCount++;
        }
    }

    // 9. 合同负债趋势（如果有数据）
    if (!isNaN(contractLiabilities) && !isNaN(revenue) && revenue > 0) {
        const ratio = (contractLiabilities / revenue * 100).toFixed(1);
        if (contractLiabilities / revenue > 0.1) {
            items.push({ level: 'healthy', icon: '🟢', text: `合同负债/收入 <strong>${ratio}%</strong> — 预收款项充裕，下游需求旺` });
            healthyCount++;
        }
    }

    // 渲染
    const container = document.getElementById('healthItems');
    if (items.length === 0) {
        container.innerHTML = '<p class="placeholder-text">填写财务数据后自动检测</p>';
    } else {
        container.innerHTML = items.map(item => `
            <div class="health-item ${item.level}">
                <span class="health-icon">${item.icon}</span>
                <span class="health-text">${item.text}</span>
            </div>
        `).join('');
    }

    const result = { dangerCount, warningCount, healthyCount, items };
    state.lastHealthCheck = result; // 缓存供 renderHealthRadar 使用
    return result;
}

function evaluateStep3() {
    const badge = document.getElementById('step3Badge');
    const text = document.getElementById('step3Text');
    const { dangerCount, warningCount, healthyCount } = updateHealthCheck();

    // 渲染健康雷达图
    renderHealthRadar();

    if (dangerCount > 0) {
        badge.className = 'result-badge fail';
        badge.textContent = '存在风险信号';
        text.textContent = `检测到${dangerCount}项危险信号，建议放弃或深入排查`;
        state.stepStatus[3] = 'fail';
    } else if (warningCount > 0) {
        badge.className = 'result-badge warning';
        badge.textContent = '需关注';
        text.textContent = `${healthyCount}项健康，${warningCount}项需关注`;
        state.stepStatus[3] = 'pending';
    } else if (healthyCount >= 3) {
        badge.className = 'result-badge pass';
        badge.textContent = '财务健康';
        text.textContent = `${healthyCount}项指标全部健康，三表协调性良好`;
        state.stepStatus[3] = 'pass';
    } else {
        badge.className = 'result-badge';
        badge.textContent = '待评估';
        text.textContent = '请填写更多财务数据';
        state.stepStatus[3] = 'pending';
    }

    updateProgress();
}

// ==================== 第四步：管理层评估 ====================
function renderManagementGrid() {
    const container = document.getElementById('managementGrid');
    container.innerHTML = managementDimensions.map(d => `
        <div class="mgmt-card">
            <h3>${d.title}</h3>
            <p class="mgmt-question">${d.question}</p>
            <div class="mgmt-signals">
                <div class="signal-box good" id="${d.id}-good" onclick="setMgmtResult('${d.id}', 'good')">
                    <div class="signal-title">${d.good.title}</div>
                    <div class="signal-desc">${d.good.desc}</div>
                </div>
                <div class="signal-box bad" id="${d.id}-bad" onclick="setMgmtResult('${d.id}', 'bad')">
                    <div class="signal-title">${d.bad.title}</div>
                    <div class="signal-desc">${d.bad.desc}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function setMgmtResult(id, result) {
    state.mgmtResults[id] = result;
    document.getElementById(`${id}-good`).classList.remove('selected');
    document.getElementById(`${id}-bad`).classList.remove('selected');
    document.getElementById(`${id}-${result}`).classList.add('selected');
    evaluateStep4();
}

function evaluateStep4() {
    const badge = document.getElementById('step4Badge');
    const text = document.getElementById('step4Text');
    const dims = managementDimensions.length;
    let goodCount = 0;
    let badCount = 0;
    let answered = 0;

    managementDimensions.forEach(d => {
        if (state.mgmtResults[d.id]) {
            answered++;
            if (state.mgmtResults[d.id] === 'good') goodCount++;
            else badCount++;
        }
    });

    if (answered === 0) {
        badge.className = 'result-badge';
        badge.textContent = '待评估';
        text.textContent = '请评估三个维度';
        state.stepStatus[4] = 'pending';
    } else if (badCount >= 2) {
        badge.className = 'result-badge fail';
        badge.textContent = '管理层存疑';
        text.textContent = `${badCount}个维度出现红牌信号，管理层可信度低`;
        state.stepStatus[4] = 'fail';
    } else if (goodCount === dims) {
        badge.className = 'result-badge pass';
        badge.textContent = '管理层可靠';
        text.textContent = '三个维度均无红牌，管理层值得信任';
        state.stepStatus[4] = 'pass';
    } else if (answered === dims) {
        badge.className = 'result-badge warning';
        badge.textContent = '基本可靠';
        text.textContent = `${goodCount}好/${badCount}差，存在1个需关注的信号`;
        state.stepStatus[4] = 'pending';
    } else {
        badge.className = 'result-badge';
        badge.textContent = '评估中';
        text.textContent = `已评估 ${answered}/${dims} 个维度`;
        state.stepStatus[4] = 'pending';
    }

    updateProgress();
}

// ==================== 第五步：估值与安全边际 ====================
function bindValuationInputs() {
    const ids = ['currentPE', 'historicalPE', 'industryPE', 'currentPB', 'historicalPB', 'industryPB',
        'dcfFCF', 'growthRate', 'discountRate', 'terminalGrowth', 'totalShares',
        'safetyMargin', 'currentPrice'];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateValuation);
            el.addEventListener('change', updateValuation);
        }
    });
}

function updateValuation() {
    try { updateRelativeValuation(); } catch(e) { console.error('updateRelativeValuation:', e); }
    try { updateDCFValuation(); } catch(e) { console.error('updateDCFValuation:', e); }
    try { updateSafetyMargin(); } catch(e) { console.error('updateSafetyMargin:', e); }
    try { renderValuationBar(); } catch(e) { console.error('renderValuationBar:', e); }
    try { evaluateStep5(); } catch(e) { console.error('evaluateStep5:', e); }
}

function updateRelativeValuation() {
    const currentPE = parseFloat(document.getElementById('currentPE').value);
    const historicalPE = parseFloat(document.getElementById('historicalPE').value);
    const industryPE = parseFloat(document.getElementById('industryPE').value);
    const verdict = document.getElementById('relativeVerdict');

    // PE 判断
    if (isNaN(currentPE) || isNaN(historicalPE)) {
        verdict.textContent = '填写PE数据后自动判断';
        verdict.className = 'valuation-verdict';
    } else {
        const ratio = currentPE / historicalPE;
        let text = '';
        let cls = '';

        if (ratio < 0.8) {
            text = `当前PE(${currentPE}) 低于历史中枢(${historicalPE})的20%以上 — 初步判断低估`;
            cls = 'cheap';
        } else if (ratio > 1.2) {
            text = `当前PE(${currentPE}) 高于历史中枢(${historicalPE})的20% — 偏贵`;
            cls = 'expensive';
        } else {
            text = `当前PE(${currentPE}) 接近历史中枢(${historicalPE}) — 估值合理`;
            cls = 'fair';
        }

        if (!isNaN(industryPE)) {
            if (currentPE < industryPE * 0.9) {
                text += `；低于行业均值(${industryPE})`;
            } else if (currentPE > industryPE * 1.1) {
                text += `；高于行业均值(${industryPE})`;
            }
        }

        verdict.textContent = text;
        verdict.className = 'valuation-verdict ' + cls;
    }

    // PB 判断
    const currentPB = parseFloat(document.getElementById('currentPB').value);
    const historicalPB = parseFloat(document.getElementById('historicalPB').value);
    const industryPB = parseFloat(document.getElementById('industryPB').value);
    const pbVerdict = document.getElementById('pbVerdict');

    if (isNaN(currentPB) || isNaN(historicalPB)) {
        pbVerdict.textContent = '填写PB数据后自动判断';
        pbVerdict.className = 'valuation-verdict';
    } else {
        const pbRatio = currentPB / historicalPB;
        let pbText = '';
        let pbCls = '';

        if (pbRatio < 0.8) {
            pbText = `当前PB(${currentPB}) 低于历史中枢(${historicalPB})的20%以上 — 低估`;
            pbCls = 'cheap';
        } else if (pbRatio > 1.2) {
            pbText = `当前PB(${currentPB}) 高于历史中枢(${historicalPB})的20% — 偏贵`;
            pbCls = 'expensive';
        } else {
            pbText = `当前PB(${currentPB}) 接近历史中枢(${historicalPB}) — 合理`;
            pbCls = 'fair';
        }

        if (!isNaN(industryPB)) {
            if (currentPB < industryPB * 0.9) {
                pbText += `；低于行业均值(${industryPB})`;
            } else if (currentPB > industryPB * 1.1) {
                pbText += `；高于行业均值(${industryPB})`;
            }
        }

        pbVerdict.textContent = pbText;
        pbVerdict.className = 'valuation-verdict ' + pbCls;
    }
}

// DCF公共计算函数：未来10年现金流折现 + 永续价值
// 参数均为小数形式（如 0.1 表示 10%）
// 返回 { intrinsicValue, perShareValue } 或 null（参数无效时）
function calcDCF(fcf, growth, discount, terminal, totalShares) {
    if (isNaN(fcf) || isNaN(growth) || isNaN(discount) || isNaN(terminal)) return null;
    if (growth >= discount) return null;
    if (terminal >= discount) return null;

    let pvSum = 0;
    const years = 10;
    for (let i = 1; i <= years; i++) {
        pvSum += fcf * Math.pow(1 + growth, i) / Math.pow(1 + discount, i);
    }
    const terminalFCF = fcf * Math.pow(1 + growth, years) * (1 + terminal);
    const terminalValue = terminalFCF / (discount - terminal);
    const intrinsicValue = pvSum + terminalValue / Math.pow(1 + discount, years);

    const perShareValue = (!isNaN(totalShares) && totalShares > 0) ? intrinsicValue / totalShares : null;
    return { intrinsicValue, perShareValue };
}

function updateDCFValuation() {
    const fcf = parseFloat(document.getElementById('dcfFCF').value);
    const growth = parseFloat(document.getElementById('growthRate').value) / 100;
    const discount = parseFloat(document.getElementById('discountRate').value) / 100;
    const terminal = (parseFloat(document.getElementById('terminalGrowth').value) || 3) / 100;
    const totalShares = parseFloat(document.getElementById('totalShares').value);

    const intrinsicEl = document.getElementById('intrinsicValue');
    const perShareEl = document.getElementById('perShareValue');

    const result = calcDCF(fcf, growth, discount, terminal, totalShares);

    if (!result) {
        if (growth >= discount) {
            intrinsicEl.textContent = '增长率≥折现率，请调整参数';
        } else if (terminal >= discount) {
            intrinsicEl.textContent = '永续增长率≥折现率，请调整参数';
        } else {
            intrinsicEl.textContent = '—';
        }
        perShareEl.textContent = '—';
        return;
    }

    intrinsicEl.textContent = result.intrinsicValue.toFixed(2) + ' ' + curUnit();

    if (result.perShareValue !== null) {
        perShareEl.textContent = result.perShareValue.toFixed(2) + ' ' + curPerShare();
    } else {
        perShareEl.textContent = '请填写总股本';
    }
}

function updateSafetyMargin() {
    const fcf = parseFloat(document.getElementById('dcfFCF').value);
    const growth = parseFloat(document.getElementById('growthRate').value) / 100;
    const discount = parseFloat(document.getElementById('discountRate').value) / 100;
    const terminal = (parseFloat(document.getElementById('terminalGrowth').value) || 3) / 100;
    const totalShares = parseFloat(document.getElementById('totalShares').value);
    const margin = parseFloat(document.getElementById('safetyMargin').value);
    const currentPrice = parseFloat(document.getElementById('currentPrice').value);

    // 计算内在价值
    const result = calcDCF(fcf, growth, discount, terminal, totalShares);
    if (!result || result.perShareValue === null || isNaN(margin)) {
        document.getElementById('buyPrice').textContent = '—';
        document.getElementById('buyPriceDetail').textContent = '请先完成DCF估值参数';
        document.getElementById('priceComparison').innerHTML = '';
        return;
    }

    const perShareValue = result.perShareValue;
    const buyPrice = perShareValue * (1 - margin);

    document.getElementById('buyPrice').innerHTML = `<span class="currency">${curSym()}</span>${buyPrice.toFixed(2)}`;
    document.getElementById('buyPriceDetail').textContent = `内在价值 ${curSym()}${perShareValue.toFixed(2)} × 安全边际 ${(margin * 100)}%`;

    // 价格对比
    const compContainer = document.getElementById('priceComparison');
    if (!isNaN(currentPrice) && currentPrice > 0) {
        const discount_premium = ((buyPrice - currentPrice) / currentPrice * 100).toFixed(1);
        const isDiscount = buyPrice > currentPrice;
        compContainer.innerHTML = `
            <div class="price-comp-item">
                <div class="price-comp-label">当前股价</div>
                <div class="price-comp-value">${curSym()}${currentPrice.toFixed(2)}</div>
            </div>
            <div class="price-comp-item">
                <div class="price-comp-label">买入价</div>
                <div class="price-comp-value">${curSym()}${buyPrice.toFixed(2)}</div>
            </div>
            <div class="price-comp-item">
                <div class="price-comp-label">${isDiscount ? '安全边际空间' : '超出买入价'}</div>
                <div class="price-comp-value ${isDiscount ? 'down' : 'up'}">${isDiscount ? '+' : ''}${discount_premium}%</div>
            </div>
        `;
    } else {
        compContainer.innerHTML = '<p class="placeholder-text">填写当前股价后对比</p>';
    }
}

function evaluateStep5() {
    const badge = document.getElementById('step5Badge');
    const text = document.getElementById('step5Text');

    const fcf = parseFloat(document.getElementById('dcfFCF').value);
    const growth = parseFloat(document.getElementById('growthRate').value);
    const discount = parseFloat(document.getElementById('discountRate').value);
    const terminal = parseFloat(document.getElementById('terminalGrowth').value) || 3;
    const totalShares = parseFloat(document.getElementById('totalShares').value);
    const currentPrice = parseFloat(document.getElementById('currentPrice').value);
    const margin = parseFloat(document.getElementById('safetyMargin').value);

    if (isNaN(fcf) || isNaN(growth) || isNaN(discount) || isNaN(totalShares)) {
        badge.className = 'result-badge';
        badge.textContent = '待评估';
        text.textContent = '请完成DCF估值参数';
        state.stepStatus[5] = 'pending';
        updateProgress();
        return;
    }

    if (growth >= discount) {
        badge.className = 'result-badge warning';
        badge.textContent = '参数异常';
        text.textContent = '增长率不能大于等于折现率，请调整';
        state.stepStatus[5] = 'pending';
        updateProgress();
        return;
    }

    if (terminal >= discount) {
        badge.className = 'result-badge warning';
        badge.textContent = '参数异常';
        text.textContent = '永续增长率不能大于等于折现率，请调整';
        state.stepStatus[5] = 'pending';
        updateProgress();
        return;
    }

    // 通过公共函数计算DCF
    const result = calcDCF(fcf, growth / 100, discount / 100, terminal / 100, totalShares);
    if (!result || result.perShareValue === null || isNaN(margin)) {
        badge.className = 'result-badge';
        badge.textContent = '待评估';
        text.textContent = '请检查DCF参数和安全边际设置';
        state.stepStatus[5] = 'pending';
        updateProgress();
        return;
    }

    const perShare = result.perShareValue;
    const buyPrice = perShare * (1 - margin);

    if (!isNaN(currentPrice) && currentPrice > 0) {
        if (currentPrice <= buyPrice) {
            badge.className = 'result-badge pass';
            badge.textContent = '达到买入价';
            text.textContent = `当前价 ${curSym()}${currentPrice} ≤ 买入价 ${curSym()}${buyPrice.toFixed(2)}，安全边际充足`;
            state.stepStatus[5] = 'pass';
        } else {
            const gap = ((currentPrice - buyPrice) / buyPrice * 100).toFixed(1);
            badge.className = 'result-badge warning';
            badge.textContent = '尚未到价';
            text.textContent = `当前价 ${curSym()}${currentPrice} 高于买入价 ${curSym()}${buyPrice.toFixed(2)}，溢价 ${gap}%，建议等待`;
            state.stepStatus[5] = 'pending';
        }
    } else {
        badge.className = 'result-badge pass';
        badge.textContent = '估值完成';
        text.textContent = `内在价值 ${curSym()}${perShare.toFixed(2)}/股，建议买入价 ${curSym()}${buyPrice.toFixed(2)}/股`;
        state.stepStatus[5] = 'pass';
    }

    updateProgress();
}

// ==================== 第六步：综合报告 ====================
function generateReport() {
    const stockName = document.getElementById('stockName').value || '未命名';
    const stockCode = document.getElementById('stockCode').value || '—';
    const industry = document.getElementById('stockIndustry').value || '未分类';
    const currentPrice = parseFloat(document.getElementById('currentPrice').value);

    // 汇总各步骤结果
    const step1Pass = state.stepStatus[1] === 'pass';
    const step1Fail = state.stepStatus[1] === 'fail';
    const hasMoat = state.selectedMoats.length > 0;
    const step3Result = updateHealthCheck();
    const step3HealthItems = step3Result.items || [];
    const step4GoodCount = managementDimensions.filter(d => state.mgmtResults[d.id] === 'good').length;
    const step4BadCount = managementDimensions.filter(d => state.mgmtResults[d.id] === 'bad').length;

    // 估值结果
    const fcf = parseFloat(document.getElementById('dcfFCF').value);
    const growth = parseFloat(document.getElementById('growthRate').value) / 100;
    const discount = parseFloat(document.getElementById('discountRate').value) / 100;
    const terminal = (parseFloat(document.getElementById('terminalGrowth').value) || 3) / 100;
    const totalShares = parseFloat(document.getElementById('totalShares').value);
    const margin = parseFloat(document.getElementById('safetyMargin').value);

    let intrinsicPerShare = 0;
    let buyPrice = 0;
    const dcfResult = calcDCF(fcf, growth, discount, terminal, totalShares);
    if (dcfResult && dcfResult.perShareValue !== null && !isNaN(margin)) {
        intrinsicPerShare = dcfResult.perShareValue;
        buyPrice = intrinsicPerShare * (1 - margin);
    }

    // 综合评分
    let score = 0;
    if (step1Pass) score += 20;
    else if (step1Fail) score -= 30;
    if (hasMoat) score += 25;
    if (state.selectedMoats.length > 1) score += 5;
    if (step3Result.healthyCount >= 3) score += 20;
    if (step3Result.dangerCount > 0) score -= 20 * step3Result.dangerCount;
    if (step4GoodCount === 3) score += 15;
    if (step4BadCount >= 2) score -= 15;
    if (!isNaN(currentPrice) && buyPrice > 0) {
        if (currentPrice <= buyPrice) score += 15;
        else score += 5;
    }
    score = Math.max(0, Math.min(100, score + 20)); // 基础分20

    // 存储评分供自选股使用
    state.lastScore = score;

    // 结论
    let conclusion, conclusionClass, reasons;
    if (step1Fail || step3Result.dangerCount >= 2 || step4BadCount >= 2) {
        conclusion = '建议放弃';
        conclusionClass = 'reject';
        reasons = [];
        if (step1Fail) reasons.push('十分钟初筛未通过');
        if (step3Result.dangerCount >= 2) reasons.push(`财务检测发现${step3Result.dangerCount}项危险信号`);
        if (step4BadCount >= 2) reasons.push('管理层评估出现多处红牌');
    } else if (score >= 70 && (!isNaN(currentPrice) ? currentPrice <= buyPrice : true)) {
        conclusion = '建议买入';
        conclusionClass = 'buy';
        reasons = [];
        if (step1Pass) reasons.push('十分钟初筛8项全通过');
        if (hasMoat) reasons.push(`识别到${state.selectedMoats.length}个护城河来源`);
        if (step3Result.healthyCount >= 3) reasons.push(`财务健康度良好（${step3Result.healthyCount}项达标）`);
        if (step4GoodCount >= 2) reasons.push('管理层评估基本可靠');
        if (!isNaN(currentPrice) && buyPrice > 0 && currentPrice <= buyPrice) {
            reasons.push(`当前价格处于安全边际范围内（买入价${curSym()}${buyPrice.toFixed(2)}）`);
        }
    } else {
        conclusion = '建议观望';
        conclusionClass = 'watch';
        reasons = [];
        if (!step1Pass && !step1Fail) reasons.push('初筛部分指标待确认');
        if (!hasMoat) reasons.push('尚未识别到明确护城河');
        if (step3Result.warningCount > 0) reasons.push(`财务有${step3Result.warningCount}项需关注`);
        if (!isNaN(currentPrice) && buyPrice > 0 && currentPrice > buyPrice) {
            const gap = ((currentPrice - buyPrice) / buyPrice * 100).toFixed(1);
            reasons.push(`当前价格高于买入价${gap}%，未达安全边际`);
        }
    }

    if (reasons.length === 0) reasons.push('分析数据不完整，请补充更多指标');

    // 存储结论供自选股使用
    state.lastConclusion = conclusion;

    // 风险提示
    const risks = [];
    if (step3Result.dangerCount > 0) risks.push('财务检测存在危险信号，需进一步排查');
    if (step3Result.warningCount > 0) risks.push(`${step3Result.warningCount}项财务指标处于警戒区间`);
    if (step4BadCount > 0) risks.push('管理层存在1个以上红牌信号');
    if (!hasMoat) risks.push('未识别到明确护城河，长期竞争力存疑');
    if (!isNaN(currentPrice) && buyPrice > 0 && currentPrice > buyPrice * 1.3) risks.push('当前估值偏高，存在估值回归风险');
    if (risks.length === 0) risks.push('本分析基于公开财务数据，无法排除精心策划的财务欺诈');
    if (risks.length < 2) risks.push('行业政策变化或宏观周期波动可能影响公司基本面');

    // 护城河名称
    const moatNames = state.selectedMoats.map(id => {
        const m = moatTypes.find(mt => mt.id === id);
        return m ? m.name : '';
    }).filter(n => n);

    // 评分等级
    const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
    const scoreLabel = score >= 70 ? '优质标的' : score >= 40 ? '中等偏上' : '风险较高';

    // 渲染报告
    const container = document.getElementById('reportContainer');
    container.innerHTML = `
        <div class="report-content">
            <!-- 最终结论 -->
            <div class="report-conclusion ${conclusionClass}">
                <div class="conclusion-label">${stockName}（${stockCode}）· ${industry}</div>
                <div class="conclusion-title">${conclusion}</div>
                <div class="conclusion-reasons">
                    ${reasons.map(r => `• ${r}`).join('<br>')}
                </div>
            </div>

            <!-- 综合评分 -->
            <div class="report-card">
                <div class="report-section-title">综合评分</div>
                <div class="score-display">
                    <div class="score-circle ${scoreClass}">${score}</div>
                    <div class="score-label">
                        <strong>${scoreLabel}</strong>
                        基于五步分析法综合量化打分（满分100）
                    </div>
                </div>
            </div>

            <!-- 图表区 -->
            <div class="report-charts">
                <div class="report-chart-card">
                    <h4>综合评分</h4>
                    <div class="chart-container" style="max-width:240px;">
                        <canvas id="reportScoreChart"></canvas>
                    </div>
                </div>
                ${intrinsicPerShare > 0 ? `
                <div class="report-chart-card">
                    <h4>估值对比</h4>
                    <table class="valuation-compare-table">
                        <thead><tr><th>项目</th><th>价格（${curPerShare()}）</th><th>判断</th></tr></thead>
                        <tbody>
                            <tr><td class="vc-label">每股内在价值</td><td class="vc-value">${curSym()}${intrinsicPerShare.toFixed(2)}</td><td><span class="vc-tag fair">基准</span></td></tr>
                            <tr><td class="vc-label">安全边际买入价</td><td class="vc-value">${curSym()}${buyPrice.toFixed(2)}</td><td>${(() => {
                                let buyTagClass = 'cheap', buyTagText = '建议买入';
                                if (!isNaN(currentPrice) && currentPrice > 0) {
                                    if (currentPrice <= buyPrice) {
                                        buyTagClass = 'cheap';
                                        buyTagText = '可买入';
                                    } else {
                                        const overPct = ((currentPrice - buyPrice) / buyPrice * 100).toFixed(1);
                                        if (currentPrice <= intrinsicPerShare) {
                                            buyTagClass = 'fair';
                                            buyTagText = `等待回调 +${overPct}%`;
                                        } else {
                                            buyTagClass = 'expensive';
                                            buyTagText = `已高估 +${overPct}%`;
                                        }
                                    }
                                }
                                return `<span class="vc-tag ${buyTagClass}">${buyTagText}</span>`;
                            })()}</td></tr>
                            ${!isNaN(currentPrice) && currentPrice > 0 ? `
                            <tr><td class="vc-label">当前股价</td><td class="vc-value ${currentPrice <= buyPrice ? 'cheap' : currentPrice <= intrinsicPerShare ? 'fair' : 'expensive'}">${curSym()}${currentPrice.toFixed(2)}</td><td><span class="vc-tag ${currentPrice <= buyPrice ? 'cheap' : currentPrice <= intrinsicPerShare ? 'fair' : 'expensive'}">${currentPrice <= buyPrice ? '低估' : currentPrice <= intrinsicPerShare ? '合理偏高' : '高估'}</span></td></tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
                ` : ''}
                ${state.historyData && state.historyData.length > 0 ? `
                <div class="report-chart-card full-width">
                    <h4>近5年营收与净利润趋势</h4>
                    <div class="chart-container" style="max-width:700px;">
                        <canvas id="reportTrendChart"></canvas>
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- 五步分析摘要 -->
            <div class="report-card">
                <div class="report-section-title">五步分析摘要</div>
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>步骤</th>
                            <th>分析项</th>
                            <th>结果</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>第一步</td>
                            <td>十分钟初筛（8项硬指标）</td>
                            <td>${step1Pass ? '8项全通过' : step1Fail ? '存在未通过项' : '部分待确认'}</td>
                            <td class="status-${state.stepStatus[1] === 'pass' ? 'pass' : state.stepStatus[1] === 'fail' ? 'fail' : 'warning'}">
                                ${state.stepStatus[1] === 'pass' ? '✓ 通过' : state.stepStatus[1] === 'fail' ? '✗ 未通过' : '⚠ 待确认'}
                            </td>
                        </tr>
                        <tr>
                            <td>第二步</td>
                            <td>护城河判断</td>
                            <td>${moatNames.length > 0 ? moatNames.join('、') : '未识别'}</td>
                            <td class="status-${hasMoat ? 'pass' : 'warning'}">${hasMoat ? '✓ 有护城河' : '⚠ 无明确护城河'}</td>
                        </tr>
                        <tr>
                            <td>第三步</td>
                            <td>财务三表透视</td>
                            <td>${step3Result.healthyCount}健康 / ${step3Result.warningCount}关注 / ${step3Result.dangerCount}危险</td>
                            <td class="status-${step3Result.dangerCount > 0 ? 'fail' : step3Result.warningCount > 0 ? 'warning' : 'pass'}">
                                ${step3Result.dangerCount > 0 ? '✗ 有危险信号' : step3Result.warningCount > 0 ? '⚠ 需关注' : '✓ 健康'}
                            </td>
                        </tr>
                        <tr>
                            <td>第四步</td>
                            <td>管理层评估</td>
                            <td>${step4GoodCount}好 / ${step4BadCount}差 / ${3 - step4GoodCount - step4BadCount}未评</td>
                            <td class="status-${step4BadCount >= 2 ? 'fail' : step4GoodCount === 3 ? 'pass' : 'warning'}">
                                ${step4BadCount >= 2 ? '✗ 存疑' : step4GoodCount === 3 ? '✓ 可靠' : '⚠ 基本可靠'}
                            </td>
                        </tr>
                        <tr>
                            <td>第五步</td>
                            <td>估值与安全边际</td>
                            <td>${intrinsicPerShare > 0 ? `内在价值${curSym()}${intrinsicPerShare.toFixed(2)}/股，买入价${curSym()}${buyPrice.toFixed(2)}/股` : '未完成'}</td>
                            <td class="status-${intrinsicPerShare > 0 ? 'pass' : 'warning'}">
                                ${intrinsicPerShare > 0 ? '✓ 已估值' : '⚠ 待完成'}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 第一步详细：十分钟初筛 -->
            <div class="report-card">
                <div class="report-section-title">第一步 · 十分钟初筛明细</div>
                <table class="report-table">
                    <thead><tr><th>指标</th><th>说明</th><th>数值</th><th>结果</th></tr></thead>
                    <tbody>
                        ${screenItems.map(item => {
                            const r = state.screenResults[item.id] || {};
                            const val = r.value !== undefined ? r.value + (item.unit || '') : '—';
                            let st, sc;
                            if (r.pass === true) { st = '✓ 通过'; sc = 'status-pass'; }
                            else if (r.pass === false) { st = '✗ 未通过'; sc = 'status-fail'; }
                            else { st = '⚠ 待确认'; sc = 'status-warning'; }
                            return `<tr><td>${item.title}</td><td style="font-size:12px;color:var(--color-text-secondary);">${item.desc}</td><td>${val}</td><td class="${sc}">${st}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- 第二步详细：护城河判断 -->
            <div class="report-card">
                <div class="report-section-title">第二步 · 护城河判断明细</div>
                <table class="report-table">
                    <thead><tr><th>护城河类型</th><th>特征</th><th>识别</th></tr></thead>
                    <tbody>
                        ${moatTypes.map(m => {
                            const sel = state.selectedMoats.includes(m.id);
                            return `<tr><td>${m.icon} ${m.name}</td><td style="font-size:12px;color:var(--color-text-secondary);">${m.feature}</td><td class="${sel ? 'status-pass' : ''}">${sel ? '✓ 已识别' : '—'}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
                <table class="report-table" style="margin-top:14px;">
                    <thead><tr><th>验证指标</th><th>数值</th><th>标准</th></tr></thead>
                    <tbody>
                        <tr><td>ROE（近5年平均）</td><td>${document.getElementById('avgROE').value || '—'}</td><td style="font-size:12px;color:var(--color-text-muted);">＞15%</td></tr>
                        <tr><td>毛利率（近5年平均）</td><td>${document.getElementById('avgGrossMargin').value || '—'}</td><td style="font-size:12px;color:var(--color-text-muted);">稳定或上行</td></tr>
                        <tr><td>自由现金流/销售收入</td><td>${document.getElementById('fcfRatio').value || '—'}</td><td style="font-size:12px;color:var(--color-text-muted);">＞5%</td></tr>
                        <tr><td>毛利率趋势</td><td>${document.getElementById('marginTrend').value === 'stable' ? '稳定或上行' : document.getElementById('marginTrend').value === 'declining' ? '持续下降' : '—'}</td><td style="font-size:12px;color:var(--color-text-muted);">趋势判断</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- 第三步详细：财务三表透视 -->
            <div class="report-card">
                <div class="report-section-title">第三步 · 财务三表明细</div>
                <table class="report-table">
                    <thead><tr><th>资产负债表（${curUnit()}）</th><th>数值</th><th>利润表（${curUnit()}）</th><th>数值</th></tr></thead>
                    <tbody>
                        <tr><td>总资产</td><td>${document.getElementById('totalAssets').value || '—'}</td><td>营业收入</td><td>${document.getElementById('revenue').value || '—'}</td></tr>
                        <tr><td>总负债</td><td>${document.getElementById('totalLiabilities').value || '—'}</td><td>营业利润</td><td>${document.getElementById('operatingProfit').value || '—'}</td></tr>
                        <tr><td>有息负债</td><td>${document.getElementById('interestDebt').value || '—'}</td><td>净利润</td><td>${document.getElementById('netProfit').value || '—'}</td></tr>
                        <tr><td>净资产</td><td>${document.getElementById('netAssets').value || '—'}</td><td>扣非净利润</td><td>${document.getElementById('nonRecurringProfit').value || '—'}</td></tr>
                        <tr><td>货币资金</td><td>${document.getElementById('cash').value || '—'}</td><td>毛利率</td><td>${document.getElementById('grossMargin').value || '—'}%</td></tr>
                        <tr><td>商誉</td><td>${document.getElementById('goodwill').value || '—'}</td><td>销售费用率</td><td>${document.getElementById('salesExpenseRatio').value || '—'}%</td></tr>
                        <tr><td>应收账款</td><td>${document.getElementById('accountsReceivable').value || '—'}</td><td>经营现金流</td><td>${document.getElementById('operatingCF').value || '—'}</td></tr>
                        <tr><td>存货</td><td>${document.getElementById('inventory').value || '—'}</td><td>资本支出</td><td>${document.getElementById('capex').value || '—'}</td></tr>
                        <tr><td>流动资产</td><td>${document.getElementById('currentAssets').value || '—'}</td><td>自由现金流</td><td>${document.getElementById('freeCF').value || '—'}</td></tr>
                        <tr><td>流动负债</td><td>${document.getElementById('currentLiabilities').value || '—'}</td><td>FCF/收入</td><td>${document.getElementById('fcfRevenueRatio').value || '—'}</td></tr>
                        <tr><td>合同负债</td><td>${document.getElementById('contractLiabilities').value || '—'}</td><td></td><td></td></tr>
                    </tbody>
                </table>
            </div>

            <!-- 第三步健康检测 -->
            <div class="report-card">
                <div class="report-section-title">第三步 · 财务健康检测</div>
                <div class="risk-list">
                    ${step3HealthItems.length > 0 ? step3HealthItems.map(item => `
                        <div class="risk-item" style="border-left-color:${item.level === 'danger' ? 'var(--color-danger)' : item.level === 'warning' ? 'var(--color-warning)' : 'var(--color-success)'};background:${item.level === 'danger' ? 'var(--color-danger-bg)' : item.level === 'warning' ? 'var(--color-warning-bg)' : 'var(--color-success-bg)'};">
                            <span class="risk-icon">${item.icon}</span>
                            <span class="risk-text">${item.text}</span>
                        </div>
                    `).join('') : '<p class="placeholder-text">未填写财务数据</p>'}
                </div>
            </div>

            <!-- 第四步详细：管理层评估 -->
            <div class="report-card">
                <div class="report-section-title">第四步 · 管理层评估明细</div>
                <table class="report-table">
                    <thead><tr><th>维度</th><th>评估问题</th><th>结果</th><th>信号说明</th></tr></thead>
                    <tbody>
                        ${managementDimensions.map(d => {
                            const result = state.mgmtResults[d.id];
                            let st, sc, desc;
                            if (result === 'good') { st = '✓ 好信号'; sc = 'status-pass'; desc = d.good.desc; }
                            else if (result === 'bad') { st = '✗ 红牌'; sc = 'status-fail'; desc = d.bad.desc; }
                            else { st = '⚠ 未评估'; sc = 'status-warning'; desc = '—'; }
                            return `<tr><td>${d.title}</td><td style="font-size:12px;color:var(--color-text-secondary);">${d.question}</td><td class="${sc}">${st}</td><td style="font-size:12px;color:var(--color-text-secondary);">${desc}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- 第五步详细：估值与安全边际 -->
            <div class="report-card">
                <div class="report-section-title">第五步 · 估值参数明细</div>
                <table class="report-table">
                    <thead><tr><th>相对估值</th><th>数值</th><th>绝对估值（DCF）</th><th>数值</th></tr></thead>
                    <tbody>
                        <tr><td>当前PE（市盈率）</td><td>${document.getElementById('currentPE').value || '—'}</td><td>自由现金流（${curUnit()}）</td><td>${document.getElementById('dcfFCF').value || '—'}</td></tr>
                        <tr><td>历史PE中枢</td><td>${document.getElementById('historicalPE').value || '—'}</td><td>预期增长率</td><td>${document.getElementById('growthRate').value || '—'}%</td></tr>
                        <tr><td>行业平均PE</td><td>${document.getElementById('industryPE').value || '—'}</td><td>折现率</td><td>${document.getElementById('discountRate').value || '—'}%</td></tr>
                        <tr><td>当前PB（市净率）</td><td>${document.getElementById('currentPB').value || '—'}</td><td>永续增长率</td><td>${document.getElementById('terminalGrowth').value || '—'}%</td></tr>
                        <tr><td>历史PB中枢</td><td>${document.getElementById('historicalPB').value || '—'}</td><td>总股本（亿股）</td><td>${document.getElementById('totalShares').value || '—'}</td></tr>
                        <tr><td>行业平均PB</td><td>${document.getElementById('industryPB').value || '—'}</td><td></td><td></td></tr>
                    </tbody>
                </table>
                ${intrinsicPerShare > 0 ? `
                <table class="report-table" style="margin-top:14px;">
                    <thead><tr><th>估值项目</th><th>价格（${curPerShare()}）</th><th>判断</th></tr></thead>
                    <tbody>
                        <tr><td>每股内在价值</td><td class="status-pass">${curSym()}${intrinsicPerShare.toFixed(2)}</td><td>基准</td></tr>
                        <tr><td>安全边际买入价</td><td class="${(!isNaN(currentPrice) && currentPrice > 0) ? (currentPrice <= buyPrice ? 'status-pass' : currentPrice <= intrinsicPerShare ? 'status-warning' : 'status-fail') : 'status-pass'}">${curSym()}${buyPrice.toFixed(2)}</td><td>${(() => {
                            if (!isNaN(currentPrice) && currentPrice > 0) {
                                if (currentPrice <= buyPrice) return '可买入';
                                const overPct = ((currentPrice - buyPrice) / buyPrice * 100).toFixed(1);
                                return currentPrice <= intrinsicPerShare ? `等待回调 +${overPct}%` : `已高估 +${overPct}%`;
                            }
                            return '建议买入';
                        })()}</td></tr>
                        ${!isNaN(currentPrice) && currentPrice > 0 ? `<tr><td>当前股价</td><td class="${currentPrice <= buyPrice ? 'status-pass' : currentPrice <= intrinsicPerShare ? 'status-warning' : 'status-fail'}">${curSym()}${currentPrice.toFixed(2)}</td><td>${currentPrice <= buyPrice ? '低估' : currentPrice <= intrinsicPerShare ? '合理偏高' : '高估'}</td></tr>` : ''}
                    </tbody>
                </table>
                ` : ''}
            </div>

            <!-- 估值摘要 -->
            ${intrinsicPerShare > 0 ? `
            <div class="report-card">
                <div class="report-section-title">估值摘要</div>
                <div class="valuation-summary">
                    <div class="val-summary-item">
                        <div class="val-summary-label">每股内在价值</div>
                        <div class="val-summary-value">${curSym()}${intrinsicPerShare.toFixed(2)}</div>
                    </div>
                    <div class="val-summary-item">
                        <div class="val-summary-label">安全边际买入价</div>
                        <div class="val-summary-value">${curSym()}${buyPrice.toFixed(2)}</div>
                    </div>
                    <div class="val-summary-item">
                        <div class="val-summary-label">${!isNaN(currentPrice) ? '当前股价' : '当前股价'}</div>
                        <div class="val-summary-value ${!isNaN(currentPrice) && currentPrice > buyPrice ? 'profit' : 'loss'}">
                            ${!isNaN(currentPrice) ? curSym() + currentPrice.toFixed(2) : '未填'}
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            <!-- 风险提示 -->
            <div class="report-card">
                <div class="report-section-title">⚠️ 风险提示</div>
                <div class="risk-list">
                    ${risks.map(r => `
                        <div class="risk-item">
                            <span class="risk-icon">⚠</span>
                            <span class="risk-text">${r}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 免责声明 -->
            <div class="report-card" style="background: var(--color-bg);">
                <p style="font-size: 12px; color: var(--color-text-muted); line-height: 1.8;">
                    <strong>免责声明：</strong>本报告基于《股市真规则》（帕特·多尔西）五步分析法框架自动生成，所有数据由用户手动输入。
                    分析结论仅供参考，不构成投资建议。投资有风险，决策需谨慎。本工具无法预测短期涨跌，无法识别所有财务造假，
                    安全边际只能降低风险而非消除亏损。建议结合更多研究和个人判断做出投资决策。
                </p>
            </div>
        </div>
    `;

    // 渲染报告图表
    destroyChart('reportScore');
    destroyChart('reportTrend');

    // 评分环形图
    const scoreCtx = document.getElementById('reportScoreChart');
    if (scoreCtx) {
        const scoreConfig = renderScoreDonut(score);
        charts.reportScore = new Chart(scoreCtx, scoreConfig);
    }

    // 趋势折线图
    const trendCtx = document.getElementById('reportTrendChart');
    if (trendCtx && state.historyData) {
        const trendConfig = renderTrendChart(state.historyData);
        if (trendConfig) charts.reportTrend = new Chart(trendCtx, trendConfig);
    }
}

// ==================== 示例数据 ====================
function loadDemoData() {
    // 重置货币状态为A股
    state.isHK = false;
    state.currency = 'CNY';
    updateCurrencyLabels();

    // 基本信息
    document.getElementById('stockName').value = '贵州茅台';
    document.getElementById('stockCode').value = '600519';
    document.getElementById('stockIndustry').value = '消费品';
    document.getElementById('currentPrice').value = '1680';

    // 第一步：初筛 - 全部通过
    document.getElementById('screen1-input').value = '5';
    setScreenResult('screen1', 'pass');
    setScreenResult('screen2', 'pass');
    document.getElementById('screen3-input').value = '30';
    setScreenResult('screen3', 'pass');
    setScreenResult('screen4', 'pass');
    document.getElementById('screen5-input').value = '15';
    setScreenResult('screen5', 'pass');
    document.getElementById('screen6-input').value = '32';
    setScreenResult('screen6', 'pass');
    setScreenResult('screen7', 'pass');
    document.getElementById('screen8-input').value = '0';
    setScreenResult('screen8', 'pass');

    // 第二步：护城河
    toggleMoat('moat1'); // 无形资产
    toggleMoat('moat5'); // 高进入壁垒
    document.getElementById('avgROE').value = '30';
    document.getElementById('avgGrossMargin').value = '91';
    document.getElementById('fcfRatio').value = '32';
    document.getElementById('marginTrend').value = 'stable';
    evaluateMoat();

    // 第三步：财务三表
    document.getElementById('totalAssets').value = '2000';
    document.getElementById('totalLiabilities').value = '400';
    document.getElementById('interestDebt').value = '0';
    document.getElementById('netAssets').value = '1600';
    document.getElementById('cash').value = '500';
    document.getElementById('goodwill').value = '0';
    document.getElementById('accountsReceivable').value = '5';
    document.getElementById('inventory').value = '400';
    document.getElementById('currentAssets').value = '1000';
    document.getElementById('currentLiabilities').value = '300';
    document.getElementById('contractLiabilities').value = '150';
    document.getElementById('revenue').value = '1200';
    document.getElementById('operatingProfit').value = '800';
    document.getElementById('netProfit').value = '600';
    document.getElementById('nonRecurringProfit').value = '590';
    document.getElementById('grossMargin').value = '91.5';
    document.getElementById('salesExpenseRatio').value = '3.5';
    document.getElementById('operatingCF').value = '650';
    document.getElementById('capex').value = '50';
    calcFreeCF();
    evaluateStep3();

    // 第四步：管理层 - 全部好信号
    setMgmtResult('mgmt1', 'good');
    setMgmtResult('mgmt2', 'good');
    setMgmtResult('mgmt3', 'good');

    // 第五步：估值
    document.getElementById('currentPE').value = '33';
    document.getElementById('historicalPE').value = '40';
    document.getElementById('industryPE').value = '25';
    document.getElementById('currentPB').value = '10.5';
    document.getElementById('historicalPB').value = '12';
    document.getElementById('industryPB').value = '7';
    document.getElementById('dcfFCF').value = '600';
    document.getElementById('growthRate').value = '10';
    document.getElementById('discountRate').value = '12';
    document.getElementById('terminalGrowth').value = '3';
    document.getElementById('totalShares').value = '12.56';
    document.getElementById('safetyMargin').value = '0.2';
    updateValuation();
}

// ==================== 重置 ====================
function resetAll() {
    if (!confirm('确定要重置所有数据吗？')) return;

    // 清空 localStorage
    localStorage.removeItem(STORAGE_KEY);

    // 销毁所有图表
    Object.keys(charts).forEach(name => destroyChart(name));
    document.getElementById('healthChartCard').style.display = 'none';
    document.getElementById('valuationCompareCard').style.display = 'none';

    // 清空历史数据表格
    const histTable = document.getElementById('historyTableContainer');
    if (histTable) histTable.innerHTML = '';
    state.historyData = null;

    // 清空所有输入
    document.querySelectorAll('input').forEach(el => {
        if (el.type === 'text' || el.type === 'number') el.value = '';
    });
    document.querySelectorAll('select').forEach(el => {
        el.selectedIndex = 0;
    });

    // 重置状态
    state.screenResults = {};
    state.selectedMoats = [];
    state.mgmtResults = {};
    state.stepStatus = { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' };
    state.isHK = false;
    state.currency = 'CNY';
    state.lastScore = 0;
    updateCurrencyLabels();

    // 重置UI
    document.querySelectorAll('.checklist-item').forEach(el => {
        el.classList.remove('pass', 'fail');
    });
    document.querySelectorAll('.toggle-btn').forEach(el => {
        el.classList.remove('active', 'pass', 'fail');
    });
    document.querySelectorAll('.moat-card').forEach(el => {
        el.classList.remove('selected');
    });
    document.querySelectorAll('.signal-box').forEach(el => {
        el.classList.remove('selected');
    });

    // 重置各步骤结果
    ['step1', 'step2', 'step3', 'step4', 'step5'].forEach(s => {
        const badge = document.getElementById(s + 'Badge');
        const text = document.getElementById(s + 'Text');
        if (badge) { badge.className = 'result-badge'; badge.textContent = '待评估'; }
        if (text) text.textContent = '请完成评估';
    });

    document.getElementById('healthItems').innerHTML = '<p class="placeholder-text">填写财务数据后自动检测</p>';
    document.getElementById('reportContainer').innerHTML = `
        <div class="report-placeholder">
            <div class="placeholder-icon">📋</div>
            <p>完成前五步分析后，此处生成综合报告</p>
            <button class="btn btn-primary" onclick="generateReport()">生成报告</button>
        </div>
    `;

    updateProgress();
    goToStep(1);
}

// ==================== 基础数据自动获取 ====================

async function fetchStockData() {
    const code = document.getElementById('fetchCode').value.trim();
    const statusEl = document.getElementById('fetchStatus');
    const btn = document.getElementById('fetchBtn');

    if (!/^\d{5,6}$/.test(code)) {
        statusEl.className = 'fetch-status error';
        statusEl.textContent = '请输入5位(港股)或6位(A股)数字股票代码';
        return;
    }

    btn.disabled = true;
    btn.textContent = '获取中...';
    statusEl.className = 'fetch-status loading';
    statusEl.innerHTML = '<span class="spinner"></span>正在获取行情数据...';

    try {
        // 并行获取三个数据源
        statusEl.innerHTML = '<span class="spinner"></span>正在获取行情+财报+历史数据...';

        const [quoteRes, financeRes, historyRes] = await Promise.all([
            fetch(`/api/quote/${code}`).then(r => r.json()),
            fetch(`/api/finance/${code}`).then(r => r.json()),
            fetch(`/api/history/${code}`).then(r => r.json())
        ]);

        // 1. 填充行情数据
        if (quoteRes.success) {
            const q = quoteRes.data;
            // 设置货币状态
            state.isHK = !!q.isHK;
            state.currency = q.currency || (q.isHK ? 'HKD' : 'CNY');
            updateCurrencyLabels();
            document.getElementById('stockName').value = q.name || '';
            document.getElementById('stockCode').value = q.code || code;
            document.getElementById('currentPrice').value = q.price || '';
            document.getElementById('currentPE').value = q.peTtm || q.pe || '';
            document.getElementById('currentPB').value = q.pb || '';
            // 总股本（亿股）
            if (q.totalShares) {
                document.getElementById('totalShares').value = (q.totalShares / 1e8).toFixed(2);
            }
            // 行业自动识别
            if (q.industry) {
                const industryMap = {
                    '白酒': '消费品', '食品': '消费品', '饮料': '消费品', '家电': '消费品',
                    '零售': '消费品', '服装': '消费品', '日化': '消费品', '农牧': '消费品',
                    '纺织': '消费品', '轻工': '消费品', '商业': '消费品', '医药商业': '消费品',
                    '银行': '金融', '保险': '金融', '证券': '金融', '多元金融': '金融',
                    '软件': '科技/软件', '半导体': '科技/软件', '电子': '科技/软件',
                    '通信': '科技/软件', '计算机': '科技/软件', '互联网': '科技/软件',
                    '信息技术': '科技/软件', '元器件': '科技/软件', '消费电子': '科技/软件',
                    '医药': '医药', '生物': '医药', '医疗': '医药', '医疗器械': '医药',
                    '化学制药': '医药', '中药': '医药', '医疗服务': '医药',
                    '化学': '制造业', '机械': '制造业', '汽车': '制造业',
                    '电力': '制造业', '钢铁': '制造业', '有色': '制造业',
                    '建材': '制造业', '军工': '制造业', '电气': '制造业',
                    '化工': '制造业', '煤炭': '制造业', '石油': '制造业',
                    '航空': '制造业', '船舶': '制造业', '通用设备': '制造业',
                    '专用设备': '制造业', '仪器仪表': '制造业', '金属': '制造业',
                    '环保': '制造业', '园林': '制造业', '电力设备': '制造业',
                    '食品饮料': '消费品', '家用电器': '消费品', '商贸': '消费品',
                    '纺织服装': '消费品', '轻工制造': '消费品', '农林牧渔': '消费品',
                    '交通运输': '其他', '房地产': '其他', '建筑装饰': '其他',
                    '公用事业': '其他', '传媒': '其他', '休闲': '其他',
                    '综合': '其他', '社会服务': '其他', '煤炭石油': '制造业'
                };
                let matched = false;
                for (const [key, val] of Object.entries(industryMap)) {
                    if (q.industry.includes(key)) {
                        document.getElementById('stockIndustry').value = val;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    document.getElementById('stockIndustry').value = '其他';
                }
            }
        }

        // 2. 填充财务三表数据
        if (financeRes.success) {
            const f = financeRes.data;

            // 财报数据获取失败时的处理
            if (f.error || !f.balanceSheet) {
                // 显示提示信息但不中断流程
                statusEl.className = 'fetch-status warning';
                statusEl.textContent = '⚠ 财报数据获取失败，请手动输入财务数据';
            } else {
                const bs = f.balanceSheet;
                const is = f.incomeStatement;
                const cf = f.cashFlow;

                // 资产负债表
                if (bs.totalAssets !== null) document.getElementById('totalAssets').value = bs.totalAssets;
                if (bs.totalLiabilities !== null) document.getElementById('totalLiabilities').value = bs.totalLiabilities;
                if (bs.interestDebt !== null) document.getElementById('interestDebt').value = bs.interestDebt;
                if (bs.netAssets !== null) document.getElementById('netAssets').value = bs.netAssets;
                if (bs.cash !== null) document.getElementById('cash').value = bs.cash;
                document.getElementById('goodwill').value = bs.goodwill || 0;
                if (bs.accountsReceivable !== null) document.getElementById('accountsReceivable').value = bs.accountsReceivable;
                if (bs.inventory !== null) document.getElementById('inventory').value = bs.inventory;
                if (bs.currentAssets !== null) document.getElementById('currentAssets').value = bs.currentAssets;
                if (bs.currentLiabilities !== null) document.getElementById('currentLiabilities').value = bs.currentLiabilities;
                if (bs.contractLiabilities !== null) document.getElementById('contractLiabilities').value = bs.contractLiabilities;

                // 利润表
                if (is.revenue !== null) document.getElementById('revenue').value = is.revenue;
                if (is.operatingProfit !== null) document.getElementById('operatingProfit').value = is.operatingProfit;
                if (is.netProfit !== null) document.getElementById('netProfit').value = is.netProfit;
                if (is.nonRecurringProfit !== null) document.getElementById('nonRecurringProfit').value = is.nonRecurringProfit;
                if (is.grossMargin !== null) document.getElementById('grossMargin').value = is.grossMargin;
                if (is.salesExpenseRatio !== null) document.getElementById('salesExpenseRatio').value = is.salesExpenseRatio;

                // 现金流量表
                if (cf.operatingCF !== null) document.getElementById('operatingCF').value = cf.operatingCF;
                if (cf.capex !== null) document.getElementById('capex').value = cf.capex;
                if (cf.freeCF !== null) document.getElementById('freeCF').value = cf.freeCF + ' ' + curUnit();
                if (cf.fcfRevenueRatio !== null) document.getElementById('fcfRevenueRatio').value = cf.fcfRevenueRatio + '%';

                // 触发自动检测
                calcFreeCF();
                evaluateStep3();

                // DCF参数预填
                if (cf.freeCF !== null) document.getElementById('dcfFCF').value = cf.freeCF;
            }
        }

        // 3. 填充历史数据 -> 初筛和护城河
        if (historyRes.success && Array.isArray(historyRes.data) && historyRes.data.length > 0) {
            const history = historyRes.data;
            state.historyData = history; // 缓存历史数据供图表使用

            // 渲染历史数据表格到第一步
            renderHistoryTable(history);

            // 自动填充初筛指标
            autoFillScreenFromHistory(history);

            // 自动填充护城河财务验证
            autoFillMoatFromHistory(history, quoteRes.success ? quoteRes.data : null);

            // 自动识别护城河
            setTimeout(() => autoAnalyzeMoat(), 100);
        }

        // 自动评估管理层（基于财报数据）
        if (financeRes.success && financeRes.data.balanceSheet) {
            setTimeout(() => autoAnalyzeManagement(), 200);
        }

        // 触发估值计算
        updateValuation();

        const parts = [];
        if (quoteRes.success) parts.push('行情');
        if (financeRes.success && financeRes.data.balanceSheet) parts.push('财报');
        if (historyRes.success && Array.isArray(historyRes.data) && historyRes.data.length > 0) parts.push('历史');
        statusEl.className = 'fetch-status success';
        if (quoteRes.success && quoteRes.data.isHK) {
            const hkParts = [];
            hkParts.push('行情');
            if (financeRes.success && financeRes.data.balanceSheet) hkParts.push('财报');
            else hkParts.push('财报(需手动输入)');
            if (historyRes.success && Array.isArray(historyRes.data) && historyRes.data.length > 0) hkParts.push('历史');
            else hkParts.push('历史(需手动输入)');
            statusEl.className = 'fetch-status success';
            statusEl.textContent = `✓ 港股数据获取完成：${hkParts.join('、')}`;
        } else {
            statusEl.textContent = `✓ 成功获取${parts.join('、')}数据，已自动填充表单`;
        }

        // 自动回到第一步
        goToStep(1);

    } catch (e) {
        statusEl.className = 'fetch-status error';
        statusEl.textContent = '✗ 获取失败：' + e.message;
        console.error('Fetch error:', e);
    } finally {
        btn.disabled = false;
        btn.textContent = '获取数据';
    }
}

// 渲染5年历史数据表格
function renderHistoryTable(history) {
    // 检查是否已有表格
    let tableContainer = document.getElementById('historyTableContainer');
    if (!tableContainer) {
        // 在第一步的checklist前面插入
        const step1 = document.getElementById('step-1');
        const header = step1.querySelector('.section-header');
        tableContainer = document.createElement('div');
        tableContainer.id = 'historyTableContainer';
        tableContainer.style.marginBottom = '20px';
        header.insertAdjacentElement('afterend', tableContainer);
    }

    const years = history.map(h => h.year).reverse(); // 从早到晚
    const rows = [
        { label: '营业收入(亿)', key: 'revenue' },
        { label: '净利润(亿)', key: 'netProfit' },
        { label: 'ROE(%)', key: 'roe' },
        { label: '毛利率(%)', key: 'grossMargin' },
        { label: '营收增长(%)', key: 'revenueGrowth' },
        { label: '净利增长(%)', key: 'profitGrowth' },
        { label: '每股收益', key: 'eps' },
        { label: '每股经营现金流', key: 'ocfPerShare' }
    ];

    let html = `<div class="statement-card" style="margin-bottom:0">
        <div class="statement-header">
            <h3>📈 近5年财务数据概览</h3>
            <span class="statement-meta">数据来源：东方财富</span>
        </div>
        <table class="history-table">
            <thead>
                <tr>
                    <th>指标</th>
                    ${years.map(y => `<th>${y}</th>`).join('')}
                </tr>
            </thead>
            <tbody>`;

    rows.forEach(row => {
        html += `<tr><td>${row.label}</td>`;
        years.forEach(y => {
            const item = history.find(h => h.year === y);
            const val = item ? item[row.key] : null;
            html += `<td>${val !== null && val !== undefined ? val : '—'}</td>`;
        });
        html += '</tr>';
    });

    html += `</tbody></table></div>`;
    tableContainer.innerHTML = html;
}

// 根据历史数据自动填充初筛指标
function autoFillScreenFromHistory(history) {
    if (!history || history.length === 0) return;

    // 1. 盈利历史：检查近5年净利润是否为正
    const profitableYears = history.filter(h => h.netProfit > 0).length;
    document.getElementById('screen1-input').value = profitableYears;
    setScreenResult('screen1', profitableYears >= 4 ? 'pass' : 'fail');

    // 2. 经营现金流：有每股经营现金流数据则判断
    const ocfData = history.filter(h => h.ocfPerShare !== null && h.ocfPerShare > 0);
    if (ocfData.length >= 3) {
        setScreenResult('screen2', 'pass');
    } else if (history.length >= 3) {
        // 有数据但可能不全，保守判断
        setScreenResult('screen2', ocfData.length >= 2 ? 'pass' : 'fail');
    }

    // 3. ROE：取近5年平均
    const roeData = history.filter(h => h.roe !== null);
    if (roeData.length > 0) {
        const avgROE = roeData.reduce((s, h) => s + h.roe, 0) / roeData.length;
        document.getElementById('screen3-input').value = avgROE.toFixed(1);
        setScreenResult('screen3', avgROE > 10 ? 'pass' : 'fail');
    }

    // 4. 盈利稳定性：检查净利润是否忽高忽低
    if (history.length >= 3) {
        const profits = history.map(h => h.netProfit).filter(p => p !== null);
        if (profits.length >= 3) {
            const avg = profits.reduce((s, p) => s + p, 0) / profits.length;
            const variance = profits.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / profits.length;
            const cv = Math.sqrt(variance) / Math.abs(avg); // 变异系数
            setScreenResult('screen4', cv < 0.5 ? 'pass' : 'fail');
        }
    }

    // 5. 负债水平：从财报数据获取（如果有）
    const interestDebt = parseFloat(document.getElementById('interestDebt').value);
    const totalAssets = parseFloat(document.getElementById('totalAssets').value);
    if (!isNaN(interestDebt) && !isNaN(totalAssets) && totalAssets > 0) {
        const ratio = (interestDebt / totalAssets * 100).toFixed(1);
        document.getElementById('screen5-input').value = ratio;
        setScreenResult('screen5', interestDebt / totalAssets < 0.4 ? 'pass' : 'fail');
    }

    // 6. 自由现金流/收入
    const fcfRatioEl = document.getElementById('fcfRevenueRatio');
    if (fcfRatioEl.value) {
        const ratio = parseFloat(fcfRatioEl.value);
        document.getElementById('screen6-input').value = ratio;
        setScreenResult('screen6', ratio > 5 ? 'pass' : 'fail');
    }

    // 7. 非经常性费用：需要扣非/净利占比判断
    const nonRecurring = parseFloat(document.getElementById('nonRecurringProfit').value);
    const netProfit = parseFloat(document.getElementById('netProfit').value);
    if (!isNaN(nonRecurring) && !isNaN(netProfit) && netProfit > 0) {
        setScreenResult('screen7', nonRecurring / netProfit > 0.9 ? 'pass' : 'fail');
    }

    // 8. 股本稀释：无法从现有数据自动判断，留空让用户手动填写
    document.getElementById('screen8-input').value = '';
    document.getElementById('screen8-input').placeholder = '如：<2';
}

// 根据历史数据自动填充护城河财务验证
function autoFillMoatFromHistory(history, quote) {
    if (!history || history.length === 0) return;

    // ROE平均
    const roeData = history.filter(h => h.roe !== null);
    if (roeData.length > 0) {
        const avgROE = roeData.reduce((s, h) => s + h.roe, 0) / roeData.length;
        document.getElementById('avgROE').value = avgROE.toFixed(1);
    }

    // 毛利率平均
    const marginData = history.filter(h => h.grossMargin !== null);
    if (marginData.length > 0) {
        const avgMargin = marginData.reduce((s, h) => s + h.grossMargin, 0) / marginData.length;
        document.getElementById('avgGrossMargin').value = avgMargin.toFixed(1);

        // 毛利率趋势
        if (marginData.length >= 2) {
            const recent = marginData[0].grossMargin;
            const older = marginData[marginData.length - 1].grossMargin;
            document.getElementById('marginTrend').value = recent >= older * 0.95 ? 'stable' : 'declining';
        }
    }

    // FCF/收入
    const fcfRatioEl = document.getElementById('fcfRevenueRatio');
    if (fcfRatioEl.value) {
        document.getElementById('fcfRatio').value = parseFloat(fcfRatioEl.value);
    }

    evaluateMoat();

    // 预填历史PE中枢（取当前PE的1.1倍作为参考，用户可调整）
    if (quote && quote.peTtm) {
        document.getElementById('historicalPE').value = (quote.peTtm * 1.1).toFixed(1);
    }
    // 预填历史PB中枢（取当前PB的1.1倍作为参考，用户可调整）
    if (quote && quote.pb) {
        const pbVal = parseFloat(quote.pb);
        if (!isNaN(pbVal) && pbVal > 0) {
            document.getElementById('historicalPB').value = (pbVal * 1.1).toFixed(1);
        }
    }
}

// ==================== 护城河自动识别 ====================
function autoAnalyzeMoat() {
    const btn = document.getElementById('autoMoatBtn');
    const resultEl = document.getElementById('moatAutoResult');
    btn.disabled = true;
    btn.textContent = '🔍 分析中...';
    resultEl.innerHTML = '';

    // 收集数据
    const history = state.historyData || [];
    const avgROE = parseFloat(document.getElementById('avgROE').value);
    const avgGrossMargin = parseFloat(document.getElementById('avgGrossMargin').value);
    const fcfRatio = parseFloat(document.getElementById('fcfRatio').value);
    const marginTrend = document.getElementById('marginTrend').value;

    // 财报数据
    const totalAssets = parseFloat(document.getElementById('totalAssets').value);
    const interestDebt = parseFloat(document.getElementById('interestDebt').value);
    const netAssets = parseFloat(document.getElementById('netAssets').value);
    const revenue = parseFloat(document.getElementById('revenue').value);
    const netProfit = parseFloat(document.getElementById('netProfit').value);
    const nonRecurring = parseFloat(document.getElementById('nonRecurringProfit').value);
    const accountsReceivable = parseFloat(document.getElementById('accountsReceivable').value);
    const operatingCF = parseFloat(document.getElementById('operatingCF').value);

    const reasons = [];
    const detectedMoats = [];

    // 辅助函数
    const netMargin = (!isNaN(netProfit) && !isNaN(revenue) && revenue > 0) ? (netProfit / revenue * 100) : null;
    const interestDebtRatio = (!isNaN(interestDebt) && !isNaN(totalAssets) && totalAssets > 0) ? (interestDebt / totalAssets * 100) : null;
    const arRatio = (!isNaN(accountsReceivable) && !isNaN(revenue) && revenue > 0) ? (accountsReceivable / revenue * 100) : null;
    const nonRecurringRatio = (!isNaN(nonRecurring) && !isNaN(netProfit) && netProfit > 0) ? (nonRecurring / netProfit * 100) : null;

    // 1. 无形资产：高毛利率 + 稳定/上升
    if (!isNaN(avgGrossMargin) && avgGrossMargin > 50 && marginTrend === 'stable') {
        detectedMoats.push('moat1');
        reasons.push({
            type: 'detected',
            moat: '无形资产',
            text: `<strong>✓ 识别到「无形资产」护城河</strong> — 5年平均毛利率 ${avgGrossMargin.toFixed(1)}%（>50%），且毛利率趋势稳定/上行。高毛利率说明产品具有定价权，竞争对手无法通过降价抢市场，可能存在品牌溢价、专利或许可证等无形资产壁垒。`
        });
    }

    // 2. 高进入壁垒：超高ROE + 低有息负债
    if (!isNaN(avgROE) && avgROE > 20 && interestDebtRatio !== null && interestDebtRatio < 30) {
        detectedMoats.push('moat5');
        reasons.push({
            type: 'detected',
            moat: '高进入壁垒',
            text: `<strong>✓ 识别到「高进入壁垒」护城河</strong> — 5年平均ROE ${avgROE.toFixed(1)}%（>20%），有息负债率仅 ${interestDebtRatio.toFixed(1)}%（<30%）。持续的超高资本回报率且非杠杆驱动，说明新进入者难以复制其业务模式，可能存在资本需求、行政许可或资源垄断等壁垒。`
        });
    }

    // 3. 成本优势：高净利率 + 中等毛利率
    if (netMargin !== null && netMargin > 15 && !isNaN(avgGrossMargin) && avgGrossMargin < 50 && avgGrossMargin > 20) {
        detectedMoats.push('moat2');
        reasons.push({
            type: 'detected',
            moat: '成本优势',
            text: `<strong>✓ 识别到「成本优势」护城河</strong> — 净利率 ${netMargin.toFixed(1)}%（>15%）但毛利率仅 ${avgGrossMargin.toFixed(1)}%，利润主要来自成本控制而非产品定价权。可能存在规模效应、工艺领先或地理位置等成本优势。`
        });
    }

    // 4. 高转换成本：营收稳定增长 + 应收占比低 + 毛利率稳定
    if (history.length >= 3) {
        const growthData = history.filter(h => h.revenueGrowth !== null);
        const positiveGrowthYears = growthData.filter(h => h.revenueGrowth > 0).length;
        if (positiveGrowthYears >= growthData.length * 0.6 && arRatio !== null && arRatio < 25 && marginTrend === 'stable' && !isNaN(avgGrossMargin) && avgGrossMargin > 30) {
            detectedMoats.push('moat3');
            const avgGrowth = growthData.length > 0 ? (growthData.reduce((s, h) => s + h.revenueGrowth, 0) / growthData.length).toFixed(1) : 'N/A';
            reasons.push({
                type: 'detected',
                moat: '高转换成本',
                text: `<strong>✓ 识别到「高转换成本」护城河</strong> — 营收持续正增长（${positiveGrowthYears}/${growthData.length}年），应收账款/营收比仅 ${arRatio.toFixed(1)}%（<25%），毛利率稳定。客户迁移代价高，收入可预测性强。`
            });
        }
    }

    // 5. 网络效应：营收加速增长 + 高毛利率
    if (history.length >= 3) {
        const growthData = history.filter(h => h.revenueGrowth !== null).map(h => h.revenueGrowth);
        if (growthData.length >= 3) {
            const recentAvg = (growthData[0] + growthData[1]) / 2;
            const olderAvg = (growthData[growthData.length - 1] + growthData[growthData.length - 2]) / 2;
            if (recentAvg > olderAvg * 1.2 && recentAvg > 15 && !isNaN(avgGrossMargin) && avgGrossMargin > 40) {
                detectedMoats.push('moat4');
                reasons.push({
                    type: 'detected',
                    moat: '网络效应',
                    text: `<strong>✓ 识别到「网络效应」护城河</strong> — 营收增长加速（近期均值${recentAvg.toFixed(1)}% > 早期均值${olderAvg.toFixed(1)}%），毛利率 ${avgGrossMargin.toFixed(1)}%（>40%）。用户/规模越多价值越大，可能存在网络效应。`
                });
            }
        }
    }

    // 总结
    if (detectedMoats.length === 0) {
        let summary = '<strong>⚠ 未识别到明确的护城河</strong> — ';
        const issues = [];
        if (isNaN(avgGrossMargin)) issues.push('毛利率数据缺失');
        else if (avgGrossMargin < 30) issues.push(`毛利率偏低（${avgGrossMargin.toFixed(1)}%）`);
        if (isNaN(avgROE)) issues.push('ROE数据缺失');
        else if (avgROE < 10) issues.push(`ROE偏低（${avgROE.toFixed(1)}%）`);
        if (fcfRatio !== null && fcfRatio < 0) issues.push('自由现金流为负');
        if (issues.length === 0) issues.push('财务指标未达到护城河阈值');
        summary += issues.join('、') + '。建议要求60%安全边际或放弃。';
        reasons.push({ type: 'none', moat: '', text: summary });
    } else {
        reasons.unshift({
            type: 'detected',
            moat: '',
            text: `<strong>🔍 自动识别完成</strong> — 基于财务数据共识别到 ${detectedMoats.length} 个护城河来源，已自动选中。您可手动调整。`
        });
    }

    // 渲染结果
    resultEl.innerHTML = reasons.map(r => {
        const cls = r.type === 'detected' ? 'moat-detected' : r.type === 'none' ? 'moat-none' : 'moat-weak';
        return `<div class="auto-reason ${cls}">${r.text}</div>`;
    }).join('');

    // 自动选中识别到的护城河
    // 先清除所有选中
    state.selectedMoats = [];
    document.querySelectorAll('.moat-card').forEach(el => el.classList.remove('selected'));
    // 再选中识别到的
    detectedMoats.forEach(id => {
        state.selectedMoats.push(id);
        const el = document.getElementById(id);
        if (el) el.classList.add('selected');
    });

    evaluateMoat();
    autoSave();

    btn.disabled = false;
    btn.textContent = '🔍 重新识别护城河';
}

// ==================== 管理层自动评估 ====================
function autoAnalyzeManagement() {
    const btn = document.getElementById('autoMgmtBtn');
    const resultEl = document.getElementById('mgmtAutoResult');
    btn.disabled = true;
    btn.textContent = '🔍 评估中...';
    resultEl.innerHTML = '';

    const reasons = [];
    const results = {};

    // 财报数据
    const totalAssets = parseFloat(document.getElementById('totalAssets').value);
    const interestDebt = parseFloat(document.getElementById('interestDebt').value);
    const netAssets = parseFloat(document.getElementById('netAssets').value);
    const goodwill = parseFloat(document.getElementById('goodwill').value);
    const revenue = parseFloat(document.getElementById('revenue').value);
    const netProfit = parseFloat(document.getElementById('netProfit').value);
    const nonRecurring = parseFloat(document.getElementById('nonRecurringProfit').value);
    const operatingCF = parseFloat(document.getElementById('operatingCF').value);
    const capex = parseFloat(document.getElementById('capex').value);

    const history = state.historyData || [];

    // 辅助计算
    const fcf = (!isNaN(operatingCF) && !isNaN(capex)) ? (operatingCF - capex) : null;
    const goodwillRatio = (!isNaN(goodwill) && !isNaN(netAssets) && netAssets > 0) ? (goodwill / netAssets * 100) : null;
    const nonRecurringRatio = (!isNaN(nonRecurring) && !isNaN(netProfit) && netProfit > 0) ? (nonRecurring / netProfit * 100) : null;

    // --- mgmt1 报酬：间接判断股本稀释 ---
    // 用BPS（每股净资产）历史变化间接判断是否有大量增发
    if (history.length >= 3) {
        const bpsData = history.filter(h => h.bps !== null && h.bps > 0).map(h => h.bps);
        if (bpsData.length >= 3) {
            const latest = bpsData[0];
            const oldest = bpsData[bpsData.length - 1];
            const bpsGrowth = ((latest - oldest) / oldest * 100);
            // 如果BPS持续增长且没有大幅波动，说明没有大量增发稀释
            if (bpsGrowth > 0) {
                results.mgmt1 = 'good';
                reasons.push({
                    type: 'good',
                    dim: '报酬',
                    text: `<strong>✓ 报酬维度：好信号</strong> — 每股净资产从 ${oldest.toFixed(2)} 增长至 ${latest.toFixed(2)}（${bpsGrowth.toFixed(1)}%），BPS持续增长说明未发生大规模股本稀释，管理层未滥用期权增发。`
                });
            } else {
                results.mgmt1 = 'bad';
                reasons.push({
                    type: 'bad',
                    dim: '报酬',
                    text: `<strong>✗ 报酬维度：红牌</strong> — 每股净资产从 ${oldest.toFixed(2)} 降至 ${latest.toFixed(2)}（${bpsGrowth.toFixed(1)}%），BPS下降可能意味着股本被稀释，需关注是否存在滥用期权或低价增发。`
                });
            }
        }
    }

    // 如果BPS数据不足，用有息负债和利润关系间接判断
    if (!results.mgmt1) {
        if (!isNaN(interestDebt) && !isNaN(totalAssets) && totalAssets > 0) {
            const debtRatio = interestDebt / totalAssets * 100;
            if (debtRatio < 30) {
                results.mgmt1 = 'good';
                reasons.push({
                    type: 'good',
                    dim: '报酬',
                    text: `<strong>✓ 报酬维度：初步判断为好信号</strong> — 有息负债率 ${debtRatio.toFixed(1)}%（<30%），财务杠杆低，未发现异常融资迹象。<em>注：BPS历史数据不足，建议查看年报高管薪酬明细进一步确认。</em>`
                });
            } else {
                results.mgmt1 = 'bad';
                reasons.push({
                    type: 'bad',
                    dim: '报酬',
                    text: `<strong>✗ 报酬维度：需关注</strong> — 有息负债率 ${debtRatio.toFixed(1)}% 偏高，需确认是否用于合理扩张。<em>建议查看年报中高管薪酬与业绩的关联性。</em>`
                });
            }
        } else {
            reasons.push({
                type: 'weak',
                dim: '报酬',
                text: `<strong>报酬维度：数据不足</strong> — 缺少BPS历史和负债数据，无法自动判断。建议手动查看年报中高管薪酬部分。`
            });
        }
    }

    // --- mgmt2 性格：扣非净利润占比 ---
    if (nonRecurringRatio !== null) {
        if (nonRecurringRatio > 90) {
            results.mgmt2 = 'good';
            reasons.push({
                type: 'good',
                dim: '性格',
                text: `<strong>✓ 性格维度：好信号</strong> — 扣非净利润占净利润 ${nonRecurringRatio.toFixed(1)}%（>90%），利润质量高，主营业务贡献突出，信息披露较透明，未发现通过非经常性损益粉饰业绩的迹象。`
            });
        } else if (nonRecurringRatio > 70) {
            results.mgmt2 = 'bad';
            reasons.push({
                type: 'bad',
                dim: '性格',
                text: `<strong>✗ 性格维度：红牌</strong> — 扣非净利润仅占净利润 ${nonRecurringRatio.toFixed(1)}%，存在较多非经常性损益（${(100 - nonRecurringRatio).toFixed(1)}%），需警惕利润操纵或业绩粉饰。`
            });
        } else {
            results.mgmt2 = 'bad';
            reasons.push({
                type: 'bad',
                dim: '性格',
                text: `<strong>✗ 性格维度：红牌</strong> — 扣非净利润仅占净利润 ${nonRecurringRatio.toFixed(1)}%，非经常性损益占比过高（${(100 - nonRecurringRatio).toFixed(1)}%），利润质量堪忧，可能存在业绩操纵。`
            });
        }
    } else {
        reasons.push({
            type: 'weak',
            dim: '性格',
            text: `<strong>性格维度：数据不足</strong> — 缺少扣非净利润数据，无法自动判断。建议手动评估。`
        });
    }

    // --- mgmt3 运作：商誉/净资产 + FCF ---
    let mgmt3Good = true;
    let mgmt3Reasons = [];

    if (goodwillRatio !== null) {
        if (goodwillRatio < 10) {
            mgmt3Reasons.push(`商誉/净资产比仅 ${goodwillRatio.toFixed(1)}%（<10%），未发现频繁跨界收购`);
        } else if (goodwillRatio < 20) {
            mgmt3Reasons.push(`商誉/净资产比 ${goodwillRatio.toFixed(1)}%，有一定并购但风险可控`);
        } else {
            mgmt3Good = false;
            mgmt3Reasons.push(`商誉/净资产比高达 ${goodwillRatio.toFixed(1)}%（>20%），存在过度并购风险`);
        }
    }

    if (fcf !== null) {
        if (fcf > 0) {
            mgmt3Reasons.push(`自由现金流为正（${fcf.toFixed(1)}亿），资本配置理性`);
        } else {
            mgmt3Good = false;
            mgmt3Reasons.push(`自由现金流为负（${fcf.toFixed(1)}亿），资本配置需关注`);
        }
    }

    // 营收增长趋势（是否有理性扩张）
    if (history.length >= 3) {
        const growthData = history.filter(h => h.revenueGrowth !== null);
        if (growthData.length >= 2) {
            const avgGrowth = growthData.reduce((s, h) => s + h.revenueGrowth, 0) / growthData.length;
            if (avgGrowth > 0 && avgGrowth < 30) {
                mgmt3Reasons.push(`营收年均增长 ${avgGrowth.toFixed(1)}%，增长理性稳健`);
            } else if (avgGrowth >= 30) {
                mgmt3Reasons.push(`营收年均增长 ${avgGrowth.toFixed(1)}%，增长较快需关注可持续性`);
            }
        }
    }

    if (mgmt3Reasons.length > 0) {
        results.mgmt3 = mgmt3Good ? 'good' : 'bad';
        reasons.push({
            type: mgmt3Good ? 'good' : 'bad',
            dim: '运作',
            text: `<strong>${mgmt3Good ? '✓ 运作维度：好信号' : '✗ 运作维度：红牌'}</strong> — ${mgmt3Reasons.join('；')}。`
        });
    } else {
        reasons.push({
            type: 'weak',
            dim: '运作',
            text: `<strong>运作维度：数据不足</strong> — 缺少商誉和现金流数据，无法自动判断。建议手动评估。`
        });
    }

    // 总结
    const goodCount = Object.values(results).filter(v => v === 'good').length;
    const badCount = Object.values(results).filter(v => v === 'bad').length;
    reasons.unshift({
        type: 'summary',
        dim: '',
        text: `<strong>🔍 自动评估完成</strong> — ${goodCount}好/${badCount}差，已自动选择对应信号。您可手动调整。`
    });

    // 渲染结果
    resultEl.innerHTML = reasons.map(r => {
        const cls = r.type === 'good' ? 'moat-detected' : r.type === 'bad' ? 'moat-none' : r.type === 'weak' ? 'moat-weak' : '';
        return `<div class="auto-reason ${cls}">${r.text}</div>`;
    }).join('');

    // 自动设置管理层评估结果
    Object.keys(results).forEach(id => {
        setMgmtResult(id, results[id]);
    });

    autoSave();

    btn.disabled = false;
    btn.textContent = '🔍 重新评估管理层';
}

// ==================== 本地存储 ====================

function collectAllInputs() {
    const data = {};
    document.querySelectorAll('input, select').forEach(el => {
        if (el.id) data[el.id] = el.value;
    });
    data._state = {
        screenResults: state.screenResults,
        selectedMoats: state.selectedMoats,
        mgmtResults: state.mgmtResults,
        stepStatus: state.stepStatus,
        currentStep: state.currentStep,
        historyData: state.historyData,
        isHK: state.isHK,
        currency: state.currency
    };
    data._isHK = state.isHK; // 便于自选股列表快速判断
    return data;
}

function autoSave() {
    try {
        const data = collectAllInputs();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* 忽略存储错误 */ }
}

function restoreState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);

        // 恢复输入框
        Object.keys(data).forEach(key => {
            if (key.startsWith('_')) return;
            const el = document.getElementById(key);
            if (el && data[key] !== undefined && data[key] !== '') {
                el.value = data[key];
            }
        });

        // 恢复状态
        if (data._state) {
            const s = data._state;
            state.screenResults = s.screenResults || {};
            state.selectedMoats = s.selectedMoats || [];
            state.mgmtResults = s.mgmtResults || {};
            state.stepStatus = s.stepStatus || { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' };
            state.historyData = s.historyData || null;
            state.isHK = s.isHK || false;
            state.currency = s.currency || 'CNY';
            updateCurrencyLabels();

            // 恢复 UI 状态
            // 初筛
            Object.keys(state.screenResults).forEach(id => {
                const r = state.screenResults[id];
                if (r.pass !== undefined) {
                    const btn = document.getElementById(`${id}-${r.pass ? 'pass' : 'fail'}`);
                    if (btn) btn.classList.add('active', r.pass ? 'pass' : 'fail');
                    const item = document.getElementById(`item-${id}`);
                    if (item) item.classList.add(r.pass ? 'pass' : 'fail');
                }
            });

            // 护城河
            state.selectedMoats.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('selected');
            });

            // 管理层
            Object.keys(state.mgmtResults).forEach(id => {
                const result = state.mgmtResults[id];
                const el = document.getElementById(`${id}-${result}`);
                if (el) el.classList.add('selected');
            });

            // 恢复历史数据表格
            if (state.historyData && state.historyData.length > 0) {
                renderHistoryTable(state.historyData);
            }

            // 触发各步骤重新计算
            evaluateScreen1();
            evaluateMoat();
            calcFreeCF();
            evaluateStep3();
            evaluateStep4();
            updateValuation();
            updateProgress();

            // 跳到上次步骤
            if (s.currentStep) goToStep(s.currentStep);
        }
    } catch (e) {
        console.warn('恢复数据失败:', e);
    }
}

// ==================== 自选股管理 ====================

// 排序状态
let watchlistSortBy = 'margin'; // 'margin' | 'score' | 'time'
let watchlistSortDesc = true;

// 计算DCF每股内在价值
function calcFairPricePerShare() {
    const fcf = parseFloat(document.getElementById('dcfFCF').value);
    const growth = parseFloat(document.getElementById('growthRate').value) / 100;
    const discount = parseFloat(document.getElementById('discountRate').value) / 100;
    const terminal = (parseFloat(document.getElementById('terminalGrowth').value) || 3) / 100;
    const totalShares = parseFloat(document.getElementById('totalShares').value);

    const result = calcDCF(fcf, growth, discount, terminal, totalShares);
    return result && result.perShareValue !== null ? result.perShareValue : null;
}

function getWatchlist() {
    try {
        return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
    } catch (e) { return []; }
}

function saveToWatchlist() {
    const stockName = document.getElementById('stockName').value.trim();
    const stockCode = document.getElementById('stockCode').value.trim();

    if (!stockName || !stockCode) {
        alert('请先填写股票名称和代码');
        return;
    }

    // 计算当前评分和结论
    generateReport(); // 确保评分已计算
    const score = state.lastScore;
    const conclusion = state.lastConclusion;

    // 计算估值数据
    const currentPrice = parseFloat(document.getElementById('currentPrice').value);
    const fairPrice = calcFairPricePerShare();
    const safetyMarginPct = (!isNaN(currentPrice) && currentPrice > 0 && !isNaN(fairPrice) && fairPrice > 0)
        ? parseFloat(((fairPrice - currentPrice) / currentPrice * 100).toFixed(1))
        : null;

    // 操作建议
    let action = '—';
    if (safetyMarginPct !== null) {
        if (safetyMarginPct > 30) action = '建议买入';
        else if (safetyMarginPct > 0) action = '可关注';
        else action = '高估等待';
    }

    const item = {
        code: stockCode,
        name: stockName,
        score: score,
        conclusion: conclusion,
        currentPrice: !isNaN(currentPrice) ? currentPrice : null,
        fairPrice: !isNaN(fairPrice) ? parseFloat(fairPrice.toFixed(2)) : null,
        safetyMarginPct: safetyMarginPct,
        action: action,
        timestamp: Date.now(),
        data: collectAllInputs()
    };

    const list = getWatchlist();
    const idx = list.findIndex(w => w.code === stockCode);
    if (idx >= 0) {
        list[idx] = item; // 覆盖
    } else {
        list.unshift(item);
    }

    // 最多保存20只
    if (list.length > 20) list.length = 20;

    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    renderWatchlist();
    showFetchStatus('success', `✓ 已保存「${stockName}」到自选股`);

    // 云端同步
    if (window.svaCloud && window.svaAuth && window.svaAuth.isLoggedIn()) {
        window.svaCloud.debouncedPush(item);
    }
}

function loadFromWatchlist(code) {
    const list = getWatchlist();
    const item = list.find(w => w.code === code);
    if (!item) return;

    // 先重置状态
    state.screenResults = {};
    state.selectedMoats = [];
    state.mgmtResults = {};
    state.stepStatus = { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' };

    // 清空 UI
    document.querySelectorAll('.checklist-item').forEach(el => el.classList.remove('pass', 'fail'));
    document.querySelectorAll('.toggle-btn').forEach(el => el.classList.remove('active', 'pass', 'fail'));
    document.querySelectorAll('.moat-card').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.signal-box').forEach(el => el.classList.remove('selected'));

    // 恢复输入
    const data = item.data;
    Object.keys(data).forEach(key => {
        if (key.startsWith('_')) return;
        const el = document.getElementById(key);
        if (el) el.value = data[key] || '';
    });

    // 恢复状态
    if (data._state) {
        const s = data._state;
        state.screenResults = s.screenResults || {};
        state.selectedMoats = s.selectedMoats || [];
        state.mgmtResults = s.mgmtResults || {};
        state.stepStatus = s.stepStatus || { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' };
        state.historyData = s.historyData || null;
        state.isHK = s.isHK || data._isHK || false;
        state.currency = s.currency || (state.isHK ? 'HKD' : 'CNY');
        updateCurrencyLabels();

        // 恢复 UI
        Object.keys(state.screenResults).forEach(id => {
            const r = state.screenResults[id];
            if (r.pass !== undefined) {
                const btn = document.getElementById(`${id}-${r.pass ? 'pass' : 'fail'}`);
                if (btn) btn.classList.add('active', r.pass ? 'pass' : 'fail');
                const itemEl = document.getElementById(`item-${id}`);
                if (itemEl) itemEl.classList.add(r.pass ? 'pass' : 'fail');
            }
        });
        state.selectedMoats.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('selected');
        });
        Object.keys(state.mgmtResults).forEach(id => {
            const result = state.mgmtResults[id];
            const el = document.getElementById(`${id}-${result}`);
            if (el) el.classList.add('selected');
        });

        if (state.historyData && state.historyData.length > 0) {
            renderHistoryTable(state.historyData);
        }

        evaluateScreen1();
        evaluateMoat();
        calcFreeCF();
        evaluateStep3();
        evaluateStep4();
        updateValuation();
        updateProgress();
    }

    goToStep(6); // 直接跳到报告
    autoSave();
}

function deleteFromWatchlist(code) {
    let list = getWatchlist();
    list = list.filter(w => w.code !== code);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    renderWatchlist();

    // 云端同步
    if (window.svaCloud && window.svaAuth && window.svaAuth.isLoggedIn()) {
        window.svaCloud.deleteCloudWatchlistItem(code);
    }
}

function renderWatchlist() {
    let list = getWatchlist();

    // 排序
    list.sort((a, b) => {
        let va, vb;
        switch (watchlistSortBy) {
            case 'margin':
                va = a.safetyMarginPct !== null ? a.safetyMarginPct : -999;
                vb = b.safetyMarginPct !== null ? b.safetyMarginPct : -999;
                break;
            case 'score':
                va = a.score || 0;
                vb = b.score || 0;
                break;
            case 'time':
                va = a.timestamp || 0;
                vb = b.timestamp || 0;
                break;
            default:
                return 0;
        }
        return watchlistSortDesc ? vb - va : va - vb;
    });

    const container = document.getElementById('watchlistItems');

    if (list.length === 0) {
        container.innerHTML = '<p class="watchlist-empty">暂无自选股，分析完成后点击"保存当前"</p>';
        return;
    }

    container.innerHTML = list.map(item => {
        const scoreClass = item.score >= 70 ? 'high' : item.score >= 40 ? 'medium' : 'low';
        const date = new Date(item.timestamp);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

        // 安全边际颜色
        let marginClass = 'yellow';
        let marginText = '—';
        if (item.safetyMarginPct !== null) {
            if (item.safetyMarginPct > 30) marginClass = 'green';
            else if (item.safetyMarginPct > 0) marginClass = 'yellow';
            else marginClass = 'red';
            marginText = (item.safetyMarginPct > 0 ? '+' : '') + item.safetyMarginPct.toFixed(1) + '%';
        }

        // 操作建议样式
        let actionClass = 'watch';
        if (item.action === '建议买入') actionClass = 'buy';
        else if (item.action === '高估等待') actionClass = 'wait';

        // 价格显示（根据是否港股选择货币符号）
        const wlCur = item.data && item.data._isHK ? 'HK$' : '¥';
        const priceStr = item.currentPrice !== null ? wlCur + item.currentPrice.toFixed(2) : '—';
        const fairStr = item.fairPrice !== null ? wlCur + item.fairPrice.toFixed(2) : '—';

        return `
            <div class="wl-card" onclick="loadFromWatchlist('${item.code}')">
                <div class="wl-card-top">
                    <span class="wl-card-name">${item.name}</span>
                    <span class="wl-card-score ${scoreClass}">${item.score || '—'}分</span>
                </div>
                <div class="wl-card-prices">
                    <span class="wl-price">${priceStr}</span>
                    <span class="wl-arrow">→</span>
                    <span class="wl-price">${fairStr}</span>
                    <span style="margin-left:auto;font-size:9px;color:var(--color-text-muted)">${dateStr}</span>
                </div>
                <div class="wl-card-bottom">
                    <span class="wl-card-margin ${marginClass}">安全边际 ${marginText}</span>
                    <span class="wl-card-action ${actionClass}">${item.action || '—'}</span>
                </div>
                <button class="wl-card-delete" onclick="event.stopPropagation(); deleteFromWatchlist('${item.code}')" title="删除">×</button>
            </div>
        `;
    }).join('');
}

// 按安全边际排序
function sortWatchlist(by) {
    if (watchlistSortBy === by) {
        watchlistSortDesc = !watchlistSortDesc;
    } else {
        watchlistSortBy = by;
        watchlistSortDesc = true;
    }
    renderWatchlist();
    updateSortButtons();
}

function updateSortButtons() {
    const buttons = document.querySelectorAll('.btn-wl-sort');
    buttons.forEach(btn => {
        const by = btn.dataset.sort;
        btn.classList.toggle('active', by === watchlistSortBy);
        if (by === watchlistSortBy) {
            btn.textContent = (watchlistSortDesc ? '↓ ' : '↑ ') + btn.dataset.label;
        } else {
            btn.textContent = btn.dataset.label;
        }
    });
}

// 批量刷新自选股全部数据（行情+财报+历史，重新计算评分/结论/安全边际）
async function refreshWatchlistData() {
    const list = getWatchlist();
    if (list.length === 0) {
        alert('自选股列表为空');
        return;
    }

    const btn = document.getElementById('refreshPriceBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '刷新中...';
    }

    let updated = 0;
    for (const item of list) {
        try {
            const [quoteRes, financeRes, historyRes] = await Promise.all([
                fetch(`/api/quote/${item.code}`).then(r => r.json()),
                fetch(`/api/finance/${item.code}`).then(r => r.json()),
                fetch(`/api/history/${item.code}`).then(r => r.json())
            ]);

            // 更新当前价格
            if (quoteRes.success && quoteRes.data.price) {
                item.currentPrice = quoteRes.data.price;
            }

            // 更新财务数据到自选股缓存的data中
            if (financeRes.success && financeRes.data.balanceSheet) {
                const f = financeRes.data;
                const bs = f.balanceSheet;
                const is = f.incomeStatement;
                const cf = f.cashFlow;
                const d = item.data || {};

                if (bs.totalAssets !== null) d.totalAssets = bs.totalAssets;
                if (bs.totalLiabilities !== null) d.totalLiabilities = bs.totalLiabilities;
                if (bs.interestDebt !== null) d.interestDebt = bs.interestDebt;
                if (bs.netAssets !== null) d.netAssets = bs.netAssets;
                if (bs.cash !== null) d.cash = bs.cash;
                if (bs.goodwill !== null) d.goodwill = bs.goodwill;
                if (bs.accountsReceivable !== null) d.accountsReceivable = bs.accountsReceivable;
                if (bs.inventory !== null) d.inventory = bs.inventory;
                if (bs.currentAssets !== null) d.currentAssets = bs.currentAssets;
                if (bs.currentLiabilities !== null) d.currentLiabilities = bs.currentLiabilities;
                if (bs.contractLiabilities !== null) d.contractLiabilities = bs.contractLiabilities;
                if (is.revenue !== null) d.revenue = is.revenue;
                if (is.operatingProfit !== null) d.operatingProfit = is.operatingProfit;
                if (is.netProfit !== null) d.netProfit = is.netProfit;
                if (is.nonRecurringProfit !== null) d.nonRecurringProfit = is.nonRecurringProfit;
                if (is.grossMargin !== null) d.grossMargin = is.grossMargin;
                if (is.salesExpenseRatio !== null) d.salesExpenseRatio = is.salesExpenseRatio;
                if (cf.operatingCF !== null) d.operatingCF = cf.operatingCF;
                if (cf.capex !== null) d.capex = cf.capex;
                if (cf.freeCF !== null) d.dcfFCF = cf.freeCF;

                // 更新PE/PB
                if (quoteRes.success) {
                    if (quoteRes.data.peTtm) d.currentPE = quoteRes.data.peTtm;
                    if (quoteRes.data.pb) d.currentPB = quoteRes.data.pb;
                }

                item.data = d;

                // 重新计算DCF合理价
                const fcf = parseFloat(d.dcfFCF);
                const growth = parseFloat(d.growthRate) / 100;
                const discount = parseFloat(d.discountRate) / 100;
                const terminal = (parseFloat(d.terminalGrowth) || 3) / 100;
                const totalShares = parseFloat(d.totalShares);
                const margin = parseFloat(d.safetyMargin) || 0.3;

                const wlDcfResult = calcDCF(fcf, growth, discount, terminal, totalShares);
                if (wlDcfResult && wlDcfResult.perShareValue !== null) {
                    item.fairPrice = parseFloat(wlDcfResult.perShareValue.toFixed(2));
                }
            }

            // 更新历史数据缓存
            if (historyRes.success && Array.isArray(historyRes.data) && historyRes.data.length > 0) {
                if (item.data && item.data._state) {
                    item.data._state.historyData = historyRes.data;
                }
            }

            // 重新计算安全边际
            if (item.currentPrice !== null && item.fairPrice && item.fairPrice > 0) {
                item.safetyMarginPct = parseFloat(((item.fairPrice - item.currentPrice) / item.currentPrice * 100).toFixed(1));
                if (item.safetyMarginPct > 30) item.action = '建议买入';
                else if (item.safetyMarginPct > 0) item.action = '可关注';
                else item.action = '高估等待';
            }

            item.timestamp = Date.now();
            updated++;
        } catch (e) { /* 忽略单个失败 */ }
    }

    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
    renderWatchlist();
    updateSortButtons();

    if (btn) {
        btn.disabled = false;
        btn.textContent = '🔄 刷新数据';
    }

    showFetchStatus('success', `✓ 已更新 ${updated}/${list.length} 只股票的全部数据`);

    // 云端同步：刷新后批量推送
    if (window.svaCloud && window.svaAuth && window.svaAuth.isLoggedIn()) {
        window.svaCloud.pushAllWatchlist();
    }
}

// ==================== 图表渲染 ====================

function destroyChart(name) {
    if (charts[name]) {
        charts[name].destroy();
        charts[name] = null;
    }
}

function renderHealthRadar() {
    const hc = state.lastHealthCheck || { dangerCount: 0, warningCount: 0, healthyCount: 0 };
    const { dangerCount, warningCount, healthyCount } = hc;
    const total = dangerCount + warningCount + healthyCount;
    if (total === 0) {
        document.getElementById('healthChartCard').style.display = 'none';
        destroyChart('healthRadar');
        return;
    }

    document.getElementById('healthChartCard').style.display = 'block';
    destroyChart('healthRadar');

    const ctx = document.getElementById('healthRadarChart').getContext('2d');

    // 6个维度评分（0-100）
    const dimensions = ['偿债能力', '现金流质量', '商誉风险', '回款能力', '利润质量', '自由现金流'];
    const scores = [0, 0, 0, 0, 0, 0];

    // 计算各项分数
    const interestDebt = parseFloat(document.getElementById('interestDebt').value);
    const totalAssets = parseFloat(document.getElementById('totalAssets').value);
    if (!isNaN(interestDebt) && !isNaN(totalAssets) && totalAssets > 0) {
        scores[0] = Math.max(0, 100 - (interestDebt / totalAssets) * 200);
    }

    const operatingCF = parseFloat(document.getElementById('operatingCF').value);
    const netProfit = parseFloat(document.getElementById('netProfit').value);
    if (!isNaN(operatingCF) && !isNaN(netProfit) && netProfit > 0) {
        scores[1] = Math.min(100, (operatingCF / netProfit) * 80);
    }

    const goodwill = parseFloat(document.getElementById('goodwill').value);
    const netAssets = parseFloat(document.getElementById('netAssets').value);
    if (!isNaN(goodwill) && !isNaN(netAssets) && netAssets > 0) {
        scores[2] = Math.max(0, 100 - (goodwill / netAssets) * 250);
    } else if (!isNaN(goodwill) && goodwill === 0) {
        scores[2] = 100;
    }

    const accountsReceivable = parseFloat(document.getElementById('accountsReceivable').value);
    const revenue = parseFloat(document.getElementById('revenue').value);
    if (!isNaN(accountsReceivable) && !isNaN(revenue) && revenue > 0) {
        scores[3] = Math.max(0, 100 - (accountsReceivable / revenue) * 200);
    }

    const nonRecurringProfit = parseFloat(document.getElementById('nonRecurringProfit').value);
    if (!isNaN(nonRecurringProfit) && !isNaN(netProfit) && netProfit > 0) {
        scores[4] = Math.min(100, (nonRecurringProfit / netProfit) * 100);
    }

    const capex = parseFloat(document.getElementById('capex').value);
    if (!isNaN(operatingCF) && !isNaN(capex) && !isNaN(revenue) && revenue > 0) {
        const fcf = operatingCF - capex;
        scores[5] = Math.min(100, (fcf / revenue) * 500);
    }

    charts.healthRadar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: dimensions,
            datasets: [{
                label: '健康度',
                data: scores,
                backgroundColor: 'rgba(181, 72, 52, 0.15)',
                borderColor: 'rgba(181, 72, 52, 0.8)',
                borderWidth: 2,
                pointBackgroundColor: scores.map(s => s >= 60 ? '#5a7a3a' : s >= 30 ? '#b07d2a' : '#c53030'),
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { stepSize: 25, font: { size: 10 } },
                    pointLabels: { font: { size: 12 } },
                    grid: { color: 'rgba(139, 111, 71, 0.1)' },
                    angleLines: { color: 'rgba(139, 111, 71, 0.1)' }
                }
            }
        }
    });
}

function renderValuationBar() {
    const fcf = parseFloat(document.getElementById('dcfFCF').value);
    const growth = parseFloat(document.getElementById('growthRate').value) / 100;
    const discount = parseFloat(document.getElementById('discountRate').value) / 100;
    const terminal = (parseFloat(document.getElementById('terminalGrowth').value) || 3) / 100;
    const totalShares = parseFloat(document.getElementById('totalShares').value);
    const currentPrice = parseFloat(document.getElementById('currentPrice').value);
    const margin = parseFloat(document.getElementById('safetyMargin').value);

    const card = document.getElementById('valuationCompareCard');
    const body = document.getElementById('valuationCompareBody');

    const vbResult = calcDCF(fcf, growth, discount, terminal, totalShares);
    if (!vbResult || vbResult.perShareValue === null || isNaN(margin)) {
        card.style.display = 'none';
        return;
    }

    const perShare = vbResult.perShareValue;
    const buyPrice = perShare * (1 - margin);

    // 构建表格行
    let rows = '';
    rows += `<tr><td class="vc-label">每股内在价值</td><td class="vc-value">${curSym()}${perShare.toFixed(2)}</td><td><span class="vc-tag fair">基准</span></td></tr>`;
    // 买入价标签：随当前价与买入价的关系自动变化
    let buyTagClass = 'cheap', buyTagText = '建议买入';
    if (!isNaN(currentPrice) && currentPrice > 0) {
        if (currentPrice <= buyPrice) {
            buyTagClass = 'cheap';
            buyTagText = '可买入';
        } else {
            const overPct = ((currentPrice - buyPrice) / buyPrice * 100).toFixed(1);
            if (currentPrice <= perShare) {
                buyTagClass = 'fair';
                buyTagText = `等待回调 +${overPct}%`;
            } else {
                buyTagClass = 'expensive';
                buyTagText = `已高估 +${overPct}%`;
            }
        }
    }
    rows += `<tr><td class="vc-label">安全边际买入价</td><td class="vc-value">${curSym()}${buyPrice.toFixed(2)}</td><td><span class="vc-tag ${buyTagClass}">${buyTagText}</span></td></tr>`;

    if (!isNaN(currentPrice) && currentPrice > 0) {
        const marginPct = ((buyPrice - currentPrice) / currentPrice * 100).toFixed(1);
        let tagClass, tagText;
        if (currentPrice <= buyPrice) {
            tagClass = 'cheap';
            tagText = `低估 ${marginPct}%`;
        } else if (currentPrice <= perShare) {
            tagClass = 'fair';
            tagText = `合理偏高 +${Math.abs(marginPct)}%`;
        } else {
            tagClass = 'expensive';
            tagText = `高估 +${Math.abs(marginPct)}%`;
        }
        rows += `<tr><td class="vc-label">当前股价</td><td class="vc-value ${tagClass}">${curSym()}${currentPrice.toFixed(2)}</td><td><span class="vc-tag ${tagClass}">${tagText}</span></td></tr>`;
    }

    body.innerHTML = rows;
    card.style.display = 'block';
}

function renderTrendChart(history) {
    if (!history || history.length === 0) return null;

    const years = history.map(h => h.year).reverse();
    const revenues = years.map(y => { const h = history.find(d => d.year === y); return h ? h.revenue : null; });
    const profits = years.map(y => { const h = history.find(d => d.year === y); return h ? h.netProfit : null; });

    return {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: '营业收入(亿)',
                    data: revenues,
                    borderColor: 'rgba(181, 72, 52, 0.85)',
                    backgroundColor: 'rgba(181, 72, 52, 0.12)',
                    fill: true, tension: 0.3, borderWidth: 2
                },
                {
                    label: '净利润(亿)',
                    data: profits,
                    borderColor: 'rgba(201, 165, 92, 0.85)',
                    backgroundColor: 'rgba(201, 165, 92, 0.12)',
                    fill: true, tension: 0.3, borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true } }
        }
    };
}

function renderScoreDonut(score) {
    const color = score >= 70 ? '#5a7a3a' : score >= 40 ? '#b07d2a' : '#c53030';
    return {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [score, 100 - score],
                backgroundColor: [color, 'rgba(0,0,0,0.06)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        },
        plugins: [{
            id: 'centerText',
            afterDraw(chart) {
                const { ctx, chartArea } = chart;
                ctx.save();
                const x = (chartArea.left + chartArea.right) / 2;
                const y = (chartArea.top + chartArea.bottom) / 2;
                ctx.font = 'bold 36px sans-serif';
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(score, x, y);
                ctx.restore();
            }
        }]
    };
}

// ==================== 股票搜索 ====================

async function searchStock(keyword) {
    if (!keyword || keyword.length < 1) {
        document.getElementById('searchResults').innerHTML = '';
        return;
    }

    // 如果是5-6位数字代码，直接获取
    if (/^\d{5,6}$/.test(keyword)) {
        document.getElementById('searchResults').innerHTML = '';
        fetchStockData();
        return;
    }

    try {
        const res = await fetch(`/api/search/${encodeURIComponent(keyword)}`).then(r => r.json());
        if (res.success && res.data.length > 0) {
            const container = document.getElementById('searchResults');
            container.innerHTML = res.data.slice(0, 10).map(s => `
                <div class="search-result-item" onclick="selectSearchResult('${s.code}', '${s.name.replace(/'/g, '')}')">
                    <span class="sr-name">${s.name}</span>
                    <span class="sr-code">${s.code} · ${s.marketLabel || s.market}</span>
                </div>
            `).join('');
        } else {
            document.getElementById('searchResults').innerHTML = '<div class="search-result-item"><span class="sr-name" style="color:var(--color-text-muted)">未找到匹配的股票</span></div>';
        }
    } catch (e) {
        // 搜索失败静默处理
    }
}

function selectSearchResult(code, name) {
    document.getElementById('fetchCode').value = code;
    document.getElementById('searchResults').innerHTML = '';
    fetchStockData();
}

// ==================== 报告导出 ====================

function exportReport() {
    generateReport(); // 确保报告已生成

    const stockName = document.getElementById('stockName').value || '未命名';
    const stockCode = document.getElementById('stockCode').value || '—';
    const reportEl = document.getElementById('reportContainer');

    if (!reportEl.querySelector('.report-content')) {
        alert('请先生成报告后再导出');
        return;
    }

    // 收集报告HTML
    const reportHTML = reportEl.querySelector('.report-content').outerHTML;

    // 构建独立HTML文件
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>价值投资分析报告 - ${stockName}（${stockCode}）</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
    --color-primary: #b54834; --color-gold: #c9a55c; --color-success: #5a7a3a; --color-success-bg: #f0f5e8;
    --color-danger: #c53030; --color-danger-bg: #fdf0f0; --color-warning: #b07d2a;
    --color-warning-bg: #faf5eb; --color-info-bg: #faf3ee; --color-bg: #fdf9f0;
    --color-card: #fffdf7; --color-border: #e8dcc8; --color-text: #3d2b1f;
    --color-text-secondary: #8a7560; --color-text-muted: #b0a090; --radius: 8px;
}
body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; background: var(--color-bg); color: var(--color-text); line-height: 1.6; padding: 20px; }
.report-content { max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
.report-conclusion { text-align: center; padding: 32px; background: linear-gradient(135deg, #b54834, #963a2a); color: #fff; border-radius: var(--radius); border: 1px solid var(--color-gold); }
.report-conclusion.buy { background: linear-gradient(135deg, #5a7a3a, #4a6b30); }
.report-conclusion.watch { background: linear-gradient(135deg, #b07d2a, #966a20); }
.report-conclusion.reject { background: linear-gradient(135deg, #c53030, #a02525); }
.conclusion-label { font-size: 14px; opacity: 0.85; margin-bottom: 8px; letter-spacing: 1px; }
.conclusion-title { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
.conclusion-reasons { font-size: 13px; opacity: 0.9; line-height: 1.8; }
.report-card { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 24px; }
.report-section-title { font-size: 16px; font-weight: 700; color: var(--color-primary); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--color-gold); }
.score-display { display: flex; align-items: center; gap: 20px; }
.score-circle { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #fff; }
.score-circle.high { background: var(--color-success); } .score-circle.medium { background: var(--color-warning); } .score-circle.low { background: var(--color-danger); }
.report-charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.report-chart-card { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 18px; }
.report-chart-card h4 { font-family: 'Noto Serif SC','SimSun',serif; font-size: 14px; color: var(--color-primary); margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border); }
.report-chart-card.full-width { grid-column: span 2; }
.chart-container { position: relative; width: 100%; margin: 0 auto; }
.report-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.report-table th { text-align: left; padding: 10px 12px; background: #f5efe2; border-bottom: 2px solid var(--color-gold); }
.report-table td { padding: 10px 12px; border-bottom: 1px solid var(--color-border); }
.report-table td.status-pass { color: var(--color-success); font-weight: 600; }
.report-table td.status-fail { color: var(--color-danger); font-weight: 600; }
.report-table td.status-warning { color: var(--color-warning); font-weight: 600; }
.risk-list { display: flex; flex-direction: column; gap: 10px; }
.risk-item { display: flex; gap: 10px; padding: 12px 16px; background: var(--color-warning-bg); border-left: 3px solid var(--color-warning); border-radius: 5px; }
.valuation-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; }
.val-summary-item { padding: 20px 12px; background: #f5efe2; border-radius: 5px; }
.val-summary-label { font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px; }
.val-summary-value { font-size: 22px; font-weight: 700; color: var(--color-primary); }
.val-summary-value.profit { color: #c53030; } .val-summary-value.loss { color: #2f855a; }
.placeholder-text { color: #b0a090; font-size: 13px; text-align: center; padding: 20px; }
/* 大成书房页首 */
.masthead-top-line { height: 3px; background: linear-gradient(90deg, #b08d45, #c9a55c, #dbb87a, #c9a55c, #b08d45); }
.masthead-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; }
.masthead-left { display: flex; align-items: center; gap: 16px; }
.masthead-date-badge { font-family: 'Noto Serif SC','SimSun',serif; font-size: 11px; color: #b08d45; border: 1px solid #c9a55c; border-radius: 3px; padding: 3px 10px; letter-spacing: 1px; white-space: nowrap; }
.masthead-title { font-family: 'Noto Serif SC','SimSun',serif; font-size: 20px; font-weight: 700; color: #2c1810; letter-spacing: 2px; line-height: 1.2; }
.masthead-subtitle { font-size: 10px; color: #b0a090; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 1px; }
.masthead-edition { font-family: 'Noto Serif SC','SimSun',serif; font-size: 11px; color: #b08d45; letter-spacing: 2px; border-left: 1px solid #e8dcc8; padding-left: 16px; white-space: nowrap; }
.masthead-bottom-line { height: 2px; background: linear-gradient(90deg, #b08d45, #c9a55c, #dbb87a, #c9a55c, #b08d45); }
/* 大成书房页脚 */
.app-footer { text-align: center; padding: 24px 28px 20px; background: var(--color-card); border-top: 1px solid var(--color-border); margin-top: 20px; }
.footer-brand { font-family: 'Noto Serif SC','SimSun',serif; font-size: 14px; color: #b08d45; letter-spacing: 3px; font-weight: 600; }
.footer-divider { width: 32px; height: 2px; background: #c9a55c; margin: 8px auto; border-radius: 1px; }
.footer-slogan { font-size: 12px; color: #b0a090; letter-spacing: 1px; }
/* 估值对比表格 */
.valuation-compare-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.valuation-compare-table th { text-align: left; padding: 10px 14px; background: #f5efe2; color: #8a7560; font-weight: 600; font-size: 13px; border-bottom: 2px solid #c9a55c; }
.valuation-compare-table td { padding: 12px 14px; border-bottom: 1px solid #e8dcc8; }
.valuation-compare-table tr:last-child td { border-bottom: none; }
.valuation-compare-table .vc-label { font-weight: 600; color: #3d2b1f; }
.valuation-compare-table .vc-value { font-family: 'Noto Serif SC','SimSun',serif; font-size: 18px; font-weight: 700; color: #b54834; }
.valuation-compare-table .vc-value.cheap { color: #5a7a3a; }
.valuation-compare-table .vc-value.expensive { color: #c53030; }
.valuation-compare-table .vc-value.fair { color: #b07d2a; }
.valuation-compare-table .vc-tag { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.valuation-compare-table .vc-tag.cheap { background: #f0f5e8; color: #5a7a3a; }
.valuation-compare-table .vc-tag.expensive { background: #fdf0f0; color: #c53030; }
.valuation-compare-table .vc-tag.fair { background: #faf5eb; color: #b07d2a; }
@media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="masthead-top-line"></div>
<div class="masthead-bar">
    <div class="masthead-left">
        <div>
            <div class="masthead-title">价值投资分析报告</div>
            <div class="masthead-subtitle">基于《股市真规则》帕特·多尔西五步分析法</div>
        </div>
    </div>
    <div class="masthead-edition">大成书房出品</div>
</div>
<div class="masthead-bottom-line"></div>
<div style="max-width:800px;margin:0 auto;padding:24px 20px;">
<div style="text-align:center;color:#b0a090;font-size:13px;margin-bottom:20px;">${stockName}（${stockCode}）· 生成于 ${new Date().toLocaleString('zh-CN')}</div>
${reportHTML}
</div>
<div class="app-footer">
    <div class="footer-brand">大成书房</div>
    <div class="footer-divider"></div>
    <div class="footer-slogan">价值投资 · 独立思考 · 长期致胜</div>
</div>
</body>
</html>`;

    // 触发下载
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `估值报告_${stockName}_${stockCode}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

function showFetchStatus(type, msg) {
    const el = document.getElementById('fetchStatus');
    el.className = 'fetch-status ' + type;
    el.textContent = msg;
}

// 导出下拉菜单切换
function toggleExportMenu() {
    const menu = document.getElementById('exportMenu');
    if (menu) menu.classList.toggle('show');
}

// 点击外部关闭下拉菜单
document.addEventListener('click', function(e) {
    const dropdown = document.querySelector('.export-dropdown');
    const menu = document.getElementById('exportMenu');
    if (dropdown && menu && !dropdown.contains(e.target)) {
        menu.classList.remove('show');
    }
});

// 导出PDF
function exportPDF() {
    generateReport();

    const stockName = document.getElementById('stockName').value || '未命名';
    const stockCode = document.getElementById('stockCode').value || '—';
    const reportEl = document.getElementById('reportContainer');

    if (!reportEl.querySelector('.report-content')) {
        alert('请先生成报告后再导出');
        return;
    }

    const reportContent = reportEl.querySelector('.report-content');

    // 构建包含masthead/footer的完整报告容器
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'background:#fdf9f0;padding:30px;font-family:"Noto Serif SC","SimSun",serif;color:#3d2b1f;';

    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;

    wrapper.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:11px;letter-spacing:2px;color:#c9a55c;">价值投资 · 独立思考 · 长期致胜</div>
            <div style="height:2px;background:linear-gradient(90deg,#b8954a,#c9a55c,#b8954a);margin:8px 0;"></div>
            <div style="font-size:22px;font-weight:700;color:#b54834;font-family:'Noto Serif SC',serif;">价值投资分析报告</div>
            <div style="font-size:12px;color:#8a7560;margin-top:4px;">${stockName}（${stockCode}）· 生成于 ${dateStr}</div>
            <div style="font-size:11px;letter-spacing:1px;color:#c9a55c;margin-top:2px;">大成书房出品</div>
            <div style="height:2px;background:linear-gradient(90deg,#b8954a,#c9a55c,#b8954a);margin:8px 0;"></div>
        </div>
        ${reportContent.outerHTML}
        <div style="text-align:center;padding-top:20px;margin-top:20px;border-top:1px solid #e8dcc8;">
            <div style="font-size:14px;color:#c9a55c;letter-spacing:3px;font-family:'Noto Serif SC',serif;">大成书房</div>
            <div style="height:2px;width:60px;background:#c9a55c;margin:8px auto;"></div>
            <div style="font-size:12px;color:#b0a090;letter-spacing:1px;">价值投资 · 独立思考 · 长期致胜</div>
        </div>
    `;

    // 临时挂载到body以便html2pdf渲染
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '800px';
    document.body.appendChild(wrapper);

    const opt = {
        margin: [10, 10, 10, 10],
        filename: `价值投资分析报告_${stockName}_${stockCode}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fdf9f0' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    showFetchStatus('loading', '正在生成PDF，请稍候...');

    html2pdf().set(opt).from(wrapper).save().then(() => {
        document.body.removeChild(wrapper);
        showFetchStatus('success', '✓ PDF已成功导出');
    }).catch(err => {
        document.body.removeChild(wrapper);
        showFetchStatus('error', 'PDF导出失败：' + err.message);
        console.error('PDF export error:', err);
    });
}

// ==================== 启动 ====================
init();

// 初始化云端认证（异步，不阻塞页面加载）
if (window.svaAuth) {
    setTimeout(() => window.svaAuth.init(), 100);
}

