/**** SOUTH ASIA 2026 HEAT-SEVERITY MAP
 *    WITH USER J&K / GB BOUNDARY ASSET
 *
 * Main map:
 *   2026 mean daily Tmax anomaly, °C
 *   relative to 1991–2020 mean daily Tmax for the same calendar window.
 *
 * Dataset:
 *   ECMWF/ERA5_LAND/DAILY_AGGR
 *   Band:
 *   temperature_2m_max, Kelvin → °C
 *
 * Boundary:
 *   Afghanistan, Pakistan, India, Nepal, Bhutan,
 *   Bangladesh, Sri Lanka, Maldives
 *   PLUS user boundary asset:
 *   users/ahmadammargeo/AJKLULC/AJK
 *
 * Visual rule:
 *   South Asia is dissolved into one geometry.
 *   No internal country borders are drawn.
 *
 * Boundary note:
 *   The custom J&K / GB asset is used only for inclusive climate-raster
 *   coverage and cartographic masking. It is not a sovereignty statement.
 ****/


// =====================================================
// 1. USER SETTINGS
// =====================================================

var HEATWAVE_YEAR = 2026;

// Edit this heatwave / hot-season window.
// End date is exclusive.
// Example below = 15 April 2026 through 19 June 2026.
var START_MONTH = 4;
var START_DAY   = 15;

var END_MONTH   = 6;
var END_DAY     = 20;

// Historical climate-normal baseline.
var BASELINE_START_YEAR = 1991;
var BASELINE_END_YEAR   = 2020;

// Export options.
var EXPORT_TO_DRIVE = true;
var EXPORT_FOLDER = 'GEE_Climate_Exports';
var EXPORT_SCALE_METRES = 11132;

// Keep false first. Turn true only after the main map renders/exports.
var COMPUTE_P95_EXCEEDANCE = false;

// Optional regional stats can be expensive.
var PRINT_REGIONAL_STATS = false;


// =====================================================
// 2. CLEAN BASEMAP WITH NO COUNTRY BORDERS
// =====================================================

var noBorderStyle = [
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{visibility: 'off'}]
  },
  {
    featureType: 'administrative',
    elementType: 'labels',
    stylers: [{visibility: 'off'}]
  },
  {
    featureType: 'road',
    stylers: [{visibility: 'off'}]
  },
  {
    featureType: 'poi',
    stylers: [{visibility: 'off'}]
  },
  {
    featureType: 'transit',
    stylers: [{visibility: 'off'}]
  },
  {
    featureType: 'water',
    elementType: 'geometry.fill',
    stylers: [{color: '#d7eef8'}]
  },
  {
    featureType: 'landscape',
    elementType: 'geometry.fill',
    stylers: [{color: '#f7f7f7'}]
  }
];

Map.setOptions('NoBorders', {'NoBorders': noBorderStyle});


// =====================================================
// 3. SOUTH ASIA DISSOLVED BOUNDARY
//    PLUS USER J&K / GB BOUNDARY ASSET
// =====================================================

var countryNames = [
  'Afghanistan',
  'Bangladesh',
  'Bhutan',
  'India',
  'Maldives',
  'Nepal',
  'Pakistan',
  'Sri Lanka'
];

var admin0 = ee.FeatureCollection('FAO/GAUL/2015/level0');

var southAsiaCountries = admin0.filter(
  ee.Filter.inList('ADM0_NAME', countryNames)
);

print(
  'Selected South Asian countries:',
  southAsiaCountries.aggregate_array('ADM0_NAME')
);

// Your custom J&K / GB boundary asset.
var jkGbBoundary = ee.FeatureCollection('users/ahmadammargeo/AJKLULC/AJK');

print('Custom J&K / GB boundary feature count:', jkGbBoundary.size());

// Dissolve country geometries.
var southAsiaBaseGeom = southAsiaCountries
  .union(1000)
  .geometry();

// Dissolve your custom J&K / GB boundary.
var jkGbGeom = jkGbBoundary
  .union(1000)
  .geometry();

// Final inclusive South Asia geometry.
var southAsiaGeom = southAsiaBaseGeom
  .union(jkGbGeom, 1000);

// Simplified geometry for display outline only.
// The actual mask/export still uses southAsiaGeom.
var southAsiaOutlineGeom = southAsiaGeom.simplify(1000);

var southAsiaOutline = ee.FeatureCollection([
  ee.Feature(southAsiaOutlineGeom, {
    'name': 'South Asia dissolved outline including user J&K / GB asset'
  })
]);

