/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var AGB_CMS_Indus = ee.Image("users/ahmadammargeo/GlobalAGB/AGB_CMS_Indus"),
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
var samples = AGB_CMS_Indus.sample({
    region: indus.geometry(),
    numPixels: 230000,
    scale: 10,
    geometries: true,
    dropNulls: true,
});

// var trainingSample = AGB_CMS_Indus.sampleRegions({
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

var spectral = require('users/dmlmont/spectral:spectral');
var s2mask = require('users/fitoprincipe/geetools:cloud_masks').sentinel2;
var date = ee.Filter.date('2019-12-01','2020-04-30')

var col = ee.ImageCollection("COPERNICUS/S2_SR")
  .filter(date)
  .filterBounds(indus)
  .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 25)
  .map(s2mask())
  .select('B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12');

var s2mosaic = ee.Image(col.median()).toFloat().clip(indus);

var minMax = s2mosaic.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: indus.geometry(),
  scale: 10,
  maxPixels: 1e13,
  bestEffort: true
}); 

var s2normalized = ee.ImageCollection.fromImages(
  s2mosaic.bandNames().map(function(name){
    name = ee.String(name);
    var band = s2mosaic.select(name);
    return band.unitScale(ee.Number(minMax.get(name.cat('_min'))), ee.Number(minMax.get(name.cat('_max'))))
})).toBands().rename(s2mosaic.bandNames());

var B = s2normalized.select('B2');
var G = s2normalized.select('B3');
var R = s2normalized.select('B4');
var R1 = s2normalized.select('B5');
var R2 = s2normalized.select('B6');
var R3 = s2normalized.select('B7');
var N = s2normalized.select('B8');
var R4 = s2normalized.select('B8A');
var S1 = s2normalized.select('B11');
var S2 = s2normalized.select('B12');

var coefficients = ee.Array([
[0.3029, 0.2786, 0.4733, 0.5599, 0.508, 0.1872],
[-0.2941, -0.243, -0.5424, 0.7276, 0.0713, -0.1608],
[0.1511, 0.1973, 0.3283, 0.3407, -0.7117, -0.4559],
[-0.8239, 0.0849, 0.4396, -0.058, 0.2013, -0.2773],
[-0.3294, 0.0557, 0.1056, 0.1855, -0.4349, 0.8085],
[0.1079, -0.9023, 0.4119, 0.0575, -0.0259, 0.0252]]);

var optical = s2normalized.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12']);
var arrayImage1D = optical.toArray();
var arrayImage2D = arrayImage1D.toArray(1);
var TC = ee.Image(coefficients)
.matrixMultiply(arrayImage2D)
.arrayProject([0])
.arrayFlatten([['TCB', 'TCG', 'TCW', 'TC4', 'TC5', 'TC6']]);
var TCB = TC.select('TCB');
var TCG = TC.select('TCG');
var TCW = TC.select('TCW');
var TC4 = TC.select('TC4');
var TC5 = TC.select('TC5');
var TC6 = TC.select('TC6');

var TCA = TC.expression ('float ( atan(TCG/TCB) )', {
  'TCG': TCG,
  'TCB': TCB}).rename('TCA');

var TCD = TC.expression ('float ( (TCB*TCB - TCG*TCG) - 2 )', {
  'TCG': TCG,
  'TCB': TCB}).rename('TCD');

var TCDI = TC.expression ('float ( (TCB - (TCG+TCW)) )', {
  'TCG': TCG,
  'TCW': TCW,
  'TCB': TCB}).rename('TCDI');

