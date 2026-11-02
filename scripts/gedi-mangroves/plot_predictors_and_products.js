// Sentinel-1 and 2 predictors for plots of 10 m radius, and published height products at the same points.
// Paired with src/02, 03 and 05 in the private gedi-mangroves repository.
var plots = ee.FeatureCollection('projects/ee-ahmadammargeo/assets/AGBD_obs');  // adjust to where the plot asset is held
var region = plots.geometry().bounds().buffer(20000);

function clean(i) {
  var scl = i.select('SCL');
  return i.updateMask(scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11))).divide(10000);
}
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(region).filterDate('2020-01-01', '2021-01-01').map(clean).median()
  .select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12']);
var indices = ee.Image.cat(s2.normalizedDifference(['B8', 'B4']).rename('ndvi'), s2.normalizedDifference(['B3', 'B8']).rename('ndwi'),
  s2.normalizedDifference(['B8', 'B11']).rename('ndmi'), s2.normalizedDifference(['B8', 'B5']).rename('ndre'));
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(region).filterDate('2020-01-01', '2021-01-01')
  .filter(ee.Filter.eq('instrumentMode', 'IW')).select(['VV', 'VH']).median();
var stack = s2.addBands(indices).addBands(s1);
var buffered = plots.map(function (f) { return f.buffer(10); });
Export.table.toDrive({collection: stack.reduceRegions(buffered, ee.Reducer.mean(), 10), description: 'plot_predictors', fileFormat: 'CSV'});

var products = ee.Image.cat(
  ee.Image('users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1').select(0).rename('eth_2020'),
  ee.ImageCollection('projects/meta-forest-monitoring-okw37/assets/CanopyHeight').mosaic().select(0).rename('meta_2024'),
  ee.ImageCollection('users/potapovpeter/GEDI_V27').mosaic().select(0).rename('glad_2019'),
  ee.Image('projects/glad/GLCLU2020/Forest_height_2020').select(0).rename('glad_2020'),
  ee.ImageCollection('projects/sat-io/open-datasets/GLOBAL_MANGROVE_HT_TANDEMX').mosaic().select(0).rename('tandemx_2015'),
  ee.ImageCollection('projects/sat-io/open-datasets/global_mangrove_distribution/hmax95').mosaic().select(0).rename('simard_hmax'),
  ee.ImageCollection('projects/sat-io/open-datasets/global_mangrove_distribution/agb').mosaic().select(0).rename('simard_agb'),
  ee.Image('LARSE/GEDI/GEDI04_B_002').select('MU').rename('gedi_l4b'));
Export.table.toDrive({collection: products.reduceRegions(plots, ee.Reducer.first(), 30), description: 'plot_products', fileFormat: 'CSV'});
