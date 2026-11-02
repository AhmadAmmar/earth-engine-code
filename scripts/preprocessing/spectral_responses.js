/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var roi = ee.FeatureCollection("users/ahmadammargeo/AJK"),
    Agriculture = ee.FeatureCollection("users/ahmadammargeo/AgricultureAJKS"),
    Bare = ee.FeatureCollection("users/ahmadammargeo/BareAJKS"),
    Built = ee.FeatureCollection("users/ahmadammargeo/BuiltAJKS"),
    Forest = ee.FeatureCollection("users/ahmadammargeo/ForestAJKS"),
    Grass = ee.FeatureCollection("users/ahmadammargeo/GrassAJKS"),
    Snow = ee.FeatureCollection("users/ahmadammargeo/SnowAJKS"),
    Water = ee.FeatureCollection("users/ahmadammargeo/WaterAJKS"),
    points = ee.FeatureCollection("users/ahmadammargeo/AJKSpectral");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var collections2sr = ee.Image(ee.ImageCollection('COPERNICUS/S2_SR')
              .filterDate('2020-01-01', '2020-12-31')
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',10))
              .filterBounds(roi)
              .first())

var samples = Agriculture.merge(Grass).merge(Forest).merge(Bare).merge(Built).merge(Water).merge(Snow);
//var samples = ee.FeatureCollection([Agriculture,Grass,Forest,Bare,Built,Water,Snow]);

var subset = collections2sr.select('B2', 'B3', 'B4', 'B8', 'B5', 'B6', 'B7', 'B8A', 'B11', 'B12')
var bands = ['B2', 'B3', 'B4', 'B8', 'B5', 'B6', 'B7', 'B8A', 'B11', 'B12'];

var classNames = ee.List([ 'Agriculture', 'Grass', 'Forest', 'Bare','Built','Water','Snow']);
var pointsWithClass = samples.map(function(feat){
  return feat.set('label', classNames.getString(ee.Number.parse(feat.getString('system:index'))))
})

// Define customization options.
var plotOptions = {
  title: 'Spectral Curves of Chosen Points',
  hAxis: {title: 'Band'},
  vAxis: {title: 'Response'},
  lineWidth: 1,
  pointSize: 4,
  series: {
    0: {color: '90EE90'},
    1: {color: '006400'},
    2: {color: '008000'},
    3: {color: 'yellow'},
    4: {color: 'red'},
    5: {color: 'cyan'},
    6: {color: 'blue'},
}};

var Chart2 = ui.Chart.image.regions( subset, pointsWithClass, ee.Reducer.mean(), 20, 'label', bands).setChartType('ScatterChart').setOptions(plotOptions);
print(Chart2);

/*

var collectionVV = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(roi)
.select('VV');

var collectionVH = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(roi)
.select('VH');

var SARVV = collectionVV.filterDate('2020-01-01', '2020-12-31').mosaic()
var SARVH = collectionVH.filterDate('2020-01-01', '2020-12-31').mosaic()
var SMOOTHING_RADIUS = 50;
var SARVV_filtered = SARVV.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(roi.geometry());
var SARVH_filtered = SARVH.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters').clip(roi.geometry());

//var comp = collections2sr.median().clip(roi.geometry());
var ndvi = comp.normalizedDifference(['B8', 'B4']).rename('NDVI');
var ndsi = comp.normalizedDifference(['B3', 'B11']).rename('NDSI');
var ndwi = comp.normalizedDifference(['B3', 'B8']).rename('NDWI');
var ndbi = comp.normalizedDifference(['B12', 'B8']).rename('NDBI');
var bsi = comp.select('B11').add(comp.select('B4'))
      .subtract(comp.select('B8').add(comp.select('B2')))
          .divide(comp.select('B11').add(comp.select('B4')).add(comp.select('B8')).add(comp.select('B2'))).rename('BSI');

var opt_sar_ind= comp.addBands(SARVV_filtered).addBands(SARVH_filtered).addBands(ndvi).addBands(ndbi).addBands(bsi).addBands(ndsi).addBands(ndwi)
var bands_opt_sar_ind = ['VH','VV', 'B2', 'B3', 'B4', 'B8', 'B5', 'B6', 'B7', 'B8A', 'B11', 'B12', 'NDVI', 'NDBI', 'BSI', 'NDSI', 'NDWI'];
var training_opt_sar_ind = opt_sar_ind.select(bands_opt_sar_ind)

var chart = ui.Chart.image
                .byClass({
                  image: training_opt_sar_ind,
                  classBand: 'label',
                  region: points,
                  reducer: ee.Reducer.mean(),
                  scale: 100,
                  classLabels: ['Agriculture','Grass','Forest','Bare','Built','Water','Snow'],
                  xLabels: bands_opt_sar_ind
                })
                .setChartType('ScatterChart')
                .setOptions({
                  title: 'Spectral Signatures of Chosen Points',
                  hAxis: {
                    title: 'Band',
                    titleTextStyle: {italic: false, bold: true}
                    //viewWindow: {min: bands_opt_sar_ind[0], max: bands_opt_sar_ind[16]}
                  },
                  vAxis: {
                    title: 'Spectral Response (x1e4)',
                    titleTextStyle: {italic: false, bold: true}
                  },
                  colors: ['90EE90', '006400', '008000', 'yellow', 'red', 'cyan', 'blue'],
                  pointSize: 0,
                  lineSize: 5,
                  curveType: 'function'
                });
print(chart);


// Define customization options.
var options = {
title: 'Spectral Responses of Chosen Points',
hAxis: {title: '??'},
vAxis: {title: '??'},
lineWidth: 1,
pointSize: 4,
series: {
    0: {color: '90EE90'},
    1: {color: '006400'},
    2: {color: '008000'},
    3: {color: 'yellow'},
    4: {color: 'red'},
    5: {color: 'cyan'},
    6: {color: 'blue'},
}};

var spectraChart = ui.Chart.image.regions(
training_opt_sar_ind, points, ee.Reducer.mean(), 30, 'label', bands_opt_sar_ind)
.setChartType('LineChart')
.setOptions(options);
print(spectraChart)
*/