var NDVI = s2normalized.normalizedDifference(['B8', 'B4']).rename('NDVI')
var NDVI_B86 = s2normalized.normalizedDifference(['B8', 'B6']).rename('NDVI_B86')
var NDVI_B87 = s2normalized.normalizedDifference(['B8', 'B7']).rename('NDVI_B87')
var GNDVI = s2normalized.normalizedDifference(['B8', 'B3']).rename('GNDVI')
var SIPI = s2normalized.normalizedDifference(['B8', 'B2']).rename('SIPI')
var MNDVI = s2normalized.normalizedDifference(['B8', 'B12']).rename('MNDVI')
var NDMI = s2normalized.normalizedDifference(['B8', 'B11']).rename('NDMI')
var NDRE1  = s2normalized.normalizedDifference(['B8', 'B5']).rename('NDRE1')
var NDRE2  = s2normalized.normalizedDifference(['B7', 'B5']).rename('NDRE2')
var RENDVI1 = s2normalized.normalizedDifference(['B5', 'B4']).rename('RENDVI1')
var RENDVI2 = s2normalized.normalizedDifference(['B6', 'B5']).rename('RENDVI2')
var NDWI = s2normalized.normalizedDifference(['B3', 'B12']).rename('NDWI')
var MNDWI = s2normalized.normalizedDifference(['B3', 'B11']).rename('MNDWI')
var NGRDI = s2normalized.normalizedDifference(['B3', 'B4']).rename('NGRDI')
var RGVI = s2normalized.normalizedDifference(['B4', 'B3']).rename('RGVI')
var NBR2 = s2normalized.normalizedDifference(['B11', 'B12']).rename('NBR2')
var NDVI2 = s2normalized.normalizedDifference(['B8A', 'B4']).rename('NDVI2')
var GNDVI2 = s2normalized.normalizedDifference(['B8A', 'B3']).rename('GNDVI2')
var SIWSI = s2normalized.normalizedDifference(['B8A', 'B11']).rename('SIWSI')
var NDWVI = s2normalized.normalizedDifference(['B12', 'B3']).rename('NDWVI')

var DVI = N.subtract(R).rename('DVI')
var GDVI = N.subtract(G).rename('GDVI')
var RVI = N.divide(R).rename('RVI')
var RGR = R.divide(G).rename('RGR')
var NGR = N.divide(G).rename('NGR')
var SGR = S1.divide(G).rename('SGR')
var SNR = S1.divide(G).rename('SNR')
var S1RR = S1.divide(R).rename('S1RR')
var S1NR = S1.divide(N).rename('S1NR')
var S2RR = S2.divide(R).rename('S2RR')
var S2NR = S2.divide(N).rename('S2NR')
var S1S2R = S1.divide(S2).rename('S1S2R')
var S2S1R = S2.divide(S1).rename('S2S1R')
var NS1R = N.divide(S1).rename('NS1R')
var NS2R = N.divide(S2).rename('NS2R')
var SRre = N.divide(R1).rename('SRre')
var BGR = B.divide(G).rename('BGR')
var BRR = B.divide(R).rename('BRR')
var BNR = B.divide(N).rename('BNR')
var GRR = G.divide(R).rename('GRR')
var GNR = G.divide(N).rename('GNR')
var RNR = R.divide(N).rename('RNR')
var PSSRa = R3.divide(R).rename('PSSRa')
var CMRI = NDVI.subtract(NDWI).rename('CMRI')

var LCI = N.subtract(R1).divide(N.add(R)).rename('LCI')
var NDDI = NDVI.subtract(NDWI).divide(NDVI.add(NDWI)).rename('NDDI')
var MVI = N.subtract(G).divide(S1.subtract(G)).rename('MVI')
var MTCI = R2.subtract(R1).divide(R1.add(R)).rename('MTCI')
var IRECI = (R3.subtract(R)).divide(R1.divide(R2)).rename('IRECI')

var RECI = (R1.divide(R2)).subtract(1).rename('RECI')
var CIg = (N.divide(G)).subtract(1).rename('CIg')
var CIgre1 = (R1.divide(G)).subtract(1).rename('CIgre1')
var CIgre2 = (R2.divide(G)).subtract(1).rename('CIgre2')
var CIgre3 = (R3.divide(G)).subtract(1).rename('CIgre3')
var CIre = (R3.divide(R1)).subtract(1).rename('CIre')

