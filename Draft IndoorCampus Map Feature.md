# Draft: Indoor/Campus Map Feature



https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging



How we will create custom indoor/campus maps

we will use the imdf spec therefore we have to convert openstreetmap data to imdf

https://register.apple.com/resources/imdf/

https://register.apple.com/resources/indoor/Apple-Indoor-Maps-Guidelines.pdf



## TODO

- [ ] think through how to apply learned for whole campus

  IDEA: combine all connected buildings into one

- [ ] Finish converter



## convert osm to imdf

### Converter

possible dependencies

- faster conversion https://github.com/tibetty/osm2geojson-lite

- can directly call overpass https://github.com/aspectumapp/osm2geojson

- used by overpass-turbo https://github.com/tyrasd/osmtogeojson

- style https://github.com/mapbox/geojson-mapnikify

- Style https://github.com/mapbox/simplestyle-spec

- style https://github.com/mapbox/simplestyle-spec/wiki/Implementations

- https://github.com/mapbox/polylabel

- https://github.com/mapbox/geojson-summary

- https://github.com/mapbox/geojson-rewind

- https://github.com/mapbox/geojson-merge

- https://github.com/derhuerst/query-overpass

- https://github.com/uuidjs/uuid

- https://github.com/koopjs/winnow

  use this to clean up feature collections

  and to initialy filter features

- https://project-awesome.org/tmcw/awesome-geojson



Overpass Queries

- https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#Recurse_.28n.2C_w.2C_r.2C_bn.2C_bw.2C_br.29
- https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_API_by_Example#Find_all_bus_stops_which_are_not_included_in_a_relation
- https://dev.overpass-api.de/overpass-doc/de/criteria/per_tag.html

GDAL python

https://github.com/toblerity/fiona

## OpenStreetMap Mapping

How to create Buildings on OpenStreetMap

- https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging
- https://wiki.openstreetmap.org/wiki/Guidelines_for_pedestrian_navigation
- https://wiki.openstreetmap.org/wiki/Simple_3D_buildings
- https://wiki.openstreetmap.org/wiki/Talk:Key:building#Corridor_between_buildings.3F

Reference

- https://www.google.com/maps/place/Ulm+University/@48.4219814,9.9580924,176a,35y,324.5h,33.64t/data=!3m1!1e3!4m5!3m4!1s0x479965bb7b2319ef:0xd90440363169f4ad!8m2!3d48.4222305!4d9.955582





convert imdf to osm with if needed https://github.com/STEMLab/IN2OSM





Further notes

tutorials

https://www.raywenderlich.com/9697133-advanced-mapkit-tutorial-custom-mapkit-tiles

https://cloud.maptiler.com/maps/streets/

https://www.raywenderlich.com/12690970-indoor-maps-on-ios-advanced-mapkit



javascript

https://www.digitalocean.com/community/tutorials/understanding-the-event-loop-callbacks-promises-and-async-await-in-javascript#async-functions-with-asyncawait

