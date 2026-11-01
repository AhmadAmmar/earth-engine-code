/***************************************************************
 Monthly combined rainfall + ENSO/IOD table
 Google Earth Engine JavaScript

 Output:
 south_asia_enso_iod_monsoon_1982_2025_clim_1991_2020_monthly_combined.csv

 Variables:
 - Monthly area-weighted mean rainfall over selected South Asian land region
 - Monthly rainfall anomaly, percent anomaly, z-score
 - Monthly rainfall volume in km3
 - Monthly Niño 3.4 SST anomaly
 - Monthly WTIO, SETIO, and DMI/IOD
 - 3-month centered and trailing Niño 3.4 / DMI means

 No Console printing.
***************************************************************/


/***************************************************************
 0. USER SETTINGS
***************************************************************/

var START_YEAR = 1982;
var END_YEAR = 2025;

var CLIM_START = 1991;
var CLIM_END = 2020;

var EXPORT_FOLDER = 'GEE_ENSO_IOD_MONSOON';

var EXPORT_PREFIX =
  'south_asia_enso_iod_monsoon_' +
  START_YEAR + '_' + END_YEAR +
  '_clim_' + CLIM_START + '_' + CLIM_END +
  '_monthly_combined';

var SST_DATASET = 'NOAA/CDR/OISST/V2_1';
var RAIN_DATASET = 'UCSB-CHG/CHIRPS/DAILY';

var SST_SCALE_M = 27830;
var RAIN_SCALE_M = 5566;

var TILE_SCALE = 4;


/***************************************************************
 1. REGIONS
***************************************************************/

// Niño 3.4: 5S–5N, 170W–120W.
var NINO34 = ee.Geometry.Rectangle([-170, -5, -120, 5], null, false);

// IOD / DMI boxes.
// WTIO: 50E–70E, 10S–10N.
// SETIO: 90E–110E, 10S–0.
var WTIO = ee.Geometry.Rectangle([50, -10, 70, 10], null, false);
var SETIO = ee.Geometry.Rectangle([90, -10, 110, 0], null, false);

// South Asian land-region AOI.
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

var MONSOON_AOI = southAsiaCountries.geometry();


/***************************************************************
 2. COMMON HELPERS
***************************************************************/

var MONTHS = ee.List.sequence(1, 12);

function areaWeightedMean(image, geometry, scaleMeters) {
  var value = image.rename('value');

  var area = ee.Image.pixelArea()
    .updateMask(value.mask())
    .rename('area');

  var weighted = value.multiply(area).rename('weighted');

  var sums = weighted.addBands(area).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: scaleMeters,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  return ee.Number(sums.get('weighted'))
    .divide(ee.Number(sums.get('area')));
}


function rainfallRegionalStats(image, geometry, scaleMeters) {
  var rain = image.rename('rain_mm');

  var area = ee.Image.pixelArea()
    .updateMask(rain.mask())
    .rename('area_m2');

  // Units: mm * m2.
  var rainTimesArea = rain.multiply(area).rename('rain_mm_area_m2');

  var sums = rainTimesArea.addBands(area).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometry,
    scale: scaleMeters,
    maxPixels: 1e13,
    tileScale: TILE_SCALE
  });

  var rainMmAreaM2 = ee.Number(sums.get('rain_mm_area_m2'));
  var areaM2 = ee.Number(sums.get('area_m2'));

  return ee.Dictionary({
    // Area-weighted mean rainfall depth, mm.
    'rain_monthly_mm': rainMmAreaM2.divide(areaM2),

    // Total precipitation volume over the AOI.
    // rain_mm * area_m2 / 1e12 = km3.
    'rain_monthly_volume_km3': rainMmAreaM2.divide(1e12),

    // Effective area used in the calculation.
    'aoi_effective_area_km2': areaM2.divide(1e6)
  });
}


function sampleSdFromFeatureCollection(fc, propertyName) {
  return ee.Number(
    ee.Dictionary(fc.aggregate_stats(propertyName)).get('sample_sd')
  );
}


function pctAnomaly(value, climatologicalMean) {
  return ee.Number(value)
    .subtract(climatologicalMean)
    .divide(climatologicalMean)
    .multiply(100);
}


function zScore(value, climatologicalMean, climatologicalSd) {
  return ee.Number(value)
    .subtract(climatologicalMean)
    .divide(climatologicalSd);
}


