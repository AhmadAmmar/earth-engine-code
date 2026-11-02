/* =============================================================================
 *  THIRD POLE / HIGH MOUNTAIN ASIA  --  SNOW COVER AREA & TRENDS
 *  Google Earth Engine (JavaScript API)  --  script v1, "first pass"
 * -----------------------------------------------------------------------------
 *  PURPOSE
 *    The minimum set of numbers + rasters needed for an article answering
 *    WHERE / WHEN / HOW MUCH snow cover is changing across the Third Pole,
 *    for four nested cuts of the region:
 *        1. the whole Third Pole domain
 *        2. mountain ranges  (Hindu Kush, Karakoram, Himalaya W/C/E, Pamir,
 *           Tien Shan, Kunlun, Qilian, Hengduan, inner Tibetan Plateau)
 *        3. countries        (with the disputed Kashmir region handled explicitly)
 *        4. river basins     (HydroSHEDS / HydroBASINS)
 *
 *  DATA
 *    MODIS/061/MOD10A2 -- Terra Snow Cover, 8-Day L3 Global, 500 m
 *      2000-02-18 -> present. Band Maximum_Snow_Extent, class values:
 *        0 missing | 1 no decision | 11 night | 25 no snow | 37 lake
 *        39 ocean  | 50 cloud      | 100 lake ice | 200 SNOW | 254 saturated
 *      This is the ready-made snow product. The 8-day compositing is what makes
 *      MODIS usable in the Himalaya, where >50% of daily scenes are clouded.
 *    ECMWF/ERA5_LAND/MONTHLY_AGGR -- optional, section 10
 *      snow_cover, 1950 -> present, ~11 km. Coarse and model-based, but the
 *      only way to put the 2000-2026 satellite record in a 75-year context.
 *
 *  UNITS (what this field actually uses)
 *    SCA  snow cover area                   km^2
 *    SCE / fSCA  snow cover extent          % of the region's land area
 *    SCF  snow cover frequency              fraction 0-1 of CLEAR-SKY composites
 *                                           classed as snow
 *    SCD  snow cover duration               days per season / per year
 *    trend                                  %/decade  and  days/decade
 *
 *  TIME
 *    Water year (snow year) = 1 Oct -> 30 Sep, labelled by the ENDING year.
 *    WY2001 = Oct 2000 - Sep 2001. Seasons = the four quarters of the water
 *    year (see SEASONS); a DJF/MAM/JJA/SON preset is commented underneath.
 *
 *  OUTPUTS (Google Drive folder GDRIVE_FOLDER)
 *    A. tp_regions_v1                     region polygons (EE asset + GeoJSON)
 *    B. tp_sca_8day_v1.csv                8-day SCA per region  (master series)
 *    C. tp_sca_seasonal_v1.csv            seasonal SCA / SCD per region
 *    D. tp_trend_<SEASON>_v1.tif          per-pixel Sen slope + Mann-Kendall
 *    E. tp_scf_pct_WY####_v1.tif          seasonal SCF rasters (maps + GIF)
 *    F. tp_era5_snowcover_monthly_v1.csv  1950-present context series
 *
 *  Blocks marked  >>> CHECK <<<  print something to the Console. Eyeball those
 *  once before launching the big exports.
 * ========================================================================== */


/* =============================================================================
 * 0. CONFIG
 * ========================================================================== */

var GDRIVE_FOLDER = 'third_pole_snow';
var ASSET_ROOT    = 'projects/YOUR-PROJECT/assets';   // <-- edit once

// ---- time -------------------------------------------------------------------
var WY_START       = 2001;   // first COMPLETE water year (Oct 2000 - Sep 2001)
var WY_END         = 2025;   // last  COMPLETE water year (Oct 2024 - Sep 2025)
var WY_MONTH_START = 10;     // water year begins 1 October

var SEASONS = [
  {name: 'OND', months: [10, 11, 12], label: 'Oct-Dec  accumulation onset'},
  {name: 'JFM', months: [ 1,  2,  3], label: 'Jan-Mar  winter maximum'},
  {name: 'AMJ', months: [ 4,  5,  6], label: 'Apr-Jun  pre-monsoon melt'},
  {name: 'JAS', months: [ 7,  8,  9], label: 'Jul-Sep  monsoon / summer minimum'}
];
// Alternative preset (also set WY_MONTH_START = 12):
// var SEASONS = [
//   {name:'DJF', months:[12,1,2]}, {name:'MAM', months:[3,4,5]},
//   {name:'JJA', months:[6,7,8]},  {name:'SON', months:[9,10,11]}
// ];

var ANNUAL       = {name: 'WY', months: null, label: 'full water year Oct-Sep'};
var PEAK_SEASON  = SEASONS[1];      // the season used for quick-look figures

// ---- domain -----------------------------------------------------------------
var ELEV_MIN = 1500;                // m; the usual HKH/HMA floor. Try 2000 m as
                                    // a sensitivity test.
var DEM_ID   = 'MERIT/DEM/v1_0_3';
var DEM_BAND = 'dem';
// alternatives: 'USGS/SRTMGL1_003' band 'elevation' (<=60N)
//               'USGS/GMTED2010'   band 'be75'      (coarse, fast)

