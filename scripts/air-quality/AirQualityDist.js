// Helper function to convert image collection into stack of image bands
function newCollectionToImage(collection){
var stack = ee.Image(collection.iterate(function(img, prev) {
return ee.Image(prev).addBands(img);
}, ee.Image(1)));
 
stack = stack.select(ee.List.sequence(1, stack.bandNames().size().subtract(1)));
return stack;
}

var dist = ee.FeatureCollection('ft:1jOPCngvI9kH_0qbWUY6msMLQppEgArIAXaJPSvtd', 'geometry');
//Map.centerObject(dist)
//Map.addLayer (dist)

var air = ee.ImageCollection("COPERNICUS/S5P/NRTI/L3_CO")
  .select('CO_column_number_density')
  .filterDate('2019-01-01', '2019-11-20');
  
var graph = ui.Chart.image.seriesByRegion({
imageCollection: air,
regions: dist, 
reducer: ee.Reducer.mean(),
scale: 30,
})
print(graph)

/*var dist_geo = dist.geometry()
//print(ui.Chart.image.series(collection, dist_geo, ee.Reducer.mean(), 30));
//var dist_mean = collection.mean()

// create single image from collection
var airImg = newCollectionToImage(air);

var distAir = airImg.reduceRegions({
  collection: dist,
  reducer: ee.Reducer.mean(),
  scale:30,
//  maxPixels: 1e13
});

var polyOut = distAir.select(['.*'],null,false);

polyOut = polyOut.map(function(feature){
return feature.set('Year',2019);
});

Export.table.toDrive({
  collection: polyOut,
  description: 'distAir',
  folder: 'GEE',
  fileFormat: 'CSV'
});*/