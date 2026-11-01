/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    rh90 = ee.Image("users/ahmadammargeo/GEDIgapFilledrh90"),
    rh10 = ee.Image("users/ahmadammargeo/GEDIgapFilledrh10");
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
  maxPixels: 13e9,
  bestEffort: true
  //tileScale: 16
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

var CTHK = (rh90.subtract(rh10)).clip(indus.geometry()).updateMask(NDVI.gte(0.1)).rename('CTHK');

Export.image.toAsset({
  image: CTHK,
  description: 'CTHK',
  assetId: 'CTHK',
  scale: 10,
  maxPixels: 1e13,
});