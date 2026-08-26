#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""siteConfigHash 跨语言一致性 —— Python 侧 golden 生成器（权威来源）。

运行（在仓库根目录）：
    python test/hash-crosscheck/ref.py

输出：
    test/hash-crosscheck/expected.json   （case name → sha256 hex）

原理：直接复用 watchdog_check.compute_site_config_hash()（与 watch.js 的
computeSiteConfigHash 保持一致：固定安全字段 + 递归按键排序 + 紧凑 JSON +
ensure_ascii=False + UTF-8 SHA-256）。生成后由 test/hash-crosscheck.js 在
Node 侧复算并断言两边结果完全一致。
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(os.path.dirname(_HERE))
if _REPO not in sys.path:
    sys.path.insert(0, _REPO)

from watchdog_check import compute_site_config_hash  # noqa: E402


def main():
    with open(os.path.join(_HERE, 'fixtures.json'), encoding='utf-8') as f:
        fixtures = json.load(f)
    cases = fixtures['cases']
    out = {'note': '由 test/hash-crosscheck/ref.py 生成（Python 侧权威）。修改 fixtures.json 后必须重新运行本脚本。',
           'cases': {}}
    for c in cases:
        h = compute_site_config_hash(c['site'])
        if not h:
            sys.exit('compute_site_config_hash 返回 None（case=%s）' % c.get('name'))
        out['cases'][c['name']] = h
    with open(os.path.join(_HERE, 'expected.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('wrote %d hashes -> test/hash-crosscheck/expected.json' % len(cases))


if __name__ == '__main__':
    main()
