/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var gedi = ee.ImageCollection('users/potapovpeter/GEDI_V27')
.select('b1')
.filterBounds(table)
var chm = gedi.mean().toFloat().clip(table)
var forestCanopyHeightVis = {
  min: 0.0,
  max: 30.0,
  palette: [
    'ffffff', 'fcd163', '99b718', '66a000', '3e8601', '207401', '056201',
    '004c00', '011301'
  ],
};
Map.addLayer(chm, forestCanopyHeightVis, 'Forest Canopy Height');