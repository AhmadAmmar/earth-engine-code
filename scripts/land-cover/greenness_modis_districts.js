var ndviCol = ee.ImageCollection("MODIS/006/MOD13Q1")
                    .select('NDVI')
                    .filterDate('2018-01-01', '2018-12-31');
print(ndviCol, 'ndviCol');

var medNDVI = ndviCol.reduce(ee.Reducer.median());

var dist = ee.FeatureCollection('ft:1wMQYVDvdza8PRvrOGfvS49yU9FaI-EzAfTHZuBcE', 'geometry');

var distNDVI = medNDVI.reduceRegions({
  collection: dist,
  reducer: ee.Reducer.median(),
  scale: 250
});
print(distNDVI);

var polyOut = distNDVI.select(['.*'],null,false);

polyOut = polyOut.map(function(feature){
return feature.set('Year',2018);
});

Export.table.toDrive({
  collection: polyOut,
  description: 'distNDVI',
  folder: 'GEE',
  fileFormat: 'CSV'
});   