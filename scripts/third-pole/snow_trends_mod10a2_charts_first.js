/* =============================================================================
 *  THIRD POLE / HIGH MOUNTAIN ASIA  --  SNOW COVER AREA & TRENDS
 *  Google Earth Engine (JavaScript API)  --  script v2, "charts first"
 * -----------------------------------------------------------------------------
 *  WHAT CHANGED FROM v1, AND WHY
 *
 *  1. maxPixels does NOT make anything faster. It is a safety fuse, not a
 *     throttle: it caps how many pixels a job is ALLOWED to touch before it
 *     aborts. Raising it permits bigger jobs; it never speeds one up. Lowering
 *     it just makes exports fail. Leave it at 1e13 and forget about it.
 *
 *  2. SCALE is the real knob, and it is quadratic. The mountain domain is
 *     ~3.5 million km2 of land above 1500 m:
 *         500 m  ->  ~14,000,000 pixels     (v1 default)
 *        1000 m  ->   ~3,500,000 pixels     4x cheaper
 *        2000 m  ->     ~875,000 pixels    16x cheaper
 *        5000 m  ->     ~140,000 pixels   100x cheaper
 *     Regional TOTALS over areas of 20,000-3,000,000 km2 barely move, because
 *     you are still averaging over tens of thousands of samples. Section 4 runs
 *     that comparison on your own data so you can see the number, not trust mine.
 *
 *  3. FEWER, FATTER reduceRegions calls. v1 made 1,146 separate calls for the
 *     8-day table and 125 for the seasonal one. Every call re-rasterises all
 *     ~35 region polygons from scratch. v2 packs a whole water year into ONE
 *     multi-band image and makes ONE call per year: 25 calls instead of 1,146.
 *
 *  4. FEWER OVERLAPPING REGIONS. domain + ranges + countries + basins all cover
 *     the same ground, so every pixel is read ~4 times. The optional
 *     high-frequency table now runs on selected levels only (HF_LEVELS).
 *
 *  5. SIMPLIFIED POLYGONS. Region outlines are simplified to SIMPLIFY_M before
 *     any reduction. Rasterising a 1.9M km2 "difference" multipolygon at full
 *     vertex density was a real cost.
 *
 *  6. TIERED EXPORTS. Tier 1 (charts) runs by default and finishes in minutes.
 *     Maps, GIFs and trend rasters are off until you turn them on.
 *
 *  IS THERE FASTER DATA?  Checked, and the answer is no, not in Earth Engine.
 *    The natural choice would be the MODIS CMG snow products -- MOD10C2 (8-day)
 *    and MOD10CM (monthly) at 0.05 deg / ~5.6 km, same algorithm, same record,
 *    ~100x cheaper. They exist at NSIDC but are NOT in the EE catalog, which
 *    carries only MOD10A1, MYD10A1 (daily 500 m) and MOD10A2 (8-day 500 m).
 *    So: keep MOD10A2 and ASK FOR CMG RESOLUTION by setting scale to ~5000 m.
 *    That is functionally the same thing -- EE reads the coarse pyramid level
 *    instead of native pixels.
 *    MOD10A1 (daily) would be 8x MORE expensive than MOD10A2 for no benefit
 *    here; its only advantage is true daily timing, which this article does not
 *    need. ERA5-Land at 11 km is already in section 11 as the long-record line.
 *
 *  DATA
 *    MODIS/061/MOD10A2 -- Terra Snow Cover, 8-Day L3 Global, 500 m, 2000-02-18 ->
 *    Band Maximum_Snow_Extent:
 *      0 missing | 1 no decision | 11 night | 25 no snow | 37 lake
 *      39 ocean  | 50 cloud      | 100 lake ice | 200 SNOW | 254 saturated
 *
 *  UNITS
 *    SCA km2 | SCE % of region land | SCF fraction of clear composites
 *    SCD days | trend %/decade and days/decade
 *
 *  TIME
 *    Water year 1 Oct -> 30 Sep, labelled by the ending year.
 *    WY2001 = Oct 2000 - Sep 2001.
 * ========================================================================== */


/* =============================================================================
 * 0. CONFIG
 * ========================================================================== */

var GDRIVE_FOLDER = 'third_pole_snow';
var ASSET_ROOT    = 'projects/YOUR-PROJECT/assets';   // <-- edit once

// ---- SPEED PROFILE ----------------------------------------------------------
// FAST        first pass, everything returns in minutes. Trends are already
//             correct at this scale; absolute km2 are within a few percent.
// BALANCED    what most published regional snow studies effectively use.
// PUBLICATION native 500 m. Use for the final numbers you print in the article,
//             and expect hours.
var PROFILE = 'FAST';

var SCALE_TABLE = {
  FAST:        {seas: 5000, hf: 5000, map: 2000, trend: 5000, preview: 10000},
  BALANCED:    {seas: 2000, hf: 2000, map: 1000, trend: 2000, preview:  5000},
  PUBLICATION: {seas:  500, hf:  500, map:  500, trend: 1000, preview:  5000}
};
var S = SCALE_TABLE[PROFILE];

