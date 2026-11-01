var utils = require('users/gena/packages:utils')

// setup map
Map.setOptions('HYBRID')
Map.addLayer(ee.Image(1), { palette: ['black' ]}, 'black', true, 0.5)

var gedi = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
  .filterBounds(Map.getBounds(true))
  .map(function(i) { return i.float().set({ bandCount: i.bandNames().size() }) })
  .filter(ee.Filter.eq('bandCount', 136))
  .mosaic()
  
print(gedi.bandNames())  

gedi = gedi
  // .select('elev_lowestmode')
  .select('elev_highestreturn')
  .subtract(geoid)


Map.addLayer(gedi, { min: 0, max: 1000, palette: ['aaaaaa', 'ffffff'] }, 'GEDI', true, 0.5)

var scale = 10

// sample GEDI along the line
var profile = utils.reduceImageProfile(gedi, line, ee.Reducer.mean(), scale, 'EPSG:3857', Map.getScale() * 10)
profile = profile.filter(ee.Filter.notNull(['mean'])).select(['distance', 'mean'], ['distance', 'GEDI'])

// sample DEM along the line
var dem = ee.ImageCollection("JAXA/ALOS/AW3D30/V3_2").select('DSM').map(function(i) { return i.resample('bicubic') }).mosaic()
// var dem = ee.Image("CGIAR/SRTM90_V4").resample('bicubic')
// var dem = ee.Image("users/gena/GEBCO_2014_2D").resample('bicubic')
var profileDEM = utils.reduceImageProfile(dem, line, ee.Reducer.mean(), scale, 'EPSG:3857', Map.getScale() * 20)
profileDEM = profileDEM.filter(ee.Filter.notNull(['mean'])).select(['distance', 'mean'], ['distance', 'DEM'])

// show chart
var chart = ui.Chart.feature.byFeature(profile.merge(profileDEM), 'distance', ['GEDI', 'DEM'])
chart = chart.setChartType('AreaChart')
print(chart)

Map.addLayer(dem, { min: 0, max: 50 }, 'DEM', false)