/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var pt = /* color: #d63000 */ee.Geometry.Point([72.19448486003375, 32.07416382133119]);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//Searching L5 Image ID

/*var oldImages = ee.ImageCollection('LANDSAT/LT05/C01/T1_TOA')
  .filterDate('2000-08-01','2000-08-30')
  .filterBounds(pt)
  .sort("CLOUD_COVER")
  .first();
  
print(oldImages);

Map.addLayer(oldImages,{bands:['B3','B2','B1']},"L5 collection",false);*/

var oldImage = ee.Image('LANDSAT/LT05/C01/T1_TOA/LT05_150038_20000825');

Map.addLayer(oldImage,{bands:['B5','B4','B3']},"Khushab L5");

//Calculating L5 EVI

var oldEVI = oldImage.expression(
  '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',{
  'NIR': oldImage.select('B4'),
  'RED': oldImage.select('B3'),
  'BLUE': oldImage.select('B1'),
  });

Map.addLayer(oldEVI,{palette:['red','green'], min:-0.09054598885768933 , max:0.4562651694071556},"EVI 2000");

//Searching L8 Image ID

/*var newImages = ee.ImageCollection('LANDSAT/LC08/C01/T1_RT_TOA')
  .filterDate('2018-08-01','2018-08-30')
  .filterBounds(pt)
  .sort("CLOUD_COVER")
  .first();

print(newImages);

Map.addLayer(newImages,{bands:['B4','B3','B2']},"L8 collection",false);*/

var newImage = ee.Image('LANDSAT/LC08/C01/T1_RT_TOA/LC08_150038_20180811');

Map.addLayer(newImage,{bands:['B4','B3','B2']},"Khushab L8");

//Calculating L8 EVI

var newEVI = newImage.expression(
  '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',{
  'NIR': newImage.select('B5'),
  'RED': newImage.select('B4'),
  'BLUE': newImage.select('B2'),
  });

Map.addLayer(newEVI,{palette:['red','green'], min:-0.25303119528472834 , max:0.7901485823699743},"EVI 2018");

//EVI Differentiation

var eviDiff = oldEVI.subtract(newEVI);
Map.addLayer(eviDiff,{palette:['green','red'], min:-0.5030783370658015 , max:0.2968449154862819},"EVI Difference");