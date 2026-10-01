# 抓取 GitHub 贡献数据 + 个人统计，保存为 source/data/*.json
# 优先 GH_TOKEN；缺失或认证 401 时用 GH_FALLBACK_TOKEN 读取公开数据
import json, os, urllib.request, urllib.error

TOKEN = os.environ.get("GH_TOKEN", "")
FALLBACK_TOKEN = os.environ.get("GH_FALLBACK_TOKEN", "")
if not TOKEN and not FALLBACK_TOKEN:
    raise SystemExit("缺少 GH_TOKEN / GH_FALLBACK_TOKEN 环境变量")

LOGIN = "MuAn1228"

QUERY = """
query($login: String!) {
  user(login: $login) {
    login
    followers { totalCount }
    following { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false) { totalCount }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount color } }
      }
    }
  }
}
"""

def fetch_user(token):
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": QUERY, "variables": {"login": LOGIN}}).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "hexo-blog",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.loads(response.read())

try:
    resp = fetch_user(TOKEN or FALLBACK_TOKEN)
except urllib.error.HTTPError as error:
    if error.code != 401 or not TOKEN or not FALLBACK_TOKEN or TOKEN == FALLBACK_TOKEN:
        raise
    # PAT 过期时使用 Actions 自带凭据读取公开数据；仍然必须抓取成功才继续构建。
    print("GH_TOKEN 认证失败，尝试 Actions 自带凭据")
    resp = fetch_user(FALLBACK_TOKEN)
if "errors" in resp:
    raise SystemExit("GraphQL 错误: " + json.dumps(resp["errors"]))

user = resp["data"]["user"]
cal = user["contributionsCollection"]["contributionCalendar"]

# 贡献日历
weeks = []
for w in cal["weeks"]:
    days = []
    for d in w["contributionDays"]:
        days.append({"date": d["date"], "count": d["contributionCount"], "color": d["color"]})
    weeks.append({"days": days})

# 个人统计
stats = {
    "followers": user["followers"]["totalCount"],
    "following": user["following"]["totalCount"],
    "repos": user["repositories"]["totalCount"],
    "contributions": cal["totalContributions"],
}

os.makedirs("source/data", exist_ok=True)
with open("source/data/contributions.json", "w", encoding="utf-8") as f:
    json.dump({"totalContributions": cal["totalContributions"], "weeks": weeks}, f, ensure_ascii=False)
with open("source/data/github-stats.json", "w", encoding="utf-8") as f:
    json.dump(stats, f, ensure_ascii=False)

print("已抓取", cal["totalContributions"], "次贡献；关注者", stats["followers"], "仓库", stats["repos"])
