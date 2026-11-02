/***************************************************************
 SOUTH ASIA MONSOON PROJECT
 COMPLETE GEE EXPORT SCRIPT FOR FOUR MISSING FAMILIES
 Updated: 2026-09-07

 Creates filenames matched to 01_preprocess_specialized_exports.py:

  1) south_asia_ocean_copernicus_sss_density_indices_<yyyymm>_<yyyymm>_raw_monthly_long.csv
  2) south_asia_ocean_hycom_subsurface_temp_salinity_indices_<yyyymm>_<yyyymm>_raw_monthly_long.csv
  3) south_asia_chirps_daily_regional_rainfall_jjas_<yyyy>_<yyyy>_long.csv
  4) south_asia_chirps_annual_regional_rainfall_extremes_jjas_<yyyy>_<yyyy>_long.csv

 Notes
 -----
 - No anomalies/z-scores are generated here. Python does those.
 - Ocean spatial means are pixel-area weighted.
 - HYCOM native scale/offset are explicitly applied.
 - CHIRPS daily regional rainfall is pixel-area weighted.
 - Incomplete annual JJAS metrics are written as -9999.
 - Raw GEE source data are never modified.
***************************************************************/


// ============================================================
// 0. SETTINGS
// ============================================================

var EXPORT_FOLDER = 'GEE_SAM_MISSING_FAMILIES_2026';

var MISSING = -9999;
var GEOM_ERROR_M = 1000;

var OCEAN_TILE_SCALE = 4;
var CHIRPS_TILE_SCALE = 8;

var SSS_SCALE_M = 14000;
var HYCOM_SCALE_M = 8905.6;
var CHIRPS_SCALE_M = 5566;

var EXPORT_REGION_QA = true;
var SHOW_MAP_QA = false;

var SSS_REP_ID = 'COPERNICUS/MARINE/GLOBAL_SEA_SURFACE/REP_DAILY';
var SSS_NRT_ID = 'COPERNICUS/MARINE/GLOBAL_SEA_SURFACE/NRT_DAILY';
var HYCOM_ID = 'HYCOM/sea_temp_salinity';
var CHIRPS_ID = 'UCSB-CHG/CHIRPS/DAILY';
var LSIB_ID = 'USDOS/LSIB_SIMPLE/2017';
var HYBAS4_ID = 'WWF/HydroSHEDS/v1/Basins/hybas_4';

// Historical SSS stays on the reprocessed product.
// From Dec 2024 onward we use NRT so 2025/2026 are available.
var SSS_NRT_SWITCH_DATE = ee.Date('2024-12-01');


// ============================================================
// 1. EXPORT CHUNKS
// ============================================================

var SSS_CHUNKS = [
  {start: '1993-01-01', lastMonth: '2000-12-01', label: '199301_200012'},
  {start: '2001-01-01', lastMonth: '2010-12-01', label: '200101_201012'},
  {start: '2011-01-01', lastMonth: '2020-12-01', label: '201101_202012'},
  {start: '2021-01-01', lastMonth: '2026-08-01', label: '202101_202608'}
];

var HYCOM_CHUNKS = [
  {start: '1992-10-01', lastMonth: '2000-12-01', label: '199210_200012'},
  {start: '2001-01-01', lastMonth: '2010-12-01', label: '200101_201012'},
  {start: '2011-01-01', lastMonth: '2020-12-01', label: '201101_202012'},
  {start: '2021-01-01', lastMonth: '2024-09-01', label: '202101_202409'}
];

var CHIRPS_YEAR_CHUNKS = [
  {startYear: 1981, endYear: 1990},
  {startYear: 1991, endYear: 2000},
  {startYear: 2001, endYear: 2010},
  {startYear: 2011, endYear: 2020},
  {startYear: 2021, endYear: 2026}
];


// ============================================================
// 2. GEOMETRY HELPERS
// ============================================================

function rectFeature(regionId, regionLabel, lonMin, latMin, lonMax, latMax, regionType) {
  var geom = ee.Geometry.Rectangle(
    [lonMin, latMin, lonMax, latMax],
    null,
    false
  );

  var areaKm2 = geom
    .area(ee.ErrorMargin(GEOM_ERROR_M))
    .divide(1e6);

  return ee.Feature(geom, {
    region_id: regionId,
    region_label: regionLabel,
    region_type: regionType || 'fixed_rectangle',
    boundary_source: 'manual_fixed_rectangle',
    boundary_definition: [lonMin, latMin, lonMax, latMax].join('_'),
    lon_min: lonMin,
    lat_min: latMin,
    lon_max: lonMax,
    lat_max: latMax,
    region_area_km2: areaKm2
  });
}

function featureFromGeometry(geom, properties) {
  var g = ee.Geometry(geom);
  var areaKm2 = g
    .area(ee.ErrorMargin(GEOM_ERROR_M))
    .divide(1e6);

  return ee.Feature(g, properties)
    .set('region_area_km2', areaKm2);
}


// ============================================================
// 3. OCEAN REGIONS
// ============================================================
// WTIO/SETIO are standard IOD boxes.
// The others are fixed diagnostic regions, identical for SSS and HYCOM.

var OCEAN_REGIONS = ee.FeatureCollection([
  rectFeature(
    'tropical_north_indian_ocean',
    'Tropical North Indian Ocean',
    40, 0, 100, 25,
    'diagnostic_ocean_box'
  ),
  rectFeature(
    'indian_ocean_basin',
    'Indian Ocean basin diagnostic box',
    40, -20, 110, 25,
    'diagnostic_ocean_box'
  ),
  rectFeature(
    'arabian_sea',
    'Arabian Sea',
    50, 5, 75, 25,
    'diagnostic_ocean_box'
  ),
  rectFeature(
    'western_arabian_sea_upwelling',
    'Western Arabian Sea upwelling sector',
    50, 5, 60, 20,
    'diagnostic_ocean_box'
  ),
  rectFeature(
    'bay_of_bengal',
    'Bay of Bengal',
    80, 5, 100, 22,
    'diagnostic_ocean_box'
  ),
  rectFeature(
    'northern_bay_of_bengal',
    'Northern Bay of Bengal',
    85, 15, 95, 22,
    'diagnostic_ocean_box'
  ),
  rectFeature(
    'gbm_freshwater_plume',
    'Ganges Brahmaputra Meghna freshwater plume sector',
    86, 17, 93, 23,
    'diagnostic_ocean_box'
  ),
  rectFeature(
    'equatorial_indian_ocean',
    'Equatorial Indian Ocean',
    40, -5, 100, 5,
    'diagnostic_ocean_box'
  ),
  rectFeature(
    'wtio',
    'Western Tropical Indian Ocean IOD box',
    50, -10, 70, 10,
    'iod_standard_box'
  ),
  rectFeature(
    'setio',
    'Southeastern Tropical Indian Ocean IOD box',
    90, -10, 110, 0,
    'iod_standard_box'
  ),
  rectFeature(
    'maritime_continent_adjacent',
    'Maritime Continent adjacent ocean sector',
    100, -10, 130, 10,
    'diagnostic_ocean_box'
  )
]);


