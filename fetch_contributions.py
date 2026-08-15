# 抓取 GitHub 贡献数据 + 个人统计，保存为 source/data/*.json
# 由 GitHub Action 每日调用，token 从环境变量 GH_TOKEN 读取
import json, os, urllib.request

TOKEN = os.environ.get("GH_TOKEN", "")
if not TOKEN:
    raise SystemExit("缺少 GH_TOKEN 环境变量")

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

req = urllib.request.Request(
    "https://api.github.com/graphql",
    data=json.dumps({"query": QUERY, "variables": {"login": LOGIN}}).encode("utf-8"),
    headers={
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json",
        "User-Agent": "hexo-blog",
    },
)

resp = json.loads(urllib.request.urlopen(req).read())
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
