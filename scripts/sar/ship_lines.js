// Load the Sentinel-1 ImageCollection.
var sentinel1 = ee.ImageCollection('COPERNICUS/S1_GRD');

// Filter by metadata properties.
var vh = sentinel1
  // Filter to get images with VH polarization.
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  // Filter to get images collected in interferometric wide swath mode.
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filterDate("2020-10-01","2020-10-24");

// Filter to get images from different look angles.
var vhAscending = vh.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'));
var vhDescending = vh.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));

// Create a composite from means at different polarizations and look angles.
var vhMaxA = vhAscending.select('VH').max();//.focal_median();
var vhMaxD = vhDescending.select('VH').max();//.focal_median();

// Map composite over the Channel
Map.setCenter(67.00, 24.86, 11);
Map.addLayer(vhMaxA, {min: -15, max: 0}, 'VH ASC max',0);
Map.addLayer(vhMaxD, {min: -15, max: 0}, 'VH DES max');
    