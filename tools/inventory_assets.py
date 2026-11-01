"""List every Earth Engine asset under the given roots, recursively, with type, size and dates. Read-only.

    python inventory_assets.py <cloud project> <output.csv> <root> [<root> ...]
"""
import csv
import sys

import ee


def walk(root):
    token = None
    while True:
        params = {"pageSize": 1000}
        if token:
            params["pageToken"] = token
        reply = ee.data.listAssets({"parent": root, **params})
        for asset in reply.get("assets", []):
            yield asset
            if asset["type"] in ("FOLDER", "IMAGE_COLLECTION"):
                yield from walk(asset["name"])
        token = reply.get("nextPageToken")
        if not token:
            return


def main(project, out, *roots):
    ee.Initialize(project=project)
    totals = {}
    with open(out, "w", newline="", encoding="utf8") as f:
        w = csv.writer(f)
        w.writerow(["path", "type", "bytes", "features", "updated"])
        for root in roots:
            for a in walk(root):
                size, feats = "", ""
                if a["type"] != "FOLDER":
                    try:
                        m = ee.data.getAsset(a["name"])
                        size = m.get("sizeBytes", "")
                        feats = m.get("featureCount", "")
                    except ee.EEException as e:
                        size = f"error: {e}"
                w.writerow([a.get("id", a["name"]), a["type"], size, feats, a.get("updateTime", "")])
                t = totals.setdefault(a["type"], [0, 0])
                t[0] += 1
                t[1] += int(size) if str(size).isdigit() else 0
                print(a["type"][:6], a.get("id", a["name"]), size, flush=True)
    print("TOTALS")
    for k, (n, b) in totals.items():
        print(k, n, f"{b / 1e9:.2f} GB")


if __name__ == "__main__":
    main(*sys.argv[1:])