var MASK_PERMANENT_WATER = true;    // drop big lakes: frozen Tibetan lakes would
                                    // otherwise be counted as snow
var MASK_GLACIERS        = false;   // true -> remove perennial ice (GLIMS) and
                                    // report SEASONAL snow only

// ---- snow -------------------------------------------------------------------
var MIN_CLEAR_COMPOSITES = 4;       // per season (of ~11-12) for a valid pixel
var PERSIST_THRESH       = 0.5;     // SCF >= this -> "snow-covered season" (binary map)

// ---- scales (m) -------------------------------------------------------------
var TS_SCALE      = 500;    // 8-day regional series. 1000 is ~4x faster and
                            // costs <2% on regional area totals.
var SEAS_SCALE    = 500;    // seasonal regional table
var MAP_SCALE     = 1000;   // exported seasonal rasters
var TREND_SCALE   = 2000;   // exported trend rasters
var PREVIEW_SCALE = 5000;   // in-editor preview chart only

// ---- boundaries -------------------------------------------------------------
var GAUL_ID  = 'FAO/GAUL_SIMPLIFIED_500m/2015/level0';
var GAUL1_ID = 'FAO/GAUL_SIMPLIFIED_500m/2015/level1';
// FAO GAUL is used ON PURPOSE. It carries the whole disputed Kashmir region as
// its own ADM0 unit ("Jammu and Kashmir"), plus "Aksai Chin", instead of
// splitting them between India / Pakistan / China. So
//   (a) no mountain area is silently dropped from the regional total, and
//   (b) the map is not implicitly publishing a territorial claim.
// 'USDOS/LSIB_SIMPLE/2017' (property 'country_na') is the de-facto alternative;
// section 2c gives a de-facto Kashmir split if the story needs one.
var MIN_COUNTRY_AREA_KM2 = 250;     // drop slivers

var HYBAS_LEVEL = 5;                // HydroBASINS level used to rebuild basins

// ---- what to run ------------------------------------------------------------
var REGIONS_ASSET         = '';     // paste your exported asset ID here after
                                    // run 1; makes everything else much faster
var EXPORT_REGIONS        = true;   // A
var EXPORT_8DAY_TABLE     = false;  // B  <-- the big one; turn on for run 3
var EXPORT_SEASONAL_TABLE = true;   // C
var EXPORT_TRENDS         = true;   // D
var EXPORT_SCF_RASTERS    = false;  // E  <-- 25 tasks; turn on for run 4
var EXPORT_ERA5           = true;   // F

var SHOW_MAP_LAYERS = true;
var SHOW_ANIMATION  = true;
var ANIM_MODE       = 'PEAK';       // 'PEAK' = 1 frame/year for PEAK_SEASON
                                    // 'ALL'  = 4 frames/year (annual cycle)
var PREVIEW_CHART   = true;         // coarse in-editor trend chart


/* =============================================================================
 * 1. DOMAIN -- the Third Pole as a union of named sub-regions
 * -----------------------------------------------------------------------------
 *  There is no official "Third Pole" FeatureCollection in the EE catalog, so:
 *        domain = (union of the boxes below)  AND  (elevation >= ELEV_MIN)
 *  Boxes are cut in the listed ORDER, so an earlier range wins where two
 *  overlap. They are a deliberate first approximation. For publication, swap in
 *  an uploaded asset and set DOMAIN_GEOM / rangeFeats from it:
 *      - ICIMOD HKH / HIMAP boundary (rds.icimod.org)
 *      - GMBA Mountain Inventory v2  (mirrored in the awesome-gee-community-catalog)
 *      - RGI 7.0 first-order regions 13 / 14 / 15
 *  Everything downstream is written against DOMAIN_GEOM and REGIONS only.
 * ========================================================================== */

var RANGE_BOXES = [
  // name                    [west, south, east, north]
  ['Karakoram',              [73.8, 34.6,  78.6, 36.8]],
  ['Hindu Kush',             [66.5, 33.5,  73.8, 37.6]],
  ['Pamir & Hissar-Alay',    [67.0, 36.8,  75.5, 40.6]],
  ['Tien Shan',              [67.0, 40.6,  95.0, 45.5]],
  ['Kunlun & Altyn Tagh',    [74.0, 35.0,  95.0, 40.0]],
  ['Qilian Shan',            [93.0, 35.5, 104.5, 40.5]],
  ['Western Himalaya',       [73.0, 29.5,  81.5, 35.5]],
  ['Central Himalaya',       [81.5, 27.0,  88.5, 32.5]],
  ['Eastern Himalaya',       [88.5, 25.5,  97.5, 31.0]],
  ['Hengduan Shan',          [96.0, 22.0, 104.5, 33.5]],
  ['Inner Tibetan Plateau',  [77.0, 27.0,  97.0, 36.5]]
];

function rect(b) { return ee.Geometry.Rectangle(b, null, false); }

