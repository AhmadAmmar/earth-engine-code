/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var boundary = ee.FeatureCollection("users/kamas72_ML_Zim_Cities/Mufungabusi_FractionalCover_Boundary");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Load Sentinel-1 for the post-rainy season.
var S1_PRS = ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterDate('2021-04-01', '2021-06-30')
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
    .filterBounds(boundary);

// Prepare inter-quartile range (IQR) 
var S1_PRS_pc = S1_PRS.reduce(ee.Reducer.percentile([25,50,75]));

// Convert to natural units (linear units, which can be averaged)
var S1_PRS_pc = ee.Image(10).pow(S1_PRS_pc.divide(10));

var S1_PRS_pc_Feats = S1_PRS_pc.select(['VH_p50','VV_p50']).clip(boundary);

// Reproject to WGS 84 UTM zone 35s                
var S1_PRS_pc_Feats = S1_PRS_pc_Feats.reproject({crs: 'EPSG:32735',scale: 30}); 
  
// Check projection information
print('Projection, crs, and crs_transform:', S1_PRS_pc_Feats.projection());    

// Calculate IQR for the VV polarization
var PRS_VV_iqr = S1_PRS_pc_Feats
	.addBands((S1_PRS_pc.select('VV_p75')
	.subtract(S1_PRS_pc.select('VV_p25')))
	.rename('VV_iqr'));

// Calculate IQR for the VH polarization
var PRS_VH_iqr = S1_PRS_pc_Feats
	.addBands((S1_PRS_pc.select('VH_p75')
	.subtract(S1_PRS_pc.select('VH_p25')))
	.rename('VH_iqr'));

// Print the image to the console
print('Post-rainy Season VV IQR', PRS_VV_iqr);

// Print the image to the console
print('Post-rainy Season VV IQR', PRS_VH_iqr);

// Display S1 inter-quartile range imagery
Map.addLayer(PRS_VV_iqr.clip(boundary), {'bands': 'VV_iqr', min: 0,max: 0.1}, 'Sentinel-1 IW VV');
Map.addLayer( PRS_VH_iqr.clip(boundary), {'bands': 'VH_iqr', min: 0,max: 0.1}, 'Sentinel-1 IW VH');

///////////////////////////////////////////////////////////////////////////////////////////////////////
// Load Sentinel-2 spectral reflectance data.
var s2 = ee.ImageCollection('COPERNICUS/S2_SR');

// Create a function to mask clouds using the Sentinel-2 QA band.
function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = ee.Number(2).pow(10).int();
  var cirrusBitMask = ee.Number(2).pow(11).int();

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
             qa.bitwiseAnd(cirrusBitMask).eq(0));

  // Return the masked and scaled data.
  return image.updateMask(mask).divide(10000);
}

// Filter clouds from Sentinel-2 for a given period.
var composite = s2.filterDate('2021-04-01', '2021-06-30')
                  // Pre-filter to get less cloudy granules.
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
                  .map(maskS2clouds)
                  .select('B2', 'B3', 'B4','B5','B6','B7','B8','B11', 'B12'); 

// Reproject to WGS 84 UTM zone 35s                  
var S2_composite = composite.median().reproject({crs: 'EPSG:32735', scale: 30});

// Check projection information                 
print('Projection, crs, and crs_transform:', S2_composite.projection());

// Display a composite S2 imagery
Map.addLayer(S2_composite.clip(boundary), {bands: ['B11', 'B8', 'B3'], min: 0, max: 0.3});

/////////////////////////////////////////////////////////////////////////////////////////////////////
// Load SRTM
var SRTM = ee.Image("USGS/SRTMGL1_003");
// Clip Elevation
var elevation = SRTM.clip(boundary);

// Reproject 'elevation' to WGS 84 UTM zone 35s                
var elevation = elevation.reproject({crs: 'EPSG:32735',scale: 30}); 
  
// Check projection information
print('Projection, crs, and crs_transform:', elevation.projection()); 

// Derive slope from the SRTM
var slope = ee.Terrain.slope(SRTM).clip(boundary);

// Reproject 'slope' to WGS 84 UTM zone 35s                
var slope = slope.reproject({crs: 'EPSG:32735',scale: 30}); 
  
// Check projection information
print('Projection, crs, and crs_transform:', slope.projection()); 

///////////////////////////////////////////////////////////////////////////////////////////////////
// Load ESA World Cover data
var dataset = ee.ImageCollection("ESA/WorldCover/v100").first();

// Clip the land cover to the boundary
var ESA_LC_2020 = dataset.clip(boundary);

