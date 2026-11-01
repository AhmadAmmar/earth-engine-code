/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var AGB_CMS_Indus = ee.Image("users/ahmadammargeo/GlobalAGB/AGB_CMS_Indus"),
    table = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var samples = AGB_CMS_Indus.sample({
    region: table.geometry(),
    numPixels: 160000,
    scale: 10,
    geometries: true,
    dropNulls: true,
});

print(samples.size())