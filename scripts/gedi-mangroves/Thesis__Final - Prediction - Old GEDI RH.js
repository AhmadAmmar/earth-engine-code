/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var indus = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    height = ee.FeatureCollection("users/ahmadammargeo/indusCanopyHeight"),
    table = ee.FeatureCollection("users/ahmadammargeo/rhQualitySamples/rh98quality15k");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var spectral = require('users/dmlmont/spectral:spectral');
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
//var date = ee.Filter.date('2019-10-01','2020-06-30')
//var date = ee.Filter.date('2019-11-01','2020-05-31')
var date = ee.Filter.date('2019-12-01','2020-04-30')
//var date = ee.Filter.date('2020-01-01','2020-03-31')
//var date = ee.Filter.date('2020-02-01','2020-02-29')

var col = ee.ImageCollection("COPERNICUS/S2_SR")
  .filter(date)
  .filterBounds(indus)
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');

var collectionAsc = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(date)
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(indus)

// var collectionDes = ee.ImageCollection('COPERNICUS/S1_GRD')
// .filter(date)
// .filter(ee.Filter.eq('instrumentMode', 'IW'))
// .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
// .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
// .filterMetadata('resolution_meters', 'equals' , 10)
// .filterBounds(indus)

var s2mosaic = ee.Image(col.median()).toFloat().clip(indus);

var minMax = s2mosaic.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: indus.geometry(),
  scale: 10,
  maxPixels: 13e9,
  bestEffort: true
  //tileScale: 16
}); 

var s2normalized = ee.ImageCollection.fromImages(
  s2mosaic.bandNames().map(function(name){
    name = ee.String(name);
    var band = s2mosaic.select(name);
    return band.unitScale(ee.Number(minMax.get(name.cat('_min'))), ee.Number(minMax.get(name.cat('_max'))))
})).toBands().rename(s2mosaic.bandNames());

var B = s2normalized.select('B2');
var G = s2normalized.select('B3');
var R = s2normalized.select('B4');
var R1 = s2normalized.select('B5');
var R2 = s2normalized.select('B6');
var R3 = s2normalized.select('B7');
var N = s2normalized.select('B8');
var R4 = s2normalized.select('B8A');
var S1 = s2normalized.select('B11');
var S2 = s2normalized.select('B12');

var NDVI = s2normalized.normalizedDifference(['B8', 'B4']).rename('NDVI')
var NDVI_B86 = s2normalized.normalizedDifference(['B8', 'B6']).rename('NDVI_B86')
var NDVI_B87 = s2normalized.normalizedDifference(['B8', 'B7']).rename('NDVI_B87')
var GNDVI = s2normalized.normalizedDifference(['B8', 'B3']).rename('GNDVI')
var MNDVI = s2normalized.normalizedDifference(['B8', 'B12']).rename('MNDVI')
var NDMI = s2normalized.normalizedDifference(['B8', 'B11']).rename('NDMI')
var NDRE1  = s2normalized.normalizedDifference(['B8', 'B5']).rename('NDRE1')
var NDRE2  = s2normalized.normalizedDifference(['B7', 'B5']).rename('NDRE2')
var RENDVI1 = s2normalized.normalizedDifference(['B5', 'B4']).rename('RENDVI1')
var RENDVI2 = s2normalized.normalizedDifference(['B6', 'B5']).rename('RENDVI2')
var NDWI = s2normalized.normalizedDifference(['B3', 'B12']).rename('NDWI')
var MNDWI = s2normalized.normalizedDifference(['B3', 'B11']).rename('MNDWI')
var NGRDI = s2normalized.normalizedDifference(['B3', 'B4']).rename('NGRDI')
var RGVI = s2normalized.normalizedDifference(['B4', 'B3']).rename('RGVI')
var NBR2 = s2normalized.normalizedDifference(['B11', 'B12']).rename('NBR2')

