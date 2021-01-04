# osmtoimdf

This project turns Openstreetmap XML into [Indoor Mapping Data Format (IMDF)](https://register.apple.com/resources/imdf/).
The generated IMDF archive can be used with Apples Mapkit. Here is [sample code](https://developer.apple.com/documentation/mapkit/displaying_an_indoor_map) from Apple.

Disclaimer: certainly this conversion is not straight forward but this project should be a starting point. There is still manual mapping to do.

# Usage

First clone this repository

```
git clone https://github.com/danielrotaermel/osmtoimdf.git && cd osmtoimdf
```

Install dependencies

```
npm install
```



To gather the features used to generate the IMDF archive you will have to write some overpass queries.

- Start by creating a bounding box for the queries. You can use http://geojson.io for reference see [here](https://github.com/danielrotaermel/osmtoimdf/tree/master/overpass-queries/boundingbox). 
  Use this [script](https://github.com/danielrotaermel/osmtoimdf/blob/master/overpass-queries/boundingbox/formatBoundingBoxForOverpass.sh) to quickly format the GeoJSON to use with overpass).

- Edit the [samples](https://github.com/danielrotaermel/osmtoimdf/tree/master/overpass-queries/queries) with [overpass-turbo.eu](https://overpass-turbo.eu). The queries should gather features according to the [IMDF Feature Types](https://register.apple.com/resources/imdf/#feature-types). 

- After you created all you queries you can run the [runQueries.sh](https://github.com/danielrotaermel/osmtoimdf/blob/master/overpass-queries/runQueries.sh) script to download the OSM XMLs.

- Edit the file in the directory [./overpass-queries/manual-data](https://github.com/danielrotaermel/osmtoimdf/tree/master/overpass-queries/manual-data) to fit your venue.

- Edit [./osmtoimdf.js](https://github.com/danielrotaermel/osmtoimdf/blob/master/osmtoimdf.js) to map osm attributes to IMDF attributes.

- run the conversion

  ```
  npm run start
  ```

If you want to add custom categories etc. do so in the ./imdf-model directory for example right here [./imdf-model/category-extended.js](https://github.com/danielrotaermel/osmtoimdf/blob/master/imdf-model/category-extended.js)