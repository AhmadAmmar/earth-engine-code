/***************************************************************
 2026 Monsoon Predictor / Diagnostic Variables Export
 Google Earth Engine JavaScript

 Purpose:
 Export high-correlation / physically important variables for 2026 so far.

 Output:
 south_asia_monsoon_selected_predictors_2026_monthly_so_far.csv

 One row per month.

 Includes:
 - OISST ENSO/IOD + Indian Ocean / Arabian Sea / Bay of Bengal SST variables
 - ERA5 atmospheric circulation / moisture variables
 - ERA5-Land land-surface / soil moisture / snow variables
 - MODIS MOD10A1 snow variables
 - MODIS MAIAC aerosol variables
 - CHIRPS monthly rainfall tracking over South Asia AOI

 Notes:
 - Seasons should be calculated later in Python.
 - Current/incomplete month is included, with image counts.
 - Future months are not exported.
 - GridSat cold-cloud variables are not included because the GEE
   GridSat-B1 catalog does not currently extend to 2026.
***************************************************************/


/***************************************************************
 0. USER SETTINGS
***************************************************************/

var YEAR = 2026;

var EXPORT_FOLDER = 'GEE_ENSO_IOD_MONSOON';

var EXPORT_PREFIX =
  'south_asia_monsoon_selected_predictors_' +
  YEAR +
  '_monthly_so_far';

var OISST_DATASET = 'NOAA/CDR/OISST/V2_1';
var ERA5_DATASET = 'ECMWF/ERA5/HOURLY';
var ERA5_LAND_DATASET = 'ECMWF/ERA5_LAND/MONTHLY_AGGR';
var MODIS_SNOW_DATASET = 'MODIS/061/MOD10A1';
var MAIAC_DATASET = 'MODIS/061/MCD19A2_GRANULES';
var CHIRPS_DATASET = 'UCSB-CHG/CHIRPS/DAILY';

var OISST_SCALE_M = 27830;
var ERA5_SCALE_M = 50000;
var ERA5_LAND_SCALE_M = 11132;
var MODIS_SNOW_SCALE_M = 5000;
var MAIAC_SCALE_M = 10000;
var CHIRPS_SCALE_M = 5566;

var TILE_SCALE = 8;

// By default, export from Jan 2026 through the current calendar month.
// You can override this manually if needed, e.g.:
// var LAST_MONTH_START = ee.Date('2026-05-01');
var FIRST_MONTH_START = ee.Date.fromYMD(YEAR, 1, 1);
var TODAY = ee.Date(Date.now());
var CURRENT_MONTH_START = ee.Date.fromYMD(
  TODAY.get('year'),
  TODAY.get('month'),
  1
);

var LAST_MONTH_START = ee.Date(
  ee.Algorithms.If(
    ee.Number(TODAY.get('year')).eq(YEAR),
    CURRENT_MONTH_START,
    ee.Date.fromYMD(YEAR, 12, 1)
  )
);


/***************************************************************
 1. REGIONS
***************************************************************/

function rectangle(lonMin, latMin, lonMax, latMax) {
  return ee.Geometry.Rectangle([lonMin, latMin, lonMax, latMax], null, false);
}

// ENSO/IOD boxes.
var NINO34 = rectangle(-170, -5, -120, 5);
var WTIO = rectangle(50, -10, 70, 10);
var SETIO = rectangle(90, -10, 110, 0);

// Ocean boxes.
var INDIAN_OCEAN_BASIN = rectangle(40, -20, 110, 20);
var TNIO = rectangle(40, 0, 100, 25);
var ARABIAN_SEA = rectangle(55, 5, 75, 25);
var BAY_OF_BENGAL = rectangle(80, 5, 100, 22);
var WTIO_BOX = rectangle(50, -10, 70, 10);
var SETIO_BOX = rectangle(90, -10, 110, 0);

// Atmospheric boxes.
var SOMALI_JET = rectangle(45, -5, 70, 20);
var BOB_ATMOS = rectangle(80, 5, 100, 25);
var MONSOON_CORE = rectangle(70, 15, 90, 28);
var THAR_HEAT_LOW = rectangle(65, 22, 78, 32);
var MASCARENE_HIGH = rectangle(45, -40, 90, -20);
var TIBETAN_PLATEAU = rectangle(75, 28, 105, 38);

// Land-surface boxes.
var CENTRAL_INDIA = rectangle(73, 18, 88, 26);
var GANGETIC_PLAINS = rectangle(76, 22, 90, 31);
var INDUS_PAKISTAN_BELT = rectangle(65, 23, 77, 35);
var WESTERN_HIMALAYA_HKH = rectangle(68, 30, 82, 38);

// Aerosol boxes.
var IGP_AEROSOL = rectangle(72, 23, 90, 31);
var NW_INDIA_PAKISTAN_DUST = rectangle(65, 22, 78, 33);
var THAR_SINDH_RAJASTHAN = rectangle(68, 23, 76, 29);

