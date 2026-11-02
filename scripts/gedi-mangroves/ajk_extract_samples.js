/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/AJK");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//var glc = ee.Image("COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019").select('discrete_classification').rename("class").clip(table.geometry());
//var bare_mask = glc.mask(glc.eq(60));
//Map.addLayer(bare_mask)

var glc = ee.Image('ESA/GLOBCOVER_L4_200901_200912_V2_3').select('landcover').rename("class").clip(table.geometry());
var bare_mask = glc.mask(glc.eq(200));
Map.addLayer(bare_mask);

var samples1 = bare_mask.stratifiedSample({
  numPoints: 100, 
  classBand: "class", 
  region: table, 
  scale: 10,
  geometries: true,
})

print(samples1)

var forest = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/FNF').select('fnf').rename("class").clip(table.geometry());
var forested = forest.mask(forest.eq(1));
Map.addLayer(forested);

var samples2 = forested.stratifiedSample({
  numPoints: 100, 
  classBand: "class", 
  region: table, 
  scale: 10,
  geometries: true,
})

print(samples2)