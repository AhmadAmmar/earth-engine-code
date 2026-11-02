/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var dataset = ee.FeatureCollection("GLIMS/20171027");
/***** End of imports. If edited, may not auto-convert in the playground. *****/

var visParams = {
  palette: ['gray', 'cyan', 'blue'],
  min: 0.0,
  max: 10.0,
  opacity: 0.8,
};
var image = dataset.reduceToImage(['area'], ee.Reducer.first());
Map.setCenter(-35.618, 66.743, 7);
Map.addLayer(image, visParams, 'GLIMS/20171027');

Export.table.toDrive({
  collection: dataset,
  description:'vectorsToDriveExample',
  fileFormat: 'SHP'
});

Export.image.toDrive({
  image: elevcountry,
  region: justcountry.geometry().bounds(),
  description: 'elev',
  scale: 30, //pixel size specified 
  maxPixels: 1e12
});