// ============================================================
// 4. CHIRPS LAND / BASIN REGIONS
// ============================================================

var LSIB = ee.FeatureCollection(LSIB_ID);
var HYBAS4 = ee.FeatureCollection(HYBAS4_ID);

function countryRegion(countryName, regionId) {
  var source = ee.Feature(
    LSIB
      .filter(ee.Filter.eq('country_na', countryName))
      .first()
  );

  return featureFromGeometry(
    source.geometry(),
    {
      region_id: regionId,
      region_label: countryName,
      region_type: 'country',
      boundary_source: LSIB_ID,
      boundary_definition: countryName
    }
  );
}

var LEGACY_COUNTRY_NAMES = [
  'Pakistan',
  'India',
  'Bangladesh',
  'Nepal',
  'Bhutan',
  'Sri Lanka'
];

var legacyCountries = LSIB.filter(
  ee.Filter.inList('country_na', LEGACY_COUNTRY_NAMES)
);

var legacyUnionGeom = legacyCountries.geometry(
  ee.ErrorMargin(GEOM_ERROR_M)
);

var LEGACY_UNION_REGION = featureFromGeometry(
  legacyUnionGeom,
  {
    region_id: 'legacy_indian_subcontinent_union',
    region_label: 'Legacy six-country South Asian union',
    region_type: 'country_union',
    boundary_source: LSIB_ID,
    boundary_definition: 'Pakistan+India+Bangladesh+Nepal+Bhutan+Sri_Lanka'
  }
);

var BROAD_CHIRPS_REGION = rectFeature(
  'south_asia_broad_monsoon_land',
  'Broad South Asian monsoon CHIRPS-land domain',
  60, 5, 105, 40,
  'fixed_diagnostic_rectangle'
).set('boundary_definition', '60E_105E_5N_40N');


// ------------------------------------------------------------
// HydroBASINS main-basin helper.
// Seed points are on lower/main-stem sectors.
// Exported QA geometry MUST be visually inspected before treating
// these as canonical basin boundaries.
// ------------------------------------------------------------

function hydroBasinFromSeed(regionId, regionLabel, lon, lat) {
  var seed = ee.Geometry.Point([lon, lat]);

  var seedFeature = ee.Feature(
    HYBAS4
      .filterBounds(seed)
      .sort('UP_AREA', false)
      .first()
  );

  var mainBas = seedFeature.get('MAIN_BAS');

  var parts = HYBAS4.filter(
    ee.Filter.eq('MAIN_BAS', mainBas)
  );

  var geom = parts.geometry(
    ee.ErrorMargin(GEOM_ERROR_M)
  );

  return featureFromGeometry(
    geom,
    {
      region_id: regionId,
      region_label: regionLabel,
      region_type: 'hydrobasins_main_basin',
      boundary_source: HYBAS4_ID,
      boundary_definition: 'MAIN_BAS selected from seed point',
      hybas_main_bas: mainBas,
      basin_seed_lon: lon,
      basin_seed_lat: lat
    }
  );
}

var INDUS_BASIN = hydroBasinFromSeed(
  'indus_basin_hybas4',
  'Indus main basin (HydroBASINS L4-derived)',
  68.2, 26.0
);

var GANGES_BASIN = hydroBasinFromSeed(
  'ganges_basin_hybas4',
  'Ganges main basin (HydroBASINS L4-derived)',
  87.8, 24.5
);

var BRAHMAPUTRA_BASIN = hydroBasinFromSeed(
  'brahmaputra_basin_hybas4',
  'Brahmaputra main basin (HydroBASINS L4-derived)',
  90.4, 25.2
);

var GODAVARI_BASIN = hydroBasinFromSeed(
  'godavari_basin_hybas4',
  'Godavari main basin (HydroBASINS L4-derived)',
  80.7, 17.1
);

var KRISHNA_BASIN = hydroBasinFromSeed(
  'krishna_basin_hybas4',
  'Krishna main basin (HydroBASINS L4-derived)',
  80.8, 16.2
);

var PAKISTAN = countryRegion('Pakistan', 'pakistan');
var INDIA = countryRegion('India', 'india');
var BANGLADESH = countryRegion('Bangladesh', 'bangladesh');
var NEPAL = countryRegion('Nepal', 'nepal');
var BHUTAN = countryRegion('Bhutan', 'bhutan');
var SRI_LANKA = countryRegion('Sri Lanka', 'sri_lanka');

var PAKISTAN_MONSOON_BELT = rectFeature(
  'pakistan_monsoon_belt',
  'Pakistan monsoon belt diagnostic box',
  67, 24, 78, 36,
  'diagnostic_land_box'
);

var HEAT_LOW_BOX = rectFeature(
  'nw_india_pakistan_heat_low',
  'NW India Pakistan heat-low diagnostic box',
  66, 24, 76, 32,
  'diagnostic_land_box'
);

var CENTRAL_INDIA = rectFeature(
  'central_india_monsoon_core',
  'Central India monsoon-core diagnostic box',
  72, 18, 85, 27,
  'diagnostic_land_box'
);

var GANGETIC_PLAIN = rectFeature(
  'gangetic_plain',
  'Gangetic Plain diagnostic box',
  77, 23, 90, 30,
  'diagnostic_land_box'
);