var DVI = N.subtract(R).rename('DVI')
var GDVI = N.subtract(G).rename('GDVI')
var RVI = N.divide(R).rename('RVI')
var RGR = R.divide(G).rename('RGR')
var NGR = N.divide(G).rename('NGR')
var SGR = S1.divide(G).rename('SGR')
var SNR = S1.divide(G).rename('SNR')
var S1RR = S1.divide(R).rename('S1RR')
var S1NR = S1.divide(N).rename('S1NR')
var S2RR = S2.divide(R).rename('S2RR')
var S2NR = S2.divide(N).rename('S2NR')
var S1S2R = S1.divide(S2).rename('S1S2R')
var S2S1R = S2.divide(S1).rename('S2S1R')
var NS1R = N.divide(S1).rename('NS1R')
var NS2R = N.divide(S2).rename('NS2R')

var LCI = N.subtract(R1).divide(N.add(R)).rename('LCI')
var RECI = (R1.divide(R2)).subtract(1).rename('RECI')
var IPVI = N.divide(N.add(R)).rename('IPVI')
//var VARI = G.subtract(R).divide(G.add(R).subtract(B)).rename('VARI')

var EVI = s2normalized.expression ('float (2.5 * ((N - R) / (N + 6 * R - 7.5 * B + 1)))', {
  'N': N,
  'B': B, 
  'R': R}).rename('EVI')

var ARVI = s2normalized.expression ('float ((N - R - 0.069 * (R - B)) / (N + R - 0.069 * (R - B)))',{
  'N': N,
  'B': B, 
  'R': R}).rename('ARVI')

var ARVI2 = s2normalized.expression ('float (-0.18 + 1.17 * ((N-R)/(N+R)))',{
  'N': N,
  'B': B, 
  'R': R}).rename('ARVI2')
  
var SAVI = s2normalized.expression ('float ((N - R) / (N + R + 0.5) * (1.0 + 0.5))',{
  'N': N,
  'R': R}).rename('SAVI')
  
var GSAVI = s2normalized.expression ('float ((N - G) / (N + G + 0.482) * (1 + 0.482))',{
  'N': N,
  'G': G}).rename('GSAVI')
  
var MSAVI = s2normalized.expression ('float ((2.0 * N + 1.0 - sqrt(pow((2.0 * N + 1.0), 2.0) - 8.0 * (N - R))) / 2.0)',{
  'N': N,
  'R': R}).rename('MSAVI')
  
var MSR = s2normalized.expression ('float ((N / R - 1.0) / sqrt(N / R + 1.0))',{
  'N': N,
  'R': R}).rename('MSR')

var CVI = s2normalized.expression ('float (N * R / pow(G, 2.0))',{
  'N': N,
  'R': R,
  'G': G}).rename('CVI')
  
var coefficients = ee.Array([
[0.3029, 0.2786, 0.4733, 0.5599, 0.508, 0.1872],
[-0.2941, -0.243, -0.5424, 0.7276, 0.0713, -0.1608],
[0.1511, 0.1973, 0.3283, 0.3407, -0.7117, -0.4559],
[-0.8239, 0.0849, 0.4396, -0.058, 0.2013, -0.2773],
[-0.3294, 0.0557, 0.1056, 0.1855, -0.4349, 0.8085],
[0.1079, -0.9023, 0.4119, 0.0575, -0.0259, 0.0252]]);

var optical = s2mosaic.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
var arrayImage1D = optical.toArray();
var arrayImage2D = arrayImage1D.toArray(1);
var TC = ee.Image(coefficients)
.matrixMultiply(arrayImage2D)
.arrayProject([0])
.arrayFlatten([['TCB', 'TCG', 'TCW', 'TC4', 'TC5', 'TC6']]);
var TCB = TC.select('TCB');
var TCG = TC.select('TCG');
var TCW = TC.select('TCW');
var TC4 = TC.select('TC4');
var TC5 = TC.select('TC5');
var TC6 = TC.select('TC6');

// var optInd = ee.Image([NDVI, NDVI_B86, NDVI_B87, GNDVI, MNDVI, NDMI, NDRE1, NDRE2, RENDVI1, 
// RENDVI2, NDWI, MNDWI, NGRDI, RGVI, NBR2, DVI, GDVI, RVI, RGR, NGR, SGR, SNR, S1RR, S1NR, 
// S2RR, S2NR, S1S2R, S2S1R, NS1R, NS2R, LCI, RECI, IPVI, EVI, ARVI, ARVI2, SAVI, GSAVI, 
// MSAVI, MSR, CVI, TC]); //VARI

