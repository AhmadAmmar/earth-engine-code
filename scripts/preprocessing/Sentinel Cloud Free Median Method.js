var pk = ee.FeatureCollection('ft:1NTBXHJXBZI53ljnoVa9iudFu1Uh-6mmPafN04dIG', 'geometry');
var s2 = ee.ImageCollection("COPERNICUS/S2");
var image = ee.Image(
  s2.filterBounds(pk)
    .filterDate('2018-08-01', '2018-08-31')
);
var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
};
var withNDVI = s2.map(addNDVI);
Map.addLayer(withNDVI, {bands:['B2', 'B3', 'B4'], min:0, max:3000});