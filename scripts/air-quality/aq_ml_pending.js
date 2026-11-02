var trainingSample = combined_image.sampleRegions(samples, ["AGB"], 10);
print(trainingSample);

var bandNames = combined_image.bandNames();
var classifier = ee.Classifier.smileRandomForest(100).train(trainingSample,"AGB", bandNames).setOutputMode('REGRESSION');

var dict = classifier.explain();
print('Explain:',dict);

var variable_importance = ee.Feature(null, ee.Dictionary(dict).get('importance'));

var chart =
  ui.Chart.feature.byProperty(variable_importance)
    .setChartType('ColumnChart')
    .setOptions({
      title: 'Random Forest Variable Importance',
      legend: {position: 'none'},
      hAxis: {title: 'Bands'},
      vAxis: {title: 'Importance'}
    });

print(chart); 


var viz = {min:0, max: 600, palette:'FFFFFF, CE7E45, DF923D, F1B555, FCD163, 99B718, 74A901, 66A000, 529400,' +
    '3E8601, 207401, 056201, 004C00, 023B01, 012E01, 011D01, 011301'};

Map.addLayer (clipped, viz, ' Map');

var features = clipped.sampleRegions(validationsamples, ["AGB"], 10)
print(features)

print(ui.Chart.feature.byFeature({
  features: features, 
  xProperty: 'AGB', 
  yProperties: ['classification']
}).setOptions({
  title: "Validation of ",
  hAxis: {title: 'Observed '},
  vAxis: {title: 'Predicted '},
  colors: ['#EF851C'],
  pointSize: 3,
  lineWidth: 0,
  trendlines: { 
    0: { 
      type: 'linear', 
      visibleInLegend: false,
      showR2: true,
      color: 'black',
      opacity: 1,
      lineWidth: 2,
      pointSize: 0
    } 
  }  
}));

var r2 = ee.Number(features.reduceColumns(ee.Reducer.pearsonsCorrelation(), ['AGB', 'classification']).get('correlation')).pow(2);
print('r^2 = ', r2);

Map.addLayer(samples, {color: 'green'}, "  Training Samples"); 
Map.addLayer(validationsamples, {color: 'yellow'}, "  Validation Samples");