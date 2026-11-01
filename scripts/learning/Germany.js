// tables with germany shape and the cities we are using in our application
var germany = ee.FeatureCollection('ft:1ZiNS-qJAOHk2pdvGhSQI4Pl_jzFizaqcMGDhLHyl')
var cities = ee.FeatureCollection('ft:1wMQYVDvdza8PRvrOGfvS49yU9FaI-EzAfTHZuBcE');

// landsat properties we need to create our image collection over different years
// we use a feature collection here, because we can easily filter it 
var landsats = ee.FeatureCollection([
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LT5_L1T_TOA'), nir: 'B4', red: 'B3', from: 1984, to: 1992 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LT4_L1T_TOA'), nir: 'B4', red: 'B3', from: 1992, to: 1994 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LT5_L1T_TOA'), nir: 'B4', red: 'B3', from: 1994, to: 1999 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LE7_L1T_TOA'), nir: 'B4', red: 'B3', from: 1999, to: 2003 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LT5_L1T_TOA'), nir: 'B4', red: 'B3', from: 2003, to: 2012 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LE7_L1T_TOA'), nir: 'B4', red: 'B3', from: 2012, to: 2013 }),
  ee.Feature(null, { collection: ee.ImageCollection('LANDSAT/LC8_L1T_TOA'), nir: 'B5', red: 'B4', from: 2013, to: 2016 })
]);

// color palette preview: http://gka.github.io/palettes/#colors=#101721,#282e36,#2f423d,#345744,#376d4b,#398552,#399b58,#37b35e,#30cc64,#24e56a,#00ff70|steps=11|bez=0|coL=0
var palette = ['#101721','#282e36', '#2f423d', '#345744', '#376d4b', '#398552', '#399b58', '#37b35e', '#30cc64', '#24e56a', '#00ff70'];

var startYear = 2005;
var endYear = 2015;
var startDay = '-06-01';
var endDay = '-07-31';
var ndviThresholdMin = 0.45;
var ndviThresholdMax = 0.8;
var cloudCoverMax = 5;
var yearList = ee.List.sequence(startYear, endYear);

Map.setCenter(10.5, 51.3, 6);

// create an image collection with images between 
// start- and endyear in summer months for germany
var accumulateImages = function(year, imageCollection){
  var startDate = ee.Date(ee.String(ee.Number(year).toInt()).cat(startDay));
  var endDate = ee.Date(ee.String(ee.Number(year).toInt()).cat(endDay));
  var landsat = getLandsatByYear(year);
  
  var ndviCollection = ee.ImageCollection(landsat.get('collection'))
    .filterBounds(germany)
    .filterDate(startDate, endDate)
    .filterMetadata('CLOUD_COVER', 'less_than', cloudCoverMax)
    .map(addNDVI(landsat));
    
  return ee.ImageCollection(imageCollection).merge(ndviCollection);
}

var resultCollection = yearList.iterate(accumulateImages, ee.ImageCollection([]));
resultCollection = ee.ImageCollection(resultCollection);

print(resultCollection);


// to crossvalidate our result, we can randomly filter out 10% of the images
// resultCollection = resultCollection
//  .randomColumn('random')
//  .sort('random')
//  .limit(resultCollection.size().multiply(0.9).toInt());


// create collection that only has the ndvi band
// and reduce that collection to one image with the median reducer
var resultCollectionReduced = ee.ImageCollection(resultCollection)
  .select('ndvi')
  .reduce(ee.Reducer.median());

// add greenamount and center properties for all cities 
cities = cities.map(function(feature){
    feature = feature.set('center', ee.Feature(feature.centroid()).geometry().coordinates());
    return feature.set('greenamount', addGreenamount(resultCollectionReduced, 0.45, feature));
  });

// export data as geojson
Export.table(cities, 'greencities_export', { fileFormat: 'GeoJSON' });

// add clipped layer to the map
Map.addLayer(
  resultCollectionReduced.clip(germany), 
  { min: ndviThresholdMin, max: ndviThresholdMax, palette: palette }, 
  'NDVI map'
);

var ndviRGB = resultCollectionReduced.visualize({
  min: ndviThresholdMin,
  max: ndviThresholdMax,
  palette: palette
});

// export colored shape of germany
Export.image(ndviRGB, 'germany_ndvi', {
  scale: 30,
  region: germany.geometry(),
  maxPixels: 130000000000
});



// helper functions 

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

// add greenamount for a specific threshold for a feature
function addGreenamount(ndviReduced, threshold, feature){
  var ndviAll = ndviReduced.gte(-1);
  var ndviHigh = ndviReduced.gte(threshold);
  
  var allReducedSum = ndviAll.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: feature.geometry(),
    scale: 30
  });

  var partReducedSum = ndviHigh.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: feature.geometry(),
    scale: 30
  });
  
  var value_all = ee.Number(allReducedSum.get('ndvi_median'));
  var value_high = ee.Number(partReducedSum.get('ndvi_median'));
  
  return value_high.divide(value_all).multiply(100);
}


// returns an image with a new ndvi band with the given landsat bands  
function addNDVI(landsat) {
  return function(image) {
    return image.addBands(image.normalizedDifference([landsat.get('nir'), landsat.get('red')]).rename('ndvi'));
  }
}