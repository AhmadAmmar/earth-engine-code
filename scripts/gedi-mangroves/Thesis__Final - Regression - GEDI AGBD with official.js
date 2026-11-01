/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/AGBD_obs");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var image = ee.Image('LARSE/GEDI/GEDI04_B_002').select('MU')

var features = image.sampleRegions({
  collection: table,
  properties: ["AGBD_obs"],
  scale: 10,
});

print(ui.Chart.feature.byFeature({
  features: features, 
  xProperty: 'AGBD_obs', 
  yProperties: ['MU']
}).setOptions({
  title: "Validation of ABGD",
  hAxis: {title: 'AGBD_obs'},
  vAxis: {title: 'AGBD_gedi'},
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