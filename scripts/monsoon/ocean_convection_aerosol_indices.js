/***************************************************************
 South Asian Monsoon Ocean / Convection / Aerosol Extensions
 MEMORY-SAFE LONG-FORM EXPORT

 Output groups:
 1. OISST ocean SST indices
 2. GridSat-B1 convection / cold-cloud proxy indices
 3. MODIS MAIAC aerosol / AOD indices

 Design:
 - Raw monthly regional means only
 - Long format: one row per month per diagnostic region
 - Chunked exports to avoid GEE memory errors
 - No Console printing

 Analyse locally in Python:
 - climatology
 - anomalies
 - z-scores
 - seasonal windows
 - correlations/regressions
***************************************************************/


/***************************************************************
 0. USER SETTINGS
***************************************************************/

var EXPORT_FOLDER = 'GEE_ENSO_IOD_MONSOON';

var OISST_DATASET = 'NOAA/CDR/OISST/V2_1';
var GRIDSAT_DATASET = 'NOAA/CDR/GRIDSAT-B1/V2';
var MAIAC_DATASET = 'MODIS/061/MCD19A2_GRANULES';

// Scales chosen for regional index boxes.
// Increase these if tasks are slow or fail.
var OISST_SCALE_M = 27830;       // OISST ~0.25 degree
var GRIDSAT_SCALE_M = 25000;     // GridSat native ~7.8 km, coarsened for regional indices
var MAIAC_SCALE_M = 10000;       // MAIAC native 1 km, coarsened for regional indices

var TILE_SCALE = 8;

// Ocean SST: full study period.
var OCEAN_EXPORT_CHUNKS = [
  ['1982-01-01', '1990-12-01'],
  ['1991-01-01', '2000-12-01'],
  ['2001-01-01', '2010-12-01'],
  ['2011-01-01', '2020-12-01'],
  ['2021-01-01', '2025-12-01']
];

// GridSat-B1: GEE catalog currently available only up to 2024-09.
var CONVECTION_EXPORT_CHUNKS = [
  ['1982-01-01', '1990-12-01'],
  ['1991-01-01', '2000-12-01'],
  ['2001-01-01', '2010-12-01'],
  ['2011-01-01', '2024-09-01']
];

// MODIS MAIAC: start 2001 for complete calendar years.
var AEROSOL_EXPORT_CHUNKS = [
  ['2001-01-01', '2010-12-01'],
  ['2011-01-01', '2020-12-01'],
  ['2021-01-01', '2025-12-01']
];


/***************************************************************
 1. REGION HELPERS
***************************************************************/

function boxFeature(id, label, lonMin, latMin, lonMax, latMax) {
  var geom = ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax], null, false);

  return ee.Feature(geom, {
    'region_id': id,
    'region_label': label,
    'lon_min': lonMin,
    'lat_min': latMin,
    'lon_max': lonMax,
    'lat_max': latMax,
    'region_area_km2': geom.area(1).divide(1e6)
  });
}


function makeMonthStarts(startDateString, lastMonthString) {
  var firstMonth = ee.Date(startDateString);
  var lastMonth = ee.Date(lastMonthString);

  var nMonths = lastMonth
    .difference(firstMonth, 'month')
    .round();

  return ee.List.sequence(0, nMonths).map(function(n) {
    return firstMonth.advance(ee.Number(n), 'month');
  });
}


function isJJAS(monthNum) {
  monthNum = ee.Number(monthNum);
  return ee.Number(
    ee.Algorithms.If(monthNum.gte(6).and(monthNum.lte(9)), 1, 0)
  );
}


function isPreMonsoonMAM(monthNum) {
  monthNum = ee.Number(monthNum);
  return ee.Number(
    ee.Algorithms.If(monthNum.gte(3).and(monthNum.lte(5)), 1, 0)
  );
}


/***************************************************************
 2. OCEAN SST REGIONS
***************************************************************/