var rangeFeats = [];
var consumed   = null;
RANGE_BOXES.forEach(function (rb) {
  var box = rect(rb[1]);
  var g   = (consumed === null) ? box : box.difference(consumed, 1000);
  consumed = (consumed === null) ? box : consumed.union(box, 1000);
  rangeFeats.push(ee.Feature(g, {unit: rb[0], level: 'range'}));
});

var DOMAIN_GEOM = consumed;
var DOMAIN_BBOX = DOMAIN_GEOM.bounds();
var DOMAIN_FEAT = ee.Feature(DOMAIN_GEOM, {unit: 'Third Pole (HMA)', level: 'domain'});


/* =============================================================================
 * 2. MASKS AND PER-PIXEL AREA
 * ========================================================================== */

var DEM = ee.Image(DEM_ID).select(DEM_BAND);
var mtn = DEM.gte(ELEV_MIN);

if (MASK_PERMANENT_WATER) {
  var water = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
                .select('occurrence').unmask(0).gte(50);
  mtn = mtn.and(water.not());
}

if (MASK_GLACIERS) {
  var glaciers = ee.FeatureCollection('GLIMS/current').filterBounds(DOMAIN_BBOX);
  var gice = ee.Image().byte().paint(glaciers, 1).unmask(0);
  mtn = mtn.and(gice.not());
}

var DOMAIN_MASK = mtn.selfMask().rename('domain');
var AREA_KM2    = ee.Image.pixelArea().divide(1e6)
                    .updateMask(DOMAIN_MASK).rename('land_km2');


/* =============================================================================
 * 2b. COUNTRIES -- disputed-territory safe
 * ========================================================================== */

var gaul     = ee.FeatureCollection(GAUL_ID);
var gaulInTP = gaul.filterBounds(DOMAIN_GEOM);

// >>> CHECK <<< You should see 'Jammu and Kashmir' and 'Aksai Chin' as their own
// units. Units are picked up by AREA, not by a hardcoded name list, so a
// different naming in your GAUL copy does not break anything.
print('2b >>> CHECK <<< ADM0 units intersecting the domain:',
      gaulInTP.aggregate_array('ADM0_NAME').distinct().sort());

var countryFeats = gaulInTP.map(function (f) {
  var g = f.geometry().intersection(DOMAIN_GEOM, 2000);
  return ee.Feature(g, {
    unit    : f.get('ADM0_NAME'),
    level   : 'country',
    area_km2: g.area(2000).divide(1e6)
  });
}).filter(ee.Filter.gt('area_km2', MIN_COUNTRY_AREA_KM2));


/* =============================================================================
 * 2c. OPTIONAL -- de-facto view of the Kashmir region
 * -----------------------------------------------------------------------------
 *  Default (2b) reports "Jammu and Kashmir" as ONE unit spanning Indian-
 *  administered J&K + Ladakh AND Pakistan-administered Gilgit-Baltistan + AJK.
 *  That is the neutral, complete-coverage option, and it is what the CSV holds.
 *  If the article also needs a de-facto split: run the print below once, copy
 *  the ADM1 names into the two lists, set SPLIT_KASHMIR = true. The extra rows
 *  come out at level = 'country_defacto' so they never double-count with 'country'.
 * ========================================================================== */

var SPLIT_KASHMIR = false;

var gaul1  = ee.FeatureCollection(GAUL1_ID);
var jkAdm1 = gaul1.filter(ee.Filter.stringContains('ADM0_NAME', 'Kashmir'));
print('2c >>> CHECK <<< ADM1 units inside GAUL "Jammu and Kashmir":',
      jkAdm1.aggregate_array('ADM1_NAME').distinct().sort());

var KASHMIR_PAK_ADMIN = ['Gilgit', 'Baltistan', 'Muzaffarabad', 'Punch', 'Mirpur'];
var KASHMIR_IND_ADMIN = ['Srinagar', 'Anantnag', 'Badgam', 'Baramula', 'Doda',
                         'Jammu', 'Kargil', 'Kathua', 'Kupwara', 'Ladakh',
                         'Leh (Ladakh)', 'Pulwama', 'Rajouri', 'Udhampur'];

if (SPLIT_KASHMIR) {
  var kashmirSide = function (names, label) {
    var g = jkAdm1.filter(ee.Filter.inList('ADM1_NAME', names))
                  .geometry(2000).intersection(DOMAIN_GEOM, 2000);
    return ee.Feature(g, {unit: label, level: 'country_defacto',
                          area_km2: g.area(2000).divide(1e6)});
  };
  countryFeats = countryFeats.merge(ee.FeatureCollection([
    kashmirSide(KASHMIR_PAK_ADMIN, 'Kashmir (Pakistan-administered)'),
    kashmirSide(KASHMIR_IND_ADMIN, 'Kashmir (India-administered)')
  ]));
}


/* =============================================================================
 * 2d. RIVER BASINS -- HydroSHEDS / HydroBASINS
 * -----------------------------------------------------------------------------
 *  Each named basin is rebuilt by (i) finding the HydroBASINS unit containing a
 *  seed point on the main stem, (ii) taking every unit sharing its MAIN_BAS id
 *  (= the whole river system), (iii) clipping to the mountain domain.
 *
 *  Known limitation: the Ganges and Brahmaputra merge before the sea, so they
 *  share one MAIN_BAS and come out as a single "Ganges-Brahmaputra" unit. For a
 *  first article that is fine -- GBM is a standard reporting unit. To split
 *  them, list the level-4 sub-units inside that MAIN_BAS, pick the two HYBAS_IDs
 *  off the map, and hardcode them.
 * ========================================================================== */

