#!/usr/bin/env python3
"""Build pickem/results.json from nflverse's games.csv.

Keyed by "week-away-home", never by row index: the app stores picks by their
position in its schedule array, and the league flexes kickoff times mid-season,
so anything positional silently mis-grades the moment the upstream file reorders.
Matchups cannot change once a schedule is released, so this key is stable.

Refuses to write a file that looks wrong — a truncated or reordered upstream
should fail the job loudly, not quietly blank out everyone's season.
"""
import csv, io, json, os, sys, urllib.request
from datetime import datetime, timezone

SEASON = int(os.environ.get("SEASON", "2026"))
SRC = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "pickem", "results.json")
EXPECTED_GAMES = 272          # 17 games x 32 clubs / 2
EXPECTED_WEEKS = 18


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pickem-results"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8")


def main():
    rows = list(csv.DictReader(io.StringIO(fetch(SRC))))
    need = {"season", "game_type", "week", "away_team", "home_team", "away_score", "home_score"}
    missing = need - set(rows[0].keys())
    if missing:
        sys.exit("upstream schema changed, missing columns: %s" % sorted(missing))

    reg = [r for r in rows if r["season"] == str(SEASON) and r["game_type"] == "REG"]
    if len(reg) != EXPECTED_GAMES:
        sys.exit("expected %d regular-season games for %d, upstream has %d — refusing to write"
                 % (EXPECTED_GAMES, SEASON, len(reg)))

    weeks = {int(r["week"]) for r in reg}
    if weeks != set(range(1, EXPECTED_WEEKS + 1)):
        sys.exit("unexpected week set: %s" % sorted(weeks))

    results, per_week_done, per_week_total = {}, {}, {}
    for r in reg:
        w = int(r["week"])
        per_week_total[w] = per_week_total.get(w, 0) + 1
        a, h = r["away_score"].strip(), r["home_score"].strip()
        if not a or not h:
            continue
        key = "%d-%s-%s" % (w, r["away_team"], r["home_team"])
        if key in results:
            sys.exit("duplicate matchup key %s — upstream data is not as assumed" % key)
        results[key] = [int(a), int(h)]
        per_week_done[w] = per_week_done.get(w, 0) + 1

    # "through" is derived from completeness, never from the clock: the app has
    # no timezone handling and the season straddles a DST change.
    through = 0
    for w in range(1, EXPECTED_WEEKS + 1):
        if per_week_done.get(w, 0) == per_week_total[w]:
            through = w
        else:
            break

    payload = {
        "gen": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season": SEASON,
        "through": through,
        "played": len(results),
        "r": results,
    }

    path = os.path.normpath(OUT)
    prev = None
    if os.path.exists(path):
        try:
            prev = json.load(open(path))
        except Exception:
            prev = None

    # results only ever accumulate; a shrinking set means something is wrong
    if prev and len(prev.get("r", {})) > len(results):
        sys.exit("upstream reports %d played games, we already had %d — refusing to regress"
                 % (len(results), len(prev["r"])))

    if prev and prev.get("r") == results and prev.get("through") == through:
        print("no change (%d played, through week %d)" % (len(results), through))
        return

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(payload, f, separators=(",", ":"), sort_keys=True)
    print("wrote %s — %d played, through week %d, %d bytes"
          % (path, len(results), through, os.path.getsize(path)))


if __name__ == "__main__":
    main()
