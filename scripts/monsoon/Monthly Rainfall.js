// Load Islamabad Capital Territory boundary from geoBoundaries dataset
var AOI = ee.FeatureCollection("WM/geoLab/geoBoundaries/600/ADM2")
  .filter(ee.Filter.inList('shapeName', ['Islamabad Capital Territory']));

// Load CHIRPS rainfall dataset (1981-present)
var chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
              .filterBounds(AOI)
              .filterDate('1981-01-01', ee.Date(Date.now())); // Max available range

// Generate lists of years & months
var years = ee.List.sequence(1981, ee.Date(Date.now()).get('year'));
var months = ee.List.sequence(1, 12);

// Compute total monthly rainfall, ensuring data exists
var monthlyRainfall = ee.ImageCollection.fromImages(
  years.map(function(y) {
    return months.map(function(m) {
      var start = ee.Date.fromYMD(y, m, 1);
      var end = start.advance(1, 'month');
      
      var collection = chirps.filterDate(start, end);
      var collectionExists = collection.size().gt(0);
      
      var monthlyRain = ee.Algorithms.If({
        condition: collectionExists,
        trueCase: collection
          .sum()
          .clip(AOI)
          .set('year', y)
          .set('month', m)
          .set('system:time_start', start),
        falseCase: ee.Image(0).rename('precipitation')
          .set('year', y)
          .set('month', m)
          .set('system:time_start', start)
      });

      return monthlyRain;
    });
  }).flatten()
);

// Convert to FeatureCollection for charting, ensuring valid precipitation values
var rainChartData = monthlyRainfall.map(function(image) {
  var hasPrecipitation = image.bandNames().contains('precipitation');

  var precipitation = ee.Algorithms.If({
    condition: hasPrecipitation,
    trueCase: image.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: AOI,
      scale: 5000,  // 5km resolution
      maxPixels: 1e13
    }).get('precipitation'),
    falseCase: 0  // Default to 0 if band is missing
  });

  return ee.Feature(null, {
    'Year': image.get('year'),
    'Month': image.get('month'),
    'Total Rainfall (mm)': ee.Number(precipitation)
  });
});

// Generate time-series chart using ui.Chart.feature.groups
var chart = ui.Chart.feature.groups({
  features: rainChartData,
  xProperty: 'Year',
  yProperty: 'Total Rainfall (mm)',
  seriesProperty: 'Month'
}).setOptions({
    title: 'Monthly Rainfall in Islamabad Capital Territory (1981 - Present)',
    vAxis: {title: 'Total Rainfall (mm)'},
    hAxis: {title: 'Year', format: '####'},
    lineWidth: 1,
    pointSize: 2,
    series: {
      1: {color: 'blue'},   // Jan
      2: {color: 'red'},    // Feb
      3: {color: 'green'},  // Mar
      4: {color: 'orange'}, // Apr
      5: {color: 'purple'}, // May
      6: {color: 'cyan'},   // Jun
      7: {color: 'magenta'}, // Jul
      8: {color: 'brown'},  // Aug
      9: {color: 'pink'},   // Sep
      10: {color: 'grey'},  // Oct
      11: {color: 'black'}, // Nov
      12: {color: 'yellow'} // Dec
    }
});

// Display chart
print(chart);
