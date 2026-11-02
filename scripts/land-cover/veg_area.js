/*

var data = ee.ImageCollection('LANDSAT/LE07/C01/T1_RT_TOA')
  .filterBounds(dist)
  .filterDate('2014-01-01','2014-12-31')
//  .median()
  .map(addNDVI)
  .map(cloudMask)
  .map(landMask)
  .select('NDVI')
//  .gt(0.45);

var vegT = data.gte(0.45);
var vegArea = vegT.multiply(ee.Image.pixelArea());

var distVeg = area.reduceRegions({
  collection: dist,
  reducer: ee.Reducer.sum(),
});

var polyOut = distVeg.select(['.*'],null,false);

polyOut = polyOut.map(function(feature){
return feature.set('Year',2014);
});

Export.table.toDrive({
  collection: polyOut,
  description: 'distVeg',
  folder: 'GEE',
  fileFormat: 'CSV',
  scale: 30,
  maxPixels: 1e13
});*/

var dist = ee.FeatureCollection('ft:1jOPCngvI9kH_0qbWUY6msMLQppEgArIAXaJPSvtd', 'geometry');
var landsat = ee.ImageCollection('LANDSAT/LE07/C01/T1_RT_TOA');
var hansenImage = ee.Image('UMD/hansen/global_forest_change_2015');

var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['B4', 'B3']).rename('NDVI');
  return image.updateMask(image.gt(0.45));
};

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
var l7 = landsat.filterBounds(dist)
                .filterDate('2014-01-01','2014-12-31');

var l7_nocloud = l7.map(cloudMask);
var l7_landmask = l7_nocloud.map(landMask);
var l7_ndvi = l7_landmask.map(addNDVI);

var ndvi_th = l7_ndvi.gt(0.45);