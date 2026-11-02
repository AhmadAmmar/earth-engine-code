/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var elevation = ee.ImageCollection('JAXA/ALOS/AW3D30/V3_2').select('DSM').filterBounds(table.geometry());
var elevationVis = {
  min: 0,
  max: 10,
  palette: ['0000ff', '00ffff', 'ffff00', 'ff0000', 'ffffff']
};
Map.addLayer(elevation, elevationVis, 'Elevation');
