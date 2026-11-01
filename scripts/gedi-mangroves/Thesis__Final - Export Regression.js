var AGBD_obs = ee.FeatureCollection("users/ahmadammargeo/AGBD_obs");

var validatedCHM = ee.Image("users/ahmadammargeo/rhFilled/validatedCHM");

var regressionSample = validatedCHM.sampleRegions({
  collection: AGBD_obs,
  properties: ["AGBD_obs"],
  scale: 10,
});

Export.table.toDrive({
  collection: regressionSample,
  description: 'ObsAGBwithvalidatedCHM',
  folder: 'GEE',
  fileFormat: 'CSV'
})