/***** THIRD POLE — multi-variant boundaries from DEM + slope (no uploads) *****
 * Variants: STRICT_PLATEAU, BALANCED, EXPANDED_HMA, CONTIGUOUS, SIMPLIFIED, HYDRO.
 * ES5-compatible; explicit error margins; debug checkpoints; quickMode for speed.
 ******************************************************************************/

// ========================= GLOBAL SETTINGS =================================
var G = {
  // [minLon, minLat, maxLon, maxLat] — adjust if needed
  envelope: [58, 20, 112, 50],

  // Geometry error margin (meters) for buffer/intersection ops
  EM: 1000,

  // Quick iteration: uses coarser vector scale & larger min patch
  quickMode: false,

  // Debug prints
  debug: true,

  // HydroBASINS path in your catalog (set useHydro=true to try)
  useHydro: true,
  hybasPath: 'WWF/HydroSHEDS/v1/Basins/hybas_6'   // try hybas_lev06 if needed
};

// Quick mode overrides
var vectorScaleQuick = 1200, minPatchQuick = 1000, smoothQuick = 6;

// Color guide for layers
var COLORS = {
  STRICT:   'ff7f0e',  // orange
  BAL:      'd62728',  // red
  EXP:      '1f77b4',  // blue
  CONTIG:   '2ca02c',  // green
  SIMP:     '9467bd',  // purple
  HYDRO:    '17becf'   // cyan
};

// Debug helper
function dbg(label, stat) {
  if (!G.debug) return;
  if (stat) print(ee.Dictionary({step: label, value: stat}));
  else print(label);
}

// ============================== DATA ======================================
var roi = ee.Geometry.Rectangle(G.envelope, null, false);
dbg('ROI area (km²)', ee.Number(roi.area(1)).divide(1e6).format('%.0f'));

var demIC = ee.ImageCollection('COPERNICUS/DEM/GLO30').select('DEM');
var dem = demIC.mosaic().clip(roi)
  // slight pre-smoothing to reduce staircasing
  .focal_mean({radius: 200, units: 'meters'});
var slope = ee.Terrain.slope(dem).clip(roi);
dbg('DEM + slope ready');

// ========================= BUILDERS (functions) ============================
// Build a raster mask from thresholds; then vectorize → dissolve → smooth.
function buildBoundary(params) {
  // Params with defaults
  var elevCore = params.elevCore_m;
  var elevMid  = params.elevMid_m;
  var slopeMid = params.slopeMid_deg;
  var elevLow  = params.elevLow_m;
  var slopeLow = params.slopeLow_deg;

  var vectorScale = params.vectorScale_m;
  var minPatch_km2 = params.minPatch_km2;
  var tidyRadius_m = params.tidyRadius_m;
  var smooth_km    = params.smoothBuffer_km;

  // Raster mask: tiers (inclusive OR)
  var tierA = dem.gte(elevCore);
  var tierB = dem.gte(elevMid).and(slope.gte(slopeMid));
  var tierC = dem.gte(elevLow).and(slope.gte(slopeLow));
  var mask = tierA.or(tierB).or(tierC).selfMask();

  // Morphological tidy
  mask = mask.focal_mode({radius: tidyRadius_m, units: 'meters', iterations: 1}).selfMask();

  // Vectorize (heavy)
  var vec = mask.reduceToVectors({
    geometry: roi,
    scale: vectorScale,
    geometryType: 'polygon',
    eightConnected: true,
    maxPixels: 1e13,
    tileScale: 4
  });

  // Drop small patches
  vec = vec.map(function(f){ return f.set('area_m2', f.geometry().area(1)); })
           .filter(ee.Filter.gte('area_m2', minPatch_km2 * 1e6));

  // Dissolve into one multipolygon geometry
  var geom = vec.geometry(ee.ErrorMargin(G.EM)).buffer(0, G.EM);

  // Smooth (buffer out/in)
  geom = geom.buffer(smooth_km * 1000, G.EM)
             .buffer(-smooth_km * 1000, G.EM);

  // FeatureCollection wrapper
  var fc = ee.FeatureCollection([ee.Feature(geom, params)]);
  return {mask: mask, vectors: vec, geom: geom, fc: fc};
}

