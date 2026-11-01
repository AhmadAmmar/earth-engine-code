"""Audit exported Earth Engine scripts: what each uses, exact and near duplicates, naming problems. Writes audit.csv and prints a summary."""
import csv
import difflib
import hashlib
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf8")
roots = [Path(p) for p in sys.argv[2:]]
rows = []
for root in roots:
    for f in sorted(root.rglob("*")):
        if not f.is_file() or f.name == "MANIFEST.csv":
            continue
        raw = f.read_text(encoding="utf8", errors="replace")
        code = re.sub(r"/\*.*?\*/|//[^\n]*", "", raw, flags=re.S)
        norm = re.sub(r"\s+", " ", code).strip()
        rows.append(dict(
            root=root.name, path=str(f.relative_to(root)), lines=raw.count("\n") + 1, code_chars=len(norm),
            comment_lines=len(re.findall(r"(?m)^\s*//", raw)),
            datasets=";".join(sorted(set(re.findall(r"""ee\.(?:Image|ImageCollection|FeatureCollection)\(\s*["']([^"']+)""", raw)))),
            own_assets=";".join(sorted(set(re.findall(r"""["']((?:users/[^"']+|projects/[^"']+))["']""", raw)))),
            requires=";".join(sorted(set(re.findall(r"""require\(\s*["']([^"']+)""", raw)))),
            exports=len(re.findall(r"Export\.(?:image|table|video|map)", raw)),
            functions=len(re.findall(r"\bfunction\b", raw)),
            has_ui=int("ui." in raw), ml=int("ee.Classifier" in raw or "ee.Clusterer" in raw),
            secrets=int(bool(re.search(r"AIza[0-9A-Za-z_-]{20}|private_key|client_secret", raw))),
            raqba=int("raqba" in raw.lower()),
            hash=hashlib.sha1(norm.encode()).hexdigest()[:10], _norm=norm))
fields = [k for k in rows[0] if k != "_norm"]
with open(sys.argv[1], "w", newline="", encoding="utf8") as o:
    w = csv.DictWriter(o, fields, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
print("scripts", len(rows), Counter(r["root"] for r in rows), "lines", sum(r["lines"] for r in rows))
print("empty or tiny (<80 chars code):", [r["path"] for r in rows if r["code_chars"] < 80])
g = defaultdict(list)
for r in rows:
    g[r["hash"]].append(r["root"][:5] + ":" + r["path"])
ex = [v for v in g.values() if len(v) > 1]
print("exact duplicate groups", len(ex), "extra copies", sum(len(v) - 1 for v in ex))
for v in ex[:15]:
    print("  ", v)
near = []
real = [r for r in rows if r["code_chars"] >= 300]
for i, a in enumerate(real):
    for b in real[i + 1:]:
        if a["hash"] == b["hash"] or not 0.6 < a["code_chars"] / b["code_chars"] < 1.67:
            continue
        s = difflib.SequenceMatcher(None, a["_norm"][:6000], b["_norm"][:6000], autojunk=False)
        if s.quick_ratio() > 0.85 and s.ratio() > 0.85:
            near.append((round(s.ratio(), 2), a["path"], b["path"]))
print("near duplicate pairs (>=85%)", len(near))
for n in sorted(near, reverse=True)[:45]:
    print("  ", n)
bad = [r["path"] for r in rows if re.search(r"[ ()]|copy|\d$|^test|Try|temp|new|final", Path(r["path"]).stem, re.I)]
print("awkward names", len(bad))
print("comment share: no comments", sum(r["comment_lines"] == 0 for r in rows), "| with functions", sum(r["functions"] > 0 for r in rows), "| with exports", sum(r["exports"] > 0 for r in rows), "| ui", sum(r["has_ui"] for r in rows), "| ml", sum(r["ml"] for r in rows))
print("raqba", [r["path"] for r in rows if r["raqba"]], "secrets", [r["path"] for r in rows if r["secrets"]])
print("requires", Counter(x for r in rows for x in r["requires"].split(";") if x).most_common(12))
print("top datasets", Counter(x for r in rows for x in r["datasets"].split(";") if x and not x.startswith(("users/", "projects/"))).most_common(14))
print("folders", Counter(r["root"][:5] + ":" + (r["path"].replace(chr(92), "/").split("/")[0] if "\\" in r["path"] or "/" in r["path"] else "(top)") for r in rows))
print("largest", sorted(((r["lines"], r["path"]) for r in rows), reverse=True)[:8])
