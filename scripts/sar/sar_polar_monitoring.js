var collectionHHAsc = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2020-01-01', '2020-03-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'HH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('HH');

var collectionHHDes = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2020-01-01', '2020-03-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'HH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('HH');

var collectionHVAsc = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2020-01-01', '2020-03-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'HV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('HV');

var collectionHVDes = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.date('2020-01-01', '2020-03-31'))
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'HV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(table)
.select('HV');

var HHAsc = collectionHHAsc.mean().focal_median().toFloat().clip(table).rename(['HHAsc'])
var HHDes = collectionHHDes.mean().focal_median().toFloat().clip(table).rename(['HHDes'])
var HVAsc = collectionHVAsc.mean().focal_median().toFloat().clip(table).rename(['HVAsc'])
var HVDes = collectionHVDes.mean().focal_median().toFloat().clip(table).rename(['HVDes'])

var HHdHVAsc = HHAsc.divide(HVAsc)
var HVdHHAsc = HVAsc.divide(HHAsc)
var HHmHVAsc = HHAsc.subtract(HVAsc)
var HVmHHAsc = HVAsc.subtract(HHAsc)

var HHdHVDes = HHDes.divide(HVDes)
var HVdHHDes = HVDes.divide(HHDes)
var HHmHVDes = HHDes.subtract(HVDes)
var HVmHHDes = HVDes.subtract(HHDes)

.addBands(HHAsc).addBands(HHDes).addBands(HVAsc).addBands(HVDes).addBands(HHdHVAsc).addBands(HVdHHAsc).addBands(HHmHVAsc).addBands(HVmHHAsc).addBands(HHdHVDes).addBands(HVdHHDes).addBands(HHmHVDes).addBands(HVmHHDes)