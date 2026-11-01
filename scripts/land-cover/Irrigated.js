/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var col = ee.ImageCollection("MODIS/MOD13A1"),
    pk = ee.FeatureCollection("ft:1ed9QM7TQivt3VFYCuY8RAvM4zOY9aSGobvshyazQ");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//var vegetationThreshold = -0.1

var Rabi = ee.Image(
    col.filterBounds(pk.geometry())
    .filter(ee.Filter.calendarRange(2000,2018,'year'))
    .filter(ee.Filter.calendarRange(11,5,'month'))
    .select('NDVI')
    .mean()
  );
  
//var RabiCrop = Rabi.gt(vegetationThreshold);

var Kharif = ee.Image(
    col.filterBounds(pk)
    .filter(ee.Filter.calendarRange(2000,2018,'year'))
    .filter(ee.Filter.calendarRange(6,10,'month'))
    .select('NDVI')
    .mean()
    );
  
/*var palette = [
  'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718',
  '74A901', '66A000', '529400', '3E8601', '207401', '056201',
  '004C00', '023B01', '012E01', '011D01', '011301'];
    
Map.addLayer(Rabi.clip(pk.geometry()),
            {palette: palette});
            
Map.addLayer(Kharif.clip(pk.geometry()),
            {palette: palette});*/
            
Export.image.toDrive({
  image: Rabi,
  description: 'RabiNDVI',
  scale: 500,
  region: pk.geometry().bounds(), // .geometry().bounds() needed for multipolygon
  crs: 'EPSG:4326',
  folder: 'RabiKharif',
  maxPixels: 1.0E13
});

Export.image.toDrive({
  image: Kharif,
  description: 'KharifNDVI',
  scale: 500,
  region: pk.geometry().bounds(), // .geometry().bounds() needed for multipolygon
  crs: 'EPSG:4326',
  folder: 'RabiKharif',
  maxPixels: 1.0E13
});