var TILE_SCALE = 4;      // raise to 8 or 16 only if you hit "User memory limit
                         // exceeded". Higher = more robust but slower.
var MAX_PIXELS = 1e13;   // safety fuse, NOT a speed control. See header note 1.
var SIMPLIFY_M = 1000;   // region-polygon simplification tolerance, metres.
                         // 1000 m is invisible at continental scale and makes
                         // polygon rasterisation much cheaper. 0 disables.

// ---- time -------------------------------------------------------------------
var WY_START       = 2001;
var WY_END         = 2025;
var WY_MONTH_START = 10;
var COMPOSITE_DAYS = 8;

var SEASONS = [
  {name: 'OND', months: [10, 11, 12], label: 'Oct-Dec  accumulation onset'},
  {name: 'JFM', months: [ 1,  2,  3], label: 'Jan-Mar  winter maximum'},
  {name: 'AMJ', months: [ 4,  5,  6], label: 'Apr-Jun  pre-monsoon melt'},
  {name: 'JAS', months: [ 7,  8,  9], label: 'Jul-Sep  monsoon / summer minimum'}
];
var ANNUAL      = {name: 'WY', months: null, label: 'full water year Oct-Sep'};
var SEAS_ALL    = SEASONS.concat([ANNUAL]);
var PEAK_SEASON = SEASONS[1];

// ---- domain -----------------------------------------------------------------
var ELEV_MIN = 1500;
var DEM_ID   = 'MERIT/DEM/v1_0_3';
var DEM_BAND = 'dem';

var MASK_PERMANENT_WATER = true;
var MASK_GLACIERS        = false;

// ---- snow -------------------------------------------------------------------
var MIN_CLEAR_COMPOSITES = 4;
var PERSIST_THRESH       = 0.5;

// ---- boundaries -------------------------------------------------------------
var GAUL_ID  = 'FAO/GAUL_SIMPLIFIED_500m/2015/level0';
var GAUL1_ID = 'FAO/GAUL_SIMPLIFIED_500m/2015/level1';
var MIN_COUNTRY_AREA_KM2 = 250;
var MIN_REGION_LAND_KM2  = 1000;
var HYBAS_LEVEL          = 5;

var INCLUDE_BASIN_RESIDUAL = false;  // the "Other endorheic" catch-all. It is a
                                     // ~1.9M km2 difference polygon and by far
                                     // the most expensive geometry in the script.
                                     // The 'Inner Tibetan Plateau' range polygon
                                     // already covers that ground. Off by default.

// ---- TIER 1: charts (default ON, minutes) -----------------------------------
var EXPORT_REGIONS        = true;
var EXPORT_SEASONAL_TABLE = true;
var EXPORT_ERA5           = true;

// ---- TIER 2: high-frequency series for within-season min/max (optional) -----
var EXPORT_HF_TABLE = false;
var HF_LEVELS       = ['domain', 'range'];   // cuts pixel reads ~4x versus all
                                             // levels. Add 'country' / 'basin'
                                             // when you need their min/max too.

// ---- TIER 3: rasters, trends, animation (optional, batch) -------------------
var EXPORT_TRENDS      = false;
var EXPORT_SCF_RASTERS = false;
var EXPORT_ANIMATION   = false;

// ---- in-editor -------------------------------------------------------------
var RUN_SCALE_CHECK  = true;    // section 4: proves how much scale costs you
var SHOW_MAP_LAYERS  = true;    // cheap layers only
var SHOW_HEAVY_LAYERS= false;   // seasonal SCF + trend layers; slow to draw
var SHOW_ANIMATION   = false;
var ANIM_STRIDE      = 6;
var ANIM_MODE        = 'PEAK';
var PREVIEW_CHART    = true;

var REGIONS_ASSET = '';   // paste the exported asset ID after run 1


/* =============================================================================
 * 1. DOMAIN
 * ========================================================================== */

var RANGE_BOXES = [
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
  var g   = (consumed === null) ? box : box.difference(consumed, 2000);
  consumed = (consumed === null) ? box : consumed.union(box, 2000);
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
  mtn = mtn.and(ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
                  .select('occurrence').unmask(0).gte(50).not());
}
if (MASK_GLACIERS) {
  mtn = mtn.and(ee.Image().byte()
          .paint(ee.FeatureCollection('GLIMS/current').filterBounds(DOMAIN_BBOX), 1)
          .unmask(0).not());
}

var DOMAIN_MASK = mtn.selfMask().rename('domain');
var AREA_KM2    = ee.Image.pixelArea().divide(1e6)
                    .updateMask(DOMAIN_MASK).rename('land_km2');


/* =============================================================================
 * 2b. COUNTRIES -- disputed-territory safe
 * -----------------------------------------------------------------------------
 *  GAUL keeps the disputed units separate. Verified on a real run, the domain
 *  contains: "Jammu and Kashmir", "Aksai Chin", "Arunachal Pradesh" and
 *  "China/India" as their own ADM0 rows -- so India's polygon excludes BOTH
 *  Kashmir and Arunachal, and nothing is silently dropped or assigned.
 * ========================================================================== */

var gaulInTP = ee.FeatureCollection(GAUL_ID).filterBounds(DOMAIN_GEOM);

