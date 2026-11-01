/**** CONFIG ****/
var assetIdPts = 'projects/ee-ahmadammargeo/assets/phd/belfast_epc_2024_pts';
var assetIdBnd = 'projects/ee-ahmadammargeo/assets/phd/belfast';
var start = '2024-01-01';
var end   = '2024-12-31';

// working projection for any neighborhood ops (safe default)
var WORK_SCALE = 10;
var WORK_PROJ  = ee.Projection('EPSG:3857').atScale(WORK_SCALE);

/**** 1) AOI ****/
var bnd = ee.FeatureCollection(assetIdBnd);
var aoi = bnd.geometry().dissolve();
var aoiSimple = aoi.simplify(50);
Map.centerObject(aoi, 11);

/**** 2) LOAD POINTS; BUILD GEOMETRY FROM LON/LAT IF NEEDED ****/
var table = ee.FeatureCollection(assetIdPts);
var names = ee.List(table.first().propertyNames());
var lower = names.map(function (p) { return ee.String(p).toLowerCase(); });
var lonIdx = lower.indexOf('lon');
var latIdx = lower.indexOf('lat');

function buildPts(lonName, latName) {
  lonName = ee.String(lonName); latName = ee.String(latName);
  return table.map(function (f) {
    var lon = ee.Number(f.get(lonName));
    var lat = ee.Number(f.get(latName));
    return ee.Feature(ee.Geometry.Point([lon, lat]), { uid: f.get('uid') });
  }).filterBounds(aoi);
}

var pts = ee.FeatureCollection(
  ee.Algorithms.If(
    lonIdx.gte(0),
    ee.FeatureCollection(
      ee.Algorithms.If(
        latIdx.gte(0), buildPts(names.get(lonIdx), names.get(latIdx)),
        table.select(['uid']).filterBounds(aoi)
      )
    ),
    table.select(['uid']).filterBounds(aoi)
  )
);

// add lon/lat attributes for export & QC
var ptsXY = pts.map(function (f) {
  var c = f.geometry().coordinates();
  return f.set({'lon': c.get(0), 'lat': c.get(1)});
});
Map.addLayer(pts.limit(2000), {color:'red'}, 'points (preview)', false);

/**** HELPERS ****/
// S2 SR cloud/shadow mask + scale to reflectance [0..1]
function maskS2sr(img){
  var scl = img.select('SCL');
  var ok  = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  var qa  = img.select('QA60');
  var qaOk= qa.bitwiseAnd(1<<10).eq(0).and(qa.bitwiseAnd(1<<11).eq(0));
  return img.updateMask(ok.and(qaOk)).multiply(0.0001).copyProperties(img, img.propertyNames());
}

// Curated S2 indices (reduced redundancy)
function addS2Indices(img){
  var B2=img.select('B2'), B3=img.select('B3'), B4=img.select('B4'), B5=img.select('B5'),
      B6=img.select('B6'), B7=img.select('B7'), B8=img.select('B8'), B8A=img.select('B8A'),
      B11=img.select('B11'), B12=img.select('B12');

  var NDVI  = B8.subtract(B4).divide(B8.add(B4)).rename('s2_NDVI');
  var NDWI  = B3.subtract(B8).divide(B3.add(B8)).rename('s2_NDWI');
  var NDBI  = B11.subtract(B8).divide(B11.add(B8)).rename('s2_NDBI'); // NDMI ~ -NDBI, so drop NDMI
  var EVI   = B8.subtract(B4).multiply(2.5)
               .divide(B8.add(B4.multiply(6)).subtract(B2.multiply(7.5)).add(1)).rename('s2_EVI');
  var MSAVI2= (B8.multiply(2).add(1)
              .subtract((B8.multiply(2).add(1)).pow(2)
              .subtract(B8.subtract(B4).multiply(8)).sqrt()))
              .divide(2).rename('s2_MSAVI2');
  var NDRE1 = B5.subtract(B4).divide(B5.add(B4)).rename('s2_NDRE1');
  var NDRE2 = B6.subtract(B4).divide(B6.add(B4)).rename('s2_NDRE2');
  var BSI   = (B11.add(B4).subtract(B8.add(B2)))
              .divide(B11.add(B4).add(B8).add(B2)).rename('s2_BSI');
  var UI    = B11.divide(B4).rename('s2_UI');
  var SimpleAlbedo = B2.add(B3).add(B4).add(B5).add(B6).add(B7).divide(6).rename('s2_SimpleAlbedo');
  var NIRv  = B8.multiply(NDVI).rename('s2_NIRv');
  var Bright= B11.pow(2).add(B12.pow(2)).sqrt().rename('s2_Brightness');

  return img.addBands([NDVI,NDWI,NDBI,EVI,MSAVI2,NDRE1,NDRE2,BSI,UI,SimpleAlbedo,NIRv,Bright]);
}

