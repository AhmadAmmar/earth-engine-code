/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/Punjab");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var dem = ee.Image("MERIT/DEM/v1_0_3").clip(table.geometry()).rename('Elevation')
var lc = ee.Image("COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019").select('discrete_classification').clip(table.geometry()).rename('Landcover');
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var light = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
                  .filter(ee.Filter.date('2019-01-01', '2019-12-31'))
                  .filterBounds(table.geometry());
var nighttime = light.select('avg_rad').mean().clip(table.geometry()).rename('Nighttime Lights')

var s2 = ee.ImageCollection("COPERNICUS/S2_SR")
  .filterDate('2019-01-01','2019-12-31')
  .filterBounds(table.geometry())
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 70)
  .map(s2mask());

var median = ee.Image(s2.median().select('B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12').clip(table.geometry()));
var ndvi = median.normalizedDifference(["B8", "B4"]).rename('NDVI')
var ndwi = median.normalizedDifference(['B3', 'B8']).rename('NDWI')
var ndbi = median.normalizedDifference(['B12', 'B8']).rename('NDBI')
var bsi = median.select('B11').add(median.select('B4'))
      .subtract(median.select('B8').add(median.select('B2')))
          .divide(median.select('B11').add(median.select('B4')).add(median.select('B8')).add(median.select('B2'))).rename('BSI');

var arvi =  median.expression('-0.18+1.17*( (nir-red)/(nir+red) )',{
  'nir': median.select('B8'),
  'red': median.select('B4')
  }).rename('ARVI')          ;
                    
var lr = median.expression('log(nir/red)',{
'red':median.select('B4'),
'nir':median.select('B8')
}).rename('Log Ratio')

var modis = ee.ImageCollection('MODIS/006/MOD11A1')
  .filterDate('2019-01-01', '2019-12-31')
  .filterBounds(table.geometry())
  .select('LST_Day_1km');
  
var modLSTc = modis.map(function(img) {
  return img
    .multiply(0.02)
    .subtract(273.15)
    .rename('LST');
});

var lst = modLSTc.mean().clip(table.geometry())

var clim = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H')
                  .filter(ee.Filter.date('2019-01-01', '2019-12-31'))
                  .filterBounds(table.geometry());
                  
var temp = clim.select('Tair_f_inst').mean().clip(table.geometry()).rename('Temperature')
var prec = clim.select('Rainf_f_tavg').mean().clip(table.geometry()).rename('Precipitation')
var humidity = clim.select('Qair_f_inst').mean().clip(table.geometry()).rename('Humidity')
var wind = clim.select('Wind_f_inst').mean().clip(table.geometry()).rename('Wind Speed')

var cams = ee.ImageCollection('ECMWF/CAMS/NRT')
                  .filter(ee.Filter.date('2019-01-01', '2019-12-31'))
                  .filterBounds(table.geometry());

var aod = cams.select('total_aerosol_optical_depth_at_550nm_surface').mean().clip(table.geometry()).rename('Aerosol Optical Depth')
var pm25 = cams.select('particulate_matter_d_less_than_25_um_surface').mean().clip(table.geometry()).rename('PM 25')

var combined_image= median.addBands(ndvi).addBands(ndwi).addBands(ndbi).addBands(bsi).addBands(lst).addBands(temp).addBands(prec).addBands(humidity).addBands(wind).addBands(aod).addBands(pm25).addBands(dem).addBands(nighttime);
//addBands(arvi).addBands(lr).addBands(lc)

var S5PCO = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_CO')
  .filterDate('2019-01-01', '2019-12-31')
  .select('CO_column_number_density')
  .filterBounds(table.geometry());

var CO  = S5PCO.mean().clip(table.geometry());

var samples = CO.sample({
    region: table.geometry(),
    scale: 1000,
    numPixels: 10000,
    seed: 0,
    geometries: true,
});

var sample = samples.randomColumn()
var split = 0.75
var training = sample.filter(ee.Filter.lt('random', split))
var validation = sample.filter(ee.Filter.gte('random', split))

var trainingSample = combined_image.sampleRegions({
  collection: training,
  properties: ["CO_column_number_density"],
  scale: 1000,
  tileScale: 16
});

var bandNames = combined_image.bandNames();
print(bandNames)

var classifier = ee.Classifier.smileRandomForest(100).train(trainingSample,"CO_column_number_density", bandNames).setOutputMode('REGRESSION');
print(classifier)

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

var classification = ee.Image(combined_image.classify(classifier).clip(table.geometry()));
var viz = {min:0, max: 0.0002, palette:['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red']};
print(classification);
Map.addLayer (classification, viz, 'CO Map');

var features = classification.sampleRegions({
  collection: validation,
  properties: ["CO_column_number_density"],
  scale: 1000,
  tileScale: 16
});
print(features)

print(ui.Chart.feature.byFeature({
  features: features, 
  xProperty: 'CO_column_number_density', 
  yProperties: ['classification']
}).setOptions({
  title: "Validation of CO",
  hAxis: {title: 'Observed CO'},
  vAxis: {title: 'Predicted CO'},
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

var r2 = ee.Number(features.reduceColumns(ee.Reducer.pearsonsCorrelation(), ['CO_column_number_density', 'classification']).get('correlation')).pow(2);
print('r^2 = ', r2);