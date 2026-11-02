/***************************************************************
 ENSO / IOD / Indian Subcontinent Monsoon Rainfall Analysis
 Google Earth Engine JavaScript

 Author: Ahmad Ammar / ChatGPT workflow draft
 Main period: 1982–2025
 Climatology: 1991–2020

 Main outputs:
 1. Annual combined CSV:
    South Asia JJAS rainfall + anomalies + Niño 3.4 + DMI/IOD indices

 2. Monthly SST index CSV:
    Monthly Niño 3.4, WTIO, SETIO, DMI, and 3-month running values

 Optional:
 3. Pixel-wise correlation and trend raster exports

 Notes:
 - Niño 3.4 and DMI here are OISST-derived, not official NOAA ONI.
 - DMI = WTIO anomaly - SETIO anomaly.
 - Rainfall index = area-weighted CHIRPS JJAS rainfall over selected AOI.
***************************************************************/


/***************************************************************
 0. USER SETTINGS
***************************************************************/

var START_YEAR = 1982;
var END_YEAR = 2025;

var CLIM_START = 1991;
var CLIM_END = 2020;

// Export folder in Google Drive.
var EXPORT_FOLDER = 'GEE_ENSO_IOD_MONSOON';

// Main table export toggles.
var EXPORT_ANNUAL_COMBINED_TABLE = true;
var EXPORT_MONTHLY_SST_INDEX_TABLE = true;

// Optional raster exports. Keep false unless needed.
var EXPORT_RASTER_MAPS = false;

// Dataset choices.
var SST_DATASET = 'NOAA/CDR/OISST/V2_1';

// Default: CHIRPS v2 final daily.
// Alternative CHIRPS v3 reanalysis:
// var RAIN_DATASET = 'UCSB-CHC/CHIRPS/V3/DAILY_RNL';
var RAIN_DATASET = 'UCSB-CHG/CHIRPS/DAILY';

// Thresholds.
// ENSO threshold commonly used for Niño 3.4 anomaly phases.
var ENSO_THRESHOLD_C = 0.5;

// IOD/DMI threshold commonly used by BoM-style definitions.
var IOD_THRESHOLD_C = 0.4;

// Spatial scale parameters.
// OISST is ~0.25 degree. CHIRPS is ~0.05 degree.
var SST_SCALE_M = 27830;
var RAIN_SCALE_M = 5566;

// Use tileScale to reduce memory pressure during reduceRegion calls.
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

// Indian Subcontinent / South Asia countries.
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

// Simple display.
Map.centerObject(MONSOON_AOI, 4);
Map.addLayer(
  southAsiaCountries,
  {color: 'black'},
  'South Asia AOI: Pakistan, India, Bangladesh, Nepal, Bhutan, Sri Lanka',
  false
);

Map.addLayer(NINO34, {color: 'red'}, 'Niño 3.4 box', false);
Map.addLayer(WTIO, {color: 'blue'}, 'WTIO IOD box', false);
Map.addLayer(SETIO, {color: 'green'}, 'SETIO IOD box', false);


/***************************************************************
 2. HELPER FUNCTIONS
***************************************************************/

var YEARS = ee.List.sequence(START_YEAR, END_YEAR);
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

function flag(condition) {
  return ee.Number(ee.Algorithms.If(condition, 1, 0));
}

function threePhase(value, positiveThreshold, negativeThreshold, positiveName, negativeName) {
  value = ee.Number(value);

  return ee.String(
    ee.Algorithms.If(
      value.gte(positiveThreshold),
      positiveName,
      ee.Algorithms.If(
        value.lte(ee.Number(negativeThreshold).multiply(-1)),
        negativeName,
        'Neutral'
      )
    )
  );
}

function seasonalMeanFromMonthlyFeatureTable(featureTable, startDate, endDate, propertyName) {
  var subset = featureTable
    .filter(ee.Filter.gte('system:time_start', startDate.millis()))
    .filter(ee.Filter.lt('system:time_start', endDate.millis()));

  return ee.Number(subset.aggregate_mean(propertyName));
}

