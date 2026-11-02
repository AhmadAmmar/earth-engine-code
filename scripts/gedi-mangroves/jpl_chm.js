/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var dataset = ee.Image('NASA/JPL/global_forest_canopy_height_2005');
var forestCanopyHeight = dataset.select('1').toFloat.clip(table);
var forestCanopyHeightVis = {
  min: 0.0,
  max: 30.0,
  palette: [
    'ffffff', 'fcd163', '99b718', '66a000', '3e8601', '207401', '056201',
    '004c00', '011301'
  ],
};
Map.addLayer(forestCanopyHeight, forestCanopyHeightVis, 'Forest Canopy Height');
