# Gera data/precons.json.gz: decks de Commander oficiais (MTGJSON) e seus comandantes, com o rank do EDHREC (Scryfall)
#   decks: [nome do deck, código da coleção, data, arquivo MTGJSON, [comandantes]]
#   rank:  { comandante: edhrec_rank }
import gzip, json, sys, tarfile, time, urllib.request, os
UA = {"User-Agent": "BibliotecaMTG/1.0 (github.com/Teolfe01/scanner-mtg)", "Accept": "application/json"}
decks = []; types = {}; nocmd = 0; sample = None
with tarfile.open(sys.argv[1], "r:gz") as tf:
    for m in tf:
        if not m.isfile() or not m.name.endswith(".json"): continue
        try: d = json.load(tf.extractfile(m)).get("data") or {}
        except Exception: continue
        t = d.get("type") or ""
        types[t] = types.get(t, 0) + 1
        if "Commander" not in t: continue
        cmds = [c.get("name") for c in (d.get("commander") or d.get("displayCommander") or []) if c.get("name")]
        if not cmds: cmds = [c.get("name") for c in (d.get("mainBoard") or []) if c.get("isCommander") or c.get("isDisplayCommander")]
        if not cmds:
            nocmd += 1
            if not sample: sample = (m.name, list(d.keys()))
            continue
        cmds = list(dict.fromkeys(cmds))
        fn = os.path.basename(m.name)[:-5]
        decks.append([d.get("name") or fn, (d.get("code") or "").lower(), d.get("releaseDate") or "", fn, cmds])
decks.sort(key=lambda x: x[2], reverse=True)
names = sorted({n for d in decks for n in d[4]})
print("decks:", len(decks), "comandantes:", len(names), "sem comandante:", nocmd, sample)
print("tipos:", sorted(types.items(), key=lambda x: -x[1])[:25])
rank = {}
for i in range(0, len(names), 75):
    ids = [{"name": n.split(" // ")[0]} for n in names[i:i + 75]]
    req = urllib.request.Request("https://api.scryfall.com/cards/collection", data=json.dumps({"identifiers": ids}).encode(), headers={**UA, "Content-Type": "application/json"})
    try:
        j = json.loads(urllib.request.urlopen(req, timeout=120).read())
        for c in j.get("data", []):
            if c.get("edhrec_rank"): rank[c["name"]] = c["edhrec_rank"]; rank[c["name"].split(" // ")[0]] = c["edhrec_rank"]
    except Exception as e: print("erro scryfall", e)
    time.sleep(0.15)
out = {"updated": time.strftime("%Y-%m-%d"), "decks": decks, "rank": rank}
with gzip.open("data/precons.json.gz", "wt", encoding="utf-8") as fh: json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
print("ok", os.path.getsize("data/precons.json.gz"))
