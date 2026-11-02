// Mann-Kendall trend test per pixel on yearly snow duration, stored as an asset; loss mask for the Himalaya.
// Paired with src/12_change_classes.py and src/15_cloud_tests.py in the uib-snow-cover repository.
// The false discovery threshold comes from a histogram of p values; those used are listed below.
var ROOT = 'projects/ee-ahmadammargeo/assets/tp_snow_v1';
var RANGE = 'Tibetan Plateau';
var KEY = RANGE.toLowerCase().replace(' ', '_');
var MIN_VALID = 120, MIN_YEARS = 20;
var THRESHOLDS = {karakoram: 7e-5, himalaya: 2.7e-4, tian_shan: 1e-5, tibetan_plateau: 3.7e-5};
var geom = ee.FeatureCollection('projects/ee-ahmadammargeo/assets/tp_regions_v2_range').filter(ee.Filter.eq('unit', RANGE)).geometry();

var years = [];
for (var y = 2001; y <= 2025; y++) { years.push(y); }
var duration = ee.Image.cat(years.map(function (y) {
  var i = ee.Image(ROOT + '/' + KEY + '_' + y);
  return i.select('snow_days').multiply(365).divide(i.select('valid_days')).updateMask(i.select('valid_days').gte(MIN_VALID)).rename('d_' + y).toFloat();
}));
var s = ee.Image(0).toFloat();
for (var a = 0; a < years.length; a++) {
  for (var b = a + 1; b < years.length; b++) {
    var diff = duration.select('d_' + years[b]).subtract(duration.select('d_' + years[a]));
    s = s.add(diff.gt(0).subtract(diff.lt(0)).unmask(0));
  }
}
var n = duration.reduce(ee.Reducer.count()).toFloat();
var variance = n.multiply(n.subtract(1)).multiply(n.multiply(2).add(5)).divide(18);
var z = s.subtract(s.gt(0)).add(s.lt(0)).divide(variance.sqrt());
var p = z.abs().divide(ee.Number(2).sqrt()).erfc();
var result = s.rename('s').addBands(p.rename('p')).addBands(n.rename('n')).clip(geom).toFloat();

Map.centerObject(geom, 6);
Map.addLayer(p.updateMask(n.gte(MIN_YEARS)).clip(geom), {min: 0, max: 0.1}, 'p value');
Export.image.toAsset({image: result, description: 'tp_mk_' + KEY, assetId: ROOT + '_mk/' + KEY, region: geom.bounds(), scale: 463.3127, maxPixels: 1e11});