// South Asian land AOI for rainfall tracking.
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


/***************************************************************
 2. GENERAL HELPERS
***************************************************************/

function makeMonthStarts(firstMonth, lastMonth) {
  var nMonths = lastMonth
    .difference(firstMonth, 'month')
    .round();

  return ee.List.sequence(0, nMonths).map(function(n) {
    return firstMonth.advance(ee.Number(n), 'month');
  });
}


var MONTH_STARTS = makeMonthStarts(FIRST_MONTH_START, LAST_MONTH_START);


function maskedConstantImage(bandNames) {
  var zeros = bandNames.map(function(_) {
    return 0;
  });

  return ee.Image.constant(zeros)
    .rename(bandNames)
    .updateMask(ee.Image.constant(0));
}


function regionMeanDict(img, geom, prefix, bandList, scaleMeters) {
  var stats = img.select(bandList).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: scaleMeters,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  var out = ee.Dictionary({});

  bandList.forEach(function(b) {
    out = out.set(prefix + '_' + b, stats.get(b));
  });

  return out;
}


function areaWeightedRainStats(rainImage, geometry, scaleMeters) {
  var rain = rainImage.rename('rain_mm');

  var area = ee.Image.pixelArea()
    .updateMask(rain.mask())
    .rename('area_m2');

  var rainArea = rain.multiply(area).rename('rain_mm_area_m2');

  var sums = rainArea.addBands(area).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: scaleMeters,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  var rainMmAreaM2 = ee.Number(sums.get('rain_mm_area_m2'));
  var areaM2 = ee.Number(sums.get('area_m2'));

  return ee.Dictionary({
    'south_asia_rain_monthly_mm': rainMmAreaM2.divide(areaM2),
    'south_asia_rain_monthly_volume_km3': rainMmAreaM2.divide(1e12),
    'south_asia_aoi_effective_area_km2': areaM2.divide(1e6)
  });
}


function safeSubtract(props, aKey, bKey) {
  var a = props.get(aKey);
  var b = props.get(bKey);

  var hasA = ee.Algorithms.IsEqual(a, null);
  var hasB = ee.Algorithms.IsEqual(b, null);

  return ee.Algorithms.If(
    hasA,
    null,
    ee.Algorithms.If(
      hasB,
      null,
      ee.Number(a).subtract(ee.Number(b))
    )
  );
}


function safeVpdKpa(tC, tdC) {
  var es = ee.Image(0.6108).multiply(
    ee.Image(17.27).multiply(tC).divide(tC.add(237.3)).exp()
  );

  var ea = ee.Image(0.6108).multiply(
    ee.Image(17.27).multiply(tdC).divide(tdC.add(237.3)).exp()
  );

  return es.subtract(ea);
}


function isCompleteMonth(monthStart) {
  monthStart = ee.Date(monthStart);
  var monthEnd = monthStart.advance(1, 'month');

  return ee.Number(
    ee.Algorithms.If(TODAY.millis().gte(monthEnd.millis()), 1, 0)
  );
}


/***************************************************************
 3. OISST MONTHLY VARIABLES
***************************************************************/

function prepOisstDaily(img) {
  var sstC = img.select('sst')
    .multiply(0.01)
    .rename('sst_c');

  var anomC = img.select('anom')
    .multiply(0.01)
    .rename('oisst_anom_c');

  var sstGe28 = sstC.gte(28).toFloat().rename('sst_ge_28c_fraction');
  var sstGe29 = sstC.gte(29).toFloat().rename('sst_ge_29c_fraction');

  return sstC
    .addBands(anomC)
    .addBands(sstGe28)
    .addBands(sstGe29);
}


var OISST_BANDS = [
  'sst_c',
  'oisst_anom_c',
  'sst_ge_28c_fraction',
  'sst_ge_29c_fraction'
];


function monthlyOisstImage(monthStart) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(OISST_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select(['sst', 'anom'])
    .map(prepOisstDaily);

  var img = ee.Image(
    ee.Algorithms.If(
      col.size().gt(0),
      col.mean().select(OISST_BANDS),
      maskedConstantImage(OISST_BANDS)
    )
  );

  return img.toFloat();
}


