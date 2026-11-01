/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pkTehsil = ee.FeatureCollection("users/ahmadammargeo/pkTehsil");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var NO2 = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_NO2');

var startyear = 2018;
var endyear = 2020;
var startdate = ee.Date.fromYMD(startyear,1,1);
var enddate = ee.Date.fromYMD(endyear,12,31);
var years = ee.List.sequence(startyear,endyear);
var months = ee.List.sequence(1,12);

var PNO2 = NO2.filterDate(startdate, enddate)
  .sort('system:time_start', false)
  .filterBounds(pkTehsil)
  .select("tropospheric_NO2_column_number_density");

var MonthlyNO2 =  ee.ImageCollection.fromImages(
  years.map(function (y) {
  return months.map(function(m){
    var w = PNO2.filter(ee.Filter.calendarRange(y, y, 'year'))
             .filter(ee.Filter.calendarRange(m, m, 'month'))
             .mean();
    return w.set('year', y)
             .set('month', m)
             .set('system:time_start',ee.Date.fromYMD(y,m,1)) 
             .set('date', ee.Date.fromYMD(y,m,1));
});
}).flatten()).filter(ee.Filter.listContains('system:band_names', 'tropospheric_NO2_column_number_density'));

print(MonthlyNO2);

var triplets = MonthlyNO2.map(function(image) {
  return image.reduceRegions({
    collection: pkTehsil.select(['adm3_name']), 
    reducer: ee.Reducer.mean(), 
    crs: 'EPSG:4326',
    scale: 30
  }).filter(ee.Filter.neq('mean', null))
    .map(function(f) { 
      return f.set('Date', ee.Date(ee.Number(image.get('system:time_start')))).setGeometry(null);
    });
}).flatten();

var format = function(table, rowId, colId) {
  var rows = table.distinct(rowId);
  var joined = ee.Join.saveAll('matches').apply({
    primary: rows, 
    secondary: table, 
    condition: ee.Filter.equals({
      leftField: rowId, 
      rightField: rowId
    })
  });

  return joined.map(function(row) {
      var values = ee.List(row.get('matches'))
        .map(function(feature) {
          feature = ee.Feature(feature);
          return [feature.get(colId), feature.get('mean')];
        });
      return row.select([rowId]).set(ee.Dictionary(values.flatten()));
    });
};

var table1 = format(triplets, 'Date', 'adm3_name');

var desc1 = 'pkTehsilMeanNO2'; 
Export.table.toDrive({
  collection: table1, 
  description: desc1, 
  fileNamePrefix: desc1,
  fileFormat: 'CSV'
});