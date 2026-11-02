/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var field = /* color: #d63000 */ee.Geometry.Polygon(
        [[[74.02483104295345, 20.099333317507604],
          [74.02499197549434, 20.100804323549145],
          [74.02373670167538, 20.10084462489003],
          [74.02368305749508, 20.09945422263505]]]),
    sent2image = ee.ImageCollection("COPERNICUS/S2");
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

var boundary = ee.FeatureCollection('ft:1T-XrxMki2k49fhQdhMxesWKBoyyUJiKN70pErh9z');// Boundary
var gtpoints = ee.FeatureCollection('ft:1ZvFeFO5jHGo3VExlKNc-kdL-3hmJSeyfLzqLvHhy');//Co-ordinates
var plots = ee.FeatureCollection('ft:1pZJ7v8ek4Z1GP7MxZNA3EhtRVGs5MDgEP6ngwc1v');//Plots
var startdate, enddate;
var NDVI = [];
var ndvi = [];
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
//.map(maskS2clouds)
.sort("CLOUD_COVERAGE_ASSESSMENT")
.median());

var mosaic = image.mosaic();
var clip = mosaic.clip(field);

var ND = clip.normalizedDifference(['B8','B4']).rename('nd');

var mean = ND.reduceRegion({
  geometry: field,
  reducer: ee.Reducer.mean(),
  scale: 10
});

mean = mean.get('nd')

month.push(i)
NDVI.push(mean)
}
print(NDVI)
print(month)

var chart = new ui.Chart.array.values(ee.Array(NDVI),1)
print(chart)