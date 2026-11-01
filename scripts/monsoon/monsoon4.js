/***************************************************************
 South Asian Monsoon Land-Surface and Cryosphere Indices
 MEMORY-SAFE LONG-FORM EXPORT

 Outputs:
 1. ERA5-Land monthly land-surface / reanalysis snow CSV chunks
    1982-2025

 2. MODIS MOD10A1 monthly observed snow-cover CSV chunks
    2001-2025

 No Console printing.

 Notes:
 - Exports raw monthly indices only.
 - Compute climatology/anomaly/z-score locally in Python.
 - Long format: one row per month per diagnostic region.
***************************************************************/


/***************************************************************
 0. USER SETTINGS
***************************************************************/

var START_YEAR = 1982;
var END_YEAR = 2025;

var MODIS_SNOW_START_YEAR = 2001;
var MODIS_SNOW_END_YEAR = 2025;

var EXPORT_FOLDER = 'GEE_ENSO_IOD_MONSOON';

var ERA5_LAND_DATASET = 'ECMWF/ERA5_LAND/MONTHLY_AGGR';
var MODIS_SNOW_DATASET = 'MODIS/061/MOD10A1';

// ERA5-Land native pixel size is ~11 km.
var ERA5_LAND_SCALE_M = 11132;

// MODIS snow is 500 m, but broad regional monthly indices do not need
// native 500 m processing. 5 km greatly reduces compute.
var MODIS_SNOW_SCALE_M = 5000;

var TILE_SCALE = 8;

// If any task fails, split these into smaller blocks.
var ERA5_LAND_EXPORT_CHUNKS = [
  [1982, 1990],
  [1991, 2000],
  [2001, 2010],
  [2011, 2020],
  [2021, 2025]
];

var MODIS_SNOW_EXPORT_CHUNKS = [
  [2001, 2010],
  [2011, 2020],
  [2021, 2025]
];


/***************************************************************
 1. DIAGNOSTIC REGIONS
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


// Land-surface regions.
// These are diagnostic boxes, not natural/admin boundaries.
var LAND_SURFACE_REGIONS = ee.FeatureCollection([
  boxFeature(
    'nw_india_pakistan_heat_low_box',
    'Northwest India-Pakistan heat-low / pre-monsoon land-heating box',
    65, 22, 78, 32
  ),

  boxFeature(
    'indian_landmass_box',
    'Broad Indian landmass thermal and soil-moisture diagnostic box',
    68, 8, 90, 30
  ),

  boxFeature(
    'indus_pakistan_monsoon_belt_box',
    'Pakistan / Indus monsoon belt diagnostic box',
    65, 23, 77, 35
  ),

  boxFeature(
    'central_india_monsoon_core_box',
    'Central India monsoon-core land-surface box',
    73, 18, 88, 26
  ),

  boxFeature(
    'gangetic_plains_box',
    'Gangetic Plains land-surface diagnostic box',
    76, 22, 90, 31
  ),

  boxFeature(
    'northeast_india_bangladesh_box',
    'Northeast India-Bangladesh humid monsoon box',
    88, 20, 96, 29
  ),

  boxFeature(
    'western_ghats_west_coast_box',
    'Western Ghats / west-coast monsoon land-surface box',
    72, 8, 77, 21
  ),

  boxFeature(
    'tibetan_plateau_box',
    'Tibetan Plateau thermal and snow diagnostic box',
    75, 28, 105, 38
  ),

  boxFeature(
    'western_himalaya_karakoram_hindukush_box',
    'Western Himalaya-Karakoram-Hindu Kush snow diagnostic box',
    68, 30, 82, 38
  ),

  boxFeature(
    'central_eastern_himalaya_box',
    'Central/Eastern Himalaya snow diagnostic box',
    80, 27, 98, 36
  )
]);


// MODIS cryosphere regions.
// Keep fewer regions for snow-cover export because MODIS is higher resolution.
var CRYOSPHERE_REGIONS = ee.FeatureCollection([
  boxFeature(
    'tibetan_plateau_box',
    'Tibetan Plateau snow-cover diagnostic box',
    75, 28, 105, 38
  ),

  boxFeature(
    'western_himalaya_karakoram_hindukush_box',
    'Western Himalaya-Karakoram-Hindu Kush snow-cover diagnostic box',
    68, 30, 82, 38
  ),

  boxFeature(
    'central_eastern_himalaya_box',
    'Central/Eastern Himalaya snow-cover diagnostic box',
    80, 27, 98, 36
  ),

  boxFeature(
    'upper_indus_cryosphere_box',
    'Upper Indus cryosphere diagnostic box',
    72, 32, 82, 37
  )
]);


/***************************************************************
 2. DATE HELPERS
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
 3. ERA5-LAND BANDS
***************************************************************/

