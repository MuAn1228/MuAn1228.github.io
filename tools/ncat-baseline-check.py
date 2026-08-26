#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
网飞猫候选域名人工基线核验 v2（只探测，不落盘，不修改 sites.json / health.json）。

用途：对「唯一候选域名」的 www 与裸域分别做首次人工基线所需的信息收集。
  - www.ncat21.com 与 ncat21.com 是【两个独立 hostname】，必须分别检查 DNS/TLS/HTTP/
    redirect/页面基线；不因属于同一注册域名就自动互相信任。
  - 每个 host 检查时 approved 只含它自己 → 若发现 www→裸域 / 裸域→www 的跨 host 重定向，
    会被如实标记为「未批准 host」→ 说明需要人工决定是否加入 allowedRedirectHosts。
  - 页面第三方域名按 A–E 分类（仅审计展示，绝不自动加入允许跳转列表）。

产出：DNS / TLS / HTTP / redirect chain（每跳）/ 最终 hostname / www↔裸域关系 /
      页面导航结构（meta refresh / JS 强制跳转）/ 第三方域名 A–E 分类 / 风险标记。
任何一项无法确认或出现 UNKNOWN → 保持 DISABLED；绝不自动加入 ncat24/25/26 等域名。
"""
import sys
import urllib.parse

sys.path.insert(0, r'D:\blog')
import watchdog_check as wd  # 复用与正式 watchdog 完全一致的检查实现

# ---- 唯一候选的 www 与裸域（可人工改为新候选域名；两个都需单独核验）----
CANDIDATES = ['www.ncat21.com', 'ncat21.com']
# 注意：这里是「待核验候选」，不是批准。任何 host 在核验完成前都不得视为 approved。
ALL_CANDIDATES = set(CANDIDATES)


def check_one(host):
    """对单个 hostname 做 DNS/TLS/HTTP+redirect 检查（approved 只含它自己）。"""
    print('=' * 66)
    print('候选 hostname：%s' % host)
    print('=' * 66)

    # ---- DNS（双源交叉 + 固定公网 IP）----
    print('\n[%s] DNS（系统解析器 + Cloudflare DoH 双源交叉 + 固定公网 IP）' % host)
    rec = wd.check_dns(host)
    print('  证据状态=%s  ok=%s' % (rec['state'], rec['ok']))
    print('  system: %s' % rec['system'])
    print('  doh:    %s' % rec['doh'])
    if rec['ok']:
        print('  固定公网 IP: %s' % ','.join(rec['ips']))
        print('  allPublic=%s  multiEdge=%s  intersection=%s  reason=%s' % (
            rec['allPublic'], rec['multiEdge'], rec['intersection'], ','.join(rec['reason'])))
        print('  （resolver 返回不同公网 IP 属于 CDN/GeoDNS 多边缘正常现象，不构成失败；'
              '后续连接一律固定使用上面的 IP，绝不二次解析）')
        pinned_ip = rec['ips'][0]
    else:
        pinned_ip = None

    # ---- TLS（连接固定公网 IP，SNI/证书校验 hostname）----
    print('\n[%s] TLS 握手 + 证书（固定公网 IP + SNI=host + 主机名匹配 + 有效期）' % host)
    if rec['ok'] and pinned_ip:
        tls = wd.pinned_tls(host, pinned_ip)
    else:
        tls = {'state': wd.S_UNKNOWN, 'ok': False, 'detail': 'DNS 未通过，跳过 TLS', 'cert': None}
    print('  证据状态=%s  ok=%s' % (tls['state'], tls['ok']))
    print('  detail: %s' % tls['detail'])
    if tls.get('cert'):
        c = tls['cert']
        print('  cert.subject: %s' % c.get('subject'))
        print('  cert.issuer:  %s' % c.get('issuer'))
        print('  cert.valid:   %s ~ %s' % (c.get('notBefore'), c.get('notAfter')))
        sans = [h for t, h in (c.get('SANs') or []) if t == 'DNS']
        print('  cert.SAN(DNS): %s' % ', '.join(sans))

    # ---- HTTP + redirect chain + 最终 hostname（approved 只含它自己）----
    base = 'https://%s/' % host
    approved = {host}  # 只信任当前 host，跨 host 重定向会被如实标记
    print('\n[%s] HTTP + redirect chain（每跳仅 https；approved 仅 %s）' % (host, host))
    state, ok, status, hops, hops_detail, body, detail, final_host = \
        wd.check_http_and_redirects_pinned(base, approved, start_ip=pinned_ip)
    print('  证据状态=%s  ok=%s  status=%s' % (state, ok, status))
    for hd in hops_detail:
        print('   hop: status=%-4s host=%-20s url=%s' % (hd['status'], hd['host'], hd['url']))
        if hd.get('location'):
            print('        location -> %s' % hd['location'])
    print('  最终 hostname = %s' % final_host)
    if final_host != host:
        print('  !! 最终 hostname 与候选不一致 → 存在跨 host 重定向（需人工核验是否加入 '
              'allowedRedirectHosts，绝不自动批准）')
    if detail:
        print('  detail: %s' % detail)

    # ---- 页面导航结构扫描（meta refresh / JS 强制跳转 / 外域 A–E 分类）----
    print('\n[%s] 页面导航结构扫描（A–E 分类仅审计展示，不自动信任）' % host)
    if ok and body:
        nav = wd.scan_page_navigation(body, approved)
        print('  证据状态=%s  %s' % (nav['state'], nav['detail']))
        if nav['metaRefresh']:
            print('  meta refresh:')
            for m in nav['metaRefresh']:
                print('    - %s' % m)
        if nav['jsForcedRedirect']:
            print('  JS 强制跳转:')
            for j in nav['jsForcedRedirect']:
                print('    - %s' % j)
        print('  页面外域 host（A–E 分类）:')
        for h, rec2 in sorted(nav['externalHosts'].items()):
            print('    - %-32s %s  contexts=%s' % (h, rec2['category'], ','.join(rec2['contexts'])))
        if not nav['externalHosts']:
            print('    （无外域引用）')

        # 风险标记
        print('\n[%s] 风险标记扫描（高风险结构；仅报告）' % host)
        r_ok, r_d, risks = wd.check_risk_scan(body, approved)
        print('  证据状态=%s  %s' % ('PASS' if r_ok else 'FAIL', r_d))
        for r in risks[:20]:
            print('    RISK: %s' % r)

        # 页面稳定标记候选（供人工确认基线，非安全证明）
        print('\n[%s] 页面稳定标记候选（title/description/h1，供人工建基线）' % host)
        text = body.decode('utf-8', errors='replace')
        import re
        m = re.search(r'<title[^>]*>(.*?)</title>', text, re.I | re.S)
        print('  <title>: %s' % (m.group(1).strip() if m else '未找到'))
        m2 = re.search(r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']',
                       text, re.I | re.S)
        print('  meta description: %s' % (m2.group(1).strip() if m2 else '未找到'))
        for kw in ['网飞猫', 'ncat', 'NCAT', 'ncat21']:
            print('   字样 %r 出现次数: %d' % (kw, len(re.findall(re.escape(kw), text, re.I))))
    else:
        print('  未获取正文（state=%s, detail=%s）' % (state, detail))
    print()


def main():
    print('=' * 66)
    print('网飞猫候选域名人工基线核验 v2')
    print('（仅信息收集：不写入 sites.json / health.json，保持 DISABLED）')
    print('候选：%s' % '、'.join(CANDIDATES))
    print('注意：www 与裸域是两个独立 hostname，分别核验；不因同一注册域名互相信任。')
    print('=' * 66)

    for host in CANDIDATES:
        check_one(host)

    # ---- www ↔ 裸域 关系判断（基于上面的跳转观察）----
    print('=' * 66)
    print('[汇总] www ↔ 裸域 重定向关系（基于上述逐跳观察）')
    print('  - 若任一 host 的 redirect chain 终点落到另一个 host，即存在 裸域→www 或 www→裸域 跳转。')
    print('  - 这种跨 host 跳转在 approved 只含单 host 时会被如实标记 FAIL；')
    print('    是否加入 allowedRedirectHosts 完全由人工核验后决定。')
    print('=' * 66)
    print('[结论] 仅信息收集，未写入任何安全决策数据。')
    print('未自动加入 ncat24/25/26 等其他域名。是否建立基线并置 sites.json healthy，')
    print('完全由人工核验后决定。任何一项 UNKNOWN → 保持 DISABLED。')
    print('=' * 66)


if __name__ == '__main__':
    main()
