var cloud_masks = require('users/fitoprincipe/geetools:cloud_masks');
var sentinel2function = cloud_masks.sentinel2

// Define the area of interest (United Kingdom)
var AOI = ee.FeatureCollection('USDOS/LSIB/2017')
  .filter(ee.Filter.inList('COUNTRY_NA', ['United Kingdom', 'Ireland']));

// Center the map to the AOI
Map.centerObject(AOI, 6);

// Define the time range
var startDate = '2024-01-01';
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
var s2Median = s2Bands.median();

// Calculate the difference between the median and the observation per image per band,
// then get the medoid by selecting the image pixel with the smallest difference
// between median and observation per band.

var s2MedoidComposite = s2Bands.map(function(image) {
  // 1. Difference (squared)
  var diff = image.subtract(s2Median).pow(ee.Image.constant(2));
  // 2. Sum of differences as the first band, then add original bands
  return diff.reduce('sum').addBands(image);
})
// 3. Reducer over the entire collection.
//    +1 because we have the "sum of difference" band plus the original band count
.reduce(ee.Reducer.min(bands.length + 1))

// 4. Select the 'min1' ... 'min10' bands (for your 10 bands) and rename
.select(
  // Generate the list of band names coming from the reducer, e.g. ['min1', 'min2', ...]
  ee.List.sequence(1, bands.length).map(function(i) {
    // Ensure we get "min1", "min2", ... instead of "min1.0"
    return ee.String('min').cat(ee.Number(i).format('%d'));
  }),
  // Rename them to the desired Sentinel-2 band names
  bands
)
.clip(AOI);


// Visualize the composite
var visParamsRGB = {
  bands: ['B4', 'B3', 'B2'], // RGB visualization
  min: 1,
  max: 5000,
  gamma: 1.4
};

// Add layers to the map
Map.addLayer(s2MedoidComposite, visParamsRGB, 's2Medoid Composite 2024');

// // Export the medoid composite to Google Drive
// Export.image.toDrive({
//   image: s2Median,
//   description: 's2Median_Composite_2024_UK',
//   fileNamePrefix: 's2Median_Composite_2024',
//   scale: 10, // Use the highest resolution (10m) across all bands
//   region: AOI.geometry(),
//   maxPixels: 1e13
// });