var ERA5_LAND_BANDS = [
  'temperature_2m',
  'dewpoint_temperature_2m',
  'skin_temperature',

  'soil_temperature_level_1',
  'soil_temperature_level_2',
  'soil_temperature_level_3',
  'soil_temperature_level_4',

  'volumetric_soil_water_layer_1',
  'volumetric_soil_water_layer_2',
  'volumetric_soil_water_layer_3',
  'volumetric_soil_water_layer_4',

  'snow_albedo',
  'snow_cover',
  'snow_density',
  'snow_depth',
  'snow_depth_water_equivalent',
  'snowfall_sum',
  'snowmelt_sum',
  'snow_evaporation_sum',
  'temperature_of_snow_layer',

  'forecast_albedo',

  'total_precipitation_sum',
  'total_evaporation_sum',
  'potential_evaporation_sum',
  'runoff_sum',
  'surface_runoff_sum',
  'sub_surface_runoff_sum',

  'surface_latent_heat_flux_sum',
  'surface_sensible_heat_flux_sum',
  'surface_net_solar_radiation_sum',
  'surface_solar_radiation_downwards_sum',
  'surface_net_thermal_radiation_sum',
  'surface_thermal_radiation_downwards_sum'
];


/***************************************************************
 4. ERA5-LAND DERIVED MONTHLY BANDS
***************************************************************/

