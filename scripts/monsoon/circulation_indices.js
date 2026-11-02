/***************************************************************
 South Asian Monsoon Atmospheric Circulation Indices
 MEMORY-SAFE LONG-FORM EXPORT

 Dataset:
   ECMWF/ERA5/HOURLY

 Period:
   1982-01 to 2025-12

 Output:
   Three chunked CSV files, long format:
   date_yyyy_mm, year, month, region_id, region_label, variables...

 Why this version:
   - Avoids climatology/anomaly/z-score calculation inside GEE
   - Avoids huge wide feature tables
   - Uses monthly mean ERA5 fields first, then derives simple diagnostics
   - Exports time chunks to avoid out-of-memory errors

 No Console printing.
***************************************************************/


/***************************************************************
 0. USER SETTINGS
***************************************************************/

var START_YEAR = 1982;
var END_YEAR = 2025;

var EXPORT_FOLDER = 'GEE_ENSO_IOD_MONSOON';

var ERA5_DATASET = 'ECMWF/ERA5/HOURLY';

// ERA5 native grid is ~31 km. 50 km is usually enough for index boxes
// and is much safer for exports.
var ERA5_SCALE_M = 50000;

var TILE_SCALE = 8;

// Export chunks.
// If any chunk still fails, split it into smaller chunks, e.g. 5-year blocks.
var EXPORT_CHUNKS = [
  [1982, 1995],
  [1996, 2010],
  [2011, 2025]
];


/***************************************************************
 1. DIAGNOSTIC INDEX BOXES
***************************************************************/

function boxFeature(id, label, lonMin, latMin, lonMax, latMax) {
  var geom = ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax], null, false);

  return ee.Feature(geom, {
    'region_id': id,
    'region_label': label,
    'lon_min': lonMin,
    'lat_min': latMin,
    'lon_max': lonMax,
    'lat_max': latMax
  });
}

var ATMOS_REGIONS = ee.FeatureCollection([
  boxFeature(
    'somali_jet_box',
    'Somali Jet / Arabian Sea cross-equatorial low-level flow box',
    45, -5, 70, 20
  ),

  boxFeature(
    'arabian_sea_box',
    'Arabian Sea low-level monsoon flow and moisture box',
    55, 5, 75, 25
  ),

  boxFeature(
    'bay_of_bengal_box',
    'Bay of Bengal lower-tropospheric moisture inflow box',
    80, 5, 100, 25
  ),

  boxFeature(
    'monsoon_core_box',
    'Central/northern Indian monsoon-core diagnostic box',
    70, 15, 90, 28
  ),

  boxFeature(
    'nw_india_pakistan_heat_low_box',
    'Northwest India-Pakistan heat-low diagnostic box',
    65, 22, 78, 32
  ),

  boxFeature(
    'indian_landmass_box',
    'Broad Indian landmass thermal diagnostic box',
    68, 8, 90, 30
  ),

  boxFeature(
    'mascarene_high_box',
    'Mascarene High / southwest Indian Ocean pressure box',
    45, -40, 90, -20
  ),

  boxFeature(
    'tibetan_plateau_box',
    'Tibetan Plateau mid-tropospheric thermal diagnostic box',
    75, 28, 105, 38
  )
]);


/***************************************************************
 2. ERA5 BANDS
***************************************************************/

var ERA5_BANDS = [
  'mean_sea_level_pressure',
  'surface_pressure',
  'temperature_2m',
  'dewpoint_temperature_2m',

  'u_component_of_wind_850hPa',
  'v_component_of_wind_850hPa',
  'u_component_of_wind_500hPa',
  'v_component_of_wind_500hPa',

  'specific_humidity_850hPa',
  'specific_humidity_500hPa',
  'relative_humidity_850hPa',
  'relative_humidity_500hPa',

  'vertical_velocity_850hPa',
  'vertical_velocity_500hPa',
  'vorticity_850hPa',
  'vorticity_500hPa',
  'divergence_850hPa',
  'divergence_500hPa',

  'temperature_850hPa',
  'temperature_500hPa'
];


/***************************************************************
 3. DERIVED MONTHLY DIAGNOSTIC BANDS
***************************************************************/

