/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var spectral = require('users/dmlmont/spectral:spectral');
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var col = ee.ImageCollection("COPERNICUS/S2_SR")
  .filter(ee.Filter.date('2020-02-01', '2020-02-29'))
  .filterBounds(indus)
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');

var s2mosaic = ee.Image(col.median()).toFloat().clip(indus);
var glcm = s2mosaic.toUint8().glcmTexture()
var composite = s2mosaic.addBands(glcm)
print(composite)