// ============================================================================
// LAHORE DISTRICT DAILY MAXIMUM TEMPERATURE EXPORT
// Google Earth Engine JavaScript
//
// Administrative-boundary asset:
//   projects/ee-ahmadammargeo/assets/pk2
//
// Selected polygon:
//   ADM2_EN = "Lahore"
//
// Temperature dataset:
//   ECMWF/ERA5_LAND/DAILY_AGGR
//
// Purpose:
//   Export one lightweight CSV row per day for cumulative heat-threshold plots.
//
// Output columns:
//   date
//   central_pixel_tmax_c
//   district_mean_tmax_c
//   district_median_tmax_c
//   district_p90_tmax_c
//   district_max_tmax_c
//   contributing_pixel_count
//
// Notes:
//   - Temperatures are converted from Kelvin to degrees Celsius.
//   - No arbitrary buffer is used.
//   - The spatial unit is the Lahore ADM2 polygon from your uploaded asset.
//   - The district mean is the recommended initial headline series.
//   - Python should handle threshold selection, rankings, analysis, and plots.
// ============================================================================


// ---------------------------------------------------------------------------
// 1. USER SETTINGS
// ---------------------------------------------------------------------------

// Pakistan level-2 administrative boundaries.
var PK_ADM2 = ee.FeatureCollection(
  'projects/ee-ahmadammargeo/assets/pk2'
);

// Exact name stored in the ADM2_EN field.
var LAHORE_ADM2_NAME = 'Lahore';

// Central Lahore reference point.
//
// This is retained only for exporting a central-pixel comparison series.
// It does NOT define the district extraction area.
//
// Earth Engine coordinate order:
//   [longitude, latitude]
var LAHORE_CENTRE = ee.Geometry.Point([
  74.3587,
  31.5204
]);

// Use 1979 onward for comparability with the earlier NOAA CPC export.
//
// ERA5-Land is available farther back. Change this to '1950-01-02'
// later if you want the longest available historical comparison.
var START_DATE = '1979-01-01';

// Dynamic end date.
// Earth Engine will export all currently available daily images.
var END_DATE_EXCLUSIVE = ee.Date(Date.now()).advance(1, 'day');

// Google Drive export settings.
var DRIVE_FOLDER = 'GEE_exports';

var CSV_FILE_PREFIX =
  'lahore_district_era5land_daily_tmax_1979_present';

var BOUNDARY_FILE_PREFIX =
  'lahore_district_adm2_boundary';


// ---------------------------------------------------------------------------
// 2. SELECT THE LAHORE ADM2 FEATURE
// ---------------------------------------------------------------------------

// Select the row whose ADM2_EN value is exactly "Lahore".
var LAHORE_MATCHES = PK_ADM2.filter(
  ee.Filter.eq(
    'ADM2_EN',
    LAHORE_ADM2_NAME
  )
);

// Print the result before starting the export.
//
// The match count should be exactly:
//   1
print(
  'Number of ADM2 rows with ADM2_EN = "Lahore":',
  LAHORE_MATCHES.size()
);

print(
  'Selected Lahore ADM2 row:',
  LAHORE_MATCHES
);

// Convert the selected row into a single geometry.
//
// geometry().dissolve() safely handles multipart district boundaries
// and would also merge parts if the stored Lahore feature is multipart.
var LAHORE_DISTRICT = LAHORE_MATCHES
  .geometry()
  .dissolve(1);

print(
  'Selected Lahore district geometry:',
  LAHORE_DISTRICT
);

print(
  'Lahore district area in square kilometres:',
  LAHORE_DISTRICT
    .area(1)
    .divide(1000000)
);


// ---------------------------------------------------------------------------
// 3. OPTIONAL SPATIAL CROSS-CHECK
// ---------------------------------------------------------------------------

// Confirm that the central Lahore point falls inside the selected polygon.
print(
  'Does selected Lahore district contain central Lahore point?',
  LAHORE_DISTRICT.contains(
    LAHORE_CENTRE,
    1
  )
);


// ---------------------------------------------------------------------------
// 4. LOAD ERA5-LAND DAILY MAXIMUM TEMPERATURE
// ---------------------------------------------------------------------------

