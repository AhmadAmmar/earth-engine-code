/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var roi = ee.FeatureCollection("users/ahmadammargeo/AJK"),
    fc = ee.FeatureCollection("users/ahmadammargeo/AJKPts");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
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

var SARVV = collectionVV.filterDate('2020-01-01', '2020-12-31').mosaic()
var SARVH = collectionVH.filterDate('2020-01-01', '2020-12-31').mosaic()
var SMOOTHING_RADIUS = 50;
var SARVV_filtered = SARVV.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(roi.geometry());
var SARVH_filtered = SARVH.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(roi.geometry());

//var cld = require('users/fitoprincipe/geetools:cloud_masks')
//function masks2sr(image){
//    var masked = cld.sclMask(['cloud_low', 'cloud_medium', 'cloud_high', 'shadow', 'snow','cirrus'])(image)
//    return masked}

var collections2sr = ee.ImageCollection('COPERNICUS/S2_SR')
              .filterDate('2020-01-01', '2020-12-31')
             .filterBounds(roi.geometry())
//             .filterMetadata('CLOUD_COVERAGE_ASSESSMENT', 'greater_than', 50)
//             .map(masks2sr)

var comp = collections2sr.mean().clip(roi.geometry());
//var ndvi = comp.normalizedDifference(['B8', 'B4']).rename('NDVI');
//var ndsi = comp.normalizedDifference(['B3', 'B11']).rename('NDSI');
//var mndwi = comp.normalizedDifference(['B3', 'B11']).rename('MNDWI');
//var ndbi = comp.normalizedDifference(['B12', 'B8']).rename('NDBI');
//var ndsi1 = comp.normalizedDifference(['B3', 'B11']).rename('Class');
//var bsi = comp.select('B11').add(comp.select('B4'))
//      .subtract(comp.select('B8').add(comp.select('B2')))
//          .divide(comp.select('B11').add(comp.select('B4')).add(comp.select('B8')).add(comp.select('B2'))).rename('BSI');

var composite = ee.Image.cat(comp)//,ndvi,ndsi,mndwi,ndbi,bsi);
//var snowThreshold = 0.42;
//var ndsi_th = ndsi1.gt(snowThreshold);
//var myndsi = ndsi_th.updateMask(ndsi_th)
//var ndsiConst = myndsi.where(myndsi, ee.Number(0))

//var sample = fc.randomColumn()
//var split = 0.7;
//var newfc = sample.filter(ee.Filter.lt('random', split))
//var validation = sample.filter(ee.Filter.gte('random', split))

/*

var final = ee.Image.cat(SARVV_filtered,SARVH_filtered);
var bands = ['VH','VV'];
var training = final.select(bands).sampleRegions({
  collection: fc,
  properties: ['Class'],
  tileScale: 16,
  scale: 10 });
  
var classifier = ee.Classifier.smileRandomForest(100).train({
  features: training,
  classProperty: 'Class',
  inputProperties: bands
});

var classified = final.select(bands).classify(classifier);

Map.addLayer(classified, 
{min: 1, max: 8, palette: ['90EE90', 'yellow', 'red', '006400', '008000', 'black', 'blue', 'white']},
'SAR Classification');

print('RF- SAR error matrix: ', classifier.confusionMatrix());
print('RF- SAR accuracy: ', classifier.confusionMatrix().accuracy());

//Repeat for Landsat
//Define the Landsat bands to train your data
var bandss2 = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7','NDVI' ];
var trainings2 = composite.select(bandss2).sampleRegions({
  collection: newfc,
  properties: ['Class'],
  tileScale: 16,
  scale: 10
});

//Train the classifier
var classifiers2 = ee.Classifier.smileRandomForest(100).train({
  features: trainings2,
  classProperty: 'Class',
  inputProperties: bandss2
});

//Run the Classification
var classifieds2 = composite.select(bandss2).classify(classifiers2);

//Display the Classification
Map.addLayer(classifieds2, 
{min: 1, max: 8, palette: ['90EE90', 'yellow', 'red', '006400', '008000', 'black', 'blue', 'white']},
'Optical Classification');

// Create a confusion matrix representing resubstitution accuracy.
print('RF-s2 error matrix: ', classifiers2.confusionMatrix());
print('RF-s2 accuracy: ', classifiers2.confusionMatrix().accuracy());

*/

//Define both optical and SAR to train your data
var opt_sar = ee.Image.cat(composite, SARVV_filtered,SARVH_filtered);
var bands_opt_sar = ['VH','VV', 'B2', 'B3', 'B4', 'B8']//, 'B8A', 'B11', 'B12', 'B5', 'B6', 'B7', 'NDVI', 'NDSI', 'MNDWI', 'NDBI', 'BSI'];
var training_opt_sar = opt_sar.select(bands_opt_sar).sampleRegions({
  collection: fc,
  properties: ['Class'],
//  tileScale: 8,
  scale: 10 });

//Train the classifier
var classifier_opt_sar = ee.Classifier.smileRandomForest(1).train({
  features: training_opt_sar, 
  classProperty: 'Class',
  inputProperties: bands_opt_sar 
});

//Run the Classification
var classifiedboth = opt_sar.select(bands_opt_sar).classify(classifier_opt_sar);

//Display the Classification
//var mask_o = composite.select(0).neq(1000)
//var mask_r = SARVV_filtered.neq(1000)
//var mask = mask_r.updateMask(mask_o)
Map.addLayer(classifiedboth,
//.updateMask(mask), 
{min: 0, max: 7, palette: ['white', '90EE90', 'yellow', 'red', '006400', '008000', 'black', 'blue']},
'Optical/SAR Classification');

// Create a confusion matrix representing resubstitution accuracy.
print('RF-Opt/SAR error matrix: ', classifier_opt_sar.confusionMatrix());
print('RF-Opt/SAR accuracy: ', classifier_opt_sar.confusionMatrix().accuracy());