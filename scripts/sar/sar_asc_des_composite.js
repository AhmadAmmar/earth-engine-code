var sentinel1Collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterDate('2018-01-01', '20-06-30')
  .filterBounds(region)
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('instrumentMode', 'IW'));
  
var vhAscending = sentinel1Collection.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'));
var vhDescending = sentinel1Collection.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));

var composite = ee.Image.cat([
  vhAscending.select('VH').mean(),
  ee.ImageCollection(vhAscending.select('VV').merge(vhDescending.select('VV'))).mean(),
  vhDescending.select('VH').mean()
  ]).focal_median();