// Sentinel-1 utilities
function toLinear(db){ return ee.Image(10).pow(db.divide(10)); }

// S1: VV/VH dB medians + ratio from median linear intensities (with eps) + median angle
function s1Stack(s1Col){
  var medDB  = s1Col.median();
  var VVdB   = medDB.select('VV').rename('s1_VV_dB');
  var VHdB   = medDB.select('VH').rename('s1_VH_dB');
  var angMed = s1Col.select('angle').median().rename('s1_incAngle');

  var colLinear = s1Col.map(function(img){
    var vvlin = toLinear(img.select('VV')).rename('VVlin');
    var vhlin = toLinear(img.select('VH')).rename('VHlin');
    return vvlin.addBands(vhlin).addBands(img.select('angle'));
  });
  var medLin = colLinear.median();
  var eps = ee.Image(1e-6);
  var ratio  = medLin.select('VVlin').divide(medLin.select('VHlin').max(eps)).rename('s1_VV_over_VH');

  return ee.Image.cat([VVdB, VHdB, ratio, angMed]);
}

// Landsat-8 L2 → LST (°C)
function l8QaMask(img){
  var qa = img.select('QA_PIXEL');
  var qaOk = qa.bitwiseAnd(1<<3).eq(0)
    .and(qa.bitwiseAnd(1<<4).eq(0))
    .and(qa.bitwiseAnd(1<<5).eq(0))
    .and(qa.bitwiseAnd(1<<7).eq(0));

  var stOk = ee.Image(ee.Algorithms.If(
    img.bandNames().contains('ST_QA'),
    img.select('ST_QA').lte(1),  // 0=best,1=good
    ee.Image(1)
  ));
  return qaOk.and(stOk);
}
function l8LstC(l8ColRaw){
  var ic = l8ColRaw.map(function(img){
      var kelvin = img.select('ST_B10').multiply(0.00341802).add(149.0);
      var c = kelvin.subtract(273.15).rename('l8_LST_C');
      return c.updateMask(l8QaMask(img)).copyProperties(img, img.propertyNames());
    });
  return ic.median().clip(aoi);
}

// WorldCover + built fraction
function worldcover10() {
  var wc = ee.Image('ESA/WorldCover/v200/2021').clip(aoi);
  var built = wc.eq(50).unmask(0).rename('wc_built');
  var water = wc.eq(80).unmask(0).rename('wc_water');
  var built_frac_100m = built.focal_mean({radius: 100, units: 'meters'}).rename('wc_built_frac_100m');
  return built.addBands([water, built_frac_100m]);
}

/* ---------- SAFE median helper ---------- */
function safeMedianNumber(img, band, maskImg, geom, scale){
  var masked = ee.Image(img);
  if (maskImg) masked = masked.updateMask(maskImg);
  var d1 = masked.reduceRegion({
    reducer: ee.Reducer.median(), geometry: geom, scale: scale,
    bestEffort: true, tileScale: 4, maxPixels: 1e13
  });
  var n1 = ee.Number(d1.get(band));

  var d2 = img.reduceRegion({
    reducer: ee.Reducer.median(), geometry: geom, scale: scale,
    bestEffort: true, tileScale: 4, maxPixels: 1e13
  });
  var n2 = ee.Number(d2.get(band));

  return ee.Number(ee.Algorithms.If(n1, n1, ee.Algorithms.If(n2, n2, 0)));
}

// L8 sUHI (SAFE)
function l8SUHI(lstC, wcBands){
  var builtDilated = wcBands.select('wc_built').focal_max({radius: 1000, units: 'meters'});
  var ruralMask = builtDilated.eq(0).and(wcBands.select('wc_water').eq(0));
  var medRural = safeMedianNumber(lstC, 'l8_LST_C', ruralMask, aoiSimple, 30);
  return lstC.subtract(medRural).rename('l8_sUHI_C');
}

// MODIS night sUHI (SAFE)
function modisNightSUHI(wcBands){
  var mod = ee.ImageCollection('MODIS/061/MOD11A2')
    .filterDate(start, end).filterBounds(aoi)
    .select('LST_Night_1km').mean();
  var nightC = mod.multiply(0.02).subtract(273.15).rename('modis_LST_night_C').clip(aoi);

  var builtDilated = wcBands.select('wc_built').focal_max({radius: 1000, units: 'meters'});
  var ruralMask = builtDilated.eq(0).and(wcBands.select('wc_water').eq(0));

  var medRural = safeMedianNumber(nightC, 'modis_LST_night_C', ruralMask, aoiSimple, 1000);
  var suhi = nightC.subtract(medRural).rename('modis_sUHI_C');
  return nightC.addBands(suhi);
}

