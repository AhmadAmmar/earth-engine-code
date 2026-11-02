// Yearly snow duration for each sub-basin, from the yearly assets of all ranges.
// Paired with src/16_full_resolution_and_subbasins.py in the uib-snow-cover repository.
var A = 'projects/ee-ahmadammargeo/assets/';
var RANGES = ['hindu_kush', 'karakoram', 'himalaya', 'pamir_mountains', 'tian_shan', 'tibetan_plateau'];
var subs = ee.FeatureCollection(A + 'tp_regions_v2_subbasin').map(function (f) { return f.select(['unit', 'parent', 'km2']); });
var tables = [];
for (var y = 2001; y <= 2025; y++) {
  var i = ee.ImageCollection(RANGES.map(function (r) { return ee.Image(A + 'tp_snow_v1/' + r + '_' + y); })).mosaic();
  var d = i.select('snow_days').multiply(365).divide(i.select('valid_days')).updateMask(i.select('valid_days').gte(120)).rename('duration');
  tables.push(d.addBands(i.select('valid_days').toFloat()).reduceRegions({collection: subs, reducer: ee.Reducer.mean(), scale: 1000, tileScale: 16}).map(function (f) {
    return ee.Feature(ee.Geometry.Point([85, 30]), f.toDictionary());
  }).map(setYear(y)));
}
function setYear(year) { return function (f) { return f.set('year', year); }; }
Export.table.toAsset({collection: ee.FeatureCollection(tables).flatten(), description: 'tp_table_subbasin_year', assetId: A + 'tp_table_subbasin_year'});
