/***************************************************************
 SOUTH ASIAN MONSOON — CORRECTED CORE RE-EXPORT
 ENSO / IOD SST + SOUTH-ASIAN RAINFALL + TEMPERATURE

 PURPOSE
 -------
 Repair and re-export the minimal historical climate backbone
 needed for later Python analysis.

 EXPORTS
 -------
 1. OISST monthly SST:
      - Niño 3.4
      - WTIO
      - SETIO
      - Broad Tropical Indian Ocean
      - Tropical North Indian Ocean
      - Arabian Sea
      - Bay of Bengal

 2. ERA5-Land monthly 2 m temperature:
      - Broad South Asian monsoon land domain
      - Legacy Indian-subcontinent country union

 3. CHIRPS replacement exports for the two chunks that
    previously lost December 1990 / December 2010.

 IMPORTANT
 ---------
 GEE DOES NOT calculate:

   - Niño 3.4 anomaly
   - official ONI / RONI
   - El Niño / La Niña classifications
   - DMI / IOD
   - rainfall anomalies
   - temperature anomalies
   - MAM / AMJ / MJJ / JJA / JJAS
   - z scores
   - trends
   - correlations
   - regressions
   - composites
   - rolling correlations

 These will all be calculated later in Python.

 TEMPORAL RANGE
 --------------
 Earliest/latest collection dates are detected automatically.

 Thus:
   no fixed START_YEAR
   no fixed END_YEAR
   no fixed 2026 cutoff

 Daily datasets may have a partial latest month.
 Such months are retained and flagged with coverage_fraction.

 MISSING VALUES
 --------------
 Missing numerical values = -9999

 Convert -9999 -> NaN immediately in Python.
***************************************************************/


/***************************************************************
 0. USER SETTINGS
***************************************************************/

var EXPORT_FOLDER =
  'GEE_SOUTH_ASIA_MONSOON_REPAIR';

var MISSING_VALUE = -9999;

var TILE_SCALE = 8;


// ------------------------------------------------------------
// Export switches
// ------------------------------------------------------------

var REEXPORT_ALL_OISST = true;

var REEXPORT_ALL_ERA5LAND_T2M = true;

var REEXPORT_FAILED_CHIRPS_CHUNKS = true;


// ------------------------------------------------------------
// Minimal QA printing
// ------------------------------------------------------------

var PRINT_MINIMAL_QA = true;


// ------------------------------------------------------------
// Dataset IDs
// ------------------------------------------------------------

var OISST_DATASET =
  'NOAA/CDR/OISST/V2_1';

var ERA5LAND_DATASET =
  'ECMWF/ERA5_LAND/MONTHLY_AGGR';

var CHIRPS_DATASET =
  'UCSB-CHG/CHIRPS/DAILY';


// ------------------------------------------------------------
// Spatial reduction scales
// ------------------------------------------------------------

var OISST_SCALE_M = 27830;

var ERA5LAND_SCALE_M = 11132;

var CHIRPS_SCALE_M = 5566;


// ------------------------------------------------------------
// Export chunk sizes
//
// Smaller chunks = safer Earth Engine jobs.
// ------------------------------------------------------------

var OISST_CHUNK_YEARS = 10;

var ERA5LAND_CHUNK_YEARS = 20;


/***************************************************************
 1. CLIENT-SIDE DATE HELPERS
***************************************************************/

function pad2(n) {

  return n < 10
    ? '0' + n
    : '' + n;

}


function firstDayOfMonthUTC(date) {

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      1
    )
  );

}


function monthString(date) {

  return (
    date.getUTCFullYear() +
    '-' +
    pad2(date.getUTCMonth() + 1) +
    '-01'
  );

}


function monthLabel(date) {

  return (
    date.getUTCFullYear() +
    pad2(date.getUTCMonth() + 1)
  );

}


function addMonthsUTC(date, n) {

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + n,
      1
    )
  );

}


/***************************************************************
 2. AUTO-DETECT COLLECTION TEMPORAL BOUNDS
***************************************************************/