// Keep only the **largest contiguous** polygon from a geometry
function largestContiguous(geom) {
  var parts = ee.FeatureCollection(ee.Feature(geom).geometry().geometries().map(function(g){
    return ee.Feature(ee.Geometry(g)).set('area', ee.Geometry(g).area(1));
  }));
  var biggest = parts.sort('area', false).first().geometry();
  return biggest;
}

// Simple cartographic simplify (tolerance meters)
function simplifyGeom(geom, tol_m) {
  return geom.simplify(tol_m, G.EM);
}

// ===================== VARIANT DEFINITIONS ================================
// Base knobs (switch to quick when G.quickMode)
var baseVectorScale = G.quickMode ? vectorScaleQuick : 500;
var baseMinPatch    = G.quickMode ? minPatchQuick   : 500;
var baseSmoothKm    = G.quickMode ? smoothQuick     : 8;

var COMMON = {
  tidyRadius_m: 1500,
  vectorScale_m: baseVectorScale,
  minPatch_km2: baseMinPatch,
  smoothBuffer_km: baseSmoothKm
};

// 1) Strict, plateau-centric
var STRICT = buildBoundary(ee.Dictionary(COMMON).combine({
  name: 'STRICT_PLATEAU',
  elevCore_m: 3000,
  elevMid_m:  1800,
  slopeMid_deg: 6,
  elevLow_m:  1200,
  slopeLow_deg: 12
}, true));

// 2) Balanced (recommended “scientific default”)
var BAL = buildBoundary(ee.Dictionary(COMMON).combine({
  name: 'BALANCED',
  elevCore_m: 2500,
  elevMid_m:  1500,
  slopeMid_deg: 5,
  elevLow_m:  1000,
  slopeLow_deg: 10
}, true));

// 3) Expanded High-Mountain Asia (more inclusive outer flanks)
var EXP = buildBoundary(ee.Dictionary(COMMON).combine({
  name: 'EXPANDED_HMA',
  elevCore_m: 2200,
  elevMid_m:  1200,
  slopeMid_deg: 4,
  elevLow_m:  800,
  slopeLow_deg: 8
}, true));

// 4) Largest contiguous polygon (from BAL)
var BAL_contigGeom = largestContiguous(BAL.geom);
var BAL_CONTIG = ee.FeatureCollection([ee.Feature(BAL_contigGeom, {
  name: 'BALANCED_CONTIGUOUS'
})]);

// 5) Cartographic simplify (from BAL)
var BAL_SIMPLE = ee.FeatureCollection([ee.Feature(
  simplifyGeom(BAL.geom, 3000),   // 3 km tolerance; adjust 2–8 km as needed
  {name: 'BALANCED_SIMPLIFIED_3km'}
)]);

// 6) Hydrologic variant: HydroBASINS that touch BAL shell (if available)
var HYDRO_FC = null;
if (G.useHydro) {
  try {
    var hybas = ee.FeatureCollection(G.hybasPath);
    var hyIntersect = hybas.filterBounds(BAL.geom);
    var hyUnion = hyIntersect.geometry(ee.ErrorMargin(G.EM)).buffer(0, G.EM).intersection(roi, G.EM);
    var shellHalo = BAL.geom.buffer(50 * 1000, G.EM); // 50 km halo to keep headwaters
    var hydroConstrained = hyUnion.intersection(shellHalo, G.EM);
    HYDRO_FC = ee.FeatureCollection([ee.Feature(hydroConstrained, {
      name: 'HYDRO_TOUCHING', source: G.hybasPath
    })]);
  } catch (e) {
    print('HydroBASINS not available at path:', G.hybasPath);
  }
}

// ============================== DEBUG STATS ===============================
function areaKm2(g) { return ee.Number(g.area(1)).divide(1e6).format('%.0f'); }

dbg('STRICT area (km²)',  areaKm2(STRICT.geom));
dbg('BALANCED area (km²)', areaKm2(BAL.geom));
dbg('EXPANDED area (km²)', areaKm2(EXP.geom));
dbg('BALANCED_CONTIGUOUS area (km²)', areaKm2(BAL_contigGeom));
dbg('BALANCED_SIMPLIFIED area (km²)', areaKm2(BAL_SIMPLE.geometry()));

if (HYDRO_FC) dbg('HYDRO_TOUCHING area (km²)', areaKm2(HYDRO_FC.geometry()));

