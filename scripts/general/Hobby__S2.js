// Define the Area of Interest (AOI)
var AOI = ee.FeatureCollection("WM/geoLab/geoBoundaries/600/ADM2")
  .filter(ee.Filter.inList('shapeName', ['Islamabad Capital Territory', 'Rawalpindi', 'Abbottabad', 'Haripur', 'Attock', 'Chakwal', 'Jhelum']));

// Define the time range
var startDate = '2024-01-01';
var endDate = '2024-12-31';

// Load Sentinel-2 harmonized surface reflectance collection
var cloud_masks = require('users/fitoprincipe/geetools:cloud_masks');
var sentinel2function = cloud_masks.sentinel2;

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(AOI) // Filter to the AOI
  .filterDate(startDate, endDate) // Filter by date
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 25)) // Keep images with < 25% cloud cover
  .map(sentinel2function()) // Apply cloud masking
  .map(function(image) {
    return image.divide(10000); // Scale reflectance values to 0-1
  });

// Select specified Sentinel-2 bands
var s2Bands = s2.select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12']);

// Calculate the median mosaic for Sentinel-2
var s2Median = s2Bands.median().clip(AOI);

// Load Sentinel-1 GRD collection and filter
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterDate(startDate, endDate)
  .filter(ee.Filter.eq('instrumentMode', 'IW')) // Interferometric Wide Swath
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING')) // Ascending orbit
  .filterMetadata('resolution_meters', 'equals', 10) // 10m resolution
  .filterBounds(AOI);

// Process VV and VH bands for Sentinel-1
var VV = s1.select('VV')
  .mean() // Calculate mean across the time period
  //.focal_mean(10, 'circle', 'meters') // Apply focal mean filter to reduce noise
  .clip(AOI)
  .rename('VV');

var VH = s1.select('VH')
  .mean()
  //.focal_mean(10, 'circle', 'meters')
  .clip(AOI)
  .rename('VH');

// Compute texture metrics using a moving window
// Define a kernel (e.g., 3x3 square kernel)
var kernel = ee.Kernel.square({
  radius: 10, // Radius in meters (adjust based on the scale/resolution)
  units: 'meters',
});

// Compute texture metrics
var textureEntropy = VV.entropy(kernel).rename('Entropy'); // Measures randomness
var textureContrast = VV.contrast(kernel).rename('Contrast'); // Measures intensity difference
var textureVariance = VV.reduceNeighborhood({
  reducer: ee.Reducer.variance(),
  kernel: kernel
}).rename('Variance'); // Measures variance in intensity
var textureHomogeneity = VV.reduceNeighborhood({
  reducer: ee.Reducer.mean(),
  kernel: kernel
}).rename('Homogeneity'); // Measures uniformity

// Combine all texture metrics into a single image
var textureMetrics = textureEntropy
  .addBands(textureContrast)
  .addBands(textureVariance)
  .addBands(textureHomogeneity);

// Visualization parameters
var visParamsEntropy = {min: 0, max: 5, palette: ['black', 'white']};
var visParamsContrast = {min: 0, max: 10, palette: ['blue', 'green', 'yellow', 'red']};
var visParamsVariance = {min: 0, max: 50, palette: ['blue', 'white', 'red']};
var visParamsHomogeneity = {min: 0, max: 1, palette: ['white', 'black']};

// Add texture layers to the map
Map.addLayer(textureEntropy, visParamsEntropy, 'Texture Entropy');
Map.addLayer(textureContrast, visParamsContrast, 'Texture Contrast');
Map.addLayer(textureVariance, visParamsVariance, 'Texture Variance');
Map.addLayer(textureHomogeneity, visParamsHomogeneity, 'Texture Homogeneity');

// Stack Sentinel-2 and Sentinel-1 bands

var combinedStack = s2Median
  .addBands(VV) // Add VV band from Sentinel-1
  .addBands(VH); // Add VH band from Sentinel-1

// Visualization for combined stack (Sentinel-2 RGB + Sentinel-1 VV/VH)

// var visParamsRGB = {
//   bands: ['B4', 'B3', 'B2'], // Sentinel-2 RGB visualization
//   min: 0,
//   max: 0.3,
//   gamma: 1.4
// };
// var visParamsSAR = {
//   bands: ['VV', 'VH', 'VV'], // Sentinel-1 VV/VH composite
//   min: -25,
//   max: 0,
// };


//Map.addLayer(s2Median, visParamsRGB, 'Sentinel-2 Median Composite');
//Map.addLayer(VV, {min: -25, max: 0}, 'Sentinel-1 VV');
//Map.addLayer(VH, {min: -25, max: 0}, 'Sentinel-1 VH');
//Map.addLayer(combinedStack, visParamsSAR, 'Combined Sentinel-2 + Sentinel-1 Stack');

// Export the combined stack to Google Drive

// Export.image.toDrive({
//   image: combinedStack,
//   description: 'ISB',
//   folder: 'ISB',
//   fileNamePrefix: 'ISB',
//   region: AOI.geometry(),
//   scale: 10, // Use 10m resolution for all bands
//   maxPixels: 1e13
// });