function datasetBounds(datasetId) {

  var collection =
    ee.ImageCollection(datasetId);


  var firstMillis =
    ee.Number(
      collection.aggregate_min(
        'system:time_start'
      )
    ).getInfo();


  var lastMillis =
    ee.Number(
      collection.aggregate_max(
        'system:time_start'
      )
    ).getInfo();


  var firstDate =
    firstDayOfMonthUTC(
      new Date(firstMillis)
    );


  var lastDate =
    firstDayOfMonthUTC(
      new Date(lastMillis)
    );


  return {

    firstDate:
      firstDate,

    lastDate:
      lastDate,

    firstMonth:
      monthString(firstDate),

    lastMonth:
      monthString(lastDate),

    firstLabel:
      monthLabel(firstDate),

    lastLabel:
      monthLabel(lastDate)

  };

}


/***************************************************************
 3. CLIENT-SIDE EXPORT CHUNK GENERATOR
***************************************************************/

function makeClientChunks(
  firstDate,
  lastDate,
  yearsPerChunk
) {

  var chunks = [];

  var cursor =
    new Date(
      firstDate.getTime()
    );


  while (
    cursor.getTime() <=
    lastDate.getTime()
  ) {

    var start =
      new Date(
        cursor.getTime()
      );


    var nextStart =
      new Date(
        Date.UTC(
          start.getUTCFullYear() + yearsPerChunk,
          start.getUTCMonth(),
          1
        )
      );


    var chunkLast =
      addMonthsUTC(
        nextStart,
        -1
      );


    if (
      chunkLast.getTime() >
      lastDate.getTime()
    ) {

      chunkLast =
        new Date(
          lastDate.getTime()
        );

    }


    chunks.push({

      start:
        monthString(start),

      last:
        monthString(chunkLast),

      label:
        monthLabel(start) +
        '_' +
        monthLabel(chunkLast)

    });


    cursor =
      addMonthsUTC(
        chunkLast,
        1
      );

  }


  return chunks;

}


/***************************************************************
 4. DISCOVER CURRENT COLLECTION RANGES
***************************************************************/

var OISST_BOUNDS =
  datasetBounds(
    OISST_DATASET
  );


var ERA5LAND_BOUNDS =
  datasetBounds(
    ERA5LAND_DATASET
  );


var OISST_CHUNKS =
  makeClientChunks(
    OISST_BOUNDS.firstDate,
    OISST_BOUNDS.lastDate,
    OISST_CHUNK_YEARS
  );


var ERA5LAND_CHUNKS =
  makeClientChunks(
    ERA5LAND_BOUNDS.firstDate,
    ERA5LAND_BOUNDS.lastDate,
    ERA5LAND_CHUNK_YEARS
  );


/***************************************************************
 5. SERVER-SIDE MONTH HELPERS
***************************************************************/

/*
 Inclusive month sequence.

 Example:

 first = 1981-09-01
 last  = 1991-08-01

 includes every month from Sep 1981 through Aug 1991.
*/

