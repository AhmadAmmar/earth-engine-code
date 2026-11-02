/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/pk0");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pm25ic = ee.ImageCollection('ECMWF/CAMS/NRT').select('particulate_matter_d_less_than_25_um_surface').filterBounds(table.geometry());

var filterMonth = ee.Filter.calendarRange(1, 12, 'month');
var pm25mon = pm25ic.filter(filterMonth);
var filter19 = ee.Filter.calendarRange(2019, 2019, 'year');
var pm25  = pm25mon.filter(filter19).mean().clip(table.geometry());

Export.image.toDrive({
  image: pm25.clip(table.geometry()),
  description: 'pm25',
  fileFormat: 'GeoTIFF',
  scale: 100,
  maxPixels: 1e13,
  crs: 'EPSG:4326',
});