# /bin/bash

BASEDIR=$(dirname "$0")
cd $BASEDIR

mkdir -p ./osm-data
mkdir -p ./geojson-data

rm ./osm-data/*
rm ./geojson-data/*

for f in queries/*.overpassql
do
    filename=$(basename -- "$f")
    extension="${filename##*.}"
    filename="${filename%.*}"
    
    echo "getting $f"
    wget --retry-on-http-error=429 --waitretry=5 --tries=2 \
        -O osm-data/$filename.xml --post-file=$f "http://overpass-api.de/api/interpreter"
    echo "converting $f"
    osmtogeojson -e osm-data/$filename.xml > geojson-data/$filename.json
done

# echo "copying manualy created data"
# for f in manual-data/*.{json,geojson}
# do  
#     echo "    $f"
#     cp $f "./geojson-data/"
# done



