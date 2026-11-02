"""Give every public script a name that says what it does. Rerun after make_public_repo.py.

Names come from the explicit map below, otherwise from the old name in lower snake case. Empty scripts are removed here;
they remain in the private backup. renames.csv records old and new, and the Earth Engine repositories are not touched.
"""
import csv
import re
import subprocess
from pathlib import Path

R = Path(__file__).resolve().parent.parent
S = R / "scripts"
MAP = {
    "third-pole/thirdpole.js": "third-pole/domain_boundary_dem_slope.js",
    "third-pole/thirdpole2.js": "third-pole/domain_boundary_variants.js",
    "third-pole/thirdpole3.js": "third-pole/snow_trends_mod10a2_first_pass.js",
    "third-pole/thirdpole4.js": "third-pole/snow_trends_mod10a2_charts_first.js",
    "third-pole/thirdpole5.js": "third-pole/snow_8day_core_export.js",
    "monsoon/monsoon.js": "monsoon/rainfall_enso_iod_analysis.js",
    "monsoon/monsoon2.js": "monsoon/rainfall_enso_iod_monthly_table.js",
    "monsoon/monsoon3.js": "monsoon/circulation_indices.js",
    "monsoon/monsoon4.js": "monsoon/land_surface_cryosphere_indices.js",
    "monsoon/monsoon5.js": "monsoon/ocean_convection_aerosol_indices.js",
    "monsoon/monsoon6.js": "monsoon/predictors_update_2026.js",
    "monsoon/monsoon8.js": "monsoon/core_reexport_corrected.js",
    "monsoon/monsoon9.js": "monsoon/core_chirps_corrected_regions.js",
    "monsoon/monsoon11.js": "monsoon/ocean_regions_missing_families.js",
    "monsoon/monsoon12.js": "monsoon/chirps_refresh_2026.js",
    "monsoon/Monthly Rainfall.js": "monsoon/islamabad_rainfall_monthly_chirps.js",
    "monsoon/prec.js": "monsoon/twin_cities_rainfall_chirps_pentad.js",
    "monsoon/prec2.js": "land-cover/vegetation_gimms_3g.js",
    "monsoon/Regional Monthly 3.js": "air-quality/no2_districts_monthly.js",
    "monsoon/Regional Multi-Yearly Monthly Mean.js": "air-quality/no2_provinces_multiyear_monthly_mean.js",
    "monsoon/Regional Yearly Monthly Means 2.js": "air-quality/no2_provinces_yearly_monthly_means.js",
    "monsoon/southAsia.js": "monsoon/south_asia_heatwave_2026.js",
    "gedi-mangroves/GEDI__GEDI2.js": "gedi-mangroves/gedi_l2a_canopy_height.js",
    "gedi-mangroves/GEDI__GEDI3.js": "gedi-mangroves/gedi_l2a_indus_export.js",
    "gedi-mangroves/GEDI__GEDI4.js": "gedi-mangroves/gedi_dem_transect_comparison.js",
    "air-quality/AirPolML__AQ1.js": "air-quality/ch4_lahore.js",
    "air-quality/AirPolML__AQ3.js": "air-quality/no2_lahore.js",
    "general/Assignment4.js": "general/water_forest_landsat_assignment.js",
    "learning/Assignment4.js": "learning/water_forest_landsat_assignment.js",
    "general/GEE Final.js": "land-cover/ajk_land_cover_course_final.js",
    "general/GEE Final2.js": "land-cover/ajk_land_cover_course_final_points.js",
    "general/Hobby__S2.js": "general/islamabad_sentinel_export.js",
    "land-cover/BillionTree2.js": "land-cover/billion_tree_sentinel2.js",
    "land-cover/Greenness1.js": "land-cover/greenness_landsat_multisensor.js",
    "land-cover/Greenness3.js": "land-cover/greenness_modis_districts.js",
    "learning/1.js": "learning/landsat8_first_steps.js",
    "preprocessing/L5L8.js": "preprocessing/landsat5_8_pakistan.js",
    "urban/L8 LST 1.js": "urban/landsat8_lst_pakistan.js",
    "urban/lahoreEra5.js": "urban/lahore_era5land_tmax_1950_present.js",
    "urban/lahoreTmaxEra5.js": "urban/lahore_era5land_tmax_1979_present.js",
}


def tidy(rel):
    folder, name = rel.split("/", 1)
    stem = name[:-3]
    stem = re.sub(r"^[^_]*?__(Final - )?", "thesis_" if name.startswith("Thesis__") else "", stem)
    stem = re.sub(r"\(copy\)|\(complete\)", "", stem)
    stem = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", stem)
    stem = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_").lower()
    return f"{folder}/{stem}.js"


def main():
    rows, used = [], set()
    for p in sorted(S.rglob("*.js")):
        rel = p.relative_to(S).as_posix()
        if not p.read_text(encoding="utf8", errors="replace").strip():
            subprocess.run(["git", "rm", "-q", "-f", str(p)], cwd=R, check=True)
            rows.append((rel, "removed: empty"))
            continue
        new = MAP.get(rel, tidy(rel))
        if new in used:
            raise SystemExit(f"clash: {new}")
        used.add(new)
        if new != rel:
            (S / new).parent.mkdir(exist_ok=True)
            tmp = p.with_name(p.name + ".tmp")  # two steps, as Windows ignores case in names
            subprocess.run(["git", "mv", "-f", str(p), str(tmp)], cwd=R, check=True)
            subprocess.run(["git", "mv", "-f", str(tmp), str(S / new)], cwd=R, check=True)
        rows.append((rel, new))
    with open(R / "renames.csv", "w", newline="", encoding="utf8") as f:
        w = csv.writer(f)
        w.writerow(["old", "new"])
        w.writerows(rows)
    print(len(rows), "scripts;", sum(r[0] != r[1] for r in rows), "changed")
    left = [n for _, n in rows if re.search(r"\d\.js$", n)]
    print("still ending in a digit:", left)


if __name__ == "__main__":
    main()
