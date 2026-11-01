// Define the area of interest (British Isles)
var aoi = ee.FeatureCollection('USDOS/LSIB/2017')
  .filter(ee.Filter.inList('COUNTRY_NA', ['United Kingdom', 'Ireland']));

// Define the time range
var startDate = '2000-01-01';
var endDate = '2024-12-31';

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

// Load Landsat 8 Collection 2, Tier 2 TOA dataset
var landsat8 = ee.ImageCollection('LANDSAT/LC08/C02/T2_TOA')
              .filter(ee.Filter.lt("SUN_ELEVATION", 0))
              .filterBounds(aoi)
              .filterDate(startDate, endDate)
              .map(cloudMask)
              .median()
              .clip(aoi);

// Select the thermal band (Band 10: TIRS1, scaled TOA brightness temperature in Kelvin)
var thermalBand = landsat8.select('B10');

// Visualize the results
var thermalVis = {
  min: 0, // Adjust as needed for the temperature range
  max: 1,
  palette: ['blue', 'cyan', 'green', 'yellow', 'red']
};

Map.centerObject(aoi, 6); // Zoom to the area of interest
Map.addLayer(thermalBand, thermalVis, 'Nighttime Thermal Mosaic 2023');