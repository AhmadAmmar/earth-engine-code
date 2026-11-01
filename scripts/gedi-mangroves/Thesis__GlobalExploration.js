/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var image = ee.Image("users/ahmadammargeo/GlobalAGB/AGB_Avitabile_Indus");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var boundary = ee.FeatureCollection("users/ahmadammargeo/indusProj");

var dataset = ee.Image('LARSE/GEDI/GEDI04_B_002').select('MU').clipToCollection(boundary);

var min = dataset.reduceRegion({
  reducer: ee.Reducer.min(),
  geometry: boundary,
  scale: 10,
  bestEffort: true
});

var max = dataset.reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: boundary,
  scale: 10,
  bestEffort: true
});

var mean = dataset.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: boundary,
  scale: 10,
  bestEffort: true
});

print('Minimum: ', min);
print('Maximum: ', max);
print('Average: ', mean);