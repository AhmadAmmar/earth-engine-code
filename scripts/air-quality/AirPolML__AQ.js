/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var Lhr = ee.FeatureCollection("users/ahmadammargeo/Lhr");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var collection = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_NO2')
  .select('NO2_column_number_density')
  .filterDate('2019-01-01', '2019-12-23');
  
var Lhr_geo = Lhr.geometry()

print(ui.Chart.image.series(collection, Lhr_geo, ee.Reducer.mean(), 30));

var val_max = 0.0002;
var val_min = 0;
var band_viz = {
  min: val_min,
  max: val_max,
  opacity: 1.0,
  palette: ["black", "blue", "purple", "cyan", "green", "yellow", "red"]
};

var Lhr_mean = collection.mean()
Map.addLayer(Lhr_mean, band_viz, 'no2 all')