var hybas = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_' + HYBAS_LEVEL);

var BASIN_SEEDS = [
  ['Indus',                 [ 68.50, 27.50]],
  ['Ganges-Brahmaputra',    [ 89.50, 24.00]],
  ['Amu Darya',             [ 67.20, 37.30]],
  ['Syr Darya',             [ 69.50, 40.50]],
  ['Tarim (endorheic)',     [ 82.00, 41.00]],
  ['Helmand (endorheic)',   [ 64.00, 31.00]],
  ['Issyk-Kul (endorheic)', [ 77.00, 42.30]],
  ['Qaidam (endorheic)',    [ 95.50, 37.20]],
  ['Yellow (Huang He)',     [110.00, 37.50]],
  ['Yangtze',               [110.00, 30.00]],
  ['Mekong',                [103.00, 15.00]],
  ['Salween',               [ 97.50, 18.00]],
  ['Irrawaddy',             [ 95.30, 21.50]]
];

function basinFromSeed(name, lonlat) {
  var pt    = ee.Geometry.Point(lonlat);
  var seed  = ee.Feature(hybas.filterBounds(pt).first());
  var mb    = seed.get('MAIN_BAS');
  var parts = hybas.filter(ee.Filter.eq('MAIN_BAS', mb)).filterBounds(DOMAIN_GEOM);
  var g     = parts.geometry(2000).intersection(DOMAIN_GEOM, 2000);
  return ee.Feature(g, {unit: name, level: 'basin',
                        area_km2: g.area(2000).divide(1e6)});
}

var basinFeats = ee.FeatureCollection(BASIN_SEEDS.map(function (b) {
  return basinFromSeed(b[0], b[1]);
}));

// remainder = the many small endorheic basins of the interior plateau
var otherBasinGeom = DOMAIN_GEOM.difference(basinFeats.geometry(2000), 2000);
basinFeats = basinFeats.merge(ee.FeatureCollection([
  ee.Feature(otherBasinGeom, {unit: 'Other endorheic (inner plateau)',
                              level: 'basin',
                              area_km2: otherBasinGeom.area(2000).divide(1e6)})
]));

// >>> CHECK <<< A basin that comes back tiny means its seed point missed the
// main stem; nudge the coordinates and re-run.
print('2d >>> CHECK <<< basin area inside the domain (km2):',
      basinFeats.aggregate_array('unit'),
      basinFeats.aggregate_array('area_km2'));


/* =============================================================================
 * 2e. ASSEMBLE THE REGION COLLECTION
 * ========================================================================== */

var REGIONS = ee.FeatureCollection([DOMAIN_FEAT])
  .merge(ee.FeatureCollection(rangeFeats))
  .merge(countryFeats)
  .merge(basinFeats);

// normalise the schema (mixed property sets break table-to-asset exports)
REGIONS = REGIONS.map(function (f) {
  return ee.Feature(f.geometry(), {
    unit : f.get('unit'),
    level: f.get('level')
  });
});

// attach each region's constant mountain-domain land area
REGIONS = AREA_KM2.reduceRegions({
  collection: REGIONS,
  reducer   : ee.Reducer.sum().setOutputs(['land_km2']),
  scale     : SEAS_SCALE,
  tileScale : 4
});

if (EXPORT_REGIONS && REGIONS_ASSET === '') {
  Export.table.toAsset({
    collection : REGIONS,
    description: 'tp_regions_v1_asset',
    assetId    : ASSET_ROOT + '/tp_regions_v1'
  });
  Export.table.toDrive({
    collection    : REGIONS,
    description   : 'tp_regions_v1_geojson',
    folder        : GDRIVE_FOLDER,
    fileNamePrefix: 'tp_regions_v1',
    fileFormat    : 'GeoJSON'
  });
}

// After run 1, paste the asset ID into REGIONS_ASSET: every later step then
// reads finished polygons instead of re-running all the geometry operations.
if (REGIONS_ASSET !== '') { REGIONS = ee.FeatureCollection(REGIONS_ASSET); }


/* =============================================================================
 * 3. SNOW COLLECTION + PER-COMPOSITE CLASS / AREA BANDS
 * ========================================================================== */

var T0 = ee.Date.fromYMD(WY_START - 1, WY_MONTH_START, 1);
var T1 = ee.Date.fromYMD(WY_END,       WY_MONTH_START, 1);

var SNOW = ee.ImageCollection('MODIS/061/MOD10A2')
             .select('Maximum_Snow_Extent')
             .filterDate(T0, T1);

print('3 >>> CHECK <<< 8-day composites in the record (expect ~' +
      ((WY_END - WY_START + 1) * 46) + '):', SNOW.size());

