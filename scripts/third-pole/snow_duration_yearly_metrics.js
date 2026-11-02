// Yearly snow metrics per pixel from daily MOD10A1, one asset per range and hydrological year.
// Paired with src/11_export_metrics.py in the uib-snow-cover repository.
var ROOT = 'projects/ee-ahmadammargeo/assets/tp_snow_v1';
var REGIONS = ee.FeatureCollection('projects/ee-ahmadammargeo/assets/tp_regions_v2_range');
var RANGE = 'Karakoram';           // Hindu Kush, Karakoram, Himalaya, Pamir Mountains, Tian Shan, Tibetan Plateau
var FIRST = 2001, LAST = 2025, THRESHOLD = 40;
var BAND = 'NDSI_Snow_Cover';
var KEY = RANGE.toLowerCase().replace(' ', '_');

function counts(start, end) {
  var col = ee.ImageCollection('MODIS/061/MOD10A1').filterDate(start, end).select(BAND);
  var snow = col.map(function (i) { return i.gte(THRESHOLD).unmask(0).toUint16(); }).sum();
  var valid = col.map(function (i) { return i.mask().gt(0).toUint16().rename(BAND); }).sum();
  return [snow, valid];
}
function yearImage(y) {
  var whole = counts((y - 1) + '-10-01', y + '-10-01');
  var late = counts(y + '-08-01', y + '-09-16');
  return ee.Image.cat(whole[0].rename('snow_days'), whole[1].rename('valid_days'), late[0].rename('late_snow'), late[1].rename('late_valid')).toUint16().set('year', y);
}
var geom = REGIONS.filter(ee.Filter.eq('unit', RANGE)).geometry();
var proj = ee.ImageCollection('MODIS/061/MOD10A1').first().select(BAND).projection().getInfo();
for (var y = FIRST; y <= LAST; y++) {
  Export.image.toAsset({image: yearImage(y).clip(geom), description: 'tp_snow_' + KEY + '_' + y, assetId: ROOT + '/' + KEY + '_' + y,
    crs: proj.crs, crsTransform: proj.transform, region: geom.bounds(), maxPixels: 1e11, pyramidingPolicy: {'.default': 'mean'}});
}
Map.centerObject(geom, 7);
Map.addLayer(yearImage(2020).clip(geom).select('snow_days'), {min: 0, max: 250}, 'Snow days, 2020');