function addDerivedEra5LandBands(img, monthStart) {
  monthStart = ee.Date(monthStart);
  var secondsInMonth = monthStart.advance(1, 'month').difference(monthStart, 'second');

  // Temperatures: K to °C.
  var t2mC = img.select('temperature_2m').subtract(273.15);
  var d2mC = img.select('dewpoint_temperature_2m').subtract(273.15);
  var skinTC = img.select('skin_temperature').subtract(273.15);

  var st1C = img.select('soil_temperature_level_1').subtract(273.15);
  var st2C = img.select('soil_temperature_level_2').subtract(273.15);
  var st3C = img.select('soil_temperature_level_3').subtract(273.15);
  var st4C = img.select('soil_temperature_level_4').subtract(273.15);

  var snowTC = img.select('temperature_of_snow_layer').subtract(273.15);

  // Soil moisture layers.
  var swvl1 = img.select('volumetric_soil_water_layer_1');
  var swvl2 = img.select('volumetric_soil_water_layer_2');
  var swvl3 = img.select('volumetric_soil_water_layer_3');
  var swvl4 = img.select('volumetric_soil_water_layer_4');

  // Approximate layer-thickness weighted means.
  // Layer 1: 0-7 cm = 0.07 m
  // Layer 2: 7-28 cm = 0.21 m
  // Layer 3: 28-100 cm = 0.72 m
  // Layer 4: 100-289 cm = 1.89 m
  var soilMoisture_0_28m = swvl1.multiply(0.07)
    .add(swvl2.multiply(0.21))
    .divide(0.28);

  var soilMoisture_0_100m = swvl1.multiply(0.07)
    .add(swvl2.multiply(0.21))
    .add(swvl3.multiply(0.72))
    .divide(1.00);

  var soilMoisture_0_289m = swvl1.multiply(0.07)
    .add(swvl2.multiply(0.21))
    .add(swvl3.multiply(0.72))
    .add(swvl4.multiply(1.89))
    .divide(2.89);

  // Flow variables: m to mm.
  // ERA5-Land total_evaporation_sum uses ECMWF sign convention:
  // negative values usually indicate evaporation upward.
  var precipMm = img.select('total_precipitation_sum').multiply(1000);
  var evapMmPositiveUp = img.select('total_evaporation_sum').multiply(-1000);
  var potentialEvapMmPositiveUp = img.select('potential_evaporation_sum').multiply(-1000);
  var runoffMm = img.select('runoff_sum').multiply(1000);
  var surfaceRunoffMm = img.select('surface_runoff_sum').multiply(1000);
  var subSurfaceRunoffMm = img.select('sub_surface_runoff_sum').multiply(1000);

  // Snow variables.
  var snowCoverPct = img.select('snow_cover').multiply(100);
  var snowAlbedoPct = img.select('snow_albedo').multiply(100);
  var forecastAlbedoPct = img.select('forecast_albedo').multiply(100);
  var snowDepthCm = img.select('snow_depth').multiply(100);
  var sweMm = img.select('snow_depth_water_equivalent').multiply(1000);
  var snowfallMm = img.select('snowfall_sum').multiply(1000);
  var snowmeltMm = img.select('snowmelt_sum').multiply(1000);
  var snowEvapMmPositiveUp = img.select('snow_evaporation_sum').multiply(-1000);

  // Surface energy fluxes.
  // ERA5 convention: downward flux positive.
  // Here both downward W/m2 and positive-upward turbulent fluxes are provided.
  var latentDownWm2 = img.select('surface_latent_heat_flux_sum').divide(secondsInMonth);
  var sensibleDownWm2 = img.select('surface_sensible_heat_flux_sum').divide(secondsInMonth);
  var latentUpWm2 = latentDownWm2.multiply(-1);
  var sensibleUpWm2 = sensibleDownWm2.multiply(-1);

  var netSolarDownWm2 = img.select('surface_net_solar_radiation_sum').divide(secondsInMonth);
  var solarDownWm2 = img.select('surface_solar_radiation_downwards_sum').divide(secondsInMonth);
  var netThermalDownWm2 = img.select('surface_net_thermal_radiation_sum').divide(secondsInMonth);
  var thermalDownWm2 = img.select('surface_thermal_radiation_downwards_sum').divide(secondsInMonth);

  // Simple aridity/moisture diagnostics.
  var precipMinusEvapMm = precipMm.subtract(evapMmPositiveUp);
  var waterBalanceMm = precipMm.subtract(evapMmPositiveUp).subtract(runoffMm);

  return ee.Image.cat([
    t2mC.rename('t2m_c'),
    d2mC.rename('d2m_c'),
    skinTC.rename('skin_temperature_c'),

    st1C.rename('soil_temperature_l1_0_7cm_c'),
    st2C.rename('soil_temperature_l2_7_28cm_c'),
    st3C.rename('soil_temperature_l3_28_100cm_c'),
    st4C.rename('soil_temperature_l4_100_289cm_c'),

    swvl1.rename('soil_moisture_l1_0_7cm_vfrac'),
    swvl2.rename('soil_moisture_l2_7_28cm_vfrac'),
    swvl3.rename('soil_moisture_l3_28_100cm_vfrac'),
    swvl4.rename('soil_moisture_l4_100_289cm_vfrac'),

    soilMoisture_0_28m.rename('soil_moisture_0_28cm_weighted_vfrac'),
    soilMoisture_0_100m.rename('soil_moisture_0_100cm_weighted_vfrac'),
    soilMoisture_0_289m.rename('soil_moisture_0_289cm_weighted_vfrac'),

    precipMm.rename('total_precipitation_mm'),
    evapMmPositiveUp.rename('total_evaporation_mm_positive_up'),
    potentialEvapMmPositiveUp.rename('potential_evaporation_mm_positive_up'),
    runoffMm.rename('runoff_mm'),
    surfaceRunoffMm.rename('surface_runoff_mm'),
    subSurfaceRunoffMm.rename('sub_surface_runoff_mm'),

    precipMinusEvapMm.rename('precip_minus_evap_mm'),
    waterBalanceMm.rename('precip_minus_evap_minus_runoff_mm'),

    snowCoverPct.rename('era5land_snow_cover_pct'),
    snowAlbedoPct.rename('era5land_snow_albedo_pct'),
    img.select('snow_density').rename('era5land_snow_density_kg_m3'),
    snowDepthCm.rename('era5land_snow_depth_cm'),
    sweMm.rename('era5land_snow_water_equivalent_mm'),
    snowfallMm.rename('era5land_snowfall_mm'),
    snowmeltMm.rename('era5land_snowmelt_mm'),
    snowEvapMmPositiveUp.rename('era5land_snow_evaporation_mm_positive_up'),
    snowTC.rename('era5land_snow_layer_temperature_c'),

    forecastAlbedoPct.rename('forecast_albedo_pct'),

    latentDownWm2.rename('surface_latent_heat_flux_wm2_downward'),
    sensibleDownWm2.rename('surface_sensible_heat_flux_wm2_downward'),
    latentUpWm2.rename('surface_latent_heat_flux_wm2_positive_up'),
    sensibleUpWm2.rename('surface_sensible_heat_flux_wm2_positive_up'),

    netSolarDownWm2.rename('surface_net_solar_radiation_wm2_downward'),
    solarDownWm2.rename('surface_solar_radiation_downwards_wm2'),
    netThermalDownWm2.rename('surface_net_thermal_radiation_wm2_downward'),
    thermalDownWm2.rename('surface_thermal_radiation_downwards_wm2')
  ]).toFloat();
}


