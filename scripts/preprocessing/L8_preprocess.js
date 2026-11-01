/*var point = ee.Geometry.Point(67.7687018535193, 24.20313053648054);
Map.addLayer(point)

var badin = ee.ImageCollection('LANDSAT/LT05/C01/T1')
            .filterBounds(point);
print (badin)
Map.centerObject(badin,8)
Map.addLayer(badin)
*/
var badin1 = ee.Image('LANDSAT/LT05/C01/T1/LT05_152043_20110211');
print ('Raw Image:', badin1)
Map.centerObject(badin1,8)
Map.addLayer(badin1,{bands: ['B4','B3','B2'], min : 16, max : 123},'Raw Badin1')

// convert raw data into radiance
var radiance = ee.Algorithms.Landsat.calibratedRadiance(badin1);
print('Raw data into Radiance:',radiance)
Map.addLayer(radiance,{bands: ['B4','B3','B2'], max : 95},'Calibrated')

// Convert the raw data to top-of-atmosphere reflectance.
var TOA = ee.Algorithms.Landsat.TOA(badin1);
print('Top of Atmoshpere:',TOA)
Map.addLayer(TOA,{bands: ['B4','B3','B2'], max : 0.29},'Top of Atmosphere')
