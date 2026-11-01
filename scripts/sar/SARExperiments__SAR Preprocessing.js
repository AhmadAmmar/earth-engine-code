/**
 * Pre-process and visualize Sentinel-1 radar data in Madagscar. 
 * Pré-traiter et visualiser les données radar Sentinel-1 à Madagascar.
 * 
 * Author: Eric Bullock, eric.bullock@usda.gov 
 * Auteur : Eric Bullock, eric.bullock@usda.gov
 */
 

/**
* 1. Madagascar Extent
* 1. Étendue de Madagascar
* 
* Calculate extent of Madagascar and add it to the map. 
* Calculez l'étendue de Madagascar et ajoutez-la à la carte.
*/
var madagascar = countries.filterMetadata('COUNTRY_NA','equals','Madagascar')
// Map.addLayer(madagascar, {}, 'Madagascar')



/**
 * 2. Sentinel-1 Collection
* 
* Get collection of Sentinel-1 radar data.
* Obtenez la collecte de données radar Sentinel-1.
*/
var debut = '2021-01-01'
var finir = '2021-08-31'

var donnees = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(madagascar)
  .filterMetadata('transmitterReceiverPolarisation','equals',["VV", "VH"])
  .filterMetadata('instrumentMode','equals','IW')
  .filterDate(debut, finir)

// var s = donnees.aggregate_histogram('transmitterReceiverPolarisation')
// print(s)
// print(donnees.size())

// stop
// Map.addLayer(donnees.first().select('VV'), {min: -25, max: 0}, 'VV', false)
// Map.addLayer(donnees.first().select('VH'), {min: -25, max: -10}, 'VH', false)



/**
 * 3. Mosaic.
 * 3. Mosaïque
* 
* Make a mosaic by selecting the first clear observation at each pixel. 
* Faites une mosaïque en sélectionnant la première observation nette à chaque pixel.
*/
var mosaique = donnees.mosaic()
var palette = ['#8c510a','#bf812d','#dfc27d','#f6e8c3','#f5f5f5','#c7eae5','#80cdc1','#35978f','#01665e'].reverse()
Map.addLayer(mosaique.select('VV'), {min: -25, max: 0, palette: palette}, 'VV Mosaique', false)
Map.addLayer(mosaique.select('VH'), {min: -25, max: -10, palette: palette}, 'VH Mosaique', false)



/**
* 4. Count Frequency of Ascending and Descending Orbital Passes
* 4. Compter la fréquence des passes orbitales ascendantes et descendantes
*/
// var recenser = ee.Dictionary(donnees.aggregate_histogram('orbitProperties_pass'))
// print('Nombre d images dans chaque direction orbitale', recenser)



/**
* 5. Filter for Descending orbital pass only.
* 5. Filtrez uniquement pour la passe orbitale descendante.
// */
donnees = donnees.filterMetadata('orbitProperties_pass','equals','DESCENDING')
// print('Nombre d images entre ' + debut + ' et ' + finir + ':', donnees.size())



/**
* 6. Get most recent image, calculate ratio, and view. 
* 6. Obtenez l'image la plus récente, calculez le rapport, et visualisez.
*/
// var recente = donnees.sort('system:time_start',false).first()

// var rapport = recente.select('VV')
//   .subtract(recente.select('VH')).rename('rapport');

// recente = recente.addBands(rapport)

// print('Date de l image la plus récente', recente.date())
// Map.addLayer(recente.select(['VV', 'VH', 'rapport']), {min:[-18, -25, 1], max:[0, -5, 12]}, 'Recente RGB', false);



/**
 * 7. Median Composite
 * 7. Composite médian
* 
* Instead of calculating the mosaic, calculate the median value for each pixel. 
* Au lieu de calculer la mosaïque, calculez la valeur médiane pour chaque pixel.
*/
var mediane = donnees.reduce(ee.Reducer.median()).rename(donnees.first().bandNames())
var rapportDeLaMediane = mediane.select('VV').subtract(mediane.select('VH')).rename('rapport')
mediane = mediane.addBands(rapportDeLaMediane)

Map.addLayer(mediane.select(['VV', 'VH', 'rapport']), {min:[-18, -25, 1], max:[0, -5, 12]}, 'Mediane RGB', false);

// Map.addLayer(mediane.select('VV'), {min: -25, max: 0, palette: palette}, 'VV Mosaique', false)
// Map.addLayer(mediane.select('VH'), {min: -25, max: -10, palette: palette}, 'VH Mosaique', false)


// stop

/**
* 8. Next, let's run a radiometric slope correction algorithm for topographic correction
* The library by Andreas Vollrath that has topographic slope correction described in https://doi.org/10.3390/rs12111867
* This is a copy of Vollrath's script with a bug fix 
* 
* 8. Ensuite, exécutons un algorithme de correction de pente radiométrique pour la correction topographique
* Bibliothèque de charge d'Andreas Vollrath qui a une correction de pente topographique décrite dans https://doi.org/10.3390/rs12111867
* Ceci est une copie du script de Vollrath avec une correction de bogue
*/
var slopeLibrary = require('users/bullocke/ccdcS1:slope_correction_lib.js'); 

var corrige = slopeLibrary.slope_correction(donnees)
  .map(function(im) {return im.updateMask(im.select('no_data_mask'))}) // Apply no data mask
  .reduce(ee.Reducer.mean())
  .rename(donnees.first().bandNames())
  .clip(madagascar)

