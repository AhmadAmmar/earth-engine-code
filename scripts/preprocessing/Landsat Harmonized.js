var pakistan = ee.FeatureCollection("users/Fall2019/PakistanAdministrativeBoundaries");
var lahore = pakistan.filter(ee.Filter.eq("adm2_name","Lahore"));
var lcb = require('users/jstnbraaten/modules:ee-lcb.js'); 

lcb.setProps({
  startYear: 1982,
  endYear: 2022,
  startDate: '07-01',
  endDate: '09-01',
  sensors: ['LT05', 'LE07', 'LC08'],
  cfmask: ['cloud', 'shadow'],
  harmonizeTo: 'LC08',
  aoi: lahore,
});

var plan = function(year){
  var col = lcb.sr.gather(year)
    .map(lcb.sr.maskCFmask)
    .map(lcb.sr.harmonize)
    .map(lcb.sr.addBandNDVI)
    .select('NDVI');
  return lcb.sr.mosaicMean(col).clip(lahore).updateMask(lcb.sr.mosaicMean(col).gte(0.4)).not()
};

var years = ee.List.sequence(lcb.props.startYear, lcb.props.endYear);
var annualSummerMeanNDVI = ee.ImageCollection.fromImages(years.map(plan));

print(annualSummerMeanNDVI);
Map.addLayer(annualSummerMeanNDVI);