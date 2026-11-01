
//Indus Delta study area
var indus = ee.FeatureCollection("users/muddasirshah01/Thesis/IndusDelta");
Map.centerObject (indus, 8);



var image1_s2 = ee.Image('COPERNICUS/S2_SR/20200223T055831_20200223T060931_T42RUN')
var image2_s2 = ee.Image('COPERNICUS/S2_SR/20200223T055831_20200223T060931_T42QUM')
var image3_s2 = ee.Image('COPERNICUS/S2_SR/20200223T055831_20200223T060931_T42QVM')

var image_s2 = ee.ImageCollection([image1_s2,image2_s2, image3_s2]).mosaic();

var vizParams_s2 = {
  bands: ["B8", "B4", "B2"],
  min: 0,
  max: 3000,
  //opacity: 0.5
  
};

Map.addLayer(image_s2.clip(indus), vizParams_s2 , 'Sentinel 2 (Feb 2020)');

// Calculate NDVI
var image_ndvi = image_s2.normalizedDifference(['B8','B4']);

var visParams_ndvi = {min: -0.2, max: 0.8, palette: 'FFFFFF, CE7E45, DF923D, F1B555, FCD163, 99B718, 74A901, 66A000, 529400,' +
    '3E8601, 207401, 056201, 004C00, 023B01, 012E01, 011D01, 011301'};

Map.addLayer(image_ndvi.clip(indus),visParams_ndvi,'Sentinel-2 NDVI')

//Display Indus study area 

Map.addLayer(indus, {color: 'green', opacity: 0.2}, "Indus Delta");

//Dr. Hammad Gilani Code
// show the Vegetation areas
var ndvi_th = image_ndvi.gt(-0.046);
var myndvi = ndvi_th.updateMask(ndvi_th);
var ndvi_viz = {palette:"darkgreen"};
Map.addLayer(myndvi.clip(indus), ndvi_viz, 'Forest2020', 1);

var stats = ee.Image.pixelArea().divide(1000000).addBands(myndvi).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: indus,
  maxPixels: 1e13,
  scale: 10
});
print('Forest Area 2020', stats);

var table = ee.FeatureCollection("users/ahmadammargeo/AGBD_obs");

var features = image_ndvi.sampleRegions({
  collection: table,
  properties: ["AGBD_obs"],
  scale: 10,
});

print(ui.Chart.feature.byFeature({
  features: features, 
  xProperty: 'AGBD_obs', 
  yProperties: ['nd']
}).setOptions({
  title: "Validation of ABGD",
  hAxis: {title: 'AGBD_obs'},
  vAxis: {title: 'NDVI'},
  colors: ['#EF851C'],
  pointSize: 3,
  lineWidth: 0,
  trendlines: { 
    0: { 
      type: 'linear', 
      visibleInLegend: true,
      showR2: true,
      color: 'black',
      opacity: 1,
      lineWidth: 2,
      pointSize: 0
    } 
  }  
}));