// ---------- ASSET IDS (edit these to yours) ----------
var assetIdPts   = 'projects/ee-ahmadammargeo/assets/phd/belfast_epc_2024_pts';
var assetIdPolys = 'projects/ee-ahmadammargeo/assets/phd/belfast_epc_2024_poly';
var assetIdBnd   = 'projects/ee-ahmadammargeo/assets/phd/belfast'; // your Belfast boundary asset

// ---------- LOAD ----------
var pts   = ee.FeatureCollection(assetIdPts);    // points (should already have geometry)
var polys = ee.FeatureCollection(assetIdPolys);  // building polygons
var bnd   = ee.FeatureCollection(assetIdBnd);    // Belfast boundary

// (If you ever upload a CSV without geometry, you can rebuild it from lon/lat like this:)
var pts = ee.FeatureCollection(assetIdPts).map(function(f){
  var g = ee.Geometry.Point([ee.Number(f.get('lon')), ee.Number(f.get('lat'))]);
  return ee.Feature(g, f.toDictionary());
});

// ---------- STYLE ----------
var ptsStyled   = pts.style({pointSize: 4,  color: '000000', fillColor: 'ff5500', width: 0.5});
var polysStyled = polys.style({color: '00ffff', width: 1.5, fillColor: '00000000'}); // cyan outlines, transparent fill
var bndStyled   = bnd.style({color: 'ffff00', width: 2,  fillColor: '00000000'});   // yellow boundary

// ---------- ADD TO MAP ----------
Map.addLayer(bndStyled,   {}, 'Belfast boundary');
Map.addLayer(polysStyled, {}, 'Building footprints (UID polygons)');
Map.addLayer(ptsStyled,   {}, 'EPC points 2024 (UIDs)');

// Center/zoom on the boundary
// Map.centerObject(bnd.geometry().dissolve(), 11);
Map.centerObject(pts);

// Optional: basemap
Map.setOptions('SATELLITE');