var MDI1 = (N.subtract(S1)).divide(S1).rename('MDI1')
var MDI2 = (N.subtract(S2)).divide(S2).rename('MDI2')
var CI = (R.subtract(B)).divide(R).rename('CI')
var PSRI = (R.subtract(B)).divide(N).rename('PSRI')
var FDI = N.subtract((G).add(R)).rename('FDI')

var IPVI = N.divide(N.add(R)).rename('IPVI')
var SLAVI = N.divide(R.add(S1)).rename('SLAVI')
var VARI = (G.subtract(R)).divide((G.add(N).add(R))).rename('VARI')
var VARIg = (G.subtract(R)).divide((G.add(R).subtract(B))).rename('VARIg')

var EVI = s2normalized.expression ('float (2.5 * ((N - R) / (N + 6 * R - 7.5 * B + 1)))', {
  'N': N,
  'B': B, 
  'R': R}).rename('EVI');

var EVI2 = s2normalized.expression ('float ( 2.4 * (N - R) / (N + R + 1) )', {
  'N': N,
  'R': R}).rename('EVI2');

var EVI3 = s2normalized.expression ('float ( 2.5 * (N - R) / (N + 2.4 * R + 1) )', {
  'N': N,
  'R': R}).rename('EVI3');

var ARVI = s2normalized.expression ('float ((N - R - 0.069 * (R - B)) / (N + R - 0.069 * (R - B)))',{
  'N': N,
  'B': B, 
  'R': R}).rename('ARVI');

var ARVI2 = s2normalized.expression ('float (-0.18 + 1.17 * ((N-R)/(N+R)))',{
  'N': N,
  'B': B, 
  'R': R}).rename('ARVI2');
  
var SAVI = s2normalized.expression ('float ((N - R) / (N + R + 0.428) * (1.0 + 0.428))',{
  'N': N,
  'R': R}).rename('SAVI');

var SAVI2 = s2normalized.expression ('float ( 1.1 * (R - G) / 0.1 + (R - G))',{
  'R': R,
  'G': G}).rename('SAVI2');

var LAI = s2normalized.expression ('float ( 0.57 * exp(2.33 * NDVI) )', {
  'NDVI': NDVI}).rename('LAI');

var LAI2 = s2normalized.expression ('float ( (((1+NDVI)/(1-NDVI))*NDVI) ** 0.5 )', {
  'NDVI': NDVI}).rename('LAI2');

var LAI3 = s2normalized.expression ('float ( pow((18.37 * NDVI ), 1.51) )', {
  'NDVI': NDVI}).rename('LAI3');

var LAI4 = s2normalized.expression ('float (((0.69-SAVI2)/0.59) / 0.91 ) ', {
  'SAVI2': SAVI2}).rename('LAI4');

var LAI5 = s2normalized.expression ('float ( 3.618 * EVI - 0.118 ) ', {
  'EVI': EVI}).rename('LAI5');

var TCARI = s2normalized.expression ( 'float ( 3 * ((R1 - R) - 0.2 * (R1 - G) * (R1 / R)) )',{
  'R': R,
  'G': G,
  'R1': R1}).rename('TCARI');
  
var OSAVI = s2normalized.expression ('float ((N - R) / (N + R + 0.16))',{
  'N': N,
  'R': R}).rename('OSAVI');

var TCARIdOSAVI = s2normalized.expression ('float ( TCARI/OSAVI )',{
  'TCARI': TCARI,
  'OSAVI': OSAVI}).rename('TCARIdOSAVI');

var MOSAVI = s2normalized.expression ('float (((1.16) * ((N - R) / (N + R + 0.16))))',{
  'N': N,
  'R': R}).rename('MOSAVI');

