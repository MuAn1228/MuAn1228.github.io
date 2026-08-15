# 抓取 GitHub 贡献数据并保存为 source/data/contributions.json
# 由 GitHub Action 每日调用，token 从环境变量 GH_TOKEN 读取
import json, os, urllib.request

TOKEN = os.environ.get("GH_TOKEN", "")
if not TOKEN:
    raise SystemExit("缺少 GH_TOKEN 环境变量")

QUERY = """
query {
  user(login: "MuAn1228") {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
"""

req = urllib.request.Request(
    "https://api.github.com/graphql",
    data=json.dumps({"query": QUERY}).encode("utf-8"),
    headers={
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json",
        "User-Agent": "hexo-blog",
    },
)

resp = json.loads(urllib.request.urlopen(req).read())
if "errors" in resp:
    raise SystemExit("GraphQL 错误: " + json.dumps(resp["errors"]))

cal = resp["data"]["user"]["contributionsCollection"]["contributionCalendar"]

weeks = []
for w in cal["weeks"]:
    days = []
    for d in w["contributionDays"]:
        c = d["contributionCount"]
        level = 0 if c == 0 else 1 if c < 10 else 2 if c < 20 else 3 if c < 30 else 4
        days.append({"date": d["date"], "count": c, "level": level})
    weeks.append({"days": days})

os.makedirs("source/data", exist_ok=True)
with open("source/data/contributions.json", "w", encoding="utf-8") as f:
    json.dump({"totalContributions": cal["totalContributions"], "weeks": weeks}, f, ensure_ascii=False)

print("已抓取", cal["totalContributions"], "次贡献，共", sum(len(w["days"]) for w in weeks), "天")
