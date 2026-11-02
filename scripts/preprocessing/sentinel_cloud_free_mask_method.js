var pk = ee.FeatureCollection('ft:1NTBXHJXBZI53ljnoVa9iudFu1Uh-6mmPafN04dIG', 'geometry');

var computeQAbits = function(image, start, end, newName) {
    var pattern = 0;

    for (var i=start; i<=end; i++) {
        pattern += Math.pow(2, i);
    }

    return image.select([0], [newName]).bitwiseAnd(pattern).rightShift(start);
};

var sentinel2 = function(image) {

  var cloud_mask = image.select("QA60");
  var opaque = computeQAbits(cloud_mask, 10, 10, "opaque");
  var cirrus = computeQAbits(cloud_mask, 11, 11, "cirrus");
  var mask = opaque.or(cirrus);

  return image.updateMask(mask.not());
}

var collection = ee.ImageCollection("COPERNICUS/S2")
  .filterBounds(pk)
  .filterDate('2018-08-01', '2018-8-31')
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 70)
  .map(sentinel2);
var image = ee.Image(collection.min());
Map.addLayer(image, {bands:['B2', 'B3', 'B4'], min:0, max:3000});