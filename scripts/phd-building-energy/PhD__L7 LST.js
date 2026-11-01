/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var AOI = ee.FeatureCollection("projects/ee-ahmadammargeo/assets/phd/london");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Center the map to the AOI
Map.centerObject(AOI, 6);

// Define the time range
var startDate = '2023-01-01';
var endDate = '2023-12-31';

// Applies scaling factors.
function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBand = image.select('ST_B6').multiply(0.00341802).add(149.0);
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBand, null, true);
}

var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
  .filterBounds(AOI)
  .filterDate(startDate, endDate)
  .map(applyScaleFactors);

// Select all specified bands
var bands = ['ST_B6'];
var l7Bands = l7.select(bands);

// Calculate the median across the collection for each band
var l7lst = l7Bands.median().clip(AOI);

// Visualize the composite
var visParamsRGB = {
  min: 0, // Adjust as needed for the temperature range
  max: 1,
palette: [
    ['000004', '2C105C', '711F81', 'B63679', 'EE605E', 'FDAE78', 'FCFDBF']
  ]};

// Add layers to the map
Map.addLayer(l7lst, visParamsRGB, 'l7lst');

// // Export the medoid composite to Google Drive
// Export.image.toDrive({
//   image: s2Median,
//   description: 's2Median_Composite_2024_UK',
//   fileNamePrefix: 's2Median_Composite_2024',
//   scale: 10, // Use the highest resolution (10m) across all bands
//   region: AOI.geometry(),
//   maxPixels: 1e13
// });
