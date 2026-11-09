# Gera data/pt.json.gz: nomes das cartas em português (Brasil) a partir do MTGJSON (AtomicCards).
import gzip, json, sys, urllib.request
src = sys.argv[1] if len(sys.argv) > 1 else None
raw = open(src, "rb").read() if src else urllib.request.urlopen("https://mtgjson.com/api/v5/AtomicCards.json.gz", timeout=300).read()
data = json.loads(gzip.decompress(raw))["data"]
out = {}
for en, faces in data.items():
    pt = []
    for f in faces:
        for fd in f.get("foreignData") or []:
            if fd.get("language") == "Portuguese (Brazil)" and fd.get("name"):
                nm = fd.get("faceName") or fd["name"]
                if nm not in pt: pt.append(nm)
                break
    if pt:
        name = " // ".join(pt) if " // " in en and len(pt) > 1 else pt[0].split(" // ")[0] if " // " not in en else pt[0]
        if name.strip().lower() != en.strip().lower(): out[en] = name
pairs = sorted(out.items())
with gzip.open("data/pt.json.gz", "wt", encoding="utf-8") as fh: json.dump(pairs, fh, ensure_ascii=False, separators=(",", ":"))
print(len(pairs), "nomes em português")