/** snow / no-snow / cloud / clear indicator bands, 0-1 float */
function classBands(img) {
  var m      = img.select('Maximum_Snow_Extent').unmask(0);
  var snow   = m.eq(200);
  var nosnow = m.eq(25);
  var cloud  = m.eq(50);
  return ee.Image(
    ee.Image.cat([
      snow.rename('snow'),
      nosnow.rename('nosnow'),
      cloud.rename('cloud'),
      snow.or(nosnow).rename('clear')
    ]).toFloat().copyProperties(img, ['system:time_start'])
  );
}

/** the same, as km^2 per pixel inside the mountain domain */
function areaBands(img) {
  var c = classBands(img);
  return ee.Image(
    ee.Image.cat([
      c.select('snow').multiply(AREA_KM2).rename('snow_km2'),
      c.select('nosnow').multiply(AREA_KM2).rename('nosnow_km2'),
      c.select('cloud').multiply(AREA_KM2).rename('cloud_km2')
    ]).copyProperties(img, ['system:time_start'])
  );
}


/* =============================================================================
 * 4. EXPORT B -- 8-DAY SNOW COVER AREA PER REGION  (the master time series)
 * -----------------------------------------------------------------------------
 *  One row per (8-day composite x region):
 *      land_km2    mountain-domain land area of the region  (constant)
 *      snow_km2    area classed SNOW
 *      nosnow_km2  area classed NO SNOW
 *      cloud_km2   area still cloud-obscured after 8-day compositing
 *  Then, in Python:
 *      clear_km2 = snow_km2 + nosnow_km2
 *      obs_frac  = clear_km2 / land_km2                  <- quality filter
 *      sca_km2   = land_km2 * snow_km2 / clear_km2       <- cloud-corrected SCA
 *                  (clear-sky extrapolation, the standard correction)
 *      sce_pct   = 100 * sca_km2 / land_km2
 *  Seasonal mean / min / max are then groupby operations on this one table,
 *  and you can redefine seasons later without touching Earth Engine again.
 * ========================================================================== */

function eightDayStatsForWY(wy) {
  var s = ee.Date.fromYMD(wy - 1, WY_MONTH_START, 1);
  var c = SNOW.filterDate(s, s.advance(1, 'year'));
  var fcs = c.toList(c.size()).map(function (im) {
    im = ee.Image(im);
    var d = ee.Date(im.get('system:time_start'));
    return areaBands(im).reduceRegions({
      collection: REGIONS,
      reducer   : ee.Reducer.sum(),
      scale     : TS_SCALE,
      tileScale : 4
    }).map(function (f) {
      return f.set({wy   : wy,
                    date : d.format('YYYY-MM-dd'),
                    year : d.get('year'),
                    month: d.get('month'),
                    doy  : d.getRelative('day', 'year').add(1)});
    });
  });
  return ee.FeatureCollection(fcs).flatten();
}

if (EXPORT_8DAY_TABLE) {
  var wyListA = [];
  for (var wyA = WY_START; wyA <= WY_END; wyA++) { wyListA.push(wyA); }

  var ts8 = ee.FeatureCollection(wyListA.map(eightDayStatsForWY)).flatten();

  Export.table.toDrive({
    collection    : ts8,
    description   : 'tp_sca_8day_v1',
    folder        : GDRIVE_FOLDER,
    fileNamePrefix: 'tp_sca_8day_v1',
    fileFormat    : 'CSV',
    selectors     : ['unit', 'level', 'wy', 'date', 'year', 'month', 'doy',
                     'land_km2', 'snow_km2', 'nosnow_km2', 'cloud_km2']
  });
}


/* =============================================================================
 * 5. SEASONAL SNOW COVER FREQUENCY (SCF) -- the raster workhorse
 * ========================================================================== */

/** date window for a season inside a water year (months === null -> whole WY) */
function seasonWindow(wy, s) {
  if (s.months === null) {
    var a0 = ee.Date.fromYMD(wy - 1, WY_MONTH_START, 1);
    return {start: a0, end: a0.advance(1, 'year')};
  }
  var m0 = s.months[0];
  var cy = (m0 >= WY_MONTH_START) ? (wy - 1) : wy;
  var st = ee.Date.fromYMD(cy, m0, 1);
  return {start: st, end: st.advance(s.months.length, 'month')};
}

/**
 * SCF = (# composites classed snow) / (# composites classed snow OR no-snow).
 * Cloud-robust: cloud is excluded from the denominator rather than counted as
 * snow-free. Pixels with too few clear composites are masked.
 * Returns bands: scf (0-1), nclear (count).
 */
function seasonalSCF(wy, s) {
  var w      = seasonWindow(wy, s);
  var c      = SNOW.filterDate(w.start, w.end).map(classBands);
  var nSnow  = c.select('snow').sum();
  var nClear = c.select('clear').sum();
  var scf    = nSnow.divide(nClear)
                 .updateMask(nClear.gte(MIN_CLEAR_COMPOSITES))
                 .updateMask(DOMAIN_MASK)
                 .rename('scf');
  return scf.addBands(nClear.rename('nclear'))
            .set({wy: wy, season: s.name,
                  season_days: w.end.difference(w.start, 'day')});
}