var NE_INDIA_BANGLADESH = rectFeature(
  'northeast_india_bangladesh',
  'Northeast India Bangladesh diagnostic box',
  88, 20, 96, 28,
  'diagnostic_land_box'
);

var WESTERN_HIMALAYA = rectFeature(
  'western_himalaya',
  'Western Himalaya diagnostic box',
  72, 30, 82, 37,
  'diagnostic_land_box'
);

var EASTERN_HIMALAYA = rectFeature(
  'eastern_himalaya',
  'Eastern Himalaya diagnostic box',
  82, 26, 96, 31,
  'diagnostic_land_box'
);

var INDUS_DELTA = rectFeature(
  'indus_delta_approx',
  'Approximate Indus delta box',
  66.5, 23.5, 68.5, 25.5,
  'approx_delta_box'
);

var GBM_DELTA = rectFeature(
  'gbm_delta_approx',
  'Approximate Ganges Brahmaputra Meghna delta box',
  88.0, 20.0, 92.5, 23.5,
  'approx_delta_box'
);

var MAHANADI_DELTA = rectFeature(
  'mahanadi_delta_approx',
  'Approximate Mahanadi delta box',
  85.5, 19.5, 87.0, 21.0,
  'approx_delta_box'
);

var GODAVARI_KRISHNA_DELTA = rectFeature(
  'godavari_krishna_delta_approx',
  'Approximate Godavari Krishna delta box',
  80.2, 15.3, 82.3, 17.5,
  'approx_delta_box'
);

var CHIRPS_REGIONS = ee.FeatureCollection([
  BROAD_CHIRPS_REGION,
  LEGACY_UNION_REGION,

  PAKISTAN,
  INDIA,
  BANGLADESH,
  NEPAL,
  BHUTAN,
  SRI_LANKA,

  PAKISTAN_MONSOON_BELT,
  HEAT_LOW_BOX,
  CENTRAL_INDIA,
  GANGETIC_PLAIN,
  NE_INDIA_BANGLADESH,
  WESTERN_HIMALAYA,
  EASTERN_HIMALAYA,

  INDUS_DELTA,
  GBM_DELTA,
  MAHANADI_DELTA,
  GODAVARI_KRISHNA_DELTA,

  INDUS_BASIN,
  GANGES_BASIN,
  BRAHMAPUTRA_BASIN,
  GODAVARI_BASIN,
  KRISHNA_BASIN
]);


// ============================================================
// 5. REGION QA
// ============================================================

if (SHOW_MAP_QA) {
  Map.setCenter(82.5, 22.5, 4);
  Map.addLayer(OCEAN_REGIONS, {}, 'Ocean regions', false);
  Map.addLayer(CHIRPS_REGIONS, {}, 'CHIRPS regions', true);
  Map.addLayer(HYBAS4, {}, 'HydroBASINS L4 reference', false);
}

if (EXPORT_REGION_QA) {
  Export.table.toDrive({
    collection: OCEAN_REGIONS,
    description: 'sam_missing_families_ocean_regions_qa',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'sam_missing_families_ocean_regions_qa',
    fileFormat: 'GeoJSON'
  });

  Export.table.toDrive({
    collection: CHIRPS_REGIONS,
    description: 'sam_missing_families_chirps_regions_qa',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'sam_missing_families_chirps_regions_qa',
    fileFormat: 'GeoJSON'
  });
}


// ============================================================
// 6. EXACT INCLUSIVE MONTH LIST
// ============================================================

function makeMonthStarts(firstMonthString, lastMonthString) {
  var firstMonth = ee.Date(firstMonthString);
  var lastMonth = ee.Date(lastMonthString);

  var firstIndex = ee.Number(firstMonth.get('year'))
    .multiply(12)
    .add(
      ee.Number(firstMonth.get('month'))
        .subtract(1)
    );

  var lastIndex = ee.Number(lastMonth.get('year'))
    .multiply(12)
    .add(
      ee.Number(lastMonth.get('month'))
        .subtract(1)
    );

  var nSteps = lastIndex.subtract(firstIndex);

  return ee.List.sequence(0, nSteps)
    .map(function(step) {
      return firstMonth.advance(
        ee.Number(step),
        'month'
      );
    });
}


// ============================================================
// 7. GENERIC MASKED MULTI-BAND IMAGE
// ============================================================

function maskedMultiBand(bandNames) {
  var image = ee.Image.constant(0)
    .rename(bandNames[0])
    .updateMask(ee.Image.constant(0));

  for (var i = 1; i < bandNames.length; i++) {
    image = image.addBands(
      ee.Image.constant(0)
        .rename(bandNames[i])
        .updateMask(ee.Image.constant(0))
    );
  }

  return image;
}


// ============================================================
// 8. GENERIC AREA-WEIGHTED OCEAN REDUCTION
// ============================================================

function areaWeightedOceanReduction(image, variableNames, scaleM) {
  var pixelArea = ee.Image.pixelArea();
  var stack = null;

  variableNames.forEach(function(variableName) {
    var value = image.select(variableName);

    var weighted = value
      .multiply(pixelArea)
      .rename(variableName + '__weighted');

    var validArea = pixelArea
      .updateMask(value.mask())
      .rename(variableName + '__valid_area');

    var pair = weighted.addBands(validArea);

    stack = (stack === null)
      ? pair
      : stack.addBands(pair);
  });

  var reduced = ee.Image(stack).reduceRegions({
    collection: OCEAN_REGIONS,
    reducer: ee.Reducer.sum(),
    scale: scaleM,
    tileScale: OCEAN_TILE_SCALE,
    maxPixelsPerRegion: 1e13
  });

  return reduced.map(function(feature) {
    var f = ee.Feature(feature);

    var output = ee.Feature(null, {
      region_id: f.get('region_id'),
      region_label: f.get('region_label'),
      region_type: f.get('region_type'),
      boundary_source: f.get('boundary_source'),
      boundary_definition: f.get('boundary_definition'),
      lon_min: f.get('lon_min'),
      lat_min: f.get('lat_min'),
      lon_max: f.get('lon_max'),
      lat_max: f.get('lat_max'),
      region_area_km2: f.get('region_area_km2')
    });

    variableNames.forEach(function(variableName) {
      var weightedRaw = f.get(variableName + '__weighted');
      var areaRaw = f.get(variableName + '__valid_area');

      var weightedSafe = ee.Number(
        ee.Algorithms.If(
          ee.Algorithms.IsEqual(weightedRaw, null),
          0,
          weightedRaw
        )
      );

      var areaSafe = ee.Number(
        ee.Algorithms.If(
          ee.Algorithms.IsEqual(areaRaw, null),
          0,
          areaRaw
        )
      );

      var valid = areaSafe.gt(0);

      output = output.set(
        variableName,
        ee.Algorithms.If(
          valid,
          weightedSafe.divide(areaSafe),
          MISSING
        )
      );
    });

    // One simple QA area field, based on the first variable's mask.
    var firstAreaRaw = f.get(variableNames[0] + '__valid_area');
    var firstAreaSafe = ee.Number(
      ee.Algorithms.If(
        ee.Algorithms.IsEqual(firstAreaRaw, null),
        0,
        firstAreaRaw
      )
    );

    output = output.set(
      'effective_area_km2',
      ee.Algorithms.If(
        firstAreaSafe.gt(0),
        firstAreaSafe.divide(1e6),
        MISSING
      )
    );

    return output;
  });
}


