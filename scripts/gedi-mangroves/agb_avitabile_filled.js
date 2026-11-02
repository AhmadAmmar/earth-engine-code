/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var AGB_Avitabile_Indus = ee.Image("users/ahmadammargeo/GlobalAGB/AGB_Avitabile_Indus"),
    indus = ee.FeatureCollection("users/ahmadammargeo/indusProj"),
    rh1 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh1"),
    rh10 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh10"),
    rh25 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh25"),
    rh50 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh50"),
    rh75 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh75"),
    rh90 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh90"),
    rh98 = ee.Image("users/ahmadammargeo/rhFilled/GEDIgapFilledrh98"),
    CTHK = ee.Image("users/ahmadammargeo/rhFilled/CTHK"),
    validatedCHM = ee.Image("users/ahmadammargeo/rhFilled/validatedCHM"),
    table = ee.FeatureCollection("users/ahmadammargeo/AGBD_obs"),
    agbd = ee.FeatureCollection("users/ahmadammargeo/agbQuality15k");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var samples = AGB_Avitabile_Indus.sample({
    region: indus.geometry(),
    numPixels: 650000,
    scale: 10,
    geometries: true,
    dropNulls: true,
});

// var trainingSample = AGB_Avitabile_Indus.sampleRegions({
//   collection: table,
//   properties: ["AGBD_obs"],
//   scale: 10,
// });

// print(ui.Chart.feature.byFeature({
//   features: trainingSample, 
//   xProperty: 'b1', 
//   yProperties: ['AGBD_obs']
// }).setOptions({
//   title: "Validation of predicted AGBD against measured AGBD",
//   hAxis: {title: 'Predicted AGBD'},
//   vAxis: {title: 'Measured AGBD'},
//   colors: ['#EF851C'],
//   pointSize: 3,
//   lineWidth: 0,
//   trendlines: { 
//     0: { 
//       type: 'linear', 
//       visibleInLegend: true,
//       showR2: true,
//       color: 'black',
//       opacity: 1,
//       lineWidth: 2,
//       pointSize: 0
//     } 
//   }  
// }));