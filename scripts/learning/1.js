/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var L8 = ee.ImageCollection("LANDSAT/LC08/C01/T1"),
    geometry = /* color: #d63000 */ee.Geometry.MultiPoint();
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var pk = ee.FeatureCollection('ft:1NTBXHJXBZI53ljnoVa9iudFu1Uh-6mmPafN04dIG', 'geometry')

var rgb_vis = {min: 0, max: 0.3, bands: ['B4', 'B3', 'B2']};

function addNDVI(image) {
var ndvi = image.normalizedDifference(['B5', 'B4']);
return image.addBands(ndvi);
}

var dateFilter = L8.filterDate('2000-01-01', '2018-08-28');
var filtered = dateFilter.filterBounds(pk);
var with_ndvi = filtered.map(addNDVI);
Map.addLayer(filtered.median(), rgb_vis, 'RGB');
Map.addLayer(with_ndvi.median(), {bands: 'nd', min: 0, max: 1}, 'NDVI');