var imageCollection = ee.ImageCollection("NASA/GIMMS/3GV0");
print(imageCollection);

var years = ee.List.sequence(1981, 2020);
var months = ee.List.sequence(1, 12);

var map_m = function(i) {
  i = ee.Number(i);
  var filtered_col = years.map(function(j) {
    var filtered = imageCollection
        .filter(ee.Filter.calendarRange(i, i, 'month'))
        .filter(ee.Filter.calendarRange(j, j, 'year'))
        .select(0)
        .sum();
    return filtered;
  });
  return filtered_col;
};

var img_col = ee.ImageCollection(months.map(map_m).flatten());

print(img_col);

var checkImage = ee.Image(img_col.filter(ee.Filter.eq('system:index', '10')).first());
Map.addLayer(checkImage, {min:-1,max:1}, 'test');

