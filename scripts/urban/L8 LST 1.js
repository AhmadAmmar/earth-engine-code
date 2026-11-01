/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/pk0");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

var raw = ee.ImageCollection("LANDSAT/LC08/C01/T1_TOA") 
  .filterDate ('2019-01-01', '2019-12-31')
  .filterBounds(table.geometry());

var surf_temp = function(image) {
  var geet = require('users/elacerda/geet:geet');
  var new_toa_radiance = geet.toa_radiance(image, 11);
  var brightness = geet.brightness_temp_l8c(new_toa_radiance, true);
  var ndvi = geet.ndvi_l8(brightness);
  var veg = geet.prop_veg(ndvi);
  var lse = geet.surface_emissivity(veg);
  var surface = geet.surface_temperature_oli(lse);
  var lst = surface.select('LST');
  var img = lst;
  return img;

};
Map.addLayer(raw.map(surf_temp));