function addOisstProps(monthStart, props) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(OISST_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'));

  var img = monthlyOisstImage(monthStart);

  props = props.set('n_oisst_daily_images', col.size());

  props = props.combine(regionMeanDict(img, NINO34, 'nino34', ['oisst_anom_c'], OISST_SCALE_M), true);
  props = props.combine(regionMeanDict(img, WTIO, 'wtio', ['oisst_anom_c'], OISST_SCALE_M), true);
  props = props.combine(regionMeanDict(img, SETIO, 'setio', ['oisst_anom_c'], OISST_SCALE_M), true);

  props = props.combine(regionMeanDict(img, INDIAN_OCEAN_BASIN, 'indian_ocean_basin', OISST_BANDS, OISST_SCALE_M), true);
  props = props.combine(regionMeanDict(img, TNIO, 'tnio', OISST_BANDS, OISST_SCALE_M), true);
  props = props.combine(regionMeanDict(img, ARABIAN_SEA, 'arabian_sea', OISST_BANDS, OISST_SCALE_M), true);
  props = props.combine(regionMeanDict(img, BAY_OF_BENGAL, 'bay_of_bengal', OISST_BANDS, OISST_SCALE_M), true);
  props = props.combine(regionMeanDict(img, WTIO_BOX, 'wtio_box', OISST_BANDS, OISST_SCALE_M), true);
  props = props.combine(regionMeanDict(img, SETIO_BOX, 'setio_box', OISST_BANDS, OISST_SCALE_M), true);

  props = props
    .set(
      'dmi_oisst_anom_c',
      safeSubtract(props, 'wtio_oisst_anom_c', 'setio_oisst_anom_c')
    )
    .set(
      'ssta_wtio_minus_setio_oisst_anom_c',
      safeSubtract(props, 'wtio_box_oisst_anom_c', 'setio_box_oisst_anom_c')
    )
    .set(
      'ssta_arabian_minus_bob_oisst_anom_c',
      safeSubtract(props, 'arabian_sea_oisst_anom_c', 'bay_of_bengal_oisst_anom_c')
    );

  return props;
}


/***************************************************************
 4. ERA5 ATMOSPHERIC VARIABLES
***************************************************************/

var ERA5_BANDS = [
  'mean_sea_level_pressure',

  'u_component_of_wind_850hPa',
  'v_component_of_wind_850hPa',
  'u_component_of_wind_500hPa',
  'v_component_of_wind_500hPa',

  'specific_humidity_850hPa',

  'vertical_velocity_500hPa',
  'vorticity_850hPa',
  'divergence_850hPa',

  'temperature_500hPa'
];


function addDerivedEra5AtmosBands(img) {
  var u850 = img.select('u_component_of_wind_850hPa');
  var v850 = img.select('v_component_of_wind_850hPa');

  var u500 = img.select('u_component_of_wind_500hPa');
  var v500 = img.select('v_component_of_wind_500hPa');

  var q850 = img.select('specific_humidity_850hPa').multiply(1000);

  var wind850 = u850.pow(2).add(v850.pow(2)).sqrt();
  var wind500 = u500.pow(2).add(v500.pow(2)).sqrt();

  var mslp = img.select('mean_sea_level_pressure').divide(100);

  var moistureFluxU850 = q850.multiply(u850);
  var moistureFluxV850 = q850.multiply(v850);
  var moistureFluxMag850 = moistureFluxU850.pow(2).add(moistureFluxV850.pow(2)).sqrt();

  var ascent500 = img.select('vertical_velocity_500hPa').multiply(-1);
  var convergence850 = img.select('divergence_850hPa').multiply(-1);

  var shearU = u850.subtract(u500);
  var shearV = v850.subtract(v500);
  var shearMag = shearU.pow(2).add(shearV.pow(2)).sqrt();

  var t500C = img.select('temperature_500hPa').subtract(273.15);

  return ee.Image.cat([
    u850.rename('u850_ms'),
    v850.rename('v850_ms'),
    wind850.rename('wind850_ms'),

    u500.rename('u500_ms'),
    v500.rename('v500_ms'),
    wind500.rename('wind500_ms'),

    q850.rename('q850_gkg'),

    moistureFluxU850.rename('moisture_flux_u850_proxy_gkg_ms'),
    moistureFluxV850.rename('moisture_flux_v850_proxy_gkg_ms'),
    moistureFluxMag850.rename('moisture_flux850_mag_proxy_gkg_ms'),

    ascent500.rename('ascent500_index_pa_s'),
    convergence850.rename('convergence850_index_s1'),

    img.select('vorticity_850hPa').rename('vorticity850_s1'),

    shearU.rename('wind_shear_u_850_minus_500_ms'),
    shearV.rename('wind_shear_v_850_minus_500_ms'),
    shearMag.rename('wind_shear_mag_850_500_ms'),

    mslp.rename('mslp_hpa'),
    t500C.rename('t500_c')
  ]).toFloat();
}


var ERA5_DERIVED_BANDS = [
  'u850_ms',
  'v850_ms',
  'wind850_ms',

  'u500_ms',
  'v500_ms',
  'wind500_ms',

  'q850_gkg',

  'moisture_flux_u850_proxy_gkg_ms',
  'moisture_flux_v850_proxy_gkg_ms',
  'moisture_flux850_mag_proxy_gkg_ms',

  'ascent500_index_pa_s',
  'convergence850_index_s1',
  'vorticity850_s1',

  'wind_shear_u_850_minus_500_ms',
  'wind_shear_v_850_minus_500_ms',
  'wind_shear_mag_850_500_ms',

  'mslp_hpa',
  't500_c'
];


