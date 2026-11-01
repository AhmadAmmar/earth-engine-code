/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var roi = ee.FeatureCollection("users/ahmadammargeo/AJK");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var collections2sr = ee.ImageCollection('COPERNICUS/S2_SR')
              .filterDate('2020-01-01', '2020-12-31')
              .filterBounds(roi.geometry())
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',10))
var comp = collections2sr.median().clip(roi.geometry());
var visualization = { min: 0, max: 3000, bands: ['B4', 'B3', 'B2'], };
Map.addLayer(comp, visualization, 'RGB');

var waterOcc = ee.Image("JRC/GSW1_0/GlobalSurfaceWater").select('occurrence'),
    jrc_data0 = ee.Image("JRC/GSW1_0/Metadata").select('total_obs').lte(0),
    waterOccFilled = waterOcc.unmask(0).max(jrc_data0),
    waterMask = waterOccFilled.lt(50);

var ndsi = comp.normalizedDifference(['B3', 'B11']).rename('Class');

var ndsi_th = ndsi.gt(0.42)
var myndsi = ndsi_th.updateMask(ndsi_th).updateMask(waterMask)
var ndsiConst = myndsi.where(myndsi, ee.Number((0)))
var ndsi_viz = {palette:['yellow']};
Map.addLayer(ndsiConst, ndsi_viz, 'snow');

var snowP = ndsiConst.sample({
    region: roi.geometry(),
    scale: 10,
    numPixels: 2500,
    seed: 3,
    geometries: true,
});

var snow = ee.FeatureCollection(snowP);

Export.table.toDrive({
  collection: snow,
  description:'snow',
  fileFormat: 'SHP'
});