var GOSAVI = s2normalized.expression ('float ((N - G) / (N + G + 0.16))',{
  'N': N,
  'G': G}).rename('GOSAVI');

var GSAVI = s2normalized.expression ('float ((N - G) / (N + G + 0.482) * (1 + 0.482))',{
  'N': N,
  'G': G}).rename('GSAVI');
  
var MSAVI = s2normalized.expression ('float ((2.0 * N + 1.0 - sqrt(pow((2.0 * N + 1.0), 2.0) - 8.0 * (N - R))) / 2.0)',{
  'N': N,
  'R': R}).rename('MSAVI');
  
var MSR = s2normalized.expression ('float ((N / R - 1.0) / sqrt(N / R + 1.0))',{
  'N': N,
  'R': R}).rename('MSR');

var MSRren = s2normalized.expression ( 'float ( (R4 / R1 - 1) / ((R4 / R1 + 1) ** 0.5) )',{
  'R1': R1,
  'R4': R4}).rename('MSRren');

var CVI = s2normalized.expression ('float (N * R / pow(G, 2.0))',{
  'N': N,
  'R': R,
  'G': G}).rename('CVI');
  
var ATSAVI = s2normalized.expression ( 'float ( 1.22 * (N - 1.22 * R - 0.03) / (1.22 * N + R - 1.22 * 0.03 + 0.08 * (1.0 + pow(1.22, 2.0))))',{
  'N': N,
  'R': R}).rename('ATSAVI');

var TSAVI1 = s2normalized.expression ( 'float ( (0.421 * (N - 0.421 * R - 0.824)) / (R + 0.421 * (N - 0.824) + 0.114 * (1.0 + pow(0.421, 2.0))) )',{
  'N': N,
  'R': R}).rename('TSAVI1');

var TSAVI2 = s2normalized.expression ( 'float ( (0.419 * N - 0.419 * R - 0.787) / (R + 0.419 * N - 0.419 * 0.787) )',{
  'N': N,
  'R': R}).rename('TSAVI2');

var PVI = s2normalized.expression ( 'float ((1.0 / sqrt(pow(0.149, 2.0) + 1.0)) * (N - 0.374 - 0.735))',{
  'N': N}).rename('PVI');

var TVI = s2normalized.expression ( 'float (0.5 * (120 * (N - G) - 200 * (R - G)))',{
  'N': N,
  'R': R,
  'G': G}).rename('TVI');

var MTVI1 = s2normalized.expression ( 'float ( 1.2 * (1.2 * (N - G) - 2.5 * (N - G)) )',{
  'N': N,
  'R': R,
  'G': G}).rename('MTVI1');  

var MTVI2 = s2normalized.expression ( 'float (1.5 * (1.2 * (N - G) - 2.5 * (R - G)) / sqrt(pow((2.0 * N + 1.0), 2.0) - (6.0 * N - 5.0 * sqrt(R)) - 0.5)  )',{
  'N': N,
  'R': R,
  'G': G}).rename('MTVI2');

var FAI = s2normalized.expression ( 'float (N - ((R * (835-1613) + S1 * (664-835))/(664-1613)))',{
  'N': N,
  'R': R, 
  'S1': S1}).rename('FAI');
  
var REIP1 = s2normalized.expression ( 'float (700.0 + 40.0 * ((((R + R3) / 2.0) - R1) / (R2 - R1)))',{
  'R': R,
  'R1': R1, 
  'R2': R2, 
  'R3': R3}).rename('REIP1');
  
var MMRI = s2normalized.expression ( 'float (abs(MNDWI - NDVI) / abs(MNDWI + NDVI))',{
  'MNDWI': MNDWI,
  'NDVI': NDVI}).rename('MMRI');
  
var MI = s2normalized.expression ( 'float ( ((N-S1)/(N*S1))*10000 )',{
  'N': N,
  'S1': S1}).rename('MI');

