/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    rh1 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh1"),
    rh10 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh10"),
    rh25 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh25"),
    rh50 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh50"),
    rh75 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh75"),
    rh90 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh90"),
    rh98 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh98"),
    CTHK = ee.Image("users/ahmadammargeo/rhFilled/CTHK"),
    validatedCHM = ee.Image("users/ahmadammargeo/rhFilled/validatedCHM"),
    table = ee.FeatureCollection("users/ahmadammargeo/AGBD_obs"),
    agbd = ee.FeatureCollection("users/ahmadammargeo/agbQuality15k");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var spectral = require('users/dmlmont/spectral:spectral');
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var date = ee.Filter.date('2019-12-01','2020-04-30')

var col = ee.ImageCollection("COPERNICUS/S2_SR")
  .filter(date)
  .filterBounds(indus)
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');

var s2mosaic = ee.Image(col.median()).toFloat().clip(indus);

var minMax = s2mosaic.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: indus.geometry(),
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

var NDVI = s2normalized.normalizedDifference(['B8', 'B4']).rename('NDVI')
var composite = ee.Image([rh50,rh75,rh90,CTHK,validatedCHM])

// var minMax = composite.reduceRegion({
//   reducer: ee.Reducer.minMax(),
//   geometry: indus.geometry(),
//   scale: 10,
//   maxPixels: 1e13,
//   bestEffort: true
//   //tileScale: 16
// }); 

// var allNormalized = ee.ImageCollection.fromImages(
//   composite.bandNames().map(function(name){
//     name = ee.String(name);
//     var band = composite.select(name);
//     return band.unitScale(ee.Number(minMax.get(name.cat('_min'))), ee.Number(minMax.get(name.cat('_max'))))
// })).toBands().rename(composite.bandNames());

var bands = composite.bandNames()
var input = composite.select(bands)

var trainingSample = input.sampleRegions({
  collection: agbd,
  properties: ["agbd"],
  scale: 10,
});

var classifier = ee.Classifier.smileRandomForest(150).train(trainingSample,"agbd", bands).setOutputMode('REGRESSION');
var AGBfromGEDIAGBwithRH = input.classify(classifier).clip(indus.geometry()).updateMask(NDVI.gte(0.1)).rename('AGBfromGEDIAGBwithRH');

Export.image.toAsset({
  image: AGBfromGEDIAGBwithRH,
  description: 'AGBfromGEDIAGBwithRH',
  assetId: 'AGBfromGEDIAGBwithRH',
  scale: 10,
  maxPixels: 1e13,
  region: indus.geometry()
});