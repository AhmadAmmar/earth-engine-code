/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pk = ee.FeatureCollection("users/ahmadammargeo/pk0");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var night_lights = ee. ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS').select('stable_lights')
var years = ee.List.sequence(1992, 2013, 1)
var annual = ee.ImageCollection.fromImages(
  years.map(function(year){
    var ann_subset = night_lights.filter(ee.Filter.calendarRange(year, year, 'year'))
    var timestamp = ann_subset.first().get('system:time_start')
    return ann_subset.mean().set('system:time_start', timestamp)
  }));

var createTimeBand = function(image){
  var date = image.date().get("year")
  var imgYear = ee.Image(date).rename("year").int16()
  return image.addBands(imgYear)
}

var yearly = annual.map(createTimeBand)

var linearFit = yearly.select(["year", "stable_lights"]).reduce(ee.Reducer.linearFit())
Map.addLayer(linearFit.select("scale").clip(pk.geometry()), {min: -1, max:2, palette:["black", "white", "red", "green"]}, 'Annual Slope');

// var training = linearFit.sample({
//   region: pk,
//   scale: 1000,
//   numPixels: 5000
// });
// var clusterer = ee.Clusterer.wekaKMeans(4).train(training);
// var result = linearFit.cluster(clusterer);
// Map.addLayer(result.randomVisualizer(), {}, 'clusters');