var VVAsc = collectionAsc.select('VV').mean().focal_median().toFloat().clip(indus).rename('VVAsc')
var VHAsc = collectionAsc.select('VH').mean().focal_median().toFloat().clip(indus).rename('VHAsc')
//var VVDes = collectionDes.select('VV').mean().focal_median().toFloat().clip(indus).rename('VVDes')
//var VHDes = collectionDes.select('VH').mean().focal_median().toFloat().clip(indus).rename('VHDes')

//var SAR = ee.Image([VVAsc, VVDes, VHAsc, VHDes]);

var VVdVHAsc = VVAsc.divide(VHAsc).rename('VVdVHAsc')
var VHdVVAsc = VHAsc.divide(VVAsc).rename('VHdVVAsc')
//var VVdVHDes = VVDes.divide(VHDes).rename('VVdVHDes')
//var VHdVVDes = VHDes.divide(VVDes).rename('VHdVVDes')

var VVmVHAsc = VVAsc.subtract(VHAsc).rename(['VVmVHAsc'])
var VHmVVAsc = VHAsc.subtract(VVAsc).rename(['VHmVVAsc'])
//var VVmVHDes = VVDes.subtract(VHDes).rename(['VVmVHDes'])
//var VHmVVDes = VHDes.subtract(VVDes).rename(['VHmVVDes'])

var NDBIAsc = VVAsc.subtract(VHAsc).divide(VVAsc.add(VHAsc)).rename('NDBIAsc')
var DpRVIVVAsc = VHAsc.multiply(4).divide(VVAsc.add(VHAsc)).rename('DpRVIVVAsc')
//var NDBIDes = VVDes.subtract(VHDes).divide(VVDes.add(VHDes)).rename('NDBIDes')
//var DpRVIVVDes = VHDes.multiply(4).divide(VVDes.add(VHDes)).rename('DpRVIVVDes')

//var sarInd = ee.Image([VVdVHAsc, VHdVVAsc, VVdVHDes, VHdVVDes, VVmVHAsc, VHmVVAsc, VVmVHDes, VHmVVDes, NDBIAsc, NDBIDes, DpRVIVVAsc, DpRVIVVDes]);

// var DEM = ee.Image('NASA/NASADEM_HGT/001').select('elevation').clip(indus);
// var terrain = ee.Terrain.products(DEM);
// var JPLCHM = ee.Image('NASA/JPL/global_forest_canopy_height_2005').select('1').clip(indus).rename('JPLCHM');
// var gedi = ee.ImageCollection('users/potapovpeter/GEDI_V27').select('b1').filterBounds(indus)
// var GEDICHM = gedi.mean().toFloat().clip(indus).rename('GEDICHM')

