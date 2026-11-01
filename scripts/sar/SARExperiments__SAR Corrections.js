print('trainingData', trainingData)
print('classifier', classifier.explain())
Map.addLayer(referenceData.flatten(), null, 'reference data', false)
Map.addLayer(gedi.mosaic().clip(aoi), {bands: heightBand, min: 0, max: 40, palette: '#fffdcd, #e1cd73, #aaac20, #5f920c, #187328, #144b2a, #172313'}, heightBand)
Map.addLayer(composite, {bands: 'red,green,blue', min: 0, max: 2000, gamma: 1.6}, 'optical')
Map.addLayer(composite, {bands: 'VV,VH,ratio_VV_VH', min: [-20, -25, 3], max: [0, -5, 14]}, 'sar')
Map.addLayer(classification, {min: 0, max: 40, palette: '#fffdcd, #e1cd73, #aaac20, #5f920c, #187328, #144b2a, #172313'}, 'height')
Map.centerObject(aoi, 12)

function toSarComposite(fromDate, toDate) {  
  var composite = ee.ImageCollection('COPERNICUS/S1_GRD_FLOAT')
    .filter(ee.Filter.and(
      ee.Filter.bounds(aoi),
      ee.Filter.date(fromDate, toDate),
      ee.Filter.eq('instrumentMode', 'IW'),
      ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'),
      ee.Filter.listContains('transmitterReceiverPolarisation', 'VH')
    ))
    .map(function (image) {
      return maskBorder(
        toDb(
          toGamma0(image)
        )
      ).select(['VV', 'VH'])
    })
    .median()
  return composite
    .addBands(
      composite.select('VV').divide(composite.select('VH')).rename('ratio_VV_VH')
    )
    

  function toGamma0(image) {
    var gamma0 = image.expression('i/(cos(angle * pi / 180))', {
      'i': image.select(['VV', 'VH']),
      'angle': image.select('angle'),
      'pi': Math.PI
    })
    return image.addBands(gamma0, null, true)    
  }
  
  function toDb(image) {
    return image.addBands(
      image.select(['VV', 'VH']).log10().multiply(10), null, true
    )    
  }
    
  function maskBorder(image) {
    var angle = image.select('angle')
    return image
      .updateMask(
        angle.gt(31).and(angle.lt(45))
      )    
  }    
}