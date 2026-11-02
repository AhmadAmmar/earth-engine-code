/***************************************************************
 SOUTH ASIA MONSOON PROJECT
 CORRECTED CORE CHIRPS MONTHLY EXPORT
 Version: geometry-safe

 PURPOSE
 -------
 Rebuild the complete CHIRPS core monthly rainfall record with:

   1. One fixed broad South Asian monsoon domain
   2. One fixed South Asian country-union domain
   3. Identical geometry and methodology for every time chunk
   4. Explicit geometry error margins
   5. Temporal and spatial QA metadata

 FIXED BROAD DOMAIN
 ------------------
 60°E – 105°E
  5°N – 40°N

 COUNTRY UNION
 -------------
 Pakistan
 India
 Bangladesh
 Nepal
 Bhutan
 Sri Lanka

 DATASET
 -------
 UCSB-CHG/CHIRPS/DAILY

 OUTPUT
 ------
 1981-01 to 1990-12
 1991-01 to 2000-12
 2001-01 to 2010-12
 2011-01 to 2020-12
 2021-01 to 2026-06

 One row per:
     month × region

 IMPORTANT
 ---------
 - Seasonal indices are NOT calculated here.
 - MAM, AMJ, MJJ, JJA, JJAS, anomalies and z-scores
   should be calculated later in Python.
 - -9999 means missing and should become NaN in Python.

***************************************************************/


/***************************************************************
 0. USER SETTINGS
***************************************************************/

var CHIRPS_DATASET =
  'UCSB-CHG/CHIRPS/DAILY';

var COUNTRIES_DATASET =
  'USDOS/LSIB_SIMPLE/2017';

var EXPORT_FOLDER =
  'GEE_ENSO_IOD_MONSOON_CORE_CORRECTED';


// Native nominal CHIRPS pixel scale.
var CHIRPS_SCALE_M = 5566;


// Helps large regional reductions.
var TILE_SCALE = 8;


// Geometry tolerance used for union / bounds / area operations.
//
// This prevents:
// "Unable to perform this geometry operation.
//  Please specify a non-zero error margin."
var GEOMETRY_ERROR_M = 1000;


// Missing-value flag exported to CSV.
//
// Replace with np.nan in Python.
var MISSING_VALUE = -9999;


// Optional map visualization.
//
// This is independent from the calculations.
var SHOW_REGION_QA_MAP = true;


// Optional GeoJSON export containing the exact region geometries.
var EXPORT_REGION_QA_GEOJSON = true;


/***************************************************************
 1. EXPORT CHUNKS
***************************************************************/

var EXPORT_CHUNKS = [

  {
    start: '1981-01-01',
    lastMonth: '1990-12-01',
    label: '198101_199012'
  },

  {
    start: '1991-01-01',
    lastMonth: '2000-12-01',
    label: '199101_200012'
  },

  {
    start: '2001-01-01',
    lastMonth: '2010-12-01',
    label: '200101_201012'
  },

  {
    start: '2011-01-01',
    lastMonth: '2020-12-01',
    label: '201101_202012'
  },

  {
    start: '2021-01-01',
    lastMonth: '2026-06-01',
    label: '202101_202606'
  }

];


/***************************************************************
 2. BROAD SOUTH-ASIAN MONSOON REGION
***************************************************************/

// IMPORTANT:
//
// This definition must NEVER change between chunks.
//
// Previous exports accidentally mixed:
//   5N–40N
// and
//   5N–35N.
//
// We lock it here permanently to:
//
//   60E–105E
//    5N–40N

var BROAD_LON_MIN = 60;
var BROAD_LAT_MIN = 5;
var BROAD_LON_MAX = 105;
var BROAD_LAT_MAX = 40;


var BROAD_MONSOON_GEOM =
  ee.Geometry.Rectangle(
    [
      BROAD_LON_MIN,
      BROAD_LAT_MIN,
      BROAD_LON_MAX,
      BROAD_LAT_MAX
    ],
    null,
    false
  );


var broadMonsoonAreaKm2 =
  BROAD_MONSOON_GEOM
    .area(
      ee.ErrorMargin(
        GEOMETRY_ERROR_M
      )
    )
    .divide(1e6);


