////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Last updated: 16 Dec. 2021
// GEDI CHM data current to July 2021
// questions? eac0021@uah.edu

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var a = require('users/bzgeo/examples:_ancillary/mes');

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Color palettes for CHM
var pal0 = {min:0,max:2,palette:['red','yellow','limegreen','green']};
var pal1 = {min:0,max:40,palette:['red','yellow','limegreen','green']};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var data0 = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
            .filter(ee.Filter.date('2019-01-01', '2021-11-17')).filterBounds(a.roi_bz);
print(data0);

var data1 = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
            .filter(ee.Filter.date('2019-01-01', '2021-11-17')).filterBounds(a.roi_bz).sort('system:time_start', false).first();
print(data1);

/* print(ee.data.listAssets('LARSE/GEDI/GEDI02_A_002'));
print(ee.data.listAssets('LARSE/GEDI/GEDI02_A_002_MONTHLY')); */

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// GEDI CHM datasets
var rh05 = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
            .filter(ee.Filter.date('2019-01-01', '2021-12-31'))
            .filterBounds(a.roi_mes).select('rh5')
            .max().updateMask(a.msk_wtr).clip(a.roi_mes).clip(a.mes_bnds);

var rh95 = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
            .filter(ee.Filter.date('2019-01-01', '2021-12-31'))
            .filterBounds(a.roi_mes).select('rh95')
            .median().updateMask(a.msk_wtr).clip(a.roi_mes).clip(a.mes_bnds);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Generate height-based masks for the CHM datasets -> set minimum and maximum heights
var msk_ht_rh05 = rh05.gte(0.01); // RH05 =< 0.1m
var msk_ht_rh95 = rh95.lte(40.0); // RH95 >= 40m

// Bad data masks
var msk_bad_rh05 = rh05.mask(rh05.lt(0.01));
var msk_bad_rh95 = rh95.mask(rh95.gt(40.0));

// Masked CHM datasets
var rh05_1 = rh05.mask(msk_ht_rh05);
var rh95_1 = rh95.mask(msk_ht_rh95);
var rh95_2 = rh95.mask(msk_ht_rh95).updateMask(msk_ht_rh05);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function chm_mean(img,res,aoi, name) {

var mean = ee.Number(img.clip(aoi).select('rh95').reduceRegion({
  geometry: aoi, reducer: ee.Reducer.mean(), scale: res, maxPixels: 1e18}).get('rh95'));

print('Mean veg. height '+'('+name+"):", mean,'meters');
}

/////
//chm_mean(rh95, 100, a.bz_bnds, "Belize (L0)");
//chm_mean(rh95_1, 100, a.bz_bnds, "Belize (L1)");
chm_mean(rh95_2, 100, a.bz_bnds, "Belize (filtered)");
chm_mean(rh95_2, 100, a.gt_, "Guatemala (filtered)");
chm_mean(rh95_2, 100, a.sv, "El Salvador");
chm_mean(rh95_2, 100, a.hn, "Honduras");
chm_mean(rh95_2, 100, a.ni, "Nicaragua");
chm_mean(rh95_2, 100, a.cr, "Costa Rica");
chm_mean(rh95_2, 100, a.pn, "Panama");
chm_mean(rh95_2, 100, a.cam_bnds_, "Central America");
//chm_mean(rh95_2, 100, a.mes_bnds, "Mesoamerica");

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

print(ui.Chart.image.histogram(rh95.clip(a.bz_bnds), a.bz_bnds, 100));
print(ui.Chart.image.histogram(rh95_1.clip(a.bz_bnds), a.bz_bnds, 100));
print(ui.Chart.image.histogram(rh95_2.clip(a.bz_bnds), a.bz_bnds, 100));

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

Map.addLayer(msk_bad_rh05, {palette: 'red'},'GEDI02_A_CHM_RH05_bad', false);
Map.addLayer(msk_bad_rh95, {palette: 'red'},'GEDI02_A_CHM_RH95_bad', false);

Map.addLayer(rh05, pal0,'GEDI02_A_CHM_RH05_l0', false);
Map.addLayer(rh95, pal1,'GEDI02_A_CHM_RH95_l0', false);
Map.addLayer(rh95_1, pal1,'GEDI02_A_CHM_RH95_l1', false);
Map.addLayer(rh95_2, pal1,'GEDI02_A_CHM_RH95_l2', false);

Map.addLayer(a.pa_bz_ln,{palette: "yellow"},"Protected Areas", false); // adds protected areas outlines
Map.addLayer(a.bz_dist_ln,{palette: "silver"},"Districts", false); // adds district borders
Map.addLayer(a.cam_bnds_ln,{palette: "white"},"Int'l Borders", true); // adds international borders

Map.setOptions('SATELLITE');
Map.setCenter(-88.7486, 17.7064, 9); // center on NW Belize
//Map.centerObject(a.mes_bnds, 8); // center on Mesoamerica

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////