// Extract forest areas from the land cover
var forest_mask = ESA_LC_2020.updateMask(
  ESA_LC_2020.eq(10) // Only keep pixels where class equals 2
);

// Display forests only
var visualization = {bands: ['Map'],};

Map.addLayer(forest_mask, visualization, "Trees");

/////////////////////////////////////////////////////////////////////////////////////////////
// Merge the predictor variables
var mergedCollection = S2_composite
  .addBands(PRS_VV_iqr
  .addBands(PRS_VH_iqr
  .addBands(elevation
  .addBands(slope
  .addBands(forest_mask)))));

// Clip to the output image to Harare study area boundary.
var clippedmergedCollection = mergedCollection.clipToCollection(boundary);
print('clippedmergedCollection: ', clippedmergedCollection);

// Bands to include in the classification
var bands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B11', 'B12', 'VV_iqr', 'VH_iqr', 'elevation', 'slope', 'Map'];

////////////////////////////////////////////////////////////////////////////
// Prepare training dataset
//The Global Ecosystem Dynamics Investigation (GEDI) 
// GEDI's Level 2A Geolocated Elevation and Height Metrics Product (GEDI02_A) is primarily composed of 
// 100 Relative Height (RH) metrics, which collectively describe the waveform collected by GEDI.
// The original GEDI02_A product is a table of point with a spatial resolution (average footprint) of 25 meters. 
// More information at https://lpdaac.usgs.gov/documents/986/GEDI02_UserGuide_V2.pdf

// Define a mask
var qualityMask = function(im) {
  return im.updateMask(im.select('quality_flag').eq(1))
      .updateMask(im.select('degrade_flag').eq(0));
};

// Import the "EDI02_A_002_MONTHLY: dataset
var dataset = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
                  .map(qualityMask)
                  .select('rh98').filterBounds(boundary);

// Create a pallete to visualize the dataset
var gediVis = {
  min: 1,
  max: 60,
  palette: 'darkred,red,orange,green,darkgreen',
};

// Set the map center and visulaize the dataset
Map.setCenter(28.873257285666114,-18.455390776432033, 10);
Map.addLayer(dataset, gediVis, 'rh98');

// Define projection and scale parameters
var projection = dataset.first().projection().aside(print);
var scale = projection.nominalScale().aside(print);

var mosaic = dataset.mosaic().setDefaultProjection({crs:projection, scale:scale});

// Sample 10,000 points from the dataset
var points = mosaic.sample({
   region: boundary,
   scale: scale,
   numPixels: 10000, 
   projection: projection,
   geometries: true});

// Check the number of the training points
print(points.size());
print(points.limit(10));

// Display the training points
Map.addLayer(points);

// Add a random column (named random) and specify seed value for repeatability.
var datawithColumn = points.randomColumn('random', 27);

// Separate 70% for training, 30% for validation
var split = 0.7; 
var trainingData = datawithColumn.filter(ee.Filter.lt('random', split));

// Print the training data
print('training data', trainingData);

var validationData = datawithColumn.filter(ee.Filter.gte('random', split));

// Print the testing (validation) data
print('validation data', validationData);

//////////////////////////////////////////////////////////////////////
// Perform regression modeling using RF classifier

// Collect training data
var training = clippedmergedCollection.select(bands).sampleRegions({
  collection: trainingData,
  properties: ['rh98'],
  scale: 30 // Need to change the scale of training data to avoid the 'out of memory' problem
  });

// Train a random forest classifier for regression 
var classifier = ee.Classifier.smileRandomForest(50)
  .setOutputMode('REGRESSION')
  .train({
    features: training, 
    classProperty: "rh98",
    inputProperties: bands
    });

//Run the classification and clip it to the boundary
var regression = clippedmergedCollection.select(bands).classify(classifier, 'predicted').clip(boundary);

// Load and define a continuous palette
var palettes = require('users/gena/packages:palettes');

// Choose and define a palette
var palette = palettes.colorbrewer.YlGn[5];

// Display the input imagery and the regression classification.
  // get dictionaries of min & max predicted value
  var regressionMin = (regression.reduceRegion({
    reducer: ee.Reducer.min(),
    scale: 30, 
    crs: 'EPSG:32735',
    geometry: boundary,
    bestEffort: true,
    tileScale: 5
  }));
  var regressionMax = (regression.reduceRegion({
    reducer: ee.Reducer.max(),
    scale: 30, 
    crs: 'EPSG:32735',
    geometry: boundary,
    bestEffort: true,
    tileScale: 5
  }));
  
// Add to map
var viz = {palette: palette, min: regressionMin.getNumber('predicted').getInfo(), max: regressionMax.getNumber('predicted').getInfo()};
Map.addLayer(regression, viz, 'Regression');

