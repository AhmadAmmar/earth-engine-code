/*
===============================================================================
SOUTH ASIAN MONSOON PRECIPITATION — 2026 REFRESH / COMPLETION EXPORT
Google Earth Engine JavaScript
===============================================================================

PURPOSE
-------
Refresh the precipitation side of the South Asian monsoon figure as far into
2026 as the Earth Engine catalog actually permits, without contaminating the
complete 1982–2025 JJAS historical record.

PRIMARY DATASET (for continuity with the existing figure)
  UCSB-CHG/CHIRPS/DAILY  — CHIRPS v2 daily, precipitation [mm/day]

SUPPLEMENTARY CURRENT-CONDITIONS DATASET (DO NOT splice into CHIRPS bars)
  NASA/GPM_L3/IMERG_V07  — IMERG V07 half-hourly, precipitation [mm/hour]

SCIENTIFIC RULES
----------------
1) 1982–2025 JJAS remains the complete historical/inferential record.
2) CHIRPS v2 is used for the primary rainfall series because that is the
   dataset already used by the project.
3) For 2026, this script detects the latest CHIRPS day actually present in GEE.
4) It exports:
   A. 2026 CHIRPS monthly rainfall with explicit completeness flags.
   B. CHIRPS matched season-to-date (1 June -> latest available CHIRPS day)
      for every year 1982–2026, so 2026 can be compared apples-to-apples.
   C. Fixed CHIRPS JJ, JJA and JJAS windows for 1982–2026, with incomplete
      2026 windows left NULL rather than silently treated as complete.
   D. Optional IMERG JJA 2001–2026 and 2026 Jun–Sep current-context tables.
      These are an independent near-real-time check only.
5) No partial month/season is written into the "complete" rainfall field.
   Partial accumulation is exported separately as rain_available_period_mm.
6) Spatial rainfall is an explicit pixel-area-weighted mean:
      sum(rain_mm * pixel_area) / sum(pixel_area)
   over the same South Asian land union used in the prior project code:
   Pakistan, India, Bangladesh, Nepal, Bhutan, Sri Lanka
   from USDOS/LSIB_SIMPLE/2017.

EXPECTED USE AFTER EXPORT
-------------------------
- If CHIRPS has complete July 2026 but not August:
    use the matched 1 Jun–31 Jul or fixed JJ 2026 rainfall as a
    "2026* provisional JJ" rainfall point, standardized against historical
    JJ 1991–2020. Keep 1982–2025 JJAS trend/correlation unchanged.
- If CHIRPS later has complete August:
    use JJA 2026 versus historical JJA.
- Only after September is complete should 2026 join the complete JJAS series.
- IMERG can independently show whether JJA 2026 was wet/dry using IMERG's
  own historical record; do NOT substitute an IMERG number into a CHIRPS bar.

Run date intended: 7–8 September 2026.
===============================================================================
*/


// ============================================================================
// 0. SETTINGS
// ============================================================================

var CURRENT_YEAR = 2026;
var HIST_START_YEAR = 1982;
var HIST_END_YEAR = 2025;
var CLIM_START_YEAR = 1991;
var CLIM_END_YEAR = 2020;

var EXPORT_FOLDER = 'GEE_ENSO_IOD_MONSOON';

var CHIRPS_DATASET = 'UCSB-CHG/CHIRPS/DAILY';
var IMERG_DATASET = 'NASA/GPM_L3/IMERG_V07';

var CHIRPS_SCALE_M = 5566;
var IMERG_SCALE_M = 11132;

var TILE_SCALE = 8;

// We ask GEE for data through 8 Sep 2026 inclusive.
// filterDate end is exclusive, hence 2026-09-09.
var REQUEST_END_EXCLUSIVE = ee.Date('2026-09-09');

// Keep this true: IMERG is useful as a current independent check.
// It is NOT merged into the CHIRPS historical series.
var EXPORT_IMERG_SUPPLEMENT = true;