function monthlyEra5AtmosImage(monthStart) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(ERA5_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select(ERA5_BANDS);

  var monthlyMean = ee.Image(
    ee.Algorithms.If(
      col.size().gt(0),
      col.mean(),
      maskedConstantImage(ERA5_BANDS)
    )
  );

  return addDerivedEra5AtmosBands(monthlyMean).select(ERA5_DERIVED_BANDS);
}


function addEra5AtmosProps(monthStart, props) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(ERA5_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'));

  var img = monthlyEra5AtmosImage(monthStart);

  props = props.set('n_era5_hourly_images', col.size());

  props = props.combine(regionMeanDict(img, SOMALI_JET, 'somali', [
    'u850_ms',
    'wind850_ms',
    'q850_gkg',
    'moisture_flux_u850_proxy_gkg_ms',
    'moisture_flux850_mag_proxy_gkg_ms'
  ], ERA5_SCALE_M), true);

  props = props.combine(regionMeanDict(img, ARABIAN_SEA, 'arabian', [
    'u850_ms',
    'v850_ms',
    'wind850_ms',
    'q850_gkg',
    'moisture_flux_u850_proxy_gkg_ms',
    'moisture_flux_v850_proxy_gkg_ms',
    'moisture_flux850_mag_proxy_gkg_ms',
    'mslp_hpa'
  ], ERA5_SCALE_M), true);

  props = props.combine(regionMeanDict(img, BOB_ATMOS, 'bob', [
    'u850_ms',
    'v850_ms',
    'wind850_ms',
    'q850_gkg',
    'moisture_flux_u850_proxy_gkg_ms',
    'moisture_flux_v850_proxy_gkg_ms',
    'moisture_flux850_mag_proxy_gkg_ms',
    'mslp_hpa'
  ], ERA5_SCALE_M), true);

  props = props.combine(regionMeanDict(img, MONSOON_CORE, 'monsoon_core', [
    'q850_gkg',
    'ascent500_index_pa_s',
    'convergence850_index_s1',
    'vorticity850_s1',
    'wind_shear_u_850_minus_500_ms',
    'wind_shear_v_850_minus_500_ms',
    'wind_shear_mag_850_500_ms',
    't500_c',
    'mslp_hpa'
  ], ERA5_SCALE_M), true);

  props = props.combine(regionMeanDict(img, THAR_HEAT_LOW, 'thar', [
    'mslp_hpa'
  ], ERA5_SCALE_M), true);

  props = props.combine(regionMeanDict(img, MASCARENE_HIGH, 'mascarene', [
    'mslp_hpa'
  ], ERA5_SCALE_M), true);

  props = props.combine(regionMeanDict(img, TIBETAN_PLATEAU, 'tp', [
    't500_c'
  ], ERA5_SCALE_M), true);

  props = props
    .set(
      'mslp_arabian_minus_thar_hpa',
      safeSubtract(props, 'arabian_mslp_hpa', 'thar_mslp_hpa')
    )
    .set(
      'mslp_bob_minus_thar_hpa',
      safeSubtract(props, 'bob_mslp_hpa', 'thar_mslp_hpa')
    )
    .set(
      'mslp_mascarene_minus_thar_hpa',
      safeSubtract(props, 'mascarene_mslp_hpa', 'thar_mslp_hpa')
    )
    .set(
      't500_tp_minus_monsoon_core_c',
      safeSubtract(props, 'tp_t500_c', 'monsoon_core_t500_c')
    );

  return props;
}


/***************************************************************
 5. ERA5-LAND VARIABLES
***************************************************************/

var ERA5_LAND_BANDS = [
  'temperature_2m',
  'dewpoint_temperature_2m',

  'volumetric_soil_water_layer_1',
  'volumetric_soil_water_layer_2',
  'volumetric_soil_water_layer_3',
  'volumetric_soil_water_layer_4',

  'snow_cover',
  'snow_depth_water_equivalent'
];


