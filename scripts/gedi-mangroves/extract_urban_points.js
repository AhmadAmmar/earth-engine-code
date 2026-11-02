/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level2");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var roi = table.filter(ee.Filter.eq("ADM2_NAME","Islamabad"));
map.addLayer(roi)