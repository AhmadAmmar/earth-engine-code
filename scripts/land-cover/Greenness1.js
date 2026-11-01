var pk = ee.FeatureCollection('ft:1JwW_X9DK4a8fGq9kfgLCQho5ufYYc8nHhvGFhif0');
var pkC = ee.FeatureCollection('ft:1xNK5LVseyHLalE-EUly6SI42TFa0f0pfwSypzzJ4');

var landsats = ee.FeatureCollection([
  // we don't store geometry (null), only the properties (collection, nir, red, from and to) we need
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LT5_L1T_TOA'), nir: 'B4', red: 'B3', from: 1984, to: 1992 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LT4_L1T_TOA'), nir: 'B4', red: 'B3', from: 1992, to: 1994 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LT5_L1T_TOA'), nir: 'B4', red: 'B3', from: 1994, to: 1999 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LE7_L1T_TOA'), nir: 'B4', red: 'B3', from: 1999, to: 2003 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LT5_L1T_TOA'), nir: 'B4', red: 'B3', from: 2003, to: 2012 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LE7_L1T_TOA'), nir: 'B4', red: 'B3', from: 2012, to: 2013 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LC8_L1T_TOA'), nir: 'B5', red: 'B4', from: 2013, to: 2016 })
]);

function getLandsatByYear(year) {
  return landsats
    .filter(ee.Filter.and(
      // filter where passed year is lower than or equal 'from' property 
      ee.Filter.lte('from', year),
      // and filter where passed year is greater than 'to' property 
      ee.Filter.gt('to', year)
    ))
    // return first matching in order to return a single object
    .first();
}

var accumulateImages = function(year, imageCollection){
  // eg. 2006-06-01
  var startDate = ee.Date(ee.String(ee.Number(year).toInt()).cat(startDay));
  // eg. 2006-07-31
  var endDate = ee.Date(ee.String(ee.Number(year).toInt()).cat(endDay));
  var landsat = getLandsatByYear(year);
  
  // a collection of images for the passed year and an added ndvi band 
  var ndviCollection = ee.ImageCollection(landsat.get('collection'))
    .filterBounds(pk)
    .filterDate('2015-01-01', '2018-10-24')
    .filterMetadata('CLOUD_COVER', 'less_than', cloudCoverMax)
    .map(addNDVI(landsat));
    
  return ee.ImageCollection(imageCollection).merge(ndviCollection);
}

var yearList = ee.List.sequence(2015, 2018);
var resultCollection = yearList.iterate(accumulateImages, ee.ImageCollection([]));

function addNDVI(landsat) {
  return function(image) {
    return image.addBands(
      image.normalizedDifference([
        landsat.get('nir'), landsat.get('red')
      ]).rename('ndvi'));
  }
}

var red = image.select('B3');
var nearInfrared = image.select('B4');

image.addBands(
  nearInfrared.subtract(red).divide(nearInfrared.add(red)).rename('ndvi'));

var resultCollectionReduced = ee.ImageCollection(resultCollection)
  .select('ndvi')
  .reduce(ee.Reducer.median());
  
function addGreenamount(ndviReduced, threshold, feature){
  var ndviAll = ndviReduced.gte(-1);
  var ndviHigh = ndviReduced.gte(threshold);
  
  // count all pixels
  var allReducedSum = ndviAll.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: feature.geometry(),
    scale: 30
  });
  
  // count all pixels with an NDVI value >= passed threshold
  var partReducedSum = ndviHigh.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: feature.geometry(),
    scale: 30
  });
  
  var value_all = ee.Number(allReducedSum.get('ndvi_median'));
  var value_high = ee.Number(partReducedSum.get('ndvi_median'));
  
  // return amount of pixels with a NDVI value >= passed threshold
  return value_high.divide(value_all).multiply(100);
}

pkC = pkC.map(function(feature){
  return feature.set(
    'greenamount', addGreenamount(resultCollectionReduced, 0.45, feature)
  );
});

Export.image.toDrive({
  image: ndviRGB,
  description: 'pk_ndvi', 
  folder: 'folder_name',
  scale: 30,
  region: pk.geometry(),
  maxPixels: 130000000000,
});

Export.table(pkC, 'greencities_export', { fileFormat: 'GeoJSON' });

Export.table.toDrive({
  collection: pkC, 
  description: 'greencities_export',
  fileFormat: 'GeoJSON'
}); 