function addDerivedEra5LandBands(img) {
  var t2mC = img.select('temperature_2m').subtract(273.15);
  var d2mC = img.select('dewpoint_temperature_2m').subtract(273.15);

  var vpd = safeVpdKpa(t2mC, d2mC);

  var swvl1 = img.select('volumetric_soil_water_layer_1');
  var swvl2 = img.select('volumetric_soil_water_layer_2');
  var swvl3 = img.select('volumetric_soil_water_layer_3');
  var swvl4 = img.select('volumetric_soil_water_layer_4');

  var sm028 = swvl1.multiply(0.07)
    .add(swvl2.multiply(0.21))
    .divide(0.28);

  var sm0100 = swvl1.multiply(0.07)
    .add(swvl2.multiply(0.21))
    .add(swvl3.multiply(0.72))
    .divide(1.00);

  var sm0289 = swvl1.multiply(0.07)
    .add(swvl2.multiply(0.21))
    .add(swvl3.multiply(0.72))
    .add(swvl4.multiply(1.89))
    .divide(2.89);

  // Do NOT multiply snow_cover by 100 here.
  // Historical sanity check showed the earlier *100 export needed correction.
  var snowCoverNative = img.select('snow_cover');
  var sweMm = img.select('snow_depth_water_equivalent').multiply(1000);

  return ee.Image.cat([
    t2mC.rename('t2m_c'),
    d2mC.rename('d2m_c'),
    vpd.rename('vpd_kpa'),

    swvl1.rename('soil_moisture_l1_0_7cm_vfrac'),
    swvl2.rename('soil_moisture_l2_7_28cm_vfrac'),
    swvl3.rename('soil_moisture_l3_28_100cm_vfrac'),
    swvl4.rename('soil_moisture_l4_100_289cm_vfrac'),

    sm028.rename('soil_moisture_0_28cm_weighted_vfrac'),
    sm0100.rename('soil_moisture_0_100cm_weighted_vfrac'),
    sm0289.rename('soil_moisture_0_289cm_weighted_vfrac'),

    snowCoverNative.rename('era5land_snow_cover_pct'),
    sweMm.rename('era5land_snow_water_equivalent_mm')
  ]).toFloat();
}


var ERA5_LAND_DERIVED_BANDS = [
  't2m_c',
  'd2m_c',
  'vpd_kpa',

  'soil_moisture_l1_0_7cm_vfrac',
  'soil_moisture_l2_7_28cm_vfrac',
  'soil_moisture_l3_28_100cm_vfrac',
  'soil_moisture_l4_100_289cm_vfrac',

  'soil_moisture_0_28cm_weighted_vfrac',
  'soil_moisture_0_100cm_weighted_vfrac',
  'soil_moisture_0_289cm_weighted_vfrac',

  'era5land_snow_cover_pct',
  'era5land_snow_water_equivalent_mm'
];


function monthlyEra5LandImage(monthStart) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(ERA5_LAND_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select(ERA5_LAND_BANDS);

  var img = ee.Image(
    ee.Algorithms.If(
      col.size().gt(0),
      col.first(),
      maskedConstantImage(ERA5_LAND_BANDS)
    )
  );

  return addDerivedEra5LandBands(img).select(ERA5_LAND_DERIVED_BANDS);
}


function addEra5LandProps(monthStart, props) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(ERA5_LAND_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'));

  var img = monthlyEra5LandImage(monthStart);

  props = props.set('n_era5land_monthly_images', col.size());

  props = props.combine(regionMeanDict(img, THAR_HEAT_LOW, 'thar_land', [
    't2m_c',
    'd2m_c',
    'vpd_kpa',
    'soil_moisture_0_100cm_weighted_vfrac'
  ], ERA5_LAND_SCALE_M), true);

  props = props.combine(regionMeanDict(img, CENTRAL_INDIA, 'central_india', [
    'soil_moisture_0_100cm_weighted_vfrac'
  ], ERA5_LAND_SCALE_M), true);

  props = props.combine(regionMeanDict(img, GANGETIC_PLAINS, 'gangetic', [
    'soil_moisture_0_100cm_weighted_vfrac'
  ], ERA5_LAND_SCALE_M), true);

  props = props.combine(regionMeanDict(img, INDUS_PAKISTAN_BELT, 'indus_belt', [
    'soil_moisture_0_100cm_weighted_vfrac'
  ], ERA5_LAND_SCALE_M), true);

  props = props.combine(regionMeanDict(img, TIBETAN_PLATEAU, 'tp_land', [
    'era5land_snow_cover_pct',
    'era5land_snow_water_equivalent_mm'
  ], ERA5_LAND_SCALE_M), true);

  props = props.combine(regionMeanDict(img, WESTERN_HIMALAYA_HKH, 'western_himalaya', [
    'era5land_snow_cover_pct',
    'era5land_snow_water_equivalent_mm'
  ], ERA5_LAND_SCALE_M), true);

  return props;
}


/***************************************************************
 6. MODIS SNOW VARIABLES
***************************************************************/

function prepModisSnow(img) {
  var snow = img.select('NDSI_Snow_Cover');

  var valid = snow.gte(0).and(snow.lte(100));

  var snowPct = snow
    .updateMask(valid)
    .rename('modis_mean_ndsi_snow_cover_pct');

  var snowBinary10 = snow
    .gte(10)
    .updateMask(valid)
    .toFloat()
    .rename('modis_snow_day_fraction_ge10pct');

  var snowBinary50 = snow
    .gte(50)
    .updateMask(valid)
    .toFloat()
    .rename('modis_snow_day_fraction_ge50pct');

  return snowPct
    .addBands(snowBinary10)
    .addBands(snowBinary50);
}


