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
};

var collection = ee.ImageCollection("COPERNICUS/S2")
  .filterBounds(pk)
  .filterDate('2018-04-01', '2018-09-16')
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 50)
  //.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 70))
  .map(sentinel2)
  .min()

Map.addLayer(collection, {bands:['B4', 'B3', 'B2'], min:0, max:3000});


/*Export.image.toDrive({
  image: mosaicNDVIAug,
  description: 'NDVI_Aug',
  scale: 10,
  region: mosaicNDVIAug.clip(pk),
  fileFormat: 'GeoTIFF',
  formatOptions: {
    cloudOptimized: true
  }
});*/