// ============================================================================
// 1. SOUTH ASIAN STUDY REGION — SAME DEFINITION AS PRIOR PROJECT CODE
// ============================================================================

var countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

var southAsiaCountries = countries.filter(
  ee.Filter.inList('country_na', [
    'Pakistan',
    'India',
    'Bangladesh',
    'Nepal',
    'Bhutan',
    'Sri Lanka'
  ])
);

var SOUTH_ASIA_AOI = southAsiaCountries.geometry();

Map.centerObject(SOUTH_ASIA_AOI, 4);
Map.addLayer(
  southAsiaCountries.style({
    color: '444444',
    fillColor: '00000000',
    width: 1
  }),
  {},
  'South Asian rainfall study region',
  false
);


// ============================================================================
// 2. DATA COLLECTIONS
// ============================================================================

var chirps = ee.ImageCollection(CHIRPS_DATASET)
  .select('precipitation');

var imerg = ee.ImageCollection(IMERG_DATASET)
  .select('precipitation');


// ============================================================================
// 3. GENERAL HELPERS
// ============================================================================

function bool01(condition) {
  return ee.Number(ee.Algorithms.If(condition, 1, 0));
}


function dateStringFromMillis(millis) {
  return ee.Date(ee.Number(millis)).format('YYYY-MM-dd');
}


function dateTimeStringFromMillis(millis) {
  return ee.Date(ee.Number(millis)).format("YYYY-MM-dd'T'HH:mm");
}


/*
Area-weighted spatial statistics for an accumulation image in mm.

Mean depth:
    Σ(mm_i * area_i) / Σ(area_i)

Volume:
    mm * m² = 10^-3 m³
    km³ = / 10^9
    therefore Σ(mm_i * area_i) / 10^12
*/
function areaWeightedRainStats(rainImage, geometry, scaleMeters) {
  var rain = rainImage.rename('rain_mm');

  var area = ee.Image.pixelArea()
    .updateMask(rain.mask())
    .rename('area_m2');

  var rainArea = rain.multiply(area)
    .rename('rain_mm_area_m2');

  var sums = rainArea.addBands(area).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: scaleMeters,
    maxPixels: 1e13,
    tileScale: TILE_SCALE,
    bestEffort: false
  });

  var rainMmAreaM2 = ee.Number(sums.get('rain_mm_area_m2'));
  var areaM2 = ee.Number(sums.get('area_m2'));

  return ee.Dictionary({
    rain_area_weighted_mean_mm: rainMmAreaM2.divide(areaM2),
    rain_volume_km3: rainMmAreaM2.divide(1e12),
    effective_area_km2: areaM2.divide(1e6)
  });
}


/*
CHIRPS accumulation over an arbitrary date range.

Returns both:
- available-period accumulation (whatever images actually exist)
- completeness metadata

The caller decides whether it is scientifically valid to expose the
accumulation as a complete month/season.
*/
function chirpsWindowStats(startDate, endDateExclusive) {
  startDate = ee.Date(startDate);
  endDateExclusive = ee.Date(endDateExclusive);

  var col = chirps.filterDate(startDate, endDateExclusive);
  var n = col.size();

  var expectedDays = endDateExclusive
    .difference(startDate, 'day')
    .round();

  var complete = n.eq(expectedDays);

  var empty = ee.Dictionary({
    rain_area_weighted_mean_mm: null,
    rain_volume_km3: null,
    effective_area_km2: null
  });

  var stats = ee.Dictionary(
    ee.Algorithms.If(
      n.gt(0),
      areaWeightedRainStats(
        col.sum().rename('rain_mm'),
        SOUTH_ASIA_AOI,
        CHIRPS_SCALE_M
      ),
      empty
    )
  );

  return stats
    .set('n_chirps_daily_images', n)
    .set('n_days_expected', expectedDays)
    .set('is_complete_by_data', bool01(complete));
}