print('2b >>> CHECK <<< ADM0 units intersecting the domain:',
      gaulInTP.aggregate_array('ADM0_NAME').distinct().sort());

var countryFeats = gaulInTP.map(function (f) {
  var g = f.geometry().intersection(DOMAIN_GEOM, 2000);
  return ee.Feature(g, {unit: f.get('ADM0_NAME'), level: 'country',
                        area_km2: g.area(2000).divide(1e6)});
}).filter(ee.Filter.gt('area_km2', MIN_COUNTRY_AREA_KM2));


/* =============================================================================
 * 2c. OPTIONAL -- de-facto split of a disputed unit
 * -----------------------------------------------------------------------------
 *  VERIFIED: GAUL level 1 returns a single ADM1_NAME, "Administrative unit not
 *  available", for "Jammu and Kashmir". GAUL does not subdivide the disputed
 *  units, so there is no district-level de-facto split to extract from it.
 *
 *  (1) RECOMMENDED  keep them as their own rows (the default, no code needed).
 *  (2) Let GEOGRAPHY carry it: the 'range' and 'basin' cuts already split
 *      Kashmir into Karakoram / Western Himalaya and into the upper Indus.
 *  (3) If an editor insists, supply your own polygons: a FeatureCollection with
 *      a string property 'unit', one feature per side, in KASHMIR_SPLIT_ASSET.
 *      Where that line goes is an editorial decision, not a technical one.
 * ========================================================================== */

var KASHMIR_SPLIT_ASSET = '';

print('2c >>> CHECK <<< ADM1 units inside GAUL "Jammu and Kashmir" ' +
      '(expect "Administrative unit not available"):',
      ee.FeatureCollection(GAUL1_ID)
        .filter(ee.Filter.stringContains('ADM0_NAME', 'Kashmir'))
        .aggregate_array('ADM1_NAME').distinct().sort());

if (KASHMIR_SPLIT_ASSET !== '') {
  countryFeats = countryFeats.merge(
    ee.FeatureCollection(KASHMIR_SPLIT_ASSET).map(function (f) {
      var g = f.geometry().intersection(DOMAIN_GEOM, 2000);
      return ee.Feature(g, {unit: f.get('unit'), level: 'country_defacto',
                            area_km2: g.area(2000).divide(1e6)});
    }));
}


/* =============================================================================
 * 2d. RIVER BASINS
 * -----------------------------------------------------------------------------
 *  Verified areas from a real run: Issyk-Kul 21,917 km2, Qaidam 103,538 km2,
 *  Indus 540,895 km2 -- consistent with published mountain-basin extents.
 *  Ganges and Brahmaputra share one MAIN_BAS (they merge before the sea) and
 *  come out as a single GBM unit, which is a standard reporting unit anyway.
 *  Helmand is small (~19,000 km2) because only its Hindu Kush headwaters clear
 *  ELEV_MIN -- correct, but label it "upper Helmand" in any chart.
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
  var seed  = ee.Feature(hybas.filterBounds(ee.Geometry.Point(lonlat)).first());
  var parts = hybas.filter(ee.Filter.eq('MAIN_BAS', seed.get('MAIN_BAS')))
                   .filterBounds(DOMAIN_GEOM);
  var g = parts.geometry(2000).intersection(DOMAIN_GEOM, 2000);
  return ee.Feature(g, {unit: name, level: 'basin',
                        area_km2: g.area(2000).divide(1e6)});
}

var basinFeats = ee.FeatureCollection(BASIN_SEEDS.map(function (b) {
  return basinFromSeed(b[0], b[1]);
}));

if (INCLUDE_BASIN_RESIDUAL) {
  var otherGeom = DOMAIN_GEOM.difference(basinFeats.geometry(2000), 2000);
  basinFeats = basinFeats.merge(ee.FeatureCollection([
    ee.Feature(otherGeom, {unit : 'Other endorheic (inner plateau)',
                           level: 'basin',
                           area_km2: otherGeom.area(2000).divide(1e6)})]));
}


/* =============================================================================
 * 2e. ASSEMBLE, SIMPLIFY, FILTER
 * ========================================================================== */

var REGIONS = ee.FeatureCollection([DOMAIN_FEAT])
  .merge(ee.FeatureCollection(rangeFeats))
  .merge(countryFeats)
  .merge(basinFeats);

// Normalise the schema (mixed property sets break table-to-asset exports) and
// simplify the geometry. Simplification is a genuine speed-up: every
// reduceRegions call rasterises these polygons.
REGIONS = REGIONS.map(function (f) {
  var g = (SIMPLIFY_M > 0) ? f.geometry().simplify(SIMPLIFY_M) : f.geometry();
  return ee.Feature(g, {unit: f.get('unit'), level: f.get('level')});
});

REGIONS = AREA_KM2.reduceRegions({
  collection: REGIONS,
  reducer   : ee.Reducer.sum().setOutputs(['land_km2']),
  scale     : S.seas,
  tileScale : TILE_SCALE
});