function seasonalMeanFromMonthlyFeatureTable(featureTable, startDate, endDate, propertyName) {
  var subset = featureTable
    .filter(ee.Filter.gte('system:time_start', startDate.millis()))
    .filter(ee.Filter.lt('system:time_start', endDate.millis()));

  return ee.Number(subset.aggregate_mean(propertyName));
}


/***************************************************************
 3. MONTHLY DATE SEQUENCES
***************************************************************/

// Rainfall export months: Jan 1982 to Dec 2025.
var analysisFirstMonth = ee.Date.fromYMD(START_YEAR, 1, 1);
var analysisLastMonth = ee.Date.fromYMD(END_YEAR, 12, 1);

var nAnalysisMonths = analysisLastMonth
  .difference(analysisFirstMonth, 'month')
  .round();

var analysisMonthStarts = ee.List.sequence(0, nAnalysisMonths).map(function(n) {
  return analysisFirstMonth.advance(ee.Number(n), 'month');
});

// SST months include buffer months so 3-month means work at edges.
// Jan 1982 needs Dec 1981 for centered/trailing windows.
// Dec 2025 needs Jan 2026 for centered 3-month mean.
var sstFirstMonth = ee.Date('1981-09-01');
var sstLastMonth = ee.Date.fromYMD(END_YEAR + 1, 1, 1);

var nSstMonths = sstLastMonth
  .difference(sstFirstMonth, 'month')
  .round();

var sstMonthStarts = ee.List.sequence(0, nSstMonths).map(function(n) {
  return sstFirstMonth.advance(ee.Number(n), 'month');
});


/***************************************************************
 4. OISST MONTHLY SST ANOMALIES
***************************************************************/

// OISST SST band uses scale factor 0.01 for degrees Celsius.
var oisst = ee.ImageCollection(SST_DATASET)
  .filterDate(sstFirstMonth, sstLastMonth.advance(1, 'month'))
  .select('sst')
  .map(function(img) {
    return img
      .multiply(0.01)
      .rename('sst_c')
      .copyProperties(img, ['system:time_start']);
  });

var monthlySST = ee.ImageCollection.fromImages(
  sstMonthStarts.map(function(d) {
    d = ee.Date(d);

    var start = d;
    var end = d.advance(1, 'month');

    return oisst
      .filterDate(start, end)
      .mean()
      .rename('sst_c')
      .set({
        'system:time_start': start.millis(),
        'date_yyyy_mm': start.format('YYYY-MM'),
        'year': start.get('year'),
        'month': start.get('month')
      });
  })
);

// Monthly SST climatology by calendar month.
var monthlySSTClimatology = ee.ImageCollection.fromImages(
  MONTHS.map(function(m) {
    m = ee.Number(m);

    return monthlySST
      .filter(ee.Filter.eq('month', m))
      .filter(ee.Filter.gte('year', CLIM_START))
      .filter(ee.Filter.lte('year', CLIM_END))
      .mean()
      .rename('sst_c')
      .set('month', m);
  })
);

// Monthly SST anomaly relative to selected climatology.
var monthlySSTA = monthlySST.map(function(img) {
  var m = ee.Number(img.get('month'));

  var clim = ee.Image(
    monthlySSTClimatology
      .filter(ee.Filter.eq('month', m))
      .first()
  );

  return img
    .subtract(clim)
    .rename('ssta_c')
    .copyProperties(img, [
      'system:time_start',
      'date_yyyy_mm',
      'year',
      'month'
    ]);
});


/***************************************************************
 5. MONTHLY ENSO / IOD INDEX TABLE
***************************************************************/

var monthlySSTAList = monthlySSTA.toList(monthlySSTA.size());

var monthlySSTIndexRaw = ee.FeatureCollection(
  monthlySSTAList.map(function(img) {
    img = ee.Image(img);

    var nino34 = areaWeightedMean(img, NINO34, SST_SCALE_M);
    var wtio = areaWeightedMean(img, WTIO, SST_SCALE_M);
    var setio = areaWeightedMean(img, SETIO, SST_SCALE_M);
    var dmi = wtio.subtract(setio);

    return ee.Feature(null, {
      'date_yyyy_mm': img.get('date_yyyy_mm'),
      'year': img.get('year'),
      'month': img.get('month'),
      'system:time_start': img.get('system:time_start'),

      'nino34_ssta_c': nino34,
      'wtio_ssta_c': wtio,
      'setio_ssta_c': setio,
      'dmi_ssta_c': dmi
    });
  })
);

