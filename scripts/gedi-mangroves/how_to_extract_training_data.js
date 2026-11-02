var classes = ee.Image("MODIS/051/MCD12Q1/2013_01_01").select(0).rename("class")
var samples = classes.stratifiedSample({
  numPoints: 100, 
  classBand: "class", 
  region: ee.Geometry.Polygon([[[-73, 42],[-73, 41],[-72, 41],[-72, 42]]]), 
  scale: 1000,
  geometries: true,
})

// Colorize the samples according to the modis palette.
var palette = ee.List(classes.get('Land_Cover_Type_1_class_palette'))
var values = ee.List(classes.get('Land_Cover_Type_1_class_values'))
samples = samples.map(function(f) {
  var value = f.get('class')
  var index = values.indexOf(value)
  var color = palette.get(index)
  return f.set({style: {color: color}})
})

print(samples)
print(values)

Map.addLayer(samples.style({styleProperty: 'style'}))
