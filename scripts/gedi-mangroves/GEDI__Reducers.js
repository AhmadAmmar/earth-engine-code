var table = ee.FeatureCollection("users/ahmadammargeo/indusProj");
var spectral = require('users/dmlmont/spectral:spectral');
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var date = ee.Filter.date('2019-12-01','2020-04-30')

var col = ee.ImageCollection("COPERNICUS/S2_SR")
  .filter(date)
  .filterBounds(table)
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');
var s2mosaic = ee.Image(col.median()).toFloat().clip(table.geometry());
var minMax = s2mosaic.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: table.geometry(),
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
var NDVI = s2normalized.normalizedDifference(['B8', 'B4']).rename('NDVI')
// var ndvi_th = NDVI.gt(0.2);
// var myndvi = ndvi_th.updateMask(ndvi_th);

// var qualityMask = function(im) {
//   return im.updateMask(im.select('quality_flag').eq(1))
//       .updateMask(im.select('degrade_flag').eq(0));
// };

var qualityMask = function(im) {
  return im.updateMask(im.select('quality_flag').eq(1))
  .updateMask(im.select('degrade_flag').eq(0))
  .updateMask(im.select('sensitivity').gte(0.9));
};

var GEDI = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
        //.filter(ee.Filter.date('2020-01-01','2020-03-31'))
        //.filter(ee.Filter.calendarRange(1, 3, 'month'))
        //.filter(ee.Filter.calendarRange(2020, 2020, 'year'))
        .filterBounds(table)
        .map(qualityMask)
        .select('rh10')
        .mean()
        .toFloat()
        .clip(table.geometry())
        .updateMask(NDVI.gte(0.2));
        
var min = GEDI.reduceRegion({
  reducer: ee.Reducer.min(),
  geometry: table.geometry(),
  scale: 10,
  maxPixels: 1e13
});

var mean = GEDI.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: table.geometry(),
  scale: 10,
  maxPixels: 1e13
});

var max = GEDI.reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: table.geometry(),
  scale: 10,
  maxPixels: 1e13
});

print(min)
print(mean)
print(max)