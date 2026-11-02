/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var image = ee.Image("users/ahmadammargeo/AGB/AGBfromObsAGBwithImpVar"),
    region = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    table = ee.FeatureCollection("users/ahmadammargeo/AGBD_obs");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
print(image.reduceRegion({
  reducer: ee.Reducer.min(),
  geometry: region.geometry(),
  maxPixels: 1e13
}));

print(image.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: region.geometry(),
  maxPixels: 1e13
}));

print(image.reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: region.geometry(),
  maxPixels: 1e13
}));

var regressionSample = image.sampleRegions({
  collection: table,
  properties: ["AGBD_obs"],
  scale: 10,
});

var val_extracted = regressionSample.reduceColumns(ee.Reducer.toList(2),['AGBD_obs','AGBfromObsAGBwithImpVar']).get('list')
var obs = ee.Array(val_extracted).transpose().cut([0,-1]).project([1])
var pR = ee.Array(val_extracted).transpose().cut([1,-1]).project([1])
var rmse = obs.subtract(pR).pow(2).reduce('mean', [0]).sqrt()
print('RMSE = ', rmse)