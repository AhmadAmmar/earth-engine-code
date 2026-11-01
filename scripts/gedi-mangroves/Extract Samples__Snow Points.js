/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var roi = ee.FeatureCollection("users/ahmadammargeo/AJK");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var collections2sr = ee.ImageCollection('COPERNICUS/S2_SR')
              .filterDate('2020-01-01', '2020-12-31')
              .filterBounds(roi.geometry())
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',10))
var comp = collections2sr.median().clip(roi.geometry());

var bsi = comp.select('B11').add(comp.select('B4'))
      .subtract(comp.select('B8').add(comp.select('B2')))
          .divide(comp.select('B11').add(comp.select('B4')).add(comp.select('B8')).add(comp.select('B2'))).rename('Class');

var bsi_th = bsi.gt(0.15)
var mybsi = bsi_th.updateMask(bsi_th)
var bsiConst = mybsi.where(mybsi, ee.Number((2)))
var bsi_viz = {palette:['yellow']};

var bareP = bsiConst.sample({
    region: roi.geometry(),
    scale: 10,
    numPixels: 6000,
    seed: 0,
    geometries: true,
});

var bare = ee.FeatureCollection(bareP);

Export.table.toDrive({
  collection: bare,
  description:'bare',
  fileFormat: 'SHP'
});

//var visualization = { min: 0, max: 3000, bands: ['B4', 'B3', 'B2'], };
//Map.addLayer(comp, visualization, 'RGB');
//Map.addLayer(bsiConst, bsi_viz, 'Bare Soil');