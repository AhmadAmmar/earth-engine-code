"""Copy every script from a cloned Earth Engine repository's history into a readable folder, without checking it out.

Names Windows cannot hold (trailing spaces or dots, reserved characters) are made safe; MANIFEST.csv maps every
file back to its original name and hash. The clone itself stays untouched as the original.

    python export_scripts.py <clone folder> <output folder>
"""
import csv
import re
import subprocess
import sys
from pathlib import Path


def safe(part):
    return re.sub(r'[<>:"\\|?*]', "_", part).rstrip(" .") or "_"


def main(repo, out):
    repo, out = Path(repo), Path(out)
    git = ["git", "-C", str(repo), "-c", "core.quotepath=off"]
    head = subprocess.run(git + ["rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    listing = subprocess.run(git + ["ls-tree", "-r", "-z", head], capture_output=True, check=True).stdout.decode("utf8")
    rows, seen = [], set()
    for entry in filter(None, listing.split("\0")):
        meta, name = entry.split("\t", 1)
        _, kind, sha = meta.split()
        if kind != "blob":
            continue
        rel = "/".join(safe(p) for p in name.split("/"))
        if not Path(rel).suffix:
            rel += ".js"
        base, n = rel, 2
        while rel.lower() in seen:
            rel = f"{Path(base).with_suffix('')}_{n}{Path(base).suffix}"
            n += 1
        seen.add(rel.lower())
        data = subprocess.run(git + ["cat-file", "blob", sha], capture_output=True, check=True).stdout
        target = out / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        rows.append(dict(original=name, exported=rel, blob=sha, bytes=len(data)))
    with (out / "MANIFEST.csv").open("w", newline="", encoding="utf8") as f:
        w = csv.DictWriter(f, ["original", "exported", "blob", "bytes"])
        w.writeheader()
        w.writerows(rows)
    print(head[:10], "files", len(rows), "renamed for Windows", sum(r["original"] != r["exported"][:-3] and r["original"] != r["exported"] for r in rows))


if __name__ == "__main__":
    main(*sys.argv[1:3])