var ERA5_LAND_EXPORT_BANDS = [
  't2m_c',
  'd2m_c',
  'skin_temperature_c',

  'soil_temperature_l1_0_7cm_c',
  'soil_temperature_l2_7_28cm_c',
  'soil_temperature_l3_28_100cm_c',
  'soil_temperature_l4_100_289cm_c',

  'soil_moisture_l1_0_7cm_vfrac',
  'soil_moisture_l2_7_28cm_vfrac',
  'soil_moisture_l3_28_100cm_vfrac',
  'soil_moisture_l4_100_289cm_vfrac',

  'soil_moisture_0_28cm_weighted_vfrac',
  'soil_moisture_0_100cm_weighted_vfrac',
  'soil_moisture_0_289cm_weighted_vfrac',

  'total_precipitation_mm',
  'total_evaporation_mm_positive_up',
  'potential_evaporation_mm_positive_up',
  'runoff_mm',
  'surface_runoff_mm',
  'sub_surface_runoff_mm',

  'precip_minus_evap_mm',
  'precip_minus_evap_minus_runoff_mm',

  'era5land_snow_cover_pct',
  'era5land_snow_albedo_pct',
  'era5land_snow_density_kg_m3',
  'era5land_snow_depth_cm',
  'era5land_snow_water_equivalent_mm',
  'era5land_snowfall_mm',
  'era5land_snowmelt_mm',
  'era5land_snow_evaporation_mm_positive_up',
  'era5land_snow_layer_temperature_c',

  'forecast_albedo_pct',

  'surface_latent_heat_flux_wm2_downward',
  'surface_sensible_heat_flux_wm2_downward',
  'surface_latent_heat_flux_wm2_positive_up',
  'surface_sensible_heat_flux_wm2_positive_up',

  'surface_net_solar_radiation_wm2_downward',
  'surface_solar_radiation_downwards_wm2',
  'surface_net_thermal_radiation_wm2_downward',
  'surface_thermal_radiation_downwards_wm2'
];


/***************************************************************
 5. ERA5-LAND MONTHLY IMAGE
***************************************************************/

