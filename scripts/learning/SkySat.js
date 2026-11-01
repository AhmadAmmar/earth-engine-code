/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var imageCollection = ee.ImageCollection("SKYSAT/GEN-A/PUBLIC/ORTHO/MULTISPECTRAL");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

var falseColor = imageCollection.select(['N', 'G', 'B']);
var falseColorVis = {
  min: 200.0,
  max: 6000.0,
};
Map.addLayer(falseColor, falseColorVis, 'False Color');