/*
IMERG V07 accumulation.

IMERG 'precipitation' is mm/hour at 30-minute cadence.
Each image therefore contributes:
    rate [mm/hour] * 0.5 hour = mm

For complete fixed windows, expected number of images is:
    days * 48
*/
function imergWindowStats(startDate, endDateExclusive) {
  startDate = ee.Date(startDate);
  endDateExclusive = ee.Date(endDateExclusive);

  var col = imerg.filterDate(startDate, endDateExclusive);
  var n = col.size();

  var expectedIntervals = endDateExclusive
    .difference(startDate, 'day')
    .multiply(48)
    .round();

  var complete = n.eq(expectedIntervals);

  var empty = ee.Dictionary({
    rain_area_weighted_mean_mm: null,
    rain_volume_km3: null,
    effective_area_km2: null
  });

  var stats = ee.Dictionary(
    ee.Algorithms.If(
      n.gt(0),
      areaWeightedRainStats(
        col.sum().multiply(0.5).rename('rain_mm'),
        SOUTH_ASIA_AOI,
        IMERG_SCALE_M
      ),
      empty
    )
  );

  var nProvisional = col.filter(
    ee.Filter.eq('status', 'provisional')
  ).size();

  var nPermanent = col.filter(
    ee.Filter.eq('status', 'permanent')
  ).size();

  return stats
    .set('n_imerg_halfhour_images', n)
    .set('n_halfhours_expected', expectedIntervals)
    .set('n_imerg_provisional', nProvisional)
    .set('n_imerg_permanent', nPermanent)
    .set('is_complete_by_data', bool01(complete));
}


// ============================================================================
// 4. LIVE DATA-AVAILABILITY DIAGNOSTICS
// ============================================================================

var chirps2026Monsoon = chirps.filterDate(
  ee.Date.fromYMD(CURRENT_YEAR, 6, 1),
  REQUEST_END_EXCLUSIVE
);

var nChirps2026Monsoon = chirps2026Monsoon.size();

var latestChirpsMillis = chirps2026Monsoon
  .aggregate_max('system:time_start');

var latestChirpsDate = ee.Date(ee.Number(latestChirpsMillis));

var latestChirpsMonth = ee.Number(latestChirpsDate.get('month'));
var latestChirpsDay = ee.Number(latestChirpsDate.get('day'));


var imerg2026Monsoon = imerg.filterDate(
  ee.Date.fromYMD(CURRENT_YEAR, 6, 1),
  REQUEST_END_EXCLUSIVE
);

var nImerg2026Monsoon = imerg2026Monsoon.size();

var latestImergMillis = imerg2026Monsoon
  .aggregate_max('system:time_start');

var latestImergDateTime = ee.Date(ee.Number(latestImergMillis));


print('============================================================');
print('LIVE DATA AVAILABILITY');
print('============================================================');
print('CHIRPS dataset:', CHIRPS_DATASET);
print('CHIRPS 2026 monsoon daily images:', nChirps2026Monsoon);
print('Latest CHIRPS date actually present:',
      latestChirpsDate.format('YYYY-MM-dd'));
print('');
print('IMERG dataset:', IMERG_DATASET);
print('IMERG 2026 monsoon half-hour images:', nImerg2026Monsoon);
print('Latest IMERG timestamp actually present:',
      latestImergDateTime.format("YYYY-MM-dd'T'HH:mm"));
print('');
print('IMPORTANT: the latest date is detected from the collection itself.');
print('Do not assume that an August/September calendar date means CHIRPS');
print('has August/September data.');


// ============================================================================
// 5. EXPORT A — CHIRPS MONTHLY 2026 REFRESH
// ============================================================================

