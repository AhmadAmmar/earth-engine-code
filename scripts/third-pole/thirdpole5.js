// ============================================================================
// THIRD POLE / HINDU KUSH HIMALAYA SNOW COVER — MVP EXPORT
// ============================================================================
//
// PURPOSE
// -------
// Create a compact, reproducible 8-day snow-cover-area time series for:
//
//   1. whole Third Pole / HKH analysis domain
//   2. major mountain-sector analysis regions
//   3. HKH countries intersected with the study domain
//   4. HydroBASINS level-3 hydrological regions
//
// DATA
// ----
// NASA MODIS/Terra MOD10A2.061
// 8-day maximum snow extent
// Native resolution: 500 m
// Availability: 2000-02-18 -> present
//
// PRIMARY OUTPUT
// --------------
// snow-covered area (SCA), km2
//
// ALSO EXPORTED
// -------------
// valid observed area, km2
// snow fraction of valid observed land, %
// snow fraction of full analysis region, %
// valid observation coverage, %
//
// IMPORTANT
// ---------
// This first version intentionally exports TIME SERIES TABLES ONLY.
// Do NOT export annual rasters / GIF frames yet.
// Do the temporal aggregation, trends and plotting in Python.
//
// The analysis is performed at 2000 m for speed, BUT the native 500 m
// binary snow mask is first fractionally aggregated to 2 km.
// We therefore do NOT simply nearest-neighbour sample the 500 m mask.
//
// ============================================================================


// ============================================================================
// 0. CONFIGURATION
// ============================================================================

var CFG = {

  // MOD10A2 starts 2000-02-18.
  START_DATE: '2000-02-18',

  // Exclusive upper bound.
  // This deliberately extends beyond currently available MODIS scenes:
  // Earth Engine simply uses whatever has actually been ingested.
  END_DATE: '2026-09-08',

  // -------------------------------------------------------------------------
  // ANALYSIS SCALE
  // -------------------------------------------------------------------------
  //
  // 2000 m is recommended for the FIRST regional trend export.
  //
  // 500 m  = native, best spatial detail, much slower
  // 1000 m = good publication-quality compromise
  // 2000 m = recommended MVP time-series extraction
  //
  SCALE_M: 2000,

  // Higher tileScale -> smaller processing tiles.
  // This can HELP MEMORY problems.
  // It does NOT inherently make processing faster.
  TILE_SCALE: 4,

  // Safeguard for reduceRegions.
  // This raises the allowed number of pixels; it does NOT speed computation.
  MAX_PIXELS_PER_REGION: 1e8,

  // Tiny clipped hydrological fragments smaller than this are dropped.
  MIN_HYDROBASIN_AREA_KM2: 2500,

  DRIVE_FOLDER: 'ThirdPole_Snow_MODIS_MVP',

  // -------------------------------------------------------------------------
  // OPTIONAL: OFFICIAL ICIMOD HKH BOUNDARY
  // -------------------------------------------------------------------------
  //
  // First run:
  // leave this FALSE and the script uses the built-in fallback analysis
  // polygon below.
  //
  // Before final publication:
  // download ICIMOD's HKH boundary, upload it to your EE Assets,
  // set this true and paste its asset path.
  //
  USE_OFFICIAL_HKH_ASSET: false,

  OFFICIAL_HKH_ASSET:
      'projects/YOUR_PROJECT/assets/ICIMOD_HKH_BOUNDARY'
};


// ============================================================================
// 1. FALLBACK THIRD-POLE / HKH ANALYSIS DOMAIN
// ============================================================================
//
// IMPORTANT:
// This is an intentionally broad, transboundary HIGH-ASIA analysis polygon.
// It is NOT being claimed as the canonical ICIMOD administrative/geographic
// boundary.
//
// It exists so the first script is completely runnable without any asset.
//
// The polygon encompasses the Hindu Kush, Pamir, Karakoram, Himalaya,
// Tibetan Plateau / Trans-Himalaya and eastern highlands.
//
// Snow-area calculations are independent of political attribution.
//
// Before publication we should replace this with the official ICIMOD HKH
// polygon.
//
// ============================================================================