//var composite = s2normalized.addBands(optInd).addBands(SAR).addBands(sarInd)//.addBands(terrain).addBands(JPLCHM).addBands(GEDICHM)
//var composite = ee.Image([RVI, NGR, MSR, MSAVI, RENDVI1, TCG, DVI, CVI, SAVI, S1RR, NDRE2, R1, LCI, VHAsc, S1, NDRE1, NDVI_B86, NDVI_B87, TC4, VHDes, VVDes, S2, VVAsc, ARVI2, R, IPVI, NDVI, NDWI, S2S1R, TC5]); //.63
//var composite = ee.Image([NGR, MSAVI, RENDVI1, TCG, DVI, CVI, SAVI, S1RR, NDRE2, R1, LCI, VHAsc, S1, NDRE1, NDVI_B86, NDVI_B87, TC4, VHDes, VVDes, S2, VVAsc, ARVI2, R, NDVI, NDWI, S2S1R, TC5]); //.64
//var composite = ee.Image([NGR, RENDVI1, DVI, CVI, SAVI, S1RR, NDRE2, R1, LCI, VHAsc, S1, NDRE1, NDVI_B86, NDVI_B87, TC4, S2, VVAsc, ARVI2, R, NDVI, NDWI, S2S1R, TC5]); //.64
// var composite = ee.Image([B, G, R, N, R1, R2, R3, R4, S1, S2, TCB, TCG, TCW, TC4, TC5, TC6,
// NDVI, NDVI_B86, NDVI_B87, GNDVI, MNDVI, NDMI, NDRE1, NDRE2, RENDVI1, RENDVI2, NDWI, MNDWI, NGRDI, RGVI, NBR2, DVI, GDVI, RVI, RGR, NGR, SGR, SNR, S1RR, S1NR, S2RR, S2NR, S1S2R, S2S1R, NS1R, NS2R, LCI, RECI, IPVI, EVI, ARVI, ARVI2, SAVI, GSAVI, MSAVI, MSR, CVI,
// VVAsc, VVDes, VHAsc, VHDes, VVdVHAsc, VHdVVAsc, VVdVHDes, VHdVVDes, VVmVHAsc, VHmVVAsc, VVmVHDes, VHmVVDes, NDBIAsc, NDBIDes, DpRVIVVAsc, DpRVIVVDes]);
//var composite = ee.Image([NDRE2, VHDes, RECI, S1, NDVI_B87, LCI, RENDVI2, R1, VHAsc, TC5]); //.63
//var composite = ee.Image([NDRE2, VHDes, RECI, S1, NDVI_B87, LCI, RENDVI2, R1, VHAsc, TC5, NDRE1, S2, NDVI_B86, TCB, SGR, MNDWI, GDVI, SNR, NDWI, R4]); //.58
//var composite = ee.Image([NDRE2, VHDes, RECI, S1, NDVI_B87, LCI, RENDVI2, R1, VHAsc, TC5, RVI, NGR, MSR, MSAVI, RENDVI1, TCG, DVI, CVI, SAVI, S1RR]); //.61
//var composite = ee.Image([NDRE2, VHDes, RECI, S1, NDVI_B87, LCI, RENDVI2, R1, VHAsc, TC5, RVI, NGR, RENDVI1, CVI, S1RR]); //.64

var composite = ee.Image([NGR, MSAVI, RENDVI1, TCG, DVI, CVI, SAVI, S1RR, NDRE2, R1, LCI, VHAsc, S1, NDRE1, NDVI_B86, NDVI_B87, TC4, S2, VVAsc, ARVI2, R, NDVI, NDWI, S2S1R, TC5]); //.66

var minMax = composite.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: indus.geometry(),
  scale: 10,
  maxPixels: 13e9,
  bestEffort: true
  //tileScale: 16
}); 

var allNormalized = ee.ImageCollection.fromImages(
  composite.bandNames().map(function(name){
    name = ee.String(name);
    var band = composite.select(name);
    return band.unitScale(ee.Number(minMax.get(name.cat('_min'))), ee.Number(minMax.get(name.cat('_max'))))
})).toBands().rename(composite.bandNames());

var bands = allNormalized.bandNames()
var input = allNormalized.select(bands)

// var sample = table.randomColumn()
// var split = 0.8
// var training = sample.filter(ee.Filter.lt('random', split))
// var val = sample.filter(ee.Filter.gte('random', split))

var trainingSample = input.sampleRegions({
  collection: table, //training,
  properties: ["rh98"],
  scale: 10,
});

var classifier = ee.Classifier.smileRandomForest(300).train(trainingSample,"rh98", bands).setOutputMode('REGRESSION');
var classification = input.classify(classifier).clip(indus.geometry()).updateMask(NDVI.gte(0.1)).rename('rh98');

var regressionSample = classification.sampleRegions({
  collection: height,
  properties: ["Height"],
  scale: 10,
});

Export.table.toDrive({
  collection: regressionSample,
  description: 'OldValCHM300',
  folder: 'GEE',
  fileFormat: 'CSV'
})

// print(ui.Chart.feature.byFeature({
//   features: regressionSample, 
//   xProperty: 'Height', 
//   yProperties: ['classification']
// }).setOptions({
//   title: "Validation of gap filled rh98 against observed canopy height",
//   hAxis: {title: 'Observed height'},
//   vAxis: {title: 'Predicted rh98'},
//   colors: ['#EF851C'],
//   pointSize: 3,
//   lineWidth: 0,
//   trendlines: { 
//     0: { 
//       type: 'linear', 
//       visibleInLegend: true,
//       showR2: true,
//       color: 'black',
//       opacity: 1,
//       lineWidth: 2,
//       pointSize: 0
//     } 
//   }  
// }));

