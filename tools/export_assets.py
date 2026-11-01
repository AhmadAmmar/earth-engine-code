"""Back up the assets listed in an inventory to Google Drive. Originals in Earth Engine are not changed.

Rasters export as GeoTIFF on their own grid (native CRS and transform), tables as GeoJSON. Metadata for every asset is
saved locally, and export_log.csv records each task, so a rerun skips what has already been started.

    python export_assets.py <cloud project> <inventory.csv> <output folder> <drive folder>          dry run: only checks and prints
    python export_assets.py <cloud project> <inventory.csv> <output folder> <drive folder> --start  starts the tasks
"""
import csv
import json
import re
import sys
from pathlib import Path

import ee


def name_for(path):
    short = re.sub(r"^projects/[^/]+/assets/|^users/[^/]+/", "", path)
    return re.sub(r"[^A-Za-z0-9_-]+", "__", short)


def image_task(path, name, folder):
    image = ee.Image(path)
    info = image.getInfo()
    bands = info["bands"]
    grids = {(b.get("crs"), tuple(b.get("crs_transform", [])), tuple(b.get("dimensions", []))) for b in bands}
    if len(grids) > 1:
        raise ValueError(f"bands use {len(grids)} different grids")
    b = bands[0]
    if "dimensions" not in b:
        raise ValueError("image has no fixed extent")
    w, h = b["dimensions"]
    origin = b.get("origin", [0, 0])
    a, bb, c, d, e, f = b["crs_transform"]
    transform = [a, bb, c + a * origin[0] + bb * origin[1], d, e, f + d * origin[0] + e * origin[1]]
    return ee.batch.Export.image.toDrive(image=image, description=name[:100], folder=folder, fileNamePrefix=name, crs=b["crs"],
                                         crsTransform=transform, dimensions=f"{w}x{h}", maxPixels=1e13, fileFormat="GeoTIFF",
                                         formatOptions={"cloudOptimized": True}), info


def table_task(path, name, folder):
    table = ee.FeatureCollection(path)
    return ee.batch.Export.table.toDrive(collection=table, description=name[:100], folder=folder, fileNamePrefix=name, fileFormat="GeoJSON"), ee.data.getAsset(path)


def main(project, inventory, out, folder, *flags):
    start = "--start" in flags
    ee.Initialize(project=project)
    out = Path(out)
    meta = out / "metadata"
    meta.mkdir(parents=True, exist_ok=True)
    log = out / "export_log.csv"
    done = {r["path"] for r in csv.DictReader(log.open(encoding="utf8"))} if log.exists() else set()
    rows = [r for r in csv.DictReader(open(inventory, encoding="utf8")) if r["type"] in ("IMAGE", "TABLE")]
    new = not log.exists()
    problems = 0
    with log.open("a", newline="", encoding="utf8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["path", "type", "file", "task_id"])
        for r in rows:
            if r["path"] in done:
                continue
            name = name_for(r["path"])
            try:
                task, info = (image_task if r["type"] == "IMAGE" else table_task)(r["path"], name, folder)
                (meta / f"{name}.json").write_text(json.dumps(info, indent=1, default=str), encoding="utf8")
                if start:
                    task.start()
                    w.writerow([r["path"], r["type"], name, task.id])
                    f.flush()
                print("started" if start else "ok", r["type"], name, flush=True)
            except Exception as e:
                problems += 1
                print("PROBLEM", r["path"], e, flush=True)
    print(f"{len(rows)} assets, {problems} problems, {'tasks started' if start else 'dry run: nothing exported'}")


if __name__ == "__main__":
    main(*sys.argv[1:])