var BWDRVI = s2normalized.expression ( 'float ( (0.1 * N - B)/(0.1 * N + B) )',{
  'N': N,
  'B': B}).rename('BWDRVI');

var WDRVI = s2normalized.expression ( 'float ( (0.1 * N - R)/(0.1 * N + R) )',{
  'N': N,
  'R': B}).rename('WDRVI');

var AVI = s2normalized.expression ( 'float ( 2 * R4 - R )',{
  'R': R,
  'R4': R4}).rename('AVI');

var WDVI = s2normalized.expression ( 'float ( N - R * 0.5 )',{
  'N': N,
  'R': R}).rename('WDVI');

var TNDVI = s2normalized.expression ( 'float ( sqrt((N - R)/(N + R) + 0.5) )',{
  'N': N,
  'R': R}).rename('TNDVI');

var SIPI3 = s2normalized.expression ( 'float ( (N - B) / (N - R) )',{
  'N': N,
  'B': B,
  'R': R}).rename('SIPI3');

var S2REP = s2normalized.expression ( 'float ( 705.0 + 35.0 * ((((R3 + R) / 2.0) - R1) / (R2 - R1)) )',{
  'R': R,
  'R1': R1,
  'R2': R2,
  'R3': R3}).rename('S2REP');

var RDVI = s2normalized.expression ( 'float ( (N - R) / pow((N + R), 0.5) )',{
  'N': N,
  'R': R}).rename('RDVI');

var PNDVI = s2normalized.expression ( 'float ( (N-(G+R+B))/(N+(G+R+B)) )',{
  'N': N,
  'R': R,
  'G': G,
  'B': B}).rename('PNDVI');

var MCARI = s2normalized.expression ( 'float ( ((R1 - R) - 0.2 * (R1 - G)) * (R1 / R) )',{
  'G': G,
  'R': R,
  'R1': R1}).rename('MCARI');

var MCARI1 = s2normalized.expression ( 'float ( 1.2 * (2.5 * (N - R) - 1.3 * (N - G)) )',{
  'G': G,
  'R': R,
  'N': N}).rename('MCARI1');

var MCARI2 = s2normalized.expression ( 'float ( 1.5 * (2.5 * (N - R) - 1.3 * (N - G)) / sqrt(pow((2.0 * N + 1.0), 2.0) - (6.0 * N - 5.0 * sqrt(R)) - 0.5) )',{
  'B': B,
  'G': G,
  'R': R,
  'N': N}).rename('MCARI2');

var GLI = s2normalized.expression ( 'float ( (2.0 * G - R - B) / (2.0 * G + R + B) )',{
  'R': R,
  'G': G,
  'B': B}).rename('GLI');

var GEMI = s2normalized.expression ( 'float ( ((2.0*((N ** 2.0)-(R ** 2.0)) + 1.5*N + 0.5*R)/(N + R + 0.5))*(1.0 - 0.25*((2.0 * ((N ** 2.0) - (R ** 2)) + 1.5 * N + 0.5 * R)/(N + R + 0.5)))-((R - 0.125)/(1 - R)) )',{
  'N': N,
  'R': R}).rename('GEMI');

var GEMImNDVI = s2normalized.expression ( 'float ( GEMI - NDVI )',{
  'GEMI': GEMI,
  'NDVI': NDVI}).rename('GEMImNDVI');
  
// var ChREI = s2normalized.expression ( 'float ( (R3 / R1) ** (-1.0) )',{
//   'R3': R3,
//   'R1': R1}).rename('ChREI');

var VARI700 = s2normalized.expression ( 'float ( (R1 - 1.7 * R + 0.7 * B) / (R1 + 2.3 * R - 1.3 * B) )',{
  'R': R,
  'B': B,
  'R1': R1}).rename('VARI700');

var WVNDVI = s2normalized.expression ( 'float ( (N * 2 - R)/(N * 2 + R ) )',{
  'R': R,
  'N': N}).rename('WVNDVI');