var broadMonsoonRegion =
  ee.Feature(
    BROAD_MONSOON_GEOM,
    {

      region_id:
        'south_asia_broad_monsoon_land',

      region_label:
        'Broad South Asian monsoon land domain',

      region_type:
        'fixed_diagnostic_rectangle',

      boundary_source:
        'manual_fixed_rectangle',

      boundary_definition:
        '60E_105E_5N_40N',

      country_list:
        '',

      lon_min:
        BROAD_LON_MIN,

      lat_min:
        BROAD_LAT_MIN,

      lon_max:
        BROAD_LON_MAX,

      lat_max:
        BROAD_LAT_MAX,

      nominal_region_area_km2:
        broadMonsoonAreaKm2

    }
  );


/***************************************************************
 3. SOUTH-ASIAN COUNTRY UNION
***************************************************************/

var countries =
  ee.FeatureCollection(
    COUNTRIES_DATASET
  );


var legacyCountries =
  countries.filter(
    ee.Filter.inList(
      'country_na',
      [
        'Pakistan',
        'India',
        'Bangladesh',
        'Nepal',
        'Bhutan',
        'Sri Lanka'
      ]
    )
  );


// ------------------------------------------------------------
// IMPORTANT FIX
//
// Explicit non-zero error margin while generating the combined
// geometry.
//
// This is what prevents the geometry-operation error encountered
// in the previous script.
// ------------------------------------------------------------

var LEGACY_UNION_GEOM =
  legacyCountries.geometry(
    ee.ErrorMargin(
      GEOMETRY_ERROR_M
    )
  );


var legacyUnionAreaKm2 =
  LEGACY_UNION_GEOM
    .area(
      ee.ErrorMargin(
        GEOMETRY_ERROR_M
      )
    )
    .divide(1e6);


// ------------------------------------------------------------
// Get a simple rectangular bounding box for metadata.
//
// The analytical region remains the actual country union;
// this bounding box is ONLY metadata.
// ------------------------------------------------------------

var LEGACY_BOUNDS =
  LEGACY_UNION_GEOM.bounds(
    ee.ErrorMargin(
      GEOMETRY_ERROR_M
    )
  );


var legacyBoundsRing =
  ee.List(
    LEGACY_BOUNDS
      .coordinates()
      .get(0)
  );


var legacyLowerLeft =
  ee.List(
    legacyBoundsRing.get(0)
  );


var legacyUpperRight =
  ee.List(
    legacyBoundsRing.get(2)
  );


var legacyLonMin =
  legacyLowerLeft.get(0);

var legacyLatMin =
  legacyLowerLeft.get(1);

var legacyLonMax =
  legacyUpperRight.get(0);

var legacyLatMax =
  legacyUpperRight.get(1);


var legacyUnionRegion =
  ee.Feature(
    LEGACY_UNION_GEOM,
    {

      region_id:
        'legacy_indian_subcontinent_union',

      region_label:
        'Legacy Indian subcontinent country union',

      region_type:
        'country_union',

      boundary_source:
        'USDOS_LSIB_SIMPLE_2017',

      boundary_definition:
        'Pakistan+India+Bangladesh+Nepal+Bhutan+Sri_Lanka',

      country_list:
        'Pakistan|India|Bangladesh|Nepal|Bhutan|Sri Lanka',

      lon_min:
        legacyLonMin,

      lat_min:
        legacyLatMin,

      lon_max:
        legacyLonMax,

      lat_max:
        legacyLatMax,

      nominal_region_area_km2:
        legacyUnionAreaKm2

    }
  );


/***************************************************************
 4. FINAL REGION COLLECTION
***************************************************************/

var REGIONS =
  ee.FeatureCollection(
    [
      broadMonsoonRegion,
      legacyUnionRegion
    ]
  );


/***************************************************************
 5. OPTIONAL MAP QA
***************************************************************/

if (SHOW_REGION_QA_MAP) {

  // ----------------------------------------------------------
  // IMPORTANT:
  //
  // Do NOT use:
  //
  //     Map.centerObject(REGIONS)
  //
  // because that can trigger an expensive FeatureCollection
  // geometry operation.
  //
  // Fixed geographic center is sufficient for display.
  // ----------------------------------------------------------

  Map.setCenter(
    82.5,
    22.5,
    4
  );


  // Broad fixed rectangle.
  Map.addLayer(
    ee.Image()
      .byte()
      .paint(
        broadMonsoonRegion,
        1,
        2
      ),
    {
      min: 0,
      max: 1
    },
    'QA: fixed 60E–105E, 5N–40N domain',
    true
  );


  // For visualization, display the original country collection
  // rather than asking the map interface to regenerate the
  // entire union geometry.
  Map.addLayer(
    legacyCountries,
    {},
    'QA: six-country union source polygons',
    true
  );

}


