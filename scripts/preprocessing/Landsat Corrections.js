/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var Urban = /* color: #8b8484 */ee.Geometry.Point([72.27992249106819, 32.2882879012537]),
    Vegetation = /* color: #0bff11 */ee.Geometry.MultiPoint(
        [[72.30511414855914, 32.28690961136278],
         [72.38401203755075, 32.28580283987128]]),
    geometry = /* color: #00ffff */ee.Geometry.MultiPoint();
/***** End of imports. If edited, may not auto-convert in the playground. *****/
//Finding L5 Image 

/* var pt = ee.Geometry.Point(72.19448486003375, 32.07416382133119054);
var KhushabColL5 = ee.ImageCollection('LANDSAT/LT05/C01/T1')
            .filterBounds(pt);
print (KhushabColL5);
Map.centerObject(KhushabColL5,8);
Map.addLayer(KhushabColL5); */

//Loading Raw L5 Image

var KhushabL5Raw = ee.Image('LANDSAT/LT05/C01/T1/LT05_150038_19871126');
print ('Khushab L5 Raw:', KhushabL5Raw);
Map.centerObject(KhushabL5Raw,8);
Map.addLayer(KhushabL5Raw,{bands: ['B3','B2','B1'], min : 16, max : 123},'Khushab L5 Raw');

//Raw Image to Radiance

var KhushabL5Radiance = ee.Algorithms.Landsat.calibratedRadiance(KhushabL5Raw);
print('Khushab L5 Radiance:',KhushabL5Radiance);
Map.addLayer(KhushabL5Radiance,{bands: ['B3','B2','B1'], max : 95},'Khushab L5 Radiance');

//Raw Image to ToA

var KhushabL5ToA = ee.Algorithms.Landsat.TOA(KhushabL5Raw);
print('Khushab L5 ToA:',KhushabL5ToA);
Map.addLayer(KhushabL5ToA,{bands: ['B3','B2','B1'], max : 0.29},'Khushab L5 ToA');

//Finding L8 Image 

/* var KhushabColL8 = ee.ImageCollection('LANDSAT/LC08/C01/T1')
            .filterBounds(pt);
print (KhushabColL8);
Map.centerObject(KhushabColL8,8);
Map.addLayer(KhushabColL8); */

//Loading Raw L8 Image

var KhushabL8Raw = ee.Image('LANDSAT/LC08/C01/T1/LC08_150038_20130330');
print ('Khushab L8 Raw:', KhushabL8Raw);
Map.centerObject(KhushabL8Raw,8);
Map.addLayer(KhushabL8Raw,{bands: ['B4','B3','B2'], min : 7333, max : 13648},'Khushab L8 Raw');

//Raw Image to Radiance

var KhushabL8Radiance = ee.Algorithms.Landsat.calibratedRadiance(KhushabL8Raw);
print('Khushab L8 Radiance:',KhushabL8Radiance);
Map.addLayer(KhushabL8Radiance,{bands: ['B4','B3','B2'], max : 105},'Khushab L8 Radiance');

//Raw Image to ToA

var KhushabL8ToA = ee.Algorithms.Landsat.TOA(KhushabL8Raw);
print('Khushab L8 ToA:',KhushabL8ToA);
Map.addLayer(KhushabL8ToA,{bands: ['B4','B3','B2'], max : 0.26},'Khushab L8 ToA');