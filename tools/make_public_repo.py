"""Build the public Earth Engine repository: both accounts as one codebase, grouped by topic. Originals stay in the private backup.

    python make_public_repo.py <output folder>
"""
import csv
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

B = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1])
SRC = [B / "ahmadammargeo/GeospatialGeeks_scripts", B / "splashnetworkz/Learning_scripts"]
RULES = [("monsoon", r"^monsoon|Monthly Rainfall|^prec|Regional|southAsia"), ("third-pole", r"^thirdpole"), ("gedi-mangroves", r"^(Thesis|GEDI|Extract Samples)/|^agb|Thesis NDVI"),
         ("air-quality", r"^AirPolML/|AirQuality|NO2|GeoHealth"), ("land-cover", r"^LCnML/|LahoreLC|LC Indices|BillionTree|Irrigated|Greenness|VegArea|UrbanArea"), ("sar", r"^SARExperiments/|floodMapping|Ship Lines"),
         ("timelapse", r"^Timelapse/"), ("urban", r"Urbanization|Built Area|Nighttime|lahore|L8 LST|MODIS LST"), ("phd-building-energy", r"^PhD/"), ("water-quality", r"Water Quality|water mask"),
         ("preprocessing", r"Landsat|L5L8|L8_preprocess|Normalization|imNormalization|preprocessing|indices|Sentinel|PCA|GLCM|Spectral|DSM|Cloud")]
if OUT.exists():
    for x in OUT.iterdir():
        if x.name != ".git":
            shutil.rmtree(x) if x.is_dir() else x.unlink()
OUT.mkdir(parents=True, exist_ok=True)
rows, grp = [], defaultdict(list)
flags = []
for root in SRC:
    for f in sorted(root.rglob("*")):
        if not f.is_file() or f.name == "MANIFEST.csv":
            continue
        rel = f.relative_to(root).as_posix()
        topic = "general"
        for name, pat in RULES:
            if re.search(pat, rel):
                topic = name
                break
        if root.name.startswith("Learning") and topic == "general":
            topic = "learning"
        t = OUT / "scripts" / topic / rel.replace("/", "__")
        t.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, t)
        s = f.read_text(encoding="utf8", errors="replace")
        rows.append([topic, t.name, rel, root.name.replace("_scripts", "")])
        grp[topic].append(t.name)
        coords = len(re.findall(r"-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}", s))
        hits = re.findall(r"(?i)\b(UPRN|postcode|address|manuscript|unpublished|WWF|plot_?id|field ?plot)\b", s)
        if coords > 60 or hits:
            flags.append((rel, coords, Counter(h.lower() for h in hits).most_common(4)))
with (OUT / "MANIFEST.csv").open("w", newline="", encoding="utf8") as o:
    w = csv.writer(o); w.writerow(["topic", "file", "original_path", "origin"]); w.writerows(rows)
print(len(rows), {k: len(v) for k, v in grp.items()})
print("to review:")
for x in flags:
    print(" ", x)
print("asset paths:", Counter(a for r in SRC for f in r.rglob("*.js") for a in re.findall(r"""["'](users/[A-Za-z0-9_]+|projects/[a-z0-9-]+)""", f.read_text(encoding="utf8", errors="replace"))).most_common(10))
