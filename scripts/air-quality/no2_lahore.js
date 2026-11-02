/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var Lhr = ee.FeatureCollection("users/ahmadammargeo/Lhr");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var collection = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2')
  .select('tropospheric_NO2_column_number_density')
  .filterDate('2019-10-28', '2020-01-12');

var Lhr_geo = Lhr.geometry();
  
var NO2 = collection.map(function(image){
  var date = image.get('system:time_start');
  var mean = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: Lhr_geo,
    scale: 30
  });
  return ee.Feature(null, {'mean': mean.get('tropospheric_NO2_column_number_density'),
                            'date': date})});

Export.table.toDrive({
  collection: NO2,
  description: 'tropospheric_NO2_column_number_density',
  folder: 'GEE1',
  fileFormat: 'CSV'
});

/*
var pt = ee.Geometry.Point(31.560078, 74.33589);

print(ui.Chart.image.series(collection, Lhr, ee.Reducer.mean(), 30));

var val_max = 0.0002;
var val_min = 0;
var band_viz = {
  min: val_min,
  max: val_max,
  opacity: 1.0,
  palette: ["black", "blue", "purple", "cyan", "green", "yellow", "red"]
};

var Lhr_mean = collection.mean()
Map.addLayer(Lhr_mean, band_viz, 'no2 all')*/