// Sindh flood, 2022: mean VV in the same weeks of 2021 and 2022, with JRC water occurrence.
// The threshold and flood rule are applied locally in src/02_sindh_flood.py in the sar-reading-manual repository.
var box = ee.Geometry.Rectangle([67.3, 26.0, 68.6, 27.4]);

function meanVV(start, end, name) {
  return ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(box).filterDate(start, end)
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    .select('VV')
    .map(function (i) { return ee.Image(10).pow(i.divide(10)); })
    .mean().log10().multiply(10).rename(name);
}
var pre = meanVV('2021-08-25', '2021-09-15', 'pre');
var post = meanVV('2022-08-25', '2022-09-15', 'post');
var occurrence = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0).rename('occurrence');
var stack = pre.addBands(post).addBands(occurrence).toFloat();

Map.centerObject(box, 9);
Map.addLayer(pre, {min: -22, max: -2}, 'September 2021');
Map.addLayer(post, {min: -22, max: -2}, 'September 2022');
Map.addLayer(post.lt(-14.1).and(pre.gte(-14.1)).and(occurrence.lt(50)).selfMask(), {palette: ['E69F00']}, 'Flood at -14.1 dB');
Export.image.toDrive({image: stack, description: 'sindh_flood_100m', folder: 'sar_manual', region: box, crs: 'EPSG:32642', scale: 100, maxPixels: 1e10});

// The usual course of the Indus
var rivers = ee.FeatureCollection('WWF/HydroSHEDS/v1/FreeFlowingRivers').filterBounds(box).filter(ee.Filter.gte('DIS_AV_CMS', 500));
Map.addLayer(rivers.style({color: '00E5FF', width: 1.5}), {}, 'River course');
Export.table.toDrive({collection: rivers, description: 'indus_river_lines', folder: 'sar_manual', fileFormat: 'GeoJSON'});
