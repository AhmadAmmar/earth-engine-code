/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var region = 
    /* color: #98ff00 */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[72.92707670881236, 33.719943683497505],
          [72.92707670881236, 33.52325211271757],
          [73.18525541974986, 33.52325211271757],
          [73.18525541974986, 33.719943683497505]]], null, false),
    vegP = ee.Image("UMD/hansen/global_forest_change_2018_v1_6"),
    imageCollection = ee.ImageCollection("JRC/GSW1_0/YearlyHistory"),
    table = ee.FeatureCollection("users/ahmadammargeo/shapefiles");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//Unsupervised Classification
var image = ee.Image('LANDSAT/LC8_L1T_TOA/LC81500372015135LGN00')
    .clip(region)
print(image) 
Map.addLayer(image)
//make training datasets
var training = image.sample({
  region: region,
  scale: 30,
  numPixels: 5000
});
//Instantiate the cluster and train it
// Instantiate the clusterer and train it.
var clusterer = ee.Clusterer.wekaKMeans(5).train(training);

// Cluster the input using the trained clusterer.
var result = image.cluster(clusterer);

Map.addLayer(result,{min:0,max:4,palette:['green','yellow','blue','red']});

var area = ee.Image.pixelArea().addBands(result).multiply(0.0000001).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: region,
  scale: 30
});
print (area)

//Map.addLayer(imageCollection.clip(region));
/*var w = ee.ImageCollection('JRC/GSW1_0/YearlyHistory')
.filterBounds(region)
    .filterDate('2015-01-01', '2015-12-31')
print(w) 
Map.addLayer(w)
*/
var wat = ee.Image('JRC/GSW1_0/YearlyHistory/31')
.clip(region)
print (wat)
Map.addLayer(wat)
// water area comparison
var areawater = ee.Image.pixelArea().addBands(wat).multiply(0.0000001).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: region,
  scale: 30
});
print ('area of water class',areawater);

var veg =ee.Image('UMD/hansen/global_forest_change_2018_v1_6')
   .clip(region)
  print(veg);
// vegetation area comparison
var areaveg = ee.Image.pixelArea().addBands(wat).multiply(0.0000001).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: region,
  scale: 30
});
print ('area of Vegetation class',areaveg);