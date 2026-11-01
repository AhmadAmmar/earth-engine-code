/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = ee.FeatureCollection("users/ahmadammargeo/indusProj");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
var GEDI = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
            .filter(ee.Filter.date('2019-01-01','2021-12-31'))
            .filterBounds(geometry)
print(GEDI)            

var GEDI_bands = GEDI.map(function(img){
  var int = img.select(['beam','degrade_flag']).toInt()
  var float = img.select(['rh.*'])
  return int.addBands(float)
}).reduce(ee.Reducer.mean())
print(GEDI_bands)

var rh100 = GEDI_bands//.select('rh100_mean')
print(rh100)            

Map.addLayer(rh100, {min:0,max:20})


/*var GEDI_data = GEDI_bands.select(['digital_elevation_model', 
                            'elev_highestreturn',
                            'digital_elevation_model_srtm',
                            'elev_lowestmode',
                            'elevation_bias_flag',
                            'lat_highestreturn',
                            'lon_highestreturn',
                            'selected_algorithm',
                            'selected_mode',
                            'shot_number',
                            'surface_flag',
                            'rh10',
                            'rh20',
                            'rh30',
                            'rh40',
                            'rh50',
                            'rh60',
                            'rh70',
                            'rh80',
                            'rh90',
                            'rh91',
                            'rh92',
                            'rh93',
                            'rh94',
                            'rh95',
                            'rh96',
                            'rh97',
                            'rh98',
                            'rh99',
                            'rh100'])
                            


Export.image.toDrive({
  image: GEDI_bands,
  description: 'GEDI_Zambezi_L2A_20180101_20211231',
  scale: 10,
  maxPixels: 3e12,
  region: geometry
});*/