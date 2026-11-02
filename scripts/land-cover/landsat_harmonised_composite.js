// Harmonised Landsat composite for any year from 1984, with TM and ETM+ brought to the OLI scale (Roy et al., 2016).
// Paired with src/lc_core.py in the kashmir-landcover repository.
var region = ee.Geometry.Rectangle([73.3, 34.25, 73.65, 34.5]);   // replace with your area
var YEAR = 2000;
var COMMON = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
var SLOPE = [0.8474, 0.8483, 0.9047, 0.8462, 0.8937, 0.9071];
var INTERCEPT = [0.0003, 0.0088, 0.0061, 0.0412, 0.0254, 0.0172];

function prep(collection, oli) {
  var src = oli ? ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'] : ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'];
  return ee.ImageCollection(collection).filterBounds(region).filterDate(YEAR + '-01-01', (YEAR + 1) + '-01-01').map(function (i) {
    var clear = i.select('QA_PIXEL').bitwiseAnd(26).eq(0);   // dilated cloud, cloud, shadow; snow is kept
    var sr = i.select(src, COMMON).multiply(0.0000275).add(-0.2).updateMask(clear);
    sr = sr.updateMask(sr.gt(0).reduce(ee.Reducer.min()));
    if (!oli) { sr = sr.multiply(ee.Image.constant(SLOPE)).add(ee.Image.constant(INTERCEPT)).rename(COMMON); }
    return sr.toFloat().copyProperties(i, ['system:time_start']);
  });
}
var col = ee.ImageCollection([]);
if (YEAR >= 1984 && YEAR <= 2011) { col = col.merge(prep('LANDSAT/LT05/C02/T1_L2', false)); }
if (YEAR >= 1999 && YEAR <= 2012) { col = col.merge(prep('LANDSAT/LE07/C02/T1_L2', false)); }
if (YEAR >= 2013) { col = col.merge(prep('LANDSAT/LC08/C02/T1_L2', true)); }
if (YEAR >= 2022) { col = col.merge(prep('LANDSAT/LC09/C02/T1_L2', true)); }
var composite = col.median().clip(region);
print('Scenes', col.size());
Map.centerObject(region, 11);
Map.addLayer(composite, {bands: ['swir1', 'nir', 'red'], min: 0, max: 0.4}, 'Landsat ' + YEAR);
Export.image.toDrive({image: composite, description: 'landsat_harmonised_' + YEAR, region: region, scale: 30, maxPixels: 1e10});