var OCEAN_REGIONS = ee.FeatureCollection([
  boxFeature(
    'indian_ocean_basin_box',
    'Indian Ocean basin-wide tropical SST box',
    40, -20, 110, 20
  ),

  boxFeature(
    'tropical_north_indian_ocean_box',
    'Tropical North Indian Ocean SST box',
    40, 0, 100, 25
  ),

  boxFeature(
    'arabian_sea_box',
    'Arabian Sea SST box',
    55, 5, 75, 25
  ),

  boxFeature(
    'bay_of_bengal_box',
    'Bay of Bengal SST box',
    80, 5, 100, 22
  ),

  boxFeature(
    'western_tropical_indian_ocean_box',
    'Western tropical Indian Ocean / WTIO-like SST box',
    50, -10, 70, 10
  ),

  boxFeature(
    'eastern_tropical_indian_ocean_box',
    'Southeastern tropical Indian Ocean / SETIO-like SST box',
    90, -10, 110, 0
  ),

  boxFeature(
    'south_equatorial_indian_ocean_box',
    'South equatorial Indian Ocean SST box',
    50, -20, 100, 0
  ),

  boxFeature(
    'maritime_continent_adjacent_box',
    'Maritime Continent adjacent ocean SST box',
    95, -10, 130, 10
  ),

  boxFeature(
    'western_north_pacific_box',
    'Western North Pacific warm-pool SST box',
    120, 5, 160, 25
  ),

  boxFeature(
    'tropical_north_atlantic_box',
    'Tropical North Atlantic SST teleconnection box',
    -60, 5, -15, 25
  )
]);


/***************************************************************
 3. OISST MONTHLY IMAGE
***************************************************************/

function prepOisstDaily(img) {
  var sstC = img.select('sst')
    .multiply(0.01)
    .rename('sst_c');

  var anomC = img.select('anom')
    .multiply(0.01)
    .rename('oisst_anom_c');

  var sstGe28 = sstC
    .gte(28)
    .toFloat()
    .rename('sst_ge_28c_fraction');

  var sstGe29 = sstC
    .gte(29)
    .toFloat()
    .rename('sst_ge_29c_fraction');

  var sstMinus28 = sstC
    .subtract(28)
    .rename('sst_minus_28c');

  return sstC
    .addBands(anomC)
    .addBands(sstGe28)
    .addBands(sstGe29)
    .addBands(sstMinus28)
    .copyProperties(img, ['system:time_start']);
}


var OCEAN_EXPORT_BANDS = [
  'sst_c',
  'oisst_anom_c',
  'sst_ge_28c_fraction',
  'sst_ge_29c_fraction',
  'sst_minus_28c'
];