// DEM + terrain
function demStack(){
  var dem = ee.Image('NASA/NASADEM_HGT/001').select('elevation').rename('dem_elev').clip(aoi);
  var t   = ee.Terrain.products(dem);
  var slope = t.select('slope').rename('dem_slope');
  var aspect= t.select('aspect');
  var north = aspect.multiply(Math.PI/180).cos().rename('dem_northness');
  var east  = aspect.multiply(Math.PI/180).sin().rename('dem_eastness');
  var rough = dem.reduceNeighborhood({
      reducer: ee.Reducer.stdDev(),
      kernel: ee.Kernel.square(1),
      skipMasked: true
  }).rename('dem_roughness');
  return ee.Image.cat([dem, slope, north, east, rough]);
}

/* ERA5-Land aggregation */
function era5Annual(){
  var hourly = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
      .filterDate(start, end).filterBounds(aoi)
      .select(['u_component_of_wind_10m','v_component_of_wind_10m','temperature_2m']);

  var uMean = hourly.select('u_component_of_wind_10m').mean().rename('era5_u10');
  var vMean = hourly.select('v_component_of_wind_10m').mean().rename('era5_v10');

  var spdMean = hourly.map(function(img){
      var u = img.select('u_component_of_wind_10m');
      var v = img.select('v_component_of_wind_10m');
      return u.pow(2).add(v.pow(2)).sqrt().rename('spd');
    }).mean().rename('era5_wind_speed');

  var spdVec = uMean.pow(2).add(vMean.pow(2)).sqrt().rename('era5_wind_speed_vec');
  var t2mC   = hourly.select('temperature_2m').mean().subtract(273.15).rename('era5_t2m_C');

  var tp = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
      .filterDate(start, end).filterBounds(aoi)
      .select('total_precipitation_sum')
      .sum().rename('era5_tp_sum_m');

  return ee.Image.cat([uMean, vMean, spdMean, spdVec, t2mC, tp]).clip(aoi);
}

// VIIRS NTL (mean)
function viirsMean(){
  var col = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
    .filterDate(start, end).filterBounds(aoi).select('avg_rad');
  var img = ee.Image(ee.Algorithms.If(col.size().gt(0), col.mean(), ee.Image.constant(0)))
            .rename('viirs_avg_rad').clip(aoi);
  return img;
}

/**** SOURCE COLLECTIONS ****/
var s2Col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate(start, end).filterBounds(aoi).map(maskS2sr);

var s1Col = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterDate(start, end).filterBounds(aoi)
  .filter(ee.Filter.eq('instrumentMode','IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VH'));

var l8ColRaw = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterDate(start, end).filterBounds(aoi);

/**** BUILD STACK ****/
// S2 composite + curated indices
var s2Comp = s2Col.median().clip(aoi);
var s2 = addS2Indices(s2Comp).select([
  's2_NDVI','s2_NDWI','s2_NDBI','s2_EVI','s2_MSAVI2',
  's2_NDRE1','s2_NDRE2','s2_BSI','s2_UI','s2_SimpleAlbedo','s2_NIRv','s2_Brightness'
]);

// S1 (with linear-space ratio)
var s1 = s1Stack(s1Col);

// L8 LST
var lst = l8LstC(l8ColRaw);

// WorldCover and UHI
var wc = worldcover10();
var l8_sUHI = l8SUHI(lst, wc);
var modisNight = modisNightSUHI(wc);

// DEM & ERA5 & VIIRS
var demImg = demStack();
var era = era5Annual();
var viirs = viirsMean();

/**** COUNTS ****/
// robust scene totals from pixelLonLat (avoid Image.constant(null))
function sceneTotalImage(col, name){
  var n = ee.Number(col.size());
  return ee.Image.pixelLonLat().select(0).multiply(0).add(n)
           .rename(name).toFloat().clip(aoi);
}
var s2_scene_total = sceneTotalImage(s2Col, 's2_scene_total');
var s1_scene_total = sceneTotalImage(s1Col, 's1_scene_total');
var l8_scene_total = sceneTotalImage(l8ColRaw, 'l8_scene_total');

// per-pixel valid-observation counts
var s2_valid_count = s2Col.map(function(img){
  return img.select('B8').mask().gt(0).rename('v').unmask(0);
}).sum().toInt16().rename('s2_valid_count');

var l8_valid_count = l8ColRaw.map(function(img){
  return l8QaMask(img).rename('v').unmask(0);
}).sum().toInt16().rename('l8_valid_count');

var s1_valid_count = s1Col.map(function(img){
  return img.select('VV').mask().gt(0).rename('v').unmask(0);
}).sum().toInt16().rename('s1_valid_count');

