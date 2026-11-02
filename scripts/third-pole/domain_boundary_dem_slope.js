/***** GREATER THIRD POLE — DEM + slope + optional hydrologic variant *****
 * Builds a detailed polygon for the "Greater Third Pole" using only GEE data.
 * Adds DEBUG prints and a QUICK mode to speed up iteration.
 * ES5-compatible; uses explicit error margins on all geometry ops.
 ****************************************************************************/

// ========================= USER PARAMETERS ================================
var P = {
  // [minLon, minLat, maxLon, maxLat]
  envelope: [58, 20, 112, 50],

  // Elevation & slope logic (inclusive OR across three tiers)
  elevCore_m: 2500,  // Tier A: high core
  elevMid_m: 1500,   // Tier B: mid-high + modest slope
  slopeMid_deg: 5,
  elevLow_m: 1000,   // Tier C: lower but steep
  slopeLow_deg: 10,

  // Raster tidying
  tidyRadius_m: 1500,     // modal filter radius

  // Vectorization & cleaning
  vectorScale_m: 500,     // ~0.5 km (raise to 1000–1500 for speed)
  minPatch_km2: 500,      // drop small polygons

  // Smoothing (buffer-out, buffer-in)
  smoothBuffer_km: 8,

  // Optional hydrologic extension ("water-tower" lens)
  useHydroBASINS: true,
  hybasLevel: 6,          // 03..12; try 6–8 first

  // ---- NEW: workflow helpers ----
  debug: true,            // print progress + stats
  quickMode: false        // set true for faster iteration (coarser scale)
};

// Quick mode overrides (faster, coarser, great while tuning)
if (P.quickMode) {
  P.vectorScale_m = 1200;
  P.minPatch_km2 = 1000;
  P.smoothBuffer_km = 6;
}

// Geometry error margin (meters) for all buffer/union/intersection calls
var EM = 1000;

// Lightweight debug printer that forces server-side eval when 'stat' given
function dbg(label, stat) {
  if (!P.debug) return;
  if (stat) {
    print(ee.Dictionary({'step': label, 'value': stat}));
  } else {
    print(label);
  }
}

// ============================== DATA =====================================
var roi = ee.Geometry.Rectangle(P.envelope, null, false);
dbg('Step 1 — ROI ready', ee.Number(roi.area(1)).divide(1e6).format('%.0f km^2'));

// DEM: Copernicus GLO30 (ImageCollection → mosaic → Image)
var demIC = ee.ImageCollection('COPERNICUS/DEM/GLO30').select('DEM');
var dem = demIC.mosaic().clip(roi);

// (Optional minor pre-smoothing to reduce staircase effects at coarse scales)
dem = dem.focal_mean({radius: 200, units: 'meters'});

var slope = ee.Terrain.slope(dem).clip(roi);
dbg('Step 2 — DEM & slope computed');

// ========================== MOUNTAIN/PLATEAU MASK ========================
// Three inclusive tiers (A OR B OR C)
var tierA = dem.gte(P.elevCore_m);
var tierB = dem.gte(P.elevMid_m).and(slope.gte(P.slopeMid_deg));
var tierC = dem.gte(P.elevLow_m).and(slope.gte(P.slopeLow_deg));
var mtMask = tierA.or(tierB).or(tierC).selfMask();

// Morphological tidy
mtMask = mtMask.focal_mode({
  radius: P.tidyRadius_m,
  units: 'meters',
  iterations: 1
}).selfMask();

dbg('Step 3 — Mountain/plateau raster mask ok',
    mtMask.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: roi,
      scale: P.vectorScale_m,
      maxPixels: 1e13,
      tileScale: 4
    }).get('DEM'));  // any band name works for a count; sum triggers eval

// =============================== VECTORS ==================================
// Vectorize at chosen scale (heavy step)
dbg('Step 4 — Vectorizing mask (this is the heaviest step)…');
var vec = mtMask.reduceToVectors({
  geometry: roi,
  scale: P.vectorScale_m,
  geometryType: 'polygon',
  eightConnected: true,
  maxPixels: 1e13,
  tileScale: 4
});
dbg('  …vector count', vec.size());

// Drop small patches
vec = vec.map(function(f) {
  return f.set('area_m2', f.geometry().area(1));
}).filter(ee.Filter.gte('area_m2', P.minPatch_km2 * 1e6));
dbg('Step 5 — Small patches removed; remaining features', vec.size());

// Dissolve to single boundary; micro-sliver fix
var dissolved = vec.geometry(ee.ErrorMargin(EM)).buffer(0, EM);

// Smooth (buffer-out then buffer-in) with explicit error margins
var smoothed = dissolved
  .buffer(P.smoothBuffer_km * 1000, EM)
  .buffer(-P.smoothBuffer_km * 1000, EM);