function buildChirpsMonthly2026(monthNumber) {
  monthNumber = ee.Number(monthNumber);

  var start = ee.Date.fromYMD(CURRENT_YEAR, monthNumber, 1);
  var end = start.advance(1, 'month');

  var stats = chirpsWindowStats(start, end);

  var n = ee.Number(stats.get('n_chirps_daily_images'));
  var complete = ee.Number(stats.get('is_complete_by_data'));

  var availableMm = stats.get('rain_area_weighted_mean_mm');
  var availableKm3 = stats.get('rain_volume_km3');

  // Complete-month fields are NULL unless every expected daily image exists.
  var completeMm = ee.Algorithms.If(
    complete.eq(1),
    availableMm,
    null
  );

  var completeKm3 = ee.Algorithms.If(
    complete.eq(1),
    availableKm3,
    null
  );

  return ee.Feature(null, {
    dataset: 'CHIRPS v2 daily',
    dataset_id: CHIRPS_DATASET,
    region_id: 'legacy_indian_subcontinent_union',
    public_region: 'South Asian monsoon region',
    date_yyyy_mm: start.format('YYYY-MM'),
    year: CURRENT_YEAR,
    month: monthNumber,

    n_days_expected: stats.get('n_days_expected'),
    n_chirps_daily_images: n,
    is_complete_month_by_data: complete,

    // Use this for the monthly scientific table.
    rain_monthly_mm: completeMm,
    rain_monthly_volume_km3: completeKm3,

    // This may be partial and must never be mistaken for a full month.
    rain_available_period_mm: availableMm,
    rain_available_period_volume_km3: availableKm3,

    effective_area_km2: stats.get('effective_area_km2'),
    rainfall_spatial_statistic:
      'pixel-area-weighted mean of accumulated daily precipitation',
    rainfall_volume_calculation:
      'sum_rain_mm_times_pixel_area_divide_1e12'
  });
}


// Jan through Sep 2026. Months not present in CHIRPS remain null/flagged.
var chirpsMonthly2026 = ee.FeatureCollection(
  ee.List.sequence(1, 9).map(buildChirpsMonthly2026)
);

print('');
print('============================================================');
print('CHIRPS 2026 MONTHLY AVAILABILITY');
print('============================================================');
print(chirpsMonthly2026);

Export.table.toDrive({
  collection: chirpsMonthly2026,
  description: 'sam_chirps_v2_monthly_2026_refresh_to_latest',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'sam_chirps_v2_monthly_2026_refresh_to_latest',
  fileFormat: 'CSV',
  selectors: [
    'dataset',
    'dataset_id',
    'region_id',
    'public_region',
    'date_yyyy_mm',
    'year',
    'month',
    'n_days_expected',
    'n_chirps_daily_images',
    'is_complete_month_by_data',
    'rain_monthly_mm',
    'rain_monthly_volume_km3',
    'rain_available_period_mm',
    'rain_available_period_volume_km3',
    'effective_area_km2',
    'rainfall_spatial_statistic',
    'rainfall_volume_calculation'
  ]
});


// ============================================================================
// 6. EXPORT B — CHIRPS MATCHED MONSOON SEASON-TO-DATE, 1982–2026
// ============================================================================

/*
This is the most important provisional comparison.

Example:
If latest CHIRPS date is 2026-07-31, every year is compared over exactly:
  1 June -> 31 July

If CHIRPS later reaches 2026-08-31, rerunning this same script automatically
changes the matched window to:
  1 June -> 31 August

Therefore 2026 is always compared with the SAME calendar window historically.
*/