function meanFromFeatureCollection(fc, propertyName) {
  return ee.Number(fc.aggregate_mean(propertyName));
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


/***************************************************************
 3. LOAD AND PREPARE OISST
***************************************************************/

// OISST begins 1981-09-01.
// We start monthly SST construction at 1981-09 so DJF before 1982
// can use Dec 1981, Jan 1982, Feb 1982.
var firstSstMonth = ee.Date('1981-09-01');
var lastSstMonth = ee.Date.fromYMD(END_YEAR, 12, 1);

var nSstMonthSteps = lastSstMonth
  .difference(firstSstMonth, 'month')
  .round();

var sstMonthStarts = ee.List.sequence(0, nSstMonthSteps).map(function(n) {
  return firstSstMonth.advance(ee.Number(n), 'month');
});

// OISST SST band is scaled by 0.01 to degrees C.
var oisst = ee.ImageCollection(SST_DATASET)
  .filterDate(firstSstMonth, lastSstMonth.advance(1, 'month'))
  .select('sst')
  .map(function(img) {
    return img
      .multiply(0.01)
      .rename('sst_c')
      .copyProperties(img, ['system:time_start']);
  });

// Monthly mean SST.
var monthlySST = ee.ImageCollection.fromImages(
  sstMonthStarts.map(function(d) {
    d = ee.Date(d);
    var end = d.advance(1, 'month');

    return oisst
      .filterDate(d, end)
      .mean()
      .rename('sst_c')
      .set({
        'system:time_start': d.millis(),
        'date_yyyy_mm': d.format('YYYY-MM'),
        'year': d.get('year'),
        'month': d.get('month')
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

// Monthly SST anomaly relative to chosen climatology.
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
 4. BUILD MONTHLY SST INDEX TABLE
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

// Add centered 3-month means.
// For a given month t, this averages t-1, t, t+1.
// Near the edge of the available record, it averages available months only.
var monthlySSTIndex = monthlySSTIndexRaw.map(function(f) {
  var d = ee.Date(f.get('system:time_start'));
  var start = d.advance(-1, 'month');
  var end = d.advance(2, 'month');

  var subset = monthlySSTIndexRaw
    .filter(ee.Filter.gte('system:time_start', start.millis()))
    .filter(ee.Filter.lt('system:time_start', end.millis()));

  return f.set({
    'nino34_3mo_centered_ssta_c': subset.aggregate_mean('nino34_ssta_c'),
    'dmi_3mo_centered_ssta_c': subset.aggregate_mean('dmi_ssta_c')
  });
});


/***************************************************************
 5. LOAD AND PREPARE CHIRPS RAINFALL
***************************************************************/

var rainfall = ee.ImageCollection(RAIN_DATASET)
  .filterDate(
    ee.Date.fromYMD(START_YEAR, 1, 1),
    ee.Date.fromYMD(END_YEAR + 1, 1, 1)
  )
  .select('precipitation');

function monthlyRainImage(year, month) {
  year = ee.Number(year);
  month = ee.Number(month);

  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');

  return rainfall
    .filterDate(start, end)
    .sum()
    .rename('rain_mm')
    .set({
      'year': year,
      'month': month,
      'system:time_start': start.millis()
    });
}

function annualJJASRainImage(year) {
  year = ee.Number(year);

  var jun = monthlyRainImage(year, 6);
  var jul = monthlyRainImage(year, 7);
  var aug = monthlyRainImage(year, 8);
  var sep = monthlyRainImage(year, 9);

  return ee.ImageCollection.fromImages([jun, jul, aug, sep])
    .sum()
    .rename('rain_jjas_mm')
    .set({
      'year': year,
      'system:time_start': ee.Date.fromYMD(year, 7, 1).millis()
    });
}

var annualRainImages = ee.ImageCollection.fromImages(
  YEARS.map(function(y) {
    return annualJJASRainImage(y);
  })
);

// Pixel-wise JJAS rainfall climatology and anomaly images.
var jjasRainClimatologyImage = annualRainImages
  .filter(ee.Filter.gte('year', CLIM_START))
  .filter(ee.Filter.lte('year', CLIM_END))
  .mean()
  .rename('rain_jjas_clim_mm');

var annualRainAnomalyImages = annualRainImages.map(function(img) {
  return img
    .subtract(jjasRainClimatologyImage)
    .rename('rain_jjas_anom_mm')
    .copyProperties(img, ['year', 'system:time_start']);
});


/***************************************************************
 6. BUILD ANNUAL REGIONAL RAINFALL TABLE
***************************************************************/

var annualRainRaw = ee.FeatureCollection(
  YEARS.map(function(y) {
    y = ee.Number(y);

    var jun = monthlyRainImage(y, 6);
    var jul = monthlyRainImage(y, 7);
    var aug = monthlyRainImage(y, 8);
    var sep = monthlyRainImage(y, 9);
    var jjas = annualJJASRainImage(y);

    return ee.Feature(null, {
      'year': y,

      'rain_jun_mm': areaWeightedMean(jun, MONSOON_AOI, RAIN_SCALE_M),
      'rain_jul_mm': areaWeightedMean(jul, MONSOON_AOI, RAIN_SCALE_M),
      'rain_aug_mm': areaWeightedMean(aug, MONSOON_AOI, RAIN_SCALE_M),
      'rain_sep_mm': areaWeightedMean(sep, MONSOON_AOI, RAIN_SCALE_M),
      'rain_jjas_mm': areaWeightedMean(jjas, MONSOON_AOI, RAIN_SCALE_M)
    });
  })
);


// Climatological rainfall statistics for regional index.
var annualRainClim = annualRainRaw
  .filter(ee.Filter.gte('year', CLIM_START))
  .filter(ee.Filter.lte('year', CLIM_END));

var rainJunMean = meanFromFeatureCollection(annualRainClim, 'rain_jun_mm');
var rainJulMean = meanFromFeatureCollection(annualRainClim, 'rain_jul_mm');
var rainAugMean = meanFromFeatureCollection(annualRainClim, 'rain_aug_mm');
var rainSepMean = meanFromFeatureCollection(annualRainClim, 'rain_sep_mm');
var rainJJASMean = meanFromFeatureCollection(annualRainClim, 'rain_jjas_mm');

var rainJunSd = sampleSdFromFeatureCollection(annualRainClim, 'rain_jun_mm');
var rainJulSd = sampleSdFromFeatureCollection(annualRainClim, 'rain_jul_mm');
var rainAugSd = sampleSdFromFeatureCollection(annualRainClim, 'rain_aug_mm');
var rainSepSd = sampleSdFromFeatureCollection(annualRainClim, 'rain_sep_mm');
var rainJJASSd = sampleSdFromFeatureCollection(annualRainClim, 'rain_jjas_mm');


/***************************************************************
 7. BUILD ANNUAL COMBINED ENSO / IOD / MONSOON TABLE
***************************************************************/

var annualCombined = annualRainRaw.map(function(f) {
  var y = ee.Number(f.get('year'));

  // ENSO windows.
  var nino34_djf = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y.subtract(1), 12, 1),
    ee.Date.fromYMD(y, 3, 1),
    'nino34_ssta_c'
  );

  var nino34_mam = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 3, 1),
    ee.Date.fromYMD(y, 6, 1),
    'nino34_ssta_c'
  );

  var nino34_amj = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 4, 1),
    ee.Date.fromYMD(y, 7, 1),
    'nino34_ssta_c'
  );

  var nino34_mjj = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 5, 1),
    ee.Date.fromYMD(y, 8, 1),
    'nino34_ssta_c'
  );

  var nino34_jja = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 6, 1),
    ee.Date.fromYMD(y, 9, 1),
    'nino34_ssta_c'
  );

  var nino34_jjas = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 6, 1),
    ee.Date.fromYMD(y, 10, 1),
    'nino34_ssta_c'
  );

  // IOD / DMI windows.
  var dmi_mam = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 3, 1),
    ee.Date.fromYMD(y, 6, 1),
    'dmi_ssta_c'
  );

  var dmi_amj = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 4, 1),
    ee.Date.fromYMD(y, 7, 1),
    'dmi_ssta_c'
  );

  var dmi_mjj = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 5, 1),
    ee.Date.fromYMD(y, 8, 1),
    'dmi_ssta_c'
  );

  var dmi_jja = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 6, 1),
    ee.Date.fromYMD(y, 9, 1),
    'dmi_ssta_c'
  );

  var dmi_jjas = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 6, 1),
    ee.Date.fromYMD(y, 10, 1),
    'dmi_ssta_c'
  );

  var dmi_jas = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 7, 1),
    ee.Date.fromYMD(y, 10, 1),
    'dmi_ssta_c'
  );

  var dmi_aso = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 8, 1),
    ee.Date.fromYMD(y, 11, 1),
    'dmi_ssta_c'
  );

  var dmi_son = seasonalMeanFromMonthlyFeatureTable(
    monthlySSTIndex,
    ee.Date.fromYMD(y, 9, 1),
    ee.Date.fromYMD(y, 12, 1),
    'dmi_ssta_c'
  );

  // Rainfall raw values.
  var rainJun = ee.Number(f.get('rain_jun_mm'));
  var rainJul = ee.Number(f.get('rain_jul_mm'));
  var rainAug = ee.Number(f.get('rain_aug_mm'));
  var rainSep = ee.Number(f.get('rain_sep_mm'));
  var rainJJAS = ee.Number(f.get('rain_jjas_mm'));

  // Rainfall anomalies.
  var rainJunAnom = rainJun.subtract(rainJunMean);
  var rainJulAnom = rainJul.subtract(rainJulMean);
  var rainAugAnom = rainAug.subtract(rainAugMean);
  var rainSepAnom = rainSep.subtract(rainSepMean);
  var rainJJASAnom = rainJJAS.subtract(rainJJASMean);

  // Flags.
  var elNinoDjfFlag = flag(nino34_djf.gte(ENSO_THRESHOLD_C));
  var laNinaDjfFlag = flag(nino34_djf.lte(-ENSO_THRESHOLD_C));

  var elNinoJJASFlag = flag(nino34_jjas.gte(ENSO_THRESHOLD_C));
  var laNinaJJASFlag = flag(nino34_jjas.lte(-ENSO_THRESHOLD_C));

  var positiveIodJJASFlag = flag(dmi_jjas.gte(IOD_THRESHOLD_C));
  var negativeIodJJASFlag = flag(dmi_jjas.lte(-IOD_THRESHOLD_C));

  var elNinoDjfPositiveIodJJASFlag = elNinoDjfFlag.multiply(positiveIodJJASFlag);
  var elNinoDjfNegativeIodJJASFlag = elNinoDjfFlag.multiply(negativeIodJJASFlag);
  var laNinaDjfPositiveIodJJASFlag = laNinaDjfFlag.multiply(positiveIodJJASFlag);
  var laNinaDjfNegativeIodJJASFlag = laNinaDjfFlag.multiply(negativeIodJJASFlag);

  return f.set({
    // Rainfall anomalies: mm.
    'rain_jun_anom_mm': rainJunAnom,
    'rain_jul_anom_mm': rainJulAnom,
    'rain_aug_anom_mm': rainAugAnom,
    'rain_sep_anom_mm': rainSepAnom,
    'rain_jjas_anom_mm': rainJJASAnom,

    // Rainfall anomalies: percent.
    'rain_jun_pct_anom': pctAnomaly(rainJun, rainJunMean),
    'rain_jul_pct_anom': pctAnomaly(rainJul, rainJulMean),
    'rain_aug_pct_anom': pctAnomaly(rainAug, rainAugMean),
    'rain_sep_pct_anom': pctAnomaly(rainSep, rainSepMean),
    'rain_jjas_pct_anom': pctAnomaly(rainJJAS, rainJJASMean),

    // Rainfall standardized anomalies.
    'rain_jun_z': zScore(rainJun, rainJunMean, rainJunSd),
    'rain_jul_z': zScore(rainJul, rainJulMean, rainJulSd),
    'rain_aug_z': zScore(rainAug, rainAugMean, rainAugSd),
    'rain_sep_z': zScore(rainSep, rainSepMean, rainSepSd),
    'rain_jjas_z': zScore(rainJJAS, rainJJASMean, rainJJASSd),

    // Niño 3.4 seasonal SST anomalies.
    'nino34_djf_ssta_c': nino34_djf,
    'nino34_mam_ssta_c': nino34_mam,
    'nino34_amj_ssta_c': nino34_amj,
    'nino34_mjj_ssta_c': nino34_mjj,
    'nino34_jja_ssta_c': nino34_jja,
    'nino34_jjas_ssta_c': nino34_jjas,

    // DMI / IOD seasonal values.
    'dmi_mam_ssta_c': dmi_mam,
    'dmi_amj_ssta_c': dmi_amj,
    'dmi_mjj_ssta_c': dmi_mjj,
    'dmi_jja_ssta_c': dmi_jja,
    'dmi_jjas_ssta_c': dmi_jjas,
    'dmi_jas_ssta_c': dmi_jas,
    'dmi_aso_ssta_c': dmi_aso,
    'dmi_son_ssta_c': dmi_son,

    // Phase labels.
    'enso_djf_phase': threePhase(
      nino34_djf,
      ENSO_THRESHOLD_C,
      ENSO_THRESHOLD_C,
      'El_Nino',
      'La_Nina'
    ),

    'enso_jjas_phase': threePhase(
      nino34_jjas,
      ENSO_THRESHOLD_C,
      ENSO_THRESHOLD_C,
      'El_Nino',
      'La_Nina'
    ),

    'iod_jjas_phase': threePhase(
      dmi_jjas,
      IOD_THRESHOLD_C,
      IOD_THRESHOLD_C,
      'Positive_IOD',
      'Negative_IOD'
    ),

    // Binary event flags.
    'el_nino_djf_flag': elNinoDjfFlag,
    'la_nina_djf_flag': laNinaDjfFlag,
    'el_nino_jjas_flag': elNinoJJASFlag,
    'la_nina_jjas_flag': laNinaJJASFlag,
    'positive_iod_jjas_flag': positiveIodJJASFlag,
    'negative_iod_jjas_flag': negativeIodJJASFlag,

    // Combined-event flags.
    'el_nino_djf_positive_iod_jjas_flag': elNinoDjfPositiveIodJJASFlag,
    'el_nino_djf_negative_iod_jjas_flag': elNinoDjfNegativeIodJJASFlag,
    'la_nina_djf_positive_iod_jjas_flag': laNinaDjfPositiveIodJJASFlag,
    'la_nina_djf_negative_iod_jjas_flag': laNinaDjfNegativeIodJJASFlag
  });
});