function monthlyOisstImage(monthStart) {
  monthStart = ee.Date(monthStart);

  return ee.ImageCollection(OISST_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select(['sst', 'anom'])
    .map(prepOisstDaily)
    .mean()
    .select(OCEAN_EXPORT_BANDS)
    .toFloat()
    .set({
      'system:time_start': monthStart.millis(),
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthStart.get('month')
    });
}


function reduceOneOceanMonth(monthStart) {
  monthStart = ee.Date(monthStart);

  var img = monthlyOisstImage(monthStart);
  var monthNum = ee.Number(monthStart.get('month'));

  var reduced = img.reduceRegions({
    collection: OCEAN_REGIONS,
    reducer: ee.Reducer.mean(),
    scale: OISST_SCALE_M,
    tileScale: TILE_SCALE,
    maxPixelsPerRegion: 1e13
  });

  return reduced.map(function(f) {
    return f.set({
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthNum,
      'is_monsoon_jjas': isJJAS(monthNum),
      'is_pre_monsoon_mam': isPreMonsoonMAM(monthNum)
    });
  });
}


function buildOceanTable(startDateString, lastMonthString) {
  var starts = makeMonthStarts(startDateString, lastMonthString);

  return ee.FeatureCollection(
    starts.map(function(d) {
      return reduceOneOceanMonth(d);
    })
  ).flatten();
}


/***************************************************************
 4. CONVECTION / GRIDSAT REGIONS
***************************************************************/

var CONVECTION_REGIONS = ee.FeatureCollection([
  boxFeature(
    'south_asia_land_box',
    'Broad South Asian land monsoon convection box',
    60, 5, 100, 38
  ),

  boxFeature(
    'monsoon_core_box',
    'Central/northern Indian monsoon-core convection box',
    70, 15, 90, 28
  ),

  boxFeature(
    'indus_pakistan_monsoon_belt_box',
    'Pakistan / Indus monsoon belt convection box',
    65, 23, 77, 35
  ),

  boxFeature(
    'northeast_india_bangladesh_box',
    'Northeast India-Bangladesh convection box',
    88, 20, 96, 29
  ),

  boxFeature(
    'bay_of_bengal_box',
    'Bay of Bengal deep convection box',
    80, 5, 100, 25
  ),

  boxFeature(
    'arabian_sea_box',
    'Arabian Sea convection box',
    55, 5, 75, 25
  ),

  boxFeature(
    'equatorial_indian_ocean_box',
    'Equatorial Indian Ocean convection box',
    50, -10, 100, 10
  )
]);


/***************************************************************
 5. GRIDSAT MONTHLY IMAGE
***************************************************************/

function prepGridSat3Hourly(img) {
  // GridSat catalog scale/offset:
  // BT_K = raw * 0.01 + 200
  var irwinBtK = img.select('irwin_cdr')
    .multiply(0.01)
    .add(200)
    .rename('irwin_bt_k');

  var irwvpBtK = img.select('irwvp')
    .multiply(0.01)
    .add(200)
    .rename('irwvp_bt_k');

  // Cold cloud / deep convection proxies.
  // Lower IR window brightness temperature usually means colder cloud tops.
  var cold240 = irwinBtK
    .lt(240)
    .toFloat()
    .rename('cold_cloud_fraction_bt_lt_240k');

  var cold235 = irwinBtK
    .lt(235)
    .toFloat()
    .rename('cold_cloud_fraction_bt_lt_235k');

  var cold220 = irwinBtK
    .lt(220)
    .toFloat()
    .rename('deep_cold_cloud_fraction_bt_lt_220k');

  // Valid observation fraction based on the source band mask.
  var validObs = img.select('irwin_cdr')
    .mask()
    .gt(0)
    .toFloat()
    .unmask(0)
    .rename('gridsat_valid_observation_fraction');

  return irwinBtK
    .addBands(irwvpBtK)
    .addBands(cold240)
    .addBands(cold235)
    .addBands(cold220)
    .addBands(validObs)
    .copyProperties(img, ['system:time_start']);
}


var CONVECTION_EXPORT_BANDS = [
  'irwin_bt_k',
  'irwvp_bt_k',
  'cold_cloud_fraction_bt_lt_240k',
  'cold_cloud_fraction_bt_lt_235k',
  'deep_cold_cloud_fraction_bt_lt_220k',
  'gridsat_valid_observation_fraction'
];


function monthlyGridSatImage(monthStart) {
  monthStart = ee.Date(monthStart);

  return ee.ImageCollection(GRIDSAT_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select(['irwin_cdr', 'irwvp'])
    .map(prepGridSat3Hourly)
    .mean()
    .select(CONVECTION_EXPORT_BANDS)
    .toFloat()
    .set({
      'system:time_start': monthStart.millis(),
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthStart.get('month')
    });
}


function reduceOneConvectionMonth(monthStart) {
  monthStart = ee.Date(monthStart);

  var img = monthlyGridSatImage(monthStart);
  var monthNum = ee.Number(monthStart.get('month'));

  var reduced = img.reduceRegions({
    collection: CONVECTION_REGIONS,
    reducer: ee.Reducer.mean(),
    scale: GRIDSAT_SCALE_M,
    tileScale: TILE_SCALE,
    maxPixelsPerRegion: 1e13
  });

  return reduced.map(function(f) {
    return f.set({
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthNum,
      'is_monsoon_jjas': isJJAS(monthNum),
      'is_pre_monsoon_mam': isPreMonsoonMAM(monthNum)
    });
  });
}


function buildConvectionTable(startDateString, lastMonthString) {
  var starts = makeMonthStarts(startDateString, lastMonthString);

  return ee.FeatureCollection(
    starts.map(function(d) {
      return reduceOneConvectionMonth(d);
    })
  ).flatten();
}


/***************************************************************
 6. AEROSOL / MAIAC REGIONS
***************************************************************/

var AEROSOL_REGIONS = ee.FeatureCollection([
  boxFeature(
    'indo_gangetic_plain_box',
    'Indo-Gangetic Plain aerosol loading box',
    72, 23, 90, 31
  ),

  boxFeature(
    'pakistan_nw_india_dust_heat_box',
    'Pakistan / northwest India dust-heat aerosol box',
    65, 22, 78, 33
  ),

  boxFeature(
    'thar_sindh_rajasthan_box',
    'Thar-Sindh-Rajasthan dust-source aerosol box',
    68, 23, 76, 29
  ),

  boxFeature(
    'central_india_box',
    'Central India aerosol diagnostic box',
    73, 18, 88, 26
  ),

  boxFeature(
    'northeast_india_bangladesh_box',
    'Northeast India-Bangladesh aerosol/humidity box',
    88, 20, 96, 29
  ),

  boxFeature(
    'western_ghats_west_coast_box',
    'Western Ghats / west-coast aerosol box',
    72, 8, 77, 21
  ),

  boxFeature(
    'himalayan_foothills_box',
    'Himalayan foothills aerosol transport box',
    72, 28, 92, 34
  )
]);


/***************************************************************
 7. MAIAC AEROSOL PREP
***************************************************************/

function prepMaiacDaily(img) {
  var qa = img.select('AOD_QA');

  // Bits 0-2: cloud mask.
  var cloudMask = qa.bitwiseAnd(7);
  var clear = cloudMask.eq(1);

  // Bits 3-4: land/water/snow/ice mask.
  var landWaterSnowIce = qa.rightShift(3).bitwiseAnd(3);
  var land = landWaterSnowIce.eq(0);

  // Bits 8-11: QA for AOD.
  var aodQa = qa.rightShift(8).bitwiseAnd(15);
  var bestQuality = aodQa.eq(0);

  // Bits 13-14: aerosol model.
  var aerosolModel = qa.rightShift(13).bitwiseAnd(3);
  var smokeModel = aerosolModel.eq(1);
  var dustModel = aerosolModel.eq(2);

  var aod047 = img.select('Optical_Depth_047')
    .multiply(0.001)
    .rename('aod047_all_valid');

  var aod055 = img.select('Optical_Depth_055')
    .multiply(0.001)
    .rename('aod055_all_valid');

  var aodUnc = img.select('AOD_Uncertainty')
    .multiply(0.0001)
    .rename('aod_uncertainty');

  var columnWv = img.select('Column_WV')
    .multiply(0.001)
    .rename('column_water_vapor_cm');

  // Physical range masks for AOD. Negative values are not valid AOD.
  var aodValidRange = aod055.gte(0).and(aod055.lte(5));

  // Strict high-quality clear-land AOD.
  var strictMask = clear.and(land).and(bestQuality).and(aodValidRange);

  var aod047Strict = aod047
    .updateMask(strictMask)
    .rename('aod047_clear_land_best');

  var aod055Strict = aod055
    .updateMask(strictMask)
    .rename('aod055_clear_land_best');

  var aodUncStrict = aodUnc
    .updateMask(strictMask)
    .rename('aod_uncertainty_clear_land_best');

  var wvStrict = columnWv
    .updateMask(strictMask)
    .rename('column_water_vapor_cm_clear_land_best');

  // Diagnostic fractions.
  var validRetrievalFraction = strictMask
    .toFloat()
    .unmask(0)
    .rename('maiac_valid_clear_land_best_fraction');

  var dustFraction = dustModel
    .and(strictMask)
    .toFloat()
    .unmask(0)
    .rename('maiac_dust_model_fraction');

  var smokeFraction = smokeModel
    .and(strictMask)
    .toFloat()
    .unmask(0)
    .rename('maiac_smoke_model_fraction');

  var clearLandFraction = clear
    .and(land)
    .toFloat()
    .unmask(0)
    .rename('maiac_clear_land_fraction');

  return aod047Strict
    .addBands(aod055Strict)
    .addBands(aodUncStrict)
    .addBands(wvStrict)
    .addBands(validRetrievalFraction)
    .addBands(clearLandFraction)
    .addBands(dustFraction)
    .addBands(smokeFraction)
    .copyProperties(img, ['system:time_start']);
}


var AEROSOL_EXPORT_BANDS = [
  'aod047_clear_land_best',
  'aod055_clear_land_best',
  'aod_uncertainty_clear_land_best',
  'column_water_vapor_cm_clear_land_best',
  'maiac_valid_clear_land_best_fraction',
  'maiac_clear_land_fraction',
  'maiac_dust_model_fraction',
  'maiac_smoke_model_fraction'
];


function monthlyMaiacImage(monthStart) {
  monthStart = ee.Date(monthStart);

  return ee.ImageCollection(MAIAC_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select([
      'Optical_Depth_047',
      'Optical_Depth_055',
      'AOD_Uncertainty',
      'Column_WV',
      'AOD_QA'
    ])
    .map(prepMaiacDaily)
    .mean()
    .select(AEROSOL_EXPORT_BANDS)
    .toFloat()
    .set({
      'system:time_start': monthStart.millis(),
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthStart.get('month')
    });
}


function reduceOneAerosolMonth(monthStart) {
  monthStart = ee.Date(monthStart);

  var img = monthlyMaiacImage(monthStart);
  var monthNum = ee.Number(monthStart.get('month'));

  var reduced = img.reduceRegions({
    collection: AEROSOL_REGIONS,
    reducer: ee.Reducer.mean(),
    scale: MAIAC_SCALE_M,
    tileScale: TILE_SCALE,
    maxPixelsPerRegion: 1e13
  });

  return reduced.map(function(f) {
    return f.set({
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthNum,
      'is_monsoon_jjas': isJJAS(monthNum),
      'is_pre_monsoon_mam': isPreMonsoonMAM(monthNum)
    });
  });
}


function buildAerosolTable(startDateString, lastMonthString) {
  var starts = makeMonthStarts(startDateString, lastMonthString);

  return ee.FeatureCollection(
    starts.map(function(d) {
      return reduceOneAerosolMonth(d);
    })
  ).flatten();
}


/***************************************************************
 8. EXPORT SELECTORS
***************************************************************/

var BASE_SELECTORS = [
  'date_yyyy_mm',
  'year',
  'month',
  'is_monsoon_jjas',
  'is_pre_monsoon_mam',

  'region_id',
  'region_label',
  'lon_min',
  'lat_min',
  'lon_max',
  'lat_max',
  'region_area_km2'
];

var OCEAN_SELECTORS = BASE_SELECTORS.concat(OCEAN_EXPORT_BANDS);
var CONVECTION_SELECTORS = BASE_SELECTORS.concat(CONVECTION_EXPORT_BANDS);
var AEROSOL_SELECTORS = BASE_SELECTORS.concat(AEROSOL_EXPORT_BANDS);


/***************************************************************
 9. OCEAN EXPORT TASKS
***************************************************************/

OCEAN_EXPORT_CHUNKS.forEach(function(chunk) {
  var startDate = chunk[0];
  var lastMonth = chunk[1];

  var table = buildOceanTable(startDate, lastMonth)
    .select(OCEAN_SELECTORS);

  var startLabel = startDate.slice(0, 7).replace('-', '');
  var endLabel = lastMonth.slice(0, 7).replace('-', '');

  var filePrefix =
    'south_asia_monsoon_ocean_oisst_indices_' +
    startLabel + '_' + endLabel +
    '_raw_monthly_long';

  Export.table.toDrive({
    collection: table,
    description: filePrefix + '_csv',
    folder: EXPORT_FOLDER,
    fileNamePrefix: filePrefix,
    fileFormat: 'CSV',
    selectors: OCEAN_SELECTORS
  });
});


/***************************************************************
 10. CONVECTION EXPORT TASKS
***************************************************************/

CONVECTION_EXPORT_CHUNKS.forEach(function(chunk) {
  var startDate = chunk[0];
  var lastMonth = chunk[1];

  var table = buildConvectionTable(startDate, lastMonth)
    .select(CONVECTION_SELECTORS);

  var startLabel = startDate.slice(0, 7).replace('-', '');
  var endLabel = lastMonth.slice(0, 7).replace('-', '');

  var filePrefix =
    'south_asia_monsoon_convection_gridsat_indices_' +
    startLabel + '_' + endLabel +
    '_raw_monthly_long';

  Export.table.toDrive({
    collection: table,
    description: filePrefix + '_csv',
    folder: EXPORT_FOLDER,
    fileNamePrefix: filePrefix,
    fileFormat: 'CSV',
    selectors: CONVECTION_SELECTORS
  });
});


/***************************************************************
 11. AEROSOL EXPORT TASKS
***************************************************************/

AEROSOL_EXPORT_CHUNKS.forEach(function(chunk) {
  var startDate = chunk[0];
  var lastMonth = chunk[1];

  var table = buildAerosolTable(startDate, lastMonth)
    .select(AEROSOL_SELECTORS);

  var startLabel = startDate.slice(0, 7).replace('-', '');
  var endLabel = lastMonth.slice(0, 7).replace('-', '');

  var filePrefix =
    'south_asia_monsoon_aerosol_maiac_indices_' +
    startLabel + '_' + endLabel +
    '_raw_monthly_long';

  Export.table.toDrive({
    collection: table,
    description: filePrefix + '_csv',
    folder: EXPORT_FOLDER,
    fileNamePrefix: filePrefix,
    fileFormat: 'CSV',
    selectors: AEROSOL_SELECTORS
  });
});