function makeMonthStarts(
  firstMonth,
  lastMonth
) {

  firstMonth =
    ee.Date(firstMonth);

  lastMonth =
    ee.Date(lastMonth);


  var nMonths =
    lastMonth
      .advance(1, 'month')
      .difference(
        firstMonth,
        'month'
      )
      .round();


  return ee.List
    .sequence(
      0,
      ee.Number(nMonths).subtract(1)
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


function daysInMonth(monthStart) {

  monthStart =
    ee.Date(monthStart);


  return monthStart
    .advance(1, 'month')
    .difference(
      monthStart,
      'day'
    );

}


/***************************************************************
 6. NULL-SAFE HELPERS
***************************************************************/

function maskedConstantImage(bandNames) {

  var values =
    bandNames.map(
      function(_) {
        return 0;
      }
    );


  return ee.Image
    .constant(values)
    .rename(bandNames)
    .updateMask(
      ee.Image.constant(0)
    );

}


function safeNumber(value) {

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


function safeDivide(
  numerator,
  denominator
) {

  var a =
    safeNumber(numerator);


  var b =
    safeNumber(denominator);


  var invalid =
    a.eq(MISSING_VALUE)
      .or(
        b.eq(MISSING_VALUE)
      )
      .or(
        b.eq(0)
      );


  return ee.Algorithms.If(
    invalid,
    MISSING_VALUE,
    a.divide(b)
  );

}


function safeScale(
  value,
  divisor
) {

  var v =
    safeNumber(value);


  return ee.Algorithms.If(
    v.eq(MISSING_VALUE),
    MISSING_VALUE,
    v.divide(divisor)
  );

}


/***************************************************************
 7. GEOMETRY HELPER
***************************************************************/

function boxFeature(
  regionId,
  regionLabel,
  regionType,
  lonMin,
  latMin,
  lonMax,
  latMax
) {

  var geometry =
    ee.Geometry.Rectangle(
      [
        lonMin,
        latMin,
        lonMax,
        latMax
      ],
      null,
      false
    );


  return ee.Feature(
    geometry,
    {

      region_id:
        regionId,

      region_label:
        regionLabel,

      region_type:
        regionType,

      boundary_source:
        'canonical_or_diagnostic_box',

      lon_min:
        lonMin,

      lat_min:
        latMin,

      lon_max:
        lonMax,

      lat_max:
        latMax,

      nominal_region_area_km2:
        geometry
          .area(1)
          .divide(1e6)

    }
  );

}


/***************************************************************
 8. CANONICAL / DIAGNOSTIC OCEAN REGIONS
***************************************************************/


// ------------------------------------------------------------
// Niño 3.4
//
// 5°S–5°N
// 170°W–120°W
//
// This is the canonical Niño-3.4 spatial box.
//
// We export raw SST.
//
// Python later derives a fixed-climatology Niño-3.4 SSTA.
// ------------------------------------------------------------

var NINO34 =
  boxFeature(
    'nino34',
    'Nino 3.4',
    'canonical_enso_box',
    -170,
    -5,
    -120,
    5
  );


// ------------------------------------------------------------
// IOD / DMI canonical boxes
//
// WTIO:
// 50–70°E, 10°S–10°N
//
// SETIO:
// 90–110°E, 10°S–0°
//
// Python later calculates:
//
// DMI = WTIO SSTA - SETIO SSTA
// ------------------------------------------------------------

var WTIO =
  boxFeature(
    'wtio',
    'Western Tropical Indian Ocean',
    'canonical_iod_box',
    50,
    -10,
    70,
    10
  );


var SETIO =
  boxFeature(
    'setio',
    'Southeastern Tropical Indian Ocean',
    'canonical_iod_box',
    90,
    -10,
    110,
    0
  );


// ------------------------------------------------------------
// Broader Indian Ocean diagnostics
// ------------------------------------------------------------

var INDIAN_OCEAN_BASIN =
  boxFeature(
    'indian_ocean_basin',
    'Broad Tropical Indian Ocean',
    'diagnostic_sst_box',
    40,
    -20,
    110,
    20
  );


var TROPICAL_NORTH_INDIAN_OCEAN =
  boxFeature(
    'tropical_north_indian_ocean',
    'Tropical North Indian Ocean',
    'diagnostic_sst_box',
    40,
    0,
    100,
    25
  );


var ARABIAN_SEA =
  boxFeature(
    'arabian_sea',
    'Arabian Sea',
    'diagnostic_sst_box',
    55,
    5,
    75,
    25
  );


var BAY_OF_BENGAL =
  boxFeature(
    'bay_of_bengal',
    'Bay of Bengal',
    'diagnostic_sst_box',
    80,
    5,
    100,
    22
  );


var SST_REGIONS =
  ee.FeatureCollection([

    NINO34,

    WTIO,

    SETIO,

    INDIAN_OCEAN_BASIN,

    TROPICAL_NORTH_INDIAN_OCEAN,

    ARABIAN_SEA,

    BAY_OF_BENGAL

  ]);


/***************************************************************
 9. PRIMARY SOUTH-ASIAN MONSOON LAND DOMAIN
***************************************************************/

/*
 Broad physical study domain:

    60°E – 105°E
     5°N – 40°N

 This includes:

 - Pakistan
 - India
 - Nepal
 - Bhutan
 - Bangladesh
 - Sri Lanka
 - Kashmir
 - Gilgit-Baltistan
 - Karakoram / western Himalaya
 - southern Tibetan Plateau margins
 - eastern Afghanistan margin
 - western Myanmar margin

 CHIRPS and ERA5-Land contain land masks, so ocean pixels inside
 the rectangular geometry do not contribute to the area-weighted
 spatial mean.
*/


var SOUTH_ASIA_MONSOON_GEOM =
  ee.Geometry.Rectangle(
    [
      60,
      5,
      105,
      40
    ],
    null,
    false
  );


var SOUTH_ASIA_MONSOON_FEATURE =
  ee.Feature(
    SOUTH_ASIA_MONSOON_GEOM,
    {

      region_id:
        'south_asia_broad_monsoon_land',

      region_label:
        'Broad South Asian Monsoon Land Domain',

      region_type:
        'primary_climate_target',

      boundary_source:
        'manual_60E_105E_5N_40N',

      nominal_region_area_km2:
        SOUTH_ASIA_MONSOON_GEOM
          .area(1)
          .divide(1e6)

    }
  );


/***************************************************************
 10. LEGACY COUNTRY-UNION DOMAIN
***************************************************************/

/*
 Retain this because the older figures were based on approximately
 this geography.

 It lets us test how much results depend on study-area definition.
*/


var COUNTRIES =
  ee.FeatureCollection(
    'USDOS/LSIB_SIMPLE/2017'
  );


var LEGACY_COUNTRIES =
  COUNTRIES.filter(
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


var LEGACY_GEOM =
  LEGACY_COUNTRIES.geometry();


var LEGACY_FEATURE =
  ee.Feature(
    LEGACY_GEOM,
    {

      region_id:
        'legacy_indian_subcontinent_union',

      region_label:
        'Legacy Indian Subcontinent Country Union',

      region_type:
        'legacy_comparison_target',

      boundary_source:
        'USDOS_LSIB_SIMPLE_2017',

      nominal_region_area_km2:
        LEGACY_GEOM
          .area(1)
          .divide(1e6)

    }
  );


var SOUTH_ASIA_TARGETS =
  ee.FeatureCollection([

    SOUTH_ASIA_MONSOON_FEATURE,

    LEGACY_FEATURE

  ]);


/***************************************************************
 11. GENERIC AREA-WEIGHTED SPATIAL MEAN
***************************************************************/

/*
 For a regular latitude-longitude raster:

                   Σ(x_i × A_i)
 weighted mean =  --------------
                       Σ(A_i)

 where A_i is the actual valid pixel area.

 This is preferred to an unweighted raster-pixel mean.
*/


function areaWeightedMeanRegions(
  image,
  regions,
  bandName,
  scaleMeters
) {

  image =
    ee.Image(image)
      .select(bandName);


  var validArea =
    ee.Image
      .pixelArea()
      .updateMask(
        image.mask()
      )
      .rename(
        'valid_area_m2'
      );


  var weighted =
    image
      .multiply(
        validArea
      )
      .rename(
        'value_x_area'
      );


  var reduced =
    weighted
      .addBands(
        validArea
      )
      .reduceRegions({

        collection:
          regions,

        reducer:
          ee.Reducer.sum(),

        scale:
          scaleMeters,

        tileScale:
          TILE_SCALE,

        maxPixelsPerRegion:
          1e13

      });


  return reduced.map(
    function(feature) {

      var weightedSum =
        feature.get(
          'value_x_area'
        );


      var validAreaSum =
        feature.get(
          'valid_area_m2'
        );


      /*
       IMPORTANT BUG FIX:

       Build a fresh feature containing all output properties.

       Do NOT later call:

           .select(feature.propertyNames())

       because doing so can remove properties added afterward.
      */

      return ee.Feature(
        null,
        {

          region_id:
            feature.get(
              'region_id'
            ),

          region_label:
            feature.get(
              'region_label'
            ),

          region_type:
            feature.get(
              'region_type'
            ),

          boundary_source:
            feature.get(
              'boundary_source'
            ),

          lon_min:
            feature.get(
              'lon_min'
            ),

          lat_min:
            feature.get(
              'lat_min'
            ),

          lon_max:
            feature.get(
              'lon_max'
            ),

          lat_max:
            feature.get(
              'lat_max'
            ),

          nominal_region_area_km2:
            feature.get(
              'nominal_region_area_km2'
            ),

          effective_valid_area_km2:
            safeScale(
              validAreaSum,
              1e6
            ),

          area_weighted_mean:
            safeDivide(
              weightedSum,
              validAreaSum
            )

        }
      );

    }
  );

}


/***************************************************************
 12. OISST — RAW MONTHLY SST
***************************************************************/

/*
 OISST 'sst' uses scale factor 0.01.

 Export:
      raw monthly area-weighted mean SST [°C]

 Python later derives:

      calendar-month climatology
      SST anomalies
      Niño-3.4 SSTA
      three-month Niño windows
      DMI
      MAM / JJA / JJAS etc.
*/


function prepareOisstDaily(image) {

  return ee.Image(image)
    .select(
      'sst'
    )
    .multiply(
      0.01
    )
    .rename(
      'sst_c'
    )
    .copyProperties(
      image,
      [
        'system:time_start',
        'status'
      ]
    );

}


function oisstMonthRows(monthStart) {

  monthStart =
    ee.Date(monthStart);


  var monthEnd =
    monthStart.advance(
      1,
      'month'
    );


  var raw =
    ee.ImageCollection(
      OISST_DATASET
    )
    .filterDate(
      monthStart,
      monthEnd
    );


  var prepared =
    raw
      .select(
        'sst'
      )
      .map(
        prepareOisstDaily
      );


  var monthlySst =
    ee.Image(
      ee.Algorithms.If(

        prepared.size().gt(0),

        prepared
          .mean()
          .rename(
            'sst_c'
          ),

        maskedConstantImage([
          'sst_c'
        ])

      )
    );


  var reduced =
    areaWeightedMeanRegions(

      monthlySst,

      SST_REGIONS,

      'sst_c',

      OISST_SCALE_M

    );


  var nImages =
    raw.size();


  var expectedDays =
    daysInMonth(
      monthStart
    );


  var coverage =
    safeDivide(
      nImages,
      expectedDays
    );


  var provisional =
    raw
      .filter(
        ee.Filter.eq(
          'status',
          'provisional'
        )
      )
      .size();


  return reduced.map(
    function(feature) {

      return ee.Feature(
        null,
        {

          dataset_id:
            'NOAA_CDR_OISST_V2_1',

          variable_id:
            'monthly_mean_sst',

          units:
            'degC',

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

          region_id:
            feature.get(
              'region_id'
            ),

          region_label:
            feature.get(
              'region_label'
            ),

          region_type:
            feature.get(
              'region_type'
            ),

          boundary_source:
            feature.get(
              'boundary_source'
            ),

          lon_min:
            feature.get(
              'lon_min'
            ),

          lat_min:
            feature.get(
              'lat_min'
            ),

          lon_max:
            feature.get(
              'lon_max'
            ),

          lat_max:
            feature.get(
              'lat_max'
            ),

          nominal_region_area_km2:
            feature.get(
              'nominal_region_area_km2'
            ),

          effective_valid_area_km2:
            feature.get(
              'effective_valid_area_km2'
            ),

          sst_c:
            feature.get(
              'area_weighted_mean'
            ),

          n_daily_images:
            nImages,

          expected_days_in_month:
            expectedDays,

          coverage_fraction:
            coverage,

          n_provisional_daily_images:
            provisional

        }
      );

    }
  );

}


function buildOisstTable(
  firstMonth,
  lastMonth
) {

  var months =
    makeMonthStarts(
      firstMonth,
      lastMonth
    );


  return ee.FeatureCollection(
    months.map(
      function(date) {

        return oisstMonthRows(
          date
        );

      }
    )
  ).flatten();

}


/***************************************************************
 13. ERA5-LAND — MONTHLY 2-M TEMPERATURE
***************************************************************/

/*
 ERA5-Land MONTHLY_AGGR already contains monthly values.

 temperature_2m is in Kelvin.

 Python later converts:

     °C = K - 273.15

 and calculates fixed-climatology anomalies.
*/


function era5LandTemperatureMonthRows(
  monthStart
) {

  monthStart =
    ee.Date(monthStart);


  var monthEnd =
    monthStart.advance(
      1,
      'month'
    );


  var collection =
    ee.ImageCollection(
      ERA5LAND_DATASET
    )
    .filterDate(
      monthStart,
      monthEnd
    )
    .select(
      'temperature_2m'
    );


  var monthlyTemperature =
    ee.Image(
      ee.Algorithms.If(

        collection.size().gt(0),

        collection
          .first()
          .select(
            'temperature_2m'
          )
          .rename(
            'temperature_2m_k'
          ),

        maskedConstantImage([
          'temperature_2m_k'
        ])

      )
    );


  var reduced =
    areaWeightedMeanRegions(

      monthlyTemperature,

      SOUTH_ASIA_TARGETS,

      'temperature_2m_k',

      ERA5LAND_SCALE_M

    );


  var nImages =
    collection.size();


  return reduced.map(
    function(feature) {

      return ee.Feature(
        null,
        {

          dataset_id:
            'ECMWF_ERA5_LAND_MONTHLY_AGGR',

          variable_id:
            'monthly_mean_temperature_2m',

          units:
            'K',

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

          region_id:
            feature.get(
              'region_id'
            ),

          region_label:
            feature.get(
              'region_label'
            ),

          region_type:
            feature.get(
              'region_type'
            ),

          boundary_source:
            feature.get(
              'boundary_source'
            ),

          nominal_region_area_km2:
            feature.get(
              'nominal_region_area_km2'
            ),

          effective_valid_area_km2:
            feature.get(
              'effective_valid_area_km2'
            ),

          temperature_2m_k:
            feature.get(
              'area_weighted_mean'
            ),

          n_monthly_images:
            nImages

        }
      );

    }
  );

}


function buildEra5LandTemperatureTable(
  firstMonth,
  lastMonth
) {

  var months =
    makeMonthStarts(
      firstMonth,
      lastMonth
    );


  return ee.FeatureCollection(
    months.map(
      function(date) {

        return era5LandTemperatureMonthRows(
          date
        );

      }
    )
  ).flatten();

}


/***************************************************************
 14. CHIRPS — RAW MONTHLY PRECIPITATION
***************************************************************/

/*
 CHIRPS daily precipitation -> monthly accumulated precipitation.

 For each domain we calculate:

   area-weighted mean monthly precipitation [mm]

 and, secondarily:

   total precipitation volume [km³]

 The main rainfall climate index later in Python should use the
 area-weighted mean depth, not precipitation volume.
*/


function chirpsMonthRows(
  monthStart
) {

  monthStart =
    ee.Date(monthStart);


  var monthEnd =
    monthStart.advance(
      1,
      'month'
    );


  var collection =
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


  var monthlyRain =
    ee.Image(
      ee.Algorithms.If(

        collection.size().gt(0),

        collection
          .sum()
          .rename(
            'rain_monthly_mm'
          ),

        maskedConstantImage([
          'rain_monthly_mm'
        ])

      )
    );


  var validArea =
    ee.Image
      .pixelArea()
      .updateMask(
        monthlyRain.mask()
      )
      .rename(
        'valid_area_m2'
      );


  var rainArea =
    monthlyRain
      .multiply(
        validArea
      )
      .rename(
        'rain_x_area'
      );


  var reduced =
    rainArea
      .addBands(
        validArea
      )
      .reduceRegions({

        collection:
          SOUTH_ASIA_TARGETS,

        reducer:
          ee.Reducer.sum(),

        scale:
          CHIRPS_SCALE_M,

        tileScale:
          TILE_SCALE,

        maxPixelsPerRegion:
          1e13

      });


  var nImages =
    collection.size();


  var expectedDays =
    daysInMonth(
      monthStart
    );


  var coverage =
    safeDivide(
      nImages,
      expectedDays
    );


  return reduced.map(
    function(feature) {

      var weightedRain =
        feature.get(
          'rain_x_area'
        );


      var area =
        feature.get(
          'valid_area_m2'
        );


      return ee.Feature(
        null,
        {

          dataset_id:
            'UCSB_CHG_CHIRPS_DAILY',

          variable_id:
            'monthly_precipitation',

          units:
            'mm',

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

          region_id:
            feature.get(
              'region_id'
            ),

          region_label:
            feature.get(
              'region_label'
            ),

          region_type:
            feature.get(
              'region_type'
            ),

          boundary_source:
            feature.get(
              'boundary_source'
            ),

          nominal_region_area_km2:
            feature.get(
              'nominal_region_area_km2'
            ),

          effective_valid_area_km2:
            safeScale(
              area,
              1e6
            ),

          rain_monthly_area_weighted_mean_mm:
            safeDivide(
              weightedRain,
              area
            ),

          rain_monthly_volume_km3:
            safeScale(
              weightedRain,
              1e12
            ),

          n_daily_images:
            nImages,

          expected_days_in_month:
            expectedDays,

          coverage_fraction:
            coverage

        }
      );

    }
  );

}


function buildChirpsTable(
  firstMonth,
  lastMonth
) {

  var months =
    makeMonthStarts(
      firstMonth,
      lastMonth
    );


  return ee.FeatureCollection(
    months.map(
      function(date) {

        return chirpsMonthRows(
          date
        );

      }
    )
  ).flatten();

}


/***************************************************************
 15. EXPORT SELECTORS
***************************************************************/

var OISST_SELECTORS = [

  'dataset_id',

  'variable_id',

  'units',

  'date_yyyy_mm',

  'year',

  'month',

  'region_id',

  'region_label',

  'region_type',

  'boundary_source',

  'lon_min',

  'lat_min',

  'lon_max',

  'lat_max',

  'nominal_region_area_km2',

  'effective_valid_area_km2',

  'sst_c',

  'n_daily_images',

  'expected_days_in_month',

  'coverage_fraction',

  'n_provisional_daily_images'

];


var ERA5LAND_SELECTORS = [

  'dataset_id',

  'variable_id',

  'units',

  'date_yyyy_mm',

  'year',

  'month',

  'region_id',

  'region_label',

  'region_type',

  'boundary_source',

  'nominal_region_area_km2',

  'effective_valid_area_km2',

  'temperature_2m_k',

  'n_monthly_images'

];


var CHIRPS_SELECTORS = [

  'dataset_id',

  'variable_id',

  'units',

  'date_yyyy_mm',

  'year',

  'month',

  'region_id',

  'region_label',

  'region_type',

  'boundary_source',

  'nominal_region_area_km2',

  'effective_valid_area_km2',

  'rain_monthly_area_weighted_mean_mm',

  'rain_monthly_volume_km3',

  'n_daily_images',

  'expected_days_in_month',

  'coverage_fraction'

];


/***************************************************************
 16. MINIMAL QA PRINTS
***************************************************************/

if (PRINT_MINIMAL_QA) {


  // ----------------------------------------------------------
  // Collection ranges
  // ----------------------------------------------------------

  print(
    'Detected OISST range:',
    OISST_BOUNDS.firstMonth,
    'to',
    OISST_BOUNDS.lastMonth
  );


  print(
    'Detected ERA5-Land range:',
    ERA5LAND_BOUNDS.firstMonth,
    'to',
    ERA5LAND_BOUNDS.lastMonth
  );


  // ----------------------------------------------------------
  // First historical OISST row
  // ----------------------------------------------------------

  print(
    'QA OISST first row:',
    oisstMonthRows(
      ee.Date(
        OISST_BOUNDS.firstMonth
      )
    ).first()
  );


  // ----------------------------------------------------------
  // Latest OISST month
  //
  // If this is the current month, coverage_fraction < 1 is
  // EXPECTED.
  // ----------------------------------------------------------

  print(
    'QA OISST latest available month:',
    oisstMonthRows(
      ee.Date(
        OISST_BOUNDS.lastMonth
      )
    ).first()
  );


  // ----------------------------------------------------------
  // Canonical WTIO / SETIO test
  // ----------------------------------------------------------

  print(
    'QA OISST WTIO + SETIO sample, July 2020:',
    oisstMonthRows(
      ee.Date(
        '2020-07-01'
      )
    )
    .filter(
      ee.Filter.inList(
        'region_id',
        [
          'wtio',
          'setio'
        ]
      )
    )
  );


  // ----------------------------------------------------------
  // First ERA5-Land row
  // ----------------------------------------------------------

  print(
    'QA ERA5-Land first row:',
    era5LandTemperatureMonthRows(
      ee.Date(
        ERA5LAND_BOUNDS.firstMonth
      )
    ).first()
  );


  // ----------------------------------------------------------
  // Latest ERA5-Land row
  // ----------------------------------------------------------

  print(
    'QA ERA5-Land latest available month:',
    era5LandTemperatureMonthRows(
      ee.Date(
        ERA5LAND_BOUNDS.lastMonth
      )
    ).first()
  );


  // ----------------------------------------------------------
  // Previously missing CHIRPS month
  // ----------------------------------------------------------

  print(
    'QA CHIRPS December 1990:',
    chirpsMonthRows(
      ee.Date(
        '1990-12-01'
      )
    ).first()
  );


  // ----------------------------------------------------------
  // Second previously missing CHIRPS month
  // ----------------------------------------------------------

  print(
    'QA CHIRPS December 2010:',
    chirpsMonthRows(
      ee.Date(
        '2010-12-01'
      )
    ).first()
  );

}


/***************************************************************
 17. EXPORT ALL OISST
***************************************************************/

if (REEXPORT_ALL_OISST) {

  OISST_CHUNKS.forEach(
    function(chunk) {

      var table =
        buildOisstTable(
          chunk.start,
          chunk.last
        )
        .select(
          OISST_SELECTORS
        );


      var prefix =
        'sam_core_oisst_raw_monthly_' +
        chunk.label;


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
          OISST_SELECTORS

      });

    }
  );

}


/***************************************************************
 18. EXPORT ALL ERA5-LAND T2M
***************************************************************/

if (REEXPORT_ALL_ERA5LAND_T2M) {

  ERA5LAND_CHUNKS.forEach(
    function(chunk) {

      var table =
        buildEra5LandTemperatureTable(
          chunk.start,
          chunk.last
        )
        .select(
          ERA5LAND_SELECTORS
        );


      var prefix =
        'sam_core_era5land_t2m_raw_monthly_' +
        chunk.label;


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
          ERA5LAND_SELECTORS

      });

    }
  );

}