// Countries table for BAL (as default reporting)
var countries = ee.FeatureCollection('FAO/GAUL/2015/level0');
var balCountries = countries.filterBounds(BAL.geom)
  .map(function(f){
    var a = f.geometry().intersection(BAL.geom, G.EM).area(1);
    return f.set('tp_area_km2', ee.Number(a).divide(1e6));
  })
  .filter(ee.Filter.gt('tp_area_km2', 0))
  .select(['ADM0_NAME','tp_area_km2']);
dbg('Countries intersecting (BAL) — count', balCountries.size());

// ============================== MAP LAYERS ================================
Map.centerObject(roi, 4);

// Background DEM
var demViz = {min: 0, max: 6000, palette: ['000022','3a7bd5','a8e1ff','ffffff']};
Map.addLayer(dem.visualize(demViz), {}, 'DEM (GLO30)');

// Outlines only (no fill) for side-by-side comparison
function outlineLayer(geom, color, name) {
  var img = ee.Image().byte().paint(geom, 1, 2);
  Map.addLayer(img, {palette: [color]}, name);
}

outlineLayer(STRICT.geom, COLORS.STRICT,   'STRICT_PLATEAU');
outlineLayer(BAL.geom,    COLORS.BAL,      'BALANCED (default)');
outlineLayer(EXP.geom,    COLORS.EXP,      'EXPANDED_HMA');
outlineLayer(BAL_contigGeom, COLORS.CONTIG,'BALANCED_CONTIGUOUS');
outlineLayer(BAL_SIMPLE.geometry(), COLORS.SIMP, 'BALANCED_SIMPLIFIED (3 km)');

if (HYDRO_FC) {
  Map.addLayer(HYDRO_FC, {color: COLORS.HYDRO}, 'HYDRO_TOUCHING (basins)');
}

// Optional: show raster mask for the BALANCED variant
Map.addLayer(BAL.mask.updateMask(BAL.mask), {palette: ['00ff88']},
             'BALANCED mountain/plateau raster mask');

// ================================ PRINTS ==================================
// One argument per print to avoid Code Editor warnings
print('Areas (km²): STRICT, BALANCED, EXPANDED, BALANCED_CONTIGUOUS, BALANCED_SIMPLIFIED');
print(ee.Dictionary({
  STRICT: areaKm2(STRICT.geom),
  BALANCED: areaKm2(BAL.geom),
  EXPANDED: areaKm2(EXP.geom),
  BALANCED_CONTIG: areaKm2(BAL_contigGeom),
  BALANCED_SIMPLIFIED: areaKm2(BAL_SIMPLE.geometry())
}));
if (HYDRO_FC) {
  print('Area (km²): HYDRO_TOUCHING');
  print(areaKm2(HYDRO_FC.geometry()));
}
print('Countries table (BALANCED)');
print(balCountries.sort('tp_area_km2', false));

// ============================ EXPORT (optional) ===========================
// Uncomment any you need.
/*
Export.table.toDrive({collection: ee.FeatureCollection([ee.Feature(STRICT.geom, {name:'STRICT'})]),
  description: 'ThirdPole_STRICT_SHP', fileNamePrefix: 'third_pole_strict', fileFormat: 'SHP'});

Export.table.toDrive({collection: ee.FeatureCollection([ee.Feature(BAL.geom, {name:'BALANCED'})]),
  description: 'ThirdPole_BALANCED_SHP', fileNamePrefix: 'third_pole_balanced', fileFormat: 'SHP'});

Export.table.toDrive({collection: ee.FeatureCollection([ee.Feature(EXP.geom, {name:'EXPANDED'})]),
  description: 'ThirdPole_EXPANDED_SHP', fileNamePrefix: 'third_pole_expanded', fileFormat: 'SHP'});

Export.table.toDrive({collection: ee.FeatureCollection([ee.Feature(BAL_contigGeom, {name:'BALANCED_CONTIG'})]),
  description: 'ThirdPole_BALANCED_CONTIG_SHP', fileNamePrefix: 'third_pole_balanced_contig', fileFormat: 'SHP'});

Export.table.toDrive({collection: BAL_SIMPLE,
  description: 'ThirdPole_BALANCED_SIMPLIFIED_SHP', fileNamePrefix: 'third_pole_balanced_simplified', fileFormat: 'SHP'});

if (HYDRO_FC) {
  Export.table.toDrive({collection: HYDRO_FC,
    description: 'ThirdPole_HYDRO_SHP', fileNamePrefix: 'third_pole_hydro', fileFormat: 'SHP'});
}
*/
