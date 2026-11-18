/**
 * Shared Earth Engine functions, so each script stops redefining them.
 *
 * Use from any script in the Code Editor (after copying this file to the same path in your scripts repository):
 *   var C = require('users/<your-user>/<repo>:lib/common');
 *   var col = C.landsatSR(region, '2024-06-01', '2024-09-01').map(C.addIndices(['ndvi', 'ndwi'], 'landsat_oli'));
 *
 * Every function says what it expects (band names, scaling) and what it returns. Sources are given where a constant
 * comes from a product guide. Python equivalents: research_helpers.indices, research_helpers.landsat.
 */

// ---------------------------------------------------------------- bits and masks

/**
 * Value of bits start..end (inclusive) of the first band, shifted down to start at 0.
 * qaBits(qa, 3, 3) is 1 where bit 3 is set. Replaces the computeQAbits copies in the land-cover scripts.
 */
exports.qaBits = function (image, start, end, newName) {
  var pattern = 0;
  for (var i = start; i <= end; i++) pattern += Math.pow(2, i);
  return image.select([0], [newName || 'bits']).bitwiseAnd(pattern).rightShift(start);
};

/**
 * Landsat Collection 2 Level 2 clear-sky mask from QA_PIXEL: drops fill (bit 0), dilated cloud (1), cirrus (2),
 * cloud (3), cloud shadow (4) and, unless keepSnow, snow (5). Also drops saturated pixels (QA_RADSAT > 0).
 * Bit layout: USGS Landsat 8-9 Collection 2 Level 2 Science Product Guide, Table 6-3.
 */
exports.maskLandsatC2 = function (keepSnow) {
  return function (img) {
    var qa = img.select('QA_PIXEL');
    var bad = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (keepSnow ? 0 : (1 << 5));
    return img.updateMask(qa.bitwiseAnd(bad).eq(0)).updateMask(img.select('QA_RADSAT').eq(0));
  };
};

/**
 * Landsat Collection 2 Level 2 to physical units: optical bands to reflectance (x 0.0000275 - 0.2) and ST_B*
 * thermal bands to deg C (x 0.00341802 + 149 - 273.15). Other bands are kept unchanged. Same product guide.
 */
exports.scaleLandsatC2 = function (img) {
  var optical = img.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermal = img.select('ST_B.*').multiply(0.00341802).add(149.0).subtract(273.15);
  return img.addBands(optical, null, true).addBands(thermal, null, true);
};

/** Landsat 8 and 9 Level 2, masked and scaled, over a region and dates. */
exports.landsatSR = function (region, start, end, keepSnow) {
  return ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(region).filterDate(start, end)
    .map(exports.maskLandsatC2(keepSnow)).map(exports.scaleLandsatC2);
};

/**
 * Land surface temperature (deg C) from a Landsat Collection 2 Level 2 scene, masked for cloud, shadow and snow,
 * band named LST. The form used for the PhD's composites (gbem_composites.js).
 */
exports.landsatLST = function (img) {
  var qa = img.select('QA_PIXEL');
  var clear = qa.bitwiseAnd((1 << 1) | (1 << 3) | (1 << 4) | (1 << 5)).eq(0);
  return img.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15)
    .rename('LST').updateMask(clear).copyProperties(img, ['system:time_start']);
};

/** Sentinel-2 mask from QA60 (opaque cloud bit 10, cirrus bit 11). Coarse: the band is empty after January 2022. */
exports.maskS2QA60 = function (img) {
  var qa = img.select('QA60');
  return img.updateMask(qa.bitwiseAnd((1 << 10) | (1 << 11)).eq(0));
};

/**
 * Sentinel-2 Level 2A, masked with Cloud Score+ (cs_cdf >= threshold; 0.6 is Google's suggested default) and scaled
 * to 0-1 reflectance. Use this rather than QA60 for any date.
 */
