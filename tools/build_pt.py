# Gera data/pt.json.gz (nomes em português) e data/foreign.json.gz (pt, es, fr, de, it) a partir do MTGJSON (AtomicCards).
import gzip, json, sys, urllib.request
src = sys.argv[1] if len(sys.argv) > 1 else None
raw = open(src, "rb").read() if src else urllib.request.urlopen("https://mtgjson.com/api/v5/AtomicCards.json.gz", timeout=300).read()
data = json.loads(gzip.decompress(raw))["data"]
LANGS = {"Portuguese (Brazil)": "pt", "Spanish": "es", "French": "fr", "German": "de", "Italian": "it"}
names = {v: {} for v in LANGS.values()}
for en, faces in data.items():
    per = {}
    for f in faces:
        for fd in f.get("foreignData") or []:
            code = LANGS.get(fd.get("language"))
            if not code or not fd.get("name"): continue
            nm = fd.get("faceName") or fd["name"]
            lst = per.setdefault(code, [])
            if nm not in lst: lst.append(nm)
    for code, lst in per.items():
        name = " // ".join(lst) if " // " in en and len(lst) > 1 else lst[0]
        if name.strip().lower() != en.strip().lower(): names[code][en] = name
pt = sorted(names["pt"].items())
with gzip.open("data/pt.json.gz", "wt", encoding="utf-8") as fh: json.dump(pt, fh, ensure_ascii=False, separators=(",", ":"))
# formato compacto: { "en": [pt, es, fr, de, it] } com "" quando não há
order = ["pt", "es", "fr", "de", "it"]
allen = sorted(set().union(*[set(names[c]) for c in order]))
rows = [[en] + [names[c].get(en, "") for c in order] for en in allen]
with gzip.open("data/foreign.json.gz", "wt", encoding="utf-8") as fh: json.dump({"langs": order, "rows": rows}, fh, ensure_ascii=False, separators=(",", ":"))
print(len(pt), "nomes em português;", {c: len(names[c]) for c in order})
