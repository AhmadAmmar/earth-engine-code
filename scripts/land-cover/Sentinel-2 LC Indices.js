/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var s2 = ee.ImageCollection("COPERNICUS/S2"),
    table = ee.FeatureCollection("users/ahmadammargeo/Lhr");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var startdate = ee.Date.fromYMD(2019,1,1);
var enddate = ee.Date.fromYMD(2019,12,31);

Map.centerObject(table,12);

var Sentinel2 = s2.filterBounds(table)
                .filterDate(startdate, enddate)
                .filterBounds(table);
                
var cloudfunction_ST2 = function(image){
  var quality = image.select("QA60").unmask();
  var cloud01 = quality.gt(0);
  var cloudmask = image.mask().and(cloud01.not());
  return image.updateMask(cloudmask);
};

var ST2_nocloud = Sentinel2.map(cloudfunction_ST2);
var st2median = ST2_nocloud.median();

var ndvi = st2median.normalizedDifference(['B8', 'B4']);
var ndwi = st2median.normalizedDifference(['B3', 'B11']);
var ndbi = st2median.normalizedDifference(['B12', 'B8']);
var ndci = st2median.normalizedDifference(['B5', 'B4']);
var bsi = st2median.select('B11').add(st2median.select('B4'))
      .subtract(st2median.select('B8').add(st2median.select('B2')))
          .divide(st2median.select('B1').add(st2median.select('B4')).add(st2median.select('B8')).add(st2median.select('B2')));

var vegetationThreshold = 0.2;
var waterThreshold = 0;
var urbanThreshold = -0.06;
var soilThreshold = 0.05;

var ndvi_th = ndvi.gt(vegetationThreshold);
var myndvi = ndvi_th.updateMask(ndvi_th).clip(table);
var ndvi_viz = {palette:"006b0c"};
Map.addLayer(myndvi, ndvi_viz,'Vegetation');

var ndwi_th = ndwi.gt(waterThreshold);
var myndwi = ndwi_th.updateMask(ndwi_th).clip(table);
var ndwi_viz = {palette:"24069b"};
Map.addLayer(myndwi, ndwi_viz, 'Water');

var ndbi_th = ndbi.gt(urbanThreshold);
var myndbi = ndbi_th.updateMask(ndbi_th).clip(table);
var ndbi_viz = {palette:['ff0000']};
Map.addLayer(myndbi, ndbi_viz, 'Urban');

var bsi_th = bsi.gt(soilThreshold);
var mybsi = bsi_th.updateMask(bsi_th).clip(table);
var bsi_viz = {palette:['fff662']};
Map.addLayer(mybsi, bsi_viz, 'Bare Soil');

var viz = {min:0.1,max:0.4,palette:['cyan','orange','red']};
Map.addLayer(ndci, viz, 'Chlorophyll-a Concentration');