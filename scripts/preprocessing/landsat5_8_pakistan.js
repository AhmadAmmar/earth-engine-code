var pakistan = ee.FeatureCollection("users/Fall2019/PakistanAdministrativeBoundaries");
var ICT = pakistan.filter(ee.Filter.eq("adm1_name","Islamabad"));

var LC8_BANDS = ['B4',  'B5']; //Landsat 8
var LC5_BANDS = [ 'B3',  'B4']; //Landsat 5
var STD_NAMES = ['red', 'nir'];

var landsat5 = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR').select(LC8_BANDS, STD_NAMES)
                  .filterBounds(ICT)

var landsat8 = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR').select(LC8_BANDS, STD_NAMES)
                  .filterBounds(ICT)
                  
var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['nir', 'red']).rename('NDVI');
  return image.addBands(ndvi);
};                  
                  
var l5ndvi = landsat5.map(addNDVI);
var l8ndvi = landsat8.map(addNDVI);

var landsatimage = ee.ImageCollection(l5ndvi.merge(l8ndvi));
print(landsatimage)