var GARI = s2normalized.expression ( 'float ( ( N - (G-(B- R))) /  ( N- (G+(B - R))) )',{
  'N': N,
  'G': G,
  'R': R,
  'B': B}).rename('GARI');

var NLI = s2normalized.expression ( 'float ( ((N ** 2) - R)/((N ** 2) + R) )',{
  'N': N,
  'R': R}).rename('NLI');
    
var TDVI = s2normalized.expression ( 'float ( 1.5 * ((N - R)/((N ** 2.0 + R + 0.5) ** 0.5)) )',{
  'N': N,
  'R': R}).rename('TDVI');
    
var RTVI = s2normalized.expression ( 'float ( 100 * (N - R1) - 10 * (N - G) )',{
  'N': N,
  'G': G,
  'R1': R1}).rename('RTVI');
  
var CTVI = s2normalized.expression ( 'float ( (NDVI+0.5)/abs(NDVI+0.5)*sqrt(abs((NDVI)+0.5)) )',{
  'NDVI': NDVI}).rename('CTVI');
    
var SQSR = s2normalized.expression ( 'float ( sqrt(N/R) )',{
  'N': N,
  'R': R}).rename('SQSR');
    
var REVI = s2normalized.expression ( 'float ( 2.5 * ((N-R1)/(N + (2.4*R1) + 1)) )',{
  'N': N,
  'R1': R1}).rename('REVI');
      
var EVIRE1  = s2normalized.expression ( 'float ( 2.5*(R1-R)/(R1 + 6*R-7.5*B + 1) )',{
  'N': N,
  'R': R,
  'B': B,
  'R1': R1}).rename('EVIRE1');
      
var EVIRE2  = s2normalized.expression ( 'float ( 2.5*(N-R1)/(N + 6*R1-7.5*B + 1) )',{
  'N': N,
  'B': B,
  'R1': R1}).rename('EVIRE2');
        
var ExG = s2normalized.expression ( 'float ( 2 * G - R - B )',{
  'R': R,
  'G': G,
  'B': B}).rename('ExG');

var ExGR = s2normalized.expression ( 'float ( ExG - 1.4 * R - G )',{
  'R': R,
  'G': G,
  'ExG': ExG}).rename('ExGR');        

var CIVE = s2normalized.expression ( 'float ( 0.441*R - 0.881*G + 0.385*B + 18.78745 )',{
  'R': R,
  'G': G,
  'B': B}).rename('CIVE');
  
var VEG = s2normalized.expression ( 'float ( G / (( pow (R, 0.667) * pow (B, 1-0.667)) ) ) ',{
  'G': N,
  'R': R,
  'B': B}).rename('VEG');
        
var COM = s2normalized.expression ( 'float ( 0.25*ExG + 0.3*ExGR + 0.33*CIVE + 0.12*VEG )',{
  'ExG': ExG,
  'ExGR': ExGR,
  'CIVE': CIVE,
  'VEG': VEG}).rename('COM');

var CCCI = s2normalized.expression ( 'float ( ((N - R1)/( N + R1))/((N - R)/( N + R)) )',{
  'N': N,
  'R': R,
  'R1': R1}).rename('CCCI');
  
var CRI = s2normalized.expression ( 'float ( (1/G)+(1/N) )',{
  'N': N,
  'G': G}).rename('CRI');

var TGI = s2normalized.expression ( 'float ( - 0.5 * (190 * (R - G) - 120 * (R - B)) )',{
  'R': R,
  'G': G,
  'B': B}).rename('TGI');
  
var SVV1a = s2normalized.select('B2','B3','B4','B8','B11','B12').reduce(ee.Reducer.stdDev()).rename("SVV1a");
var SVV1b = s2normalized.select('B8','B11','B12').reduce(ee.Reducer.stdDev()).rename("SVV1b");
var SVVI = SVV1a.subtract(SVV1b).rename("SVVI");

var sen1 = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(date)
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(indus)

