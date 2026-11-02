/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/GeoHealth/GeoHealthBuffer");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var date = ee.Filter.date('2021-12-01','2022-06-15')
var col = ee.ImageCollection('MODIS/061/MOD11A1')
  .select('LST_Day_1km')
  .filter(date)
  .filterBounds(table.geometry())
  
var LST = ee.Image(col.mean()).toFloat().clip(table.geometry());

var LST_mean = LST.reduceRegions({
  collection: table,
  reducer: ee.Reducer.mean(),
  scale: 10,
});

var featureCollection = LST_mean.map(function(feat){
  var nullfeat = ee.Feature(null)
  return nullfeat.copyProperties(feat)
})

Export.table.toDrive({
  collection: featureCollection,
  description: 'GeoHealthLST',
  folder: 'GEE',
  fileFormat: 'CSV'
});

