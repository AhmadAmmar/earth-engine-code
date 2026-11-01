var pakistan = ee.FeatureCollection("users/Fall2019/PakistanAdministrativeBoundaries");
var table = pakistan.filter(ee.Filter.eq("adm2_name","Lahore"));

var light = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
                  .filter(ee.Filter.date('2021-04-01', '2021-12-31'))
                  .filterBounds(table);
var nighttime = light.select('avg_rad').max().clip(table)
var nighttimeVis = {min: 0.0, max: 60.0};
//Map.centerObject(table, 13);
//Map.addLayer(nighttime, nighttimeVis, 'Nighttime');

var training = nighttime.sample({
  region: table,
  scale: 10,
  numPixels: 5000
});
var clusterer = ee.Clusterer.wekaKMeans(2).train(training);
var result = nighttime.cluster(clusterer);
Map.addLayer(result.randomVisualizer(), {}, 'clusters');

var clusters = [0, 1];
var values0 =   [1, 2];
var remapped_cluster = result.remap(clusters, values0).clip(table);//

var result = ee.Image.pixelArea().addBands(remapped_cluster).reduceRegion({
  reducer: ee.Reducer.sum().group(1),
  geometry: table,
  scale: 10,
  maxPixels: 1e9
});

var groups = ee.List(result.get("groups")).map(function(group) {
  group = ee.Dictionary(group)
  return [group.get('group'), group.get('sum')]
})
groups = groups.insert(0, ["Class", "Area"])
var panel = ui.Panel(ui.Label("Loading chart..."));
print(panel)
groups.evaluate(function(result) {
  panel.widgets().reset([ui.Chart(result).setChartType('ColumnChart')])
})