// ERA5-Land daily maximum 2-metre air temperature is supplied in Kelvin.
//
// Convert each daily image to degrees Celsius immediately.
// Preserve system:time_start so the CSV can retain the correct date.
var ERA5LAND_DAILY_TMAX = ee.ImageCollection(
  'ECMWF/ERA5_LAND/DAILY_AGGR'
)
  .filterDate(
    START_DATE,
    END_DATE_EXCLUSIVE
  )
  .select(
    'temperature_2m_max'
  )
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

print(
  'Number of ERA5-Land daily images:',
  ERA5LAND_DAILY_TMAX.size()
);


// ---------------------------------------------------------------------------
// 5. READ THE DATASET'S NATIVE GRID SETTINGS
// ---------------------------------------------------------------------------

var EXAMPLE_IMAGE = ee.Image(
  ERA5LAND_DAILY_TMAX.first()
);

var NATIVE_PROJECTION = EXAMPLE_IMAGE.projection();

var NATIVE_SCALE = NATIVE_PROJECTION.nominalScale();

print(
  'ERA5-Land native projection:',
  NATIVE_PROJECTION
);

print(
  'ERA5-Land nominal pixel size in metres:',
  NATIVE_SCALE
);


// ---------------------------------------------------------------------------
// 6. CREATE A COMBINED DISTRICT-STATISTICS REDUCER
// ---------------------------------------------------------------------------

// Calculate all district statistics in a single reduceRegion() call.
//
// Returned dictionary keys:
//   tmax_c_mean
//   tmax_c_median
//   tmax_c_p90
//   tmax_c_max
//   tmax_c_count
//
// district_mean_tmax_c:
//   Weighted spatial mean over the Lahore district polygon.
//
// district_median_tmax_c:
//   Median of the ERA5-Land grid-cell values across the district.
//
// district_p90_tmax_c:
//   90th percentile of the grid-cell values across the district.
//
// district_max_tmax_c:
//   Maximum ERA5-Land grid-cell value intersecting the district.
//
// contributing_pixel_count:
//   Number of non-null ERA5-Land grid-cell inputs counted within the polygon.
//   Retained as a quality-control diagnostic.
var DISTRICT_STATISTICS_REDUCER = ee.Reducer
  .mean()
  .combine({
    reducer2: ee.Reducer.median(),
    sharedInputs: true
  })
  .combine({
    reducer2: ee.Reducer.percentile([
      90
    ]),
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
// 7. EXTRACT ONE LIGHTWEIGHT ROW PER DAY
// ---------------------------------------------------------------------------

var DAILY_FEATURES = ee.FeatureCollection(
  ERA5LAND_DAILY_TMAX.map(function(image) {

    var DATE = ee.Date(
      image.get('system:time_start')
    );

    // -----------------------------------------------------------------------
    // A. Central Lahore comparison series
    // -----------------------------------------------------------------------

    // Extract the ERA5-Land grid cell containing central Lahore.
    //
    // This is useful for comparison with a station-style or point-based
    // temperature series. It is not used to define the district statistic.
    var CENTRAL_PIXEL = image.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: LAHORE_CENTRE,
      crs: NATIVE_PROJECTION,
      scale: NATIVE_SCALE,
      maxPixels: 10
    });

    // -----------------------------------------------------------------------
    // B. Lahore district statistics
    // -----------------------------------------------------------------------

    var DISTRICT_STATS = image.reduceRegion({
      reducer: DISTRICT_STATISTICS_REDUCER,
      geometry: LAHORE_DISTRICT,
      crs: NATIVE_PROJECTION,
      scale: NATIVE_SCALE,
      maxPixels: 10000,
      tileScale: 2
    });

    // -----------------------------------------------------------------------
    // C. Exportable daily row
    // -----------------------------------------------------------------------

    return ee.Feature(null, {
      date:
        DATE.format('YYYY-MM-dd'),

      central_pixel_tmax_c:
        CENTRAL_PIXEL.get('tmax_c'),

      district_mean_tmax_c:
        DISTRICT_STATS.get('tmax_c_mean'),

      district_median_tmax_c:
        DISTRICT_STATS.get('tmax_c_median'),

      district_p90_tmax_c:
        DISTRICT_STATS.get('tmax_c_p90'),

      district_max_tmax_c:
        DISTRICT_STATS.get('tmax_c_max'),

      contributing_pixel_count:
        DISTRICT_STATS.get('tmax_c_count')
    });
  })
)
  // Remove rows lacking the minimum required fields.
  //
  // Retain median, p90, maximum, and pixel-count fields even if one of those
  // is unexpectedly null, so anomalies remain visible in Python.
  .filter(
    ee.Filter.notNull([
      'date',
      'central_pixel_tmax_c',
      'district_mean_tmax_c'
    ])
  )
  .sort('date');


