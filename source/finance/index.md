---
title: 交易
---

<link rel="stylesheet" href="/css/finance.css?v=5">

{% raw %}
<div class="gmt-term" id="gmt-term">

  <!-- ===== 命令栏 ===== -->
  <div id="cmdbar">
    <div class="cmd-left">
      <span class="cmd-logo">GMT <b>全球市场终端</b></span>
      <span class="cmd-ver">v2.2</span>
      <span class="mode-badge" id="mode-badge">真实快照</span>
    </div>
    <div class="cmd-mid">
      <button class="cmd-btn" id="cmd-snapshot" title="标记为快照">● 快照·离线</button>
    </div>
    <div class="cmd-right">
      <span class="conn-status" id="conn-status">当前时间</span>
      <span class="cmd-clock" id="cmd-clock">加载中...</span>
    </div>
  </div>

  <!-- ===== 跑马灯 ===== -->
  <div id="tape-wrap">
    <button class="tape-ctl" id="tape-pause" title="暂停/继续">❚❚</button>
    <div id="tape-viewport">
      <div id="tape"></div>
    </div>
  </div>

  <!-- ===== 工具栏 ===== -->
  <div id="toolbar">
    <button class="tb-btn" id="tb-edit">▦ 编辑布局</button>
    <button class="tb-btn" id="tb-add">+ 添加组件 ▾</button>
    <div id="add-menu" class="add-menu" style="display:none"></div>
    <span class="tb-label">预设&gt;</span>
    <button class="tb-btn on" data-preset="global">全球</button>
    <button class="tb-btn" data-preset="stock">股票</button>
    <button class="tb-btn" data-preset="metal">贵金属</button>
    <button class="tb-btn" data-preset="news">新闻</button>
    <span class="tb-sep"></span>
    <button class="tb-btn warn" id="tb-reset">↺ 恢复默认</button>
    <span class="edit-hint" id="edit-hint" style="display:none">拖拽移动 · 右下角调整大小</span>
  </div>

  <!-- ===== 仪表盘画布 ===== -->
  <main id="grid" role="main" aria-label="仪表盘画布" style="height:1600px">

    <!-- 01 个股追踪·热力矩阵 -->
    <section class="widget" id="w-heatmap" role="region" aria-label="个股追踪·热力矩阵"
      style="position:absolute; left:8px; top:8px; width:568px; height:544px;">
      <div class="w-head">
        <span class="w-num">01</span>
        <span class="w-title">个股追踪 · 热力矩阵</span>
        <span class="w-asof" id="hm-asof">as-of 2026-07-27 16:00（美东 EDT）</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div class="ctl-row">
          <button class="chip on" data-sector="all">全部</button>
          <button class="chip" data-sector="tech">AI·科技</button>
          <button class="chip" data-sector="energy">能源</button>
          <button class="chip" data-sector="finance">金融</button>
          <button class="chip" id="hm-toggle-dir" title="切换上涨/下跌筛选">± 涨跌</button>
          <button class="chip" id="hm-toggle-area" title="色块面积编码">面积:总市值</button>
          <button class="chip" id="hm-toggle-list" title="切换列表视图">≣ 列表</button>
          <input type="search" class="hm-search" id="hm-search" placeholder="> 代码" aria-label="搜索股票代码" style="margin-left:auto;width:84px;">
        </div>
        <div class="hm-wrap" id="hm-wrap" style="position:relative;overflow:hidden;flex:1;min-height:60px;"></div>
        <div class="legend" id="hm-legend">
          <span>-4%</span>
          <span class="legend-bar"></span>
          <span>+4%</span>
          <span style="margin-left:10px">颜色：日涨跌幅（红涨绿跌，强度=幅度）</span>
          <span style="margin-left:10px" id="area-label">面积：总市值（美元） · 悬停查看报价 · 点击查看来源</span>
        </div>
      </div>
      <div class="w-resize"></div>
    </section>

    <!-- 02 市场宽度 -->
    <section class="widget" id="w-breadth" role="region" aria-label="市场宽度"
      style="position:absolute; left:584px; top:8px; width:280px; height:176px;">
      <div class="w-head">
        <span class="w-num">02</span>
        <span class="w-title">市场宽度</span>
        <span class="w-asof" id="bd-asof">as-of 2026-07-27 16:00（美东 EDT）</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div class="bd-grid" style="height:calc(100% - 16px)" id="bd-grid"></div>
        <div class="bd-note" id="bd-note">统计仅描述当前筛选下的 36 只跟踪样本，不代表全市场宽度。</div>
      </div>
      <div class="w-resize"></div>
    </section>

    <!-- 03 新闻快讯 -->
    <section class="widget" id="w-news" role="region" aria-label="新闻快讯"
      style="position:absolute; left:584px; top:192px; width:280px; height:360px;">
      <div class="w-head">
        <span class="w-num">03</span>
        <span class="w-title">新闻快讯</span>
        <span class="w-asof" id="news-asof">自动 30s · 抓取于 07-28 15:34（北京）</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div class="ctl-row">
          <button class="chip on" data-news="all">全部</button>
          <button class="chip" data-news="AI">AI</button>
          <button class="chip" data-news="科技">科技</button>
          <button class="chip" data-news="能源">能源</button>
          <button class="chip" data-news="金融">金融</button>
          <button class="chip" data-news="宏观">宏观</button>
          <button class="chip" data-news="金属">金属</button>
          <button class="chip" id="news-auto">▶ 自动</button>
          <input type="search" class="news-search" id="news-search" placeholder="> 关键词" style="width:76px;">
        </div>
        <div id="news-list" style="position:absolute;inset:27px 0 0;overflow:auto;"></div>
      </div>
      <div class="w-resize"></div>
    </section>

    <!-- 05 板块日内走势 -->
    <section class="widget" id="w-sector" role="region" aria-label="板块日内走势"
      style="position:absolute; left:8px; top:560px; width:568px; height:200px;">
      <div class="w-head">
        <span class="w-num">05</span>
        <span class="w-title">板块日内走势</span>
        <span class="w-asof">2026-07-27 美东常规时段 · 等权</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div class="stat-strip" id="sector-strip"></div>
        <div class="chart-box" id="sector-chart">
          <canvas id="sector-canvas"></canvas>
        </div>
        <div class="chart-note">曲线：2026-07-27 美东常规时段，XLK/XLE/XLF ETF 5 分钟线归一化（开盘=0%，24 采样）；条形：36 只样本股按板块等权平均（对前收，n 已标注）。两种口径并列展示，不伪装同步；非美市场显示其最近收盘。</div>
      </div>
      <div class="w-resize"></div>
    </section>

    <!-- 04 AAPL·近60个交易日 -->
    <section class="widget" id="w-aapl" role="region" aria-label="AAPL·近60个交易日"
      style="position:absolute; left:584px; top:560px; width:280px; height:240px;">
      <div class="w-head">
        <span class="w-num">04</span>
        <span class="w-title">AAPL · 近 60 个交易日</span>
        <span class="w-asof">as-of 2026-07-27（美东 EDT 收盘）</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div class="stat-strip" id="aapl-strip"></div>
        <div class="chart-box" id="aapl-chart">
          <canvas id="aapl-canvas"></canvas>
        </div>
        <div class="chart-note">悬停或用 ← → 查看 — 共 60 个交易日</div>
      </div>
      <div class="w-resize"></div>
    </section>

    <!-- 06 贵金属·XAU XAG XPT XPD -->
    <section class="widget" id="w-metal" role="region" aria-label="贵金属·XAU XAG XPT XPD"
      style="position:absolute; left:8px; top:768px; width:568px; height:340px;">
      <div class="w-head">
        <span class="w-num">06</span>
        <span class="w-title">贵金属 · XAU XAG XPT XPD</span>
        <span class="w-asof">as-of 2026-07-28（期货日线）</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div id="metal-items" style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);"></div>
        <div class="chart-box" id="metal-chart" style="flex:1;min-height:80px;">
          <canvas id="metal-canvas"></canvas>
        </div>
        <div class="chart-note" id="metal-note">金银比 -- · 倍 金铂价差 -- · USD/t oz</div>
      </div>
      <div class="w-resize"></div>
    </section>

    <!-- 07 市场脉搏·全球时钟 -->
    <section class="widget" id="w-clock" role="region" aria-label="市场脉搏·全球时钟"
      style="position:absolute; left:584px; top:808px; width:280px; height:340px;">
      <div class="w-head">
        <span class="w-num">07</span>
        <span class="w-title">市场脉搏 · 全球时钟</span>
        <span class="w-asof">实时时钟 · IANA 时区 · 节假日未核实</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div class="ctl-row" style="justify-content:space-between;">
          <span style="font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;" id="clock-display">09:49:14</span>
          <select id="clock-tz-select" style="width:auto;">
            <option value="local">本地（浏览器）</option>
            <option value="UTC">UTC</option>
            <option value="Asia/Shanghai">北京</option>
            <option value="Asia/Hong_Kong">香港</option>
            <option value="Asia/Tokyo">东京</option>
            <option value="Europe/London">伦敦</option>
            <option value="America/New_York">纽约</option>
          </select>
        </div>
        <div style="font-size:9px;color:var(--fg-faint);padding:0 8px 4px;" id="clock-date">周一 2026-08-24 · 本地（UTC+08:00）</div>
        <div class="chart-box" id="clock-chart" style="flex:1;min-height:60px;">
          <canvas id="clock-canvas"></canvas>
        </div>
        <div style="overflow:auto;flex:0 0 auto;">
          <table class="clock-table" id="clock-table">
            <thead><tr><th>市场</th><th>状态</th><th>当地</th><th>交易时段</th><th>下次切换</th></tr></thead>
            <tbody id="clock-tbody"></tbody>
          </table>
        </div>
      </div>
      <div class="w-resize"></div>
    </section>

    <!-- 08 全球指数一览 -->
    <section class="widget" id="w-indices" role="region" aria-label="全球指数一览"
      style="position:absolute; left:8px; top:1116px; width:856px; height:360px;">
      <div class="w-head">
        <span class="w-num">08</span>
        <span class="w-title">全球指数一览</span>
        <span class="w-asof" id="idx-asof">状态实时计算 · 30s 刷新</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div id="indices-list" style="overflow:auto;flex:1;"></div>
      </div>
      <div class="w-resize"></div>
    </section>

    <!-- 09 自选基金 -->
    <section class="widget" id="w-funds" role="region" aria-label="自选基金"
      style="position:absolute; left:888px; top:8px; right:8px; height:736px;">
      <div class="w-head">
        <span class="w-num">09</span>
        <span class="w-title">自选基金 · 净值监看</span>
        <span class="w-asof" id="fund-asof">加载中…</span>
        <span class="w-order">
          <button class="w-btn" data-act="up" title="上移">▲</button>
          <button class="w-btn" data-act="down" title="下移">▼</button>
        </span>
        <button class="w-btn" data-act="lock" title="锁定位置">🔓</button>
        <button class="w-btn" data-act="min" title="最小化">—</button>
        <button class="w-btn" data-act="zoom" title="放大">⤢</button>
        <button class="w-btn" data-act="close" title="移除">✕</button>
        <div class="w-drag"></div>
      </div>
      <div class="w-body">
        <div class="stat-strip" id="fund-strip"></div>
        <div id="fund-list" style="flex:1;overflow:auto;"></div>
        <div class="chart-note">数据：天天基金 + 腾讯行情 · 净值为最近交易日公布值（QDII 为 T-1/T-2） · 点击查看基金详情</div>
      </div>
      <div class="w-resize"></div>
    </section>

  </main>

  <!-- 脚标：数据源状态 + 功能按钮 -->
  <div class="kimi-footer">
    <span class="ft-src" id="ft-src">数据源：初始化…</span>
    <button class="kimi-btn" id="ft-snapshot" title="导出当前行情数据为 JSON">📸 导出快照</button>
    <button class="kimi-btn" id="ft-refresh" title="立即刷新行情/图表/新闻">🔄 立即刷新</button>
    <span style="margin-left:auto;color:var(--fg-faint);font-size:9px;">[F1] 帮助</span>
  </div>

  <!-- F1 快捷键帮助 -->
  <div id="f1-help" class="f1-help" style="display:none">
    <div class="f1-box">
      <div class="f1-title">快捷键 &amp; 操作说明</div>
      <table>
        <tr><td>F1</td><td>打开/关闭本帮助</td></tr>
        <tr><td>Esc</td><td>关闭帮助 / 退出放大组件</td></tr>
        <tr><td>R</td><td>立即刷新数据</td></tr>
        <tr><td>E</td><td>切换编辑布局模式</td></tr>
        <tr><td>▦ 编辑布局</td><td>开启后拖拽标题栏移动、右下角调整大小</td></tr>
        <tr><td>▲ ▼</td><td>与上一个/下一个组件交换位置</td></tr>
        <tr><td>🔓/🔒</td><td>锁定后编辑模式下不可拖动/调整</td></tr>
        <tr><td>—</td><td>最小化（只留标题栏），再点恢复</td></tr>
        <tr><td>⤢</td><td>放大铺满画布，再点或 Esc 还原</td></tr>
        <tr><td>✕</td><td>移除组件，可在「+ 添加组件」找回</td></tr>
        <tr><td>● 快照·离线</td><td>命令栏按钮：暂停/恢复实时刷新</td></tr>
      </table>
      <div class="f1-close">按 Esc 或 F1 关闭</div>
    </div>
  </div>

</div>
{% endraw %}

<script src="/js/finance-tracker.js"></script>