// The filter that matters: elevation-masked MOUNTAIN area, not polygon area.
// Without it the rectangular range boxes drag in Laos, Viet Nam, Turkmenistan,
// Bangladesh and low Mongolia through their corners.
REGIONS = REGIONS.filter(ee.Filter.gt('land_km2', MIN_REGION_LAND_KM2));

print('2e >>> CHECK <<< final regions and mountain land area (km2):',
      REGIONS.aggregate_array('unit'), REGIONS.aggregate_array('land_km2'));

if (EXPORT_REGIONS && REGIONS_ASSET === '') {
  Export.table.toAsset({collection: REGIONS,
                        description: 'tp_regions_v2_asset',
                        assetId: ASSET_ROOT + '/tp_regions_v2'});
  Export.table.toDrive({collection: REGIONS, description: 'tp_regions_v2_geojson',
                        folder: GDRIVE_FOLDER, fileNamePrefix: 'tp_regions_v2',
                        fileFormat: 'GeoJSON'});
}

// Reusing the asset skips ALL the geometry algebra above on every later call.
// This is the single biggest speed-up in the script. Do it after run 1.
if (REGIONS_ASSET !== '') { REGIONS = ee.FeatureCollection(REGIONS_ASSET); }


/* =============================================================================
 * 3. SNOW COLLECTION
 * ========================================================================== */

var SNOW = ee.ImageCollection('MODIS/061/MOD10A2')
             .select('Maximum_Snow_Extent')
             .filterDate(ee.Date.fromYMD(WY_START - 1, WY_MONTH_START, 1),
                         ee.Date.fromYMD(WY_END,       WY_MONTH_START, 1));

print('3 >>> CHECK <<< 8-day composites (a real run returned 1146 for ' +
      'WY2001-WY2025; a few MODIS periods are missing from the archive):',
      SNOW.size());

var ZERO_CLASS = ee.ImageCollection([
  ee.Image.constant([0, 0, 0, 0])
    .rename(['snow', 'nosnow', 'cloud', 'clear']).toFloat()
]);

function classBands(img) {
  var m      = img.select('Maximum_Snow_Extent').unmask(0);
  var snow   = m.eq(200);
  var nosnow = m.eq(25);
  return ee.Image(ee.Image.cat([
      snow.rename('snow'),
      nosnow.rename('nosnow'),
      m.eq(50).rename('cloud'),
      snow.or(nosnow).rename('clear')
    ]).toFloat().copyProperties(img, ['system:time_start']));
}


/* =============================================================================
 * 4. SCALE CHECK -- how much does coarsening actually cost you?
 * -----------------------------------------------------------------------------
 *  Runs the SAME seasonal snow-area calculation over one representative range
 *  at four scales and prints the numbers. Compare them, then set PROFILE.
 *  Run on one range rather than the whole domain so it returns quickly; the
 *  RATIO between scales is what you are reading, and it does not depend on
 *  which region you test.
 *
 *  What you are really testing: MOD10A2's snow class band is categorical, so
 *  when Earth Engine serves a coarse pyramid level it resamples class codes.
 *  Any resulting bias sits at the snowline edge and is STABLE THROUGH TIME,
 *  which is why trends survive coarsening even where absolute km2 shift a
 *  little. Confirm that on your own numbers rather than taking my word for it.
 * ========================================================================== */

var SCALE_CHECK_GEOM = rect([81.5, 27.0, 88.5, 32.5]);   // Central Himalaya box
var SCALE_CHECK_WY   = 2015;
// (the check itself runs at the end of section 5, once seasonalSCF exists)


/* =============================================================================
 * 5. SEASONAL SNOW COVER FREQUENCY
 * ========================================================================== */

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

/** SCF = snow composites / clear composites. Cloud leaves the denominator. */
function seasonalSCF(wy, s) {
  var w      = seasonWindow(wy, s);
  var c      = SNOW.filterDate(w.start, w.end).map(classBands).merge(ZERO_CLASS);
  var nClear = c.select('clear').sum();
  var scf    = c.select('snow').sum().divide(nClear)
                 .updateMask(nClear.gte(MIN_CLEAR_COMPOSITES))
                 .updateMask(DOMAIN_MASK)
                 .rename('scf');
  return scf.addBands(nClear.rename('nclear'))
            .set({wy: wy, season: s.name,
                  season_days: w.end.difference(w.start, 'day')});
}

if (RUN_SCALE_CHECK) {
  var chk = seasonalSCF(SCALE_CHECK_WY, PEAK_SEASON).select('scf')
              .multiply(AREA_KM2);
  [500, 1000, 2000, 5000].forEach(function (sc) {
    print('4 >>> SCALE CHECK <<< Central Himalaya, ' + PEAK_SEASON.name + ' WY' +
          SCALE_CHECK_WY + ', scale ' + sc + ' m -> SCA km2:',
          chk.reduceRegion({reducer  : ee.Reducer.sum(),
                            geometry : SCALE_CHECK_GEOM,
                            scale    : sc,
                            maxPixels: MAX_PIXELS,
                            tileScale: TILE_SCALE}).get('scf'));
  });
}


