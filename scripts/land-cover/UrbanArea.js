var dist = ee.FeatureCollection('ft:1jOPCngvI9kH_0qbWUY6msMLQppEgArIAXaJPSvtd', 'geometry');

var data = ee.Image('JRC/GHSL/P2016/BUILT_LDSMT_GLOBE_V1');
var built = data.select(['built']);
var built2014 = built.eq(3);

var area = built2014.multiply(ee.Image.pixelArea());

var distBuilt = area.reduceRegions({
  collection: dist,
  reducer: ee.Reducer.sum(),
});

var polyOut = distBuilt.select(['.*'],null,false);

polyOut = polyOut.map(function(feature){
return feature.set('Year',2014);
});

Export.table.toDrive({
  collection: polyOut,
  description: 'distBuilt',
  folder: 'GEE',
  fileFormat: 'CSV'
});   