var VV = sen1.select('VV').mean().focal_mean(10, 'circle', 'meters').toFloat().clip(indus).rename('VV');
var VH = sen1.select('VH').mean().focal_mean(10, 'circle', 'meters').toFloat().clip(indus).rename('VH');

var VVdVH = VV.divide(VH).rename('VVdVH');
var VHdVV = VH.divide(VV).rename('VHdVV');
var VVsVH = VV.subtract(VH).rename(['VVsVH']);
var VHsVV = VH.subtract(VV).rename(['VHsVV']);
var VVaVH = VV.add(VH).rename(['VVaVH']);
var VVmVH = VV.multiply(VH).rename(['VVmVH']);
var S1_NDBI = VV.subtract(VH).divide(VV.add(VH)).rename('S1_NDBI');
var S1_DpRVIVV = VH.multiply(4).divide(VV.add(VH)).rename('S1_DpRVIVV');
var S1_VDDPI = (VV.add(VH)).divide(VV).rename('S1_VDDPI');

var PALSAR = ee.Image("JAXA/ALOS/PALSAR/YEARLY/SAR/2020").select('HH', 'HV').focal_mean(30, 'circle', 'meters').clip(indus.geometry());
var HH = PALSAR.select('HH').pow(2).log10().multiply(10).add(-83.0).rename('HH');
var HV = PALSAR.select('HV').pow(2).log10().multiply(10).add(-83.0).rename('HV');

var HHdHV = HH.divide(HV).rename('HHdHV');
var HVdHH = HV.divide(HH).rename('HVdHH');
var HHsHV = HH.subtract(HV).rename(['HHsHV']);
var HVsHH = HV.subtract(HH).rename(['HVsHH']);
var HHaHV = HH.add(HV).rename(['HHaHV']);
var HHmHV = HH.multiply(HV).rename(['HHmHV']);
var PALSAR_NDBI = HH.subtract(HV).divide(HH.add(HV)).rename('PALSAR_NDBI');
var PALSAR_DpRVIHH = HV.multiply(4).divide(HH.add(HV)).rename('PALSAR_DpRVIHH');
var PALSAR_VDDPI = (HH.add(HV)).divide(HH).rename('PALSAR_VDDPI');

var QpRVI = (HV.multiply(8)).divide((HH.add(VV).add(HV.multiply(2)))).rename('QpRVI');
var VVdHH = VV.divide(HH).rename('VVdHH');
var HHdVV = HH.divide(VV).rename('HHdVV');
var VVdHV = VV.divide(HV).rename('VVdHV');
var HVdVV = HV.divide(VV).rename('HVdVV');
var HHsVV = HH.subtract(VV).rename('HHsVV');
var VVsHH = VV.subtract(HH).rename('VVsHH');
var HVaVH = HV.add(VH).rename('HVaVH');
var HHaVV = HH.add(VV).rename('HHaVV');
var BMI = HHaVV.divide(2).rename('BMI');
var CSI = VV.divide(VV.add(HH)).rename('CSI');
var VSI = HV.divide(HV.add(BMI)).rename('VSI');

var composite = ee.Image([CCCI,REIP1,EVIRE2,rh90,rh75,SNR,MNDWI,SRre,SGR,validatedCHM,TC6,S2REP,GEMImNDVI,QpRVI,rh50,R1,TCARIdOSAVI,HVaVH,MSRren,RNR]) //check1

var bands = composite.bandNames()
var input = composite.select(bands)

var trainingSample = input.sampleRegions({
  collection: training,
  properties: ["AGBD_obs"],
  scale: 10,
});

var classifier = ee.Classifier.smileRandomForest(112).train(trainingSample,"AGBD_obs", bands).setOutputMode('REGRESSION');
var AGBfromObsAGB = input.classify(classifier).clip(indus.geometry()).updateMask(NDVI.gte(0.1)).rename('AGBfromObsAGB');