/***************************************************************
 8. MINIMAL SANITY-CHECK PRINTS ONLY
***************************************************************/

function tableCorrelation(fc, xProperty, yProperty) {
  return ee.Dictionary(
    fc.reduceColumns({
      reducer: ee.Reducer.pearsonsCorrelation(),
      selectors: [xProperty, yProperty]
    })
  ).get('correlation');
}

var sanitySummary = ee.Dictionary({
  'start_year': START_YEAR,
  'end_year': END_YEAR,
  'climatology_start': CLIM_START,
  'climatology_end': CLIM_END,
  'monthly_sst_index_rows': monthlySSTIndex.size(),
  'annual_combined_rows': annualCombined.size(),
  'corr_nino34_djf_vs_jjas_rain_anom': tableCorrelation(
    annualCombined,
    'nino34_djf_ssta_c',
    'rain_jjas_anom_mm'
  ),
  'corr_nino34_jjas_vs_jjas_rain_anom': tableCorrelation(
    annualCombined,
    'nino34_jjas_ssta_c',
    'rain_jjas_anom_mm'
  ),
  'corr_dmi_jjas_vs_jjas_rain_anom': tableCorrelation(
    annualCombined,
    'dmi_jjas_ssta_c',
    'rain_jjas_anom_mm'
  )
});