// Add centered and trailing 3-month means.
var monthlySSTIndex = monthlySSTIndexRaw.map(function(f) {
  var d = ee.Date(f.get('system:time_start'));

  // Centered: previous month, current month, next month.
  var centeredStart = d.advance(-1, 'month');
  var centeredEnd = d.advance(2, 'month');

  var centeredSubset = monthlySSTIndexRaw
    .filter(ee.Filter.gte('system:time_start', centeredStart.millis()))
    .filter(ee.Filter.lt('system:time_start', centeredEnd.millis()));

  // Trailing: current month and previous two months.
  var trailingStart = d.advance(-2, 'month');
  var trailingEnd = d.advance(1, 'month');

  var trailingSubset = monthlySSTIndexRaw
    .filter(ee.Filter.gte('system:time_start', trailingStart.millis()))
    .filter(ee.Filter.lt('system:time_start', trailingEnd.millis()));

  return f.set({
    'nino34_3mo_centered_ssta_c': centeredSubset.aggregate_mean('nino34_ssta_c'),
    'dmi_3mo_centered_ssta_c': centeredSubset.aggregate_mean('dmi_ssta_c'),

    'nino34_3mo_trailing_ssta_c': trailingSubset.aggregate_mean('nino34_ssta_c'),
    'dmi_3mo_trailing_ssta_c': trailingSubset.aggregate_mean('dmi_ssta_c')
  });
});


/***************************************************************
 6. MONTHLY REGIONAL RAINFALL TABLE
***************************************************************/

var chirps = ee.ImageCollection(RAIN_DATASET)
  .filterDate(
    ee.Date.fromYMD(START_YEAR, 1, 1),
    ee.Date.fromYMD(END_YEAR + 1, 1, 1)
  )
  .select('precipitation');


function monthlyRainImage(date) {
  date = ee.Date(date);

  return chirps
    .filterDate(date, date.advance(1, 'month'))
    .sum()
    .rename('rain_mm')
    .set({
      'system:time_start': date.millis(),
      'date_yyyy_mm': date.format('YYYY-MM'),
      'year': date.get('year'),
      'month': date.get('month')
    });
}


var monthlyRainRaw = ee.FeatureCollection(
  analysisMonthStarts.map(function(d) {
    d = ee.Date(d);

    var rainImg = monthlyRainImage(d);
    var stats = rainfallRegionalStats(rainImg, MONSOON_AOI, RAIN_SCALE_M);

    var m = ee.Number(d.get('month'));

    return ee.Feature(null, {
      'date_yyyy_mm': d.format('YYYY-MM'),
      'year': d.get('year'),
      'month': m,
      'system:time_start': d.millis(),

      // Flag for June–September monsoon months.
      'is_monsoon_jjas': ee.Number(
        ee.Algorithms.If(m.gte(6).and(m.lte(9)), 1, 0)
      )
    }).set(stats);
  })
);


/***************************************************************
 7. MONTHLY RAINFALL CLIMATOLOGY AND ANOMALIES
***************************************************************/

var monthlyRainClimStats = ee.FeatureCollection(
  MONTHS.map(function(m) {
    m = ee.Number(m);

    var climSubset = monthlyRainRaw
      .filter(ee.Filter.eq('month', m))
      .filter(ee.Filter.gte('year', CLIM_START))
      .filter(ee.Filter.lte('year', CLIM_END));

    var rainMean = ee.Number(climSubset.aggregate_mean('rain_monthly_mm'));
    var rainSd = sampleSdFromFeatureCollection(climSubset, 'rain_monthly_mm');

    var volumeMean = ee.Number(climSubset.aggregate_mean('rain_monthly_volume_km3'));
    var volumeSd = sampleSdFromFeatureCollection(climSubset, 'rain_monthly_volume_km3');

    return ee.Feature(null, {
      'month': m,

      'rain_monthly_clim_mm': rainMean,
      'rain_monthly_clim_sd_mm': rainSd,

      'rain_monthly_volume_clim_km3': volumeMean,
      'rain_monthly_volume_clim_sd_km3': volumeSd
    });
  })
);