// Raster mask so the climate layer only appears inside final South Asia geometry.
var southAsiaMask = ee.Image.constant(1)
  .clip(southAsiaGeom)
  .selfMask();

// Rectangular export region is safer than exporting with a complex polygon.
var exportRegion = southAsiaGeom.bounds(1000);

Map.centerObject(southAsiaOutline, 4);


// =====================================================
// 4. DATE-WINDOW FILTER
// =====================================================

// This assumes the selected window does not cross New Year.
// For Apr–Jun heatwaves, this is fine.
var windowFilter = ee.Filter.or(
  ee.Filter.and(
    ee.Filter.eq('month', START_MONTH),
    ee.Filter.gte('day', START_DAY)
  ),
  ee.Filter.and(
    ee.Filter.gt('month', START_MONTH),
    ee.Filter.lt('month', END_MONTH)
  ),
  ee.Filter.and(
    ee.Filter.eq('month', END_MONTH),
    ee.Filter.lt('day', END_DAY)
  )
);


// =====================================================
// 5. ERA5-LAND DAILY TMAX, CONVERTED TO °C
// =====================================================

var eraDailyTmax = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
  .select('temperature_2m_max')
  .filterBounds(southAsiaGeom)
  .map(function(img) {
    var d = ee.Date(img.get('system:time_start'));

    return img
      .subtract(273.15)
      .rename('tmax_c')
      .copyProperties(img, ['system:time_start'])
      .set('year', d.get('year'))
      .set('month', d.get('month'))
      .set('day', d.get('day'));
  });


// =====================================================
// 6. 2026 HEATWAVE WINDOW
// =====================================================

var heat2026 = eraDailyTmax
  .filter(ee.Filter.eq('year', HEATWAVE_YEAR))
  .filter(windowFilter);

print(
  '2026 daily images in selected window:',
  heat2026.size()
);

var meanTmax2026 = heat2026
  .mean()
  .rename('mean_daily_tmax_2026_c');

var maxTmax2026 = heat2026
  .max()
  .rename('max_daily_tmax_2026_c');

var daysOver40 = heat2026
  .map(function(img) {
    return img.gte(40)
      .rename('days_over_40_c')
      .uint8();
  })
  .sum()
  .rename('days_over_40_c');

var daysOver45 = heat2026
  .map(function(img) {
    return img.gte(45)
      .rename('days_over_45_c')
      .uint8();
  })
  .sum()
  .rename('days_over_45_c');


// =====================================================
// 7. 1991–2020 BASELINE, SAME CALENDAR WINDOW
// =====================================================

var baselineWindow = eraDailyTmax
  .filter(ee.Filter.gte('year', BASELINE_START_YEAR))
  .filter(ee.Filter.lte('year', BASELINE_END_YEAR))
  .filter(windowFilter);

print(
  'Baseline daily images in selected window:',
  baselineWindow.size()
);

// Baseline mean daily Tmax for same calendar window.
var baselineMeanTmax = baselineWindow
  .mean()
  .rename('baseline_1991_2020_mean_daily_tmax_c');

// Annual period means, used for baseline SD and z-score.
var baselineYears = ee.List.sequence(
  BASELINE_START_YEAR,
  BASELINE_END_YEAR
);

var baselineAnnualMeans = ee.ImageCollection.fromImages(
  baselineYears.map(function(y) {
    y = ee.Number(y);

    var thisYear = eraDailyTmax
      .filter(ee.Filter.eq('year', y))
      .filter(windowFilter);

    return thisYear
      .mean()
      .rename('annual_mean_daily_tmax_c')
      .set('year', y);
  })
);

var baselineSdAnnualMeanTmax = baselineAnnualMeans
  .reduce(ee.Reducer.stdDev())
  .rename('baseline_1991_2020_sd_annual_mean_daily_tmax_c');


// =====================================================
// 8. MAIN ANOMALY PRODUCTS
// =====================================================

var meanTmaxAnomaly2026 = meanTmax2026
  .subtract(baselineMeanTmax)
  .rename('mean_daily_tmax_anomaly_2026_vs_1991_2020_c');

var zScore2026 = meanTmaxAnomaly2026
  .divide(baselineSdAnnualMeanTmax)
  .rename('z_score_2026_vs_1991_2020');


// =====================================================
// 9. OPTIONAL P95 HOT-DAY EXCEEDANCE
// =====================================================

