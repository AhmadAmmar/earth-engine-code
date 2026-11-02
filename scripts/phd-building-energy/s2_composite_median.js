var cloud_masks = require('users/fitoprincipe/geetools:cloud_masks');
var sentinel2function = cloud_masks.sentinel2

// Define the area of interest (United Kingdom)
var AOI = ee.FeatureCollection('USDOS/LSIB/2017')
  .filter(ee.Filter.inList('COUNTRY_NA', ['United Kingdom', 'Ireland']));

// Center the map to the AOI
Map.centerObject(AOI, 6);

// Define the time range
var startDate = '2023-01-01';
var endDate = '2024-12-31';

// Load Sentinel-2 harmonized surface reflectance collection
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(AOI)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 25))
  .map(sentinel2function());

// Select all specified bands
var bands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'];
var s2Bands = s2.select(bands);

// Calculate the median across the collection for each band
var s2Median = s2Bands.median().clip(AOI);

// Visualize the composite
var visParamsRGB = {
  bands: ['B4', 'B3', 'B2'], // RGB visualization
  min: 1,
  max: 5000,
  gamma: 1.4
};

// Add layers to the map
Map.addLayer(s2Median, visParamsRGB, 's2Median Composite 2024');

// // Export the medoid composite to Google Drive
// Export.image.toDrive({
//   image: s2Median,
//   description: 's2Median_Composite_2024_UK',
//   fileNamePrefix: 's2Median_Composite_2024',
//   scale: 10, // Use the highest resolution (10m) across all bands
//   region: AOI.geometry(),
//   maxPixels: 1e13
// });
