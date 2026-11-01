/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var table = ee.FeatureCollection("users/ahmadammargeo/indusCanopyHeight"),
    indus = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var image = ee.Image("users/nlang/ETH_GlobalCanopyHeight_2020_10m_v1").select('b1').clip(indus.geometry());
var features = image.sampleRegions({
  collection: table,
  properties: ["Height"],
  scale: 10,
});

var viz = {
  min: 1,
  max: 10,
  palette: 'darkred,red,orange,green,darkgreen',
};
Map.addLayer(image, viz, 'Canopy Height');


print(ui.Chart.feature.byFeature({
  features: features, 
  xProperty: 'b1', 
  yProperties: ['Height']
}).setOptions({
  title: "Comparing ETH Global Canopy Height 2020 and Indus Delta Mangrove canopy height field observations",
  hAxis: {title: 'ETH Global Canopy Height 2020'},
  vAxis: {title: 'Measured Canopy Height'},
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