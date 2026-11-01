// Load Lahore Boundary
var adminBoundaries = ee.FeatureCollection('projects/ee-ahmadammargeo/assets/pk2');
var roi = adminBoundaries.filter(ee.Filter.eq('ADM2_EN', 'Lahore'));

// Define time range
var startDate = '2025-01-01';
var endDate = '2025-03-03';

// Load Sentinel-2 and apply cloud masking
var cloudmask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
  .map(cloudmask())
  .map(function(image) { return image.divide(10000); });

// Select only 10m bands
var s2Bands = ['B2', 'B3', 'B4', 'B8']; 
var s2Median = s2.select(s2Bands).median().clip(roi);

// Compute indices using only 10m bands
var NDVI = s2Median.normalizedDifference(['B8', 'B4']).rename('NDVI');  // Vegetation
var NDBI = s2Median.normalizedDifference(['B8', 'B2']).rename('NDBI');  // Built-up
var BSI = s2Median.expression( // Bare Soil Index (simplified for 10m bands)
    '(B8 - B3) / (B8 + B3)', {
      'B8': s2Median.select('B8'),
      'B3': s2Median.select('B3')
}).rename('BSI');

// Load Sentinel-1 SAR and select VV & VH bands
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterDate(startDate, endDate)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
  .filterMetadata('resolution_meters', 'equals', 10)
  .filterBounds(roi);

// Compute median SAR bands
var VV = s1.select('VV').median().focal_mean(10, 'circle', 'meters').clip(roi).rename('VV');
var VH = s1.select('VH').median().focal_mean(10, 'circle', 'meters').clip(roi).rename('VH');

// Compute SAR-based indices
var RBI = VV.divide(VH).rename('RBI');  // Built-up index from SAR
var RVI = VH.multiply(4).divide(VV.add(VH)).rename('RVI');  // Vegetation index from SAR

// Composite of 10m bands and their indices
var final_composite = s2Median.addBands([NDVI, NDBI, BSI, VV, VH, RBI, RVI]);

// Sample for clustering
var training = final_composite.sample({
  region: roi,
  scale: 10,
  numPixels: 5000,
  seed: 1
});

// K-Means Clustering
var clusterer = ee.Clusterer.wekaKMeans(4).train(training);
var classified = final_composite.cluster(clusterer).clip(roi);

// Visualization
var cluster_palette = ['red', 'blue', 'yellow', 'green']; // Built-up, water, bare, vegetation

// Display results
Map.addLayer(classified, {min: 0, max: 3, palette: cluster_palette}, 'Optimized Clustering');
Map.centerObject(roi, 10);