var thirdPoleGeom = smoothed;
var thirdPoleFC = ee.FeatureCollection([
  ee.Feature(thirdPoleGeom, {
    name: 'Third_Pole_DEM_Slope',
    method: 'Copernicus GLO30 + slope tiers; cleaned & smoothed',
    elevCore_m: P.elevCore_m,
    elevMid_m: P.elevMid_m,
    slopeMid_deg: P.slopeMid_deg,
    elevLow_m: P.elevLow_m,
    slopeLow_deg: P.slopeLow_deg,
    tidyRadius_m: P.tidyRadius_m,
    vectorScale_m: P.vectorScale_m,
    minPatch_km2: P.minPatch_km2,
    smoothBuffer_km: P.smoothBuffer_km,
    quickMode: P.quickMode
  })
]);

dbg('Step 6 — Primary polygon area (km²)',
    thirdPoleGeom.area(1).divide(1e6).format('%.0f'));

// ====================== OPTIONAL: HYDROLOGIC VARIANT ======================
var thirdPoleHydroFC;
if (P.useHydroBASINS) {
  var lvl = ('0' + P.hybasLevel).slice(-2);
  var hyPath = 'WWF/HydroSHEDS/v1/Basins/hybas_lev' + lvl;
  var hybas = ee.FeatureCollection(hyPath);

  var hyIntersect = hybas.filterBounds(thirdPoleGeom);
  dbg('Step 7 — HydroBASINS intersecting features', hyIntersect.size());

  var hyUnion = hyIntersect.geometry(ee.ErrorMargin(EM)).buffer(0, EM).intersection(roi, EM);

  // Keep a small halo so headwaters on valley sides aren’t clipped
  var shellWithHalo = thirdPoleGeom.buffer(50 * 1000, EM);
  var hydroConstrained = hyUnion.intersection(shellWithHalo, EM);

  thirdPoleHydroFC = ee.FeatureCollection([
    ee.Feature(hydroConstrained, {
      name: 'Third_Pole_HYDRO',
      note: 'Basins intersecting mountain mask (HydroBASINS L' + P.hybasLevel + ')',
      quickMode: P.quickMode
    })
  ]);

  dbg('Step 8 — Hydrologic variant area (km²)',
      thirdPoleHydroFC.geometry().area(1).divide(1e6).format('%.0f'));
}

// ============================== COUNTRY OVERLAYS ==========================
var countries = ee.FeatureCollection('FAO/GAUL/2015/level0');
var tpCountries = countries.filterBounds(thirdPoleGeom)
  .map(function(f) {
    var inter = f.geometry().intersection(thirdPoleGeom, EM);
    var area_km2 = ee.Number(inter.area(1)).divide(1e6);
    return f.set({'tp_area_km2': area_km2});
  })
  .filter(ee.Filter.gt('tp_area_km2', 0))
  .select(['ADM0_NAME','tp_area_km2']);

dbg('Step 9 — Countries intersecting (count)', tpCountries.size());

// ============================== VISUALIZATION =============================
Map.centerObject(roi, 4);
var demViz = {min: 0, max: 6000, palette: ['000022','3a7bd5','a8e1ff','ffffff']};
Map.addLayer(dem.visualize(demViz), {}, 'DEM (Copernicus GLO30)');
Map.addLayer(mtMask.updateMask(mtMask), {palette: ['00ff88']}, 'Mountain/Plateau raster mask');

var outline = ee.Image().byte().paint(thirdPoleGeom, 1, 2);
Map.addLayer(outline, {palette: ['ff0000']}, 'Third Pole boundary (DEM+slope)');
if (P.useHydroBASINS) {
  Map.addLayer(thirdPoleHydroFC, {color: 'cyan'}, 'Hydrologic variant (intersecting basins)');
}

// ================================ STATS ===================================
// (Avoid the "too many arguments" warning by printing 1 arg per call)
print('Third Pole area (km²) — DEM+slope');
print(thirdPoleGeom.area(1).divide(1e6));
if (P.useHydroBASINS) {
  print('Third Pole area (km²) — Hydrologic variant');
  print(thirdPoleHydroFC.geometry().area(1).divide(1e6));
}
print('Intersecting countries (FAO GAUL 2015)');
print(tpCountries.sort('tp_area_km2', false));

// ================================ EXPORTS =================================
// (Leave commented until you want files on Drive)
/*
Export.table.toDrive({
  collection: thirdPoleFC,
  description: 'Third_Pole_DEM_Slope_SHP',
  fileNamePrefix: 'third_pole_dem_slope',
  fileFormat: 'SHP'
});
if (P.useHydroBASINS) {
  Export.table.toDrive({
    collection: thirdPoleHydroFC,
    description: 'Third_Pole_HYDRO_SHP',
    fileNamePrefix: 'third_pole_hydro',
    fileFormat: 'SHP'
  });
}
*/