// ============================================================
// 9. COPERNICUS SSS / DENSITY MONTHLY EXPORT
// ============================================================

var SSS_VARIABLES = [
  'sos',
  'sos_error',
  'dos',
  'dos_error',
  'sea_ice_fraction'
];

var SSS_REP = ee.ImageCollection(SSS_REP_ID)
  .select(SSS_VARIABLES);

var SSS_NRT = ee.ImageCollection(SSS_NRT_ID)
  .select(SSS_VARIABLES);

function getSssMonthCollection(monthStart, monthEnd) {
  monthStart = ee.Date(monthStart);
  monthEnd = ee.Date(monthEnd);

  var useNrt = monthStart.millis()
    .gte(SSS_NRT_SWITCH_DATE.millis());

  return ee.ImageCollection(
    ee.Algorithms.If(
      useNrt,
      SSS_NRT.filterDate(monthStart, monthEnd),
      SSS_REP.filterDate(monthStart, monthEnd)
    )
  );
}

function getSssSourceProduct(monthStart) {
  monthStart = ee.Date(monthStart);

  return ee.String(
    ee.Algorithms.If(
      monthStart.millis().gte(SSS_NRT_SWITCH_DATE.millis()),
      'NRT_DAILY',
      'REP_DAILY'
    )
  );
}

function buildOneSssMonth(monthStart) {
  monthStart = ee.Date(monthStart);
  var monthEnd = monthStart.advance(1, 'month');

  var collection = getSssMonthCollection(
    monthStart,
    monthEnd
  );

  var nImages = collection.size();

  var expectedDays = monthEnd
    .difference(monthStart, 'day')
    .round();

  var coverage = ee.Number(nImages)
    .divide(expectedDays);

  var monthlyImage = ee.Image(
    ee.Algorithms.If(
      ee.Number(nImages).gt(0),
      collection.mean().select(SSS_VARIABLES),
      maskedMultiBand(SSS_VARIABLES)
    )
  );

  var rows = areaWeightedOceanReduction(
    monthlyImage,
    SSS_VARIABLES,
    SSS_SCALE_M
  );

  return rows.map(function(feature) {
    return ee.Feature(feature).set({
      dataset_id: 'COPERNICUS/MARINE/GLOBAL_SEA_SURFACE',
      sss_source_product: getSssSourceProduct(monthStart),

      date_yyyy_mm: monthStart.format('YYYY-MM'),
      year: monthStart.get('year'),
      month: monthStart.get('month'),
      month_start: monthStart.format('YYYY-MM-dd'),
      month_end_exclusive: monthEnd.format('YYYY-MM-dd'),

      n_sss_daily_images: nImages,
      expected_days_in_month: expectedDays,
      coverage_fraction: coverage,
      month_has_full_daily_coverage: ee.Number(
        ee.Algorithms.If(
          ee.Number(nImages).eq(expectedDays),
          1,
          0
        )
      ),

      source_nominal_scale_m: SSS_SCALE_M,
      spatial_aggregation: 'area_weighted_mean_over_valid_ocean_pixels',
      temporal_aggregation: 'mean_of_available_daily_images'
    });
  });
}

function buildSssChunk(start, lastMonth) {
  var months = makeMonthStarts(start, lastMonth);

  var nested = months.map(function(monthStart) {
    return buildOneSssMonth(monthStart);
  });

  return ee.FeatureCollection(nested).flatten();
}

var SSS_SELECTORS = [
  'dataset_id',
  'sss_source_product',

  'date_yyyy_mm',
  'year',
  'month',
  'month_start',
  'month_end_exclusive',

  'region_id',
  'region_label',
  'region_type',
  'boundary_source',
  'boundary_definition',
  'lon_min',
  'lat_min',
  'lon_max',
  'lat_max',
  'region_area_km2',
  'effective_area_km2',

  'n_sss_daily_images',
  'expected_days_in_month',
  'coverage_fraction',
  'month_has_full_daily_coverage',

  'source_nominal_scale_m',
  'spatial_aggregation',
  'temporal_aggregation',

  'sos',
  'sos_error',
  'dos',
  'dos_error',
  'sea_ice_fraction'
];

SSS_CHUNKS.forEach(function(chunk) {
  var prefix =
    'south_asia_ocean_'
    + 'copernicus_sss_density_indices_'
    + chunk.label
    + '_raw_monthly_long';

  Export.table.toDrive({
    collection: buildSssChunk(
      chunk.start,
      chunk.lastMonth
    ).select(SSS_SELECTORS),

    description: prefix,
    folder: EXPORT_FOLDER,
    fileNamePrefix: prefix,
    fileFormat: 'CSV',
    selectors: SSS_SELECTORS
  });
});


// ============================================================
// 10. HYCOM SUBSURFACE MONTHLY EXPORT
// ============================================================
// Earth Engine catalog encoding:
//   physical value = raw * 0.001 + 20
// for both temperature and salinity bands.
//
// Upper-ocean 0-50 m proxy uses trapezoidal depth weighting at
// 0, 20, 50 m:
//   0.2*x0 + 0.5*x20 + 0.3*x50
// ============================================================

