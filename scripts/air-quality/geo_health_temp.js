/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/GeoHealth/GeoHealthBuffer");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var date = ee.Filter.date('2021-12-01','2022-06-15')
var col = ee.ImageCollection('ECMWF/ERA5/DAILY')
  .select('maximum_2m_air_temperature')
  .filter(date)
  .filterBounds(table.geometry())
  
var MaxTemp = ee.Image(col.mean()).toFloat().clip(table.geometry());

var MaxTemp_mean = MaxTemp.reduceRegions({
  collection: table,
  reducer: ee.Reducer.mean(),
  scale: 10,
  crs: 'EPSG:4326',
});

var featureCollection = MaxTemp_mean.map(function(feat){
  var nullfeat = ee.Feature(null)
  return nullfeat.copyProperties(feat)
})

Export.table.toDrive({
  collection: featureCollection,
  description: 'GeoHealthMaxTemp',
  folder: 'GEE',
  fileFormat: 'CSV'
});