/***************************************************************
 6. HELPER: MONTH LIST
***************************************************************/

function makeMonthStarts(
  firstMonthString,
  lastMonthString
) {

  var firstMonth =
    ee.Date(
      firstMonthString
    );


  var lastMonth =
    ee.Date(
      lastMonthString
    );


  var nMonthSteps =
    lastMonth
      .difference(
        firstMonth,
        'month'
      )
      .floor();


  return ee.List
    .sequence(
      0,
      nMonthSteps
    )
    .map(
      function(n) {

        return firstMonth.advance(
          ee.Number(n),
          'month'
        );

      }
    );

}


/***************************************************************
 7. HELPER: EMPTY MASKED IMAGE
***************************************************************/

function maskedConstantImage(
  bandName
) {

  return ee.Image
    .constant(0)
    .rename(
      bandName
    )
    .updateMask(
      ee.Image.constant(0)
    );

}


/***************************************************************
 8. HELPER: NULL-SAFE VALUE
***************************************************************/

function numberOrMissing(
  value
) {

  return ee.Number(
    ee.Algorithms.If(

      ee.Algorithms.IsEqual(
        value,
        null
      ),

      MISSING_VALUE,

      value

    )
  );

}


/***************************************************************
 9. CALCULATE ONE MONTH
***************************************************************/