print('Minimal sanity summary', sanitySummary);

print(
  'First and last annual rows only',
  annualCombined.filter(ee.Filter.inList('year', [START_YEAR, END_YEAR]))
);


/***************************************************************
 9. LIGHT MAP LAYERS, DISABLED BY DEFAULT
***************************************************************/

var jjasClimVis = {
  min: 0,
  max: 2000,
  palette: ['f7fbff', 'c6dbef', '6baed6', '2171b5', '08306b']
};

Map.addLayer(
  jjasRainClimatologyImage.clip(MONSOON_AOI),
  jjasClimVis,
  'JJAS rainfall climatology, mm, 1991–2020',
  false
);


/***************************************************************
 10. OPTIONAL PIXEL-WISE CORRELATION AND TREND MAPS
***************************************************************/

function pixelCorrelationWithJJASRain(indexProperty) {
  var paired = annualRainAnomalyImages.map(function(img) {
    var y = ee.Number(img.get('year'));

    var matchingFeature = ee.Feature(
      annualCombined.filter(ee.Filter.eq('year', y)).first()
    );

    var indexImage = ee.Image
      .constant(ee.Number(matchingFeature.get(indexProperty)))
      .rename(indexProperty)
      .toFloat();

    var rainAnom = img
      .select('rain_jjas_anom_mm')
      .toFloat();

    return indexImage
      .addBands(rainAnom)
      .updateMask(rainAnom.mask())
      .copyProperties(img, ['year', 'system:time_start']);
  });

  return paired
    .select([indexProperty, 'rain_jjas_anom_mm'])
    .reduce(ee.Reducer.pearsonsCorrelation())
    .select('correlation')
    .rename('corr_' + indexProperty + '_rain_jjas_anom');
}