function scaleHycomImage(image) {
  image = ee.Image(image);

  function scaled(sourceBand, outputBand) {
    return image
      .select(sourceBand)
      .multiply(0.001)
      .add(20)
      .rename(outputBand);
  }

  var t0 = scaled('water_temp_0', 'water_temp_0_c');
  var s0 = scaled('salinity_0', 'salinity_0_psu');
  var t20 = scaled('water_temp_20', 'water_temp_20_c');
  var s20 = scaled('salinity_20', 'salinity_20_psu');
  var t50 = scaled('water_temp_50', 'water_temp_50_c');
  var s50 = scaled('salinity_50', 'salinity_50_psu');
  var t100 = scaled('water_temp_100', 'water_temp_100_c');
  var s100 = scaled('salinity_100', 'salinity_100_psu');

  var temp0Minus20 = t0.subtract(t20)
    .rename('temp_0m_minus_20m_c');

  var temp0Minus50 = t0.subtract(t50)
    .rename('temp_0m_minus_50m_c');

  var temp0Minus100 = t0.subtract(t100)
    .rename('temp_0m_minus_100m_c');

  var sal0Minus20 = s0.subtract(s20)
    .rename('salinity_0m_minus_20m_psu');

  var sal0Minus50 = s0.subtract(s50)
    .rename('salinity_0m_minus_50m_psu');

  var sal0Minus100 = s0.subtract(s100)
    .rename('salinity_0m_minus_100m_psu');

  var upperTemp = t0.multiply(0.2)
    .add(t20.multiply(0.5))
    .add(t50.multiply(0.3))
    .rename('upper_ocean_temp_proxy_0_50_c');

  var upperSalinity = s0.multiply(0.2)
    .add(s20.multiply(0.5))
    .add(s50.multiply(0.3))
    .rename('upper_ocean_salinity_proxy_0_50_psu');

  return ee.Image.cat([
    t0,
    s0,
    t20,
    s20,
    t50,
    s50,
    t100,
    s100,
    temp0Minus20,
    temp0Minus50,
    temp0Minus100,
    sal0Minus20,
    sal0Minus50,
    sal0Minus100,
    upperTemp,
    upperSalinity
  ]).copyProperties(
    image,
    ['system:time_start', 'experiment']
  );
}

var HYCOM_VARIABLES = [
  'water_temp_0_c',
  'salinity_0_psu',
  'water_temp_20_c',
  'salinity_20_psu',
  'water_temp_50_c',
  'salinity_50_psu',
  'water_temp_100_c',
  'salinity_100_psu',
  'temp_0m_minus_20m_c',
  'temp_0m_minus_50m_c',
  'temp_0m_minus_100m_c',
  'salinity_0m_minus_20m_psu',
  'salinity_0m_minus_50m_psu',
  'salinity_0m_minus_100m_psu',
  'upper_ocean_temp_proxy_0_50_c',
  'upper_ocean_salinity_proxy_0_50_psu'
];

var HYCOM = ee.ImageCollection(HYCOM_ID)
  .map(scaleHycomImage);

function buildOneHycomMonth(monthStart) {
  monthStart = ee.Date(monthStart);
  var monthEnd = monthStart.advance(1, 'month');

  var collection = HYCOM.filterDate(
    monthStart,
    monthEnd
  );

  var nImages = collection.size();

  var expectedDays = monthEnd
    .difference(monthStart, 'day')
    .round();

  var coverage = ee.Number(nImages)
    .divide(expectedDays);

  var monthlyImage = ee.Image(
    ee.Algorithms.If(
      ee.Number(nImages).gt(0),
      collection.mean().select(HYCOM_VARIABLES),
      maskedMultiBand(HYCOM_VARIABLES)
    )
  );

  var rows = areaWeightedOceanReduction(
    monthlyImage,
    HYCOM_VARIABLES,
    HYCOM_SCALE_M
  );

  return rows.map(function(feature) {
    return ee.Feature(feature).set({
      dataset_id: HYCOM_ID,

      date_yyyy_mm: monthStart.format('YYYY-MM'),
      year: monthStart.get('year'),
      month: monthStart.get('month'),
      month_start: monthStart.format('YYYY-MM-dd'),
      month_end_exclusive: monthEnd.format('YYYY-MM-dd'),

      n_hycom_daily_images: nImages,
      expected_days_in_month: expectedDays,
      coverage_fraction: coverage,
      month_has_full_daily_coverage: ee.Number(
        ee.Algorithms.If(
          ee.Number(nImages).eq(expectedDays),
          1,
          0
        )
      ),

      source_nominal_scale_m: HYCOM_SCALE_M,
      spatial_aggregation: 'area_weighted_mean_over_valid_ocean_pixels',
      temporal_aggregation: 'mean_of_available_daily_images',
      upper_ocean_proxy_definition: '0.2*x0m + 0.5*x20m + 0.3*x50m'
    });
  });
}

function buildHycomChunk(start, lastMonth) {
  var months = makeMonthStarts(start, lastMonth);

  var nested = months.map(function(monthStart) {
    return buildOneHycomMonth(monthStart);
  });

  return ee.FeatureCollection(nested).flatten();
}

var HYCOM_SELECTORS = [
  'dataset_id',

  'date_yyyy_mm',
  'year',
  'month',
  'month_start',
  'month_end_exclusive',

  'region_id',
  'region_label',
  'region_type',
  'boundary_source',
  'boundary_definition',
  'lon_min',
  'lat_min',
  'lon_max',
  'lat_max',
  'region_area_km2',
  'effective_area_km2',

  'n_hycom_daily_images',
  'expected_days_in_month',
  'coverage_fraction',
  'month_has_full_daily_coverage',

  'source_nominal_scale_m',
  'spatial_aggregation',
  'temporal_aggregation',
  'upper_ocean_proxy_definition',

  'water_temp_0_c',
  'salinity_0_psu',
  'water_temp_20_c',
  'salinity_20_psu',
  'water_temp_50_c',
  'salinity_50_psu',
  'water_temp_100_c',
  'salinity_100_psu',

  'temp_0m_minus_20m_c',
  'temp_0m_minus_50m_c',
  'temp_0m_minus_100m_c',

  'salinity_0m_minus_20m_psu',
  'salinity_0m_minus_50m_psu',
  'salinity_0m_minus_100m_psu',

  'upper_ocean_temp_proxy_0_50_c',
  'upper_ocean_salinity_proxy_0_50_psu'
];

