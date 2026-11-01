var pakistan = ee.FeatureCollection("users/Fall2019/PakistanAdministrativeBoundaries");
var table = pakistan.filter(ee.Filter.eq("adm2_name","Karachi"));

var collectionVVAsc = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2021-11-01', '2022-01-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('VV');

var collectionVVDes = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2021-11-01', '2022-01-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('VV');

var collectionVHAsc = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2021-11-01', '2022-01-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('VH');

var collectionVHDes = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2021-11-01', '2022-01-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('VH');

var VVAsc = collectionVVAsc.mean().focal_median().clip(table)
var VVDes = collectionVVDes.mean().focal_median().clip(table)
var VHAsc = collectionVHAsc.mean().focal_median().clip(table)
var VHDes = collectionVHDes.mean().focal_median().clip(table)

Map.addLayer(VVAsc, {min: -18, max: -4}, 'VVAsc');
Map.addLayer(VVDes, {min: -18, max: -4}, 'VVDes');
Map.addLayer(VHAsc, {min: -18, max: -4}, 'VHAsc');
Map.addLayer(VHDes, {min: -18, max: -4}, 'VHDes');


//var SMOOTHING_RADIUS = 50;
//var SARVV_filtered = SARVV.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(table.geometry());
//var SARVH_filtered = SARVH.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(table.geometry());