if (COMPUTE_P95_EXCEEDANCE) {

  var baselineP95DailyTmax = baselineWindow
    .reduce(ee.Reducer.percentile([95]))
    .rename('baseline_1991_2020_p95_daily_tmax_c');

  var daysAboveBaselineP95 = heat2026
    .map(function(img) {
      return img
        .gt(baselineP95DailyTmax)
        .rename('days_above_baseline_p95')
        .uint8();
    })
    .sum()
    .rename('days_above_baseline_p95');
}


// =====================================================
// 10. VISUALISATION PALETTES
// =====================================================

var anomalyPalette = [
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
];

var hotPalette = [
  'ffffcc',
  'ffeda0',
  'fed976',
  'feb24c',
  'fd8d3c',
  'fc4e2a',
  'e31a1c',
  'bd0026',
  '800026'
];

var zPalette = [
  '2c7bb6',
  'abd9e9',
  'ffffbf',
  'fdae61',
  'd7191c'
];

var anomalyVis = {
  min: -3,
  max: 8,
  palette: anomalyPalette
};

var tmaxVis = {
  min: 25,
  max: 48,
  palette: hotPalette
};

var maxTmaxVis = {
  min: 35,
  max: 55,
  palette: hotPalette
};

var days40Vis = {
  min: 0,
  max: 60,
  palette: hotPalette
};

var days45Vis = {
  min: 0,
  max: 35,
  palette: hotPalette
};

var zVis = {
  min: -2,
  max: 4,
  palette: zPalette
};


// =====================================================
// 11. MAP LAYERS
// =====================================================

// Main public-facing layer.
Map.addLayer(
  meanTmaxAnomaly2026.updateMask(southAsiaMask),
  anomalyVis,
  'MAIN: 2026 mean daily Tmax anomaly vs 1991–2020, °C',
  true
);

// Supporting layers.
Map.addLayer(
  meanTmax2026.updateMask(southAsiaMask),
  tmaxVis,
  '2026 mean daily Tmax, °C',
  false
);

Map.addLayer(
  baselineMeanTmax.updateMask(southAsiaMask),
  tmaxVis,
  '1991–2020 baseline mean daily Tmax, °C',
  false
);

Map.addLayer(
  maxTmax2026.updateMask(southAsiaMask),
  maxTmaxVis,
  '2026 maximum daily Tmax in selected period, °C',
  false
);

Map.addLayer(
  daysOver40.updateMask(southAsiaMask),
  days40Vis,
  '2026 days with Tmax ≥ 40°C',
  false
);

Map.addLayer(
  daysOver45.updateMask(southAsiaMask),
  days45Vis,
  '2026 days with Tmax ≥ 45°C',
  false
);

Map.addLayer(
  zScore2026.updateMask(southAsiaMask),
  zVis,
  '2026 anomaly z-score vs 1991–2020 annual-window variability',
  false
);

if (COMPUTE_P95_EXCEEDANCE) {
  Map.addLayer(
    daysAboveBaselineP95.updateMask(southAsiaMask),
    days40Vis,
    '2026 days above 1991–2020 P95 daily Tmax',
    false
  );
}

// Draw only the final outer South Asia outline.
// This does not draw internal country borders or internal J&K/GB lines.
var outlineImage = ee.Image()
  .byte()
  .paint({
    featureCollection: southAsiaOutline,
    color: 1,
    width: 2
  })
  .selfMask();

Map.addLayer(
  outlineImage,
  {palette: ['111111']},
  'South Asia outer boundary only',
  true
);


// =====================================================
// 12. SIMPLE LEGEND
// =====================================================

function addContinuousLegend(title, palette, min, max, position) {
  var legend = ui.Panel({
    style: {
      position: position,
      padding: '8px 12px',
      backgroundColor: 'rgba(255, 255, 255, 0.90)'
    }
  });

  legend.add(ui.Label({
    value: title,
    style: {
      fontWeight: 'bold',
      fontSize: '12px',
      margin: '0 0 6px 0'
    }
  }));

  var lon = ee.Image.pixelLonLat().select('longitude');

  var gradient = lon
    .subtract(0)
    .divide(100)
    .multiply(max - min)
    .add(min);

  var legendImage = gradient.visualize({
    min: min,
    max: max,
    palette: palette
  });

  var thumbnail = ui.Thumbnail({
    image: legendImage,
    params: {
      bbox: [0, 0, 100, 10],
      dimensions: '260x16'
    },
    style: {
      stretch: 'horizontal',
      margin: '0 0 4px 0'
    }
  });

  var labels = ui.Panel({
    widgets: [
      ui.Label(String(min), {fontSize: '11px'}),
      ui.Label(String((min + max) / 2), {
        fontSize: '11px',
        textAlign: 'center',
        stretch: 'horizontal'
      }),
      ui.Label(String(max), {fontSize: '11px'})
    ],
    layout: ui.Panel.Layout.flow('horizontal')
  });

  legend.add(thumbnail);
  legend.add(labels);

  Map.add(legend);
}

