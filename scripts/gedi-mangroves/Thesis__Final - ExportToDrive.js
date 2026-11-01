/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var AGBfromObsAGBwithRH = ee.Image("users/ahmadammargeo/AGB/AGBfromObsAGBwithRH").clip(indus.geometry());

Export.image.toDrive({
  image: AGBfromObsAGBwithRH,
  description: 'AGBfromObsAGBwithRH',
  folder: 'GEE',
  scale: 10,
  maxPixels: 1e13,
  region: indus.geometry(),
  fileFormat: 'GeoTIFF'
});