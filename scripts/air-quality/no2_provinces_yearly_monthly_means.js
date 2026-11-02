var geom = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level1");
var Punjab = geom.filter(ee.Filter.eq("ADM1_NAME","Punjab"));
var startDate = ee.Date('2018-01-01');
var endDate = ee.Date('2020-12-31');

var NO2 = ee.ImageCollection("COPERNICUS/S5P/NRTI/L3_NO2")
    .select('tropospheric_NO2_column_number_density')
    .filterDate(startDate, endDate)
    .filterBounds(Punjab)
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

var triplets = byMonthYear.map(function(image) {
  return image.reduceRegions({
    collection: Punjab.select(['ADM1_NAME']), 
    reducer: ee.Reducer.mean(), 
    scale: 30
  }).filter(ee.Filter.neq('mean', null))
    .map(function(f) { 
      return f.set('imageId', image.id()).setGeometry(null);
    });
}).flatten();
print(triplets.first());
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

var table1 = format(triplets, 'imageId', 'label');

var desc1 = 'table_demo_'; 
Export.table.toDrive({
  collection: table1, 
  description: desc1, 
  fileNamePrefix: desc1,
  fileFormat: 'CSV'
});