/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var imNormfunction = require('users/ahmadammargeo/GeospatialGeeks:imNormalization');
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var spectral = require('users/dmlmont/spectral:spectral');

var collection = ee.ImageCollection("COPERNICUS/S2_SR")
  .filter(ee.Filter.date('2020-02-01', '2020-02-29'))
  .filterBounds(indus)
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');
  
var composite = ee.Image(collection.median()).toFloat().clip(indus);

var imNormalized = imNormfunction.imNormalize(composite);

//var NDVI = unitScale.normalizedDifference(['B8', 'B4']).rename(['NDVI']);

Map.addLayer(normalized)