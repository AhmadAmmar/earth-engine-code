/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/Lhr");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var text = require('users/gena/packages:text');
var palettes = require('users/gena/packages:colorbrewer').Palettes;
var utils = require('users/gena/packages:utils');
var animation = require('users/gena/packages:animation')

Map.centerObject(table, 13);

var LC8_BANDS = ['B4',  'B5','pixel_qa']; //Landsat 8
var LC7_BANDS = ['B3',  'B4','pixel_qa']; //Landsat 7
var LC5_BANDS = [ 'B3',  'B4','pixel_qa']; //Llandsat 5
var STD_NAMES = ['red', 'nir','qa'];

var cloudmasklandsat7and5and8= function(image){
    var Qlandsat5and7= image.select('qa');
    var cloudShadowBitMask = (1 << 3);
    var cloudsBitMask = (1 << 5);
    var mask5and7=Qlandsat5and7.clip(table).bitwiseAnd(cloudShadowBitMask).eq(0)
                                   .and(Qlandsat5and7.bitwiseAnd(cloudsBitMask).eq(0));
    return image.updateMask(mask5and7);
};

var landsat8 = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR').select(LC8_BANDS, STD_NAMES)
                  .filterDate('2013-01-01', '2020-10-01')
                  .filterBounds(table)
                  .filter(ee.Filter.lt('CLOUD_COVER', 25))
                 .map(cloudmasklandsat7and5and8);

var landsat7 = ee.ImageCollection('LANDSAT/LE07/C01/T1_SR').select(LC7_BANDS, STD_NAMES)
                  .filterDate('1999-01-01', '2012-12-31')
                  .filterBounds(table)
                  .filter(ee.Filter.lt('CLOUD_COVER', 25))
                  .map(cloudmasklandsat7and5and8)
                  .map(function(image){
                    var filled1a = image.focal_mean(2, 'square', 'pixels', 4);
                    return filled1a.blend(image).toFloat();
                  });

var landsat5 = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR').select(LC7_BANDS, STD_NAMES)
                  .filterDate('1984-01-01', '2012-12-31')
                  .filterBounds(table)
                  .filter(ee.Filter.lt('CLOUD_COVER', 25))
                 .map(cloudmasklandsat7and5and8);

var landsatcolor={
  min: 0,
  max: 3000,
  gamma: 1.4,
};

var landsatimage = ee.ImageCollection(landsat5.merge(landsat7).merge(landsat8));

 var setNdviMinMax=function (img) {
  var minMax = img
    .select('NDVI')
    .reduceRegion({
      reducer: ee.Reducer.minMax(),
      scale: 30,
      maxPixels: 1e13
    });
    
  return img.set({
    'NDVI_min': minMax.get('NDVI_min'),
    'NDVI_max': minMax.get('NDVI_max'),
  }).toFloat();
};

var NDVI=function(image){
  var ndvi = image.addBands(image.normalizedDifference(['nir', 'red']).rename('NDVI'));
  return setNdviMinMax(ndvi).clip(table).toFloat();
};

  var ndviParams = {
  min: -1,
  max: 1.0,
  palette: [
    'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901',
    '66A000', '529400', '3E8601', '207401', '056201', '004C00', '023B01',
    '012E01', '011D01', '011301'
  ],
};

var landsatwithndvi=landsatimage.map(NDVI).filter(ee.Filter.notNull(['NDVI_min', 'NDVI_max']));

var addMinMaxBands=function (img) {
  var minMaxBands = ee.Image.constant([
    img.get('NDVI_min'),
    img.get('NDVI_max')])
    .rename(['NDVImin', 'NDVImax']);
  return img.clip(table).addBands(minMaxBands).toFloat();
};

var landsatNdviminmax = landsatwithndvi.map(addMinMaxBands).filterBounds(table);

var addFVband=function (img) {
  var ndvi = img.select('NDVI');
  var ndviMin = img.select('NDVImin');
  var ndviMax = img.select('NDVImax');
  var fvBand = ndvi
    .subtract(ndviMin)
    .divide(ndviMax.subtract(ndviMin))
    .rename('FV');
  return img.clip(table).addBands(fvBand).toFloat();
};

var landsatfv= landsatNdviminmax.map(addFVband);

var years = ee.List.sequence(1984, 2020);

var collectYear = ee.ImageCollection(years
  .map(function(y) {
    var start = ee.Date.fromYMD(y, 1, 1);
    var end = start.advance(12, 'month');
    return landsatfv.filterDate(start, end).reduce(ee.Reducer.mean()).float();
}));

var nullimages = collectYear
    .map(function(image) {
      return image.set('count', image.bandNames().length());
    })
    .filter(ee.Filter.eq('count', 7));

var finalCollection = nullimages.map(function(image){
  return image.select('NDVI_mean');
  });
print(finalCollection);

var gifParams = {
  'region': table.geometry().transform(),
  'dimensions': 1080,
  'crs': 'EPSG:4326',
  'framesPerSecond': 5
};

var annotations = [
  {position: 'right', offset: '1%', margin: '1%', property: 'label', scale: 200000} //large scale because image if of the whole world. Use smaller scale otherwise
  ]
  
function addText(image){
  
  var timeStamp = ee.Number(image.get('forecast_hours')).toByte(); // get the time stamp of each frame. This can be any string. Date, Years, Hours, etc.
  var timeStamp = ee.String('Year: ').cat(ee.String(timeStamp)).cat(ee.String('')); //convert time stamp to string 
  var image = image.visualize({ //convert each frame to RGB image explicitly since it is a 1 band image
      forceRgbOutput: true,
      min: -1,
      max: 1,
      palette: ['blue', 'purple', 'cyan', 'green', 'yellow', 'red']
    }).set({'label':timeStamp}); // set a property called label for each image
  
  var annotated = text.annotateImage(image, {}, table.geometry(), annotations); // create a new image with the label overlayed using gena's package

  return annotated 
}

var tempCol = finalCollection.map(addText) //add time stamp to all images
  
print(ui.Thumbnail(tempCol, gifParams)); //print gif