HYCOM_CHUNKS.forEach(function(chunk) {
  var prefix =
    'south_asia_ocean_'
    + 'hycom_subsurface_temp_salinity_indices_'
    + chunk.label
    + '_raw_monthly_long';

  Export.table.toDrive({
    collection: buildHycomChunk(
      chunk.start,
      chunk.lastMonth
    ).select(HYCOM_SELECTORS),

    description: prefix,
    folder: EXPORT_FOLDER,
    fileNamePrefix: prefix,
    fileFormat: 'CSV',
    selectors: HYCOM_SELECTORS
  });
});


// ============================================================
// 11. CHIRPS DAILY REGIONAL JJAS RAINFALL
// ============================================================

var CHIRPS = ee.ImageCollection(CHIRPS_ID)
  .select('precipitation');

function chirpsRowsForImage(image) {
  image = ee.Image(image);

  var date = ee.Date(
    image.get('system:time_start')
  );

  var rain = image
    .select('precipitation')
    .rename('rain_mm_pixel');

  var area = ee.Image.pixelArea()
    .updateMask(rain.mask())
    .rename('effective_area_m2');

  var rainArea = rain
    .multiply(area)
    .rename('rain_mm_area_m2');

  var reduced = rainArea
    .addBands(area)
    .reduceRegions({
      collection: CHIRPS_REGIONS,
      reducer: ee.Reducer.sum(),
      scale: CHIRPS_SCALE_M,
      tileScale: CHIRPS_TILE_SCALE,
      maxPixelsPerRegion: 1e13
    });

  return reduced.map(function(feature) {
    var f = ee.Feature(feature);

    var rainAreaRaw = f.get('rain_mm_area_m2');
    var areaRaw = f.get('effective_area_m2');

    var rainAreaSafe = ee.Number(
      ee.Algorithms.If(
        ee.Algorithms.IsEqual(rainAreaRaw, null),
        0,
        rainAreaRaw
      )
    );

    var areaSafe = ee.Number(
      ee.Algorithms.If(
        ee.Algorithms.IsEqual(areaRaw, null),
        0,
        areaRaw
      )
    );

    var valid = areaSafe.gt(0);

    return ee.Feature(null, {
      dataset_id: CHIRPS_ID,

      date_yyyy_mm_dd: date.format('YYYY-MM-dd'),
      year: date.get('year'),
      month: date.get('month'),
      day: date.get('day'),

      region_id: f.get('region_id'),
      region_label: f.get('region_label'),
      region_type: f.get('region_type'),
      boundary_source: f.get('boundary_source'),
      boundary_definition: f.get('boundary_definition'),
      region_area_km2: f.get('region_area_km2'),

      hybas_main_bas: f.get('hybas_main_bas'),
      basin_seed_lon: f.get('basin_seed_lon'),
      basin_seed_lat: f.get('basin_seed_lat'),

      rain_mm: ee.Algorithms.If(
        valid,
        rainAreaSafe.divide(areaSafe),
        MISSING
      ),

      rain_volume_km3: ee.Algorithms.If(
        valid,
        rainAreaSafe.divide(1e12),
        MISSING
      ),

      effective_area_km2: ee.Algorithms.If(
        valid,
        areaSafe.divide(1e6),
        MISSING
      ),

      valid_data: ee.Number(
        ee.Algorithms.If(valid, 1, 0)
      ),

      n_chirps_daily_images: 1,
      source_nominal_scale_m: CHIRPS_SCALE_M,
      spatial_aggregation: 'area_weighted_mean_over_valid_chirps_pixels'
    });
  });
}

function buildChirpsDailyChunk(startYear, endYear) {
  var start = ee.Date.fromYMD(
    startYear,
    6,
    1
  );

  var end = ee.Date.fromYMD(
    endYear,
    10,
    1
  );

  var collection = CHIRPS
    .filterDate(start, end)
    .filter(
      ee.Filter.calendarRange(
        6,
        9,
        'month'
      )
    );

  var list = collection.toList(
    collection.size()
  );

  var nested = list.map(function(imageObject) {
    return chirpsRowsForImage(
      ee.Image(imageObject)
    );
  });

  return ee.FeatureCollection(nested).flatten();
}

var CHIRPS_DAILY_SELECTORS = [
  'dataset_id',

  'date_yyyy_mm_dd',
  'year',
  'month',
  'day',

  'region_id',
  'region_label',
  'region_type',
  'boundary_source',
  'boundary_definition',
  'region_area_km2',

  'hybas_main_bas',
  'basin_seed_lon',
  'basin_seed_lat',

  'rain_mm',
  'rain_volume_km3',
  'effective_area_km2',
  'valid_data',

  'n_chirps_daily_images',
  'source_nominal_scale_m',
  'spatial_aggregation'
];


// ============================================================
// 12. CHIRPS ANNUAL JJAS EXTREMES
// ============================================================

function listSum(list) {
  return ee.Number(
    ee.List(list).reduce(
      ee.Reducer.sum()
    )
  );
}

function listMax(list) {
  return ee.Number(
    ee.List(list).reduce(
      ee.Reducer.max()
    )
  );
}

function countThreshold(list, threshold, comparison) {
  var flags = ee.List(list).map(function(value) {
    value = ee.Number(value);

    if (comparison === 'gte') {
      return ee.Number(
        value.gte(threshold)
      );
    }

    if (comparison === 'lt') {
      return ee.Number(
        value.lt(threshold)
      );
    }

    return 0;
  });

  return listSum(flags);
}

function longestBooleanRun(booleanList) {
  var initial = ee.Dictionary({
    current: 0,
    longest: 0
  });

  var result = ee.Dictionary(
    ee.List(booleanList).iterate(
      function(value, state) {
        state = ee.Dictionary(state);

        var current = ee.Number(
          state.get('current')
        );

        var longest = ee.Number(
          state.get('longest')
        );

        var isTrue = ee.Number(value).eq(1);

        var newCurrent = ee.Number(
          ee.Algorithms.If(
            isTrue,
            current.add(1),
            0
          )
        );

        return ee.Dictionary({
          current: newCurrent,
          longest: longest.max(newCurrent)
        });
      },
      initial
    )
  );

  return ee.Number(
    result.get('longest')
  );
}