/* =============================================================================
 * 6. TIER 1 EXPORT -- SEASONAL TABLE, ONE reduceRegions PER WATER YEAR
 * -----------------------------------------------------------------------------
 *  WIDE format: one row per (water year x region), 20 metric columns
 *  (5 windows x 4 metrics). Melt it in Python:
 *      df.melt(id_vars=['unit','level','wy','land_km2'])
 *        .join(variable.str.extract(r'^(?P<season>\w+?)_(?P<metric>.+)$'))
 *
 *  Per season S:
 *      S_valid_km2        area with enough clear observations
 *      S_sca_mean_km2     sum(SCF x pixel area) = season-mean snow area
 *      S_sca_persist_km2  area with SCF >= PERSIST_THRESH
 *      S_scd_areaday_km2  sum(SCF x days x pixel area), km2-days
 *  Then:
 *      sce_pct       = 100 * S_sca_mean_km2   / S_valid_km2
 *      scd_mean_days =       S_scd_areaday_km2 / S_valid_km2
 *
 *  Season lengths are not exported as columns because they are deterministic --
 *  reconstruct them in Python from the season definition and the water year
 *  (OND 92, JFM 90 or 91, AMJ 91, JAS 92, WY 365 or 366). The days factor is
 *  already baked into S_scd_areaday_km2, so you only need them if you want to
 *  cross-check.
 * ========================================================================== */

function seasonalBandsForWY(wy) {
  var bands = [];
  SEAS_ALL.forEach(function (s) {
    var sc   = seasonalSCF(wy, s);
    var scf  = sc.select('scf');
    var days = ee.Number(sc.get('season_days'));
    bands.push(scf.mask().multiply(AREA_KM2).rename(s.name + '_valid_km2'));
    bands.push(scf.multiply(AREA_KM2).rename(s.name + '_sca_mean_km2'));
    bands.push(scf.gte(PERSIST_THRESH).multiply(AREA_KM2)
                  .rename(s.name + '_sca_persist_km2'));
    bands.push(scf.multiply(days).multiply(AREA_KM2)
                  .rename(s.name + '_scd_areaday_km2'));
  });
  return ee.Image.cat(bands);
}

var SEASONAL_SELECTORS = ['unit', 'level', 'wy', 'land_km2'];
SEAS_ALL.forEach(function (s) {
  SEASONAL_SELECTORS = SEASONAL_SELECTORS.concat([
    s.name + '_valid_km2',   s.name + '_sca_mean_km2',
    s.name + '_sca_persist_km2', s.name + '_scd_areaday_km2']);
});

if (EXPORT_SEASONAL_TABLE) {
  var seasonalParts = [];
  for (var wyB = WY_START; wyB <= WY_END; wyB++) {
    seasonalParts.push(
      seasonalBandsForWY(wyB).reduceRegions({
        collection: REGIONS,
        reducer   : ee.Reducer.sum(),
        scale     : S.seas,
        tileScale : TILE_SCALE
      }).map((function (y) {
        return function (f) { return f.set('wy', y); };
      })(wyB))
    );
  }
  Export.table.toDrive({
    collection    : ee.FeatureCollection(seasonalParts).flatten(),
    description   : 'tp_sca_seasonal_v2_' + PROFILE,
    folder        : GDRIVE_FOLDER,
    fileNamePrefix: 'tp_sca_seasonal_v2_' + PROFILE,
    fileFormat    : 'CSV',
    selectors     : SEASONAL_SELECTORS
  });
}


/* =============================================================================
 * 7. TIER 2 EXPORT -- 8-DAY SERIES for within-season MIN / MAX
 * -----------------------------------------------------------------------------
 *  Also banded by water year: 46 windows x 2 metrics = 92 bands, ONE
 *  reduceRegions per year instead of 46.
 *
 *  Windows are anchored to 1 October and named by their INDEX within the water
 *  year (p00..p45), not by their date. That keeps the column names identical in
 *  every year, which is what lets the export use `selectors` -- without a
 *  selector list Earth Engine writes the full polygon geometry into a `.geo`
 *  column and the CSV balloons.
 *      Oct 1 + 8 days x p  ->  p00 = 1 Oct (wy-1), p45 = the final short window.
 *      Always 46 windows, leap year or not.
 *
 *  Python:
 *      long = wide.melt(id_vars=['unit','level','wy','land_km2'])
 *      long[['p','metric']] = long.variable.str.extract(r'^p(\d{2})_(\w+)$')
 *      long['start'] = (pd.to_datetime(long.wy.sub(1).astype(str) + '-10-01')
 *                       + pd.to_timedelta(long.p.astype(int) * 8, unit='D'))
 *      sca = land_km2 * snow / clear            # cloud-corrected
 *      # clear == 0 means MODIS had no composite in that window -> drop the row
 *      then groupby(season).agg(['mean','min','max'])
 *
 *  HF_LEVELS restricts which region levels get this treatment. domain+range is
 *  ~4x cheaper than all four levels, because the levels overlap in space and
 *  every extra level re-reads the same pixels.
 * ========================================================================== */

var HF_N_WINDOWS = 46;

function pName(i) { return 'p' + (i < 10 ? '0' : '') + i; }

