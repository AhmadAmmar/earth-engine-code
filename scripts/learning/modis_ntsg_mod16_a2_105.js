var modis = ee.ImageCollection("MODIS/NTSG/MOD16A2/105");
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY');
var pk = ee.FeatureCollection("ft:1ed9QM7TQivt3VFYCuY8RAvM4zOY9aSGobvshyazQ");

var ET = ee.Image(
    modis.filterBounds(pk.geometry())
    .filter(ee.Filter.date('2014-01-01', '2014-12-31'))
    .select('ET')
    .mean()
  );
  
var PET = ee.Image(
    modis.filterBounds(pk.geometry())
    .filter(ee.Filter.date('2014-01-01', '2014-12-31'))
    .select('PET')
    .mean()
  );
  
var PR = ee.Image(
    chirps.filterBounds(pk.geometry())
    .filter(ee.Filter.date('2014-01-01', '2014-12-31'))
    .select('precipitation')
    .mean()
  );  
  
var CropWatReq = PET.subtract(ET);
var Aridity = PR.divide(PET);

var evapotranspirationVis = {
  min: 0.0,
  max: 300.0,
  palette:
      ['a50000', 'ff4f1a', 'f1e342', 'c7ef1f', '05fff3', '1707ff', 'd90bff'],
};
Map.addLayer(ET.clip(pk.geometry()), evapotranspirationVis, 'Aridity');
Map.addLayer(PET.clip(pk.geometry()), evapotranspirationVis, 'Aridity');
Map.addLayer(PR.clip(pk.geometry()), evapotranspirationVis, 'Aridity');
Map.addLayer(CropWatReq.clip(pk.geometry()), evapotranspirationVis, 'Aridity');
Map.addLayer(Aridity.clip(pk.geometry()), evapotranspirationVis, 'Aridity');

Export.image.toDrive({
  image: Aridity,
  description: 'Aridity',
  scale: 500,
  region: pk.geometry().bounds(), // .geometry().bounds() needed for multipolygon
  crs: 'EPSG:4326',
  folder: 'ET0',
  maxPixels: 1.0E13
});