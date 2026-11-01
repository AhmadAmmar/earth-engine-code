var pakistan = ee.FeatureCollection("users/Fall2019/PakistanAdministrativeBoundaries");
var table = pakistan.filter(ee.Filter.eq("adm2_name","Karachi"));
Map.centerObject(table, 13);

var LC7_BANDS = [ 'B5',  'B4','pixel_qa']; //Landsat 4-7
var LC8_BANDS = ['B6',  'B5','pixel_qa']; //Landsat 8
var STD_NAMES = ['swir', 'nir','qa'];

var cloudmasklandsat7and5and8= function(image){
    var Qlandsat5and7= image.select('qa');
    var cloudShadowBitMask = (1 << 3);
    var cloudsBitMask = (1 << 5);
    var mask5and7=Qlandsat5and7.clip(table).bitwiseAnd(cloudShadowBitMask).eq(0)
                                   .and(Qlandsat5and7.bitwiseAnd(cloudsBitMask).eq(0));
    return image.updateMask(mask5and7);
};

var landsat4 = ee.ImageCollection('LANDSAT/LT04/C02/T1_L2').select(LC7_BANDS, STD_NAMES)
                  .filterDate('1984-01-01', '2012-12-31')
                  .filterBounds(table)
                  .filter(ee.Filter.lt('CLOUD_COVER', 25))
                 .map(cloudmasklandsat7and5and8);

var landsat5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').select(LC7_BANDS, STD_NAMES)
                  .filterDate('1984-01-01', '2012-12-31')
                  .filterBounds(table)
                  .filter(ee.Filter.lt('CLOUD_COVER', 25))
                 .map(cloudmasklandsat7and5and8);

var landsat7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2').select(LC7_BANDS, STD_NAMES)
                  .filterDate('1999-01-01', '2012-12-31')
                  .filterBounds(table)
                  .filter(ee.Filter.lt('CLOUD_COVER', 25))
                  .map(cloudmasklandsat7and5and8)
                  .map(function(image){
                    var filled1a = image.focal_mean(1, 'square', 'pixels', 2);
                    return filled1a.blend(image).toFloat();
                  });

var landsat8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').select(LC8_BANDS, STD_NAMES)
                  .filterDate('2013-01-01', '2020-10-01')
                  .filterBounds(table)
                  .filter(ee.Filter.lt('CLOUD_COVER', 25))
                 .map(cloudmasklandsat7and5and8);

var landsatimage = ee.ImageCollection(landsat4.merge(landsat5).merge(landsat7).merge(landsat8));

var addNDBI = function(image) {
  var ndbi = image.normalizedDifference(['swir', 'nir']).rename('NDBI');
  return image.addBands(ndbi);
};

var withNDBI = landsatimage.map(addNDBI);
var mergedNDBI = withNDBI.select(['NDBI']);

var collectYear = ee.ImageCollection.fromImages(ee.List.sequence(1984, 2020).map(function(y){
  var start = ee.Date.fromYMD(y, 1, 1);
  var end = start.advance(12, 'month');
  return mergedNDBI.filterDate(start, end).reduce(ee.Reducer.mean()).float();
}))

var nullimages = collectYear
    .map(function(image) {
      return image.set('count', image.bandNames().length());
    })
    .filter(ee.Filter.eq('count', 1));

var finalCollection = nullimages.map(function(image){
  return image.visualize({bands: ['NDBI_mean'], min: -1, max: 1, palette: [
    '#FFFFFF','#808080','#000000','#FF0000', '#800000', '#FFFF00', '#008000', '#00FFFF', '#0000FF', '#FF00FF', '#800080'  ]});
});

var gifParams = {
  'region': table.geometry().transform(),
  'dimensions': 1000,
  'crs': 'EPSG:4326',
  'framesPerSecond': 3,
  'maxPixels':13e15
};

print(finalCollection.getVideoThumbURL(gifParams));