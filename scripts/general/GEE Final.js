/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var roi = ee.FeatureCollection("users/ahmadammargeo/AJK"),
    agriculture = ee.FeatureCollection("users/ahmadammargeo/AJKAgriculture"),
    bare = ee.FeatureCollection("users/ahmadammargeo/AJKBare"),
    built = ee.FeatureCollection("users/ahmadammargeo/AJKBuilt"),
    forest = ee.FeatureCollection("users/ahmadammargeo/AJKForest"),
    grass = ee.FeatureCollection("users/ahmadammargeo/AJKGrass"),
    road = ee.FeatureCollection("users/ahmadammargeo/AJKRoad"),
    water = ee.FeatureCollection("users/ahmadammargeo/AJKWater");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var cld = require('users/fitoprincipe/geetools:cloud_masks')
function masks2sr(image){
    var masked = cld.sclMask(['cloud_low', 'cloud_medium', 'cloud_high', 'shadow', 'snow','cirrus'])(image)
    return masked
  }

var collections2sr = ee.ImageCollection('COPERNICUS/S2_SR')
              .filterDate('2019-01-01', '2019-12-31')
             .filterBounds(roi)
             .filterMetadata('CLOUD_COVERAGE_ASSESSMENT', 'greater_than', 50)
             .map(masks2sr)

var comp = collections2sr.mean().clip(roi.geometry());
var ndvi = comp.normalizedDifference(['B8', 'B4']).rename('NDVI');
var composite = ee.Image.cat(comp,ndvi);

var collectionVV = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(roi)
.select('VV');

var collectionVH = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(roi)
.select('VH');

var SARVV = collectionVV.filterDate('2019-01-01', '2019-12-31').mosaic().clip(roi.geometry()).mask(composite.select('NDVI'));
var SARVH = collectionVH.filterDate('2019-01-01', '2019-12-31').mosaic().clip(roi.geometry()).mask(composite.select('NDVI'));
var SMOOTHING_RADIUS = 50;
var SARVV_filtered = SARVV.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters')
var SARVH_filtered = SARVH.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters')

var fc = agriculture.merge(bare).merge(built).merge(forest).merge(grass).merge(road).merge(water);

var sample = fc.randomColumn()
var split = 0.3;
var newfc = sample.filter(ee.Filter.lt('random', split))
var validation = sample.filter(ee.Filter.gte('random', split))

var final = ee.Image.cat(SARVV_filtered,SARVH_filtered);
var bands = ['VH','VV'];
var training = final.select(bands).sampleRegions({
  collection: fc,
  properties: ['Class'],
  tileScale: 16,
  scale: 30 });
  
var classifier = ee.Classifier.randomForest(1).train({
  features: training,
  classProperty: 'Class',
  inputProperties: bands
});

var classified = final.select(bands).classify(classifier);

Map.addLayer(classified, 
{min: 1, max: 7, palette: ['90EE90', 'FFFF00', 'FF0000', '006400', '008000', '000000', '0000ff']},
'SAR Classification');

print('RF- SAR error matrix: ', classifier.confusionMatrix());
print('RF- SAR accuracy: ', classifier.confusionMatrix().accuracy());

/*

//Repeat for Landsat
//Define the Landsat bands to train your data
var bandss2 = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7','NDVI' ];
var trainings2 = composite.select(bandss2).sampleRegions({
  collection: newfc,
  properties: ['Class'],
  scale: 30
});

//Train the classifier
var classifiers2 = ee.Classifier.smileRandomForest().train({
  features: trainings2,
  classProperty: 'Class',
  inputProperties: bandss2
});

//Run the Classification
var classifieds2 = composite.select(bandss2).classify(classifiers2);

//Display the Classification
Map.addLayer(classifieds2, 
{min: 1, max: 7, palette: ['90EE90', 'FFFF00', 'FF0000', '006400', '008000', '000000', '0000ff']},
'Optical Classification');

// Create a confusion matrix representing resubstitution accuracy.
print('RF-s2 error matrix: ', classifiers2.confusionMatrix());
print('RF-s2 accuracy: ', classifiers2.confusionMatrix().accuracy());

//Define both optical and SAR to train your data
var opt_sar = ee.Image.cat(composite, SARVV_filtered,SARVH_filtered);
var bands_opt_sar = ['VH','VV','B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7','NDVI'];
var training_opt_sar = opt_sar.select(bands_opt_sar).sampleRegions({
  collection: newfc,
  properties: ['Class'],
  scale: 30 });

//Train the classifier
var classifier_opt_sar = ee.Classifier.smileRandomForest().train({
  features: training_opt_sar, 
  classProperty: 'Class',
  inputProperties: bands_opt_sar 
});

//Run the Classification
var classifiedboth = opt_sar.select(bands_opt_sar).classify(classifier_opt_sar);

//Display the Classification
var mask_o = composite.select(0).neq(1000)
var mask_r = SARVV_filtered.neq(1000)
var mask = mask_r.updateMask(mask_o)
Map.addLayer(classifiedboth.updateMask(mask), 
{min: 1, max: 7, palette: ['90EE90', 'FFFF00', 'FF0000', '006400', '008000', '000000', '0000ff']},
'Optical/SAR Classification');

// Create a confusion matrix representing resubstitution accuracy.
print('RF-Opt/SAR error matrix: ', classifier_opt_sar.confusionMatrix());
print('RF-Opt/SAR accuracy: ', classifier_opt_sar.confusionMatrix().accuracy());

*/