addContinuousLegend(
  '2026 mean daily Tmax anomaly vs 1991–2020, °C',
  anomalyPalette,
  -3,
  8,
  'bottom-left'
);


// =====================================================
// 13. TITLE PANEL
// =====================================================

var titlePanel = ui.Panel({
  style: {
    position: 'top-center',
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 255, 255, 0.90)'
  }
});

titlePanel.add(ui.Label({
  value: 'South Asia 2026 Heat Severity',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0'
  }
}));

titlePanel.add(ui.Label({
  value: 'Mean daily maximum 2 m air temperature anomaly relative to 1991–2020 baseline; South Asia dissolved into one outer boundary, using custom J&K / GB boundary asset and no internal borders',
  style: {
    fontSize: '12px',
    margin: '0'
  }
}));

Map.add(titlePanel);


// =====================================================
// 14. OPTIONAL REGIONAL STATS
// =====================================================

if (PRINT_REGIONAL_STATS) {

  var summaryImage = ee.Image.cat([
    meanTmax2026,
    baselineMeanTmax,
    meanTmaxAnomaly2026,
    zScore2026,
    maxTmax2026,
    daysOver40,
    daysOver45
  ]);

  var regionalStats = summaryImage.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: southAsiaGeom,
    scale: 25000,
    maxPixels: 1e13,
    bestEffort: true,
    tileScale: 4
  });

  print('Regional mean stats:', regionalStats);
}


// =====================================================
// 15. EXPORTS
// =====================================================

if (EXPORT_TO_DRIVE) {

  Export.image.toDrive({
    image: meanTmaxAnomaly2026
      .updateMask(southAsiaMask)
      .toFloat(),
    description: 'South_Asia_Heatwave_2026_Mean_Tmax_Anomaly_vs_1991_2020',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'south_asia_heatwave_2026_mean_tmax_anomaly_vs_1991_2020',
    region: exportRegion,
    scale: EXPORT_SCALE_METRES,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: meanTmax2026
      .updateMask(southAsiaMask)
      .toFloat(),
    description: 'South_Asia_Heatwave_2026_Mean_Tmax_C',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'south_asia_heatwave_2026_mean_tmax_c',
    region: exportRegion,
    scale: EXPORT_SCALE_METRES,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: baselineMeanTmax
      .updateMask(southAsiaMask)
      .toFloat(),
    description: 'South_Asia_1991_2020_Baseline_Mean_Tmax_C',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'south_asia_1991_2020_baseline_mean_tmax_c',
    region: exportRegion,
    scale: EXPORT_SCALE_METRES,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: maxTmax2026
      .updateMask(southAsiaMask)
      .toFloat(),
    description: 'South_Asia_Heatwave_2026_Max_Daily_Tmax_C',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'south_asia_heatwave_2026_max_daily_tmax_c',
    region: exportRegion,
    scale: EXPORT_SCALE_METRES,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: daysOver40
      .updateMask(southAsiaMask)
      .toUint8(),
    description: 'South_Asia_Heatwave_2026_Days_Over_40C',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'south_asia_heatwave_2026_days_over_40c',
    region: exportRegion,
    scale: EXPORT_SCALE_METRES,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: daysOver45
      .updateMask(southAsiaMask)
      .toUint8(),
    description: 'South_Asia_Heatwave_2026_Days_Over_45C',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'south_asia_heatwave_2026_days_over_45c',
    region: exportRegion,
    scale: EXPORT_SCALE_METRES,
    maxPixels: 1e13
  });

  if (COMPUTE_P95_EXCEEDANCE) {
    Export.image.toDrive({
      image: daysAboveBaselineP95
        .updateMask(southAsiaMask)
        .toUint8(),
      description: 'South_Asia_Heatwave_2026_Days_Above_Baseline_P95',
      folder: EXPORT_FOLDER,
      fileNamePrefix: 'south_asia_heatwave_2026_days_above_1991_2020_p95',
      region: exportRegion,
      scale: EXPORT_SCALE_METRES,
      maxPixels: 1e13
    });
  }
}