var MODIS_SNOW_BANDS = [
  'modis_mean_ndsi_snow_cover_pct',
  'modis_snow_day_fraction_ge10pct',
  'modis_snow_day_fraction_ge50pct'
];


function monthlyModisSnowImage(monthStart) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(MODIS_SNOW_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .map(prepModisSnow);

  var img = ee.Image(
    ee.Algorithms.If(
      col.size().gt(0),
      col.mean().select(MODIS_SNOW_BANDS),
      maskedConstantImage(MODIS_SNOW_BANDS)
    )
  );

  return img.toFloat();
}


function addModisSnowProps(monthStart, props) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(MODIS_SNOW_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'));

  var img = monthlyModisSnowImage(monthStart);

  props = props.set('n_modis_snow_daily_images', col.size());

  props = props.combine(regionMeanDict(img, TIBETAN_PLATEAU, 'tp_modis_snow', MODIS_SNOW_BANDS, MODIS_SNOW_SCALE_M), true);
  props = props.combine(regionMeanDict(img, WESTERN_HIMALAYA_HKH, 'western_himalaya_modis_snow', MODIS_SNOW_BANDS, MODIS_SNOW_SCALE_M), true);

  return props;
}


/***************************************************************
 7. MAIAC AEROSOL VARIABLES
***************************************************************/

function prepMaiacDaily(img) {
  var qa = img.select('AOD_QA');

  // Bits 0-2: cloud mask. 1 = clear.
  var cloudMask = qa.bitwiseAnd(7);
  var clear = cloudMask.eq(1);

  // Bits 3-4: land/water/snow/ice. 0 = land.
  var landWaterSnowIce = qa.rightShift(3).bitwiseAnd(3);
  var land = landWaterSnowIce.eq(0);

  // Bits 8-11: AOD QA. 0 = best quality.
  var aodQa = qa.rightShift(8).bitwiseAnd(15);
  var bestQuality = aodQa.eq(0);

  // Bits 13-14: aerosol model.
  var aerosolModel = qa.rightShift(13).bitwiseAnd(3);
  var smokeModel = aerosolModel.eq(1);
  var dustModel = aerosolModel.eq(2);

  var aod055 = img.select('Optical_Depth_055')
    .multiply(0.001)
    .rename('aod055_clear_land_best');

  var aod047 = img.select('Optical_Depth_047')
    .multiply(0.001)
    .rename('aod047_clear_land_best');

  var colWv = img.select('Column_WV')
    .multiply(0.001)
    .rename('column_water_vapor_cm_clear_land_best');

  var aodValidRange = aod055.gte(0).and(aod055.lte(5));
  var strictMask = clear.and(land).and(bestQuality).and(aodValidRange);

  var validFraction = strictMask
    .toFloat()
    .unmask(0)
    .rename('maiac_valid_clear_land_best_fraction');

  var clearLandFraction = clear
    .and(land)
    .toFloat()
    .unmask(0)
    .rename('maiac_clear_land_fraction');

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

  return aod055.updateMask(strictMask)
    .addBands(aod047.updateMask(strictMask))
    .addBands(colWv.updateMask(strictMask))
    .addBands(validFraction)
    .addBands(clearLandFraction)
    .addBands(dustFraction)
    .addBands(smokeFraction);
}


var MAIAC_BANDS = [
  'aod055_clear_land_best',
  'aod047_clear_land_best',
  'column_water_vapor_cm_clear_land_best',
  'maiac_valid_clear_land_best_fraction',
  'maiac_clear_land_fraction',
  'maiac_dust_model_fraction',
  'maiac_smoke_model_fraction'
];


function monthlyMaiacImage(monthStart) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(MAIAC_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select([
      'Optical_Depth_047',
      'Optical_Depth_055',
      'Column_WV',
      'AOD_QA'
    ])
    .map(prepMaiacDaily);

  var img = ee.Image(
    ee.Algorithms.If(
      col.size().gt(0),
      col.mean().select(MAIAC_BANDS),
      maskedConstantImage(MAIAC_BANDS)
    )
  );

  return img.toFloat();
}


function addMaiacProps(monthStart, props) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(MAIAC_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'));

  var img = monthlyMaiacImage(monthStart);

  props = props.set('n_maiac_granule_images', col.size());

  props = props.combine(regionMeanDict(img, IGP_AEROSOL, 'igp_aerosol', MAIAC_BANDS, MAIAC_SCALE_M), true);
  props = props.combine(regionMeanDict(img, NW_INDIA_PAKISTAN_DUST, 'nw_india_pakistan_aerosol', MAIAC_BANDS, MAIAC_SCALE_M), true);
  props = props.combine(regionMeanDict(img, THAR_SINDH_RAJASTHAN, 'thar_aerosol', MAIAC_BANDS, MAIAC_SCALE_M), true);

  return props;
}


/***************************************************************
 8. CHIRPS RAINFALL TRACKING
***************************************************************/