function calculateOneMonth(
  monthStart
) {

  monthStart =
    ee.Date(
      monthStart
    );


  var monthEnd =
    monthStart.advance(
      1,
      'month'
    );


  /*************************************************************
   9A. SELECT DAILY CHIRPS
  *************************************************************/

  var dailyCollection =
    ee.ImageCollection(
      CHIRPS_DATASET
    )
      .filterDate(
        monthStart,
        monthEnd
      )
      .select(
        'precipitation'
      );


  var nDailyImages =
    dailyCollection.size();


  var expectedDays =
    monthEnd
      .difference(
        monthStart,
        'day'
      )
      .round();


  var temporalCoverageFraction =
    ee.Number(
      nDailyImages
    )
      .divide(
        expectedDays
      );


  var fullTemporalCoverage =
    ee.Number(
      ee.Algorithms.If(

        ee.Number(
          nDailyImages
        ).eq(
          expectedDays
        ),

        1,

        0

      )
    );


  /*************************************************************
   9B. MONTHLY PIXEL PRECIPITATION
  *************************************************************/

  // CHIRPS daily precipitation units:
  //
  //     mm/day
  //
  // Sum of the daily images therefore produces:
  //
  //     mm/month

  var monthlyRain =
    ee.Image(
      ee.Algorithms.If(

        ee.Number(
          nDailyImages
        ).gt(0),

        dailyCollection
          .sum()
          .rename(
            'rain_monthly_pixel_mm'
          ),

        maskedConstantImage(
          'rain_monthly_pixel_mm'
        )

      )
    )
      .toFloat();


  /*************************************************************
   9C. EFFECTIVE PIXEL AREA
  *************************************************************/

  // CHIRPS masks oceans and pixels without valid rainfall data.
  //
  // This means the broad rectangular region automatically uses
  // only valid CHIRPS pixels.

  var pixelArea =
    ee.Image
      .pixelArea()
      .updateMask(
        monthlyRain.mask()
      )
      .rename(
        'effective_area_m2'
      );


  /*************************************************************
   9D. PRECIPITATION × AREA
  *************************************************************/

  var rainTimesArea =
    monthlyRain
      .multiply(
        pixelArea
      )
      .rename(
        'rain_mm_area_m2'
      );


  /*************************************************************
   9E. REDUCE OVER BOTH REGIONS
  *************************************************************/

  var reductionImage =
    rainTimesArea
      .addBands(
        pixelArea
      );


  var reduced =
    reductionImage.reduceRegions({

      collection:
        REGIONS,

      reducer:
        ee.Reducer.sum(),

      scale:
        CHIRPS_SCALE_M,

      tileScale:
        TILE_SCALE,

      maxPixelsPerRegion:
        1e13

    });


  /*************************************************************
   9F. CONVERT REDUCTIONS INTO OUTPUT ROWS
  *************************************************************/

  var rows =
    reduced.map(
      function(f) {

        f =
          ee.Feature(f);


        // Raw reducer output.
        var rawRainTimesArea =
          f.get(
            'rain_mm_area_m2'
          );


        var rawEffectiveArea =
          f.get(
            'effective_area_m2'
          );


        // -----------------------------------------------
        // Internally turn null into zero so mathematical
        // operations cannot fail.
        // -----------------------------------------------

        var rainTimesAreaSafe =
          ee.Number(
            ee.Algorithms.If(

              ee.Algorithms.IsEqual(
                rawRainTimesArea,
                null
              ),

              0,

              rawRainTimesArea

            )
          );


        var effectiveAreaSafe =
          ee.Number(
            ee.Algorithms.If(

              ee.Algorithms.IsEqual(
                rawEffectiveArea,
                null
              ),

              0,

              rawEffectiveArea

            )
          );


        var hasValidSpatialData =
          effectiveAreaSafe.gt(0);


        var hasDailyData =
          ee.Number(
            nDailyImages
          ).gt(0);


        var validResult =
          hasValidSpatialData.and(
            hasDailyData
          );


        /*******************************************************
         AREA-WEIGHTED MONTHLY MEAN PRECIPITATION

                   Σ(P × A)
                  ----------
                     Σ(A)

         Units:
             mm
        *******************************************************/

        var areaWeightedRainMm =
          ee.Algorithms.If(

            validResult,

            rainTimesAreaSafe
              .divide(
                effectiveAreaSafe
              ),

            MISSING_VALUE

          );


        /*******************************************************
         TOTAL PRECIPITATION VOLUME

           rainfall_mm × area_m2 / 1e12

         because:

           1 mm = 0.001 m

           mm × m² / 1e12 = km³
        *******************************************************/

        var rainVolumeKm3 =
          ee.Algorithms.If(

            validResult,

            rainTimesAreaSafe
              .divide(
                1e12
              ),

            MISSING_VALUE

          );


        /*******************************************************
         EFFECTIVE VALID CHIRPS AREA
        *******************************************************/

        var effectiveAreaKm2 =
          ee.Algorithms.If(

            validResult,

            effectiveAreaSafe
              .divide(
                1e6
              ),

            MISSING_VALUE

          );


        var nominalAreaKm2 =
          ee.Number(
            f.get(
              'nominal_region_area_km2'
            )
          );


        var effectiveAreaFraction =
          ee.Algorithms.If(

            validResult,

            effectiveAreaSafe
              .divide(
                1e6
              )
              .divide(
                nominalAreaKm2
              ),

            MISSING_VALUE

          );


        /*******************************************************
         RETURN NEW FEATURE
        *******************************************************/

        return ee.Feature(
          null,
          {

            // ---------------------------------------------
            // Dataset provenance
            // ---------------------------------------------

            dataset_id:
              CHIRPS_DATASET,

            variable_id:
              'precipitation',

            source_temporal_resolution:
              'daily',

            source_nominal_scale_m:
              CHIRPS_SCALE_M,

            monthly_temporal_aggregation:
              'sum_daily',

            spatial_aggregation:
              'area_weighted_mean_over_valid_chirps_pixels',

            rainfall_volume_calculation:
              'sum_rain_mm_times_pixel_area_divide_1e12',


            // ---------------------------------------------
            // Time
            // ---------------------------------------------

            date_yyyy_mm:
              monthStart.format(
                'YYYY-MM'
              ),

            year:
              monthStart.get(
                'year'
              ),

            month:
              monthStart.get(
                'month'
              ),

            month_start:
              monthStart.format(
                'YYYY-MM-dd'
              ),

            month_end_exclusive:
              monthEnd.format(
                'YYYY-MM-dd'
              ),


            // ---------------------------------------------
            // Region provenance
            // ---------------------------------------------

            region_id:
              f.get(
                'region_id'
              ),

            region_label:
              f.get(
                'region_label'
              ),

            region_type:
              f.get(
                'region_type'
              ),

            boundary_source:
              f.get(
                'boundary_source'
              ),

            boundary_definition:
              f.get(
                'boundary_definition'
              ),

            country_list:
              f.get(
                'country_list'
              ),

            lon_min:
              f.get(
                'lon_min'
              ),

            lat_min:
              f.get(
                'lat_min'
              ),

            lon_max:
              f.get(
                'lon_max'
              ),

            lat_max:
              f.get(
                'lat_max'
              ),

            nominal_region_area_km2:
              nominalAreaKm2,


            // ---------------------------------------------
            // Temporal QA
            // ---------------------------------------------

            n_daily_images:
              nDailyImages,

            expected_days_in_month:
              expectedDays,

            coverage_fraction:
              temporalCoverageFraction,

            month_has_full_daily_coverage:
              fullTemporalCoverage,


            // ---------------------------------------------
            // Climate variables
            // ---------------------------------------------

            rain_monthly_mm:
              areaWeightedRainMm,

            rain_monthly_volume_km3:
              rainVolumeKm3,


            // ---------------------------------------------
            // Spatial QA
            // ---------------------------------------------

            effective_area_km2:
              effectiveAreaKm2,

            effective_area_fraction_of_geometry:
              effectiveAreaFraction

          }
        );

      }
    );


  return ee.FeatureCollection(
    rows
  );

}