function rollingMaxSum(rainList, windowSize) {
  rainList = ee.List(rainList);

  var n = rainList.length();
  var canCompute = n.gte(windowSize);

  var indices = ee.List.sequence(
    0,
    ee.Number(n)
      .subtract(windowSize)
      .max(0)
  );

  var sums = indices.map(function(index) {
    index = ee.Number(index);

    return listSum(
      rainList.slice(
        index,
        index.add(windowSize)
      )
    );
  });

  return ee.Number(
    ee.Algorithms.If(
      canCompute,
      listMax(sums),
      MISSING
    )
  );
}

function completeMetric(complete, value) {
  return ee.Number(
    ee.Algorithms.If(
      complete,
      value,
      MISSING
    )
  );
}

function safeRainAggregateSum(collection) {
  return ee.Number(
    ee.Algorithms.If(
      collection.size().gt(0),
      collection.aggregate_sum('rain_mm'),
      0
    )
  );
}

function annualMetricsForRegionYear(dailyRows, regionFeature, year) {
  regionFeature = ee.Feature(regionFeature);
  year = ee.Number(year);

  var regionId = ee.String(
    regionFeature.get('region_id')
  );

  var group = dailyRows
    .filter(
      ee.Filter.eq(
        'region_id',
        regionId
      )
    )
    .filter(
      ee.Filter.eq(
        'year',
        year
      )
    )
    .sort('date_yyyy_mm_dd');

  var expectedDays = 122;
  var sourceDays = group.size();

  var validDays = ee.Number(
    ee.Algorithms.If(
      sourceDays.gt(0),
      group.aggregate_sum('valid_data'),
      0
    )
  );

  var coverage = ee.Number(sourceDays)
    .divide(expectedDays);

  var validCoverage = validDays
    .divide(expectedDays);

  var complete = ee.Number(sourceDays)
    .eq(expectedDays)
    .and(
      validDays.eq(expectedDays)
    );

  var validGroup = group.filter(
    ee.Filter.eq('valid_data', 1)
  );

  var rainList = ee.List(
    validGroup.aggregate_array('rain_mm')
  );

  var safeRainList = ee.List(
    ee.Algorithms.If(
      validDays.gt(0),
      rainList,
      ee.List([0])
    )
  );

  var jjasTotal = listSum(
    safeRainList
  );

  function monthTotal(monthNumber) {
    return safeRainAggregateSum(
      validGroup.filter(
        ee.Filter.eq(
          'month',
          monthNumber
        )
      )
    );
  }

  var juneTotal = monthTotal(6);
  var julyTotal = monthTotal(7);
  var augustTotal = monthTotal(8);
  var septemberTotal = monthTotal(9);

  var monthTotals = ee.List([
    juneTotal,
    julyTotal,
    augustTotal,
    septemberTotal
  ]);

  var monthNumbers = ee.List([
    6,
    7,
    8,
    9
  ]);

  var peakMonthTotal = listMax(
    monthTotals
  );

  var peakMonthIndex = monthTotals.indexOf(
    peakMonthTotal
  );

  var peakMonth = ee.Number(
    monthNumbers.get(
      peakMonthIndex
    )
  );

  var wetCount = countThreshold(
    safeRainList,
    1,
    'gte'
  );

  var heavy10 = countThreshold(
    safeRainList,
    10,
    'gte'
  );

  var heavy20 = countThreshold(
    safeRainList,
    20,
    'gte'
  );

  var extreme50 = countThreshold(
    safeRainList,
    50,
    'gte'
  );

  var wetBooleans = safeRainList.map(function(value) {
    return ee.Number(
      ee.Number(value).gte(1)
    );
  });

  var dryBooleans = safeRainList.map(function(value) {
    return ee.Number(
      ee.Number(value).lt(1)
    );
  });

  var cwd = longestBooleanRun(
    wetBooleans
  );

  var cdd = longestBooleanRun(
    dryBooleans
  );

  var max1 = listMax(
    safeRainList
  );

  var max3 = rollingMaxSum(
    safeRainList,
    3
  );

  var max5 = rollingMaxSum(
    safeRainList,
    5
  );

  var wetRainList = safeRainList.map(function(value) {
    value = ee.Number(value);

    return ee.Number(
      ee.Algorithms.If(
        value.gte(1),
        value,
        0
      )
    );
  });

  var wetRainTotal = listSum(
    wetRainList
  );

  var sdii = ee.Number(
    ee.Algorithms.If(
      wetCount.gt(0),
      wetRainTotal.divide(wetCount),
      MISSING
    )
  );

  function share(monthValue) {
    return ee.Number(
      ee.Algorithms.If(
        jjasTotal.gt(0),
        ee.Number(monthValue).divide(jjasTotal),
        MISSING
      )
    );
  }

  return ee.Feature(null, {
    dataset_id: CHIRPS_ID,

    year: year,

    region_id: regionFeature.get('region_id'),
    region_label: regionFeature.get('region_label'),
    region_type: regionFeature.get('region_type'),
    boundary_source: regionFeature.get('boundary_source'),
    boundary_definition: regionFeature.get('boundary_definition'),
    region_area_km2: regionFeature.get('region_area_km2'),

    hybas_main_bas: regionFeature.get('hybas_main_bas'),
    basin_seed_lon: regionFeature.get('basin_seed_lon'),
    basin_seed_lat: regionFeature.get('basin_seed_lat'),

    expected_jjas_days: expectedDays,
    source_days_available: sourceDays,
    valid_days_available: validDays,
    coverage_fraction: coverage,
    valid_coverage_fraction: validCoverage,
    jjas_complete: ee.Number(
      ee.Algorithms.If(
        complete,
        1,
        0
      )
    ),

    jjas_total_mm: completeMetric(
      complete,
      jjasTotal
    ),

    june_total_mm: completeMetric(
      complete,
      juneTotal
    ),

    july_total_mm: completeMetric(
      complete,
      julyTotal
    ),

    august_total_mm: completeMetric(
      complete,
      augustTotal
    ),

    september_total_mm: completeMetric(
      complete,
      septemberTotal
    ),

    june_share: completeMetric(
      complete,
      share(juneTotal)
    ),

    july_share: completeMetric(
      complete,
      share(julyTotal)
    ),

    august_share: completeMetric(
      complete,
      share(augustTotal)
    ),

    september_share: completeMetric(
      complete,
      share(septemberTotal)
    ),

    peak_month: completeMetric(
      complete,
      peakMonth
    ),

    peak_month_total_mm: completeMetric(
      complete,
      peakMonthTotal
    ),

    peak_month_share: completeMetric(
      complete,
      share(peakMonthTotal)
    ),

    rainy_day_count_ge1mm: completeMetric(
      complete,
      wetCount
    ),

    heavy_day_count_ge10mm: completeMetric(
      complete,
      heavy10
    ),

    very_heavy_day_count_ge20mm: completeMetric(
      complete,
      heavy20
    ),

    extreme_day_count_ge50mm: completeMetric(
      complete,
      extreme50
    ),

    cwd_max_ge1mm: completeMetric(
      complete,
      cwd
    ),

    cdd_max_lt1mm: completeMetric(
      complete,
      cdd
    ),

    max1day_mm: completeMetric(
      complete,
      max1
    ),

    max3day_mm: completeMetric(
      complete,
      max3
    ),

    max5day_mm: completeMetric(
      complete,
      max5
    ),

    sdii_mm_per_wet_day: completeMetric(
      complete,
      sdii
    ),

    monthly_concentration_peak_share: completeMetric(
      complete,
      share(peakMonthTotal)
    ),

    annual_metric_basis: 'daily_area_weighted_regional_mean_rainfall'
  });
}