var corrNino34DjfRain = pixelCorrelationWithJJASRain('nino34_djf_ssta_c');
var corrNino34JJASRain = pixelCorrelationWithJJASRain('nino34_jjas_ssta_c');
var corrDmiJJASRain = pixelCorrelationWithJJASRain('dmi_jjas_ssta_c');

var corrVis = {
  min: -0.7,
  max: 0.7,
  palette: ['762a83', 'f7f7f7', '1b7837']
};

Map.addLayer(
  corrNino34DjfRain.clip(MONSOON_AOI),
  corrVis,
  'Pixel corr: Niño 3.4 DJF vs JJAS rainfall anomaly',
  false
);

Map.addLayer(
  corrNino34JJASRain.clip(MONSOON_AOI),
  corrVis,
  'Pixel corr: Niño 3.4 JJAS vs JJAS rainfall anomaly',
  false
);

Map.addLayer(
  corrDmiJJASRain.clip(MONSOON_AOI),
  corrVis,
  'Pixel corr: DMI JJAS vs JJAS rainfall anomaly',
  false
);


// Linear trend in JJAS rainfall, mm per decade.
var trendInput = annualRainImages.map(function(img) {
  var y = ee.Number(img.get('year'));

  var yearImage = ee.Image
    .constant(y)
    .rename('year')
    .toFloat();

  var rain = img
    .select('rain_jjas_mm')
    .rename('rain_jjas_mm')
    .toFloat();

  return yearImage
    .addBands(rain)
    .copyProperties(img, ['year', 'system:time_start']);
});