var fallbackThirdPole = ee.Geometry.Polygon(
  [[
    [60.0, 35.5],
    [61.5, 38.5],
    [65.0, 40.5],
    [69.5, 41.5],
    [73.5, 41.0],
    [77.0, 42.5],
    [82.0, 43.5],
    [87.0, 42.5],
    [92.5, 40.5],
    [98.0, 39.5],
    [103.0, 37.0],
    [105.0, 33.0],
    [104.5, 28.0],
    [102.0, 24.0],
    [98.0, 22.5],
    [94.0, 23.5],
    [91.0, 25.5],
    [87.5, 25.5],
    [84.0, 25.5],
    [80.5, 26.5],
    [77.0, 28.0],
    [74.0, 29.5],
    [71.0, 30.5],
    [68.0, 31.0],
    [65.0, 32.0],
    [62.0, 33.5],
    [60.0, 35.5]
  ]],
  null,
  false
);


// Client-side switch deliberately used so an invalid placeholder asset
// is never evaluated unless you explicitly turn it on.
var studyGeom;

if (CFG.USE_OFFICIAL_HKH_ASSET) {
  studyGeom = ee.FeatureCollection(CFG.OFFICIAL_HKH_ASSET).geometry();
} else {
  studyGeom = fallbackThirdPole;
}


// ============================================================================
// 2. HELPER FOR ANALYSIS REGIONS
// ============================================================================

function makeRegion(geometry, group, id, name, source, notes) {

  var clipped = ee.Geometry(geometry)
    .intersection(studyGeom, 1000);

  var areaKm2 = clipped.area(1000).divide(1e6);

  return ee.Feature(clipped, {
    region_group: group,
    region_id: id,
    region_name: name,
    region_source: source,
    region_notes: notes,
    region_area_km2: areaKm2
  });
}


// ============================================================================
// 3. WHOLE-REGION DOMAIN
// ============================================================================

var wholeRegion = ee.FeatureCollection([
  makeRegion(
    studyGeom,
    'whole',
    'TP_HKH_ALL',
    'Third Pole / HKH analysis domain',
    CFG.USE_OFFICIAL_HKH_ASSET
      ? 'ICIMOD boundary uploaded by user'
      : 'MVP transboundary fallback polygon',
    CFG.USE_OFFICIAL_HKH_ASSET
      ? 'Official boundary mode'
      : 'Replace fallback with ICIMOD HKH boundary before final publication'
  )
]);


// ============================================================================
// 4. MAJOR MOUNTAIN-SECTOR ANALYSIS REGIONS
// ============================================================================
//
// These are communication / analytical sectors, NOT legal or political
// boundaries and NOT claimed to be authoritative geological polygons.
//
// Deliberate overlaps are allowed.
// The purpose is to expose spatially different snow-cover trends.
//
// For a final scientific paper, we can replace these with a published
// mountain-region classification.
//
// ============================================================================


// Hindu Kush / Pamir
var geomHinduKushPamir =
    ee.Geometry.Rectangle([60.0, 32.5, 73.5, 40.5], null, false);

// Karakoram
var geomKarakoram =
    ee.Geometry.Rectangle([72.0, 33.5, 80.5, 39.5], null, false);

// Western Himalaya
var geomWesternHimalaya =
    ee.Geometry.Rectangle([73.0, 28.5, 81.5, 35.5], null, false);

// Central Himalaya / Nepal sector
var geomCentralHimalaya =
    ee.Geometry.Rectangle([79.0, 25.5, 89.0, 32.5], null, false);

// Eastern Himalaya / Bhutan-Arunachal sector
var geomEasternHimalaya =
    ee.Geometry.Rectangle([87.5, 25.0, 97.5, 32.0], null, false);

// Tibetan Plateau / Trans-Himalaya
var geomTibetanPlateau =
    ee.Geometry.Rectangle([77.0, 28.0, 104.5, 40.5], null, false);

