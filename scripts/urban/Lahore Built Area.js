var pakistan = ee.FeatureCollection("users/Fall2019/PakistanAdministrativeBoundaries");
var table = pakistan.filter(ee.Filter.eq("adm2_name","Lahore"));
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;

var collection = ee.ImageCollection("COPERNICUS/S2")
  .filter(ee.Filter.date('2021-11-01', '2022-01-31'))
  .filterBounds(table)
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');

var composite = ee.Image(collection.median()).clip(table);

var addIndices = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename(['ndvi']);
  var ndbi = image.normalizedDifference(['B11', 'B8']).rename(['ndbi']);
  var mndbi = image.normalizedDifference(['B12', 'B8']).rename(['mndbi']);
  var mndwi = image.normalizedDifference(['B3', 'B11']).rename(['mndwi']); 
  var bsi = image.expression(
      '(( X + Y ) - (A + B)) /(( X + Y ) + (A + B)) ', {
        'X': image.select('B11'), //swir1
        'Y': image.select('B4'),  //red
        'A': image.select('B8'), // nir
        'B': image.select('B2'), // blue
  }).rename('bsi');
  return image.addBands(ndvi).addBands(ndbi).addBands(mndwi).addBands(bsi).addBands(mndbi)
}

var composite = addIndices(composite);

var collectionVVAsc = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2021-11-01', '2022-01-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('VV');

var collectionVVDes = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2021-11-01', '2022-01-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('VV');

var collectionVHAsc = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2021-11-01', '2022-01-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('VH');

var collectionVHDes = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2021-11-01', '2022-01-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('VH');

var VVAsc = collectionVVAsc.mean().focal_median().clip(table).rename(['VVAsc'])
var VVDes = collectionVVDes.mean().focal_median().clip(table).rename(['VVDes'])
var VHAsc = collectionVHAsc.mean().focal_median().clip(table).rename(['VHAsc'])
var VHDes = collectionVHDes.mean().focal_median().clip(table).rename(['VHDes'])

composite = composite.addBands(VVAsc).addBands(VVDes).addBands(VHAsc).addBands(VHDes)
// print(composite)

// function normalize(image){
//   var bandNames = image.bandNames();
//   var minDict = image.reduceRegion({
//     reducer: ee.Reducer.min(),
//     geometry: table,
//     scale: 10,
//     maxPixels: 13e9,
//     bestEffort: true,
//     tileScale: 16
//   });
//   var maxDict = image.reduceRegion({
//     reducer: ee.Reducer.max(),
//     geometry: table,
//     scale: 10,
//     maxPixels: 13e9,
//     bestEffort: true,
//     tileScale: 16
//   });
//   var mins = ee.Image.constant(minDict.values(bandNames));
//   var maxs = ee.Image.constant(maxDict.values(bandNames));

//   var normalized = image.subtract(mins).divide(maxs.subtract(mins))
//   return normalized
// }

// var composite = normalize(composite);

var training = composite.sample({
  region: table,
  scale: 10,
  numPixels: 500,
  tileScale: 16
});
var clusterer = ee.Clusterer.wekaKMeans(4).train(training);
var result = composite.cluster(clusterer);
var Urban = result.select('cluster').eq(2);

var areaImage = Urban.multiply(ee.Image.pixelArea())
var area = areaImage.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: table.geometry(),
  scale: 10,
  maxPixels: 13e9
  })
print(area)

//Map.addLayer(result.randomVisualizer(), {}, 'clusters');

//var Urban= result.remap([2],[1]).rename('Urban');
//var Bare=result.remap([2],[2], 0, 'cluster').rename('Bare');
//var Vegetation=result.remap([1],[3], 0, 'cluster').rename('Vegetation');
//var Water=result.remap([3],[4], 0, 'cluster').rename('Water');

Map.addLayer(Urban.selfMask(),{min: 1, max: 1, palette:['pink']},'Urban');
//Map.addLayer(Water,{},'Water');
//Map.addLayer(Vegetation,{},'Vegetation');
//Map.addLayer(Bare,{},'Bare');