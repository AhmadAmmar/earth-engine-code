/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pk = ee.FeatureCollection("users/ahmadammargeo/pk0");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var night_lights = ee. ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS').select('stable_lights')
var years = ee.List.sequence(1992, 2013, 1)
var nl_ts = ee.ImageCollection.fromImages(
  years.map(function(year){
    var ann_subset = night_lights.filter(ee.Filter.calendarRange(year, year, 'year'))
    var timestamp = ann_subset.first().get('system:time_start')
    return ann_subset.mean().set('system:time_start', timestamp)
  }));
  
var createTimeBand = function(image){
  return image.addBands(image.metadata('system:time_start').divide(1e12));
}

var createConstantBand = function(image){
  return ee.Image(1).addBands(image);
}

var reg_ts = nl_ts.map(createTimeBand)
  .map(createConstantBand)
  .select(['constant', 'system:time_start', 'stable_lights']);

var linearRegression = reg_ts.reduce(
  ee.Reducer.linearRegression({
    numX: 2,
    numY: 1
  }));
  
var bandNames = [['constant', 'time'], ['nl']];
var lrImage = linearRegression.select(['coefficients']).arrayFlatten(bandNames).clip(pk.geometry());

var training = lrImage.sample({
  region: pk,
  scale: 1000,
  numPixels: 5000
});
var clusterer = ee.Clusterer.wekaKMeans(4).train(training);
var result = lrImage.cluster(clusterer);
Map.addLayer(result.randomVisualizer(), {}, 'clusters');
//Map.addLayer(lrImage, {min: 0, max: [18, 20, -18], bands: ['time_nl', 'constant_nl', 'time_nl']}, 'Regression Output');