exports.sentinel2 = function (region, start, end, threshold) {
  var cs = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(region).filterDate(start, end)
    .linkCollection(cs, ['cs_cdf'])
    .map(function (img) {
      return img.updateMask(img.select('cs_cdf').gte(threshold || 0.6))
        .select('B.*').divide(10000).copyProperties(img, ['system:time_start']);
    });
};

// ---------------------------------------------------------------- indices

var BANDS = {
  landsat_oli: {blue: 'SR_B2', green: 'SR_B3', red: 'SR_B4', nir: 'SR_B5', swir1: 'SR_B6', swir2: 'SR_B7'},
  landsat_tm: {blue: 'SR_B1', green: 'SR_B2', red: 'SR_B3', nir: 'SR_B4', swir1: 'SR_B5', swir2: 'SR_B7'},
  sentinel2: {blue: 'B2', green: 'B3', red: 'B4', nir: 'B8', swir1: 'B11', swir2: 'B12'}
};
exports.BANDS = BANDS;
var ND = {ndvi: ['nir', 'red'], ndwi: ['green', 'nir'], mndwi: ['green', 'swir1'], ndbi: ['swir1', 'nir'],
          ndsi: ['green', 'swir1'], nbr: ['nir', 'swir2'], ndmi: ['nir', 'swir1']};

/**
 * Returns a function adding the named indices as bands NDVI, NDWI, ... to 0-1 reflectance images.
 * Definitions and sources as in research_helpers/indices.py; EVI and SAVI use their standard constants.
 */
exports.addIndices = function (names, sensor) {
  var b = BANDS[sensor || 'sentinel2'];
  return function (img) {
    names.forEach(function (n) {
      var band;
      if (n === 'evi') band = img.expression('2.5*(N-R)/(N+6*R-7.5*B+1)', {N: img.select(b.nir), R: img.select(b.red), B: img.select(b.blue)});
      else if (n === 'savi') band = img.expression('1.5*(N-R)/(N+R+0.5)', {N: img.select(b.nir), R: img.select(b.red)});
      else band = img.normalizedDifference([b[ND[n][0]], b[ND[n][1]]]);
      img = img.addBands(band.rename(n.toUpperCase()));
    });
    return img;
  };
};

// ---------------------------------------------------------------- climate

/**
 * Heating and cooling degree days from ERA5-Land daily 2 m temperature over a period: sum of max(0, base - T) and
 * max(0, T - base), with T the daily mean in deg C. Bands HDD and CDD. Bases default to 15.5 and 22 deg C.
 */
exports.degreeDays = function (start, end, hddBase, cddBase) {
  var t = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR').filterDate(start, end).select('temperature_2m')
    .map(function (i) { return i.subtract(273.15); });
  var h = hddBase === undefined ? 15.5 : hddBase, c = cddBase === undefined ? 22 : cddBase;
  return t.map(function (i) { return ee.Image(h).subtract(i).max(0); }).sum().rename('HDD')
    .addBands(t.map(function (i) { return i.subtract(c).max(0); }).sum().rename('CDD'));
};

// ---------------------------------------------------------------- export

/**
 * Export to Drive on a fixed grid: crs plus an origin (x0, y1) and pixel size, so every export of a project lines up
 * pixel for pixel. Masked pixels are written as noData. Returns the expected size in MB for a check before running.
 */
exports.exportGrid = function (img, name, folder, crs, bounds, scale, noData) {
  var nd = noData === undefined ? -9999 : noData;
  Export.image.toDrive({
    image: img.unmask(nd, false).toFloat(), description: name, folder: folder, fileNamePrefix: name,
    region: ee.Geometry.Rectangle(bounds, crs, false), crs: crs,
    crsTransform: [scale, 0, bounds[0], 0, -scale, bounds[3]],
    maxPixels: 1e13, fileFormat: 'GeoTIFF', formatOptions: {cloudOptimized: true, noData: nd}
  });
  return (bounds[2] - bounds[0]) / scale * (bounds[3] - bounds[1]) / scale * 4 / 1e6;
};