function addChirpsRainProps(monthStart, props) {
  monthStart = ee.Date(monthStart);

  var col = ee.ImageCollection(CHIRPS_DATASET)
    .filterDate(monthStart, monthStart.advance(1, 'month'))
    .select('precipitation');

  var rainImg = ee.Image(
    ee.Algorithms.If(
      col.size().gt(0),
      col.sum().rename('rain_mm'),
      maskedConstantImage(['rain_mm'])
    )
  );

  props = props.set('n_chirps_daily_images', col.size());
  props = props.combine(areaWeightedRainStats(rainImg, SOUTH_ASIA_AOI, CHIRPS_SCALE_M), true);

  return props;
}


/***************************************************************
 9. BUILD MONTHLY FEATURE
***************************************************************/

function buildOneMonthFeature(monthStart) {
  monthStart = ee.Date(monthStart);

  var monthNum = ee.Number(monthStart.get('month'));

  var props = ee.Dictionary({
    'date_yyyy_mm': monthStart.format('YYYY-MM'),
    'year': monthStart.get('year'),
    'month': monthNum,
    'month_start': monthStart.format('YYYY-MM-dd'),
    'month_end_exclusive': monthStart.advance(1, 'month').format('YYYY-MM-dd'),
    'export_generated_date': TODAY.format('YYYY-MM-dd'),
    'month_complete_by_calendar': isCompleteMonth(monthStart),

    'is_djf': ee.Number(ee.Algorithms.If(monthNum.eq(12).or(monthNum.lte(2)), 1, 0)),
    'is_mam': ee.Number(ee.Algorithms.If(monthNum.gte(3).and(monthNum.lte(5)), 1, 0)),
    'is_amj': ee.Number(ee.Algorithms.If(monthNum.gte(4).and(monthNum.lte(6)), 1, 0)),
    'is_mjj': ee.Number(ee.Algorithms.If(monthNum.gte(5).and(monthNum.lte(7)), 1, 0)),
    'is_jja': ee.Number(ee.Algorithms.If(monthNum.gte(6).and(monthNum.lte(8)), 1, 0)),
    'is_jjas': ee.Number(ee.Algorithms.If(monthNum.gte(6).and(monthNum.lte(9)), 1, 0)),
    'is_jas': ee.Number(ee.Algorithms.If(monthNum.gte(7).and(monthNum.lte(9)), 1, 0)),
    'is_aso': ee.Number(ee.Algorithms.If(monthNum.gte(8).and(monthNum.lte(10)), 1, 0))
  });

  props = addOisstProps(monthStart, props);
  props = addEra5AtmosProps(monthStart, props);
  props = addEra5LandProps(monthStart, props);
  props = addModisSnowProps(monthStart, props);
  props = addMaiacProps(monthStart, props);
  props = addChirpsRainProps(monthStart, props);

  return ee.Feature(null, props);
}


var monthly2026 = ee.FeatureCollection(
  MONTH_STARTS.map(function(d) {
    return buildOneMonthFeature(d);
  })
);


/***************************************************************
 10. EXPORT
***************************************************************/

