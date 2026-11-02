// Reading radar over London, 2024: yearly mean of Sentinel-1 in VV and VH, and one full scene for comparison.
// Paired with src/01_london_basics.py in the sar-reading-manual repository.
var box = ee.Geometry.Rectangle([-0.60, 51.30, 0.25, 51.70]);
var zoom = ee.Geometry.Rectangle([-0.20, 51.46, -0.05, 51.53]);

function toLinear(image) {
  return ee.Image(10).pow(image.divide(10));
}
// Average in linear power, because averaging decibels understates bright targets.
function meanDb(collection, band) {
  return collection.select(band).map(toLinear).mean().log10().multiply(10).rename(band);
}

var scenes = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(box).filterDate('2024-01-01', '2025-01-01')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'));
var vv = meanDb(scenes, 'VV');
var vh = meanDb(scenes, 'VH');
var ratio = vv.subtract(vh).rename('VV_VH');
var stack = vv.addBands(vh).addBands(ratio).toFloat();
var single = scenes.filter(ee.Filter.contains({leftField: '.geo', rightValue: zoom})).first().select('VV').toFloat();

print('Scenes', scenes.size());
Map.centerObject(box, 10);
Map.addLayer(stack, {bands: ['VV', 'VH', 'VV_VH'], min: [-20, -28, 3], max: [5, -6, 11]}, 'VV, VH, VV minus VH');
Export.image.toDrive({image: stack, description: 'london_2024_mean_40m', folder: 'sar_manual', region: box, crs: 'EPSG:27700', scale: 40, maxPixels: 1e10});
Export.image.toDrive({image: vv.toFloat(), description: 'london_mean_vv_10m', folder: 'sar_manual', region: zoom, crs: 'EPSG:27700', scale: 10, maxPixels: 1e10});
Export.image.toDrive({image: single, description: 'london_single_vv_10m', folder: 'sar_manual', region: zoom, crs: 'EPSG:27700', scale: 10, maxPixels: 1e10});
