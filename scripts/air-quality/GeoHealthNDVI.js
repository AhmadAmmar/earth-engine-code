/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/GeoHealth/GeoHealthBuffer");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var date = ee.Filter.date('2021-12-01','2022-06-15')

var col = ee.ImageCollection("COPERNICUS/S2_SR")
  .filter(date)
  .filterBounds(table.geometry())
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');

var s2mosaic = ee.Image(col.median()).toFloat().clip(table.geometry());

var minMax = s2mosaic.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: table.geometry(),
  scale: 10,
  maxPixels: 1e13,
  bestEffort: true
}); 

var s2normalized = ee.ImageCollection.fromImages(
  s2mosaic.bandNames().map(function(name){
    name = ee.String(name);
    var band = s2mosaic.select(name);
    return band.unitScale(ee.Number(minMax.get(name.cat('_min'))), ee.Number(minMax.get(name.cat('_max'))))
})).toBands().rename(s2mosaic.bandNames());

var B = s2normalized.select('B2');
var G = s2normalized.select('B3');
var R = s2normalized.select('B4');
var R1 = s2normalized.select('B5');
var R2 = s2normalized.select('B6');
var R3 = s2normalized.select('B7');
var N = s2normalized.select('B8');
var R4 = s2normalized.select('B8A');
var S1 = s2normalized.select('B11');
var S2 = s2normalized.select('B12');

var NDVI = s2normalized.normalizedDifference(['B8', 'B4']).rename('NDVI')

var EVI = s2normalized.expression ('float (2.5 * ((N - R) / (N + 6 * R - 7.5 * B + 1)))', {
  'N': N,
  'B': B, 
  'R': R}).rename('EVI');
  
var MSAVI = s2normalized.expression ('float ((2.0 * N + 1.0 - sqrt(pow((2.0 * N + 1.0), 2.0) - 8.0 * (N - R))) / 2.0)',{
  'N': N,
  'R': R}).rename('MSAVI');
  
var all = ee.Image([NDVI, EVI, MSAVI])
  
var mean = all.reduceRegions({
  collection: table,
  reducer: ee.Reducer.mean(),
  scale: 10,
});

var featureCollection = mean.map(function(feat){
  var nullfeat = ee.Feature(null)
  return nullfeat.copyProperties(feat)
})

Export.table.toDrive({
  collection: featureCollection,
  description: 'GeoHealthAll',
  folder: 'GEE',
  fileFormat: 'CSV'
});
