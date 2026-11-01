/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    points = ee.FeatureCollection("users/ahmadammargeo/indusHeightAGB");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var points = points.map(function(feature) {
  return ee.Feature(feature.geometry(), {'id': feature.id()})
})
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
function addNDVI(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('ndvi')
  return image.addBands([ndvi])
}
var startDate = '2020-01-01'
var endDate = '2020-12-31'

var collection = ee.ImageCollection('COPERNICUS/S2_SR')
    .filterDate(startDate, endDate)
    .map(addNDVI)
    .map(s2mask())
    .filter(ee.Filter.bounds(points))

var chart = ui.Chart.image.seriesByRegion({
    imageCollection: collection.select('ndvi'),
    regions: points,
    reducer: ee.Reducer.mean(),
})
print(chart)

// var triplets = collection.map(function(image) {
//   return image.select('ndvi').reduceRegions({
//     collection: points, 
//     reducer: ee.Reducer.mean().setOutputs(['ndvi']), 
//     scale: 10,
//   })
//     .map(function(feature) {
//     var ndvi = ee.List([feature.get('ndvi'), -9999])
//       .reduce(ee.Reducer.firstNonNull())
//     return feature.set({'ndvi': ndvi, 'imageID': image.id()})
//     })
//   }).flatten();

// var format = function(table, rowId, colId) {
//   var rows = table.distinct(rowId); 
//   var joined = ee.Join.saveAll('matches').apply({
//     primary: rows, 
//     secondary: table, 
//     condition: ee.Filter.equals({
//       leftField: rowId, 
//       rightField: rowId
//     })
//   });
        
//   return joined.map(function(row) {
//       var values = ee.List(row.get('matches'))
//         .map(function(feature) {
//           feature = ee.Feature(feature);
//           return [feature.get(colId), feature.get('ndvi')];
//         });
//       return row.select([rowId]).set(ee.Dictionary(values.flatten()));
//     });
// };

// var sentinelResults = format(triplets, 'id', 'imageID');

// var merge = function(table, rowId) {
//   return table.map(function(feature) {
//     var id = feature.get(rowId)
//     var allKeys = feature.toDictionary().keys().remove(rowId)
//     var substrKeys = ee.List(allKeys.map(function(val) { 
//         return ee.String(val).slice(0,8)}
//         ))
//     var uniqueKeys = substrKeys.distinct()
//     var pairs = uniqueKeys.map(function(key) {
//       var matches = feature.toDictionary().select(allKeys.filter(ee.Filter.stringContains('item', key))).values()
//       var val = matches.reduce(ee.Reducer.max())
//       return [key, val]
//     })
//     return feature.select([rowId]).set(ee.Dictionary(pairs.flatten()))
//   })
// }
// var sentinelMerged = merge(sentinelResults, 'id');
// Export.table.toDrive({
//     collection: sentinelMerged,
//     description: 'Multiple_Locations_NDVI_time_series',
//     folder: 'earthengine',
//     fileNamePrefix: 'ndvi_time_series_multiple',
//     fileFormat: 'CSV'
// })