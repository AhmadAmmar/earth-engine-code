// ============================================================================
// LAHORE DISTRICT ERA5-LAND DAILY TMAX EXPORT — 1950 TO PRESENT
// Google Earth Engine JavaScript
//
// Boundary asset:
//   projects/ee-ahmadammargeo/assets/pk2
//
// Boundary selected:
//   ADM2_EN = "Lahore"
//
// Temperature dataset:
//   ECMWF/ERA5_LAND/DAILY_AGGR
//
// Time period:
//   1950-01-02 to latest available ERA5-Land daily image
//
// Output:
//   One CSV row per day.
//
// Output fields:
//   date
//   year
//   month
//   day
//   day_of_year
//   central_pixel_tmax_c
//   district_area_weighted_mean_tmax_c
//   district_mean_tmax_c
//   district_median_tmax_c
//   district_p90_tmax_c
//   district_max_tmax_c
//   district_min_tmax_c
//   district_stddev_tmax_c
//   contributing_pixel_count
//
// Notes:
//   - ERA5-Land temperature_2m_max is in Kelvin.
//   - This script converts temperature to degrees Celsius.
//   - No circular buffer is used.
//   - The spatial unit is the Lahore ADM2 polygon.
//   - Python should handle threshold counts, rankings, plots, and trend analysis.
// ============================================================================


// ---------------------------------------------------------------------------
// 1. USER SETTINGS
// ---------------------------------------------------------------------------

var PK_ADM2 = ee.FeatureCollection(
  'projects/ee-ahmadammargeo/assets/pk2'
);

var LAHORE_ADM2_NAME = 'Lahore';

// Central Lahore reference point.
// Used only for a central-pixel comparison series.
// Coordinate order is [longitude, latitude].
var LAHORE_CENTRE = ee.Geometry.Point([
  74.3587,
  31.5204
]);

// ERA5-Land Daily Aggregated begins on 1950-01-02 in Earth Engine.
var START_DATE = '1950-01-02';

var END_DATE_EXCLUSIVE = ee.Date(Date.now()).advance(
  1,
  'day'
);

var DRIVE_FOLDER = 'GEE_exports';

var CSV_EXPORT_DESCRIPTION =
  'lahore_district_era5land_daily_tmax_1950_present';

var CSV_FILE_PREFIX =
  'lahore_district_era5land_daily_tmax_1950_present';

var BOUNDARY_EXPORT_DESCRIPTION =
  'lahore_district_adm2_boundary_for_era5land_tmax';

var BOUNDARY_FILE_PREFIX =
  'lahore_district_adm2_boundary_for_era5land_tmax';


// ---------------------------------------------------------------------------
// 2. SELECT LAHORE ADM2 POLYGON
// ---------------------------------------------------------------------------

var LAHORE_FEATURES = PK_ADM2.filter(
  ee.Filter.eq(
    'ADM2_EN',
    LAHORE_ADM2_NAME
  )
);

print(
  'Number of ADM2 rows with ADM2_EN = "Lahore":',
  LAHORE_FEATURES.size()
);

print(
  'Selected Lahore ADM2 row:',
  LAHORE_FEATURES
);

var LAHORE_DISTRICT = LAHORE_FEATURES
  .geometry()
  .dissolve(1);

print(
  'Lahore District area in square kilometres:',
  LAHORE_DISTRICT
    .area(1)
    .divide(1000000)
);

print(
  'Does Lahore District contain the central Lahore reference point?',
  LAHORE_DISTRICT.contains(
    LAHORE_CENTRE,
    1
  )
);


// ---------------------------------------------------------------------------
// 3. LOAD ERA5-LAND DAILY MAXIMUM TEMPERATURE
// ---------------------------------------------------------------------------

var ERA5LAND_TMAX_K = ee.ImageCollection(
  'ECMWF/ERA5_LAND/DAILY_AGGR'
)
  .filterDate(
    START_DATE,
    END_DATE_EXCLUSIVE
  )
  .select(
    'temperature_2m_max'
  );

print(
  'Number of ERA5-Land daily images selected:',
  ERA5LAND_TMAX_K.size()
);

print(
  'Earliest selected ERA5-Land date:',
  ee.Date(
    ERA5LAND_TMAX_K.aggregate_min(
      'system:time_start'
    )
  ).format(
    'YYYY-MM-dd'
  )
);

