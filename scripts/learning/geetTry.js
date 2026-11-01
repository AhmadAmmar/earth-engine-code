var geet = require('users/elacerda/geet:geet'); 
var pk = ee.FeatureCollection('ft:1NTBXHJXBZI53ljnoVa9iudFu1Uh-6mmPafN04dIG', 'geometry');
var s2_mosaic = geet.mosaic_s2('2018-01-01', '2018-11-18', pk);