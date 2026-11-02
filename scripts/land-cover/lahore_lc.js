var adminBoundaries = ee.FeatureCollection('projects/ee-ahmadammargeo/assets/pk2');
var roi = adminBoundaries.filter(ee.Filter.eq('ADM2_EN', 'Lahore'));

var startDate = '2025-01-01';
var endDate = '2025-03-03';

var cloudmask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
  .map(cloudmask())
  .map(function(image) { return image.divide(10000); });

var s2Bands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'];
var s2Median = s2.select(s2Bands).median().clip(roi);

//Map.addLayer(s2Median, {bands: ['B4', 'B3', 'B2'], min: 0, max: 1, gamma: 1.4}, 'Sentinel-2 RGB');

var NDVI = s2Median.normalizedDifference(['B8', 'B4']).rename('NDVI');
var NDBI = s2Median.normalizedDifference(['B11', 'B8']).rename('NDBI');
var MNDWI = s2Median.normalizedDifference(['B3', 'B11']).rename('MNDWI');
var BSI = s2Median.expression(
    '(B11 + B4 - (B8 + B2)) / (B11 + B4 + B8 + B2)', {
      'B11': s2Median.select('B11'),
      'B4': s2Median.select('B4'),
      'B8': s2Median.select('B8'),
      'B2': s2Median.select('B2')
}).rename('BSI');

//Map.addLayer(NDVI, {min: -1, max: 1, palette: ['red', 'yellow', 'green']}, 'NDVI');
//Map.addLayer(NDBI, {min: -1, max: 1, palette: ['blue', 'gray', 'red']}, 'NDBI');
//Map.addLayer(BSI, {min: -1, max: 1, palette: ['black', 'brown', 'yellow']}, 'BSI');
//Map.addLayer(MNDWI, {min: -1, max: 1, palette: ['white', 'blue']}, 'MNDWI');

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterDate(startDate, endDate)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
  .filterMetadata('resolution_meters', 'equals', 10)
  .filterBounds(roi);

var VV = s1.select('VV').median().focal_mean(10, 'circle', 'meters').clip(roi).rename('VV');
var VH = s1.select('VH').median().focal_mean(10, 'circle', 'meters').clip(roi).rename('VH');

//Map.addLayer(VV, {min: -30, max: 0, palette: ['black', 'white']}, 'SAR VV');
//Map.addLayer(VH, {min: -30, max: 0, palette: ['black', 'white']}, 'SAR VH');

var RVI = VH.multiply(4).divide(VV.add(VH)).rename('RVI');
var RBI = VV.divide(VH).rename('RBI');
//var SAR_Water = VH.divide(VV).lt(0.4).rename('SAR_Water');
var SAR_Bare = VV.subtract(VH).rename('SAR_Bare');

Map.addLayer(RBI, {min: 0, max: 10, palette: ['white', 'red']}, 'RBI');
Map.addLayer(RVI, {min: 0, max: 1, palette: ['black', 'green']}, 'RVI');
//Map.addLayer(SAR_Water, {min: 0, max: 1, palette: ['blue']}, 'SAR Water Mask');
Map.addLayer(SAR_Bare, {min: 0, max: 10, palette: ['yellow']}, 'SAR Bare');

// var thresholdedNDVI = NDVI.gt(0.4).rename('NDVI_Threshold');
// var thresholdedNDBI = NDBI.gt(0.1).rename('NDBI_Threshold');
// var thresholdedMNDWI = MNDWI.gt(0.2).rename('MNDWI_Threshold');
// var thresholdedBSI = BSI.gt(0.15).rename('BSI_Threshold');
// var thresholdedRVI = RVI.gt(0.3).rename('RVI_Threshold');
// var thresholdedRBI = RBI.gt(2).rename('RBI_Threshold');
// var thresholdedSAR_Water = SAR_Water.eq(1).rename('SAR_Water_Threshold');
// var thresholdedSAR_Bare = SAR_Bare.gt(2).rename('SAR_Bare_Threshold');

// Map.addLayer(thresholdedNDVI.updateMask(thresholdedNDVI), {palette: ['green']}, 'NDVI Threshold');
// Map.addLayer(thresholdedNDBI.updateMask(thresholdedNDBI), {palette: ['red']}, 'NDBI Threshold');
// Map.addLayer(thresholdedMNDWI.updateMask(thresholdedMNDWI), {palette: ['blue']}, 'MNDWI Threshold');
// Map.addLayer(thresholdedBSI.updateMask(thresholdedBSI), {palette: ['yellow']}, 'BSI Threshold');
// Map.addLayer(thresholdedRVI.updateMask(thresholdedRVI), {palette: ['black']}, 'RVI Threshold');
// Map.addLayer(thresholdedRBI.updateMask(thresholdedRBI), {palette: ['orange']}, 'RBI Threshold');
// Map.addLayer(thresholdedSAR_Water.updateMask(thresholdedSAR_Water), {palette: ['cyan']}, 'SAR Water Threshold');
// Map.addLayer(thresholdedSAR_Bare.updateMask(thresholdedSAR_Bare), {palette: ['brown']}, 'SAR Bare Threshold');

var thresholded_composite = s2Median.addBands([NDVI, NDBI, BSI, MNDWI, VV, VH, RBI, RVI, SAR_Bare]);
//, RVI, SAR_Water, SAR_Bare, thresholdedRVI, thresholdedRBI, thresholdedSAR_Water, thresholdedSAR_Bare

var training = thresholded_composite.sample({region: roi,scale: 10,numPixels: 5000,seed: 1});
var clusterer = ee.Clusterer.wekaKMeans(4).train(training);
var classified = thresholded_composite.cluster(clusterer).clip(roi);
var cluster_palette = ['red', 'blue', 'yellow', 'green'];
//Map.addLayer(classified, {min: 0, max: 3, palette: cluster_palette}, 'Thresholded Clustering');
