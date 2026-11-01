var hansenImage = ee.Image('UMD/hansen/global_forest_change_2015');

var BOUND = ee.FeatureCollection('ft:1wMQYVDvdza8PRvrOGfvS49yU9FaI-EzAfTHZuBcE');

var bufferPoly = function(feature) {
  return feature.buffer(500);
};
var BOUND = BOUND.map(bufferPoly);

var addNDVI = function(image) {
  var ndvi= image.normalizedDifference(['B4', 'B3']).rename('NDVI');
  return image.addBands(ndvi);
};

var cloudMask = function(image) {
  var clouds = ee.Algorithms.Landsat.simpleCloudScore(image).select(['cloud']);
  return image.updateMask(clouds.lt(25));
};

var landMask = function(image) {
var datamask = hansenImage.select('datamask');
var mask = datamask.eq(1);
return image.updateMask(mask);
};

var collection1 = ee.ImageCollection('LANDSAT/LE07/C01/T1_RT_TOA')
  .filterBounds(BOUND)
  .filterDate('2018-01-01','2018-12-31')
  .map(addNDVI)
  .map(cloudMask)
  .map(landMask)
  .select('NDVI') ;

print(collection1);
  
var annualNDVI = collection1.reduce(ee.Reducer.median());

var BOUND_NDVI = annualNDVI.reduceRegions({
  collection: BOUND,
  reducer: ee.Reducer.median(),
  scale: 30 // the resolution of the dataset
});

var ndviParams = {min: -1, max: 1, palette: ['blue', 'white','green']};
var boundParams = {palette: ['black']};

Map.setCenter(72,32,6); // Centre on Pakistan
Map.addLayer(annualNDVI.clip(BOUND), ndviParams, 'NDVI', 1);


/*var chart = ui.Chart.image.seriesByRegion({
  imageCollection: collection1,
  regions: BOUND,
  reducer: ee.Reducer.median(),
  scale: 30,
  xProperty:'system:time_start', 
  seriesProperty: 'label'
}).setOptions({title: 'NDVI over time'});
print(chart);*/

var polyOut = BOUND_NDVI.select(['.*'],null,false);

polyOut = polyOut.map(function(f){
  return f.set('Year', 2018);
});

Export.table.toDrive({
  collection: polyOut,
  description: 'LANDSAT_annual_NDVI_by_BOUND_2018',
  folder: 'GEE_output',
  fileFormat: 'CSV'
}); 