function buildMatchedChirpsSeasonToDate(year) {
  year = ee.Number(year);

  var start = ee.Date.fromYMD(year, 6, 1);

  var lastComparableDay = ee.Date.fromYMD(
    year,
    latestChirpsMonth,
    latestChirpsDay
  );

  var endExclusive = lastComparableDay.advance(1, 'day');

  var stats = chirpsWindowStats(start, endExclusive);

  var complete = ee.Number(stats.get('is_complete_by_data'));

  return ee.Feature(null, {
    dataset: 'CHIRPS v2 daily',
    dataset_id: CHIRPS_DATASET,
    region_id: 'legacy_indian_subcontinent_union',
    public_region: 'South Asian monsoon region',

    year: year,
    window_name: 'monsoon_season_to_date_matched',
    window_start_mm_dd: '06-01',
    window_end_mm_dd_inclusive:
      latestChirpsDate.format('MM-dd'),

    start_date: start.format('YYYY-MM-dd'),
    end_date_inclusive: lastComparableDay.format('YYYY-MM-dd'),

    n_days_expected: stats.get('n_days_expected'),
    n_chirps_daily_images: stats.get('n_chirps_daily_images'),
    is_complete_window_by_data: complete,

    // Because this exact historical window is expected to be fully available,
    // expose the comparable value only when complete.
    rain_stod_mm: ee.Algorithms.If(
      complete.eq(1),
      stats.get('rain_area_weighted_mean_mm'),
      null
    ),

    rain_stod_volume_km3: ee.Algorithms.If(
      complete.eq(1),
      stats.get('rain_volume_km3'),
      null
    ),

    rain_available_period_mm:
      stats.get('rain_area_weighted_mean_mm'),

    effective_area_km2: stats.get('effective_area_km2'),

    climatology_recommended_start: CLIM_START_YEAR,
    climatology_recommended_end: CLIM_END_YEAR
  });
}


var chirpsMatchedSTOD = ee.FeatureCollection(
  ee.List.sequence(HIST_START_YEAR, CURRENT_YEAR)
    .map(buildMatchedChirpsSeasonToDate)
);

print('');
print('============================================================');
print('CHIRPS MATCHED SEASON-TO-DATE 1982–2026');
print('============================================================');
print('Matched end month/day:',
      latestChirpsDate.format('MM-dd'));
print(chirpsMatchedSTOD);

Export.table.toDrive({
  collection: chirpsMatchedSTOD,
  description: 'sam_chirps_v2_matched_monsoon_stod_1982_2026',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'sam_chirps_v2_matched_monsoon_stod_1982_2026',
  fileFormat: 'CSV',
  selectors: [
    'dataset',
    'dataset_id',
    'region_id',
    'public_region',
    'year',
    'window_name',
    'window_start_mm_dd',
    'window_end_mm_dd_inclusive',
    'start_date',
    'end_date_inclusive',
    'n_days_expected',
    'n_chirps_daily_images',
    'is_complete_window_by_data',
    'rain_stod_mm',
    'rain_stod_volume_km3',
    'rain_available_period_mm',
    'effective_area_km2',
    'climatology_recommended_start',
    'climatology_recommended_end'
  ]
});


// ============================================================================
// 7. EXPORT C — FIXED CHIRPS JJ / JJA / JJAS WINDOWS, 1982–2026
// ============================================================================

function buildFixedChirpsWindow(year, windowName, endMonthExclusive) {
  year = ee.Number(year);
  endMonthExclusive = ee.Number(endMonthExclusive);

  var start = ee.Date.fromYMD(year, 6, 1);
  var end = ee.Date.fromYMD(year, endMonthExclusive, 1);

  var stats = chirpsWindowStats(start, end);

  var complete = ee.Number(stats.get('is_complete_by_data'));

  return ee.Feature(null, {
    dataset: 'CHIRPS v2 daily',
    dataset_id: CHIRPS_DATASET,
    region_id: 'legacy_indian_subcontinent_union',
    public_region: 'South Asian monsoon region',

    year: year,
    window_name: windowName,
    start_date: start.format('YYYY-MM-dd'),
    end_date_exclusive: end.format('YYYY-MM-dd'),

    n_days_expected: stats.get('n_days_expected'),
    n_chirps_daily_images: stats.get('n_chirps_daily_images'),
    is_complete_window_by_data: complete,

    // THIS is the safe field for analysis.
    // It is NULL if the fixed window is incomplete.
    rain_season_mm: ee.Algorithms.If(
      complete.eq(1),
      stats.get('rain_area_weighted_mean_mm'),
      null
    ),

    rain_season_volume_km3: ee.Algorithms.If(
      complete.eq(1),
      stats.get('rain_volume_km3'),
      null
    ),

    // Diagnostic only: can contain a partial fixed-window accumulation.
    rain_available_period_mm:
      stats.get('rain_area_weighted_mean_mm'),

    effective_area_km2: stats.get('effective_area_km2'),

    climatology_recommended_start: CLIM_START_YEAR,
    climatology_recommended_end: CLIM_END_YEAR
  });
}


