//FOR VEGETATIVE AREA

var s2 = ee.ImageCollection("COPERNICUS/S2");
    
var startdate = ee.Date.fromYMD(2014,1,1);
var enddate = ee.Date.fromYMD(2015,12,31);

var dist = ee.FeatureCollection('ft:1jOPCngvI9kH_0qbWUY6msMLQppEgArIAXaJPSvtd', 'geometry');
var Sentinel2 = s2.filterBounds(dist)
                .filterDate(startdate, enddate)
                .filterBounds(dist);

var cloudfunction_ST2 = function(image){
  var quality = image.select("QA60").unmask();
  var cloud01 = quality.gt(0);
  var cloudmask = image.mask().and(cloud01.not());
  return image.updateMask(cloudmask);
};

var ST2_nocloud = Sentinel2.map(cloudfunction_ST2);
var st2median = ST2_nocloud.median();

var ndvi = st2median.normalizedDifference(['B8', 'B4']);

var vegetationThreshold = 0.35;

var ndvi_th = ndvi.gt(vegetationThreshold);
var myndvi = ndvi_th.updateMask(ndvi_th).clip(dist);
var ndvi_viz = {palette:"006b0c"};
//Map.addLayer(myndvi, ndvi_viz,'Vegetation');

var area = ndvi_th.multiply(ee.Image.pixelArea());

var distVeg = area.reduceRegions({
  collection: dist,
  reducer: ee.Reducer.sum(),
  scale:10,
//  maxPixels: 1e13
});

var polyOut = distVeg.select(['.*'],null,false);

polyOut = polyOut.map(function(feature){
return feature.set('Year',2014);
});

Export.table.toDrive({
  collection: polyOut,
  description: 'distVeg',
  folder: 'GEE',
  fileFormat: 'CSV'
});   

//FOR URBAN AREA

var dist = ee.FeatureCollection('ft:1jOPCngvI9kH_0qbWUY6msMLQppEgArIAXaJPSvtd', 'geometry');

var data = ee.Image('JRC/GHSL/P2016/BUILT_LDSMT_GLOBE_V1');
var built = data.select(['built']);
var built2014 = built.eq(3);

var area = built2014.multiply(ee.Image.pixelArea());

var distBuilt = area.reduceRegions({
  collection: dist,
  reducer: ee.Reducer.sum(),
});

var polyOut = distBuilt.select(['.*'],null,false);

polyOut = polyOut.map(function(feature){
return feature.set('Year',2014);
});

Export.table.toDrive({
  collection: polyOut,
  description: 'distBuilt',
  folder: 'GEE',
  fileFormat: 'CSV'
});   