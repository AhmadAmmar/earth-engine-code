/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProjHalved");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var collectionVVAsc = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2020-01-01', '2020-03-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(indus)
.select('VV');

var VVAscFocalMedian = collectionVVAsc.mean().focal_median().toFloat().clip(indus).rename('VVAscFocalMedian')
var VVAsc = collectionVVAsc.mean().toFloat().clip(indus).rename('VVAsc')
var VVAscMedian = collectionVVAsc.median().toFloat().clip(indus).rename('VVAscMedian')


Map.addLayer(VVAsc, {min: -18, max: -4}, 'VVAsc');
Map.addLayer(VVAscFocalMedian, {min: -18, max: -4}, 'VVAscFocalMedian');
Map.addLayer(VVAscMedian, {min: -18, max: -4}, 'VVAscMedian');