// ---------------------------------------------------------------------------
// 8. SANITY CHECKS
// ---------------------------------------------------------------------------

print(
  'Number of exported daily rows:',
  DAILY_FEATURES.size()
);

print(
  'Earliest exported date:',
  ee.Feature(
    DAILY_FEATURES.first()
  ).get('date')
);

print(
  'Latest exported date:',
  ee.Feature(
    DAILY_FEATURES
      .sort('date', false)
      .first()
  ).get('date')
);

print(
  'First 10 exported rows:',
  DAILY_FEATURES.limit(10)
);

print(
  'Latest 10 exported rows:',
  DAILY_FEATURES
    .sort('date', false)
    .limit(10)
);


// ---------------------------------------------------------------------------
// 9. MAP DISPLAY
// ---------------------------------------------------------------------------

// Most recently available ERA5-Land Tmax image.
var LATEST_TMAX_IMAGE = ee.Image(
  ERA5LAND_DAILY_TMAX
    .sort('system:time_start', false)
    .first()
);

// Centre map on the selected administrative boundary.
Map.centerObject(
  LAHORE_DISTRICT,
  9
);

// Display recent Tmax raster.
Map.addLayer(
  LATEST_TMAX_IMAGE,
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

// Display Lahore district boundary.
Map.addLayer(
  LAHORE_MATCHES.style({
    color: '000000',
    fillColor: 'ff000033',
    width: 4
  }),
  {},
  'Lahore ADM2 district boundary',
  true
);

// Display central reference point.
Map.addLayer(
  LAHORE_CENTRE,
  {
    color: 'ffffff'
  },
  'Central Lahore reference point',
  true
);


// ---------------------------------------------------------------------------
// 10. EXPORT DAILY CSV TO GOOGLE DRIVE
// ---------------------------------------------------------------------------

// Start this export manually from the Tasks tab.
Export.table.toDrive({
  collection:
    DAILY_FEATURES,

  description:
    'lahore_district_era5land_daily_tmax_1979_present',

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    CSV_FILE_PREFIX,

  fileFormat:
    'CSV',

  selectors: [
    'date',
    'central_pixel_tmax_c',
    'district_mean_tmax_c',
    'district_median_tmax_c',
    'district_p90_tmax_c',
    'district_max_tmax_c',
    'contributing_pixel_count'
  ]
});


// ---------------------------------------------------------------------------
// 11. OPTIONAL: EXPORT THE LAHORE DISTRICT POLYGON AS GEOJSON
// ---------------------------------------------------------------------------

// Start this second task only if you need the district boundary for QGIS,
// Python mapping, documentation, or later spatial analysis.
var DISTRICT_BOUNDARY_EXPORT = LAHORE_MATCHES.map(function(feature) {

  return feature.set({
    selected_for_temperature_analysis: true,

    area_sq_km:
      feature
        .geometry()
        .area(1)
        .divide(1000000),

    temperature_dataset:
      'ECMWF/ERA5_LAND/DAILY_AGGR',

    temperature_band:
      'temperature_2m_max',

    export_start_date:
      START_DATE
  });
});

Export.table.toDrive({
  collection:
    DISTRICT_BOUNDARY_EXPORT,

  description:
    'lahore_district_adm2_boundary',

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    BOUNDARY_FILE_PREFIX,

  fileFormat:
    'GeoJSON'
});