// var gediVis = {
//   min: 1,
//   max: 10,
//   palette: 'darkred,red,orange,green,darkgreen',
// };
// Map.addLayer(classification, gediVis, 'classification');

// var CHM = ((classification).multiply(1.4143)).add(-1.5135);

// Export.image.toAsset({
//   image: classification,
//   description: 'gapFilledGEDIrh98',
//   assetId: 'gapFilledGEDIrh98',
//   scale: 10,
//   maxPixels: 13e9,
// });

// Export.image.toAsset({
//   image: CHM,
//   description: 'validatedCHM',
//   assetId: 'validatedCHM',
//   scale: 10,
//   maxPixels: 13e9,
// });

// var regressionSample = classification.sampleRegions({
//   collection: height,
//   properties: ["Height"],
//   scale: 10,
// });

// Export.table.toDrive({
//   collection: regressionSample,
//   description: 'regressionSample',
//   folder: 'GEE',
//   fileFormat: 'CSV'
// })

// // FEATURE IMPORTANCE
// var dict = classifier.explain();
// var variable_importance = ee.Feature(null, ee.Dictionary(dict).get('importance'));
// var chart =
//   ui.Chart.feature.byProperty(variable_importance)
//     .setChartType('ColumnChart')
//     .setOptions({
//       title: 'Random Forest Variable Importance',
//       legend: {position: 'none'},
//       hAxis: {title: 'Bands'},
//       vAxis: {title: 'Importance'}
//     });
// print(chart); 

// var features = classification.sampleRegions({
//   collection: val,
//   properties: ["rh98"],
//   scale: 10,
// });

// var r2 = ee.Number(features.reduceColumns(ee.Reducer.pearsonsCorrelation(), ['rh98', 'classification']).get('correlation')).pow(2);
// print('r^2 = ', r2);

// var val_extracted = features.reduceColumns(ee.Reducer.toList(2),['rh98','classification']).get('list')
// var obs = ee.Array(val_extracted).transpose().cut([0,-1]).project([1])
// var pR = ee.Array(val_extracted).transpose().cut([1,-1]).project([1])
// var rmse = obs.subtract(pR).pow(2).reduce('mean', [0]).sqrt()
// print('RMSE = ', rmse)

// // print(ui.Chart.feature.byFeature({
// //   features: features, 
// //   xProperty: 'rh98', 
// //   yProperties: ['classification']
// // }).setOptions({
// //   title: "Validation of rh98 (Random Forest)",
// //   hAxis: {title: 'Observed rh98'},
// //   vAxis: {title: 'PRicted rh98'},
// //   colors: ['#EF851C'],
// //   pointSize: 3,
// //   lineWidth: 0,
// //   trendlines: { 
// //     0: { 
// //       type: 'linear', 
// //       visibleInLegend: false,
// //       showR2: true,
// //       color: 'black',
// //       opacity: 1,
// //       lineWidth: 2,
// //       pointSize: 0
// //     } 
// //   }  
// // }));

// // VISUALIZATION

// // var forestCanopyHeightVis = {min: 0.0, max: 30.0, palette: ['ffffff', 'fcd163', '99b718', '66a000', '3e8601', '207401', '056201', '004c00', '011301'],};
// // Map.addLayer(classification, forestCanopyHeightVis, 'Forest Canopy Height');

// // HYPERPARAMETERIZATION

// // var numTrees = ee.List.sequence(10, 15, 1);

// // var accuracies = numTrees.map(function(t) {
// //   var classifier = ee.Classifier.smileRandomForest(t)
// //     .train({
// //       features: trainingSample, 
// //       classProperty: 'rh98', 
// //       inputProperties: bands
// //     });
// //   return trainingSample
// //     .classify(classifier)
// //     .errorMatrix('rh98', 'classification')
// //     .accuracy();
// // });

// // print(ui.Chart.array.values({
// //   array: ee.Array(accuracies), 
// //   axis: 0, 
// //   xLabels: numTrees
// // }));