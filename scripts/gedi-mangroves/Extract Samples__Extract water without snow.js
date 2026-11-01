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

var ndsi = comp.normalizedDifference(['B3', 'B11'])
var myndsi = ndsi.updateMask(ndsi.gt(0.42)).updateMask(waterMask)
var ndsiConst = myndsi.where(myndsi, ee.Number((0)))
var snowmask = ndsiConst.eq(0).mask(1).not()

var mndwi = comp.normalizedDifference(['B3', 'B8']).rename('Class');
var mymndwi = mndwi.updateMask(mndwi.gt(0.2)).updateMask(snowmask)
var mndwiConst = mymndwi.where(mymndwi, ee.Number((6)))
var mndwi_viz = {palette:['blue']};
Map.addLayer(mymndwi, mndwi_viz)

var waterP = mndwiConst.sample({
    region: roi.geometry(),
    scale: 10,
    numPixels: 600000,
    seed: 4,
    geometries: true,
});

var water = ee.FeatureCollection(waterP);

Export.table.toDrive({
  collection: water,
  description:'water',
  fileFormat: 'SHP'
});