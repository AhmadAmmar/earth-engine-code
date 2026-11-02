/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var london = ee.FeatureCollection("projects/ee-ahmadammargeo/assets/phd/london"),
    buildings = ee.FeatureCollection("projects/ee-ahmadammargeo/assets/phd/london_buildings");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Annotate each feature with its geometry type
var buildingsWithGeomType = buildings.map(function(f) {
  return f.set('geom_type', f.geometry().type());
});

// Filter only Polygon features
var buildingsPoly = buildingsWithGeomType.filter(ee.Filter.eq('geom_type', 'Polygon'));

// Check result
print('Filtered only Polygon buildings:', buildingsPoly.limit(3));
print('Geometry type of first one:', buildingsPoly.first().geometry().type());