/* =============================================================================
 * 6. EXPORT C -- SEASONAL SCA / SCD PER REGION
 * -----------------------------------------------------------------------------
 *  One row per (water year x season x region):
 *      land_km2         mountain-domain land area                km2
 *      valid_km2        area with enough clear observations      km2
 *      sca_mean_km2     sum(SCF x pixel area) = season-mean SCA  km2
 *      sca_persist_km2  area with SCF >= PERSIST_THRESH          km2
 *      scd_areaday_km2  sum(SCF x days x pixel area)             km2-days
 *  In Python:
 *      sce_pct       = 100 * sca_mean_km2    / valid_km2
 *      scd_mean_days =       scd_areaday_km2 / valid_km2
 *  Within-season min / max SCA come from the 8-day table (export B).
 * ========================================================================== */

function seasonalRegionStats(wy, s) {
  var sc   = seasonalSCF(wy, s);
  var scf  = sc.select('scf');
  var days = ee.Number(sc.get('season_days'));

  var stack = ee.Image.cat([
    scf.mask().multiply(AREA_KM2).rename('valid_km2'),
    scf.multiply(AREA_KM2).rename('sca_mean_km2'),
    scf.gte(PERSIST_THRESH).multiply(AREA_KM2).rename('sca_persist_km2'),
    scf.multiply(days).multiply(AREA_KM2).rename('scd_areaday_km2')
  ]);

  return stack.reduceRegions({
    collection: REGIONS,
    reducer   : ee.Reducer.sum(),
    scale     : SEAS_SCALE,
    tileScale : 4
  }).map(function (f) {
    return f.set({wy: wy, season: s.name, season_days: days});
  });
}

if (EXPORT_SEASONAL_TABLE) {
  var SEAS_ALL = SEASONS.concat([ANNUAL]);
  var seasonalParts = [];
  for (var wyB = WY_START; wyB <= WY_END; wyB++) {
    for (var si = 0; si < SEAS_ALL.length; si++) {
      seasonalParts.push(seasonalRegionStats(wyB, SEAS_ALL[si]));
    }
  }
  var seasonalFC = ee.FeatureCollection(seasonalParts).flatten();

  Export.table.toDrive({
    collection    : seasonalFC,
    description   : 'tp_sca_seasonal_v1',
    folder        : GDRIVE_FOLDER,
    fileNamePrefix: 'tp_sca_seasonal_v1',
    fileFormat    : 'CSV',
    selectors     : ['unit', 'level', 'wy', 'season', 'season_days',
                     'land_km2', 'valid_km2', 'sca_mean_km2',
                     'sca_persist_km2', 'scd_areaday_km2']
  });
}


/* =============================================================================
 * 7. EXPORT D -- PER-PIXEL TREND MAPS (Sen's slope + Mann-Kendall)
 * -----------------------------------------------------------------------------
 *  The single most communicative figure: red where a season is losing snow,
 *  blue where it is gaining, stippled where p < 0.05.
 *  Bands:
 *      trend_pct_decade   change in SCF, percentage points per decade
 *      trend_days_decade  the same trend as snow-cover days per decade
 *      tau                Mann-Kendall rank correlation, -1..1
 *      p_value            Mann-Kendall two-sided p
 *      mean_scf           long-term mean SCF 0-1 (context / masking)
 *      n_years            years with valid data
 * ========================================================================== */

function trendForSeason(s) {
  var imgs = [];
  for (var wy = WY_START; wy <= WY_END; wy++) {
    var scf = seasonalSCF(wy, s).select('scf');
    var yr  = ee.Image.constant(wy).toFloat().rename('year').updateMask(scf.mask());
    imgs.push(yr.addBands(scf));
  }
  var ic = ee.ImageCollection(imgs);

  // If ee.Reducer.kendallsCorrelation(2) errors on your EE version, drop the
  // argument: ee.Reducer.kendallsCorrelation()
  var sens = ic.reduce(ee.Reducer.sensSlope()).select([0], ['slope_yr']);
  var mk   = ic.reduce(ee.Reducer.kendallsCorrelation(2))
               .select([0, 1], ['tau', 'p_value']);

  var w    = seasonWindow(WY_END, s);
  var days = ee.Number(w.end.difference(w.start, 'day'));

  return ee.Image.cat([
      sens.multiply(1000).rename('trend_pct_decade'),
      sens.multiply(days).multiply(10).rename('trend_days_decade'),
      mk,
      ic.select('scf').mean().rename('mean_scf'),
      ic.select('scf').count().rename('n_years')
    ]).toFloat().clip(DOMAIN_GEOM);
}

var TRENDS = {};
SEASONS.concat([ANNUAL]).forEach(function (s) {
  TRENDS[s.name] = trendForSeason(s);
  if (EXPORT_TRENDS) {
    Export.image.toDrive({
      image         : TRENDS[s.name],
      description   : 'tp_trend_' + s.name + '_v1',
      folder        : GDRIVE_FOLDER,
      fileNamePrefix: 'tp_trend_' + s.name + '_v1',
      region        : DOMAIN_BBOX,
      scale         : TREND_SCALE,
      crs           : 'EPSG:4326',
      maxPixels     : 1e13,
      fileFormat    : 'GeoTIFF'
    });
  }
});