var SELECTORS = [
  'date_yyyy_mm',
  'year',
  'month',
  'month_start',
  'month_end_exclusive',
  'export_generated_date',
  'month_complete_by_calendar',

  'is_djf',
  'is_mam',
  'is_amj',
  'is_mjj',
  'is_jja',
  'is_jjas',
  'is_jas',
  'is_aso',

  // Coverage / completeness diagnostics.
  'n_oisst_daily_images',
  'n_era5_hourly_images',
  'n_era5land_monthly_images',
  'n_modis_snow_daily_images',
  'n_maiac_granule_images',
  'n_chirps_daily_images',

  // Rainfall tracking.
  'south_asia_rain_monthly_mm',
  'south_asia_rain_monthly_volume_km3',
  'south_asia_aoi_effective_area_km2',

  // ENSO / IOD.
  'nino34_oisst_anom_c',
  'wtio_oisst_anom_c',
  'setio_oisst_anom_c',
  'dmi_oisst_anom_c',

  // OISST ocean predictors.
  'indian_ocean_basin_sst_c',
  'indian_ocean_basin_oisst_anom_c',
  'indian_ocean_basin_sst_ge_28c_fraction',
  'indian_ocean_basin_sst_ge_29c_fraction',

  'tnio_sst_c',
  'tnio_oisst_anom_c',
  'tnio_sst_ge_28c_fraction',
  'tnio_sst_ge_29c_fraction',

  'arabian_sea_sst_c',
  'arabian_sea_oisst_anom_c',
  'arabian_sea_sst_ge_28c_fraction',
  'arabian_sea_sst_ge_29c_fraction',

  'bay_of_bengal_sst_c',
  'bay_of_bengal_oisst_anom_c',
  'bay_of_bengal_sst_ge_28c_fraction',
  'bay_of_bengal_sst_ge_29c_fraction',

  'wtio_box_oisst_anom_c',
  'setio_box_oisst_anom_c',
  'ssta_wtio_minus_setio_oisst_anom_c',
  'ssta_arabian_minus_bob_oisst_anom_c',

  // ERA5 atmospheric variables.
  'somali_u850_ms',
  'somali_wind850_ms',
  'somali_q850_gkg',
  'somali_moisture_flux_u850_proxy_gkg_ms',
  'somali_moisture_flux850_mag_proxy_gkg_ms',

  'arabian_u850_ms',
  'arabian_v850_ms',
  'arabian_wind850_ms',
  'arabian_q850_gkg',
  'arabian_moisture_flux_u850_proxy_gkg_ms',
  'arabian_moisture_flux_v850_proxy_gkg_ms',
  'arabian_moisture_flux850_mag_proxy_gkg_ms',
  'arabian_mslp_hpa',

  'bob_u850_ms',
  'bob_v850_ms',
  'bob_wind850_ms',
  'bob_q850_gkg',
  'bob_moisture_flux_u850_proxy_gkg_ms',
  'bob_moisture_flux_v850_proxy_gkg_ms',
  'bob_moisture_flux850_mag_proxy_gkg_ms',
  'bob_mslp_hpa',

  'monsoon_core_q850_gkg',
  'monsoon_core_ascent500_index_pa_s',
  'monsoon_core_convergence850_index_s1',
  'monsoon_core_vorticity850_s1',
  'monsoon_core_wind_shear_u_850_minus_500_ms',
  'monsoon_core_wind_shear_v_850_minus_500_ms',
  'monsoon_core_wind_shear_mag_850_500_ms',
  'monsoon_core_t500_c',
  'monsoon_core_mslp_hpa',

  'thar_mslp_hpa',
  'mascarene_mslp_hpa',
  'tp_t500_c',

  'mslp_arabian_minus_thar_hpa',
  'mslp_bob_minus_thar_hpa',
  'mslp_mascarene_minus_thar_hpa',
  't500_tp_minus_monsoon_core_c',

  // ERA5-Land.
  'thar_land_t2m_c',
  'thar_land_d2m_c',
  'thar_land_vpd_kpa',
  'thar_land_soil_moisture_0_100cm_weighted_vfrac',

  'central_india_soil_moisture_0_100cm_weighted_vfrac',
  'gangetic_soil_moisture_0_100cm_weighted_vfrac',
  'indus_belt_soil_moisture_0_100cm_weighted_vfrac',

  'tp_land_era5land_snow_cover_pct',
  'tp_land_era5land_snow_water_equivalent_mm',
  'western_himalaya_era5land_snow_cover_pct',
  'western_himalaya_era5land_snow_water_equivalent_mm',

  // MODIS snow.
  'tp_modis_snow_modis_mean_ndsi_snow_cover_pct',
  'tp_modis_snow_modis_snow_day_fraction_ge10pct',
  'tp_modis_snow_modis_snow_day_fraction_ge50pct',

  'western_himalaya_modis_snow_modis_mean_ndsi_snow_cover_pct',
  'western_himalaya_modis_snow_modis_snow_day_fraction_ge10pct',
  'western_himalaya_modis_snow_modis_snow_day_fraction_ge50pct',

  // MAIAC aerosol.
  'igp_aerosol_aod055_clear_land_best',
  'igp_aerosol_aod047_clear_land_best',
  'igp_aerosol_column_water_vapor_cm_clear_land_best',
  'igp_aerosol_maiac_valid_clear_land_best_fraction',
  'igp_aerosol_maiac_dust_model_fraction',
  'igp_aerosol_maiac_smoke_model_fraction',

  'nw_india_pakistan_aerosol_aod055_clear_land_best',
  'nw_india_pakistan_aerosol_aod047_clear_land_best',
  'nw_india_pakistan_aerosol_column_water_vapor_cm_clear_land_best',
  'nw_india_pakistan_aerosol_maiac_valid_clear_land_best_fraction',
  'nw_india_pakistan_aerosol_maiac_dust_model_fraction',
  'nw_india_pakistan_aerosol_maiac_smoke_model_fraction',

  'thar_aerosol_aod055_clear_land_best',
  'thar_aerosol_aod047_clear_land_best',
  'thar_aerosol_column_water_vapor_cm_clear_land_best',
  'thar_aerosol_maiac_valid_clear_land_best_fraction',
  'thar_aerosol_maiac_dust_model_fraction',
  'thar_aerosol_maiac_smoke_model_fraction'
];


Export.table.toDrive({
  collection: monthly2026.select(SELECTORS),
  description: EXPORT_PREFIX + '_csv',
  folder: EXPORT_FOLDER,
  fileNamePrefix: EXPORT_PREFIX,
  fileFormat: 'CSV',
  selectors: SELECTORS
});