/**** ML-DERIVED FEATURES (fractions, logs, flags, clamps) ****/
function addMLDerived(base){
  // Fractions with safe denom (0 -> 1), so 0/1 = 0 when no scenes
  var s2_frac = s2_valid_count.toFloat()
      .divide(s2_scene_total.where(s2_scene_total.eq(0), 1)).rename('s2_valid_frac');
  var s1_frac = s1_valid_count.toFloat()
      .divide(s1_scene_total.where(s1_scene_total.eq(0), 1)).rename('s1_valid_frac');
  var l8_frac = l8_valid_count.toFloat()
      .divide(l8_scene_total.where(l8_scene_total.eq(0), 1)).rename('l8_valid_frac');

  // Stable transforms
  var s1_log_ratio = base.select('s1_VV_over_VH').max(1e-6).log().rename('s1_log_ratio');
  var viirs_log1p  = base.select('viirs_avg_rad').max(0).add(1).log().rename('viirs_log1p');

  // Flags (0/1)
  var l8_has_data = l8_valid_count.gt(0).toByte().rename('l8_has_data');
  var s2_has_data = s2_valid_count.gt(0).toByte().rename('s2_has_data');
  var s1_has_data = s1_valid_count.gt(0).toByte().rename('s1_has_data');

  // Optional clamps (keep originals too)
  var l8_LST_C_clamped = base.select('l8_LST_C').clamp(-30, 60).rename('l8_LST_C_clamped');
  var modis_LST_night_C_clamped =
      base.select('modis_LST_night_C').clamp(-50, 50).rename('modis_LST_night_C_clamped');

  return base.addBands([
    s2_frac, s1_frac, l8_frac,
    s1_log_ratio, viirs_log1p,
    l8_has_data, s2_has_data, s1_has_data,
    l8_LST_C_clamped, modis_LST_night_C_clamped
  ]);
}

/**** FINAL STACK ****/
var stack0 = ee.Image.cat([
  s2, s1, lst, l8_sUHI, modisNight, demImg, era, viirs,
  wc.select(['wc_built','wc_water','wc_built_frac_100m']),
  // counts
  s2_scene_total, s1_scene_total, l8_scene_total,
  s2_valid_count, s1_valid_count, l8_valid_count
]).toFloat().clip(aoi);

// Add ML-friendly derived features
var stack = addMLDerived(stack0);

// Fill masked with sentinel so every point returns values (keep for CSV completeness)
var stackFilled = stack.unmask(-9999);

// Sanity
print('Stack bands (curated + counts + ML derived):', stack.bandNames());

/**** 1-POINT PREVIEW ****/
var preview = stackFilled.sampleRegions({
  collection: ptsXY.limit(1), properties: ['uid','lon','lat'],
  scale: WORK_SCALE, geometries: true, tileScale: 4
});
print('Preview (first point):', preview.first());

/**** EXPORT ****/
var selectors = ee.List([
  // S2 (curated)
  's2_NDVI','s2_NDWI','s2_NDBI','s2_EVI','s2_MSAVI2',
  's2_NDRE1','s2_NDRE2','s2_BSI','s2_UI','s2_SimpleAlbedo','s2_NIRv','s2_Brightness',

  // S1 (dB + linear ratio + angle + log-ratio)
  's1_VV_dB','s1_VH_dB','s1_VV_over_VH','s1_log_ratio','s1_incAngle',

  // Thermal & UHI (+ clamps)
  'l8_LST_C','l8_LST_C_clamped','l8_sUHI_C',
  'modis_LST_night_C','modis_LST_night_C_clamped','modis_sUHI_C',

  // Terrain
  'dem_elev','dem_slope','dem_northness','dem_eastness','dem_roughness',

  // ERA5
  'era5_u10','era5_v10','era5_wind_speed','era5_wind_speed_vec','era5_t2m_C','era5_tp_sum_m',

  // VIIRS (+ log1p)
  'viirs_avg_rad','viirs_log1p',

  // WorldCover
  'wc_built','wc_water','wc_built_frac_100m',

  // Scene totals (global metadata)
  's2_scene_total','s1_scene_total','l8_scene_total',

  // Per-pixel valid counts & fractions + flags
  's2_valid_count','s1_valid_count','l8_valid_count',
  's2_valid_frac','s1_valid_frac','l8_valid_frac',
  's2_has_data','s1_has_data','l8_has_data'
]);

var sampled = stackFilled.sampleRegions({
  collection: ptsXY, properties: ['uid','lon','lat'], scale: WORK_SCALE,
  geometries: false, tileScale: 4
}).select(ee.List(['uid','lon','lat']).cat(selectors));

Export.table.toDrive({
  collection: sampled,
  description: 'Belfast_2024_point_samples_uid_features_CURATED_MLREADY',
  folder: 'PhD',
  fileFormat: 'CSV'
});