function wyWindows(wy) {
  var out = [];
  var startMs = Date.UTC(wy - 1, WY_MONTH_START - 1, 1);
  var endMs   = Date.UTC(wy,     WY_MONTH_START - 1, 1);
  var step    = COMPOSITE_DAYS * 86400000;
  var i = 0;
  for (var t = startMs; t < endMs; t += step) {
    var a = new Date(t);
    var b = new Date(Math.min(t + step, endMs));
    out.push({name : pName(i),
              start: ee.Date(a.toISOString().slice(0, 10)),
              end  : ee.Date(b.toISOString().slice(0, 10))});
    i++;
  }
  return out;
}

function hfBandsForWY(wy) {
  var bands = [];
  wyWindows(wy).forEach(function (w) {
    // ZERO_CLASS guards windows where MODIS has no composite at all: those come
    // out as snow = 0, clear = 0, and get dropped in Python.
    var c = SNOW.filterDate(w.start, w.end).map(classBands).merge(ZERO_CLASS);
    bands.push(c.select('snow').max().multiply(AREA_KM2).rename(w.name + '_snow'));
    bands.push(c.select('clear').max().multiply(AREA_KM2).rename(w.name + '_clear'));
  });
  return ee.Image.cat(bands);
}

if (EXPORT_HF_TABLE) {
  var hfRegions = REGIONS.filter(ee.Filter.inList('level', HF_LEVELS));
  var hfParts   = [];
  var hfSel     = ['unit', 'level', 'wy', 'land_km2'];
  for (var pi = 0; pi < HF_N_WINDOWS; pi++) {
    hfSel = hfSel.concat([pName(pi) + '_snow', pName(pi) + '_clear']);
  }

  for (var wyH = WY_START; wyH <= WY_END; wyH++) {
    hfParts.push(
      hfBandsForWY(wyH).reduceRegions({
        collection: hfRegions,
        reducer   : ee.Reducer.sum(),
        scale     : S.hf,
        tileScale : TILE_SCALE
      }).map((function (y) {
        return function (f) { return f.set('wy', y); };
      })(wyH))
    );
  }

  Export.table.toDrive({
    collection    : ee.FeatureCollection(hfParts).flatten(),
    description   : 'tp_sca_8day_v2_' + PROFILE,
    folder        : GDRIVE_FOLDER,
    fileNamePrefix: 'tp_sca_8day_v2_' + PROFILE,
    fileFormat    : 'CSV',
    selectors     : hfSel
  });
}


/* =============================================================================
 * 8. TIER 3 -- PER-PIXEL TREND MAPS (Sen's slope + Mann-Kendall)
 * ========================================================================== */