function buildChirpsAnnualMetrics(dailyRows, startYear, endYear) {
  var years = ee.List.sequence(
    startYear,
    endYear
  );

  var regionList = CHIRPS_REGIONS.toList(
    CHIRPS_REGIONS.size()
  );

  var nestedYears = years.map(function(year) {
    var nestedRegions = regionList.map(function(regionObject) {
      return annualMetricsForRegionYear(
        dailyRows,
        ee.Feature(regionObject),
        ee.Number(year)
      );
    });

    return ee.FeatureCollection(
      nestedRegions
    );
  });

  return ee.FeatureCollection(
    nestedYears
  ).flatten();
}

var CHIRPS_ANNUAL_SELECTORS = [
  'dataset_id',
  'year',

  'region_id',
  'region_label',
  'region_type',
  'boundary_source',
  'boundary_definition',
  'region_area_km2',

  'hybas_main_bas',
  'basin_seed_lon',
  'basin_seed_lat',

  'expected_jjas_days',
  'source_days_available',
  'valid_days_available',
  'coverage_fraction',
  'valid_coverage_fraction',
  'jjas_complete',

  'jjas_total_mm',

  'june_total_mm',
  'july_total_mm',
  'august_total_mm',
  'september_total_mm',

  'june_share',
  'july_share',
  'august_share',
  'september_share',

  'peak_month',
  'peak_month_total_mm',
  'peak_month_share',

  'rainy_day_count_ge1mm',
  'heavy_day_count_ge10mm',
  'very_heavy_day_count_ge20mm',
  'extreme_day_count_ge50mm',

  'cwd_max_ge1mm',
  'cdd_max_lt1mm',

  'max1day_mm',
  'max3day_mm',
  'max5day_mm',

  'sdii_mm_per_wet_day',
  'monthly_concentration_peak_share',
  'annual_metric_basis'
];


// ============================================================
// 13. EXPORT CHIRPS DAILY + ANNUAL CHUNKS
// ============================================================

CHIRPS_YEAR_CHUNKS.forEach(function(chunk) {
  var dailyRows = buildChirpsDailyChunk(
    chunk.startYear,
    chunk.endYear
  );

  var dailyPrefix =
    'south_asia_chirps_'
    + 'daily_regional_rainfall_jjas_'
    + chunk.startYear
    + '_'
    + chunk.endYear
    + '_long';

  Export.table.toDrive({
    collection: dailyRows.select(
      CHIRPS_DAILY_SELECTORS
    ),
    description: dailyPrefix,
    folder: EXPORT_FOLDER,
    fileNamePrefix: dailyPrefix,
    fileFormat: 'CSV',
    selectors: CHIRPS_DAILY_SELECTORS
  });

  var annualRows = buildChirpsAnnualMetrics(
    dailyRows,
    chunk.startYear,
    chunk.endYear
  );

  var annualPrefix =
    'south_asia_chirps_'
    + 'annual_regional_rainfall_extremes_jjas_'
    + chunk.startYear
    + '_'
    + chunk.endYear
    + '_long';

  Export.table.toDrive({
    collection: annualRows.select(
      CHIRPS_ANNUAL_SELECTORS
    ),
    description: annualPrefix,
    folder: EXPORT_FOLDER,
    fileNamePrefix: annualPrefix,
    fileFormat: 'CSV',
    selectors: CHIRPS_ANNUAL_SELECTORS
  });
});


// ============================================================
// 14. CONSOLE QA
// ============================================================

print('Ocean region count', OCEAN_REGIONS.size());
print('CHIRPS region count', CHIRPS_REGIONS.size());

print(
  'SSS REP first image',
  SSS_REP.first()
);

print(
  'SSS NRT first image',
  SSS_NRT.first()
);

print(
  'HYCOM first scaled image',
  HYCOM.first()
);

print(
  'CHIRPS most recent available image date',
  ee.Date(
    CHIRPS
      .sort('system:time_start', false)
      .first()
      .get('system:time_start')
  ).format('YYYY-MM-dd')
);

// Expected task count with EXPORT_REGION_QA = true:
//   2 region-QA GeoJSON
//   4 SSS CSV chunks
//   4 HYCOM CSV chunks
//   5 CHIRPS daily CSV chunks
//   5 CHIRPS annual-extremes CSV chunks
// = 20 tasks total.


// ============================================================
// END
// ============================================================