print(
  'Latest selected ERA5-Land date:',
  ee.Date(
    ERA5LAND_TMAX_K.aggregate_max(
      'system:time_start'
    )
  ).format(
    'YYYY-MM-dd'
  )
);


// ---------------------------------------------------------------------------
// 4. NATIVE ERA5-LAND PROJECTION AND SCALE
// ---------------------------------------------------------------------------

var EXAMPLE_IMAGE_K = ee.Image(
  ERA5LAND_TMAX_K.first()
);

var NATIVE_PROJECTION = EXAMPLE_IMAGE_K.projection();

var NATIVE_SCALE = NATIVE_PROJECTION.nominalScale();

print(
  'ERA5-Land native projection:',
  NATIVE_PROJECTION
);

print(
  'ERA5-Land nominal pixel scale in metres:',
  NATIVE_SCALE
);


// ---------------------------------------------------------------------------
// 5. DISTRICT STATISTICS REDUCER
// ---------------------------------------------------------------------------

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
    reducer2: ee.Reducer.min(),
    sharedInputs: true
  })
  .combine({
    reducer2: ee.Reducer.stdDev(),
    sharedInputs: true
  })
  .combine({
    reducer2: ee.Reducer.count(),
    sharedInputs: true
  });


// ---------------------------------------------------------------------------
// 6. DAILY FEATURE EXTRACTION FUNCTION
// ---------------------------------------------------------------------------

var makeDailyFeature = function(imageK) {

  imageK = ee.Image(imageK);

  var date = ee.Date(
    imageK.get('system:time_start')
  );

  // Convert Kelvin to Celsius.
  //
  // Important:
  // Do not use copyProperties() here. It can leave the object typed as a
  // generic Element in the Code Editor, causing:
  //   imageC.reduceRegion is not a function
  var imageC = imageK
    .subtract(273.15)
    .rename('tmax_c');

  // -------------------------------------------------------------------------
  // A. Central Lahore comparison pixel
  // -------------------------------------------------------------------------

  var centralPixel = imageC.reduceRegion({
    reducer:
      ee.Reducer.first(),

    geometry:
      LAHORE_CENTRE,

    crs:
      NATIVE_PROJECTION,

    scale:
      NATIVE_SCALE,

    maxPixels:
      10
  });

  // -------------------------------------------------------------------------
  // B. District statistics
  // -------------------------------------------------------------------------

  var districtStats = imageC.reduceRegion({
    reducer:
      DISTRICT_STATISTICS_REDUCER,

    geometry:
      LAHORE_DISTRICT,

    crs:
      NATIVE_PROJECTION,

    scale:
      NATIVE_SCALE,

    maxPixels:
      10000,

    tileScale:
      2
  });

  // -------------------------------------------------------------------------
  // C. Area-weighted district mean
  // -------------------------------------------------------------------------

  var pixelArea = ee.Image.pixelArea()
    .rename('area_m2');

  var weightedNumerator = imageC
    .multiply(pixelArea)
    .rename('tmax_area');

  var weightedImage = weightedNumerator
    .addBands(pixelArea);

  var weightedSums = weightedImage.reduceRegion({
    reducer:
      ee.Reducer.sum(),

    geometry:
      LAHORE_DISTRICT,

    crs:
      NATIVE_PROJECTION,

    scale:
      NATIVE_SCALE,

    maxPixels:
      10000,

    tileScale:
      2
  });

  var weightedMean = ee.Number(
    weightedSums.get('tmax_area')
  ).divide(
    ee.Number(
      weightedSums.get('area_m2')
    )
  );

  // -------------------------------------------------------------------------
  // D. Exportable one-row daily feature
  // -------------------------------------------------------------------------

  return ee.Feature(null, {
    date:
      date.format('YYYY-MM-dd'),

    year:
      date.get('year'),

    month:
      date.get('month'),

    day:
      date.get('day'),

    day_of_year:
      date
        .getRelative(
          'day',
          'year'
        )
        .add(1),

    central_pixel_tmax_c:
      centralPixel.get('tmax_c'),

    district_area_weighted_mean_tmax_c:
      weightedMean,

    district_mean_tmax_c:
      districtStats.get('tmax_c_mean'),

    district_median_tmax_c:
      districtStats.get('tmax_c_median'),

    district_p90_tmax_c:
      districtStats.get('tmax_c_p90'),

    district_max_tmax_c:
      districtStats.get('tmax_c_max'),

    district_min_tmax_c:
      districtStats.get('tmax_c_min'),

    district_stddev_tmax_c:
      districtStats.get('tmax_c_stdDev'),

    contributing_pixel_count:
      districtStats.get('tmax_c_count')
  });
};


