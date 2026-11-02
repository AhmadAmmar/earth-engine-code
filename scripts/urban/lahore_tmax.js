// ============================================================================
// LAHORE DAILY MAXIMUM TEMPERATURE EXPORT — IMPROVED URBAN-EXTENT VERSION
// Google Earth Engine JavaScript
//
// Dataset:
//   ECMWF ERA5-Land Daily Aggregated
//   Asset: ECMWF/ERA5_LAND/DAILY_AGGR
//
// Purpose:
//   Export a compact daily CSV suitable for cumulative heat-threshold plots.
//
// Why this is preferable to the earlier NOAA CPC extraction:
//   - NOAA CPC pixel size: approximately 55.5 km
//   - ERA5-Land pixel size: approximately 11.1 km
//   - The earlier CPC export sampled one arbitrarily aligned coarse grid cell.
//   - This script exports both a central pixel and spatial summaries across
//     an explicitly defined Lahore urban-analysis extent.
//
// Output columns:
//   date
//   central_pixel_tmax_c
//   urban_mean_tmax_c
//   urban_median_tmax_c
//   urban_p90_tmax_c
//   urban_max_tmax_c
//   contributing_pixel_count
//
// Notes:
//   - ERA5-Land temperatures are supplied in Kelvin and converted here to °C.
//   - The default analysis extent is a 20 km buffer around central Lahore.
//   - The CSV remains small: one row per day.
//   - Calculations, rankings, and plots should still be done in Python.
// ============================================================================


// ---------------------------------------------------------------------------
// 1. USER SETTINGS
// ---------------------------------------------------------------------------

// Lahore centre point.
// Earth Engine coordinate order is [longitude, latitude].
var LAHORE_CENTRE = ee.Geometry.Point([74.3587, 31.5204]);

// Explicit urban-analysis extent.
// This is NOT an administrative district boundary.
// Adjust the radius if required, or replace with a manually drawn polygon.
var URBAN_BUFFER_RADIUS_METRES = 21000;

var LAHORE_URBAN_EXTENT = LAHORE_CENTRE.buffer(
  URBAN_BUFFER_RADIUS_METRES
);

// Start in 1979 for direct comparability with the earlier NOAA CPC export.
// ERA5-Land is available farther back. Change to '1950-01-02' if a longer
// historical series is useful.
var START_DATE = '1979-01-01';

// Dynamic end date. Earth Engine will return only available images.
var END_DATE_EXCLUSIVE = ee.Date(Date.now()).advance(1, 'day');

// Google Drive export settings.
var DRIVE_FOLDER = 'GEE_exports';

var CSV_FILE_PREFIX =
  'lahore_era5land_daily_tmax_urban_extent_1979_present';

var BOUNDARY_FILE_PREFIX =
  'lahore_urban_analysis_extent_20km_buffer';


// ---------------------------------------------------------------------------
// 2. LOAD ERA5-LAND DAILY MAXIMUM 2-METRE AIR TEMPERATURE
// ---------------------------------------------------------------------------

// ERA5-Land daily Tmax is stored in Kelvin.
// Convert it to degrees Celsius immediately and retain the date property.
var era5LandDailyTmax = ee.ImageCollection(
  'ECMWF/ERA5_LAND/DAILY_AGGR'
)
  .filterDate(START_DATE, END_DATE_EXCLUSIVE)
  .select('temperature_2m_max')
  .map(function(image) {
    return image
      .subtract(273.15)
      .rename('tmax_c')
      .copyProperties(
        image,
        ['system:time_start']
      );
  })
  .sort('system:time_start');


// ---------------------------------------------------------------------------
// 3. READ THE DATASET'S NATIVE GRID SETTINGS
// ---------------------------------------------------------------------------

var exampleImage = ee.Image(
  era5LandDailyTmax.first()
);

var nativeProjection = exampleImage.projection();

var nativeScale = nativeProjection.nominalScale();

print(
  'ERA5-Land native projection:',
  nativeProjection
);

print(
  'ERA5-Land nominal pixel size in metres:',
  nativeScale
);

print(
  'Number of available daily images:',
  era5LandDailyTmax.size()
);


// ---------------------------------------------------------------------------
// 4. BUILD A COMPACT MULTI-STATISTIC REDUCER
// ---------------------------------------------------------------------------

// This reducer returns several urban-extent statistics in one operation.
//
// Earth Engine's standard mean reducer is weighted approximately by the
// fraction of each pixel overlapping the polygon.
//
// Percentile 90 is retained as a robust severe-heat metric.
// Maximum is retained only as a sensitivity diagnostic.
var urbanStatisticsReducer = ee.Reducer.mean()
  .combine({
    reducer2: ee.Reducer.median(),
    sharedInputs: true
  })
  .combine({
    reducer2: ee.Reducer.percentile([90]),
    sharedInputs: true
  })
  .combine({
    reducer2: ee.Reducer.max(),
    sharedInputs: true
  })
  .combine({
    reducer2: ee.Reducer.count(),
    sharedInputs: true
  });


// ---------------------------------------------------------------------------
// 5. EXTRACT ONE COMPACT FEATURE PER DAY
// ---------------------------------------------------------------------------

