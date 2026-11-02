/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var date = ee.Filter.date('2020-01-01','2020-03-31')
function toGamma0(image) {
 var vh = image.select('VH').subtract(image.select('angle')
 .multiply(Math.PI/180.0).cos().log10().multiply(10.0));
 return image.addBands(image.select('VV').subtract(image.select('angle')
 .multiply(Math.PI/180.0).cos().log10().multiply(10.0)));
}
var maskAngGT30 = function(image) {
 var ang = image.select(['angle']);
 return image.updateMask(ang.gt(30));
};
var maskAngLT45 = function(image) {
 var ang = image.select(['angle']);
 return image.updateMask(ang.lt(45));
};

var S1 = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterBounds(guyane)
.filterDate(date)
.select(["VH","VV","angle"])
.map(toGamma0)
.map(maskAngGT30)
.map(maskAngLT45)

