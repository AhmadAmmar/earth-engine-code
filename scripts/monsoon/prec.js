/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var twinc = ee.FeatureCollection("users/ahmadammargeo/twinCities");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD");
// set start and end year
var startyear = 2000; 
var endyear = 2020; 

// make a date objecttfrgwqvar startdate = ee.Date.fromYMD(startyear, 1, 1);
var enddate = ee.Date.fromYMD(endyear + 1, 1, 1);

// make a list with years
var years = ee.List.sequence(startyear, endyear);
// make a list with months
var months = ee.List.sequence(1, 12);
 
// Get the geometry
var twinc_geo = twinc.geometry();

var monthlyPrecip =  ee.ImageCollection.fromImages(
  years.map(function (y) {
    return months.map(function(m) {
      var w = chirps.filter(ee.Filter.calendarRange(y, y, 'year'))
                    .filter(ee.Filter.calendarRange(m, m, 'month'))
                    .sum();
      return w.set('year', y)
              .set('month', m)
              .set('system:time_start', ee.Date.fromYMD(y, m, 1));
                        
    });
  }).flatten()
);


var meanMonthlyP =  ee.ImageCollection.fromImages(
  months.map(function (m) {
    var w = monthlyPrecip.filter(ee.Filter.eq('month', m)).mean();
    return w.set('month', m)
            .set('system:time_start',ee.Date.fromYMD(1, m, 1)); 
  }).flatten()
);


var title = {
  title: 'Monthly precipitation',
  hAxis: {title: 'Time'},
  vAxis: {title: 'Precipitation (mm)'},
};


var chartMonthly = ui.Chart.image.seriesByRegion({
  imageCollection: meanMonthlyP, 
  regions: twinc_geo,
  reducer: ee.Reducer.mean(),
  band: 'precipitation',
  scale: 2500,
  xProperty: 'system:time_start',
  seriesProperty: 'SITE'
}).setOptions(title)
  .setChartType('ColumnChart');

print(chartMonthly);