function fixedWindowCollection(windowName, endMonthExclusive) {
  return ee.FeatureCollection(
    ee.List.sequence(HIST_START_YEAR, CURRENT_YEAR)
      .map(function(y) {
        return buildFixedChirpsWindow(
          y,
          windowName,
          endMonthExclusive
        );
      })
  );
}


// End dates are exclusive:
// JJ   = Jun 1 -> Aug 1
// JJA  = Jun 1 -> Sep 1
// JJAS = Jun 1 -> Oct 1
var chirpsJJ = fixedWindowCollection('JJ', 8);
var chirpsJJA = fixedWindowCollection('JJA', 9);
var chirpsJJAS = fixedWindowCollection('JJAS', 10);

var chirpsFixedWindows = chirpsJJ
  .merge(chirpsJJA)
  .merge(chirpsJJAS);

print('');
print('============================================================');
print('FIXED CHIRPS WINDOWS — 2026 ROWS');
print('============================================================');
print(
  chirpsFixedWindows.filter(
    ee.Filter.eq('year', CURRENT_YEAR)
  )
);

Export.table.toDrive({
  collection: chirpsFixedWindows,
  description: 'sam_chirps_v2_JJ_JJA_JJAS_1982_2026',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'sam_chirps_v2_JJ_JJA_JJAS_1982_2026',
  fileFormat: 'CSV',
  selectors: [
    'dataset',
    'dataset_id',
    'region_id',
    'public_region',
    'year',
    'window_name',
    'start_date',
    'end_date_exclusive',
    'n_days_expected',
    'n_chirps_daily_images',
    'is_complete_window_by_data',
    'rain_season_mm',
    'rain_season_volume_km3',
    'rain_available_period_mm',
    'effective_area_km2',
    'climatology_recommended_start',
    'climatology_recommended_end'
  ]
});


// ============================================================================
// 8. QA — CHECK AGAINST VALUES ALREADY PRESENT IN THE LOCAL PIPELINE
// ============================================================================

/*
Your existing local table had approximately:
  June 2025 = 160.186006 mm
  July 2025 = 273.918116 mm

These console checks should be essentially identical if the geometry and
area-weighting are still consistent.
*/

function buildOneQaMonth(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var stats = chirpsWindowStats(start, end);

  return ee.Feature(null, {
    year: year,
    month: month,
    n_images: stats.get('n_chirps_daily_images'),
    complete: stats.get('is_complete_by_data'),
    rain_mm: stats.get('rain_area_weighted_mean_mm')
  });
}

print('');
print('============================================================');
print('QA AGAINST EXISTING PROJECT VALUES');
print('============================================================');
print('2025-06 expected approximately 160.186006 mm:',
      buildOneQaMonth(2025, 6));
print('2025-07 expected approximately 273.918116 mm:',
      buildOneQaMonth(2025, 7));


// ============================================================================
// 9. EXPORT D — IMERG V07 SUPPLEMENTARY NEAR-REAL-TIME CONTEXT
// ============================================================================

