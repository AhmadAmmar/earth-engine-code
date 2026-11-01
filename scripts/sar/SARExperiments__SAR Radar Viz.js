var pakistan = ee.FeatureCollection("users/Fall2019/PakistanAdministrativeBoundaries");
var table = pakistan.filter(ee.Filter.eq("adm2_name","Karachi"));

var sentinel1Collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.date('2021-11-01', '2022-01-31'))
  .filterBounds(table)
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('resolution_meters', 10))
  .filter(ee.Filter.eq('instrumentMode', 'IW'));
  
var vhAscending = sentinel1Collection.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'));
var vhDescending = sentinel1Collection.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));

var composite = ee.Image.cat([
  vhAscending.select('VH').mean(),
  ee.ImageCollection(vhAscending.select('VV').merge(vhDescending.select('VV'))).mean(),
  vhDescending.select('VH').mean()
  ]).focal_median();
  
var VV = composite.select('VV');
var VH = composite.select('VH');
var VH1 = composite.select('VH_1');

Map.addLayer(VV.clip(table), {min: -18, max: -4}, 'VV');
Map.addLayer(VH.clip(table), {min: -18, max: -4}, 'VH');
Map.addLayer(VH1.clip(table), {min: -18, max: -4}, 'VH1');

//Map.addLayer(vhIwAscMean, {min: -18, max: -10}, 'vhIwAscMean');
//Map.addLayer(vhIwDescMean, {min: -18, max: -10}, 'vhIwDescMean');
