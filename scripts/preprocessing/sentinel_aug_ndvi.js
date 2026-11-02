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

var addNDVI = function(im) {
  var ndvi = im.normalizedDifference(['B8', 'B4']).rename('NDVI_Aug');
  return im.addBands(ndvi);
};

var collection = ee.ImageCollection("COPERNICUS/S2")
  .filterBounds(pk.geometry().bounds())
  .filterDate('2018-08-01', '2018-8-31')
  //.filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 70)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 70))
  .map(sentinel2);

var withNDVI = collection.map(addNDVI);

var NDVI_Aug = withNDVI.select('NDVI_Aug');

var mosaicNDVIAug = NDVI_Aug.mosaic();

Map.addLayer(mosaicNDVIAug, {bands:['NDVI_Aug'], min:-1, max:1});


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