function trendForSeason(s) {
  var imgs = [];
  for (var wy = WY_START; wy <= WY_END; wy++) {
    var scf = seasonalSCF(wy, s).select('scf');
    imgs.push(ee.Image.constant(wy).toFloat().rename('year')
                .updateMask(scf.mask()).addBands(scf));
  }
  var ic   = ee.ImageCollection(imgs);
  // If kendallsCorrelation(2) errors on your EE version, drop the argument.
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
if (EXPORT_TRENDS || SHOW_HEAVY_LAYERS) {
  SEAS_ALL.forEach(function (s) {
    TRENDS[s.name] = trendForSeason(s);
    if (EXPORT_TRENDS) {
      Export.image.toDrive({
        image: TRENDS[s.name], description: 'tp_trend_' + s.name + '_v2',
        folder: GDRIVE_FOLDER, fileNamePrefix: 'tp_trend_' + s.name + '_v2',
        region: DOMAIN_BBOX, scale: S.trend, crs: 'EPSG:4326',
        maxPixels: MAX_PIXELS, fileFormat: 'GeoTIFF'});
    }
  });
}


/* =============================================================================
 * 9. TIER 3 -- SEASONAL SCF RASTER STACK (maps and the GIF)
 * ========================================================================== */

if (EXPORT_SCF_RASTERS) {
  for (var wyC = WY_START; wyC <= WY_END; wyC++) {
    var stack = ee.Image.cat(SEASONS.map(function (s) {
      return seasonalSCF(wyC, s).select('scf')
               .multiply(100).round().uint8()
               .unmask(255).updateMask(DOMAIN_MASK)
               .rename('scf_pct_' + s.name);
    })).clip(DOMAIN_GEOM);

    Export.image.toDrive({
      image: stack, description: 'tp_scf_pct_WY' + wyC + '_v2',
      folder: GDRIVE_FOLDER, fileNamePrefix: 'tp_scf_pct_WY' + wyC + '_v2',
      region: DOMAIN_BBOX, scale: S.map, crs: 'EPSG:4326',
      maxPixels: MAX_PIXELS, fileFormat: 'GeoTIFF'});
  }
}


/* =============================================================================
 * 10. QUICK LOOKS
 * ========================================================================== */

var SNOW_PALETTE  = ['1b2a3a', 'ffffff'];
var TREND_PALETTE = ['b2182b', 'ef8a62', 'f7f7f7', '67a9cf', '2166ac'];

if (SHOW_MAP_LAYERS) {
  Map.setCenter(83, 33, 4);
  Map.setOptions('SATELLITE');
  Map.addLayer(DOMAIN_MASK, {palette: ['444444']},
               'Third Pole domain (elev >= ' + ELEV_MIN + ' m)', false);
  Map.addLayer(ee.Image().byte().paint(REGIONS, 1, 1).selfMask(),
               {palette: ['ffff00']}, 'Region outlines');
}

if (SHOW_HEAVY_LAYERS) {
  Map.addLayer(seasonalSCF(WY_START, PEAK_SEASON).select('scf')
                 .gte(PERSIST_THRESH).selfMask(), {palette: ['ffffff']},
               'Binary snow ' + PEAK_SEASON.name + ' WY' + WY_START, false);
  Map.addLayer(seasonalSCF(WY_END, PEAK_SEASON).select('scf')
                 .gte(PERSIST_THRESH).selfMask(), {palette: ['ffffff']},
               'Binary snow ' + PEAK_SEASON.name + ' WY' + WY_END, false);
  Map.addLayer(TRENDS[PEAK_SEASON.name].select('trend_pct_decade'),
               {min: -12, max: 12, palette: TREND_PALETTE},
               'TREND ' + PEAK_SEASON.name + ' SCF %/decade (red = loss)');
}

if (SHOW_ANIMATION) {
  var animSeasons = (ANIM_MODE === 'ALL') ? SEASONS : [PEAK_SEASON];
  var previewFrames = [];
  for (var wyD = WY_START; wyD <= WY_END; wyD += ANIM_STRIDE) {
    for (var sj = 0; sj < animSeasons.length; sj++) {
      previewFrames.push(
        seasonalSCF(wyD, animSeasons[sj]).select('scf')
          .gte(PERSIST_THRESH).unmask(0).updateMask(DOMAIN_MASK)
          .visualize({min: 0, max: 1, palette: SNOW_PALETTE}));
    }
  }
  print('10 >>> ANIMATION PREVIEW <<< ' + previewFrames.length + ' frames:',
        ee.ImageCollection(previewFrames).getVideoThumbURL({
          dimensions: 700, region: DOMAIN_BBOX,
          framesPerSecond: 2, crs: 'EPSG:4326'}));
}

if (EXPORT_ANIMATION) {
  var vidSeasons = (ANIM_MODE === 'ALL') ? SEASONS : [PEAK_SEASON];
  var videoFrames = [];
  for (var wyV = WY_START; wyV <= WY_END; wyV++) {
    for (var sv = 0; sv < vidSeasons.length; sv++) {
      videoFrames.push(
        seasonalSCF(wyV, vidSeasons[sv]).select('scf')
          .gte(PERSIST_THRESH).unmask(0).updateMask(DOMAIN_MASK)
          .visualize({min: 0, max: 1, palette: SNOW_PALETTE}));
    }
  }
  Export.video.toDrive({
    collection: ee.ImageCollection(videoFrames),
    description: 'tp_binary_snow_animation_v2', folder: GDRIVE_FOLDER,
    fileNamePrefix: 'tp_binary_snow_animation_v2',
    framesPerSecond: 3, dimensions: 1200, region: DOMAIN_BBOX,
    crs: 'EPSG:4326', maxPixels: MAX_PIXELS});
}

if (PREVIEW_CHART) {
  var previewParts = [];
  for (var wyE = WY_START; wyE <= WY_END; wyE++) {
    previewParts.push(ee.Feature(null, {
      wy: wyE,
      sca_km2: seasonalSCF(wyE, PEAK_SEASON).select('scf').multiply(AREA_KM2)
                 .reduceRegion({reducer: ee.Reducer.sum(),
                                geometry: DOMAIN_GEOM, scale: S.preview,
                                maxPixels: MAX_PIXELS, bestEffort: true})
                 .get('scf')}));
  }
  print(ui.Chart.feature.byFeature(ee.FeatureCollection(previewParts),
                                   'wy', ['sca_km2'])
    .setChartType('LineChart')
    .setOptions({title: 'PREVIEW (' + S.preview + ' m): Third Pole, ' +
                        PEAK_SEASON.name + ' mean snow-covered area',
                 hAxis: {title: 'water year', format: '####'},
                 vAxis: {title: 'snow-covered area (km2)'},
                 pointSize: 4, lineWidth: 2, legend: {position: 'none'}}));
}


/* =============================================================================
 * 11. ERA5-Land 1950 -> present, banded by year (context line only)
 * -----------------------------------------------------------------------------
 *  12 monthly bands per year, ONE reduceRegions per year: 76 calls instead of
 *  912. At 11 km this is trivially cheap next to anything MODIS.
 *  UNITS: the EE band is documented as a 0-1 fraction, the ECMWF source is
 *  0-100 %. The print says which you have; normalise in Python.
 * ========================================================================== */

if (EXPORT_ERA5) {
  var ERA = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR').select('snow_cover');
  var ERA_Y0 = 1951, ERA_Y1 = WY_END;   // 1950 is partial (record starts Feb)

  print('11 >>> CHECK <<< ERA5 snow_cover percentiles (0-1 or 0-100?):',
        ERA.filterDate('2010-01-01', '2010-02-01').first().reduceRegion({
          reducer: ee.Reducer.percentile([50, 99]),
          geometry: rect([80, 30, 90, 35]), scale: 11132, maxPixels: 1e9}));

  var eraParts = [], eraSel = ['unit', 'level', 'year', 'land_km2'];
  for (var m = 1; m <= 12; m++) { eraSel.push('m' + (m < 10 ? '0' : '') + m); }

  // NB: no zero-image guard here. ERA5-Land MONTHLY_AGGR has exactly one image
  // per month with no gaps from 1951 onward, so .mean() on the one-image
  // collection just returns that image. Merging a zero image (as the MODIS
  // windows do) would halve every value -- mean([x, 0]) = x/2.
  for (var y = ERA_Y0; y <= ERA_Y1; y++) {
    var mb = [];
    for (var mm = 1; mm <= 12; mm++) {
      var d0 = ee.Date.fromYMD(y, mm, 1);
      mb.push(ERA.filterDate(d0, d0.advance(1, 'month'))
                 .mean().updateMask(DOMAIN_MASK)
                 .rename('m' + (mm < 10 ? '0' : '') + mm));
    }
    eraParts.push(
      ee.Image.cat(mb).reduceRegions({
        collection: REGIONS, reducer: ee.Reducer.mean(),
        scale: 11132, tileScale: TILE_SCALE
      }).map((function (yy) {
        return function (f) { return f.set('year', yy); };
      })(y))
    );
  }

  Export.table.toDrive({
    collection    : ee.FeatureCollection(eraParts).flatten(),
    description   : 'tp_era5_snowcover_v2',
    folder        : GDRIVE_FOLDER,
    fileNamePrefix: 'tp_era5_snowcover_v2',
    fileFormat    : 'CSV',
    selectors     : eraSel
  });
}


/* =============================================================================
 * 12. RUN ORDER AND COST
 * -----------------------------------------------------------------------------
 *  RUN 1  ~2 min.  EXPORT_REGIONS only; set EXPORT_SEASONAL_TABLE and
 *      EXPORT_ERA5 false so nothing competes. Read the >>> CHECK <<< prints,
 *      especially 2e (final region list) and 4 (scale check). Launch
 *      tp_regions_v2_asset, then PASTE THE ASSET ID INTO REGIONS_ASSET.
 *      Not optional: until REGIONS is an asset, every tile and chart point
 *      re-derives 11 box unions, ~20 country intersections and 13 MAIN_BAS
 *      dissolves. That is what made v1 time out.
 *
 *  RUN 2  minutes at PROFILE='FAST'.  EXPORT_SEASONAL_TABLE + EXPORT_ERA5.
 *      tp_sca_seasonal_v2_FAST.csv is every chart in the article: annual and
 *      seasonal SCA and snow-cover-days per region, ready for Mann-Kendall and
 *      Sen's slope in Python. Write the piece off this file.
 *
 *  RUN 3  background.  EXPORT_TRENDS, then EXPORT_SCF_RASTERS. Batch tasks, no
 *      interactive time limit, so start them and go away. These make the maps.
 *
 *  RUN 4  optional.  EXPORT_HF_TABLE for within-season min/max.
 *
 *  RUN 5  final numbers.  Set PROFILE='PUBLICATION' and re-run the seasonal
 *      table alone. Quote those km2 in the article; keep the FAST run for the
 *      exploratory charts. If the two disagree by more than a few percent on
 *      the headline regions, say so in the methods note.
 *
 *  IF A TASK FAILS
 *    "User memory limit exceeded"  -> raise TILE_SCALE to 8 or 16.
 *    "Computation timed out"       -> that is an INTERACTIVE limit (5 min).
 *                                     Batch exports do not have it. Set
 *                                     REGIONS_ASSET, or move the work to an
 *                                     Export instead of a print/Map.addLayer.
 *    "Too many concurrent aggregations" -> lower the number of bands per call
 *                                     (e.g. run seasons in two passes).
 *    Anything mentioning maxPixels -> raise it. It never affects speed.
 *
 *  CAVEATS FOR THE ARTICLE
 *    - MOD10A2 is a MAXIMUM snow extent over 8 days, so it runs a few percent
 *      high against a daily-mean SCA. Consistent through time, which is what a
 *      trend needs; do not compare its absolute values with a daily product.
 *    - Coarse PROFILE settings shift absolute km2 slightly and leave trends
 *      essentially untouched. Section 4 gives you the number for your domain.
 *    - Terra's orbit has drifted since 2022; footnote the overpass-time change.
 *    - SCA includes glaciers unless MASK_GLACIERS = true, which is why summer
 *      SCA never reaches zero.
 *    - Nothing below ELEV_MIN is counted.
 *    - Cloud is excluded from the denominator, never assumed snow-free. Check
 *      the clear/valid fraction before believing a monsoon-season number.
 *    - Report the Mann-Kendall p-value next to every slope. A 25-year trend in
 *      a high-variance region (Karakoram, western Himalaya) is not by itself a
 *      climate signal.
 * ========================================================================== */