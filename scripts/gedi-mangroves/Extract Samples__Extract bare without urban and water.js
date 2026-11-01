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
    water = waterOccFilled.lt(50);
//Map.addLayer(water)

var cover = ee.Image('JRC/GHSL/P2016/BUILT_LDSMT_GLOBE_V1').select('built');
var urban = cover.eq(3).mask(1).not()

var cover1 = ee.ImageCollection('MODIS/006/MCD12Q1')
              .filterDate('2019-01-01', '2020-12-31')
              .select("LC_Type4")
              .first()
var urban1 = cover1.eq(8).mask(1).not()

var cover2 = ee.Image("COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019").select('discrete_classification');
var urban2 = cover2.eq(50).mask(1).not()

var cover3 = ee.Image('ESA/GLOBCOVER_L4_200901_200912_V2_3').select('landcover');
var urban3 = cover3.eq(190).mask(1).not()

var bsi = comp.select('B11').add(comp.select('B4'))
      .subtract(comp.select('B8').add(comp.select('B2')))
          .divide(comp.select('B11').add(comp.select('B4')).add(comp.select('B8')).add(comp.select('B2'))).rename('Class');

var bsi_th = bsi.gt(0.15)
var mybsi = bsi_th.updateMask(bsi_th).updateMask(water).updateMask(urban).updateMask(urban1).updateMask(urban2).updateMask(urban3)
var bsiConst = mybsi.where(mybsi, ee.Number((2)))
var bsi_viz = {palette:['yellow']};
Map.addLayer(bsiConst, bsi_viz, 'bare');

var bareP = bsiConst.sample({
    region: roi.geometry(),
    scale: 10,
    numPixels: 2500,
    seed: 1,
    geometries: true,
});

var bare = ee.FeatureCollection(bareP);

Export.table.toDrive({
  collection: bare,
  description:'bare',
  fileFormat: 'SHP'
});