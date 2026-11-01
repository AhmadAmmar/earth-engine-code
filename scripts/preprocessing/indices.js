var loc = ee.Geometry.Point(20.585060253371353,40.93401464688558);
Map.addLayer(loc)

var image = ee.ImageCollection('COPERNICUS/S2_SR')
              .filterBounds(loc)
              .filterDate('2019-01-01','2019-03-30')
              .sort('CLOUD_COVER')
              .first()
print('Raw image',image)
Map.addLayer(image, {bands:['B5','B4','B3'], min:29, max:10022},'Greece')

var ndvi = image.normalizedDifference(['B5','B4']);
Map.addLayer(ndvi,{min:0.5,max:1, palette :['00FFFF', '0000FF']},'NDVI')

var ndwi = image.normalizedDifference(['B3','B5']);
Map.addLayer(ndvi,{min:0.5,max:1, palette :['00FFFF', '0000FF']},'NDwI')

var update = image.updateMask(ndwi.gte(0.4).and (ndwi.lte(0.8)))
Map.addLayer(update)

//var ndsi = image.normalizedDifference(['B3','B11']);
//Map.addLayer(ndvi,{min:0.5,max:1, palette :['blue', 'green']},'NDSI')

