/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    rh98 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh98");
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

var NDVI = s2normalized.normalizedDifference(['B8', 'B4']).rename('NDVI')

var ObsAGBrh98 = ((rh98).multiply(21.8678)).add(-53.2972);

var AGBObsAGBrh98 = ObsAGBrh98.clip(indus.geometry()).updateMask(NDVI.gte(0.1)).rename('AGBObsAGBValCHM');

Export.image.toAsset({
  image: AGBObsAGBrh98,
  description: 'AGBObsAGBrh98',
  assetId: 'AGBObsAGBrh98',
  scale: 10,
  maxPixels: 1e13,
});
