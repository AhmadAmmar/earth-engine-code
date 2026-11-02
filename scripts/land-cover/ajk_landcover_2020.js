/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var roi = ee.FeatureCollection("users/ahmadammargeo/AJK"),
    fc = ee.FeatureCollection("users/ahmadammargeo/AJKTraining"),
    val = ee.FeatureCollection("users/ahmadammargeo/AJKValidation"),
    allPts = ee.FeatureCollection("users/ahmadammargeo/AJKAllPts");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//SENTINEL-1 VV DATA FILTERING
var collectionVV = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(roi)
.select('VV');

//SENTINEL-1 VH DATA FILTERING
var collectionVH = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(roi)
.select('VH');

//SENTINEL-1 DATA MOSAICING AND PREPROCESSING
var SARVV = collectionVV.filterDate('2020-01-01', '2020-12-31').mosaic()
var SARVH = collectionVH.filterDate('2020-01-01', '2020-12-31').mosaic()
var SMOOTHING_RADIUS = 50;
var SARVV_filtered = SARVV.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(roi.geometry());
var SARVH_filtered = SARVH.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(roi.geometry());

//var cld = require('users/fitoprincipe/geetools:cloud_masks')
//function masks2sr(image){
//    var masked = cld.sclMask(['cloud_low', 'cloud_medium', 'cloud_high', 'shadow', 'snow','cirrus'])(image)
//    return masked}

//SENTINEL-2 DATA FILTERING
var collections2sr = ee.ImageCollection('COPERNICUS/S2_SR')
              .filterDate('2020-01-01', '2020-12-31')
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',10))
              .filterBounds(roi.geometry())
//             .map(masks2sr)

//var visualization = { min: 0, max: 3000, bands: ['B4', 'B3', 'B2'], };
//Map.addLayer(comp, visualization, 'RGB');

//SENTINEL-2 DATA MOSAIC AND INDICES
var comp = collections2sr.median().clip(roi.geometry());
var ndvi = comp.normalizedDifference(['B8', 'B4']).rename('NDVI');
var ndsi = comp.normalizedDifference(['B3', 'B11']).rename('NDSI');
var ndwi = comp.normalizedDifference(['B3', 'B8']).rename('NDWI');
var ndbi = comp.normalizedDifference(['B12', 'B8']).rename('NDBI');
var bsi = comp.select('B11').add(comp.select('B4'))
      .subtract(comp.select('B8').add(comp.select('B2')))
          .divide(comp.select('B11').add(comp.select('B4')).add(comp.select('B8')).add(comp.select('B2'))).rename('BSI');

//SELECT IMAGES AND BANDS

//SAR+OPTICAL+INDICES
var opt_sar_ind = comp.addBands(SARVV_filtered).addBands(SARVH_filtered).addBands(ndvi).addBands(ndbi).addBands(bsi).addBands(ndsi).addBands(ndwi)
var bands_opt_sar_ind = ['VH','VV', 'B2', 'B3', 'B4', 'B8', 'B5', 'B6', 'B7', 'B8A', 'B11', 'B12', 'NDVI', 'NDBI', 'BSI', 'NDSI', 'NDWI'];

//OPTICAL+INDICES
//var opt_sar_ind = comp.addBands(ndvi).addBands(ndbi).addBands(bsi).addBands(ndsi).addBands(ndwi)
//var bands_opt_sar_ind = ['B2', 'B3', 'B4', 'B8', 'B5', 'B6', 'B7', 'B8A', 'B11', 'B12', 'NDVI', 'NDBI', 'BSI', 'NDSI', 'NDWI'];

//OPTICAL
//var opt_sar_ind = comp
//var bands_opt_sar_ind = ['B2', 'B3', 'B4', 'B8', 'B5', 'B6', 'B7', 'B8A', 'B11', 'B12'];

//SAR+OPTICAL
//var opt_sar_ind = comp.addBands(SARVV_filtered).addBands(SARVH_filtered)
//var bands_opt_sar_ind = ['VH','VV', 'B2', 'B3', 'B4', 'B8', 'B5', 'B6', 'B7', 'B8A', 'B11', 'B12'];

//INDICES
//var opt_sar_ind = ndvi.addBands(ndbi).addBands(bsi).addBands(ndsi).addBands(ndwi)
//var bands_opt_sar_ind = ['NDVI', 'NDBI', 'BSI', 'NDSI', 'NDWI'];

//SAR+INDICES
//var opt_sar_ind= SARVV_filtered.addBands(SARVH_filtered).addBands(ndvi).addBands(ndbi).addBands(bsi).addBands(ndsi).addBands(ndwi)
//var bands_opt_sar_ind = ['VH','VV', 'NDVI', 'NDBI', 'BSI', 'NDSI', 'NDWI'];

//SAMPLING VALUES FROM IMAGES AGAINST OUR POINTS
var training_opt_sar_ind = opt_sar_ind.select(bands_opt_sar_ind).sampleRegions({
  collection: fc,
  properties: ['Class'],
  tileScale: 16,
  scale: 30 });