// Explicitly border-independent Kashmir/Karakoram/western Himalaya sector.
// Useful because this analysis does not rely on any state's sovereignty
// claim or ADM0 attribution.
var geomKashmirTransboundary =
    ee.Geometry.Rectangle([72.5, 30.0, 80.5, 37.5], null, false);


var mountainSectors = ee.FeatureCollection([

  makeRegion(
    geomHinduKushPamir,
    'mountain_sector',
    'HINDUKUSH_PAMIR',
    'Hindu Kush–Pamir',
    'MVP analytical sector',
    'Approximate communication sector; may overlap adjoining sectors'
  ),

  makeRegion(
    geomKarakoram,
    'mountain_sector',
    'KARAKORAM',
    'Karakoram',
    'MVP analytical sector',
    'Approximate communication sector; may overlap adjoining sectors'
  ),

  makeRegion(
    geomWesternHimalaya,
    'mountain_sector',
    'WESTERN_HIMALAYA',
    'Western Himalaya',
    'MVP analytical sector',
    'Approximate communication sector; may overlap adjoining sectors'
  ),

  makeRegion(
    geomCentralHimalaya,
    'mountain_sector',
    'CENTRAL_HIMALAYA',
    'Central Himalaya / Nepal sector',
    'MVP analytical sector',
    'Approximate communication sector; includes Nepal and adjoining ranges'
  ),

  makeRegion(
    geomEasternHimalaya,
    'mountain_sector',
    'EASTERN_HIMALAYA',
    'Eastern Himalaya',
    'MVP analytical sector',
    'Approximate communication sector; includes Bhutan and adjoining ranges'
  ),

  makeRegion(
    geomTibetanPlateau,
    'mountain_sector',
    'TIBETAN_PLATEAU',
    'Tibetan Plateau / Trans-Himalaya',
    'MVP analytical sector',
    'Broad plateau sector; overlaps the Himalayan/Karakoram margins'
  ),

  makeRegion(
    geomKashmirTransboundary,
    'transboundary_sector',
    'KASHMIR_KARAKORAM_HIMALAYA',
    'Kashmir–Karakoram–western Himalaya transboundary sector',
    'MVP border-independent analytical sector',
    'No sovereignty attribution; deliberately crosses disputed boundaries'
  )

]);


// Combine whole domain + mountain sectors for the first/core export.
var coreRegions = wholeRegion.merge(mountainSectors);


// ============================================================================
// 5. COUNTRY × THIRD-POLE INTERSECTIONS
// ============================================================================
//
// geoBoundaries ADM0 is open CC BY 4.0.
//
// IMPORTANT:
// Country attribution is SECONDARY.
// The primary all-region/mountain/basin analyses do not depend on these
// political boundaries.
//
// We include the eight ICIMOD HKH regional countries.
//
// ============================================================================

var adm0 = ee.FeatureCollection(
  'WM/geoLab/geoBoundaries/600/ADM0'
);

var hkhCountryNames = [
  'Afghanistan',
  'Bangladesh',
  'Bhutan',
  'China',
  'India',
  'Myanmar',
  'Nepal',
  'Pakistan'
];

var countriesRaw = adm0.filter(
  ee.Filter.inList('shapeName', hkhCountryNames)
);


var countryRegions = countriesRaw.map(function(f) {

  var geom = f.geometry()
    .intersection(studyGeom, 1000);

  var areaKm2 = geom.area(1000).divide(1e6);

  return ee.Feature(geom, {
    region_group: 'country_intersection',
    region_id: ee.String(f.get('shapeGroup')),
    region_name: ee.String(f.get('shapeName')),
    region_source: 'geoBoundaries v6 ADM0 × Third Pole/HKH domain',
    region_notes:
      'Administrative attribution only; not used to define the transboundary cryosphere domain',
    region_area_km2: areaKm2
  });
})
.filter(
  ee.Filter.gt('region_area_km2', 1)
);


