/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var Asc = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterDate('2021-04-01', '2021-06-30')
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
    .filterBounds(table);

var Asc_pc = Asc.reduce(ee.Reducer.percentile([25,50,75]));
var Asc_pc = ee.Image(10).pow(Asc_pc.divide(10));
var Asc_pc_Feats = Asc_pc.select(['VH_p50','VV_p50']).clip(table);
var PRS_VV_iqr = Asc_pc_Feats
	.addBands((Asc_pc.select('VV_p75')
	.subtract(Asc_pc.select('VV_p25')))
	.rename('VV_iqr'));
var PRS_VH_iqr = Asc_pc_Feats
	.addBands((Asc_pc.select('VH_p75')
	.subtract(Asc_pc.select('VH_p25')))
	.rename('VH_iqr'));