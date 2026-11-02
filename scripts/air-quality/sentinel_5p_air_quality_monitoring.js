var worldcountries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
var filterCountry = ee.Filter.eq('country_na', 'Pakistan');
var country = worldcountries.filter(filterCountry);

var no2ic = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_NO2').select('NO2_column_number_density');

var filterMonth = ee.Filter.calendarRange(1, 9, 'month');
var no2 = no2ic.filter(filterMonth);

var filter19 = ee.Filter.calendarRange(2019, 2019, 'year');
var filter20 = ee.Filter.calendarRange(2020, 2020, 'year');

var no2pre  = no2.filter(filter19).mean().clip(country);
var no2post = no2.filter(filter20).mean().clip(country);

var palettes = require('users/gena/packages:palettes');
var palettec = palettes.misc.cubehelix[7].reverse();

var vizParams = {
  min: 0,
  max: 0.0003,
  palette: palettec,
  opacity: 0.8
};

Map.addLayer(no2pre, vizParams);
Map.setCenter(73.084488, 33.738045, 7);
Map.setControlVisibility({all: false, zoomControl: true, mapTypeControl: true});

var linkedMap = ui.Map();

linkedMap.addLayer(no2post, vizParams);
linkedMap.setCenter(73.084488, 33.738045, 7);
linkedMap.setControlVisibility({all: false, zoomControl: true, mapTypeControl: true});

var linker = ui.Map.Linker([ui.root.widgets().get(0), linkedMap]);

var title_prior= Map.add(ui.Label('Mean NO2 emissions prior to pandemic', {fontWeight: 'bold', fontSize: '10px', position: 'bottom-left', color: 'slateGrey'}));
var title_during= linkedMap.add(ui.Label('Mean NO2 during the pandemic', {fontWeight: 'bold', fontSize: '10px', position: 'bottom-right', color: 'slateGrey'}));

var splitPanel = ui.SplitPanel({
firstPanel: linker.get(0),
secondPanel: linker.get(1),
orientation: 'horizontal',
wipe: true,
style: {stretch: 'both'}
});

ui.root.widgets().reset([splitPanel]);
var viz = {min:0.0, max:300.0, palette:palettec};

var header = ui.Label('Mean NO2 Emission Concentration', {fontSize: '15px', color: 'darkSlateGrey'});

var text_1 = ui.Label(
'Before Pandemic (Jan-Sep 2019) & During Pandemic (Jan-Sep 2020)',
{fontSize: '15px'});

var text_2 = ui.Label(
'Data Source: European Union/ESA/Copernicus',
{fontSize: '11px'});

var toolPanel = ui.Panel([header, text_1, text_2], 'flow', {width: '300px'});

var link = ui.Label(
'Sentinel-5P NRTI NO2: Near Real-Time Nitrogen Dioxide', {},
'https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S5P_NRTI_L3_NO2');
var linkPanel = ui.Panel(
[ui.Label('For more information:', {fontWeight: 'bold'}), link]);
toolPanel.add(linkPanel);

var legend = ui.Panel({
style: {
position: 'bottom-left',
padding: '8px 15px'
}
});

var legendTitle = ui.Label({
value: 'NO2 Concentration (μmol/m²)',
style: {
fontWeight: 'bold',
fontSize: '8 px',
margin: '0 0 4px 0',
padding: '0'
}
});

legend.add(legendTitle);

var makeRow = function(color, name) {
var colorBox = ui.Label({
style: {
backgroundColor: '#' + color,
padding: '8px',
margin: '0 0 4px 0'
}
});

var description = ui.Label({
value: name,
style: {margin: '0 0 4px 6px'}
});

return ui.Panel({
widgets: [colorBox, description],
layout: ui.Panel.Layout.Flow('horizontal')
});
};

var lon = ee.Image.pixelLonLat().select('latitude');
var gradient = lon.multiply((viz.max-viz.min)/100.0).add(viz.min);
var legendImage = gradient.visualize(viz);

var panel_max = ui.Panel({
widgets: [
ui.Label(viz['max'])
],
});

legend.add(panel_max);

var thumbnail = ui.Thumbnail({
image: legendImage,
params: {bbox:'0,0,10,100', dimensions:'10x100'},
style: {padding: '1px', position: 'bottom-center'}
});

legend.add(thumbnail);

var panel_min = ui.Panel({
widgets: [
ui.Label(viz['min'])
],
});

legend.add(panel_min);
toolPanel.add(legend);
ui.root.widgets().add(toolPanel);