function addDerivedBandsFromMonthlyMean(img) {
  var u850 = img.select('u_component_of_wind_850hPa');
  var v850 = img.select('v_component_of_wind_850hPa');

  var u500 = img.select('u_component_of_wind_500hPa');
  var v500 = img.select('v_component_of_wind_500hPa');

  var q850Gkg = img.select('specific_humidity_850hPa').multiply(1000);
  var q500Gkg = img.select('specific_humidity_500hPa').multiply(1000);

  var wind850 = u850.pow(2).add(v850.pow(2)).sqrt();
  var wind500 = u500.pow(2).add(v500.pow(2)).sqrt();

  var mslpHpa = img.select('mean_sea_level_pressure').divide(100);
  var surfacePressureHpa = img.select('surface_pressure').divide(100);

  var t2mC = img.select('temperature_2m').subtract(273.15);
  var d2mC = img.select('dewpoint_temperature_2m').subtract(273.15);
  var t850C = img.select('temperature_850hPa').subtract(273.15);
  var t500C = img.select('temperature_500hPa').subtract(273.15);

  // These are monthly-mean moisture-flow proxies:
  // monthly mean q850 × monthly mean u850/v850.
  // They are not exact hourly-mean q*u or q*v covariance terms.
  var moistureFluxU850Proxy = q850Gkg.multiply(u850);
  var moistureFluxV850Proxy = q850Gkg.multiply(v850);

  return ee.Image.cat([
    u850.rename('u850_ms'),
    v850.rename('v850_ms'),
    wind850.rename('wind850_ms'),

    u500.rename('u500_ms'),
    v500.rename('v500_ms'),
    wind500.rename('wind500_ms'),

    q850Gkg.rename('q850_gkg'),
    q500Gkg.rename('q500_gkg'),

    img.select('relative_humidity_850hPa').rename('rh850_pct'),
    img.select('relative_humidity_500hPa').rename('rh500_pct'),

    moistureFluxU850Proxy.rename('moisture_flux_u850_proxy_gkg_ms'),
    moistureFluxV850Proxy.rename('moisture_flux_v850_proxy_gkg_ms'),

    img.select('vertical_velocity_850hPa').rename('omega850_pa_s'),
    img.select('vertical_velocity_500hPa').rename('omega500_pa_s'),

    img.select('vorticity_850hPa').rename('vorticity850_s1'),
    img.select('vorticity_500hPa').rename('vorticity500_s1'),

    img.select('divergence_850hPa').rename('divergence850_s1'),
    img.select('divergence_500hPa').rename('divergence500_s1'),

    mslpHpa.rename('mslp_hpa'),
    surfacePressureHpa.rename('surface_pressure_hpa'),

    t2mC.rename('t2m_c'),
    d2mC.rename('d2m_c'),
    t850C.rename('t850_c'),
    t500C.rename('t500_c')
  ]).toFloat();
}

var EXPORT_BANDS = [
  'u850_ms',
  'v850_ms',
  'wind850_ms',

  'u500_ms',
  'v500_ms',
  'wind500_ms',

  'q850_gkg',
  'q500_gkg',

  'rh850_pct',
  'rh500_pct',

  'moisture_flux_u850_proxy_gkg_ms',
  'moisture_flux_v850_proxy_gkg_ms',

  'omega850_pa_s',
  'omega500_pa_s',

  'vorticity850_s1',
  'vorticity500_s1',

  'divergence850_s1',
  'divergence500_s1',

  'mslp_hpa',
  'surface_pressure_hpa',

  't2m_c',
  'd2m_c',
  't850_c',
  't500_c'
];


/***************************************************************
 4. MONTH SEQUENCE HELPERS
***************************************************************/

function makeMonthStarts(startYear, endYear) {
  var firstMonth = ee.Date.fromYMD(startYear, 1, 1);
  var lastMonth = ee.Date.fromYMD(endYear, 12, 1);

  var nMonths = lastMonth
    .difference(firstMonth, 'month')
    .round();

  return ee.List.sequence(0, nMonths).map(function(n) {
    return firstMonth.advance(ee.Number(n), 'month');
  });
}


/***************************************************************
 5. MONTHLY ERA5 IMAGE
***************************************************************/

function monthlyDerivedEra5Image(monthStart) {
  monthStart = ee.Date(monthStart);

  var monthlyMean = ee.ImageCollection(ERA5_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select(ERA5_BANDS)
    .mean();

  return addDerivedBandsFromMonthlyMean(monthlyMean)
    .set({
      'system:time_start': monthStart.millis(),
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthStart.get('month')
    });
}


/***************************************************************
 6. REDUCE ONE MONTH OVER ALL INDEX BOXES
***************************************************************/

function reduceOneMonth(monthStart) {
  monthStart = ee.Date(monthStart);

  var img = monthlyDerivedEra5Image(monthStart).select(EXPORT_BANDS);

  var monthNum = ee.Number(monthStart.get('month'));

  var reduced = img.reduceRegions({
    collection: ATMOS_REGIONS,
    reducer: ee.Reducer.mean(),
    scale: ERA5_SCALE_M,
    maxPixelsPerRegion: 1e13,
    tileScale: TILE_SCALE
  });

  return reduced.map(function(f) {
    return f.set({
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthNum,
      'is_monsoon_jjas': ee.Number(
        ee.Algorithms.If(monthNum.gte(6).and(monthNum.lte(9)), 1, 0)
      )
    });
  });
}


/***************************************************************
 7. BUILD CHUNKED LONG TABLE
***************************************************************/

function buildAtmosTableForYears(startYear, endYear) {
  var starts = makeMonthStarts(startYear, endYear);

  return ee.FeatureCollection(
    starts.map(function(d) {
      return reduceOneMonth(d);
    })
  ).flatten();
}


/***************************************************************
 8. EXPORTS
***************************************************************/

var SELECTORS = [
  'date_yyyy_mm',
  'year',
  'month',
  'is_monsoon_jjas',

  'region_id',
  'region_label',
  'lon_min',
  'lat_min',
  'lon_max',
  'lat_max'
].concat(EXPORT_BANDS);


// Create one export task per time chunk.
EXPORT_CHUNKS.forEach(function(chunk) {
  var chunkStart = chunk[0];
  var chunkEnd = chunk[1];

  var table = buildAtmosTableForYears(chunkStart, chunkEnd)
    .select(SELECTORS);

  var filePrefix =
    'south_asia_monsoon_atmospheric_circulation_indices_' +
    chunkStart + '_' + chunkEnd +
    '_raw_monthly_long';

  Export.table.toDrive({
    collection: table,
    description: filePrefix + '_csv',
    folder: EXPORT_FOLDER,
    fileNamePrefix: filePrefix,
    fileFormat: 'CSV',
    selectors: SELECTORS
  });
});