/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var measuredCanopyHeight = ee.FeatureCollection("users/ahmadammargeo/indusCanopyHeight"),
    indusDeltaBoundary = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    gediGapFilledRH98 = ee.Image("users/ahmadammargeo/gapFilledGEDIrh98"),
    validatedCHM = ee.Image("users/ahmadammargeo/validatedCHM");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var palettes = require('users/gena/packages:palettes');
var palette = palettes.misc.warmcool[7];

var gediVis = {
  min: 1,
  max: 9,
  palette: palette,
};

var features = gediGapFilledRH98.sampleRegions(measuredCanopyHeight, ["Height"], 10)
print(ui.Chart.feature.byFeature({
  features: features, 
  xProperty: 'classification', 
  yProperties: ['Height']
}).setOptions({
  title: "Validation of Canopy Height",
  hAxis: {title: 'GEDI Derived Gap Filled RH98'},
  vAxis: {title: 'Measured Canopy Height'},
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

var r2 = ee.Number(features.reduceColumns(ee.Reducer.pearsonsCorrelation(), ['classification', 'Height']).get('correlation')).pow(2);
print('r^2 = ', r2);

Map.addLayer(gediGapFilledRH98, gediVis, 'GEDI Derived Gap Filled RH98');
Map.addLayer(validatedCHM, gediVis, 'Validated CHM Map');
Map.addLayer(measuredCanopyHeight, {color: 'green'}, "Measured Canopy Height"); 
Map.addLayer(indusDeltaBoundary, {color: 'red'}, "Indus Delta Mangroves", true, 0.1); 
Map.centerObject(indusDeltaBoundary, 8);