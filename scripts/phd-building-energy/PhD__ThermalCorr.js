// Define the area of interest using the provided polygon coordinates (WGS84)
var area = ee.Geometry.Polygon([
  [
    [-5.908026981, 54.545994481],
    [-5.913726555, 54.560958737],
    [-5.949610104, 54.557497825],
    [-5.986537305, 54.553148152],
    [-5.974419065, 54.518811635],
    [-5.934493754, 54.522617207],
    [-5.901659417, 54.526512158],
    [-5.908026981, 54.545994481]
  ]
]);

// Define the date range around the Hotsat acquisition date (e.g., July 2023)
var startDate = '2023-06-01';
var endDate = '2023-08-31';

// Load Landsat 8 Collection 2 Level-2 Image Collection
var landsatCollection = ee.ImageCollection('LANDSAT/LC08/C02/T1')
  .filterBounds(area)
  .filterDate(startDate, endDate)
  // Optionally, filter by cloud cover percentage (e.g., less than 10%)
  .filter(ee.Filter.lt('CLOUD_COVER', 10));

print('Landsat Collection:', landsatCollection);

// Center the map on the area of interest
Map.centerObject(area, 10);
Map.addLayer(area, {color: 'red'}, 'AOI');

// Select the thermal band (ST_B10 holds the surface temperature data in Kelvin)
// Adjust visualization parameters as needed (min and max values in Kelvin)
var thermalVis = {
  min: 290,
  max: 320,
  palette: ['blue', 'green', 'yellow', 'red']
};

// For display, create a median composite if there are multiple images
var landsatThermal = landsatCollection.median().select('B10');

// Add the Landsat thermal composite to the map
Map.addLayer(landsatThermal.clip(area), thermalVis, 'Landsat 8 Thermal (ST_B10)');

// Optionally, export the composite image if needed
Export.image.toDrive({
  image: landsatThermal.clip(area),
  description: 'Landsat8_Thermal_July2023',
  scale: 30,
  region: area
});
