# Gera data/brackets.json.gz para o avaliador de bracket:
#  - gc: Game Changers oficiais (Scryfall is:gamechanger)
#  - combos: combos de 2 cartas do Commander Spellbook (legais em Commander)
import gzip, json, sys, urllib.request, urllib.parse, time
UA = {"User-Agent": "BibliotecaMTG/1.0 (github.com/Teolfe01/scanner-mtg)", "Accept": "application/json"}
def get(url):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read())
gc = []; url = "https://api.scryfall.com/cards/search?q=" + urllib.parse.quote("is:gamechanger") + "&unique=cards"
while url:
    j = get(url); gc += [c["name"] for c in j["data"]]; url = j.get("next_page"); time.sleep(0.15)
print("game changers:", len(gc))

import ijson
combos = {}; n = 0
with open(sys.argv[1], "rb") as f:
    for v in ijson.items(f, "variants.item"):
        n += 1
        uses = v.get("uses") or []
        if len(uses) != 2 or (v.get("requires") or []): continue
        if v.get("status") not in (None, "OK", "E"): continue
        leg = v.get("legalities") or {}
        if leg and leg.get("commander") is False: continue
        names = sorted(u["card"]["name"] for u in uses)
        prod = [p["feature"]["name"] for p in (v.get("produces") or []) if p.get("feature")]
        inf = [p for p in prod if "Infinite" in p or "Win the game" in p or "Win" in p]
        if not inf: continue
        key = "|".join(names)
        res = (inf[0] if inf else prod[0] if prod else "")[:60]
        mv = v.get("manaValueNeeded") or 0
        tag = v.get("bracketTag") or ""
        pop = v.get("popularity") or 0
        old = combos.get(key)
        if not old or pop > old[5]: combos[key] = [names[0], names[1], res, mv, tag, pop]
print("variants lidas:", n, "combos de 2 cartas:", len(combos))
out = {"updated": time.strftime("%Y-%m-%d"), "gc": sorted(gc), "combos": [c[:5] for c in sorted(combos.values(), key=lambda c: -c[5])]}
with gzip.open("data/brackets.json.gz", "wt", encoding="utf-8") as fh: json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