var monthlyRainWithAnoms = monthlyRainRaw.map(function(f) {
  var m = ee.Number(f.get('month'));

  var clim = ee.Feature(
    monthlyRainClimStats
      .filter(ee.Filter.eq('month', m))
      .first()
  );

  var rain = ee.Number(f.get('rain_monthly_mm'));
  var volume = ee.Number(f.get('rain_monthly_volume_km3'));

  var rainClim = ee.Number(clim.get('rain_monthly_clim_mm'));
  var rainSd = ee.Number(clim.get('rain_monthly_clim_sd_mm'));

  var volumeClim = ee.Number(clim.get('rain_monthly_volume_clim_km3'));
  var volumeSd = ee.Number(clim.get('rain_monthly_volume_clim_sd_km3'));

  return f.set({
    'rain_monthly_clim_mm': rainClim,
    'rain_monthly_anom_mm': rain.subtract(rainClim),
    'rain_monthly_pct_anom': pctAnomaly(rain, rainClim),
    'rain_monthly_z': zScore(rain, rainClim, rainSd),

    'rain_monthly_volume_clim_km3': volumeClim,
    'rain_monthly_volume_anom_km3': volume.subtract(volumeClim),
    'rain_monthly_volume_pct_anom': pctAnomaly(volume, volumeClim),
    'rain_monthly_volume_z': zScore(volume, volumeClim, volumeSd)
  });
});


/***************************************************************
 8. MERGE MONTHLY RAINFALL WITH MONTHLY SST INDICES
***************************************************************/

var monthlyCombined = monthlyRainWithAnoms.map(function(f) {
  var y = ee.Number(f.get('year'));
  var m = ee.Number(f.get('month'));

  var sstFeature = ee.Feature(
    monthlySSTIndex
      .filter(ee.Filter.eq('year', y))
      .filter(ee.Filter.eq('month', m))
      .first()
  );

  return f.set({
    'nino34_ssta_c': sstFeature.get('nino34_ssta_c'),
    'wtio_ssta_c': sstFeature.get('wtio_ssta_c'),
    'setio_ssta_c': sstFeature.get('setio_ssta_c'),
    'dmi_ssta_c': sstFeature.get('dmi_ssta_c'),

    'nino34_3mo_centered_ssta_c': sstFeature.get('nino34_3mo_centered_ssta_c'),
    'dmi_3mo_centered_ssta_c': sstFeature.get('dmi_3mo_centered_ssta_c'),

    'nino34_3mo_trailing_ssta_c': sstFeature.get('nino34_3mo_trailing_ssta_c'),
    'dmi_3mo_trailing_ssta_c': sstFeature.get('dmi_3mo_trailing_ssta_c')
  });
});


/***************************************************************
 9. EXPORT MONTHLY COMBINED CSV
***************************************************************/

var monthlyCombinedColumns = [
  'date_yyyy_mm',
  'year',
  'month',
  'is_monsoon_jjas',

  // Area-weighted mean rainfall depth.
  'rain_monthly_mm',
  'rain_monthly_clim_mm',
  'rain_monthly_anom_mm',
  'rain_monthly_pct_anom',
  'rain_monthly_z',

  // Total precipitation volume over AOI.
  'rain_monthly_volume_km3',
  'rain_monthly_volume_clim_km3',
  'rain_monthly_volume_anom_km3',
  'rain_monthly_volume_pct_anom',
  'rain_monthly_volume_z',

  // AOI effective area used in calculation.
  'aoi_effective_area_km2',

  // Monthly SST indices.
  'nino34_ssta_c',
  'wtio_ssta_c',
  'setio_ssta_c',
  'dmi_ssta_c',

  // 3-month centered means.
  'nino34_3mo_centered_ssta_c',
  'dmi_3mo_centered_ssta_c',

  // 3-month trailing means.
  'nino34_3mo_trailing_ssta_c',
  'dmi_3mo_trailing_ssta_c'
];


Export.table.toDrive({
  collection: monthlyCombined.select(monthlyCombinedColumns),
  description: EXPORT_PREFIX + '_csv',
  folder: EXPORT_FOLDER,
  fileNamePrefix: EXPORT_PREFIX,
  fileFormat: 'CSV',
  selectors: monthlyCombinedColumns
});