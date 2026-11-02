/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/GeoHealth/GeoHealthBuffer");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var date = ee.Filter.date('2021-12-01','2022-06-15')
var col = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_NO2')
  .select('tropospheric_NO2_column_number_density')
  .filter(date)
  .filterBounds(table.geometry())
  
var NO2 = ee.Image(col.mean()).toFloat().clip(table.geometry());

var NO2_mean = NO2.reduceRegions({
  collection: table,
  reducer: ee.Reducer.mean(),
  scale: 10,
});

var featureCollection = NO2_mean.map(function(feat){
  var nullfeat = ee.Feature(null)
  return nullfeat.copyProperties(feat)
})

Export.table.toDrive({
  collection: featureCollection,
  description: 'GeoHealthNO2',
  folder: 'GEE',
  fileFormat: 'CSV'
});
