/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var Lhr = ee.FeatureCollection("users/ahmadammargeo/Lhr");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var collection = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_CH4')
  .select('CH4_column_volume_mixing_ratio_dry_air')
  .filterDate('2019-02-09', '2019-12-23');
  
var Lhr_geo = Lhr.geometry()

var series = collection.map(function(image){
  var date = image.get('system:time_start');
  var mean = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: Lhr_geo,
    scale: 30
  });
  return ee.Feature(null, {'mean': mean.get('CH4_column_volume_mixing_ratio_dry_air'),
                            'date': date})
});

Export.table.toDrive({
  collection: series,
  description: 'CH4_column_volume_mixing_ratio_dry_air',
  folder: 'GEE',
  fileFormat: 'CSV'
});