// ============================================================================
// 6. HYDROLOGICAL SUBREGIONS — HYDROBASINS LEVEL 3
// ============================================================================
//
// We deliberately use an objective public hydrological classification
// instead of inventing political basin polygons.
//
// HydroBASINS L3 is coarse enough for regional comparison.
//
// These polygons have IDs/Pfafstetter codes rather than convenient river
// names. For the final publication I recommend replacing/augmenting these
// with ICIMOD's named ten-major-basin dataset.
//
// ============================================================================

var hydroL3Raw = ee.FeatureCollection(
  'WWF/HydroSHEDS/v1/Basins/hybas_3'
)
.filterBounds(studyGeom);


var hydroL3Regions = hydroL3Raw.map(function(f) {

  var geom = f.geometry()
    .intersection(studyGeom, 1000);

  var areaKm2 = geom.area(1000).divide(1e6);

  var hybasId = ee.Number(f.get('HYBAS_ID')).format('%.0f');
  var pfafId = ee.Number(f.get('PFAF_ID')).format('%.0f');

  return ee.Feature(geom, {
    region_group: 'hydrobasins_l3',
    region_id: ee.String('HYBAS3_').cat(hybasId),
    region_name: ee.String('HydroBASINS L3 — PFAF ').cat(pfafId),
    region_source: 'WWF HydroSHEDS HydroBASINS level 3',
    region_notes:
      'Hydrological subdivision clipped to Third Pole/HKH analysis domain',
    region_area_km2: areaKm2,

    HYBAS_ID: f.get('HYBAS_ID'),
    PFAF_ID: f.get('PFAF_ID'),
    MAIN_BAS: f.get('MAIN_BAS'),
    NEXT_DOWN: f.get('NEXT_DOWN'),
    ENDO: f.get('ENDO')
  });
})
.filter(
  ee.Filter.gt(
    'region_area_km2',
    CFG.MIN_HYDROBASIN_AREA_KM2
  )
);


// ============================================================================
// 7. LOAD MODIS 8-DAY SNOW
// ============================================================================

var modisRaw = ee.ImageCollection('MODIS/061/MOD10A2')
  .filterDate(CFG.START_DATE, CFG.END_DATE)
  .filterBounds(studyGeom)
  .select('Maximum_Snow_Extent');


// MOD10A2 Maximum_Snow_Extent classes:
//
// 0   missing
// 1   no decision
// 11  night
// 25  no snow
// 37  lake
// 39  ocean
// 50  cloud
// 100 lake ice
// 200 snow
// 254 detector saturated
//
// For terrestrial SCA:
//
// snow  = class 200
// valid = clear snow OR clear no-snow = 200 or 25
//
// Cloud/night/water/etc. are not counted as valid terrestrial observation.
//
// ============================================================================


// Native MODIS projection.
var modisProjection = ee.Image(modisRaw.first())
  .select('Maximum_Snow_Extent')
  .projection();


// ============================================================================
// 8. COARSE FRACTIONAL AGGREGATION
// ============================================================================
//
// WHY?
//
// If we simply call reduceRegions(scale: 2000) on a binary 500 m image,
// pixels may effectively be sampled at the coarser grid.
//
// Instead:
//
//   500 m binary snow
//        ↓
//   mean within 2 km cell
//        ↓
//   fraction of 2-km pixel snow covered
//        ↓
//   multiply by pixel area
//
// Example:
//
// 8 of 16 underlying 500 m pixels are snow:
//
// snow fraction = 0.5
//
// 2-km pixel area ≈ 4 km²
//
// snow area contribution ≈ 2 km²
//
// This preserves regional area substantially better while reducing compute.
//
// ============================================================================

function aggregateBinaryToAnalysisScale(binaryImage) {

  return binaryImage
    .unmask(0)
    .reduceResolution({
      reducer: ee.Reducer.mean(),
      bestEffort: false,
      maxPixels: 64
    })
    .reproject({
      crs: modisProjection,
      scale: CFG.SCALE_M
    });
}


// ============================================================================
// 9. PREPARE EVERY 8-DAY MODIS IMAGE
// ============================================================================