/***************************************************************
 19. RE-EXPORT FAILED CHIRPS CHUNKS
***************************************************************/

if (REEXPORT_FAILED_CHIRPS_CHUNKS) {


  // ----------------------------------------------------------
  // 1981-01 through 1990-12
  // ----------------------------------------------------------

  var chirps1981to1990 =
    buildChirpsTable(
      '1981-01-01',
      '1990-12-01'
    )
    .select(
      CHIRPS_SELECTORS
    );


  Export.table.toDrive({

    collection:
      chirps1981to1990,

    description:
      'sam_core_chirps_raw_monthly_198101_199012',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'sam_core_chirps_raw_monthly_198101_199012',

    fileFormat:
      'CSV',

    selectors:
      CHIRPS_SELECTORS

  });


  // ----------------------------------------------------------
  // 2001-01 through 2010-12
  // ----------------------------------------------------------

  var chirps2001to2010 =
    buildChirpsTable(
      '2001-01-01',
      '2010-12-01'
    )
    .select(
      CHIRPS_SELECTORS
    );


  Export.table.toDrive({

    collection:
      chirps2001to2010,

    description:
      'sam_core_chirps_raw_monthly_200101_201012',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'sam_core_chirps_raw_monthly_200101_201012',

    fileFormat:
      'CSV',

    selectors:
      CHIRPS_SELECTORS

  });

}