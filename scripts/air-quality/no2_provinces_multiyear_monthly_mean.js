var geom = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level1");
var Punjab = geom.filter(ee.Filter.eq("ADM1_NAME","Punjab"));
var table = Punjab.geometry();
var startDate = ee.Date('2018-01-01');
var endDate = ee.Date('2020-12-31');

var NO2 = ee.ImageCollection("COPERNICUS/S5P/NRTI/L3_NO2")
    .select('tropospheric_NO2_column_number_density')
    .filterDate(startDate, endDate)
    .filterBounds(table)
    .map(function(img){
      var d = ee.Date(ee.Number(img.get('system:time_start')));
      var m = ee.Number(d.get('month'));
      var y = ee.Number(d.get('year'));
      return img.set({'month':m, 'year':y});
    });

var months = ee.List.sequence(1, 12);
var years = ee.List.sequence(2018, 2020);

var byMonthYear = ee.ImageCollection.fromImages(
  years.map(function(y) {
    return months.map(function (m) {
      return NO2
        .filter(ee.Filter.calendarRange(y, y, 'year'))
        .filter(ee.Filter.calendarRange(m, m, 'month'))
        .select('tropospheric_NO2_column_number_density').mean()
        .set('system:time_start', ee.Date.fromYMD(y, m, 1))
        .set('month', m).set('year', y);
  });
}).flatten());
print(byMonthYear)

var reduceRegion = function(image) {
  var meanNO2 = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: table,
    scale: 30,
    bestEffort: true});

  var props = {
    'meanNO2': meanNO2,
//    'meanNO2': meanNO2.get('tropospheric_NO2_column_number_density'),
    'imgID': image.id(),
    'date': ee.Date(ee.Number(image.get('system:time_start')))};
  return ee.Feature(table, props);
};

var NO2_reduceRegion = ee.FeatureCollection(byMonthYear.map(reduceRegion));
print(NO2_reduceRegion)

Export.table.toDrive({
  collection: NO2_reduceRegion,
  description: 'NO2_reduceRegion',
  folder: 'GEE',
  fileFormat: 'CSV'});