function prepareSnowImage(img) {

  var cls = img.select('Maximum_Snow_Extent');

  // Native 500 m masks.
  var snow500 = cls.eq(200);
  var valid500 = cls.eq(200).or(cls.eq(25));

  // Fractional 2-km representation.
  var snowFraction = aggregateBinaryToAnalysisScale(snow500);
  var validFraction = aggregateBinaryToAnalysisScale(valid500);

  // Pixel area at processing projection.
  var pixelAreaKm2 = ee.Image.pixelArea().divide(1e6);

  // Absolute areas represented by each coarse cell.
  var snowAreaKm2 = snowFraction
    .multiply(pixelAreaKm2)
    .rename('snow_km2');

  var validAreaKm2 = validFraction
    .multiply(pixelAreaKm2)
    .rename('valid_km2');

  // -------------------------------------------------------------------------
  // TEMPORAL METADATA
  // -------------------------------------------------------------------------
  //
  // MOD10A2 date = beginning of its 8-day window.
  // Assign season according to approximate midpoint (+4 days).
  //
  // This avoids systematically assigning a cross-boundary 8-day composite
  // only according to its first day.
  //
  // -------------------------------------------------------------------------

  var startDate = img.date();
  var midDate = startDate.advance(4, 'day');

  var year = ee.Number(midDate.get('year'));
  var month = ee.Number(midDate.get('month'));
  var doy = ee.Number(midDate.getRelative('day', 'year')).add(1);

  var season = ee.String(
    ee.Algorithms.If(
      month.lte(2),
      'DJF',
      ee.Algorithms.If(
        month.lte(5),
        'MAM',
        ee.Algorithms.If(
          month.lte(8),
          'JJA',
          'SON'
        )
      )
    )
  );

  // Winter is labelled by Jan-Feb year:
  //
  // Dec 2024 -> DJF 2025
  // Jan 2025 -> DJF 2025
  // Feb 2025 -> DJF 2025
  //
  var seasonYear = ee.Number(
    ee.Algorithms.If(
      month.eq(12),
      year.add(1),
      year
    )
  );

  // Snow/hydrological year Oct-Sep, labelled by ending year.
  //
  // Oct 2024-Sep 2025 -> snow_year 2025
  //
  var snowYear = ee.Number(
    ee.Algorithms.If(
      month.gte(10),
      year.add(1),
      year
    )
  );

  return snowAreaKm2
    .addBands(validAreaKm2)
    .set({
      composite_start: startDate.format('YYYY-MM-dd'),
      composite_mid: midDate.format('YYYY-MM-dd'),

      year: year,
      month: month,
      doy: doy,

      season: season,
      season_year: seasonYear,
      snow_year: snowYear,

      source_dataset: 'MODIS/061/MOD10A2',
      native_scale_m: 500,
      analysis_scale_m: CFG.SCALE_M,

      'system:time_start': img.get('system:time_start')
    });
}


var snowPrepared = modisRaw.map(prepareSnowImage);


// ============================================================================
// 10. EXTRACT REGIONAL TIME SERIES
// ============================================================================
//
// Returns one row:
//
// composite × region
//
// NO geometry is included in the output table, keeping CSVs small.
//
// ============================================================================