if (EXPORT_IMERG_SUPPLEMENT) {

  /*
  9A. Monthly 2026 Jun–Sep.

  Complete-month field is NULL unless all expected half-hour intervals exist.
  September-to-date remains in rain_available_period_mm only.
  */

  function buildImergMonthly2026(monthNumber) {
    monthNumber = ee.Number(monthNumber);

    var start = ee.Date.fromYMD(CURRENT_YEAR, monthNumber, 1);
    var end = start.advance(1, 'month');

    var stats = imergWindowStats(start, end);
    var complete = ee.Number(stats.get('is_complete_by_data'));

    return ee.Feature(null, {
      dataset: 'GPM IMERG V07 half-hourly',
      dataset_id: IMERG_DATASET,
      region_id: 'legacy_indian_subcontinent_union',
      public_region: 'South Asian monsoon region',

      date_yyyy_mm: start.format('YYYY-MM'),
      year: CURRENT_YEAR,
      month: monthNumber,

      n_halfhours_expected: stats.get('n_halfhours_expected'),
      n_imerg_halfhour_images: stats.get('n_imerg_halfhour_images'),
      n_imerg_provisional: stats.get('n_imerg_provisional'),
      n_imerg_permanent: stats.get('n_imerg_permanent'),
      is_complete_month_by_data: complete,

      // Safe complete-month value.
      rain_monthly_mm: ee.Algorithms.If(
        complete.eq(1),
        stats.get('rain_area_weighted_mean_mm'),
        null
      ),

      // May be partial for current month.
      rain_available_period_mm:
        stats.get('rain_area_weighted_mean_mm'),

      effective_area_km2: stats.get('effective_area_km2'),

      warning:
        'Supplement only; do not splice directly into CHIRPS historical bars'
    });
  }


  var imergMonthly2026 = ee.FeatureCollection(
    ee.List.sequence(6, 9).map(buildImergMonthly2026)
  );

  print('');
  print('============================================================');
  print('IMERG 2026 MONTHLY SUPPLEMENT');
  print('============================================================');
  print(imergMonthly2026);

  Export.table.toDrive({
    collection: imergMonthly2026,
    description: 'sam_imerg_v07_monthly_2026_near_realtime_supplement',
    folder: EXPORT_FOLDER,
    fileNamePrefix:
      'sam_imerg_v07_monthly_2026_near_realtime_supplement',
    fileFormat: 'CSV',
    selectors: [
      'dataset',
      'dataset_id',
      'region_id',
      'public_region',
      'date_yyyy_mm',
      'year',
      'month',
      'n_halfhours_expected',
      'n_imerg_halfhour_images',
      'n_imerg_provisional',
      'n_imerg_permanent',
      'is_complete_month_by_data',
      'rain_monthly_mm',
      'rain_available_period_mm',
      'effective_area_km2',
      'warning'
    ]
  });


  /*
  9B. Independent JJA series, 2001–2026.

  This allows a scientifically separate check of the 2026 JJA rainfall state
  using ONE dataset (IMERG) for every compared year.

  Do not combine its absolute rainfall values with CHIRPS.
  If used, compute an IMERG-only anomaly/z-score in Python.
  */

  function buildImergJja(year) {
    year = ee.Number(year);

    var start = ee.Date.fromYMD(year, 6, 1);
    var end = ee.Date.fromYMD(year, 9, 1);

    var stats = imergWindowStats(start, end);
    var complete = ee.Number(stats.get('is_complete_by_data'));

    return ee.Feature(null, {
      dataset: 'GPM IMERG V07 half-hourly',
      dataset_id: IMERG_DATASET,
      region_id: 'legacy_indian_subcontinent_union',
      public_region: 'South Asian monsoon region',

      year: year,
      window_name: 'JJA',
      start_date: start.format('YYYY-MM-dd'),
      end_date_exclusive: end.format('YYYY-MM-dd'),

      n_halfhours_expected: stats.get('n_halfhours_expected'),
      n_imerg_halfhour_images: stats.get('n_imerg_halfhour_images'),
      n_imerg_provisional: stats.get('n_imerg_provisional'),
      n_imerg_permanent: stats.get('n_imerg_permanent'),
      is_complete_window_by_data: complete,

      rain_jja_mm: ee.Algorithms.If(
        complete.eq(1),
        stats.get('rain_area_weighted_mean_mm'),
        null
      ),

      rain_available_period_mm:
        stats.get('rain_area_weighted_mean_mm'),

      effective_area_km2: stats.get('effective_area_km2'),

      recommended_reference_start: 2001,
      recommended_reference_end: 2020,

      warning:
        'IMERG-only validation series; do not merge absolute values with CHIRPS'
    });
  }


  var imergJJA = ee.FeatureCollection(
    ee.List.sequence(2001, CURRENT_YEAR)
      .map(buildImergJja)
  );

  print('');
  print('============================================================');
  print('IMERG JJA — 2026 ROW');
  print('============================================================');
  print(
    imergJJA.filter(
      ee.Filter.eq('year', CURRENT_YEAR)
    )
  );

  Export.table.toDrive({
    collection: imergJJA,
    description: 'sam_imerg_v07_JJA_2001_2026_supplement',
    folder: EXPORT_FOLDER,
    fileNamePrefix:
      'sam_imerg_v07_JJA_2001_2026_supplement',
    fileFormat: 'CSV',
    selectors: [
      'dataset',
      'dataset_id',
      'region_id',
      'public_region',
      'year',
      'window_name',
      'start_date',
      'end_date_exclusive',
      'n_halfhours_expected',
      'n_imerg_halfhour_images',
      'n_imerg_provisional',
      'n_imerg_permanent',
      'is_complete_window_by_data',
      'rain_jja_mm',
      'rain_available_period_mm',
      'effective_area_km2',
      'recommended_reference_start',
      'recommended_reference_end',
      'warning'
    ]
  });
}