var jjasRainTrend = trendInput
  .select(['year', 'rain_jjas_mm'])
  .reduce(ee.Reducer.linearFit())
  .select('scale')
  .multiply(10)
  .rename('rain_jjas_trend_mm_per_decade');

var trendVis = {
  min: -100,
  max: 100,
  palette: ['b2182b', 'f7f7f7', '2166ac']
};

Map.addLayer(
  jjasRainTrend.clip(MONSOON_AOI),
  trendVis,
  'JJAS rainfall linear trend, mm/decade',
  false
);


/***************************************************************
 11. CSV EXPORTS
***************************************************************/

var exportPrefix = 'south_asia_enso_iod_monsoon_' +
  START_YEAR + '_' + END_YEAR +
  '_clim_' + CLIM_START + '_' + CLIM_END;

var annualColumns = [
  'year',

  'rain_jun_mm',
  'rain_jul_mm',
  'rain_aug_mm',
  'rain_sep_mm',
  'rain_jjas_mm',

  'rain_jun_anom_mm',
  'rain_jul_anom_mm',
  'rain_aug_anom_mm',
  'rain_sep_anom_mm',
  'rain_jjas_anom_mm',

  'rain_jun_pct_anom',
  'rain_jul_pct_anom',
  'rain_aug_pct_anom',
  'rain_sep_pct_anom',
  'rain_jjas_pct_anom',

  'rain_jun_z',
  'rain_jul_z',
  'rain_aug_z',
  'rain_sep_z',
  'rain_jjas_z',

  'nino34_djf_ssta_c',
  'nino34_mam_ssta_c',
  'nino34_amj_ssta_c',
  'nino34_mjj_ssta_c',
  'nino34_jja_ssta_c',
  'nino34_jjas_ssta_c',

  'dmi_mam_ssta_c',
  'dmi_amj_ssta_c',
  'dmi_mjj_ssta_c',
  'dmi_jja_ssta_c',
  'dmi_jjas_ssta_c',
  'dmi_jas_ssta_c',
  'dmi_aso_ssta_c',
  'dmi_son_ssta_c',

  'enso_djf_phase',
  'enso_jjas_phase',
  'iod_jjas_phase',

  'el_nino_djf_flag',
  'la_nina_djf_flag',
  'el_nino_jjas_flag',
  'la_nina_jjas_flag',
  'positive_iod_jjas_flag',
  'negative_iod_jjas_flag',

  'el_nino_djf_positive_iod_jjas_flag',
  'el_nino_djf_negative_iod_jjas_flag',
  'la_nina_djf_positive_iod_jjas_flag',
  'la_nina_djf_negative_iod_jjas_flag'
];

