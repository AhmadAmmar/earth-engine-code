/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/indusCanopyHeight"),
    image = ee.Image("users/ahmadammargeo/rh100"),
    image2 = ee.Image("users/ahmadammargeo/rh100_mean"),
    indus = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    image3 = ee.Image("users/ahmadammargeo/gapFilledGEDIrh98"),
    image4 = ee.Image("users/ahmadammargeo/validatedCHM");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var qualityMask = function(im) {
  return im.updateMask(im.select('quality_flag').eq(1))
      .updateMask(im.select('degrade_flag').eq(0));
};
var dataset = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
                  .map(qualityMask)
                  .select('rh98')
                  .mean().toFloat().clip(indus.geometry());

var gapFilledGEDIrh98 = ee.Image("users/ahmadammargeo/gapFilledGEDIrh98").select('classification').rename('gapFilledGEDIrh98');
var validatedCHM = ee.Image("users/ahmadammargeo/validatedCHM").select('classification').rename('validatedCHM');

var features = dataset.sampleRegions({
  collection: table,
  properties: ["Height"],
  scale: 10,
});

print(ui.Chart.feature.byFeature({
  features: features, 
  xProperty: 'Height', 
  yProperties: ['rh98']
}).setOptions({
  title: "Validation of Height",
  hAxis: {title: 'Height_obs'},
  vAxis: {title: 'Height_gedi'},
  colors: ['#EF851C'],
  pointSize: 3,
  lineWidth: 0,
  trendlines: { 
    0: { 
      type: 'linear', 
      visibleInLegend: true,
      showR2: true,
      color: 'black',
      opacity: 1,
      lineWidth: 2,
      pointSize: 0
    } 
  }  
}));