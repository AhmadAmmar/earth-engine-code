var indus = ee.FeatureCollection("users/muddasirshah01/Thesis/IndusDelta");
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

var image_ndvi = s2normalized.normalizedDifference(['B8', 'B4']).rename('NDVI')

var visParams_ndvi = {min: -0.2, max: 0.8, palette: 'FFFFFF, CE7E45, DF923D, F1B555, FCD163, 99B718, 74A901, 66A000, 529400,' +
    '3E8601, 207401, 056201, 004C00, 023B01, 012E01, 011D01, 011301'};

Map.addLayer(image_ndvi.clip(indus),visParams_ndvi,'Sentinel-2 NDVI')

var ndvi_th = image_ndvi.gt(0.1);
var myndvi = ndvi_th.updateMask(ndvi_th);
var ndvi_viz = {palette:"darkgreen"};
Map.addLayer(myndvi.clip(indus), ndvi_viz, 'Forest2020', 1);

var table = ee.FeatureCollection("users/ahmadammargeo/AGBD_obs");

var features = image_ndvi.sampleRegions({
  collection: table,
  properties: ["AGBD_obs"],
  scale: 10,
});

print(ui.Chart.feature.byFeature({
  features: features, 
  xProperty: 'AGBD_obs', 
  yProperties: ['NDVI']
}).setOptions({
  title: "Validation of ABGD",
  hAxis: {title: 'AGBD_obs'},
  vAxis: {title: 'NDVI'},
  colors: ['#EF851C'],
  pointSize: 3,
  lineWidth: 0,
  trendlines: { 
    0: { 
      type: 'linear', 
      visibleInLegend: true,
      showR2: true,
      color: 'black',
      opacity: 1,
      lineWidth: 2,
      pointSize: 0
    } 
  }  
}));