// ---------------------------------------------------------------------------
// 7. BUILD DAILY FEATURE COLLECTION
// ---------------------------------------------------------------------------

var DAILY_FEATURES = ee.FeatureCollection(
  ERA5LAND_TMAX_K.map(
    makeDailyFeature
  )
)
  .filter(
    ee.Filter.notNull([
      'date',
      'central_pixel_tmax_c',
      'district_area_weighted_mean_tmax_c',
      'district_mean_tmax_c'
    ])
  )
  .sort(
    'date'
  );

// Keep Console printing light. Do not print the whole 1950-present table.
print(
  'Daily feature collection prepared for export.',
  DAILY_FEATURES.limit(3)
);


// ---------------------------------------------------------------------------
// 8. LIGHTWEIGHT MAP SANITY CHECK
// ---------------------------------------------------------------------------

var SAMPLE_DATE = '2024-05-15';

var SAMPLE_START = ee.Date(
  SAMPLE_DATE
);

var SAMPLE_END_EXCLUSIVE = SAMPLE_START.advance(
  1,
  'day'
);

var SAMPLE_TMAX_C = ee.Image(
  ERA5LAND_TMAX_K
    .filterDate(
      SAMPLE_START,
      SAMPLE_END_EXCLUSIVE
    )
    .first()
)
  .subtract(273.15)
  .rename('tmax_c');

var TMAX_VIS = {
  min:
    25,

  max:
    50,

  palette: [
    '313695',
    '4575b4',
    '74add1',
    'abd9e9',
    'e0f3f8',
    'ffffbf',
    'fee090',
    'fdae61',
    'f46d43',
    'd73027',
    'a50026'
  ]
};

Map.centerObject(
  LAHORE_DISTRICT,
  9
);

Map.addLayer(
  SAMPLE_TMAX_C.clip(
    LAHORE_DISTRICT
  ),

  TMAX_VIS,

  'Sample ERA5-Land daily Tmax over Lahore District — ' + SAMPLE_DATE,

  true,

  0.88
);

Map.addLayer(
  LAHORE_FEATURES.style({
    color:
      '000000',

    fillColor:
      '00000000',

    width:
      4
  }),

  {},

  'Lahore ADM2 district boundary',

  true
);

Map.addLayer(
  LAHORE_CENTRE,

  {
    color:
      'ffffff'
  },

  'Central Lahore reference point',

  true
);


// ---------------------------------------------------------------------------
// 9. EXPORT DAILY CSV TO GOOGLE DRIVE
// ---------------------------------------------------------------------------

Export.table.toDrive({
  collection:
    DAILY_FEATURES,

  description:
    CSV_EXPORT_DESCRIPTION,

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    CSV_FILE_PREFIX,

  fileFormat:
    'CSV',

  selectors: [
    'date',
    'year',
    'month',
    'day',
    'day_of_year',
    'central_pixel_tmax_c',
    'district_area_weighted_mean_tmax_c',
    'district_mean_tmax_c',
    'district_median_tmax_c',
    'district_p90_tmax_c',
    'district_max_tmax_c',
    'district_min_tmax_c',
    'district_stddev_tmax_c',
    'contributing_pixel_count'
  ]
});


// ---------------------------------------------------------------------------
// 10. OPTIONAL: EXPORT LAHORE DISTRICT BOUNDARY AS GEOJSON
// ---------------------------------------------------------------------------

var BOUNDARY_EXPORT = LAHORE_FEATURES.map(function(feature) {

  return feature.set({
    selected_for_temperature_analysis:
      true,

    temperature_dataset:
      'ECMWF/ERA5_LAND/DAILY_AGGR',

    temperature_band:
      'temperature_2m_max',

    export_start_date:
      START_DATE,

    area_sq_km:
      feature
        .geometry()
        .area(1)
        .divide(1000000)
  });
});

Export.table.toDrive({
  collection:
    BOUNDARY_EXPORT,

  description:
    BOUNDARY_EXPORT_DESCRIPTION,

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    BOUNDARY_FILE_PREFIX,

  fileFormat:
    'GeoJSON'
});