function extractTimeSeries(regions) {

  var n = snowPrepared.size();

  var imageList = snowPrepared.toList(n);

  var indices = ee.List.sequence(
    0,
    n.subtract(1)
  );


  var fcList = indices.map(function(i) {

    i = ee.Number(i);

    var img = ee.Image(imageList.get(i));


    var reduced = img.reduceRegions({

      collection: regions,

      reducer: ee.Reducer.sum(),

      scale: CFG.SCALE_M,

      crs: modisProjection.crs(),

      tileScale: CFG.TILE_SCALE,

      maxPixelsPerRegion: CFG.MAX_PIXELS_PER_REGION
    });


    return reduced.map(function(f) {

      var snowKm2 = ee.Number(f.get('snow_km2'));
      var validKm2 = ee.Number(f.get('valid_km2'));
      var regionKm2 = ee.Number(f.get('region_area_km2'));


      var snowPctValid = ee.Algorithms.If(
        validKm2.gt(0),
        snowKm2.divide(validKm2).multiply(100),
        null
      );


      var snowPctRegion = ee.Algorithms.If(
        regionKm2.gt(0),
        snowKm2.divide(regionKm2).multiply(100),
        null
      );


      var validCoveragePct = ee.Algorithms.If(
        regionKm2.gt(0),
        validKm2.divide(regionKm2).multiply(100),
        null
      );


      // Return attribute-only feature.
      return ee.Feature(null, {

        composite_start: img.get('composite_start'),
        composite_mid: img.get('composite_mid'),

        year: img.get('year'),
        month: img.get('month'),
        doy: img.get('doy'),

        season: img.get('season'),
        season_year: img.get('season_year'),
        snow_year: img.get('snow_year'),

        region_group: f.get('region_group'),
        region_id: f.get('region_id'),
        region_name: f.get('region_name'),

        region_source: f.get('region_source'),
        region_notes: f.get('region_notes'),

        region_area_km2: regionKm2,

        snow_km2: snowKm2,
        valid_km2: validKm2,

        snow_fraction_valid_pct: snowPctValid,
        snow_fraction_region_pct: snowPctRegion,
        valid_coverage_pct: validCoveragePct,

        source_dataset: img.get('source_dataset'),
        native_scale_m: img.get('native_scale_m'),
        analysis_scale_m: img.get('analysis_scale_m')
      });

    });

  });


  return ee.FeatureCollection(fcList).flatten();
}


// ============================================================================
// 11. BUILD THREE EXPORT TABLES
// ============================================================================

var coreTimeSeries =
    extractTimeSeries(coreRegions);

var countryTimeSeries =
    extractTimeSeries(countryRegions);

var hydroL3TimeSeries =
    extractTimeSeries(hydroL3Regions);


// ============================================================================
// 12. EXPORT COLUMN ORDER
// ============================================================================

var selectors = [

  'composite_start',
  'composite_mid',

  'year',
  'month',
  'doy',

  'season',
  'season_year',
  'snow_year',

  'region_group',
  'region_id',
  'region_name',

  'region_source',
  'region_notes',

  'region_area_km2',

  'snow_km2',
  'valid_km2',

  'snow_fraction_valid_pct',
  'snow_fraction_region_pct',
  'valid_coverage_pct',

  'source_dataset',
  'native_scale_m',
  'analysis_scale_m'
];


// ============================================================================
// 13. EXPORT 1 — WHOLE REGION + MOUNTAIN SECTORS
// ============================================================================
//
// RUN THIS FIRST.
//
// This alone is enough to build the first article-quality overview figures.
//
// ============================================================================

Export.table.toDrive({

  collection: coreTimeSeries,

  description:
    'TP_MOD10A2_8day_CORE_2000_2026_2km',

  folder:
    CFG.DRIVE_FOLDER,

  fileNamePrefix:
    'tp_mod10a2_8day_core_2000_2026_2km',

  fileFormat: 'CSV',

  selectors: selectors
});


// ============================================================================
// 14. EXPORT 2 — COUNTRY × THIRD-POLE INTERSECTIONS
// ============================================================================
//
// RUN SECOND.
//
// ============================================================================

Export.table.toDrive({

  collection: countryTimeSeries,

  description:
    'TP_MOD10A2_8day_COUNTRIES_2000_2026_2km',

  folder:
    CFG.DRIVE_FOLDER,

  fileNamePrefix:
    'tp_mod10a2_8day_countries_2000_2026_2km',

  fileFormat: 'CSV',

  selectors: selectors
});


// ============================================================================
// 15. EXPORT 3 — HYDROBASINS LEVEL 3
// ============================================================================
//
// RUN THIRD.
//
// This may take noticeably longer than the first two.
//
// If we only want the first article figures immediately,
// leave this task unstarted until the first two have finished.
//
// ============================================================================

Export.table.toDrive({

  collection: hydroL3TimeSeries,

  description:
    'TP_MOD10A2_8day_HYDROBASINS_L3_2000_2026_2km',

  folder:
    CFG.DRIVE_FOLDER,

  fileNamePrefix:
    'tp_mod10a2_8day_hydrobasins_l3_2000_2026_2km',

  fileFormat: 'CSV',

  selectors: selectors
});


