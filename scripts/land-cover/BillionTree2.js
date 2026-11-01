/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var sent2image = ee.ImageCollection("COPERNICUS/S2");
/***** End of imports. If edited, may not auto-convert in the playground. *****/


function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = ee.Number(2).pow(10).int();
  var cirrusBitMask = ee.Number(2).pow(11).int();

  // Both flags should be set to zero, indicating clear conditions
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
             qa.bitwiseAnd(cirrusBitMask).eq(0));

  // Return the masked and scaled data.
  return image.updateMask(mask).divide(10000);
}


// Plot Landsat 8 band value means in a section of San Francisco and
// demonstrate interactive charts.

//var sanFrancisco = ee.Geometry.Rectangle(-122.45, 37.74, -122.4, 37.8);

var boundary = ee.FeatureCollection('ft:1YQjB0DQhvy_fY39aLbMi4uRWd1n1uld0kqhkMaPS', 'geometry');// Boundary
var startdate, enddate;
var NDVI = [];
var month = [];
var mean;
for(var i = 1; i<=12; i++)
{
  startdate = '2017-'+i+'-01'
  enddate = '2017-'+i+'-28'
 // print(startdate, enddate);

var image = ee.ImageCollection(sent2image
.filterDate(startdate,enddate)
.filterBounds(boundary)
.map(maskS2clouds)
.sort("CLOUD_COVERAGE_ASSESSMENT")
.median());

var mosaic = image.mosaic();
var clip = mosaic.clip(boundary);

var ND = clip.normalizedDifference(['B8','B4']).rename('nd');

var mean = ND.reduceRegion({
  geometry: boundary,
  reducer: ee.Reducer.mean(),
  scale: 10,
  maxPixels: 1e13
});

mean = mean.get('nd')

month.push(i)
NDVI.push(mean)
}
print(NDVI)
print(month)

var chart = ui.Chart.array.values(ee.Array(NDVI),1)
print(chart)