// Eight-day area of each MOD10A2 class over the Upper Indus above Tarbela or the Indus above Sukkur.
// Paired with src/02_export_sca.py in the uib-snow-cover repository.
var START = [72.69, 34.09];        // Tarbela; use [68.87, 27.70] for Sukkur
var NAME = 'upper_indus';
var LEVEL7 = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_7').filterBounds(ee.Geometry.BBox(60, 25, 100, 42));
var CLASSES = {snow: [200], cloud: [50], land: [25], water: [37], ice: [100], night: [11], nodecision: [1], fill: [254, 255, 0]};

var table = LEVEL7.reduceColumns(ee.Reducer.toList(2), ['HYBAS_ID', 'NEXT_DOWN']).get('list').getInfo();
var children = {};
table.forEach(function (row) { (children[row[1]] = children[row[1]] || []).push(row[0]); });
var first = LEVEL7.filterBounds(ee.Geometry.Point(START)).first().get('HYBAS_ID').getInfo();
var found = [], stack = [first];
while (stack.length) {
  var h = stack.pop();
  found.push(h);
  stack = stack.concat(children[h] || []);
}
var geom = LEVEL7.filter(ee.Filter.inList('HYBAS_ID', found)).geometry().dissolve(100);

function classAreas(image) {
  var band = image.select('Maximum_Snow_Extent');
  var area = ee.Image.pixelArea().divide(1e6);
  var bands = Object.keys(CLASSES).map(function (k) {
    return area.updateMask(band.remap(CLASSES[k], CLASSES[k].map(function () { return 1; }), 0)).rename(k);
  });
  var r = ee.Image.cat(bands).reduceRegion({reducer: ee.Reducer.sum(), geometry: geom, scale: 463.3127, crs: band.projection(), maxPixels: 1e10});
  return ee.Feature(null, r).set({region: NAME, date: image.date().format('YYYY-MM-dd')});
}
var series = ee.ImageCollection('MODIS/061/MOD10A2').filterDate('2000-02-01', '2026-12-31').map(classAreas);
Export.table.toDrive({collection: series, description: NAME + '_sca_8day', folder: 'uib_snow_cover', fileFormat: 'CSV', selectors: ['date', 'region'].concat(Object.keys(CLASSES))});
