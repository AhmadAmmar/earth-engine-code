var numTrees = ee.List.sequence(30, 50, 10);

var accuracies = numTrees.map(function(t) {
  var classifier = ee.Classifier.smileRandomForest(t)
    .train({
      features: training_opt_sar, 
      classProperty: 'Class', 
      inputProperties: bands_opt_sar
    });
  return training_opt_sar
    .classify(classifier)
    .errorMatrix('Class', 'classification')
    .accuracy();
});

print(ui.Chart.array.values({
  array: ee.Array(accuracies), 
  axis: 0, 
  xLabels: numTrees
}));