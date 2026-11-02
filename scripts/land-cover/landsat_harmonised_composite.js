// Harmonised Landsat composite for any year from 1984, with TM and ETM+ brought to the OLI scale, using coefficients fitted from near-same-day pairs in High Mountain Asia; not valid for snow.
// Paired with src/lc_core.py in the kashmir-landcover repository.
var region = ee.Geometry.Rectangle([73.3, 34.25, 73.65, 34.5]);   // replace with your area
var YEAR = 2000;
var COMMON = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
var ETM = {slope: [0.8954, 0.9658, 0.9551, 1.0837, 0.9695, 0.9487], intercept: [-0.0194, -0.0133, -0.013, -0.0256, -0.0135, -0.0073]};
var TM = {slope: [0.8669, 0.9101, 0.9377, 1.0376, 0.9347, 0.9161], intercept: [-0.0228, -0.0167, -0.0177, -0.0278, -0.0203, -0.0122]};

function prep(collection, oli, k) {
  var src = oli ? ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'] : ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'];
  return ee.ImageCollection(collection).filterBounds(region).filterDate(YEAR + '-01-01', (YEAR + 1) + '-01-01').map(function (i) {
    var clear = i.select('QA_PIXEL').bitwiseAnd(26).eq(0);   // dilated cloud, cloud, shadow; snow is kept
    var sr = i.select(src, COMMON).multiply(0.0000275).add(-0.2).updateMask(clear);
    sr = sr.updateMask(sr.gt(0).reduce(ee.Reducer.min()));
    if (!oli) { sr = sr.multiply(ee.Image.constant(k.slope)).add(ee.Image.constant(k.intercept)).rename(COMMON); }
    return sr.toFloat().copyProperties(i, ['system:time_start']);
  });
}
var col = ee.ImageCollection([]);
if (YEAR >= 1984 && YEAR <= 2011) { col = col.merge(prep('LANDSAT/LT05/C02/T1_L2', false, TM)); }
if (YEAR >= 1999 && YEAR <= 2012) { col = col.merge(prep('LANDSAT/LE07/C02/T1_L2', false, ETM)); }
if (YEAR >= 2013) { col = col.merge(prep('LANDSAT/LC08/C02/T1_L2', true)); }
if (YEAR >= 2022) { col = col.merge(prep('LANDSAT/LC09/C02/T1_L2', true)); }
var composite = col.median().clip(region);
print('Scenes', col.size());
Map.centerObject(region, 11);
Map.addLayer(composite, {bands: ['swir1', 'nir', 'red'], min: 0, max: 0.4}, 'Landsat ' + YEAR);
Export.image.toDrive({image: composite, description: 'landsat_harmonised_' + YEAR, region: region, scale: 30, maxPixels: 1e10});
