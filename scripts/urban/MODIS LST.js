/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/pk0");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var modis = ee.ImageCollection('MODIS/006/MOD11A1')
  .filterDate('2019-01-01', '2019-12-31')
  .filterBounds(table.geometry())
  .select('LST_Day_1km');
  
var modLSTc = modis.map(function(img) {
  return img
    .multiply(0.02)
    .subtract(273.15)
    .copyProperties(img, ['system:time_start']);
});

var LST = modLSTc.mean().clip(table.geometry())
var ts1 = ui.Chart.image.series({
  imageCollection: modLSTc,
  region: table.geometry(),
  reducer: ee.Reducer.mean(),
  scale: 1000,
  xProperty: 'system:time_start'})
  .setOptions({
     title: 'LST 2015 Time Series',
     vAxis: {title: 'LST Celsius'}});
print(ts1);