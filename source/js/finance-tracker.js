// ===== GMT 全球市场终端 v3 - 数据引擎 + 布局管理器 =====
(function () {
  'use strict';
  if (!/\/finance\/?($|\?|#)/.test(window.location.pathname)) return;

  // ============================================================
  //  Demo 数 据 (兜底，结构与实时数据一致)
  // ============================================================
  var STOCKS = [
    // AI·科技 (14只)
    { ticker: 'NVDA',  name: '英伟达',      sector: 'tech',  price: 196.51,  chgPct: -4.99,  mktCap: 4850 },
    { ticker: 'MSFT',  name: '微软',        sector: 'tech',  price: 389.10,  chgPct: +1.94,  mktCap: 2920 },
    { ticker: 'AAPL',  name: '苹果',        sector: 'tech',  price: 336.91,  chgPct: +1.17,  mktCap: 4430 },
    { ticker: 'GOOGL', name: '谷歌A',       sector: 'tech',  price: 326.56,  chgPct: +2.13,  mktCap: 2060 },
    { ticker: 'AMZN',  name: '亚马逊',      sector: 'tech',  price: 231.39,  chgPct: -0.31,  mktCap: 1950 },
    { ticker: 'META',  name: 'Meta',        sector: 'tech',  price: 593.87,  chgPct: -0.22,  mktCap: 1510 },
    { ticker: 'AVGO',  name: '博通',        sector: 'tech',  price: 383.22,  chgPct: +0.34,  mktCap: 870 },
    { ticker: 'AMD',   name: 'AMD',         sector: 'tech',  price: 494.95,  chgPct: -5.17,  mktCap: 800 },
    { ticker: 'TSM',   name: '台积电ADR',   sector: 'tech',  price: 399.09,  chgPct: -1.07,  mktCap: 760 },
    { ticker: 'ORCL',  name: '甲骨文',      sector: 'tech',  price: 119.90,  chgPct: +4.27,  mktCap: 480 },
    { ticker: 'INTC',  name: '英特尔',      sector: 'tech',  price: 91.67,   chgPct: -0.70,  mktCap: 390 },
    { ticker: 'CRM',   name: '赛富时',      sector: 'tech',  price: 291.45,  chgPct: +2.15,  mktCap: 285 },
    { ticker: 'ADBE',  name: 'Adobe',       sector: 'tech',  price: 512.30,  chgPct: +1.82,  mktCap: 230 },
    { ticker: 'NOW',   name: 'ServiceNow',  sector: 'tech',  price: 865.20,  chgPct: +2.57,  mktCap: 178 },
    // 能源 (11只)
    { ticker: 'XOM',   name: '埃克森美孚',  sector: 'energy', price: 154.77,  chgPct: -1.38,  mktCap: 610 },
    { ticker: 'CVX',   name: '雪佛龙',      sector: 'energy', price: 190.00,  chgPct: -2.46,  mktCap: 350 },
    { ticker: 'COP',   name: '康菲石油',    sector: 'energy', price: 128.45,  chgPct: -1.95,  mktCap: 150 },
    { ticker: 'SLB',   name: '斯伦贝谢',    sector: 'energy', price: 67.32,   chgPct: -2.10,  mktCap: 96 },
    { ticker: 'EOG',   name: 'EOG资源',     sector: 'energy', price: 142.80,  chgPct: -1.65,  mktCap: 82 },
    { ticker: 'PXD',   name: '先锋自然',    sector: 'energy', price: 276.50,  chgPct: -2.80,  mktCap: 64 },
    { ticker: 'OXY',   name: '西方石油',    sector: 'energy', price: 71.15,   chgPct: -1.42,  mktCap: 63 },
    { ticker: 'MPC',   name: '马拉松原油',  sector: 'energy', price: 185.60,  chgPct: -0.95,  mktCap: 61 },
    { ticker: 'VLO',   name: '瓦莱罗能源',  sector: 'energy', price: 163.90,  chgPct: -1.78,  mktCap: 53 },
    { ticker: 'HES',   name: '赫斯公司',    sector: 'energy', price: 158.20,  chgPct: -2.05,  mktCap: 48 },
    { ticker: 'DVN',   name: '戴文能源',    sector: 'energy', price: 52.80,   chgPct: -1.12,  mktCap: 34 },
    // 金融 (11只)
    { ticker: 'JPM',   name: '摩根大通',    sector: 'finance', price: 356.20,  chgPct: +0.85,  mktCap: 1020 },
    { ticker: 'BRK.B', name: '伯克希尔B',   sector: 'finance', price: 497.18,  chgPct: +0.45,  mktCap: 960 },
    { ticker: 'V',     name: 'Visa',        sector: 'finance', price: 362.53,  chgPct: +1.91,  mktCap: 740 },
    { ticker: 'MA',    name: '万事达',      sector: 'finance', price: 551.71,  chgPct: +2.23,  mktCap: 510 },
    { ticker: 'BAC',   name: '美国银行',    sector: 'finance', price: 62.13,   chgPct: +0.13,  mktCap: 490 },
    { ticker: 'GS',    name: '高盛',        sector: 'finance', price: 1048.23, chgPct: -1.22,  mktCap: 330 },
    { ticker: 'MS',    name: '摩根士丹利',  sector: 'finance', price: 214.56,  chgPct: +0.04,  mktCap: 340 },
    { ticker: 'WFC',   name: '富国银行',    sector: 'finance', price: 87.27,   chgPct: +1.11,  mktCap: 310 },
    { ticker: 'BLK',   name: '贝莱德',      sector: 'finance', price: 1062.14, chgPct: +0.61,  mktCap: 160 },
    { ticker: 'SCHW',  name: '嘉信理财',    sector: 'finance', price: 104.18,  chgPct: +2.17,  mktCap: 190 },
    { ticker: 'AXP',   name: '美国运通',    sector: 'finance', price: 335.39,  chgPct: +2.83,  mktCap: 240 },
  ];

  // 跑马灯条目
  var TICKER_ITEMS = [
    { sym: 'SPX',  name: '标普500',       exchange: 'CBOE',     price: 7413.18, chg: 1.20,  chgPct: 0.02 },
    { sym: 'IXIC', name: '纳斯达克综合',  exchange: 'NASDAQ',   price: 24932.08,chg: -43.72,chgPct: -0.18 },
    { sym: 'DJI',  name: '道琼斯工业',    exchange: 'NYSE',     price: 52210.08,chg: 262.88,chgPct: 0.51 },
    { sym: 'GSPTSE',name: '标普/TSX综合', exchange: 'TSX',      price: 35568.14,chg: 199.04,chgPct: 0.56 },
    { sym: 'BVSP', name: '圣保罗IBOVESPA',exchange: 'B3',       price: 175334.45,chg: 1292.50,chgPct: 0.74 },
    { sym: 'SX5E', name: '欧洲斯托克50',  exchange: 'Euronext', price: 6302.73, chg: 20.52, chgPct: 0.33 },
    { sym: 'UKX',  name: '富时100',       exchange: 'LSE',      price: 10792.10,chg: 10.35, chgPct: 0.10 },
    { sym: 'DAX',  name: '德国DAX',       exchange: 'Xetra',    price: 25482.09,chg: 121.06,chgPct: 0.48 },
    { sym: 'XAU',  name: '黄金',          exchange: 'COMEX',    price: 4050.40, chg: -24.10,chgPct: -0.59 },
    { sym: 'WTI',  name: 'WTI原油',       exchange: 'NYMEX',    price: 81.34,   chg: -1.27, chgPct: -1.54 },
    { sym: 'DXY',  name: '美元指数',      exchange: 'ICE',      price: 101.49,  chg: -0.05, chgPct: -0.05 },
  ];

  // 全球指数一览 (按地区)
  var GLOBAL_INDICES = {
    '美洲': [
      { name: '标普500',       exchange: 'CBOE',     price: 7413.18, chgPct: 0.02, status: '已收盘' },
      { name: '纳斯达克综合',  exchange: 'NASDAQ',   price: 24932.08,chgPct: -0.18,status: '已收盘' },
      { name: '道琼斯工业',    exchange: 'NYSE',     price: 52210.08,chgPct: 0.51, status: '已收盘' },
      { name: '标普/TSX综合',  exchange: 'TSX',      price: 35568.14,chgPct: 0.56, status: '已收盘' },
      { name: '圣保罗IBOVESPA',exchange: 'B3',       price: 175334.45,chgPct: 0.74,status: '已收盘' },
    ],
    '欧洲': [
      { name: '欧洲斯托克50',  exchange: 'Euronext', price: 6302.73, chgPct: 0.33, status: '已收盘' },
      { name: '富时100',       exchange: 'LSE',      price: 10792.10,chgPct: 0.10, status: '已收盘' },
      { name: '德国DAX',       exchange: 'Xetra',    price: 25482.09,chgPct: 0.48, status: '已收盘' },
      { name: '法国CAC40',     exchange: 'Euronext Paris', price: 8453.23,chgPct: 0.56,status: '已收盘' },
      { name: '富时MIB',       exchange: 'Borsa Italiana',price: 52159.85,chgPct: 0.20,status: '已收盘' },
    ],
    '亚太': [
      { name: '日经225',       exchange: 'TSE',      price: 62364.92,chgPct: -3.95,status: '交易中' },
      { name: '恒生指数',      exchange: 'HKEX',     price: 25240.88,chgPct: 0.13, status: '交易中' },
      { name: '上证综合',      exchange: 'SSE',      price: 3813.31, chgPct: -0.02,status: '交易中' },
      { name: '韩国KOSPI',     exchange: 'KRX',      price: 6023.66, chgPct: -10.84,status: '交易中' },
      { name: '澳洲ASX200',    exchange: 'ASX',      price: 8947.80, chgPct: 0.60, status: '交易中' },
      { name: '印度NIFTY50',   exchange: 'NSE',      price: 24011.80,chgPct: 0.07, status: '已收盘' },
    ],
  };

  // 兜底新闻
  var NEWS = [
    { tag: 'TECH', cat: '科技', title_cn: '财报直播：美国奢侈品消费者提振业绩，LVMH 销售额增长', title_en: 'Earnings live: LVMH sales grow as US luxury shoppers boost results', link: '', time: '' },
    { tag: 'TECH', cat: '科技', title_cn: '科技股财报与美联储利率决议：本周关注要点', title_en: 'Tech Earnings, Fed Rate Decision: What to Watch This Week', link: '', time: '' },
    { tag: 'TECH', cat: '科技', title_cn: '中国 AI 挑战与板块轮动下，SNDK、英伟达、SK 海力士、阿斯麦隔夜延续跌势', title_en: 'SNDK, NVDA, SKHY, ASML Stocks Extend Slide Overnight', link: '', time: '' },
    { tag: 'TECH', cat: '科技', title_cn: '苹果、FBRX、RTX 今日为何齐创 52 周新高？', title_en: 'Why Did AAPL, FBRX, RTX Stocks Surge To 52-Week Highs Today?', link: '', time: '' },
    { tag: 'AI',   cat: 'AI',   title_cn: '半导体股走势图刚形成这一看跌形态，或预示进一步下跌', title_en: 'Semiconductor stock charts just formed this bearish shape', link: '', time: '' },
    { tag: 'AI',   cat: 'AI',   title_cn: 'AI 焦虑引发科技股抛售，亚洲市场普跌', title_en: 'AI anxiety sparks tech rout, broad selloff in Asian markets', link: '', time: '' },
    { tag: 'ENERGY', cat: '能源', title_cn: '大盘上涨之际埃克森美孚（XOM）逆势下跌', title_en: 'Exxon Mobil Holdings (XOM) Stock Sinks As Market Gains', link: '', time: '' },
    { tag: 'ENERGY', cat: '能源', title_cn: '油价走低，华尔街震荡；美联储决议与重磅财报成焦点', title_en: 'Wall Street Wavers as Oil Slides; Fed Decision, Major Earnings in Focus', link: '', time: '' },
  ];

  // 贵金属
  var METALS = [
    { sym: 'XAU', name: '黄金', futures: 'GC=F', price: 4050.40, chg: -24.10, chgPct: -0.59, range60: '3,985.60–4,720.40' },
    { sym: 'XAG', name: '白银', futures: 'SI=F', price: 57.66, chg: -0.81, chgPct: -1.39, range60: '55.90–88.89' },
    { sym: 'XPT', name: '铂金', futures: 'PL=F', price: 1613.70, chg: -6.90, chgPct: -0.43, range60: '1,550.20–2,187.10' },
    { sym: 'XPD', name: '钯金', futures: 'PA=F', price: 1277.00, chg: -12.60, chgPct: -0.98, range60: '1,161.30–1,546.00' },
  ];

  // ============================================================
  //  配 置
  // ============================================================
  var REFRESH_INTERVAL = 60000;   // 行情 60s
  var NEWS_INTERVAL = 300000;     // 新闻 5min
  var CHART_INTERVAL = 300000;    // 图表 5min
  var lastRefresh = null;
  var lastNewsFetch = null;
  var refreshTimer = null;
  var chartTimer = null;
  var newsTimer = null;
  var dataFetching = false;
  var livePaused = false;
  var currentSource = 'Demo 快照';

  // Yahoo Finance 符号映射 (本地 ticker → Yahoo 符号，^ 与 = 已预编码)
  var YAHOO_SYMBOLS = {
    'NVDA': 'NVDA', 'MSFT': 'MSFT', 'AAPL': 'AAPL', 'GOOGL': 'GOOGL',
    'AMZN': 'AMZN', 'META': 'META', 'AVGO': 'AVGO', 'AMD': 'AMD',
    'TSM': 'TSM', 'ORCL': 'ORCL', 'INTC': 'INTC', 'CRM': 'CRM',
    'ADBE': 'ADBE', 'NOW': 'NOW', 'XOM': 'XOM', 'CVX': 'CVX',
    'COP': 'COP', 'SLB': 'SLB', 'EOG': 'EOG', 'PXD': 'PXD',
    'OXY': 'OXY', 'MPC': 'MPC', 'VLO': 'VLO', 'HES': 'HES',
    'DVN': 'DVN', 'JPM': 'JPM', 'BRK.B': 'BRK-B', 'V': 'V',
    'MA': 'MA', 'BAC': 'BAC', 'GS': 'GS', 'MS': 'MS',
    'WFC': 'WFC', 'BLK': 'BLK', 'SCHW': 'SCHW', 'AXP': 'AXP',
    'XLK': 'XLK', 'XLE': 'XLE', 'XLF': 'XLF',
    'SPX': '%5EGSPC', 'IXIC': '%5EIXIC', 'DJI': '%5EDJI',
    'GSPTSE': '%5EGSPTSE', 'BVSP': '%5EBVSP',
    'SX5E': '%5ESTOXX50E', 'UKX': '%5EFTSE', 'DAX': '%5EGDAXI',
    'FCHI': '%5EFCHI', 'FTMIB': '%5EFTMIB',
    'N225': '%5EN225', 'HSI': '%5EHSI',
    'KOSPI': '%5EKS11', 'AXJO': '%5EAXJO', 'NSEI': '%5ENSEI',
    'XAU': 'GC%3DF', 'XAG': 'SI%3DF', 'XPT': 'PL%3DF', 'XPD': 'PA%3DF',
    'WTI': 'CL%3DF', 'DXY': 'DX-Y.NYB'
  };

  // ============================================================
  //  工 具 函 数
  // ============================================================
  function fmtPrice(v) {
    if (v === undefined || v === null || isNaN(v)) return '--';
    if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v.toFixed(2);
  }
  function fmtPct(v) {
    var n = parseFloat(v);
    if (isNaN(n)) return '--';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function byId(id) { return document.getElementById(id); }
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function timeoutSignal(ms) {
    if (window.AbortSignal && AbortSignal.timeout) return AbortSignal.timeout(ms);
    var c = new AbortController();
    setTimeout(function () { c.abort(); }, ms);
    return c.signal;
  }
  function fmtTime(d) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function fmtDateTime(d) {
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  // ============================================================
  //  代 理 池 (CORS proxy pool，自动熔断 + 记忆可用代理)
  // ============================================================
  var PROXIES = [
    { name: 'corsproxy',  wrap: function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); } },
    { name: 'allorigins', wrap: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
    { name: 'codetabs',   wrap: function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } },
  ];
  var proxyIdx = 0; // 上次成功的代理下标，下次优先用

  async function proxiedFetch(url, timeoutMs) {
    var errors = [];
    for (var i = 0; i < PROXIES.length; i++) {
      var idx = (proxyIdx + i) % PROXIES.length;
      var p = PROXIES[idx];
      try {
        var resp = await fetch(p.wrap(url), { signal: timeoutSignal(timeoutMs || 9000) });
        if (resp.ok) {
          if (idx !== proxyIdx) console.log('[proxy] 切换到 ' + p.name);
          proxyIdx = idx;
          return resp;
        }
        errors.push(p.name + ':' + resp.status);
      } catch (e) {
        errors.push(p.name + ':' + (e.name === 'TimeoutError' || e.name === 'AbortError' ? 'timeout' : e.message));
      }
    }
    throw new Error('所有代理均失败 [' + errors.join(' | ') + ']');
  }

  // ============================================================
  //  行 情 数 据 引 擎
  //  降级链: Yahoo v8 spark 批量 → Demo 快照 (Yahoo v7 已被官方锁死需 crumb)
  // ============================================================
  function getYahooBatchSymbols() {
    var symbols = [];
    STOCKS.forEach(function (s) { symbols.push(YAHOO_SYMBOLS[s.ticker] || s.ticker); });
    ['XLK', 'XLE', 'XLF'].forEach(function (s) { symbols.push(YAHOO_SYMBOLS[s]); });
    ['SPX','IXIC','DJI','GSPTSE','BVSP','SX5E','UKX','DAX','FCHI','FTMIB',
     'N225','HSI','KOSPI','AXJO','NSEI','XAU','XAG','XPT','XPD','WTI','DXY'].forEach(function (k) {
      if (YAHOO_SYMBOLS[k]) symbols.push(YAHOO_SYMBOLS[k]);
    });
    return symbols.join(',');
  }

  // 数据源 1: Yahoo v8 spark 批量接口 (一次请求覆盖全部标的；v7 已被官方锁死)
  // 注: spark 不返回市值与盘态，市值沿用内置快照(变化缓慢可接受)，盘态由本地时钟计算
  async function fetchFromYahoo() {
    var symbols = getYahooBatchSymbols().split(',');
    // 分批请求，每批 20 个符号，避免 URL 过长/端点限制
    var BATCH = 20;
    var batches = [];
    for (var i = 0; i < symbols.length; i += BATCH) {
      batches.push(symbols.slice(i, i + BATCH).join(','));
    }
    var results = [];
    await Promise.all(batches.map(async function (batch) {
      var url = 'https://query1.finance.yahoo.com/v8/finance/spark?symbols=' + batch + '&range=2d&interval=1d';
      var resp = await proxiedFetch(url, 9000);
      var data = await resp.json();
      // 兼容两种响应结构: 旧版 {SYM:{...}} / 新版 {spark:{result:[...]}}
      var entries = [];
      if (data && data.spark && data.spark.result) {
        data.spark.result.forEach(function (r) {
          var body = r.response && r.response[0];
          if (body) entries.push([r.symbol, body]);
        });
      } else if (data) {
        Object.keys(data).forEach(function (k) { entries.push([k, data[k]]); });
      }
      entries.forEach(function (pair) {
        var sym = pair[0], body = pair[1];
        var closes = body.close || (body.indicators && body.indicators.quote && body.indicators.quote[0] && body.indicators.quote[0].close);
        if (!closes || closes.length === 0) return;
        var last = null;
        for (var j = closes.length - 1; j >= 0; j--) {
          if (closes[j] !== null && closes[j] !== undefined) { last = closes[j]; break; }
        }
        var prev = body.chartPreviousClose || body.previousClose ||
          (body.meta && (body.meta.chartPreviousClose || body.meta.previousClose));
        if (last === null || !prev) return;
        results.push({
          symbol: sym,
          price: last,
          change: last - prev,
          chgPct: (last - prev) / prev * 100,
          marketCap: null,
          marketState: null
        });
      });
    }));
    if (results.length === 0) throw new Error('Yahoo spark 返回空数据');
    return results;
  }

  // 反向映射表: Yahoo/Stooq 符号 → 本地 ticker
  var REVERSE_MAP = (function () {
    var m = {};
    Object.keys(YAHOO_SYMBOLS).forEach(function (k) {
      m[decodeURIComponent(YAHOO_SYMBOLS[k])] = k;
    });
    // Stooq 符号
    STOCKS.forEach(function (s) { m[s.ticker.replace('.', '-').toLowerCase() + '.us'] = s.ticker; });
    m['^spx'] = 'SPX'; m['^ndq'] = 'IXIC'; m['^dji'] = 'DJI';
    m['xauusd'] = 'XAU'; m['xagusd'] = 'XAG'; m['xptusd'] = 'XPT'; m['xpdusd'] = 'XPD';
    return m;
  })();

  function marketStateLabel(state) {
    if (state === 'REGULAR') return '交易中';
    if (state === 'PRE' || state === 'PREPRE') return '盘前';
    if (state === 'POST' || state === 'POSTPOST') return '盘后';
    return '已收盘';
  }

  // 用归一化报价更新全部数据
  function applyQuotes(results) {
    var lookup = {};
    results.forEach(function (r) {
      var local = REVERSE_MAP[r.symbol] || REVERSE_MAP[r.symbol.replace('-', '.')] || r.symbol;
      lookup[local] = r;
    });

    // 1. 股票
    STOCKS.forEach(function (s) {
      var q = lookup[s.ticker];
      if (q && q.price !== undefined && q.price !== null) {
        s.price = q.price;
        s.chgPct = parseFloat((q.chgPct || 0).toFixed(2));
        if (q.marketCap) s.mktCap = Math.round(q.marketCap / 1e9);
      }
    });

    // 2. 跑马灯
    TICKER_ITEMS.forEach(function (item) {
      var q = lookup[item.sym];
      if (q && q.price !== undefined && q.price !== null) {
        item.price = q.price;
        item.chg = parseFloat((q.change || 0).toFixed(2));
        item.chgPct = parseFloat((q.chgPct || 0).toFixed(2));
      }
    });

    // 3. 贵金属
    METALS.forEach(function (m) {
      var q = lookup[m.sym];
      if (q && q.price !== undefined && q.price !== null) {
        m.price = q.price;
        m.chg = parseFloat((q.change || 0).toFixed(2));
        m.chgPct = parseFloat((q.chgPct || 0).toFixed(2));
      }
    });

    // 4. 全球指数一览
    var giMap = {
      '标普500': 'SPX', '纳斯达克综合': 'IXIC', '道琼斯工业': 'DJI',
      '标普/TSX综合': 'GSPTSE', '圣保罗IBOVESPA': 'BVSP',
      '欧洲斯托克50': 'SX5E', '富时100': 'UKX', '德国DAX': 'DAX',
      '法国CAC40': 'FCHI', '富时MIB': 'FTMIB',
      '日经225': 'N225', '恒生指数': 'HSI', '韩国KOSPI': 'KOSPI',
      '澳洲ASX200': 'AXJO', '印度NIFTY50': 'NSEI'
    };
    Object.keys(GLOBAL_INDICES).forEach(function (region) {
      GLOBAL_INDICES[region].forEach(function (idx) {
        var q = lookup[giMap[idx.name]];
        if (q && q.price !== undefined && q.price !== null) {
          idx.price = q.price;
          idx.chgPct = parseFloat((q.chgPct || 0).toFixed(2));
          if (q.marketState) idx.status = marketStateLabel(q.marketState);
        }
      });
    });

    // 5. 板块 ETF 涨跌条 (日内图未加载时的兜底)
    var sectorChg = {};
    ['XLK', 'XLE', 'XLF'].forEach(function (sym) {
      var q = lookup[sym];
      if (q) sectorChg[sym] = parseFloat((q.chgPct || 0).toFixed(2));
    });
    updateSectorStrip(sectorChg);

    renderAll();
  }

  function updateStatus(mode, detail) {
    currentSource = detail;
    var badge = byId('mode-badge');
    if (badge) {
      badge.textContent = '● ' + mode;
      badge.title = detail + (lastRefresh ? ' · 最后更新 ' + fmtTime(lastRefresh) : '');
    }
    var asof = byId('hm-asof');
    if (asof && lastRefresh) {
      asof.textContent = 'as-of ' + lastRefresh.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    var bd = byId('bd-asof');
    if (bd && lastRefresh) bd.textContent = 'as-of ' + fmtDateTime(lastRefresh);
    var ft = byId('ft-src');
    if (ft) ft.textContent = '数据源：' + detail + (lastRefresh ? ' · 更新于 ' + fmtTime(lastRefresh) : '');
  }

  // 主行情获取：Yahoo spark → Demo
  async function fetchQuotes(force) {
    if (dataFetching) return;
    dataFetching = true;
    try {
      var results = await fetchFromYahoo();
      applyQuotes(results);
      lastRefresh = new Date();
      updateStatus(livePaused ? '快照·暂停' : '实时', 'Yahoo Finance（对前收口径）');
      dataFetching = false;
      return;
    } catch (e) {
      console.warn('[quote] Yahoo 失败: ' + e.message);
    }
    console.warn('[quote] 实时源失败，保持 Demo 快照');
    updateStatus('快照·离线', 'Demo 快照（实时源暂不可用）');
    dataFetching = false;
  }

  // ============================================================
  //  图 表 数 据 (Yahoo v8 chart API，走代理池)
  // ============================================================
  var lastAAPLChart = null;   // 缓存供 resize/zoom 重绘
  var lastSectorCharts = null;
  var lastGoldChart = null;

  async function fetchChartData() {
    // AAPL 60日
    try {
      var aaplResp = await proxiedFetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=3mo&interval=1d', 9000);
      var aaplData = await aaplResp.json();
      if (aaplData.chart && aaplData.chart.result && aaplData.chart.result[0]) {
        lastAAPLChart = aaplData.chart.result[0];
        renderAAPLChart();
      }
    } catch (e) { console.warn('[chart] AAPL: ' + e.message); }

    // 板块日内 (XLK/XLE/XLF 5分钟线)
    var sectorData = {};
    var got = 0;
    for (var i = 0; i < 3; i++) {
      var sym = ['XLK', 'XLE', 'XLF'][i];
      try {
        var resp = await proxiedFetch('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '?range=1d&interval=5m', 9000);
        var d = await resp.json();
        if (d.chart && d.chart.result && d.chart.result[0]) {
          sectorData[sym] = d.chart.result[0];
          got++;
        }
      } catch (e) { console.warn('[chart] ' + sym + ': ' + e.message); }
    }
    if (got > 0) {
      lastSectorCharts = sectorData;
      renderSectorChart();
    }

    // 黄金 60日
    try {
      var goldResp = await proxiedFetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=3mo&interval=1d', 9000);
      var goldData = await goldResp.json();
      if (goldData.chart && goldData.chart.result && goldData.chart.result[0]) {
        lastGoldChart = goldData.chart.result[0];
        renderMetalChart();
        updateMetalRanges();
      }
    } catch (e) { console.warn('[chart] 黄金: ' + e.message); }
  }

  function updateMetalRanges() {
    if (!lastGoldChart) return;
    var quotes = lastGoldChart.indicators && lastGoldChart.indicators.quote && lastGoldChart.indicators.quote[0];
    var ts = lastGoldChart.timestamp;
    if (!quotes || !ts) return;
    var closes = [];
    for (var i = 0; i < ts.length; i++) {
      if (quotes.close && quotes.close[i] !== null) closes.push(quotes.close[i]);
    }
    if (closes.length < 10) return;
    var slice = closes.slice(-60);
    var min = Math.min.apply(null, slice), max = Math.max.apply(null, slice);
    METALS[0].range60 = fmtPrice(min) + '–' + fmtPrice(max);
    renderMetals();
  }

  function updateSectorStrip(chgs) {
    var strip = byId('sector-strip');
    if (!strip) return;
    var names = { XLK: 'AI·科技（XLK）', XLE: '能源（XLE）', XLF: '金融（XLF）' };
    var html = '';
    Object.keys(names).forEach(function (k) {
      var chg = chgs[k] !== undefined ? chgs[k] : 0;
      html += '<div class="stat"><div class="sl">' + names[k] + '</div><div class="sv ' + (chg >= 0 ? 'up' : 'down') + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</div></div>';
    });
    strip.innerHTML = html;
  }

  // ============================================================
  //  新 闻 数 据 (rss2json 解析 Yahoo Finance RSS，免 key)
  // ============================================================
  var NEWS_FEEDS = [
    'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US',
    'https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL,NVDA,MSFT,GOOGL,META&region=US&lang=en-US'
  ];

  function categorizeNews(title) {
    var t = title.toLowerCase();
    if (/\b(ai|artificial intelligence|openai|anthropic|nvidia|semiconductor|chip|tsmc|gpu)\b/.test(t)) return { tag: 'AI', cat: 'AI' };
    if (/\b(gold|silver|platinum|palladium|bullion|precious metal)\b/.test(t)) return { tag: 'METAL', cat: '金属' };
    if (/\b(oil|crude|opec|energy|exxon|chevron|natural gas)\b/.test(t)) return { tag: 'ENERGY', cat: '能源' };
    if (/\b(fed|fomc|inflation|cpi|gdp|jobs report|treasury|tariff|economy|recession)\b/.test(t)) return { tag: 'MACRO', cat: '宏观' };
    if (/\b(bank|jpmorgan|goldman|visa|mastercard|berkshire|wall street|earnings)\b/.test(t)) return { tag: 'FIN', cat: '金融' };
    return { tag: 'TECH', cat: '科技' };
  }

  async function fetchNews(force) {
    try {
      var items = [];
      var seen = {};
      for (var i = 0; i < NEWS_FEEDS.length; i++) {
        var url = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(NEWS_FEEDS[i]);
        var resp = await fetch(url, { signal: timeoutSignal(9000) });
        if (!resp.ok) continue;
        var data = await resp.json();
        if (data.status !== 'ok' || !data.items) continue;
        data.items.forEach(function (it) {
          if (!it.title || seen[it.title]) return;
          seen[it.title] = true;
          var c = categorizeNews(it.title);
          items.push({
            tag: c.tag, cat: c.cat,
            title_cn: it.title,
            title_en: it.author || it.categories && it.categories[0] || 'Yahoo Finance',
            link: it.link || '',
            time: it.pubDate ? fmtTime(new Date(it.pubDate.replace(' ', 'T'))) : ''
          });
        });
      }
      if (items.length > 0) {
        NEWS = items.slice(0, 40);
        lastNewsFetch = new Date();
        var asof = byId('news-asof');
        if (asof) asof.textContent = '实时 · 抓取于 ' + fmtDateTime(lastNewsFetch) + '（北京）';
        renderNews();
        return;
      }
      throw new Error('无有效新闻');
    } catch (e) {
      console.warn('[news] 获取失败: ' + e.message);
      var asof2 = byId('news-asof');
      if (asof2) asof2.textContent = '内置快讯 · 实时源暂不可用';
    }
  }

  // ============================================================
  //  状 态
  // ============================================================
  var currentSectorFilter = 'all';
  var currentNewsFilter = 'all';
  var currentDirFilter = null;
  var showArea = true;
  var showList = false;
  var tapePaused = false;
  var editing = false;
  var newsAuto = false;
  var newsAutoTimer = null;
  var newsAutoIdx = 0;

  // ============================================================
  //  时 钟 (命令栏)
  // ============================================================
  function updateClock() {
    var now = new Date();
    var el = byId('cmd-clock');
    if (el) el.textContent = now.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    var st = byId('conn-status');
    if (st) st.textContent = now.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' 当前时间';
  }

  // ============================================================
  //  跑 马 灯
  // ============================================================
  function renderTape() {
    var container = byId('tape');
    if (!container) return;
    var items = [];
    for (var t = 0; t < 2; t++) {
      TICKER_ITEMS.forEach(function (item) {
        var cls = item.chgPct >= 0 ? 'up' : 'down';
        items.push('<span class="tape-item" data-sym="' + item.sym + '" title="' + item.name + ' · 点击查看 Yahoo Finance 报价">' +
          '<span class="ts">' + item.sym + '</span>' +
          '<span class="tl">' + fmtPrice(item.price) + '</span>' +
          '<span class="tc ' + cls + '">' + (item.chg >= 0 ? '+' : '') + item.chg.toFixed(2) + '</span>' +
          '<span class="tp ' + cls + '">' + (item.chgPct >= 0 ? '+' : '') + item.chgPct.toFixed(2) + '%</span>' +
          '</span>');
      });
    }
    container.innerHTML = items.join('');
    container.classList.toggle('paused', tapePaused);
  }

  // ============================================================
  //  热 力 图 (标准 Squarified Treemap, Bruls et al.)
  // ============================================================
  function worstRatio(row, rowSum, side, scale) {
    var max = -Infinity, min = Infinity;
    for (var i = 0; i < row.length; i++) {
      var a = row[i].value * scale;
      if (a > max) max = a;
      if (a < min) min = a;
    }
    var s = rowSum * scale;
    if (s <= 0) return Infinity;
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  }

  // items: [{value, data}] → [{data, x, y, w, h}]，填充矩形 (x,y,w,h)
  function squarifyLayout(items, x, y, w, h) {
    var out = [];
    var remaining = items.slice().sort(function (a, b) { return b.value - a.value; });
    var rx = x, ry = y, rw = w, rh = h;
    var total = 0;
    remaining.forEach(function (it) { total += it.value; });
    while (remaining.length > 0 && rw > 2 && rh > 2 && total > 0) {
      var vertical = rw >= rh;
      var side = vertical ? rh : rw;
      var scale = (rw * rh) / total;
      var row = [], rowSum = 0, prevWorst = Infinity;
      while (remaining.length > 0) {
        var next = remaining[0];
        var cand = rowSum + next.value;
        var wst = worstRatio(row.concat([next]), cand, side, scale);
        if (row.length > 0 && wst > prevWorst) break;
        row.push(next);
        rowSum = cand;
        prevWorst = wst;
        remaining.shift();
      }
      var strip = (rowSum * scale) / side;
      var offset = 0;
      row.forEach(function (it) {
        var len = (it.value * scale) / strip;
        if (vertical) out.push({ data: it.data, x: rx, y: ry + offset, w: strip, h: len });
        else out.push({ data: it.data, x: rx + offset, y: ry, w: len, h: strip });
        offset += len;
      });
      if (vertical) { rx += strip; rw -= strip; } else { ry += strip; rh -= strip; }
      total -= rowSum;
    }
    return out;
  }

  function renderHeatmap() {
    var wrap = byId('hm-wrap');
    if (!wrap) return;

    var filtered = STOCKS.filter(function (s) {
      if (currentSectorFilter !== 'all' && s.sector !== currentSectorFilter) return false;
      if (currentDirFilter === 'up' && s.chgPct <= 0) return false;
      if (currentDirFilter === 'down' && s.chgPct >= 0) return false;
      return true;
    });
    if (filtered.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;padding:30px;color:var(--fg-faint);font-size:10px;">暂无数据</div>';
      return;
    }

    if (showList) {
      renderHeatmapList(wrap, filtered);
      return;
    }

    var wrapW = wrap.clientWidth || 440;
    var wrapH = wrap.clientHeight || 380;
    if (wrapW < 100) wrapW = 440;
    if (wrapH < 100) wrapH = 380;

    var sectorNames = { tech: 'AI·科技', energy: '能源', finance: '金融' };
    var sectorOrder = ['tech', 'energy', 'finance'];
    var groups = [];
    sectorOrder.forEach(function (k) {
      var stocks = filtered.filter(function (s) { return s.sector === k; });
      if (stocks.length === 0) return;
      var cap = 0;
      stocks.forEach(function (s) { cap += showArea ? s.mktCap : 1; });
      groups.push({ key: k, stocks: stocks, value: cap });
    });

    var pad = 2, titleH = 15;
    var gRects = squarifyLayout(
      groups.map(function (g) { return { value: g.value, data: g }; }),
      pad, pad, wrapW - pad * 2, wrapH - pad * 2
    );

    var html = '';
    gRects.forEach(function (gr) {
      var g = gr.data;
      var sumPct = 0;
      g.stocks.forEach(function (s) { sumPct += s.chgPct; });
      var avgPct = g.stocks.length ? sumPct / g.stocks.length : 0;
      var gx = gr.x.toFixed(1), gy = gr.y.toFixed(1);
      var gw = Math.max(0, gr.w - 1), gh = Math.max(0, gr.h - 1);

      html += '<div class="hm-group" style="left:' + gx + 'px;top:' + gy + 'px;width:' + gw.toFixed(1) + 'px;height:' + gh.toFixed(1) + 'px;">';
      html += '<div class="hm-gtitle" title="' + (sectorNames[g.key] || g.key) + ' · ' + g.stocks.length + ' 只 · 均 ' + (avgPct >= 0 ? '+' : '') + avgPct.toFixed(2) + '%">' +
        (sectorNames[g.key] || g.key) + ' · ' + g.stocks.length + ' 只 · 均 ' + (avgPct >= 0 ? '+' : '') + avgPct.toFixed(2) + '%</div>';

      var ih = gh - titleH;
      if (ih > 4 && gw > 4) {
        var tiles = squarifyLayout(
          g.stocks.map(function (s) { return { value: showArea ? s.mktCap : 1, data: s }; }),
          1, titleH + 1, gw - 1, ih - 1
        );
        tiles.forEach(function (t) {
          var s = t.data;
          var tw = t.w - 1, th = t.h - 1;
          if (tw < 5 || th < 5) return;
          var bg = getTileColor(s.chgPct);
          var textColor = getTextColor(s.chgPct);
          var inner = '<span class="ht">' + s.ticker + '</span>';
          if (th > 26) inner += '<span class="hp">' + fmtPct(s.chgPct) + '</span>';
          if (th > 40) inner += '<span class="hl">' + fmtPrice(s.price) + '</span>';
          if (th > 54 && tw > 64) inner += '<span class="hn">' + s.name + '</span>';
          html += '<div class="hm-tile" tabindex="0" role="button" data-sym="' + s.ticker + '"' +
            ' aria-label="' + s.ticker + ' ' + s.name + ' 最新 ' + s.price + ' ' + fmtPct(s.chgPct) + '"' +
            ' title="' + s.ticker + ' ' + s.name + ' · 最新 ' + fmtPrice(s.price) + ' ' + fmtPct(s.chgPct) + ' · 点击查看来源"' +
            ' style="left:' + t.x.toFixed(1) + 'px;top:' + t.y.toFixed(1) + 'px;width:' + tw.toFixed(1) + 'px;height:' + th.toFixed(1) + 'px;background:' + bg + ';color:' + textColor + ';">' +
            inner + '</div>';
        });
      }
      html += '</div>';
    });

    wrap.innerHTML = html;

    var areaLabel = byId('area-label');
    if (areaLabel) {
      areaLabel.textContent = showArea ? '面积：总市值（美元） · 悬停查看报价 · 点击查看来源' : '面积：等权 · 颜色：日涨跌幅 · 点击查看来源';
    }
  }

  function getTileColor(pct) {
    var intensity = Math.min(Math.abs(pct) / 5, 1);
    if (pct > 0) {
      return 'rgb(' + Math.round(255 * intensity) + ',' + Math.round(77 * intensity) + ',' + Math.round(79 * intensity) + ')';
    } else if (pct < 0) {
      return 'rgb(0,' + Math.round(193 * intensity) + ',' + Math.round(118 * intensity) + ')';
    }
    return '#141414';
  }

  function getTextColor(pct) {
    if (pct > 3) return '#000';
    if (pct < -3) return '#000';
    if (pct > 0) return '#FFD9DA';
    if (pct < 0) return '#D7D7D7';
    return '#8A8A8A';
  }

  function renderHeatmapList(wrap, stocks) {
    var html = '<table class="hm-list"><thead><tr><th>代码</th><th>名称</th><th>最新价</th><th>涨跌幅</th><th>涨跌额</th><th>市值</th></tr></thead><tbody>';
    stocks.slice().sort(function (a, b) { return Math.abs(b.chgPct) - Math.abs(a.chgPct); }).forEach(function (s) {
      var cls = s.chgPct >= 0 ? 'up' : 'down';
      var chgAmt = s.price * s.chgPct / 100;
      html += '<tr data-sym="' + s.ticker + '" title="点击查看 Yahoo Finance 报价"><td>' + s.ticker + '</td><td>' + s.name + '</td><td>' + fmtPrice(s.price) + '</td>' +
        '<td class="' + cls + '">' + fmtPct(s.chgPct) + '</td><td class="' + cls + '">' + (chgAmt >= 0 ? '+' : '') + chgAmt.toFixed(2) + '</td>' +
        '<td>' + (s.mktCap ? s.mktCap + 'B' : '--') + '</td></tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  // ============================================================
  //  市 场 宽 度
  // ============================================================
  function renderBreadth() {
    var grid = byId('bd-grid');
    if (!grid) return;

    var filtered = STOCKS;
    if (currentSectorFilter !== 'all') {
      filtered = filtered.filter(function (s) { return s.sector === currentSectorFilter; });
    }
    if (currentDirFilter === 'up') filtered = filtered.filter(function (s) { return s.chgPct > 0; });
    else if (currentDirFilter === 'down') filtered = filtered.filter(function (s) { return s.chgPct < 0; });

    var adv = 0, dec = 0, flat = 0;
    var best = null, worst = null;
    var sectorVol = {};
    var changes = [];

    filtered.forEach(function (s) {
      if (s.chgPct > 0) adv++;
      else if (s.chgPct < 0) dec++;
      else flat++;
      changes.push(s.chgPct);
      if (best === null || s.chgPct > best.chgPct) best = s;
      if (worst === null || s.chgPct < worst.chgPct) worst = s;
      if (!sectorVol[s.sector]) sectorVol[s.sector] = 0;
      sectorVol[s.sector] += s.mktCap || 0;
    });

    var ratio = dec > 0 ? (adv / dec).toFixed(2) : 'N/A';

    changes.sort(function (a, b) { return a - b; });
    var median = 0;
    if (changes.length > 0) {
      var mid = Math.floor(changes.length / 2);
      median = changes.length % 2 === 0 ? (changes[mid - 1] + changes[mid]) / 2 : changes[mid];
    }

    var activeSector = '';
    var maxVol = 0;
    Object.keys(sectorVol).forEach(function (k) {
      if (sectorVol[k] > maxVol) { maxVol = sectorVol[k]; activeSector = k; }
    });
    var sectorNames = { tech: 'AI·科技', energy: '能源', finance: '金融' };
    activeSector = sectorNames[activeSector] || activeSector || '--';

    var cells = [
      { label: '上涨', value: adv, cls: adv > 0 ? 'up' : '', sub: '点击：筛选上涨', filter: 'up' },
      { label: '下跌', value: dec, cls: dec > 0 ? 'down' : '', sub: '点击：筛选下跌', filter: 'down' },
      { label: '平盘', value: flat, cls: '', sub: '点击：重置', filter: 'flat' },
      { label: '涨跌比', value: ratio, cls: '', sub: adv + '/' + dec, filter: null },
      { label: '领涨', value: best ? best.ticker + ' ' + fmtPct(best.chgPct) : '--', cls: 'up', sub: best ? best.name : '--', filter: null },
      { label: '领跌', value: worst ? worst.ticker + ' ' + fmtPct(worst.chgPct) : '--', cls: 'down', sub: worst ? worst.name : '--', filter: null },
      { label: '最活跃板块', value: activeSector, cls: '', sub: '按样本合计市值', filter: null },
      { label: '样本数', value: filtered.length + ' / ' + STOCKS.length, cls: '', sub: '跟踪标的 — 非全市场', filter: null },
      { label: '涨跌幅中位数', value: (median >= 0 ? '+' : '') + median.toFixed(2) + '%', cls: median >= 0 ? 'up' : 'down', sub: '偶数样本取中间两位均值', filter: null },
    ];

    var html = '';
    cells.forEach(function (c) {
      html += '<div class="bd-cell" tabindex="0" role="button" data-bd-filter="' + (c.filter || '') + '">' +
        '<div class="bl">' + c.label + '</div>' +
        '<div class="bv ' + c.cls + '">' + c.value + '</div>' +
        '<div class="bs">' + c.sub + '</div></div>';
    });
    grid.innerHTML = html;

    qsa('.bd-cell', grid).forEach(function (cell) {
      cell.addEventListener('click', function () {
        var f = cell.getAttribute('data-bd-filter');
        if (f === 'flat' || f === '') { currentDirFilter = null; }
        else if (f === 'up' || f === 'down') { currentDirFilter = currentDirFilter === f ? null : f; }
        renderHeatmap();
        renderBreadth();
      });
    });
  }

  // ============================================================
  //  新 闻 快 讯
  // ============================================================
  function renderNews() {
    var container = byId('news-list');
    if (!container) return;

    var items = NEWS;
    if (currentNewsFilter !== 'all') {
      items = items.filter(function (n) { return n.cat === currentNewsFilter; });
    }

    var html = '';
    items.forEach(function (n) {
      html += '<div class="nw-item unread" tabindex="0" data-link="' + (n.link || '') + '" title="' + (n.link ? '点击打开原文' : '') + '">' +
        '<span class="nw-c">' + n.tag + (n.time ? '<br><span style="color:var(--fg-faint);font-weight:400;">' + n.time + '</span>' : '') + '</span>' +
        '<span class="nw-h"><span class="nw-ht">' + n.title_cn + '</span><span class="nw-he">' + n.title_en + '</span></span>' +
        '</div>';
    });
    container.innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--fg-faint);font-size:10px;">该分类暂无新闻</div>';
  }

  // 新闻自动轮播
  function setNewsAuto(on) {
    newsAuto = on;
    var btn = byId('news-auto');
    if (btn) {
      btn.textContent = on ? '❚❚ 自动' : '▶ 自动';
      btn.classList.toggle('on', on);
    }
    if (newsAutoTimer) { clearInterval(newsAutoTimer); newsAutoTimer = null; }
    if (on) {
      newsAutoTimer = setInterval(function () {
        var container = byId('news-list');
        if (!container) return;
        var items = qsa('.nw-item', container).filter(function (el) { return el.style.display !== 'none'; });
        if (items.length === 0) return;
        items.forEach(function (el) { el.classList.remove('playing'); });
        newsAutoIdx = newsAutoIdx % items.length;
        var target = items[newsAutoIdx];
        target.classList.add('playing');
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        newsAutoIdx++;
      }, 5000);
    } else {
      qsa('.nw-item.playing').forEach(function (el) { el.classList.remove('playing'); });
    }
  }

  // ============================================================
  //  板 块 日 内 走 势 (Canvas)
  // ============================================================
  function renderSectorChart() {
    if (lastSectorCharts) {
      drawSectorFromYahoo(lastSectorCharts);
      return;
    }
    // Demo 渲染
    updateSectorStrip({ XLK: -1.98, XLE: -0.05, XLF: 0.25 });
    var canvas = byId('sector-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    var w = canvas.width, h = canvas.height;

    var points = 24;
    var data = { tech: [], energy: [], finance: [] };
    for (var i = 0; i < points; i++) {
      data.tech.push(Math.sin(i / 4) * 0.8 - 1.0 + (i / points) * -0.5);
      data.energy.push(Math.sin(i / 5 + 1) * 0.5 + 0.2 + (i / points) * 0.3);
      data.finance.push(Math.sin(i / 3.5 + 2) * 0.6 + 0.5 + (i / points) * 0.4);
    }

    var padL = 30, padR = 10, padT = 15, padB = 15;
    var chartW = w - padL - padR;
    var chartH = h - padT - padB;
    var minV = -2.5, maxV = 1.5;

    ctx.clearRect(0, 0, w, h);

    function drawLine(arr, color) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (var j = 0; j < arr.length; j++) {
        var x = padL + (j / (arr.length - 1)) * chartW;
        var y = padT + chartH - ((arr[j] - minV) / (maxV - minV)) * chartH;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    drawLine(data.tech, '#FF4D4F');
    drawLine(data.energy, '#00C176');
    drawLine(data.finance, '#F28C00');
    drawZeroLine(ctx, padL, padR, padT, chartH, w, minV, maxV);
  }

  function drawZeroLine(ctx, padL, padR, padT, chartH, w, minV, maxV) {
    ctx.beginPath();
    ctx.strokeStyle = '#3A3A3A';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    var zeroY = padT + chartH - ((0 - minV) / (maxV - minV)) * chartH;
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(w - padR, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSectorFromYahoo(sectorData) {
    var chgs = {};
    Object.keys(sectorData).forEach(function (sym) {
      var chart = sectorData[sym];
      if (chart && chart.meta && chart.meta.regularMarketPrice && chart.meta.previousClose) {
        chgs[sym] = ((chart.meta.regularMarketPrice - chart.meta.previousClose) / chart.meta.previousClose * 100);
      }
    });
    updateSectorStrip(chgs);

    var canvas = byId('sector-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    var w = canvas.width, h = canvas.height;

    var colors = { XLK: '#FF4D4F', XLE: '#00C176', XLF: '#F28C00' };
    var minV = 0, maxV = 0;

    Object.keys(sectorData).forEach(function (sym) {
      var chart = sectorData[sym];
      var quotes = chart.indicators && chart.indicators.quote && chart.indicators.quote[0];
      var ts = chart.timestamp;
      var prevClose = chart.meta && chart.meta.previousClose;
      if (!quotes || !ts || !prevClose) return;
      for (var i = 0; i < ts.length; i++) {
        if (quotes.close && quotes.close[i] !== null) {
          var pct = (quotes.close[i] - prevClose) / prevClose * 100;
          if (pct < minV) minV = pct;
          if (pct > maxV) maxV = pct;
        }
      }
    });
    if (minV === maxV) { minV = -2; maxV = 2; }

    var padL = 30, padR = 10, padT = 15, padB = 15;
    var chartW = w - padL - padR;
    var chartH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    Object.keys(sectorData).forEach(function (sym) {
      var chart = sectorData[sym];
      var quotes = chart.indicators && chart.indicators.quote && chart.indicators.quote[0];
      var ts = chart.timestamp;
      var prevClose = chart.meta && chart.meta.previousClose;
      if (!quotes || !ts || !prevClose) return;
      ctx.beginPath();
      ctx.strokeStyle = colors[sym] || '#888';
      ctx.lineWidth = 1.5;
      var drawn = false;
      for (var i = 0; i < ts.length; i++) {
        if (quotes.close && quotes.close[i] !== null) {
          var pct = (quotes.close[i] - prevClose) / prevClose * 100;
          var x = padL + (i / (ts.length - 1)) * chartW;
          var y = padT + chartH - ((pct - minV) / (maxV - minV)) * chartH;
          if (!drawn) { ctx.moveTo(x, y); drawn = true; }
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });
    drawZeroLine(ctx, padL, padR, padT, chartH, w, minV, maxV);
  }

  // ============================================================
  //  AAPL 近 60 个交易日 (Canvas)
  // ============================================================
  function renderAAPLChart() {
    if (lastAAPLChart) {
      drawAAPLFromYahoo(lastAAPLChart);
      return;
    }
    // Demo 渲染
    var strip = byId('aapl-strip');
    if (strip) {
      var data = [
        { label: '最新', value: '336.91', cls: '' },
        { label: '涨跌', value: '+3.89', cls: 'up' },
        { label: '涨跌幅', value: '+1.17%', cls: 'up' },
        { label: '开盘', value: '334.54', cls: '' },
        { label: '前收', value: '333.02', cls: '' },
        { label: '最高', value: '339.57', cls: 'up' },
        { label: '最低', value: '334.02', cls: 'down' },
        { label: '成交量', value: '4955.6万', cls: '' },
        { label: '52周区间', value: '201.50–339.57', cls: '' },
      ];
      var html = '';
      data.forEach(function (d) {
        html += '<div class="stat"><div class="sl">' + d.label + '</div><div class="sv ' + d.cls + '">' + d.value + '</div></div>';
      });
      strip.innerHTML = html;
    }

    var canvas = byId('aapl-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    var w = canvas.width, h = canvas.height;

    var days = 60;
    var prices = [];
    var p = 310;
    for (var i = 0; i < days; i++) {
      p += (Math.random() - 0.48) * 4;
      p = Math.max(300, p);
      prices.push(p);
    }
    drawPriceLine(ctx, w, h, prices, null);
  }

  function drawPriceLine(ctx, w, h, prices, volumes) {
    var padL = 25, padR = 10, padT = 10, padB = 20;
    var chartW = w - padL - padR;
    var chartH = h - padT - padB;
    var minP = Math.min.apply(null, prices) * 0.995;
    var maxP = Math.max.apply(null, prices) * 1.005;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = '#F28C00';
    ctx.lineWidth = 1.5;
    for (var i = 0; i < prices.length; i++) {
      var x = padL + (i / (prices.length - 1)) * chartW;
      var y = padT + chartH - ((prices[i] - minP) / (maxP - minP)) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (volumes) {
      var maxVol = Math.max.apply(null, volumes);
      if (maxVol > 0) {
        for (var j = 0; j < prices.length; j++) {
          var x2 = padL + (j / (prices.length - 1)) * chartW;
          var bw = Math.max(1, chartW / prices.length * 0.6);
          var volH = (volumes[j] / maxVol) * chartH * 0.3;
          ctx.fillStyle = prices[j] >= (j > 0 ? prices[j - 1] : prices[j]) ? 'rgba(255,77,79,0.3)' : 'rgba(0,193,118,0.3)';
          ctx.fillRect(x2 - bw / 2, padT + chartH - volH, bw, volH);
        }
      }
    }
  }

  function drawAAPLFromYahoo(chart) {
    var quotes = chart.indicators && chart.indicators.quote && chart.indicators.quote[0];
    var ts = chart.timestamp;
    if (!quotes || !ts) return;

    var prices = [];
    var volumes = [];
    var dates = [];
    for (var i = 0; i < ts.length; i++) {
      if (quotes.close && quotes.close[i] !== null) {
        prices.push(quotes.close[i]);
        volumes.push(quotes.volume ? quotes.volume[i] : 0);
        dates.push(new Date(ts[i] * 1000));
      }
    }
    prices = prices.slice(-60);
    volumes = volumes.slice(-60);
    dates = dates.slice(-60);
    if (prices.length < 10) return;

    var strip = byId('aapl-strip');
    if (strip) {
      var lastPrice = prices[prices.length - 1];
      var prevClose = prices[prices.length - 2] || lastPrice;
      var chg = lastPrice - prevClose;
      var chgPct = (chg / prevClose * 100);
      var high = Math.max.apply(null, prices);
      var low = Math.min.apply(null, prices);
      var vol = volumes[volumes.length - 1] || 0;
      var meta = chart.meta || {};

      var data = [
        { label: '最新', value: lastPrice.toFixed(2), cls: '' },
        { label: '涨跌', value: (chg >= 0 ? '+' : '') + chg.toFixed(2), cls: chg >= 0 ? 'up' : 'down' },
        { label: '涨跌幅', value: (chgPct >= 0 ? '+' : '') + chgPct.toFixed(2) + '%', cls: chg >= 0 ? 'up' : 'down' },
        { label: '前收', value: prevClose.toFixed(2), cls: '' },
        { label: '最高', value: high.toFixed(2), cls: 'up' },
        { label: '最低', value: low.toFixed(2), cls: 'down' },
        { label: '成交量', value: vol > 1e8 ? (vol / 1e8).toFixed(2) + ' 亿股' : (vol / 1e4).toFixed(0) + ' 万股', cls: '' },
        { label: '52周区间', value: meta.fiftyTwoWeekLow ? fmtPrice(meta.fiftyTwoWeekLow) + '–' + fmtPrice(meta.fiftyTwoWeekHigh) : '--', cls: '' },
      ];
      var html = '';
      data.forEach(function (d) {
        html += '<div class="stat"><div class="sl">' + d.label + '</div><div class="sv ' + d.cls + '">' + d.value + '</div></div>';
      });
      strip.innerHTML = html;
    }

    var canvas = byId('aapl-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    drawPriceLine(ctx, canvas.width, canvas.height, prices, volumes);
  }

  // ============================================================
  //  贵 金 属
  // ============================================================
  function renderMetals() {
    var container = byId('metal-items');
    if (!container) return;

    var asof = lastRefresh ? 'as-of ' + fmtDateTime(lastRefresh) : 'as-of --';
    var html = '';
    METALS.forEach(function (m) {
      var cls = m.chgPct >= 0 ? 'up' : 'down';
      html += '<div class="metal-item" tabindex="0">' +
        '<div><span class="mi-sym">' + m.sym + '</span> <span class="mi-sub">' + m.name + ' ' + m.futures + ' · USD/t oz</span></div>' +
        '<div class="mi-price">' + fmtPrice(m.price) + '</div>' +
        '<div class="mi-chg ' + cls + '">' + (m.chg >= 0 ? '▲' : '▼') + ' ' + m.chg.toFixed(2) + '（' + (m.chgPct >= 0 ? '+' : '') + m.chgPct.toFixed(2) + '%）</div>' +
        '<div class="mi-range">60 日 ' + m.range60 + ' · ' + asof + '</div>' +
        '</div>';
    });
    container.innerHTML = html;

    var note = byId('metal-note');
    if (note) {
      var gold = METALS[0], silver = METALS[1], plat = METALS[2];
      var ratio = (gold.price / silver.price).toFixed(2);
      var spread = (gold.price - plat.price).toFixed(2);
      note.innerHTML = '金银比 ' + ratio + 'x · 倍 金铂价差 ' + fmtPrice(parseFloat(spread)) + ' · USD/t oz';
    }
    renderMetalChart();
  }

  function renderMetalChart() {
    var canvas = byId('metal-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    if (lastGoldChart) {
      var quotes = lastGoldChart.indicators && lastGoldChart.indicators.quote && lastGoldChart.indicators.quote[0];
      var ts = lastGoldChart.timestamp;
      if (quotes && ts) {
        var prices = [];
        for (var i = 0; i < ts.length; i++) {
          if (quotes.close && quotes.close[i] !== null) prices.push(quotes.close[i]);
        }
        prices = prices.slice(-60);
        if (prices.length >= 10) {
          drawPriceLine(ctx, canvas.width, canvas.height, prices, null);
          return;
        }
      }
    }
    // Demo
    var days = 60;
    var goldData = [];
    var g = 3980;
    for (var d = 0; d < days; d++) {
      g += (Math.random() - 0.48) * 18;
      goldData.push(g);
    }
    drawPriceLine(ctx, canvas.width, canvas.height, goldData, null);
  }

  // ============================================================
  //  自 选 基 金 (天天基金 + 腾讯行情, script 标签加载天然免 CORS)
  // ============================================================
  var FUNDS = [
    { code: '017811', name: '东方人工智能主题混合C', short: '东方AI主题C', qdii: false },
    { code: '016370', name: '信澳业绩驱动混合A', short: '信澳业绩驱动A', qdii: false },
    { code: '019172', name: '摩根纳斯达克100指数(QDII)A', short: '摩根纳指100A', qdii: true },
    { code: '017641', name: '摩根标普500指数(QDII)A', short: '摩根标普500A', qdii: true },
  ];
  var lastFundFetch = null;

  function loadScriptTag(url, charset, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var timer = setTimeout(function () {
        s.remove();
        reject(new Error('timeout'));
      }, timeoutMs || 10000);
      s.onload = function () { clearTimeout(timer); s.remove(); resolve(); };
      s.onerror = function () { clearTimeout(timer); s.remove(); reject(new Error('load error')); };
      if (charset) s.charset = charset;
      s.src = url;
      document.head.appendChild(s);
    });
  }

  // 历史净值 + 阶段收益 (天天基金 pingzhongdata，串行加载避免全局变量互相覆盖)
  async function fetchFundHistories() {
    for (var i = 0; i < FUNDS.length; i++) {
      var f = FUNDS[i];
      try {
        await loadScriptTag('https://fund.eastmoney.com/pingzhongdata/' + f.code + '.js?v=' + Date.now(), 'utf-8', 10000);
        var w = window;
        var trend = w.Data_netWorthTrend || [];
        f.trend = trend.slice(-90).map(function (p) { return { t: p.x, nav: p.y }; });
        if (w.fS_name) f.nameOfficial = w.fS_name;
        f.syl = { m1: w.syl_1y, m3: w.syl_3y, m6: w.syl_6y, y1: w.syl_1n };
        ['Data_netWorthTrend', 'Data_ACWorthTrend', 'Data_grandTotal', 'Data_rateInSimilarType',
         'Data_rateInSimilarPersent', 'Data_fluctuationScale', 'Data_holderStructure', 'Data_assetAllocation',
         'Data_performanceEvaluation', 'Data_currentFundManager', 'Data_buySedemption', 'Data_fundSharesPositions',
         'fS_name', 'fS_code', 'syl_1y', 'syl_3y', 'syl_6y', 'syl_1n', 'fund_sourceRate', 'fund_Rate',
         'fund_minsg', 'stockCodes', 'ishb', 'zqCodes', 'stockCodesNew', 'zqCodesNew', 'Data_currentFundManagerInfo'].forEach(function (k) {
          try { delete w[k]; } catch (e) { w[k] = undefined; }
        });
      } catch (e) {
        console.warn('[fund] 历史净值 ' + f.code + ': ' + e.message);
      }
    }
    renderFunds();
  }

  // 最新净值 + 日涨跌 (腾讯行情批量，一次请求)
  async function fetchFundQuotes() {
    try {
      var codes = FUNDS.map(function (f) { return 'jj' + f.code; }).join(',');
      await loadScriptTag('https://qt.gtimg.cn/q=' + codes + '&r=' + Date.now(), 'GBK', 8000);
      FUNDS.forEach(function (f) {
        var raw = window['v_jj' + f.code];
        if (!raw) return;
        var p = raw.split('~');
        // 字段: code~名称~估值~估算涨跌~~最新净值~累计净值~日涨跌%~净值日期~
        var est = parseFloat(p[2]);
        f.est = est > 0 ? est : null;
        var estPct = parseFloat(p[3]);
        f.estPct = est > 0 && !isNaN(estPct) ? estPct : null;
        f.nav = parseFloat(p[5]) || null;
        f.accNav = parseFloat(p[6]) || null;
        f.dayPct = parseFloat(p[7]);
        f.navDate = p[8] || '';
        try { delete window['v_jj' + f.code]; } catch (e) {}
      });
      lastFundFetch = new Date();
    } catch (e) {
      console.warn('[fund] 行情: ' + e.message);
    }
    renderFunds();
  }

  function renderFunds() {
    var list = byId('fund-list');
    if (!list) return;

    // 汇总条
    var strip = byId('fund-strip');
    var valid = FUNDS.filter(function (f) { return typeof f.dayPct === 'number' && !isNaN(f.dayPct); });
    if (strip) {
      var html = '';
      if (valid.length > 0) {
        var avg = 0, best = valid[0], worst = valid[0];
        valid.forEach(function (f) {
          avg += f.dayPct;
          if (f.dayPct > best.dayPct) best = f;
          if (f.dayPct < worst.dayPct) worst = f;
        });
        avg /= valid.length;
        var stats = [
          { label: '日涨跌均值 (' + valid.length + '只)', value: fmtPct(avg), cls: avg >= 0 ? 'up' : 'down' },
          { label: '最佳', value: best.short + ' ' + fmtPct(best.dayPct), cls: best.dayPct >= 0 ? 'up' : 'down' },
          { label: '最差', value: worst.short + ' ' + fmtPct(worst.dayPct), cls: worst.dayPct >= 0 ? 'up' : 'down' },
          { label: '更新', value: lastFundFetch ? fmtTime(lastFundFetch) : '--', cls: '' },
        ];
        stats.forEach(function (d) {
          html += '<div class="stat"><div class="sl">' + d.label + '</div><div class="sv ' + d.cls + '">' + d.value + '</div></div>';
        });
      } else {
        html = '<div class="stat"><div class="sl">状态</div><div class="sv">加载中…</div></div>';
      }
      strip.innerHTML = html;
    }

    // 基金卡片
    var html2 = '';
    FUNDS.forEach(function (f) {
      var pctCls = (f.dayPct || 0) >= 0 ? 'up' : 'down';
      var tags = '';
      if (f.syl) {
        [['近1月', f.syl.m1], ['近3月', f.syl.m3], ['近6月', f.syl.m6], ['近1年', f.syl.y1]].forEach(function (pair) {
          var v = parseFloat(pair[1]);
          if (isNaN(v)) return;
          tags += '<span class="' + (v >= 0 ? 'up' : 'down') + '">' + pair[0] + ' ' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</span>';
        });
      }
      html2 += '<div class="fd-item" data-code="' + f.code + '" tabindex="0" role="button" title="' + f.name + ' · 点击查看天天基金详情">' +
        '<div class="fd-top"><span class="fd-name">' + f.short + '</span><span class="fd-code">' + f.code + (f.qdii ? ' · QDII' : '') + '</span>' +
        '<span class="fd-pct ' + pctCls + '">' + (typeof f.dayPct === 'number' && !isNaN(f.dayPct) ? fmtPct(f.dayPct) : '--') + '</span></div>' +
        '<div class="fd-mid"><div class="fd-nums">' +
        '<div class="fd-nav">' + (f.nav ? f.nav.toFixed(4) : '--') + '</div>' +
        '<div class="fd-date">净值 ' + (f.navDate || '--') + '</div></div>' +
        '<canvas class="fd-spark" id="spark-' + f.code + '"></canvas></div>' +
        (tags ? '<div class="fd-tags">' + tags + '</div>' : '') +
        '</div>';
    });
    list.innerHTML = html2;
    FUNDS.forEach(drawFundSpark);

    var asof = byId('fund-asof');
    if (asof) {
      asof.textContent = lastFundFetch ? '净值见各行 · ' + fmtTime(lastFundFetch) + ' 更新' : '加载中…';
    }
  }

  function drawFundSpark(f) {
    var cv = byId('spark-' + f.code);
    if (!cv || !f.trend || f.trend.length < 5) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var W = cv.clientWidth || 110, H = cv.clientHeight || 34;
    cv.width = W * 2;
    cv.height = H * 2;
    var navs = f.trend.map(function (p) { return p.nav; });
    var min = Math.min.apply(null, navs);
    var max = Math.max.apply(null, navs);
    var range = max - min || 1;
    var up = navs[navs.length - 1] >= navs[0];
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.beginPath();
    ctx.strokeStyle = up ? '#FF4D4F' : '#00C176';
    ctx.lineWidth = 2;
    for (var i = 0; i < navs.length; i++) {
      var x = (i / (navs.length - 1)) * (cv.width - 4) + 2;
      var y = cv.height - 4 - ((navs[i] - min) / range) * (cv.height - 8);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ============================================================
  //  全 球 时 钟
  // ============================================================
  var clockInterval = null;
  function renderClock() {
    var display = byId('clock-display');
    var dateEl = byId('clock-date');
    var tbody = byId('clock-tbody');
    if (!display || !tbody) return;

    var tzSelect = byId('clock-tz-select');
    var tz = tzSelect ? tzSelect.value : 'local';

    function tick() {
      var now = new Date();
      var opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
      var dateOpts = { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' };

      if (tz === 'local') {
        display.textContent = now.toLocaleString('zh-CN', opts);
        dateEl.textContent = now.toLocaleDateString('zh-CN', dateOpts) + ' · 本地（UTC+' + (-now.getTimezoneOffset() / 60) + ':00）';
      } else {
        display.textContent = now.toLocaleString('zh-CN', Object.assign({ timeZone: tz }, opts));
        dateEl.textContent = now.toLocaleDateString('zh-CN', Object.assign({ timeZone: tz }, dateOpts)) + ' · ' + tz;
      }

      var markets = [
        { name: 'SSE', label: '上证', tz: 'Asia/Shanghai', session: '09:30–11:30 13:00–15:00', sessions: [[9*60+30, 11*60+30], [13*60, 15*60]] },
        { name: 'HKEX', label: '港交所', tz: 'Asia/Hong_Kong', session: '09:30–12:00 13:00–16:00', sessions: [[9*60+30, 12*60], [13*60, 16*60]] },
        { name: 'TSE', label: '日交所', tz: 'Asia/Tokyo', session: '09:00–11:30 12:30–15:30', sessions: [[9*60, 11*60+30], [12*60+30, 15*60+30]] },
        { name: 'LSE', label: '伦交所', tz: 'Europe/London', session: '08:00–16:30', sessions: [[8*60, 16*60+30]] },
        { name: 'NYSE', label: '纽交所', tz: 'America/New_York', session: '09:30–16:00', sessions: [[9*60+30, 16*60]] },
      ];

      function isOpenNow(mk, h, m) {
        var cur = h * 60 + m;
        for (var i = 0; i < mk.sessions.length; i++) {
          if (cur >= mk.sessions[i][0] && cur < mk.sessions[i][1]) return true;
        }
        return false;
      }

      function nextSwitch(mk, h, m) {
        var cur = h * 60 + m;
        if (isOpenNow(mk, h, m)) {
          for (var i = 0; i < mk.sessions.length; i++) {
            if (cur >= mk.sessions[i][0] && cur < mk.sessions[i][1]) {
              var diff = mk.sessions[i][1] - cur;
              if (i < mk.sessions.length - 1) return '→午休 ' + fmtDur(diff);
              return '→收盘 ' + fmtDur(diff);
            }
          }
          return '--';
        }
        var nextOpen = -1;
        for (var j = 0; j < mk.sessions.length; j++) {
          if (cur < mk.sessions[j][0]) { nextOpen = mk.sessions[j][0]; break; }
        }
        if (nextOpen < 0) nextOpen = mk.sessions[0][0] + 24 * 60;
        var diff2 = nextOpen - cur;
        if (mk.name === 'NYSE' && cur < 9 * 60 + 30 && cur >= 4 * 60) return '→开盘 ' + fmtDur(diff2);
        if (mk.name === 'NYSE') return '→盘前 ' + fmtDur(Math.max(diff2 - (5 * 60 + 30), 0) || diff2);
        return '→交易中 ' + fmtDur(diff2);
      }

      function fmtDur(min) {
        if (min <= 0) return '--';
        if (min < 60) return min + ' 分';
        return Math.floor(min / 60) + ' 小时 ' + (min % 60) + ' 分';
      }

      var html = '';
      markets.forEach(function (m) {
        var localTime = now.toLocaleString('zh-CN', { timeZone: m.tz, hour: '2-digit', minute: '2-digit', hour12: false });
        var parts = localTime.split(':');
        var h = parseInt(parts[0]), min = parseInt(parts[1]);
        // 判断当地是否周末
        var localDay = new Date(now.toLocaleString('en-US', { timeZone: m.tz })).getDay();
        var isWeekend = (localDay === 0 || localDay === 6);
        var open = !isWeekend && isOpenNow(m, h, min);
        // 午休判断: 在两个 session 之间
        var cur = h * 60 + min;
        var lunch = !isWeekend && !open && m.sessions.length > 1 && cur >= m.sessions[0][1] && cur < m.sessions[1][0];
        var status = open ? '交易中' : lunch ? '午休' : isWeekend ? '已收盘（周末）' : '已收盘';
        var statusCls = open ? 'status-open' : 'status-closed';
        html += '<tr><td>' + m.label + '</td><td class="' + statusCls + '">' + status + '</td><td>' + localTime + '</td><td>' + m.session + '</td><td>' + (isWeekend ? '周一开盘' : nextSwitch(m, h, min)) + '</td></tr>';
      });
      tbody.innerHTML = html;
    }

    if (clockInterval) clearInterval(clockInterval);
    tick();
    clockInterval = setInterval(tick, 1000);
  }

  // ============================================================
  //  全 球 指 数 一 览
  // ============================================================
  // 全球指数开闭市状态: 由 IANA 时区实时计算 (与 07 号组件同一套逻辑)
  var INDEX_MARKETS = {
    '标普500':        { tz: 'America/New_York', sessions: [[570, 960]] },
    '纳斯达克综合':   { tz: 'America/New_York', sessions: [[570, 960]] },
    '道琼斯工业':     { tz: 'America/New_York', sessions: [[570, 960]] },
    '标普/TSX综合':   { tz: 'America/Toronto',  sessions: [[570, 960]] },
    '圣保罗IBOVESPA': { tz: 'America/Sao_Paulo', sessions: [[600, 1020]] },
    '欧洲斯托克50':   { tz: 'Europe/Paris',     sessions: [[540, 1050]] },
    '富时100':        { tz: 'Europe/London',    sessions: [[480, 990]] },
    '德国DAX':        { tz: 'Europe/Berlin',    sessions: [[540, 1050]] },
    '法国CAC40':      { tz: 'Europe/Paris',     sessions: [[540, 1050]] },
    '富时MIB':        { tz: 'Europe/Rome',      sessions: [[540, 1050]] },
    '日经225':        { tz: 'Asia/Tokyo',       sessions: [[540, 690], [750, 930]] },
    '恒生指数':       { tz: 'Asia/Hong_Kong',   sessions: [[570, 720], [780, 960]] },
    '上证综合':       { tz: 'Asia/Shanghai',    sessions: [[570, 690], [780, 900]] },
    '韩国KOSPI':      { tz: 'Asia/Seoul',       sessions: [[540, 930]] },
    '澳洲ASX200':     { tz: 'Australia/Sydney', sessions: [[600, 960]] },
    '印度NIFTY50':    { tz: 'Asia/Kolkata',     sessions: [[555, 930]] },
  };

  function computeIndexStatus(name) {
    var mk = INDEX_MARKETS[name];
    if (!mk) return '已收盘';
    var now = new Date();
    var localDay = new Date(now.toLocaleString('en-US', { timeZone: mk.tz })).getDay();
    if (localDay === 0 || localDay === 6) return '已收盘';
    var lt = now.toLocaleString('zh-CN', { timeZone: mk.tz, hour: '2-digit', minute: '2-digit', hour12: false });
    var parts = lt.split(':');
    var cur = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    for (var i = 0; i < mk.sessions.length; i++) {
      if (cur >= mk.sessions[i][0] && cur < mk.sessions[i][1]) return '交易中';
    }
    if (mk.sessions.length > 1 && cur >= mk.sessions[0][1] && cur < mk.sessions[1][0]) return '午休';
    return '已收盘';
  }

  function renderGlobalIndices() {
    var container = byId('indices-list');
    if (!container) return;

    var html = '';
    var regionOrder = ['美洲', '欧洲', '亚太'];
    regionOrder.forEach(function (region) {
      var indices = GLOBAL_INDICES[region];
      if (!indices || indices.length === 0) return;
      html += '<div class="idx-region-label">▸ ' + region + '</div>';
      html += '<table class="idx-table"><tbody>';
      indices.forEach(function (idx) {
        var cls = idx.chgPct >= 0 ? 'up' : 'down';
        var status = computeIndexStatus(idx.name); // 实时计算，与 07 组件一致
        var open = status === '交易中' || status === '午休';
        html += '<tr><td>' + idx.name + ' <span style="color:var(--fg-faint);font-size:9px;">' + idx.exchange + '</span></td>' +
          '<td class="idx-price">' + fmtPrice(idx.price) + '</td>' +
          '<td class="idx-chg"><span class="' + cls + '">' + (idx.chgPct >= 0 ? '+' : '') + idx.chgPct.toFixed(2) + '%</span></td>' +
          '<td class="idx-status ' + (open ? 'up' : 'down') + '">' + status + '</td></tr>';
      });
      html += '</tbody></table>';
    });
    container.innerHTML = html;
  }

  function renderAll() {
    renderTape();
    renderHeatmap();
    renderBreadth();
    renderNews();
    renderSectorChart();
    renderAAPLChart();
    renderMetals();
    renderGlobalIndices();
  }

  // ============================================================
  //  布 局 管 理 器
  // ============================================================
  var LAYOUT_KEY = 'gmt-layout-v2';
  var defaultLayout = {};

  function captureDefaultLayout() {
    qsa('.widget').forEach(function (w) {
      defaultLayout[w.id] = {
        left: w.style.left, top: w.style.top,
        width: w.style.width, height: w.style.height,
        right: w.style.right
      };
    });
  }

  function saveLayout() {
    var s = {};
    qsa('.widget').forEach(function (w) {
      s[w.id] = {
        left: w.style.left, top: w.style.top,
        width: w.style.width, height: w.style.height,
        right: w.style.right,
        hidden: w.style.display === 'none',
        locked: w.classList.contains('locked'),
        min: w.classList.contains('min')
      };
    });
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function loadLayout() {
    var s;
    try { s = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); } catch (e) { s = null; }
    if (!s) return;
    qsa('.widget').forEach(function (w) {
      var c = s[w.id];
      if (!c) return;
      if (c.left) w.style.left = c.left;
      if (c.top) w.style.top = c.top;
      if (c.width) w.style.width = c.width;
      if (c.height) w.style.height = c.height;
      w.style.right = c.right || '';
      w.style.display = c.hidden ? 'none' : '';
      w.classList.toggle('locked', !!c.locked);
      w.classList.toggle('min', !!c.min);
      syncWidgetButtons(w);
    });
    reflowGrid();
  }

  function reflowGrid() {
    var grid = byId('grid');
    if (!grid) return;
    var max = 0;
    qsa('.widget').forEach(function (w) {
      if (w.style.display === 'none') return;
      var top = parseInt(w.style.top) || 0;
      var h = w.classList.contains('min') ? 24 : (parseInt(w.style.height) || 0);
      if (top + h > max) max = top + h;
    });
    grid.style.height = (max + 12) + 'px';
  }

  function syncWidgetButtons(w) {
    var lockBtn = qs('.w-btn[data-act="lock"]', w);
    if (lockBtn) {
      var locked = w.classList.contains('locked');
      lockBtn.textContent = locked ? '🔒' : '🔓';
      lockBtn.title = locked ? '解锁位置' : '锁定位置';
      lockBtn.classList.toggle('active', locked);
    }
    var minBtn = qs('.w-btn[data-act="min"]', w);
    if (minBtn) {
      var minned = w.classList.contains('min');
      minBtn.textContent = minned ? '▢' : '—';
      minBtn.title = minned ? '恢复' : '最小化';
    }
    var zoomBtn = qs('.w-btn[data-act="zoom"]', w);
    if (zoomBtn) {
      zoomBtn.textContent = w.classList.contains('zoomed') ? '⤡' : '⤢';
      zoomBtn.title = w.classList.contains('zoomed') ? '还原' : '放大';
    }
  }

  // ▲▼ 与相邻组件交换位置
  function swapWidget(w, dir) {
    var widgets = qsa('.widget').filter(function (x) { return x.style.display !== 'none'; });
    var i = widgets.indexOf(w);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= widgets.length) return;
    var other = widgets[j];
    var g = { left: w.style.left, top: w.style.top, width: w.style.width, height: w.style.height, right: w.style.right };
    w.style.left = other.style.left; w.style.top = other.style.top;
    w.style.width = other.style.width; w.style.height = other.style.height;
    w.style.right = other.style.right;
    other.style.left = g.left; other.style.top = g.top;
    other.style.width = g.width; other.style.height = g.height;
    other.style.right = g.right;
    saveLayout();
    reflowGrid();
    redrawCharts();
  }

  function toggleZoom(w) {
    var grid = byId('grid');
    if (w.classList.contains('zoomed')) {
      var p = w._prevGeom;
      if (p) {
        w.style.left = p.left; w.style.top = p.top;
        w.style.width = p.width; w.style.height = p.height;
      }
      w.classList.remove('zoomed');
    } else {
      // 退出其他已放大的组件
      qsa('.widget.zoomed').forEach(function (x) { if (x !== w) toggleZoom(x); });
      w._prevGeom = { left: w.style.left, top: w.style.top, width: w.style.width, height: w.style.height };
      var gw = grid ? grid.clientWidth : 880;
      w.style.left = '8px';
      w.style.top = '8px';
      w.style.width = (gw - 16) + 'px';
      w.style.height = Math.max(420, window.innerHeight - 170) + 'px';
      w.classList.add('zoomed');
      w.classList.remove('min');
    }
    syncWidgetButtons(w);
    saveLayout();
    reflowGrid();
    redrawCharts();
  }

  function updateAddMenu() {
    var menu = byId('add-menu');
    if (!menu) return;
    var hidden = qsa('.widget').filter(function (w) { return w.style.display === 'none'; });
    var html = '<div class="am-title">添加组件</div>';
    if (hidden.length === 0) {
      html += '<div class="am-empty">全部组件均已显示</div>';
    } else {
      hidden.forEach(function (w) {
        var num = (qs('.w-num', w) || {}).textContent || '';
        var title = (qs('.w-title', w) || {}).textContent || w.id;
        html += '<button class="am-item" data-widget="' + w.id + '">' + num + ' ' + title + '</button>';
      });
    }
    menu.innerHTML = html;
  }

  // 编辑模式：拖拽 + 调整大小
  function bindDragResize() {
    var grid = byId('grid');
    if (!grid) return;

    grid.addEventListener('mousedown', function (e) {
      if (!editing) return;
      var w = e.target.closest('.widget');
      if (!w || w.classList.contains('locked') || w.classList.contains('zoomed')) return;

      // 调整大小
      if (e.target.classList.contains('w-resize')) {
        e.preventDefault();
        var startX = e.clientX, startY = e.clientY;
        var startW = w.offsetWidth, startH = w.offsetHeight;
        function onMove(ev) {
          w.style.width = Math.max(220, startW + ev.clientX - startX) + 'px';
          w.style.height = Math.max(110, startH + ev.clientY - startY) + 'px';
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          saveLayout();
          reflowGrid();
          redrawCharts();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return;
      }

      // 拖拽移动 (点在 .w-drag 覆盖层上)
      if (e.target.classList.contains('w-drag')) {
        e.preventDefault();
        var rect = w.getBoundingClientRect();
        var offX = e.clientX - rect.left;
        var offY = e.clientY - rect.top;
        var gridRect = grid.getBoundingClientRect();
        function onMove2(ev) {
          var nx = ev.clientX - gridRect.left - offX;
          var ny = ev.clientY - gridRect.top - offY;
          nx = Math.max(0, Math.min(nx, grid.clientWidth - w.offsetWidth));
          ny = Math.max(0, ny);
          w.style.left = Math.round(nx) + 'px';
          w.style.top = Math.round(ny) + 'px';
        }
        function onUp2() {
          document.removeEventListener('mousemove', onMove2);
          document.removeEventListener('mouseup', onUp2);
          saveLayout();
          reflowGrid();
        }
        document.addEventListener('mousemove', onMove2);
        document.addEventListener('mouseup', onUp2);
      }
    });
  }

  var redrawTimer = null;
  function redrawCharts() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(function () {
      renderHeatmap();
      renderSectorChart();
      renderAAPLChart();
      renderMetalChart();
    }, 120);
  }

  // 预设布局 (width = -1 表示右对齐自适应: 右列组件)
  var PRESETS = {
    global: {
      show: ['w-heatmap', 'w-breadth', 'w-news', 'w-sector', 'w-aapl', 'w-metal', 'w-clock', 'w-indices', 'w-funds'],
      geo: {
        'w-heatmap': [8, 8, 568, 544], 'w-breadth': [584, 8, 280, 176], 'w-news': [584, 192, 280, 360],
        'w-sector': [8, 560, 568, 200], 'w-aapl': [584, 560, 280, 240],
        'w-metal': [8, 768, 568, 340], 'w-clock': [584, 808, 280, 340], 'w-indices': [8, 1116, 856, 360],
        'w-funds': [888, 8, -1, 736]
      }
    },
    stock: {
      show: ['w-heatmap', 'w-breadth', 'w-news', 'w-sector', 'w-aapl', 'w-funds'],
      geo: {
        'w-heatmap': [8, 8, 568, 544], 'w-breadth': [584, 8, 280, 176], 'w-news': [584, 192, 280, 360],
        'w-sector': [8, 560, 568, 200], 'w-aapl': [584, 560, 280, 240],
        'w-funds': [888, 8, -1, 736]
      }
    },
    metal: {
      show: ['w-heatmap', 'w-breadth', 'w-metal', 'w-clock', 'w-funds'],
      geo: {
        'w-heatmap': [8, 8, 568, 368], 'w-breadth': [584, 8, 280, 176],
        'w-metal': [8, 384, 568, 360], 'w-clock': [584, 192, 280, 552],
        'w-funds': [888, 8, -1, 552]
      }
    },
    news: {
      show: ['w-heatmap', 'w-breadth', 'w-news', 'w-funds'],
      geo: {
        'w-heatmap': [8, 8, 568, 544], 'w-news': [584, 8, 280, 544], 'w-breadth': [584, 560, 280, 200],
        'w-funds': [888, 8, -1, 560]
      }
    }
  };

  function applyPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    qsa('.widget').forEach(function (w) {
      var show = p.show.indexOf(w.id) >= 0;
      w.style.display = show ? '' : 'none';
      w.classList.remove('min');
      w.classList.remove('zoomed');
      if (show && p.geo[w.id]) {
        var g = p.geo[w.id];
        w.style.left = g[0] + 'px';
        w.style.top = g[1] + 'px';
        if (g[2] === -1) {
          w.style.width = '';
          w.style.right = '8px';
        } else {
          w.style.width = g[2] + 'px';
          w.style.right = '';
        }
        w.style.height = g[3] + 'px';
      }
      syncWidgetButtons(w);
    });
    saveLayout();
    reflowGrid();
    redrawCharts();
  }

  function resetLayout() {
    try { localStorage.removeItem(LAYOUT_KEY); } catch (e) {}
    qsa('.widget').forEach(function (w) {
      var d = defaultLayout[w.id];
      if (d) {
        w.style.left = d.left; w.style.top = d.top;
        w.style.width = d.width; w.style.height = d.height;
        w.style.right = d.right || '';
      }
      w.style.display = '';
      w.classList.remove('locked', 'min', 'zoomed');
      syncWidgetButtons(w);
    });
    qsa('[data-preset]').forEach(function (b) { b.classList.remove('on'); });
    var gb = qs('[data-preset="global"]');
    if (gb) gb.classList.add('on');
    reflowGrid();
    redrawCharts();
  }

  // ============================================================
  //  快 照 导 出 / 手 动 刷 新 / 帮 助
  // ============================================================
  function exportSnapshot() {
    var snapshot = {
      asof: new Date().toISOString(),
      source: currentSource,
      stocks: STOCKS,
      ticker: TICKER_ITEMS,
      indices: GLOBAL_INDICES,
      metals: METALS,
      news: NEWS.slice(0, 10)
    };
    var blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gmt-snapshot-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  var refreshCooldown = false;
  function refreshAll(manual) {
    if (manual) {
      if (refreshCooldown) return;
      refreshCooldown = true;
      var btn = byId('ft-refresh');
      if (btn) btn.textContent = '⏳ 刷新中';
      setTimeout(function () {
        refreshCooldown = false;
        if (btn) btn.textContent = '🔄 立即刷新';
      }, 3000);
    }
    fetchQuotes(manual);
    fetchChartData();
    fetchNews(manual);
    fetchFundQuotes();
    if (manual) fetchFundHistories();
  }

  function toggleHelp(force) {
    var help = byId('f1-help');
    if (!help) return;
    var show = force !== undefined ? force : help.style.display === 'none';
    help.style.display = show ? '' : 'none';
  }

  function toggleEdit() {
    editing = !editing;
    document.body.classList.toggle('editing', editing);
    var editBtn = byId('tb-edit');
    if (editBtn) editBtn.classList.toggle('on', editing);
    var hint = byId('edit-hint');
    if (hint) hint.style.display = editing ? '' : 'none';
  }

  // ============================================================
  //  事 件 绑 定
  // ============================================================
  function bindEvents() {
    // --- 组件标题栏按钮 (事件委托) ---
    byId('grid').addEventListener('click', function (e) {
      var btn = e.target.closest('.w-btn');
      if (btn) {
        var w = btn.closest('.widget');
        if (!w) return;
        var act = btn.getAttribute('data-act');
        if (act === 'up') swapWidget(w, -1);
        else if (act === 'down') swapWidget(w, 1);
        else if (act === 'lock') {
          w.classList.toggle('locked');
          syncWidgetButtons(w);
          saveLayout();
        }
        else if (act === 'min') {
          w.classList.toggle('min');
          syncWidgetButtons(w);
          saveLayout();
          reflowGrid();
          redrawCharts();
        }
        else if (act === 'zoom') toggleZoom(w);
        else if (act === 'close') {
          w.style.display = 'none';
          saveLayout();
          reflowGrid();
          updateAddMenu();
        }
        return;
      }
      // 热力图 tile 点击 → Yahoo 报价页 / 聚合块切列表
      var tile = e.target.closest('.hm-tile');
      if (tile) {
        if (tile.classList.contains('agg')) {
          showList = true;
          var listBtn = byId('hm-toggle-list');
          if (listBtn) listBtn.classList.add('on');
          renderHeatmap();
        } else {
          var sym = tile.getAttribute('data-sym');
          if (sym) window.open('https://finance.yahoo.com/quote/' + sym, '_blank');
        }
        return;
      }
      // 列表行点击 → Yahoo 报价页
      var row = e.target.closest('.hm-list tr[data-sym]');
      if (row) {
        window.open('https://finance.yahoo.com/quote/' + row.getAttribute('data-sym'), '_blank');
        return;
      }
      // 新闻条目点击 → 原文
      var nw = e.target.closest('.nw-item');
      if (nw) {
        var link = nw.getAttribute('data-link');
        if (link) window.open(link, '_blank');
        return;
      }
      // 基金条目点击 → 天天基金详情页
      var fd = e.target.closest('.fd-item');
      if (fd) {
        window.open('https://fund.eastmoney.com/' + fd.getAttribute('data-code') + '.html', '_blank');
        return;
      }
    });

    // 跑马灯点击 → Yahoo 报价页
    byId('tape').addEventListener('click', function (e) {
      var item = e.target.closest('.tape-item');
      if (!item) return;
      var sym = item.getAttribute('data-sym');
      var ysym = sym && YAHOO_SYMBOLS[sym] ? decodeURIComponent(YAHOO_SYMBOLS[sym]) : sym;
      if (ysym) window.open('https://finance.yahoo.com/quote/' + encodeURIComponent(ysym), '_blank');
    });

    // 跑马灯暂停
    var pauseBtn = byId('tape-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', function () {
        tapePaused = !tapePaused;
        byId('tape').classList.toggle('paused', tapePaused);
        pauseBtn.textContent = tapePaused ? '▶' : '❚❚';
      });
    }

    // 热力图板块筛选
    qsa('.chip[data-sector]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        qsa('.chip[data-sector]').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        currentSectorFilter = btn.getAttribute('data-sector');
        renderHeatmap();
        renderBreadth();
      });
    });

    // 热力图方向筛选
    var dirBtn = byId('hm-toggle-dir');
    if (dirBtn) {
      dirBtn.addEventListener('click', function () {
        if (!currentDirFilter) currentDirFilter = 'up';
        else if (currentDirFilter === 'up') currentDirFilter = 'down';
        else currentDirFilter = null;
        dirBtn.textContent = currentDirFilter === 'up' ? '↑ 上涨' : currentDirFilter === 'down' ? '↓ 下跌' : '± 涨跌';
        dirBtn.classList.toggle('on', currentDirFilter !== null);
        renderHeatmap();
        renderBreadth();
      });
    }

    // 面积切换
    var areaBtn = byId('hm-toggle-area');
    if (areaBtn) {
      areaBtn.addEventListener('click', function () {
        showArea = !showArea;
        areaBtn.textContent = showArea ? '面积:总市值' : '面积:等权';
        areaBtn.classList.toggle('on', showArea);
        renderHeatmap();
      });
    }

    // 列表切换
    var listBtn = byId('hm-toggle-list');
    if (listBtn) {
      listBtn.addEventListener('click', function () {
        showList = !showList;
        listBtn.classList.toggle('on', showList);
        renderHeatmap();
      });
    }

    // 热力图搜索
    var hmSearch = byId('hm-search');
    if (hmSearch) {
      hmSearch.addEventListener('input', function () {
        var q = this.value.trim().toUpperCase();
        qsa('.hm-tile:not(.agg)').forEach(function (tile) {
          var label = tile.getAttribute('aria-label') || '';
          tile.style.display = (q === '' || label.indexOf(q) > -1) ? '' : 'none';
        });
        qsa('.hm-list tr[data-sym]').forEach(function (row) {
          row.style.display = (q === '' || row.getAttribute('data-sym').indexOf(q) > -1) ? '' : 'none';
        });
      });
    }

    // 新闻筛选
    qsa('.chip[data-news]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        qsa('.chip[data-news]').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        currentNewsFilter = btn.getAttribute('data-news');
        newsAutoIdx = 0;
        renderNews();
      });
    });

    // 新闻自动轮播
    var newsAutoBtn = byId('news-auto');
    if (newsAutoBtn) {
      newsAutoBtn.addEventListener('click', function () {
        setNewsAuto(!newsAuto);
      });
    }

    // 新闻搜索
    var newsSearch = byId('news-search');
    if (newsSearch) {
      newsSearch.addEventListener('input', function () {
        var q = this.value.trim().toLowerCase();
        qsa('.nw-item').forEach(function (item) {
          item.style.display = (q === '' || item.textContent.toLowerCase().indexOf(q) > -1) ? '' : 'none';
        });
      });
    }

    // 工具栏预设
    qsa('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        qsa('[data-preset]').forEach(function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        applyPreset(btn.getAttribute('data-preset'));
      });
    });

    // 编辑布局
    var editBtn = byId('tb-edit');
    if (editBtn) editBtn.addEventListener('click', toggleEdit);

    // 恢复默认
    var resetBtn = byId('tb-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetLayout);

    // 添加组件下拉
    var addBtn = byId('tb-add');
    var addMenu = byId('add-menu');
    if (addBtn && addMenu) {
      addBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        updateAddMenu();
        addMenu.style.display = addMenu.style.display === 'none' ? '' : 'none';
      });
      addMenu.addEventListener('click', function (e) {
        var item = e.target.closest('.am-item');
        if (!item) return;
        var w = byId(item.getAttribute('data-widget'));
        if (w) {
          w.style.display = '';
          w.classList.remove('min');
          syncWidgetButtons(w);
          saveLayout();
          reflowGrid();
          redrawCharts();
          updateAddMenu();
        }
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest('#add-menu') && !e.target.closest('#tb-add')) {
          addMenu.style.display = 'none';
        }
      });
    }

    // 命令栏: 快照/实时切换
    var snapBtn = byId('cmd-snapshot');
    if (snapBtn) {
      snapBtn.addEventListener('click', function () {
        livePaused = !livePaused;
        snapBtn.textContent = livePaused ? '▶ 恢复实时' : '● 快照·离线';
        snapBtn.title = livePaused ? '恢复定时刷新实时数据' : '暂停实时刷新，保持当前快照';
        if (livePaused) {
          if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
          updateStatus('快照·暂停', currentSource + '（已暂停刷新）');
        } else {
          startTimers();
          refreshAll(false);
        }
      });
    }

    // 脚标按钮
    var snapExport = byId('ft-snapshot');
    if (snapExport) snapExport.addEventListener('click', exportSnapshot);
    var refreshBtn = byId('ft-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { refreshAll(true); });

    // 时区切换
    var tzSelect = byId('clock-tz-select');
    if (tzSelect) {
      tzSelect.addEventListener('change', function () {
        renderClock();
      });
    }

    // 键盘快捷键
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key === 'F1') {
        e.preventDefault();
        toggleHelp();
      } else if (e.key === 'Escape') {
        toggleHelp(false);
        var zoomed = qs('.widget.zoomed');
        if (zoomed) toggleZoom(zoomed);
      } else if (e.key === 'r' || e.key === 'R') {
        refreshAll(true);
      } else if (e.key === 'e' || e.key === 'E') {
        toggleEdit();
      }
    });

    // 窗口 resize 重绘
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        reflowGrid();
        redrawCharts();
      }, 300);
    });

    bindDragResize();
  }

  // ============================================================
  //  定 时 刷 新
  // ============================================================
  function startTimers() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (chartTimer) clearInterval(chartTimer);
    if (newsTimer) clearInterval(newsTimer);
    refreshTimer = setInterval(function () { fetchQuotes(false); }, REFRESH_INTERVAL);
    chartTimer = setInterval(function () { if (!livePaused) fetchChartData(); }, CHART_INTERVAL);
    newsTimer = setInterval(function () { if (!livePaused) fetchNews(false); }, NEWS_INTERVAL);
    // 基金净值 5 分钟刷新一次 (净值盘中不变化，低频即可)
    setInterval(function () { if (!livePaused) fetchFundQuotes(); }, 300000);
  }

  // ============================================================
  //  启 动
  // ============================================================
  function init() {
    captureDefaultLayout();
    loadLayout();

    updateClock();
    setInterval(updateClock, 1000);

    // 初始渲染 (Demo 数据，实时数据到达后覆盖)
    renderAll();
    renderClock();
    renderFunds();
    bindEvents();
    updateAddMenu();
    reflowGrid();

    // 启动实时数据
    updateStatus('连接中', '正在连接实时数据源…');
    refreshAll(false);
    fetchFundHistories(); // 历史净值仅加载一次 (量较大)
    startTimers();
    // 指数开闭市状态每分钟按本地时钟重算
    setInterval(renderGlobalIndices, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
