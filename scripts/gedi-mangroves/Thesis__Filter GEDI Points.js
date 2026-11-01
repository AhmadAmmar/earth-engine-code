/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/AGBD_pts");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var filtered = table.filter(ee.Filter.gt('agbd', 0.7))
var sample = filtered.randomColumn()
var agbd = sample.filter(ee.Filter.gte('random', 0.965))

print(agbd.size())

// var gediVis = {
//   min: 1,
//   max: 30,
//   palette: 'darkred,red,orange,green,darkgreen',
// };
// Map.addLayer(agbd, gediVis, 'agbd');

Export.table.toAsset({
  collection: agbd,
  description:'AGBD_trg',
  assetId: 'AGBD_trg',
});