var rapportDeCorrige = corrige.select('VV').subtract(corrige.select('VH')).rename('rapport')
corrige = corrige.addBands(rapportDeCorrige)

Map.addLayer(corrige.select(['VV', 'VH', 'rapport']), {min:[-18, -25, 1], max:[0, -5, 12]}, 'Corrigé RGB', false);



/**
* 9. Export the image to Google Drive. More information: https://developers.google.com/earth-engine/guides/exporting
* 9. Exportez l'image vers Google Drive. Plus d'informations : https://developers.google.com/earth-engine/guides/exporting
*/
// Export.image.toDrive({
//   image: corrige,
//   region: exportRegion,
//   scale: 10,
//   description: 'image_sentinel-1',
//   folder: 'Sentinel1',
// })






/**
 * 10. Compare values by forest cover. 
 * 10. Comparez les valeurs par couvert forestier.
 */
// var couvertArbore = ee.ImageCollection('NASA/MEASURES/GFCC/TC/v3')
//   .filter(ee.Filter.date('2015-01-01', '2015-12-31'))
//   .filterBounds(madagascar)
//   .select('tree_canopy_cover')
//   .mean()
//   .rename('couvertArbore2015')
  
// var echantillonner = couvertArbore.addBands(corrige).sample({
//   region: madagascar,
//   scale: 10,
//   numPixels: 500,
//   geometries: false
// })

// var chartVV = ui.Chart.feature.byFeature(echantillonner, 'couvertArbore2015', ['VV'])
//   .setChartType('ScatterChart')
//   .setOptions({ pointSize: 2, pointColor: 'red', width: 300, height: 300, titleX: 'Couvert Arboré 2015', titleY: 'VV' })

// var chartVH = ui.Chart.feature.byFeature(echantillonner, 'couvertArbore2015', ['VH'])
//   .setChartType('ScatterChart')
//   .setOptions({ pointSize: 2, pointColor: 'red', width: 300, height: 300, titleX: 'Couvert Arboré 2015', titleY: 'VH' })

// var chartRapport = ui.Chart.feature.byFeature(echantillonner, 'couvertArbore2015', ['rapport'])
//   .setChartType('ScatterChart')
//   .setOptions({ pointSize: 2, pointColor: 'red', width: 300, height: 300, titleX: 'Couvert Arboré 2015', titleY: 'Rapport' })

// print(chartVV)
// print(chartVH)
// print(chartRapport)





/**
 * 11. View time series of forest change events
 * 11. Afficher les séries chronologiques d'événements de changement forestier
 */
// var hansen = ee.Image("UMD/hansen/global_forest_change_2020_v1_8")
//   .select('lossyear')
//   .gt(15)
//   .selfMask()
// Map.addLayer(hansen, {palette: 'red'}, 'Perte du couvert arboré de Hansen', false)

// var donnees = ee.ImageCollection('COPERNICUS/S1_GRD')
//   .filterBounds(madagascar)
//   .filterMetadata('transmitterReceiverPolarisation','equals',["VV", "VH"])
//   .filterMetadata('instrumentMode','equals','IW')

// donnees = slopeLibrary.slope_correction(donnees)
//   .map(function(im) {
//     return im.updateMask(im.select('no_data_mask')).set('system:time_start',im.getNumber('segmentStartTime'))
//   })
  
// var panel = ui.Panel([], null, {
//   minHeight: '200px',
//   position: 'bottom-center',
//   width: '90%'
// })

// Map.add(panel)
// Map.onClick(function(coords) {
//   panel.clear()
//   var geo = ee.Geometry.Point([coords.lon, coords.lat])
//   var chart = ui.Chart.image.series(donnees.select(['VH','VV']), geo, ee.Reducer.mean(), 10)
//     .setChartType('ScatterChart')
//   panel.add(chart)
// })





/**
 * 12. Change Detection with CCDC
 * 12. Détection des changements avec CCDC
 */
// Map.clear()
// var echelleLineaire = donnees.map(function(img) {
//   var vv_power = ee.Image.constant(10).pow(img.select('VV').divide(10.0));
//   var vh_power = ee.Image.constant(10).pow(img.select('VH').divide(10.0));
//   var ratio = vh_power.subtract(vv_power).rename('ratio')
 
//   return img.select().addBands(ee.Image.cat([vv_power, vh_power, ratio]).rename(['VV','VH','ratio']))
// }) 

// var ccdc = ee.Algorithms.TemporalSegmentation.Ccdc({
//   collection: echelleLineaire,
//   breakpointBands: ['VV','VH'],
//   chiSquareProbability: .95
// })
// var zeros = ee.Array(0).repeat(0, 1)
// var mag = ccdc.select('changeProb')
//   .arrayCat(zeros, 0).float()
//   .arraySlice(0, 0, 1)
//   .arrayFlatten([['changeProb']])
//   .eq(1)

// var dateDeChangement = ccdc.select('tBreak')
//   .arrayCat(zeros, 0).float()
//   .arraySlice(0, 0, 1)
//   .arrayFlatten([['changeDate']])
//   .selfMask()
//   .updateMask(couvertArbore.gt(60))
//   .updateMask(mag)

// Map.addLayer(dateDeChangement, {min: 2015, max: 2020, palette: ['#ffffb2','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#b10026']}, 'Date de changement du CCDC')
  
