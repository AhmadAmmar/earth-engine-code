/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD"),
    fao = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level1");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var islamabad = fao.filter(ee.Filter.eq('ADM1_NAME', 'Sindh'))

// CHIRPS data comes as Pentad
// We need to aggregate it to monthly
// We can compute monthly long term averages

// Long Period Average (LPA) should by 30 years or more

// List of 30 years
var lpaYears = ee.List.sequence(1981, 2011)
var months = ee.List.sequence(1, 12)

// Map over the years and create a monthly totals collection
var monthlyImages = lpaYears.map(function(year) {
  return months.map(function(month) {
    var filtered = chirps
      .filter(ee.Filter.calendarRange(year, year, 'year'))
      .filter(ee.Filter.calendarRange(month, month, 'month'))
    var monthly = filtered.sum()
    return monthly.set({'month': month, 'year': year})
  })
}).flatten()

// We now have 1 image per month for entire long-period duratioon
var monthlyCol = ee.ImageCollection.fromImages(monthlyImages)

// We can compute average for each month across all years
// i.e. Average July precipitation for all July months in the collection
var longTermMeans = months.map(function(month) {
    var filtered = monthlyCol.filter(ee.Filter.eq('month', month))
    var monthlyMean = filtered.mean()
    return monthlyMean.set('month', month)
})
var monthlyRainfall = ee.ImageCollection.fromImages(longTermMeans)
// Now we take 2017 data and compute monthly average
var filtered = chirps
  .filter(ee.Filter.date('2012-01-01', '2012-12-31'))
  .filter(ee.Filter.bounds(islamabad))
  
// Calculate monthly average rainfall

var monthlyTotals = months
  .map(function(month) {
    return filtered
      .filter(ee.Filter.calendarRange(month, month, 'month'))
        .sum()
        .set('month', month);
});
var observedRainfall = ee.ImageCollection.fromImages(monthlyTotals)
print(observedRainfall)
var palette = ['white', 'blue']
var visParams = {
  min:0,
  max: 2500,
  palette: palette
}
Map.addLayer(monthlyRainfall.sum().clip(islamabad.geometry()), visParams, 'Long Term')
Map.addLayer(observedRainfall.sum().clip(islamabad.geometry()), visParams , 'Current')

// Calculate deviation in %

var deviation = months.map(function(month) {
  var longTermMean = monthlyRainfall
    .filter(ee.Filter.eq('month', month)).first()
  var monthlyObserved = observedRainfall
    .filter(ee.Filter.eq('month', month)).first()
  var deviation = (monthlyObserved.subtract(longTermMean)
    .divide(longTermMean)).multiply(100)
    .set('month', month)
  return deviation
})

var chart = ui.Chart.image.series({
  imageCollection: deviation, 
  region: islamabad, 
  reducer: ee.Reducer.mean(), 
  scale: 10000,
  xProperty: 'month'
}).setOptions({
      interpolateNulls: true,
      lineWidth: 1,
      pointSize: 3,
      title: 'Rainfall Deviation from Long-term Mean',
      vAxis: {title: 'Deviation %'},
      hAxis: {title: 'Month', gridlines: {count: 12}}
});
print(chart);