/* =============================================================================
 * 8. EXPORT E -- SEASONAL SCF RASTER STACK (maps and the GIF)
 * -----------------------------------------------------------------------------
 *  One GeoTIFF per water year; one uint8 band per season; 0-100 = SCF%,
 *  255 = insufficient clear observations. Threshold at 50 in Python to get the
 *  binary snow / no-snow map.
 * ========================================================================== */

function scfStackForWY(wy) {
  var bands = SEASONS.map(function (s) {
    return seasonalSCF(wy, s).select('scf')
             .multiply(100).round().uint8()
             .unmask(255).updateMask(DOMAIN_MASK)
             .rename('scf_pct_' + s.name);
  });
  return ee.Image.cat(bands).clip(DOMAIN_GEOM).set('wy', wy);
}

if (EXPORT_SCF_RASTERS) {
  for (var wyC = WY_START; wyC <= WY_END; wyC++) {
    Export.image.toDrive({
      image         : scfStackForWY(wyC),
      description   : 'tp_scf_pct_WY' + wyC + '_v1',
      folder        : GDRIVE_FOLDER,
      fileNamePrefix: 'tp_scf_pct_WY' + wyC + '_v1',
      region        : DOMAIN_BBOX,
      scale         : MAP_SCALE,
      crs           : 'EPSG:4326',
      maxPixels     : 1e13,
      fileFormat    : 'GeoTIFF'
    });
  }
}


/* =============================================================================
 * 9. QUICK LOOKS -- map layers, animation, preview chart
 * ========================================================================== */

var SNOW_PALETTE  = ['1b2a3a', 'ffffff'];
var TREND_PALETTE = ['b2182b', 'ef8a62', 'f7f7f7', '67a9cf', '2166ac']; // red = loss
var REGION_LINES  = ee.Image().byte().paint(REGIONS, 1, 1);

if (SHOW_MAP_LAYERS) {
  Map.setCenter(83, 33, 4);
  Map.setOptions('SATELLITE');

  Map.addLayer(DOMAIN_MASK, {palette: ['444444']},
               'Third Pole domain (elev >= ' + ELEV_MIN + ' m)', false);
  Map.addLayer(REGION_LINES.selfMask(), {palette: ['ffff00']}, 'Region outlines');

  Map.addLayer(seasonalSCF(WY_START, PEAK_SEASON).select('scf')
                 .gte(PERSIST_THRESH).selfMask(),
               {palette: ['ffffff']},
               'Binary snow ' + PEAK_SEASON.name + ' WY' + WY_START, false);
  Map.addLayer(seasonalSCF(WY_END, PEAK_SEASON).select('scf')
                 .gte(PERSIST_THRESH).selfMask(),
               {palette: ['ffffff']},
               'Binary snow ' + PEAK_SEASON.name + ' WY' + WY_END, false);

  Map.addLayer(TRENDS[PEAK_SEASON.name].select('trend_pct_decade'),
               {min: -12, max: 12, palette: TREND_PALETTE},
               'TREND ' + PEAK_SEASON.name + ' SCF %/decade (red = loss)');
  Map.addLayer(TRENDS[ANNUAL.name].select('trend_days_decade'),
               {min: -30, max: 30, palette: TREND_PALETTE},
               'TREND annual snow days/decade (red = loss)', false);
}

if (SHOW_ANIMATION) {
  // 'PEAK' -> one frame per water year for the winter-maximum season. This is
  //           the figure that shows the TREND, because the seasonal cycle is
  //           held constant.
  // 'ALL'  -> four frames per water year. Shows the accumulation-melt cycle,
  //           but the cycle swamps the trend, so use it as a second, shorter
  //           animation, not as the main figure.
  var animSeasons = (ANIM_MODE === 'ALL') ? SEASONS : [PEAK_SEASON];
  var borders = REGION_LINES.selfMask()
                  .visualize({min: 0, max: 1, palette: ['9aa5b1']});
  var frames  = [];
  for (var wyD = WY_START; wyD <= WY_END; wyD++) {
    for (var sj = 0; sj < animSeasons.length; sj++) {
      var bin = seasonalSCF(wyD, animSeasons[sj]).select('scf')
                  .gte(PERSIST_THRESH).unmask(0).updateMask(DOMAIN_MASK)
                  .visualize({min: 0, max: 1, palette: SNOW_PALETTE});
      frames.push(bin.blend(borders).clip(DOMAIN_GEOM));
    }
  }
  print('9 >>> ANIMATION <<< ' + frames.length + ' frames, mode ' + ANIM_MODE +
        '. Open this URL:',
        ee.ImageCollection(frames).getVideoThumbURL({
          dimensions: 900, region: DOMAIN_BBOX,
          framesPerSecond: 4, crs: 'EPSG:4326'
        }));
}

