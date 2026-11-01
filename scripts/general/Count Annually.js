var pakistan = ee.FeatureCollection("users/Fall2019/PakistanAdministrativeBoundaries");
var ICT = pakistan.filter(ee.Filter.eq("adm1_name","Islamabad"));
var dat = ee.ImageCollection('FIRMS').select('T21')

var startyear = 2017; 
var endyear = 2020; 
var startmonth = 1;
var endmonth = 12;
var startdate = ee.Date.fromYMD(startyear, startmonth, 1);
var enddate = ee.Date.fromYMD(endyear , endmonth, 1);
var years = ee.List.sequence(startyear, endyear);
var months = ee.List.sequence(1, 12);
var days = enddate.difference(startdate, 'days');
var daysStep = 1;

var timeSeries = ee.ImageCollection(
  ee.List.sequence(0, days.subtract(1), daysStep)
    .map(function (offsetDays) {
      var start = startdate.advance(offsetDays, 'days');
      var end = start.advance(daysStep, 'days');
      var composite = dat
        .filterDate(start, end)
        .median();
      return composite
        .set('system:time_start', start.millis())
        .set('empty', composite.bandNames().size().eq(0));
    })
  ).filterMetadata('empty', 'equals', 0);


var monthlySST = ee.ImageCollection(ee.FeatureCollection(years.map(function(y){
  var yearCollection = timeSeries.filter(ee.Filter.calendarRange(y, y, 'year'));
  var byYear = ee.ImageCollection.fromImages(
    months.map(function(m) {
      var maxImage = yearCollection.filter(ee.Filter.calendarRange(m, m, 'month'))
        .reduce(ee.Reducer.sum()); 
      var date = ee.Date.fromYMD(y, m, 1).format("MM_dd_YYYY");
      return maxImage.set('system:time_start', ee.Date.fromYMD(y, m, 1)).rename(date)
      .set('month', m)
      .set('year', y);
  }));
  return byYear;
})).flatten());


var chart = ui.Chart.image.seriesByRegion(
    { 
    imageCollection: monthlySST,
    regions: ICT, 
    reducer: ee.Reducer.count(),
    scale: 30, 
}).setOptions({
          lineWidth: 1,
          pointSize: 3,
          title: 'Fire Event Count',
          vAxis: {title: 'Events'},
          hAxis: {title: 'Year-Month'},
});
print(chart); 