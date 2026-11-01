var lahore = ee.FeatureCollection("FAO/GAUL/2015/level2")
                 .filter(ee.Filter.eq('ADM1_NAME', 'Lahore'));

var Weekdays = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_NO2')
  .filterBounds(lahore)
  .select('NO2_column_number_density')
  .filter(ee.Filter.calendarRange(1, 5, 'day_of_week'));

var Weekend = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_NO2')
  .filterBounds(lahore)
  .select('NO2_column_number_density')
  .filter(ee.Filter.calendarRange(6, 7, 'day_of_week'));
  
var chart =
    ui.Chart.image
        .series({
          imageCollection: vegIndices,
          region: lahore,
          reducer: ee.Reducer.mean(),
          scale: 500,
          xProperty: 'system:time_start'
        })
        .setSeriesNames(['EVI', 'NDVI'])
        .setOptions({
          title: 'Average Vegetation Index Value by Date for Forest',
          hAxis: {title: 'Date', titleTextStyle: {italic: false, bold: true}},
          vAxis: {
            title: 'Vegetation index (x1e4)',
            titleTextStyle: {italic: false, bold: true}
          },
          lineWidth: 5,
          colors: ['e37d05', '1d6b99'],
          curveType: 'function'
        });
print(chart);