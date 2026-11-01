/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var aoi = ee.FeatureCollection("projects/ee-ahmadammargeo/assets/phd/london");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Define the time range
var startDate = '2024-01-01';
var endDate = '2024-12-31';

// Apply scaling factors: Converts raw data to physical values
function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0).subtract(273.15); // Convert to °C
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBands, null, true);
}

// Mask clouds and cloud shadows in Landsat 8 imagery
function cloudMask(image) {
  var cloudShadowBitmask = (1 << 4);
  var cloudBitmask = (1 << 3);
  var cirrus = (1 << 2);
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(cloudShadowBitmask).eq(0)
                .and(qa.bitwiseAnd(cloudBitmask).eq(0))
                .and(qa.bitwiseAnd(cirrus).eq(0));
  return image.updateMask(mask);
}

// Import Landsat 8 imagery and preprocess it
var image = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
              //.filter(ee.Filter.lt("SUN_ELEVATION", 0))
              .filterBounds(aoi)
              .filterDate(startDate, endDate)
              .map(applyScaleFactors)
              .map(cloudMask)
              .median()
              .clip(aoi);

// Compute the minimum and maximum LST values
var lstMinMax = image.select('ST_B10').reduceRegion({
  reducer: ee.Reducer.min().combine(ee.Reducer.max(), null, true),
  geometry: aoi,
  scale: 1000, // Adjust scale if needed
  maxPixels: 1e13
});

var lstMin = ee.Number(lstMinMax.get('ST_B10_min'))
var lstMax = ee.Number(lstMinMax.get('ST_B10_max'))

// Add the LST Layer to the map with computed min and max values
Map.addLayer(image.select('ST_B10'), {
  min: lstMin.getInfo(), // Use computed min value
  max: lstMax.getInfo(), // Use computed max value
    palette:
    ['000004', '2C105C', '711F81', 'B63679', 'EE605E', 'FDAE78', 'FCFDBF']
}, 'Land Surface Temperature');

// Center the map on the AOI
Map.centerObject(aoi, 6);