// ============================================================================
// 10. SMALL METADATA EXPORT — MAKES THE CUT-OFF EXPLICIT IN THE LOCAL PIPELINE
// ============================================================================

var metadata = ee.FeatureCollection([
  ee.Feature(null, {
    generated_for_calendar_date: '2026-09-08',

    primary_dataset: CHIRPS_DATASET,
    primary_dataset_role:
      'historical continuity and primary rainfall figure',
    primary_latest_2026_date:
      latestChirpsDate.format('YYYY-MM-dd'),
    primary_2026_monsoon_images:
      nChirps2026Monsoon,

    supplement_dataset: IMERG_DATASET,
    supplement_dataset_role:
      'independent near-real-time precipitation context only',
    supplement_latest_2026_timestamp:
      latestImergDateTime.format("YYYY-MM-dd'T'HH:mm"),
    supplement_2026_monsoon_halfhour_images:
      nImerg2026Monsoon,

    region_internal_id:
      'legacy_indian_subcontinent_union',
    region_public_label:
      'South Asian monsoon region',
    region_countries:
      'Pakistan|India|Bangladesh|Nepal|Bhutan|Sri Lanka',

    historical_complete_record:
      'JJAS 1982-2025',
    historical_climatology:
      '1991-2020',

    rule:
      'Never treat incomplete 2026 month/season as complete; compare provisional 2026 with the same calendar window historically'
  })
]);

Export.table.toDrive({
  collection: metadata,
  description: 'sam_precipitation_2026_refresh_metadata',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'sam_precipitation_2026_refresh_metadata',
  fileFormat: 'CSV'
});


print('');
print('============================================================');
print('EXPORT TASKS CREATED');
print('============================================================');
print('Run these tasks from the Tasks tab:');
print('1) sam_chirps_v2_monthly_2026_refresh_to_latest');
print('2) sam_chirps_v2_matched_monsoon_stod_1982_2026');
print('3) sam_chirps_v2_JJ_JJA_JJAS_1982_2026');
if (EXPORT_IMERG_SUPPLEMENT) {
  print('4) sam_imerg_v07_monthly_2026_near_realtime_supplement');
  print('5) sam_imerg_v07_JJA_2001_2026_supplement');
}
print('6) sam_precipitation_2026_refresh_metadata');
print('');
print('PRIMARY FIGURE RULE:');
print('- Use CHIRPS only for the primary rainfall bars.');
print('- Use the matched CHIRPS season-to-date table for the provisional 2026 bar.');
print('- Keep 1982–2025 complete JJAS statistics unchanged.');
print('- IMERG is a separate validation/context series, not a CHIRPS patch.');