var dailyFeatures = ee.FeatureCollection(
  era5LandDailyTmax.map(function(image) {

    var date = ee.Date(
      image.get('system:time_start')
    );

    // Central Lahore ERA5-Land pixel.
    // This is useful as a gridded analogue to a station-style series.
    var centralPixel = image.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: LAHORE_CENTRE,
      crs: nativeProjection,
      scale: nativeScale,
      maxPixels: 10
    });

    // Urban-extent statistics.
    var urbanStatistics = image.reduceRegion({
      reducer: urbanStatisticsReducer,
      geometry: LAHORE_URBAN_EXTENT,
      crs: nativeProjection,
      scale: nativeScale,
      maxPixels: 1000,
      tileScale: 2
    });

    return ee.Feature(null, {
      date: date.format('YYYY-MM-dd'),

      central_pixel_tmax_c:
        centralPixel.get('tmax_c'),

      urban_mean_tmax_c:
        urbanStatistics.get('tmax_c_mean'),

      urban_median_tmax_c:
        urbanStatistics.get('tmax_c_median'),

      urban_p90_tmax_c:
        urbanStatistics.get('tmax_c_p90'),

      urban_max_tmax_c:
        urbanStatistics.get('tmax_c_max'),

      contributing_pixel_count:
        urbanStatistics.get('tmax_c_count')
    });
  })
)
  .filter(
    ee.Filter.notNull([
      'date',
      'central_pixel_tmax_c',
      'urban_mean_tmax_c'
    ])
  )
  .sort('date');


// ---------------------------------------------------------------------------
// 6. SANITY CHECKS
// ---------------------------------------------------------------------------

print(
  'Lahore centre point:',
  LAHORE_CENTRE
);

print(
  'Lahore urban-analysis extent:',
  LAHORE_URBAN_EXTENT
);

print(
  'Urban-analysis extent area in square kilometres:',
  LAHORE_URBAN_EXTENT
    .area(1)
    .divide(1000000)
);

print(
  'Number of exported daily rows:',
  dailyFeatures.size()
);

print(
  'Earliest exported date:',
  ee.Feature(
    dailyFeatures.first()
  ).get('date')
);

print(
  'Latest exported date:',
  ee.Feature(
    dailyFeatures
      .sort('date', false)
      .first()
  ).get('date')
);

print(
  'First 10 exported rows:',
  dailyFeatures.limit(10)
);

print(
  'Latest 10 exported rows:',
  dailyFeatures
    .sort('date', false)
    .limit(10)
);


// ---------------------------------------------------------------------------
// 7. MAP DISPLAY
// ---------------------------------------------------------------------------

// Retrieve the latest available ERA5-Land Tmax image for visual inspection.
var latestTmaxImage = ee.Image(
  era5LandDailyTmax
    .sort('system:time_start', false)
    .first()
);

Map.centerObject(
  LAHORE_URBAN_EXTENT,
  9
);

Map.addLayer(
  latestTmaxImage,
  {
    min: 20,
    max: 50,
    palette: [
      '313695',
      '4575b4',
      '74add1',
      'abd9e9',
      'ffffbf',
      'fdae61',
      'f46d43',
      'd73027',
      'a50026'
    ]
  },
  'Latest ERA5-Land daily Tmax in °C',
  true,
  0.72
);

// Draw the urban-analysis extent as an outline.
Map.addLayer(
  ee.Image()
    .byte()
    .paint({
      featureCollection: ee.FeatureCollection([
        ee.Feature(LAHORE_URBAN_EXTENT)
      ]),
      color: 1,
      width: 4
    }),
  {
    palette: ['000000']
  },
  'Lahore urban-analysis extent: 20 km buffer'
);

// Add a lightly shaded urban-analysis extent.
Map.addLayer(
  ee.Image()
    .byte()
    .paint({
      featureCollection: ee.FeatureCollection([
        ee.Feature(LAHORE_URBAN_EXTENT)
      ]),
      color: 1
    }),
  {
    palette: ['ff0000']
  },
  'Lahore urban-analysis extent fill',
  true,
  0.12
);

Map.addLayer(
  LAHORE_CENTRE,
  {
    color: 'ffffff'
  },
  'Lahore centre point'
);


// ---------------------------------------------------------------------------
// 8. EXPORT THE DAILY CSV
// ---------------------------------------------------------------------------

Export.table.toDrive({
  collection: dailyFeatures,

  description:
    'lahore_era5land_daily_tmax_urban_extent_1979_present',

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    CSV_FILE_PREFIX,

  fileFormat:
    'CSV',

  selectors: [
    'date',
    'central_pixel_tmax_c',
    'urban_mean_tmax_c',
    'urban_median_tmax_c',
    'urban_p90_tmax_c',
    'urban_max_tmax_c',
    'contributing_pixel_count'
  ]
});


// ---------------------------------------------------------------------------
// 9. OPTIONAL: EXPORT THE ANALYSIS EXTENT AS GEOJSON
// ---------------------------------------------------------------------------

// Start this task only if the boundary file is useful for QGIS, Python,
// documentation, or figure production.
var extentFeature = ee.Feature(
  LAHORE_URBAN_EXTENT,
  {
    location_name: 'Lahore, Pakistan',
    extent_type: '20 km radius urban-analysis buffer',
    centre_longitude: 74.3587,
    centre_latitude: 31.5204,
    buffer_radius_metres: URBAN_BUFFER_RADIUS_METRES,
    area_sq_km: LAHORE_URBAN_EXTENT
      .area(1)
      .divide(1000000),
    temperature_dataset: 'ECMWF/ERA5_LAND/DAILY_AGGR',
    temperature_band: 'temperature_2m_max'
  }
);

Export.table.toDrive({
  collection: ee.FeatureCollection([
    extentFeature
  ]),

  description:
    'lahore_urban_analysis_extent_20km_buffer',

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    BOUNDARY_FILE_PREFIX,

  fileFormat:
    'GeoJSON'
});