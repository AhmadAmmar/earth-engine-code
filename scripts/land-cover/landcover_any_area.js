// Classify land cover for any area from open data. Draw a box, set the year, and run.
// Paired with src/landcover_tool.py in the kashmir-landcover repository.
// Labels: pixels where ESA WorldCover and Dynamic World agree. A third map, ESRI Land Cover, gives the independent comparison.
var region = ee.Geometry.Rectangle([73.3, 34.25, 73.65, 34.5]);   // replace with your area
var YEAR = 2023;
var NAMES = ['water', 'trees', 'grass_shrub', 'crops', 'built', 'bare', 'snow_ice'];
var PALETTE = ['0072B2', '009E73', 'B5D99C', 'F0E442', 'D55E00', 'C9B79C', 'FFFFFF'];
var start = YEAR + '-01-01', end = (YEAR + 1) + '-01-01';

function mask(i) {
  var s = i.select('SCL');
  return i.updateMask(s.neq(3).and(s.neq(8)).and(s.neq(9)).and(s.neq(10))).divide(10000).copyProperties(i, ['system:time_start']);
}
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(region).filterDate(start, end)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60)).map(mask).select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12']);
var m = s2.median();
var dem = ee.ImageCollection('COPERNICUS/DEM/GLO30').select('DEM').mosaic();
var img = m.addBands(ee.Image.cat(m.normalizedDifference(['B8', 'B4']).rename('ndvi'), m.normalizedDifference(['B3', 'B8']).rename('ndwi'),
    m.normalizedDifference(['B11', 'B8']).rename('ndbi'), m.normalizedDifference(['B3', 'B11']).rename('ndsi')))
  .addBands(s2.map(function (i) { return i.normalizedDifference(['B8', 'B4']).rename('ndvi'); }).reduce(ee.Reducer.percentile([10, 90])))
  .addBands(ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(region).filterDate(start, end).filter(ee.Filter.eq('instrumentMode', 'IW')).select(['VV', 'VH']).median())
  .addBands(ee.Terrain.slope(dem).rename('slope')).addBands(dem.rename('elev')).clip(region);

var wc = ee.ImageCollection('ESA/WorldCover/v200').first().select(0).remap([80, 90, 95, 10, 20, 30, 40, 50, 60, 70], [0, 2, 1, 1, 2, 2, 3, 4, 5, 6]);
var dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(region).filterDate(start, end).select('label').mode().remap([0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 2, 3, 2, 4, 5, 6]);
var label = wc.updateMask(wc.eq(dw)).rename('label').toByte();
label = label.updateMask(label.reduceNeighborhood(ee.Reducer.countDistinct(), ee.Kernel.square(1)).eq(1));
var pts = img.addBands(label).stratifiedSample({numPoints: 400, classBand: 'label', region: region, scale: 10, seed: 7, tileScale: 8}).randomColumn('r', 7);
var model = ee.Classifier.smileRandomForest(200).train(pts.filter(ee.Filter.lt('r', 0.7)), 'label', img.bandNames());
var out = img.classify(model).rename('class').toByte();

print('Consistency with held-out labels (not true accuracy)', pts.filter(ee.Filter.gte('r', 0.7)).classify(model).errorMatrix('label', 'classification').accuracy());
print('Area by class, km2', ee.Image.pixelArea().divide(1e6).addBands(out).reduceRegion({reducer: ee.Reducer.sum().group(1, 'class'), geometry: region, scale: 30, maxPixels: 1e10, tileScale: 8}));
Map.centerObject(region, 11);
Map.addLayer(out, {min: 0, max: 6, palette: PALETTE}, 'Land cover ' + YEAR);
Export.image.toDrive({image: out, description: 'landcover_' + YEAR, region: region, scale: 10, maxPixels: 1e10});