/***************************************************************
 10. BUILD A MULTI-YEAR MONTHLY CHUNK
***************************************************************/

function buildChunk(
  firstMonth,
  lastMonth
) {

  var monthStarts =
    makeMonthStarts(
      firstMonth,
      lastMonth
    );


  var nestedCollections =
    monthStarts.map(
      function(monthStart) {

        return calculateOneMonth(
          monthStart
        );

      }
    );


  return ee.FeatureCollection(
    nestedCollections
  ).flatten();

}


/***************************************************************
 11. COLUMN ORDER
***************************************************************/

var SELECTORS = [

  // ----------------------------------------------------------
  // Dataset provenance
  // ----------------------------------------------------------

  'dataset_id',
  'variable_id',
  'source_temporal_resolution',
  'source_nominal_scale_m',

  'monthly_temporal_aggregation',
  'spatial_aggregation',
  'rainfall_volume_calculation',


  // ----------------------------------------------------------
  // Time
  // ----------------------------------------------------------

  'date_yyyy_mm',
  'year',
  'month',

  'month_start',
  'month_end_exclusive',


  // ----------------------------------------------------------
  // Region metadata
  // ----------------------------------------------------------

  'region_id',
  'region_label',
  'region_type',

  'boundary_source',
  'boundary_definition',
  'country_list',

  'lon_min',
  'lat_min',
  'lon_max',
  'lat_max',

  'nominal_region_area_km2',


  // ----------------------------------------------------------
  // Temporal QA
  // ----------------------------------------------------------

  'n_daily_images',
  'expected_days_in_month',

  'coverage_fraction',
  'month_has_full_daily_coverage',


  // ----------------------------------------------------------
  // Rainfall
  // ----------------------------------------------------------

  'rain_monthly_mm',
  'rain_monthly_volume_km3',


  // ----------------------------------------------------------
  // Spatial QA
  // ----------------------------------------------------------

  'effective_area_km2',
  'effective_area_fraction_of_geometry'

];


/***************************************************************
 12. OPTIONAL EXACT-GEOMETRY QA EXPORT
***************************************************************/

if (EXPORT_REGION_QA_GEOJSON) {

  Export.table.toDrive({

    collection:
      REGIONS,

    description:
      'sam_core_chirps_corrected_region_geometries_qa',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'sam_core_chirps_corrected_region_geometries_qa',

    fileFormat:
      'GeoJSON'

  });

}


/***************************************************************
 13. EXPORT ALL FIVE CHUNKS
***************************************************************/

EXPORT_CHUNKS.forEach(
  function(chunk) {

    var table =
      buildChunk(
        chunk.start,
        chunk.lastMonth
      )
      .select(
        SELECTORS
      );


    var prefix =
      'sam_core_chirps_raw_monthly_' +
      chunk.label +
      '_CORRECTED_60E105E_5N40N';


    Export.table.toDrive({

      collection:
        table,

      description:
        prefix,

      folder:
        EXPORT_FOLDER,

      fileNamePrefix:
        prefix,

      fileFormat:
        'CSV',

      selectors:
        SELECTORS

    });

  }
);


/***************************************************************
 END OF SCRIPT
***************************************************************/