// ============================================================================
// 16. OPTIONAL REGION METADATA EXPORT
// ============================================================================
//
// Handy QC table.
// Does not contain the complete geometries.
//
// ============================================================================

var allRegionMetadata = coreRegions
  .merge(countryRegions)
  .merge(hydroL3Regions)
  .map(function(f) {
    return ee.Feature(null, f.toDictionary());
  });


Export.table.toDrive({

  collection: allRegionMetadata,

  description:
    'TP_SNOW_REGION_METADATA',

  folder:
    CFG.DRIVE_FOLDER,

  fileNamePrefix:
    'tp_snow_region_metadata',

  fileFormat: 'CSV'
});


// ============================================================================
// 17. CONSOLE QC — KEEP SMALL
// ============================================================================

print('============================================================');
print('THIRD POLE / HKH MODIS SNOW MVP');
print('============================================================');

print('Analysis scale (m):', CFG.SCALE_M);

print('MOD10A2 number of 8-day composites:',
      modisRaw.size());

print('First MOD10A2 date:',
      ee.Image(modisRaw.sort('system:time_start').first())
        .date()
        .format('YYYY-MM-dd'));

print('Latest available MOD10A2 composite start:',
      ee.Image(modisRaw.sort('system:time_start', false).first())
        .date()
        .format('YYYY-MM-dd'));

print('Core regions:',
      coreRegions.size());

print('Country regions:',
      countryRegions.size());

print('HydroBASINS L3 regions:',
      hydroL3Regions.size());

print('Country names found:',
      countryRegions.aggregate_array('region_name'));

print('Sample prepared image:',
      snowPrepared.first());

print('Sample CORE rows:',
      coreTimeSeries.limit(10));


// ============================================================================
// 18. MAP QC ONLY — NO RASTER EXPORTS YET
// ============================================================================

Map.centerObject(studyGeom, 4);


// Study-domain boundary.
var studyOutline = ee.Image()
  .byte()
  .paint({
    featureCollection: ee.FeatureCollection([
      ee.Feature(studyGeom)
    ]),
    color: 1,
    width: 2
  });

Map.addLayer(
  studyOutline,
  {palette: ['ff0000']},
  'Third Pole / HKH analysis boundary',
  true
);


// Mountain-sector outlines.
var sectorOutline = ee.Image()
  .byte()
  .paint({
    featureCollection: mountainSectors,
    color: 1,
    width: 1
  });

Map.addLayer(
  sectorOutline,
  {palette: ['ffcc00']},
  'Mountain sectors',
  false
);


// Country intersections.
var countryOutline = ee.Image()
  .byte()
  .paint({
    featureCollection: countryRegions,
    color: 1,
    width: 1
  });

Map.addLayer(
  countryOutline,
  {palette: ['00ffff']},
  'Country intersections',
  false
);


// HydroBASINS L3.
var hydroOutline = ee.Image()
  .byte()
  .paint({
    featureCollection: hydroL3Regions,
    color: 1,
    width: 1
  });

Map.addLayer(
  hydroOutline,
  {palette: ['00ff00']},
  'HydroBASINS L3',
  false
);


// Latest MOD10A2 binary clear-land snow/no-snow map.
var latestRaw = ee.Image(
  modisRaw.sort('system:time_start', false).first()
);

var latestClass =
    latestRaw.select('Maximum_Snow_Extent');

var latestValid =
    latestClass.eq(25).or(latestClass.eq(200));

var latestBinary =
    latestClass.eq(200)
      .updateMask(latestValid)
      .clip(studyGeom);


Map.addLayer(
  latestBinary,
  {
    min: 0,
    max: 1,
    palette: [
      '333333',  // valid no snow
      'ffffff'   // snow
    ]
  },
  'Latest MOD10A2 binary snow: 0/1',
  true
);


// ============================================================================
// END
// ============================================================================