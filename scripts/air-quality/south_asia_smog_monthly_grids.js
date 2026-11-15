// South Asia smog: monthly mean and valid-day count on a 0.1 degree grid, as in south-asia-smog/src/01_monthly_grids.py.
// Daily images are averaged per day first, so a day with two overpasses counts once.
// Change VAR, YEAR and MONTH; the map shows the mean and the export writes both bands to Drive.

var REGION = ee.Geometry.Rectangle([60, 5, 98, 37], null, false);
var VARS = {
  no2: ['COPERNICUS/S5P/OFFL/L3_NO2', 'tropospheric_NO2_column_number_density', 1e6],   // umol m-2
  co: ['COPERNICUS/S5P/OFFL/L3_CO', 'CO_column_number_density', 1e3],                  // mmol m-2
  so2: ['COPERNICUS/S5P/OFFL/L3_SO2', 'SO2_column_number_density', 1e6],               // umol m-2
  hcho: ['COPERNICUS/S5P/OFFL/L3_HCHO', 'tropospheric_HCHO_column_number_density', 1e6], // umol m-2
  uvai: ['COPERNICUS/S5P/OFFL/L3_AER_AI', 'absorbing_aerosol_index', 1],
  o3: ['COPERNICUS/S5P/OFFL/L3_O3', 'O3_column_number_density', 1e3],                  // mmol m-2
  aod: ['MODIS/061/MCD19A2_GRANULES', 'Optical_Depth_055', 0.001]
};
var VAR = 'no2', YEAR = 2024, MONTH = 11;

function monthly(v, y, m) {
  var spec = VARS[v];
  var start = ee.Date.fromYMD(y, m, 1), end = start.advance(1, 'month');
  var c = ee.ImageCollection(spec[0]).filterDate(start, end).select(spec[1]);
  var days = ee.List.sequence(0, end.difference(start, 'day').subtract(1));
  var daily = ee.ImageCollection(days.map(function (d) {
    var d0 = start.advance(d, 'day');
    return c.filterDate(d0, d0.advance(1, 'day')).mean().multiply(spec[2]);
  })).filter(ee.Filter.listContains('system:band_names', spec[1]));
  return daily.mean().rename('mean').addBands(daily.count().rename('n')).toFloat();
}

function fires(y, m) {
  var start = ee.Date.fromYMD(y, m, 1);
  var c = ee.ImageCollection('FIRMS').filterDate(start, start.advance(1, 'month'));
  var proj = ee.Image(c.first()).select('T21').projection();
  var hot = c.map(function (i) { return i.select('T21').updateMask(i.select('confidence').gte(50)); });
  var n = hot.map(function (i) { return i.mask().rename('n').toFloat(); }).sum().setDefaultProjection(proj)
    .reduceResolution({reducer: ee.Reducer.sum().unweighted(), maxPixels: 200});
  return hot.mean().rename('mean').addBands(n.rename('n')).toFloat();
}

var img = VAR === 'fire' ? fires(YEAR, MONTH) : monthly(VAR, YEAR, MONTH);
Map.setCenter(80, 24, 5);
Map.addLayer(img.select('mean'), {min: 0, max: VAR === 'no2' ? 60 : 1, palette: ['ffffcc', 'fd8d3c', '800026', '000000']}, VAR + ' mean');
Export.image.toDrive({image: img, description: 'smog_' + VAR + '_' + YEAR + '_' + MONTH, region: REGION,
  crs: 'EPSG:4326', crsTransform: [0.1, 0, 60, 0, -0.1, 37], maxPixels: 1e9});