var monthlySSTColumns = [
  'date_yyyy_mm',
  'year',
  'month',

  'nino34_ssta_c',
  'wtio_ssta_c',
  'setio_ssta_c',
  'dmi_ssta_c',

  'nino34_3mo_centered_ssta_c',
  'dmi_3mo_centered_ssta_c'
];

if (EXPORT_ANNUAL_COMBINED_TABLE) {
  Export.table.toDrive({
    collection: annualCombined.select(annualColumns),
    description: exportPrefix + '_annual_combined_csv',
    folder: EXPORT_FOLDER,
    fileNamePrefix: exportPrefix + '_annual_combined',
    fileFormat: 'CSV',
    selectors: annualColumns
  });
}

if (EXPORT_MONTHLY_SST_INDEX_TABLE) {
  Export.table.toDrive({
    collection: monthlySSTIndex.select(monthlySSTColumns),
    description: exportPrefix + '_monthly_sst_indices_csv',
    folder: EXPORT_FOLDER,
    fileNamePrefix: exportPrefix + '_monthly_sst_indices',
    fileFormat: 'CSV',
    selectors: monthlySSTColumns
  });
}


/***************************************************************
 12. OPTIONAL RASTER EXPORTS
***************************************************************/

if (EXPORT_RASTER_MAPS) {
  Export.image.toDrive({
    image: corrNino34DjfRain.clip(MONSOON_AOI),
    description: exportPrefix + '_corr_nino34_djf_jjas_rain',
    folder: EXPORT_FOLDER,
    fileNamePrefix: exportPrefix + '_corr_nino34_djf_jjas_rain',
    region: MONSOON_AOI,
    scale: RAIN_SCALE_M,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: corrNino34JJASRain.clip(MONSOON_AOI),
    description: exportPrefix + '_corr_nino34_jjas_jjas_rain',
    folder: EXPORT_FOLDER,
    fileNamePrefix: exportPrefix + '_corr_nino34_jjas_jjas_rain',
    region: MONSOON_AOI,
    scale: RAIN_SCALE_M,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: corrDmiJJASRain.clip(MONSOON_AOI),
    description: exportPrefix + '_corr_dmi_jjas_jjas_rain',
    folder: EXPORT_FOLDER,
    fileNamePrefix: exportPrefix + '_corr_dmi_jjas_jjas_rain',
    region: MONSOON_AOI,
    scale: RAIN_SCALE_M,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: jjasRainTrend.clip(MONSOON_AOI),
    description: exportPrefix + '_jjas_rain_trend_mm_per_decade',
    folder: EXPORT_FOLDER,
    fileNamePrefix: exportPrefix + '_jjas_rain_trend_mm_per_decade',
    region: MONSOON_AOI,
    scale: RAIN_SCALE_M,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: jjasRainClimatologyImage.clip(MONSOON_AOI),
    description: exportPrefix + '_jjas_rain_climatology_mm',
    folder: EXPORT_FOLDER,
    fileNamePrefix: exportPrefix + '_jjas_rain_climatology_mm',
    region: MONSOON_AOI,
    scale: RAIN_SCALE_M,
    maxPixels: 1e13
  });
}


/***************************************************************
 13. END
***************************************************************/

// After pressing Run:
// - Check the Console for the small sanity summary.
// - Go to the Tasks tab.
// - Start the CSV exports.
// - Optional raster exports will appear only if EXPORT_RASTER_MAPS = true.