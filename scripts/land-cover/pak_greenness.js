var s2 = ee.ImageCollection("COPERNICUS/S2");
    
var startdate = ee.Date.fromYMD(2014,1,1);
var enddate = ee.Date.fromYMD(2018,10,28);

var pk = ee.FeatureCollection('ft:1JwW_X9DK4a8fGq9kfgLCQho5ufYYc8nHhvGFhif0');
Map.centerObject(pk,8);

var Sentinel2 = s2.filterBounds(pk)
                .filterDate(startdate, enddate)
                .filterBounds(pk);

var cloudfunction_ST2 = function(image){
  var quality = image.select("QA60").unmask();
  var cloud01 = quality.gt(0);
  var cloudmask = image.mask().and(cloud01.not());
  return image.updateMask(cloudmask);
};

var ST2_nocloud = Sentinel2.map(cloudfunction_ST2);
var st2median = ST2_nocloud.median();

var ndbi = st2median.normalizedDifference(['B12', 'B8']);
var ndvi = st2median.normalizedDifference(['B8', 'B4']);
var ndwi = st2median.normalizedDifference(['B3', 'B8']);

var bareThreshold = 0.5;
var vegetationThreshold = 0;
var waterThreshold = 0.2;

var ndbi_th = ndbi.gt(bareThreshold);
var myndbi = ndbi_th.updateMask(ndbi_th).clip(pk);
var ndbi_viz = {palette:['ff0000']}
Map.addLayer(myndbi, ndbi_viz, 'Urban');

var ndwi_th = ndwi.gt(waterThreshold);
var myndwi = ndwi_th.updateMask(ndwi_th).clip(pk);
var ndwi_viz = {palette:"24069b"};
Map.addLayer(myndwi.clip(pk), ndwi_viz, 'Water');

var ndvi_th = ndvi.gt(vegetationThreshold);
var myndvi = ndvi_th.updateMask(ndvi_th).clip(pk);
var ndvi_viz = {palette:"006b0c"};
Map.addLayer(myndvi, ndvi_viz,'Vegetation');