//TRAINING CLASSIFIER
var classifier_opt_sar_ind = ee.Classifier.smileRandomForest(50).train({
  features: training_opt_sar_ind, 
  classProperty: 'Class',
  inputProperties: bands_opt_sar_ind 
});

//CLASSIFICATION AND ACCURACY ON TRAINING SET
var classified = opt_sar_ind.select(bands_opt_sar_ind).classify(classifier_opt_sar_ind);
var trainingAccuracy = classifier_opt_sar_ind.confusionMatrix();
print('Training overall accuracy: ', trainingAccuracy.accuracy());
//print('Training kappa value: ', trainingAccuracy.kappa());
//print('Training error matrix: ', trainingAccuracy);
//print('Training consumers accuracy: ', trainingAccuracy.consumersAccuracy());
//print('Training producers accuracy: ', trainingAccuracy.producersAccuracy());

//SAMPLING, CLASSIFICATION AND ACCURACY ON VALIDATION SET

var validation = opt_sar_ind.select(bands_opt_sar_ind).sampleRegions({
  collection: val,
  properties: ['Class'],
  tileScale: 16,
  scale: 30 });

var validated = validation.classify(classifier_opt_sar_ind);
var validationAccuracy = validated.errorMatrix('Class', 'classification');
print('Validation overall accuracy: ', validationAccuracy.accuracy());
//print('Validation kappa value: ', validationAccuracy.kappa());
//print('Validation error matrix: ', validationAccuracy);
//print('Validation consumers accuracy: ', validationAccuracy.consumersAccuracy());
//print('Validation producers accuracy: ', validationAccuracy.producersAccuracy());


//DISPLAY CLASSIFIED IMAGE

//var mask_o = composite.select(0).neq(1000)
//var mask_r = SARVV_filtered.neq(1000)
//var mask = mask_r.updateMask(mask_o)
Map.addLayer(classified,
//.updateMask(mask),/ 
{min: 0, max: 6, palette: ['c0c0c0', 'E49599', 'yellow', 'red', '006400', '00FF00', 'blue']}, 'Optical/SAR/Indices Classification');

//ADD LEGEND

var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

var legendTitle = ui.Label({
  value: 'AJK 2020 Land Cover Classes',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});
legend.add(legendTitle);

var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: '#' + color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });

  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });

  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};
legend.add(makeRow('FF0000', 'Built'));
legend.add(makeRow('FFFF00', 'Bare'));
legend.add(makeRow('0000ff', 'Water'));
legend.add(makeRow('c0c0c0', 'Snow'));
legend.add(makeRow('E49599', 'Agriculture'));
legend.add(makeRow('006400', 'Forest'));
legend.add(makeRow('00FF00', 'Grass'));
Map.add(legend);

/*

//TEST-VALIDATION SPLIT

var sample = training_opt_sar_ind.randomColumn()
var split = 0.7;
var train = sample.filter(ee.Filter.lt('random', split))
var validation = sample.filter(ee.Filter.gte('random', split))

//FEATURE IMPORTANCE

var dict = classifier_opt_sar_ind.explain();

var variable_importance = ee.Feature(null, ee.Dictionary(dict).get('importance'));

var chart =
  ui.Chart.feature.byProperty(variable_importance)
    .setChartType('ColumnChart')
    .setOptions({
      title: 'Random Forest Variable Importance',
      legend: {position: 'none'},
      hAxis: {title: 'Bands'},
      vAxis: {title: 'Importance'}
    });

print(chart);

//HYPERPARAMETERIZATION

var numTrees = ee.List.sequence(1, 9, 3);

var accuracies = numTrees.map(function(t) {
  var classifier = ee.Classifier.smileRandomForest(t)
    .train({
      features: training_opt_sar_ind, 
      classProperty: 'Class', 
      inputProperties: bands_opt_sar_ind
    });
  return training_opt_sar_ind
    .classify(classifier)
    .errorMatrix('Class', 'classification')
    .accuracy();
});

print(ui.Chart.array.values({
  array: ee.Array(accuracies), 
  axis: 0, 
  xLabels: numTrees
}));

//AREA PER CLASS

var stats = ee.Image.pixelArea().multiply(0.0000001).addBands(classified).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: roi,
  maxPixels: 1e13,
  scale: 30
});
print('Area per class: ', stats);

var options = {
  title: 'Land cover area - AJK',
  fontSize: 20,
  hAxis: {title: ''},
  vAxis: {title: 'Area sq.km '},
  series: {
    0: {color: 'silver'},
    1: {color: '90EE90'},
    2: {color: 'yellow'},
    3: {color: 'red'},
    4: {color: '006400'},
    5: {color: '008000'},
    6: {color: 'blue'},
  }};
  
var areaChart = ui.Chart.image.byClass({
  image: ee.Image.pixelArea().multiply(0.0000001).addBands(classified), 
  classBand: 'classification', 
  region: roi,
  reducer: ee.Reducer.sum(),
  scale: 30
}).setSeriesNames(['Snow', 'Agriculture', 'Bare', 'Built', 'Forest', 'Grass', 'Water'])
    .setOptions(options);
print(areaChart);

*/