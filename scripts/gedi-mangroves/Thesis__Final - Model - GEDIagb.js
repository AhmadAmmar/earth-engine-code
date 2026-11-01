/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var AGBfromGEDIAGBwithImpVar = ee.Image("users/ahmadammargeo/AGBfromGEDIAGBwithImpVar"),
    indus = ee.FeatureCollection("users/ahmadammargeo/AGBD_obs"),
    AGBfromGEDIAGBwithRH = ee.Image("users/ahmadammargeo/AGBfromGEDIAGBwithRH");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var spectral = require('users/dmlmont/spectral:spectral');
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var date = ee.Filter.date('2019-12-01','2020-04-30')

var col = ee.ImageCollection("COPERNICUS/S2_SR")
  .filter(date)
  .filterBounds(indus)
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');

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

var NDVI = s2normalized.normalizedDifference(['B8', 'B4']).rename('NDVI')

var valAGBfromGEDIAGBwithRH = ((AGBfromGEDIAGBwithRH).multiply(12.4651)).add(-7.6071);
var valGEDIAGBwithRH = valAGBfromGEDIAGBwithRH.clip(indus.geometry()).updateMask(NDVI.gte(0.1)).rename('valGEDIAGBwithRH');

Export.image.toAsset({
  image: valGEDIAGBwithRH,
  description: 'valGEDIAGBwithRH',
  assetId: 'valGEDIAGBwithRH',
  scale: 10,
  maxPixels: 1e13,
});

// var trainingSample = AGBfromGEDIAGBwithRH.sampleRegions({
//   collection: table,
//   properties: ["AGBD_obs"],
//   scale: 10,
// });

// Export.table.toDrive({
//   collection: trainingSample,
//   description: 'AGBfromGEDIAGBwithRH',
//   folder: 'GEE',
//   fileFormat: 'CSV'
// })

// print(ui.Chart.feature.byFeature({
//   features: trainingSample, 
//   xProperty: 'AGBfromGEDIAGBwithRH', 
//   yProperties: ['AGBD_obs']
// }).setOptions({
//   title: "Validation of predicted AGBD against measured AGBD",
//   hAxis: {title: 'Predicted AGBD'},
//   vAxis: {title: 'Measured AGBD'},
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

