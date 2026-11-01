/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var vegP = ee.Image("UMD/hansen/global_forest_change_2018_v1_6"),
    imageCollection = ee.ImageCollection("JRC/GSW1_0/YearlyHistory"),
    region = 
    /* color: #98ff00 */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[72.04611365425944, 32.33148955249925],
          [72.04611365425944, 31.964648643517585],
          [72.48213355172038, 31.964648643517585],
          [72.48213355172038, 32.33148955249925]]], null, false);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//Unsupervised Classification
var image = ee.Image('LANDSAT/LC08/C01/T1/LC08_150038_20130330')
    .clip(region)
    print(image)
Map.addLayer(image)

//Collect Training Data
var training = image.sample({
  region: region,
  scale: 30,
  numPixels: 5000
});

//Instantiate the cluster and train it
var clusterer = ee.Clusterer.wekaKMeans(5).train(training);

//Clustering input data using the trained clusterer
var result = image.cluster(clusterer);

Map.addLayer(result,{min:0,max:4,palette:['green','yellow','blue','red']});

var area = ee.Image.pixelArea().addBands(result).multiply(0.0000001).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: region,
  scale: 30
});
print(area)

//Loading Water Mask Dataset
var water = ee.Image('JRC/GSW1_0/YearlyHistory/31')
.clip(region);
print (water);

//Water Area Comparison in Product and Classified Image
var areaWater = ee.Image.pixelArea().addBands(water).multiply(0.0000001).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: region,
  scale: 30
});
print ('Area of Water Class is:',areaWater);

//Loading Vegetative Mask Dataset
var vegetation = ee.Image('UMD/hansen/global_forest_change_2018_v1_6')
.clip(region);
print(vegetation);

var treeCover = vegetation.select(['treecover2000']);
  
//Vegetative Area Comparison in Product and Classified Image
var areaVeg = ee.Image.pixelArea().addBands(treeCover).multiply(0.0000001).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: region,
  maxPixels: 1e13,
  scale: 30
});
print ('Area of Vegetation Class is:',areaVeg);