if (PREVIEW_CHART) {
  // Deliberately coarse (PREVIEW_SCALE) so it returns inside the editor's time
  // limit. Use the exported CSV for the real numbers.
  var previewParts = [];
  for (var wyE = WY_START; wyE <= WY_END; wyE++) {
    var v = seasonalSCF(wyE, PEAK_SEASON).select('scf')
              .multiply(AREA_KM2)
              .reduceRegion({reducer: ee.Reducer.sum(), geometry: DOMAIN_GEOM,
                             scale: PREVIEW_SCALE, maxPixels: 1e11,
                             bestEffort: true});
    previewParts.push(ee.Feature(null, {wy: wyE, sca_km2: v.get('scf')}));
  }
  print(ui.Chart.feature.byFeature(ee.FeatureCollection(previewParts),
                                   'wy', ['sca_km2'])
          .setChartType('LineChart')
          .setOptions({
            title : 'PREVIEW (' + PREVIEW_SCALE + ' m): Third Pole, ' +
                    PEAK_SEASON.name + ' mean snow-covered area',
            hAxis : {title: 'water year', format: '####'},
            vAxis : {title: 'snow-covered area (km2)'},
            pointSize: 4, lineWidth: 2, legend: {position: 'none'}
          }));
}


/* =============================================================================
 * 10. EXPORT F -- ERA5-Land monthly snow cover, 1950 -> present (context only)
 * -----------------------------------------------------------------------------
 *  ~11 km reanalysis. Far too coarse for maps, and it is a model rather than an
 *  observation -- but it is the only way to say "the 2000-2026 satellite record
 *  sits inside a 75-year decline / no trend". Use it for ONE context chart.
 *
 *  UNITS: the EE band is documented as a 0-1 fraction; the ECMWF source is
 *  0-100 %. The print below tells you which one you have.
 * ========================================================================== */

if (EXPORT_ERA5) {
  var era = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
              .select('snow_cover')
              .filterDate('1950-01-01', ee.Date.fromYMD(WY_END, WY_MONTH_START, 1));

  print('10 >>> CHECK <<< ERA5 snow_cover percentiles (0-1 fraction or 0-100 %?):',
        era.filterDate('2010-01-01', '2010-02-01').first().reduceRegion({
          reducer : ee.Reducer.percentile([50, 99]),
          geometry: rect([80, 30, 90, 35]),
          scale   : 11132, maxPixels: 1e9}));

  var eraFC = ee.FeatureCollection(
    era.toList(era.size()).map(function (im) {
      im = ee.Image(im);
      var d = ee.Date(im.get('system:time_start'));
      return im.select('snow_cover').updateMask(DOMAIN_MASK).reduceRegions({
        collection: REGIONS,
        reducer   : ee.Reducer.mean().setOutputs(['snow_cover_mean']),
        scale     : 11132,
        tileScale : 4
      }).map(function (f) {
        return f.set({date : d.format('YYYY-MM'),
                      year : d.get('year'),
                      month: d.get('month')});
      });
    })
  ).flatten();

  Export.table.toDrive({
    collection    : eraFC,
    description   : 'tp_era5_snowcover_monthly_v1',
    folder        : GDRIVE_FOLDER,
    fileNamePrefix: 'tp_era5_snowcover_monthly_v1',
    fileFormat    : 'CSV',
    selectors     : ['unit', 'level', 'date', 'year', 'month',
                     'land_km2', 'snow_cover_mean']
  });
}


/* =============================================================================
 * 11. RUN ORDER  --  read this once
 * -----------------------------------------------------------------------------
 *  RUN 1  (~2 min)   EXPORT_REGIONS only; everything else false.
 *      Read the >>> CHECK <<< prints. Look at "Region outlines" on the map.
 *      Fix any basin whose area looks wrong by nudging its seed point.
 *      Run tp_regions_v1_asset, then paste the asset ID into REGIONS_ASSET.
 *
 *  RUN 2  (minutes to ~1 h of task time)
 *      EXPORT_SEASONAL_TABLE + EXPORT_TRENDS + EXPORT_ERA5.
 *      tp_sca_seasonal_v1.csv alone is enough for every chart in a first article.
 *
 *  RUN 3  (hours)    EXPORT_8DAY_TABLE.
 *      Gives within-season min / max and lets you redefine seasons in Python
 *      later without coming back to Earth Engine.
 *
 *  RUN 4  (25 tasks) EXPORT_SCF_RASTERS, for the annotated GIF and map figures.
 *
 *  CAVEATS to carry into the article
 *    - MOD10A2 is a MAXIMUM snow extent over 8 days, so it runs a few percent
 *      high against a daily-mean SCA. It is consistent through time, which is
 *      what a trend needs; do not compare its absolute values with a daily product.
 *    - Terra's orbit has drifted since 2022, so the overpass time in the last
 *      years of the record differs slightly. Footnote it.
 *    - SCA includes glaciers and perennial snow unless MASK_GLACIERS = true.
 *      That is why summer SCA never reaches zero.
 *    - Nothing below ELEV_MIN is counted at all.
 *    - Cloud is excluded from the denominator, never assumed snow-free. Check
 *      obs_frac before believing a monsoon-season (JAS) number.
 *    - A trend over 25 years in a region with big interannual swings (Karakoram,
 *      western Himalaya) is not the same thing as a climate signal. Report the
 *      Mann-Kendall p-value next to every slope.
 * ========================================================================== */