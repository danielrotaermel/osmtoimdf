# /bin/bash
# turns geojson plygon to a compatible format to use as a boundingbox with overpass queries
# to edit the boundingbox simply open/copy ./boundingbox.json into http://geojson.io/#map=15/48.4227/9.9461

BASEDIR=$(dirname "$0")
cd $BASEDIR

cat boundingbox.json | jq '.features[0].geometry.coordinates | map("\(.[1]) \(.[0])") | join(" ")'