function monthlyEra5LandImage(monthStart) {
  monthStart = ee.Date(monthStart);

  var img = ee.ImageCollection(ERA5_LAND_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select(ERA5_LAND_BANDS)
    .first();

  return addDerivedEra5LandBands(ee.Image(img), monthStart)
    .set({
      'system:time_start': monthStart.millis(),
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthStart.get('month')
    });
}


/***************************************************************
 6. REDUCE ONE ERA5-LAND MONTH OVER ALL LAND REGIONS
***************************************************************/

function reduceOneEra5LandMonth(monthStart) {
  monthStart = ee.Date(monthStart);

  var img = monthlyEra5LandImage(monthStart).select(ERA5_LAND_EXPORT_BANDS);
  var monthNum = ee.Number(monthStart.get('month'));

  var reduced = img.reduceRegions({
    collection: LAND_SURFACE_REGIONS,
    reducer: ee.Reducer.mean(),
    scale: ERA5_LAND_SCALE_M,
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


/***************************************************************
 7. BUILD ERA5-LAND TABLE FOR CHUNK
***************************************************************/

function buildEra5LandTableForYears(startYear, endYear) {
  var starts = makeMonthStarts(startYear, endYear);

  return ee.FeatureCollection(
    starts.map(function(d) {
      return reduceOneEra5LandMonth(d);
    })
  ).flatten();
}


/***************************************************************
 8. MODIS SNOW-COVER MONTHLY IMAGE
***************************************************************/

function prepModisSnow(img) {
  var snow = img.select('NDSI_Snow_Cover');

  // Valid NDSI_Snow_Cover values are 0-100.
  // Other codes represent cloud, missing data, water/ocean, night, etc.
  var valid = snow.gte(0).and(snow.lte(100));

  var snowPct = snow
    .updateMask(valid)
    .rename('modis_ndsi_snow_cover_pct');

  // Thresholded snow-cover presence.
  // 10% is a permissive threshold useful for regional monthly snow diagnostics.
  var snowBinary10 = snow
    .gte(10)
    .updateMask(valid)
    .toFloat()
    .rename('modis_snow_binary_ge10pct');

  var snowBinary50 = snow
    .gte(50)
    .updateMask(valid)
    .toFloat()
    .rename('modis_snow_binary_ge50pct');

  var validObs = valid
    .toFloat()
    .rename('modis_valid_observation');

  return snowPct
    .addBands(snowBinary10)
    .addBands(snowBinary50)
    .addBands(validObs)
    .copyProperties(img, ['system:time_start']);
}


function monthlyModisSnowImage(monthStart) {
  monthStart = ee.Date(monthStart);

  var snowCol = ee.ImageCollection(MODIS_SNOW_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .map(prepModisSnow);

  var meanSnowPct = snowCol
    .select('modis_ndsi_snow_cover_pct')
    .mean()
    .rename('modis_mean_ndsi_snow_cover_pct');

  var snowDayFrac10 = snowCol
    .select('modis_snow_binary_ge10pct')
    .mean()
    .rename('modis_mean_snow_day_fraction_ge10pct');

  var snowDayFrac50 = snowCol
    .select('modis_snow_binary_ge50pct')
    .mean()
    .rename('modis_mean_snow_day_fraction_ge50pct');

  var validObsFrac = snowCol
    .select('modis_valid_observation')
    .mean()
    .rename('modis_valid_observation_fraction');

  return meanSnowPct
    .addBands(snowDayFrac10)
    .addBands(snowDayFrac50)
    .addBands(validObsFrac)
    .toFloat()
    .set({
      'system:time_start': monthStart.millis(),
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthStart.get('month')
    });
}


var MODIS_SNOW_EXPORT_BANDS = [
  'modis_mean_ndsi_snow_cover_pct',
  'modis_mean_snow_day_fraction_ge10pct',
  'modis_mean_snow_day_fraction_ge50pct',
  'modis_valid_observation_fraction'
];


/***************************************************************
 9. REDUCE ONE MODIS SNOW MONTH OVER CRYOSPHERE REGIONS
***************************************************************/

function reduceOneModisSnowMonth(monthStart) {
  monthStart = ee.Date(monthStart);

  var img = monthlyModisSnowImage(monthStart).select(MODIS_SNOW_EXPORT_BANDS);
  var monthNum = ee.Number(monthStart.get('month'));

  var reduced = img.reduceRegions({
    collection: CRYOSPHERE_REGIONS,
    reducer: ee.Reducer.mean(),
    scale: MODIS_SNOW_SCALE_M,
    tileScale: TILE_SCALE,
    maxPixelsPerRegion: 1e13
  });

  return reduced.map(function(f) {
    var regionArea = ee.Number(f.get('region_area_km2'));

    var snowArea10 = ee.Number(f.get('modis_mean_snow_day_fraction_ge10pct'))
      .multiply(regionArea);

    var snowArea50 = ee.Number(f.get('modis_mean_snow_day_fraction_ge50pct'))
      .multiply(regionArea);

    return f.set({
      'date_yyyy_mm': monthStart.format('YYYY-MM'),
      'year': monthStart.get('year'),
      'month': monthNum,
      'is_monsoon_jjas': isJJAS(monthNum),
      'is_pre_monsoon_mam': isPreMonsoonMAM(monthNum),

      // Approximate monthly mean snow-covered area.
      // Computed as regional mean snow-day fraction × region area.
      'modis_mean_snow_area_km2_ge10pct_approx': snowArea10,
      'modis_mean_snow_area_km2_ge50pct_approx': snowArea50
    });
  });
}


/***************************************************************
 10. BUILD MODIS SNOW TABLE FOR CHUNK
***************************************************************/

function buildModisSnowTableForYears(startYear, endYear) {
  var starts = makeMonthStarts(startYear, endYear);

  return ee.FeatureCollection(
    starts.map(function(d) {
      return reduceOneModisSnowMonth(d);
    })
  ).flatten();
}


/***************************************************************
 11. EXPORT SELECTORS
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

var ERA5_LAND_SELECTORS = BASE_SELECTORS.concat(ERA5_LAND_EXPORT_BANDS);

var MODIS_SNOW_SELECTORS = BASE_SELECTORS.concat(MODIS_SNOW_EXPORT_BANDS).concat([
  'modis_mean_snow_area_km2_ge10pct_approx',
  'modis_mean_snow_area_km2_ge50pct_approx'
]);


/***************************************************************
 12. ERA5-LAND EXPORT TASKS
***************************************************************/

ERA5_LAND_EXPORT_CHUNKS.forEach(function(chunk) {
  var chunkStart = chunk[0];
  var chunkEnd = chunk[1];

  var table = buildEra5LandTableForYears(chunkStart, chunkEnd)
    .select(ERA5_LAND_SELECTORS);

  var filePrefix =
    'south_asia_monsoon_land_surface_era5land_indices_' +
    chunkStart + '_' + chunkEnd +
    '_raw_monthly_long';

  Export.table.toDrive({
    collection: table,
    description: filePrefix + '_csv',
    folder: EXPORT_FOLDER,
    fileNamePrefix: filePrefix,
    fileFormat: 'CSV',
    selectors: ERA5_LAND_SELECTORS
  });
});


/***************************************************************
 13. MODIS SNOW EXPORT TASKS
***************************************************************/

MODIS_SNOW_EXPORT_CHUNKS.forEach(function(chunk) {
  var chunkStart = chunk[0];
  var chunkEnd = chunk[1];

  var table = buildModisSnowTableForYears(chunkStart, chunkEnd)
    .select(MODIS_SNOW_SELECTORS);

  var filePrefix =
    'south_asia_monsoon_cryosphere_modis_snow_indices_' +
    chunkStart + '_' + chunkEnd +
    '_raw_monthly_long';

  Export.table.toDrive({
    collection: table,
    description: filePrefix + '_csv',
    folder: EXPORT_FOLDER,
    fileNamePrefix: filePrefix,
    fileFormat: 'CSV',
    selectors: MODIS_SNOW_SELECTORS
  });
});