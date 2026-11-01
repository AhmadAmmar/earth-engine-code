/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var london = ee.FeatureCollection("projects/ee-ahmadammargeo/assets/phd/london"),
    buildings = ee.FeatureCollection("projects/ee-ahmadammargeo/assets/phd/london_buildings");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// =======================
//  TIME RANGE
// =======================
var start = '2024-01-01';
var end   = '2024-12-31';

// =======================
//  SENTINEL-2 PROCESSING
// =======================
var rawS2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(london)
  .filterDate(start, end)
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
  .median()
  .clip(london);

// Scale bands by 0.0001
var s2 = rawS2.multiply(0.0001);

// === Bands (match local names) ===
var B2 = s2.select("B2").rename("B2");
var B3 = s2.select("B3").rename("B3");
var B4 = s2.select("B4").rename("B4");
var B5 = s2.select("B5").rename("B5");
var B6 = s2.select("B6").rename("B6");
var B7 = s2.select("B7").rename("B7");
var B8 = s2.select("B8").rename("B8");
var B8A = s2.select("B8A").rename("B8A");
var B11 = s2.select("B11").rename("B11");
var B12 = s2.select("B12").rename("B12");

// === Indices (match local column names) ===
var NDVI  = B8.subtract(B4).divide(B8.add(B4)).rename("NDVI");
var NDBI  = B11.subtract(B8).divide(B11.add(B8)).rename("NDBI");
var UI    = B11.divide(B4).rename("UI");
var IBI   = B11.subtract(B8A).divide(B11.add(B8A)).rename("IBI");
var EVI   = B8.subtract(B4).multiply(2.5)
              .divide(B8.add(B4.multiply(6)).subtract(B2.multiply(7.5)).add(1))
              .rename("EVI");
var NDWI  = B3.subtract(B8).divide(B3.add(B8)).rename("NDWI");
var GNDVI = B8.subtract(B3).divide(B8.add(B3)).rename("GNDVI");
var SAVI  = B8.subtract(B4).multiply(1.5).divide(B8.add(B4).add(0.5)).rename("SAVI");
var LSWI  = B8.subtract(B11).divide(B8.add(B11)).rename("LSWI");
var BUI   = NDBI.subtract(NDVI).rename("BUI");
var Brightness_Index = B11.pow(2).add(B12.pow(2)).sqrt().rename("Brightness_Index");
var Albedo_Proxy = B2.add(B3).add(B4).add(B5).add(B6).add(B7).divide(6).rename("Albedo_Proxy");
var Moisture_Index = NDWI.subtract(NDBI).rename("Moisture_Index");
var RE_NDVI = B5.subtract(B4).divide(B5.add(B4)).rename("RE_NDVI");
var SWIR_NDWI = B3.subtract(B11).divide(B3.add(B11)).rename("SWIR_NDWI");

// =======================
//  SENTINEL-1 PROCESSING
// =======================
var s1 = ee.ImageCollection("COPERNICUS/S1_GRD")
  .filterBounds(london)
  .filterDate(start, end)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
  .mean()
  .focal_mean(10, 'circle', 'meters')
  .clip(london);

var VV = s1.select("VV").rename("VV");
var VH = s1.select("VH").rename("VH");
var VV_VH_Sum = VV.add(VH).rename("VV_VH_Sum");
var VV_VH_Diff = VV.subtract(VH).rename("VV_VH_Difference");
var VV_VH_Prod = VV.multiply(VH).rename("VV_VH_Product");
var VV_VH_ND = VV.subtract(VH).divide(VV.add(VH)).rename("VV_VH_Normalized_Difference");
var VV_Proportion = VV.divide(VV.add(VH)).rename("VV_Proportion");
var VH_Proportion = VH.divide(VV.add(VH)).rename("VH_Proportion");
var Advanced_Polarization_Index = VV.subtract(VH).multiply(2).divide(VV.add(VH)).rename("Advanced_Polarization_Index");

// =======================
//  LANDSAT-8 PROCESSING
// =======================
var l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .filterBounds(london)
  .filterDate(start, end)
  .map(function(img) {
    var thermal = img.select("ST_B10").multiply(0.00341802).add(149).subtract(273.15).rename("L8B10");
    return img.addBands(thermal);
  })
  .median()
  .clip(london);

var L8B10 = l8.select("L8B10");

// =======================
//  STACK ALL BANDS & INDICES
// =======================
var all = ee.Image.cat([
  B2, B3, B4, B5, B6, B7, B8, B8A, B11, B12,         // Scaled Bands
  VV, VH,                                            // SAR
  L8B10,                                             // Thermal
  NDVI, NDBI, UI, IBI, EVI, NDWI, GNDVI,             // Indices
  VV_VH_Sum, VV_VH_Diff, VV_VH_Prod, VV_VH_ND,
  VH_Proportion, VV_Proportion, Advanced_Polarization_Index,
  Moisture_Index, LSWI, BUI, Brightness_Index,
  SWIR_NDWI, SAVI, RE_NDVI, Albedo_Proxy
]);

var allNames = all.bandNames();

// Annotate each feature with its geometry type
var buildingsWithGeomType = buildings.map(function(f) {
  return f.set('geom_type', f.geometry().type());
});

// Filter only Polygon features
var buildingsPoly = buildingsWithGeomType.filter(ee.Filter.eq('geom_type', 'Polygon'));

// Run zonal statistics only on Polygon geometries
var reduced = all.reduceRegions({
  collection: buildingsPoly,
  reducer: ee.Reducer.mean(),
  scale: 10,
  crs: 'EPSG:4326'
});

// Rename columns with _avg suffix
var renamed = reduced.map(function(feature) {
  var props = ee.Dictionary(
    allNames.iterate(function(band, dict) {
      band = ee.String(band);
      dict = ee.Dictionary(dict);
      return dict.set(band.cat('_avg'), feature.get(band));
    }, ee.Dictionary({}))
  );
  return ee.Feature(feature.geometry())
           .set('id', feature.get('id'))
           .set(props);
});

// =======================
//  EXPORT TO DRIVE
// =======================
Export.table.toDrive({
  collection: renamed,
  description: 'ZonalMeans',
  folder: 'PhD',
  fileFormat: 'SHP'
});