// Create the panel for the legend items.
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

// Create and add the legend title.
var legendTitle = ui.Label({
  value: 'TC Height',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 4px 0',
    padding: '0'
  }
});

legend.add(legendTitle);

// create the legend image
var lon = ee.Image.pixelLonLat().select('latitude');
var gradient = lon.multiply((viz.max-viz.min)/100.0).add(viz.min);
var legendImage = gradient.visualize(viz);
 
// create text on top of legend
var panel = ui.Panel({
widgets: [
ui.Label(viz['max'])
],
});
 
legend.add(panel);
 
// create thumbnail from the image
var thumbnail = ui.Thumbnail({
image: legendImage,
params: {bbox:'0,0,10,100', dimensions:'10x200'},
style: {padding: '1px', position: 'bottom-center'}
});
 
// add the thumbnail to the legend
legend.add(thumbnail);
 
// create text on top of legend
var panel = ui.Panel({
widgets: [
ui.Label(viz['min'])
],
});

legend.add(panel);
Map.add(legend);

// Zoom to the regression on the map
Map.centerObject(boundary, 11);

// Check model performance
// Get details of classifier
var classifier_details = classifier.explain();

// Explain the classifier with importance values
var variable_importance = ee.Feature(null, ee.Dictionary(classifier_details).get('importance'));

var chart =
  ui.Chart.feature.byProperty(variable_importance)
  .setChartType('ColumnChart')
  .setOptions({
  title: 'Random Forest Variable Importance',
  legend: {position: 'none'},
  hAxis: {title: 'Bands'},
  vAxis: {title: 'Importance'}
});

// Plot a chart
print("Variable importance:", chart);

// Create model assessment statistics
// Get predicted regression points in same location as training data
var predictedTraining = regression.sampleRegions({collection:trainingData, geometries: true});

// Separate the observed (agb_GEDI) and predicted (regression) properties
var sampleTraining = predictedTraining.select(['rh98', 'predicted']);

// Create chart, print it
var chartTraining = ui.Chart.feature.byFeature(sampleTraining, 'rh98', 'predicted')
.setChartType('ScatterChart').setOptions({
title: 'Predicted vs Observed - Training data ',
hAxis: {'title': 'observed'},
vAxis: {'title': 'predicted'},
pointSize: 3,
trendlines: { 0: {showR2: true, visibleInLegend: true} ,
1: {showR2: true, visibleInLegend: true}}});
print(chartTraining);

// Compute Root Mean Squared Error (RMSE)
// Get array of observation and prediction values 
var observationTraining = ee.Array(sampleTraining.aggregate_array('rh98'));

var predictionTraining = ee.Array(sampleTraining.aggregate_array('predicted'));

// Compute residuals
var residualsTraining = observationTraining.subtract(predictionTraining);

// Compute RMSE with equation and print the result
var rmseTraining = residualsTraining.pow(2).reduce('mean', [0]).sqrt();
print('Training RMSE', rmseTraining);

/////////////////////////////////////////////////////////////////////////////
//Perform validation
// Get predicted regression points in same location as validation data
var predictedValidation = regression.sampleRegions({collection:validationData, geometries: true});

// Separate the observed (rh98) and predicted (regression) properties
var sampleValidation = predictedValidation.select(['rh98', 'predicted']);

// Create chart and print it
var chartValidation = ui.Chart.feature.byFeature(sampleValidation, 'predicted', 'rh98')
.setChartType('ScatterChart').setOptions({
title: 'Predicted vs Observed - Validation data',
hAxis: {'title': 'predicted'},
vAxis: {'title': 'observed'},
pointSize: 3,
trendlines: { 0: {showR2: true, visibleInLegend: true} ,
1: {showR2: true, visibleInLegend: true}}});
print(chartValidation);

// Compute RMSE
// Get array of observation and prediction values 
var observationValidation = ee.Array(sampleValidation.aggregate_array('rh98'));

var predictionValidation = ee.Array(sampleValidation.aggregate_array('predicted'));

// Compute residuals
var residualsValidation = observationValidation.subtract(predictionValidation);

// Compute RMSE with equation and print it
var rmseValidation = residualsValidation.pow(2).reduce('mean', [0]).sqrt();
print('Validation RMSE', rmseValidation);

///////////////////////////////////////////////////////////////////////////
// Export the image, specifying scale and region.
Export.image.toDrive({
  image: regression,
  description: 'Muf_TCH_GEDI_2021',
  scale: 20,
  crs: 'EPSG:32735', // EPSG:32735 (WGS 84 UTM Zone 35S)
  maxPixels: 6756353855,
  region: boundary
});