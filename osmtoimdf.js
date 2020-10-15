// const queryOverpass = require('@derhuerst/query-overpass')
const assert = require('assert');
const polylabel = require('polylabel');
const turf = require('@turf/turf')
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const child_process = require("child_process");
const trash = require('trash');
const xmldom = new (require('xmldom').DOMParser)();
const osmtogeojson = require('osmtogeojson');
const { v4: uuidv4 } = require('uuid');
const open = require('open');

const pathToQueries = path.join(__dirname + '/overpass-queries/queries/');
const pathToOsmData = path.join(__dirname + '/overpass-queries/osm-data/');
const pathToGeoJsonData = path.join(__dirname + '/overpass-queries/geojson-data/');
const pathToIMDFArchive = path.join(__dirname + '/IMDFData/');
const pathToIMDFArchiveZip = path.join(__dirname + '');
const runQueries = './overpass-queries/runQueries.sh';

const ADRESS = "address"
const AMENITY = "amenity"
const ANCHOR = "anchor"
const BUILDING = "building"
const DETAIL = "detail"
const FIXTURE = "fixture"
const FOOTPRINT = "footprint"
const GEOFENCE = "geofence"
const KIOSK = "kiosk"
const LEVEL = "level"
const OCCUPANT = "occupant"
const OPENING = "opening"
const RELATIONSHIP = "relationship"
const SECTION = "section"
const UNIT = "unit"

// styling convention https://github.com/mapbox/simplestyle-spec/tree/master/1.1.0
var styleProperties = {
    // OPTIONAL: default "medium"
    // specify the size of the marker. sizes
    // can be different pixel sizes in different
    // implementations
    // Value must be one of
    // "small"
    // "medium"
    // "large"
    "marker-size": "medium",

    // OPTIONAL: default ""
    // a symbol to position in the center of this icon
    // if not provided or "", no symbol is overlaid
    // and only the marker is shown
    // Allowed values include
    // - Icon ID
    // - An integer 0 through 9
    // - A lowercase character "a" through "z"
    "marker-symbol": "bus",

    // OPTIONAL: default "7e7e7e"
    // the marker's color
    //
    // value must follow COLOR RULES
    "marker-color": "#fff",

    // OPTIONAL: default "555555"
    // the color of a line as part of a polygon, polyline, or
    // multigeometry
    //
    // value must follow COLOR RULES
    "stroke": "#555555",

    // OPTIONAL: default 1.0
    // the opacity of the line component of a polygon, polyline, or
    // multigeometry
    //
    // value must be a floating point number greater than or equal to
    // zero and less or equal to than one
    "stroke-opacity": 1.0,

    // OPTIONAL: default 2
    // the width of the line component of a polygon, polyline, or
    // multigeometry
    //
    // value must be a floating point number greater than or equal to 0
    "stroke-width": 2,

    // OPTIONAL: default "555555"
    // the color of the interior of a polygon
    //
    // value must follow COLOR RULES
    "fill": "#555555",

    // OPTIONAL: default 0.6
    // the opacity of the interior of a polygon. Implementations
    // may choose to set this to 0 for line features.
    //
    // value must be a floating point number greater than or equal to
    // zero and less or equal to than one
    "fill-opacity": 0.5
}

// get geojson from overpass
// execute(runQueries);

const DEBUG = true

run().catch(err => console.log(err));

async function run() {
    // let queries = await readFiles(pathToQueries)
    // console.log(queries);

    // // clear dir
    // await trash(['overpass-queries/osm-data/*.json']);

    // let osmData = []

    // for (const q of queries) {
    //     assert(q.content.includes("[out:json]"), `${q.fileName} query was missing [out:json] output should be json`);

    //     let osmresponse = await queryOverpass(q.content)
    //     fs.writeFileSync(path.join(pathToOsmData,q.fileName + ".json"), JSON.stringify(osmresponse, null, 2));

    //     osmData.push(
    //         {   
    //             query: q,
    //             data:  osmresponse
    //         }
    //     )
    // }
    
    // clear dir
    await trash(['/IMDFData/*']);
    

    if (DEBUG) {
        // read geojson directly from overpass-queries/geojson-data useful to debug the transformation
        featureCollections = {}
        let geojsonFiles = await readFiles(pathToGeoJsonData);

        for (const file of geojsonFiles) {
                var geojson = JSON.parse(file.content);
                const collectionSource = file.fileName.split(".")[0]

                geojson = runTransformations(geojson, collectionSource)
                featureCollections[collectionSource] = geojson
        }
    } else {
        // convert from osm
        let osmFiles = await readFiles(pathToOsmData);

        var featureCollections = {}

        // read xml files convert to geojson and transform according to imdf
        for (const osm of osmFiles) {
                var geojson = osmtogeojson(xmldom.parseFromString(osm.content), {flatProperties: false});
                const collectionSource = osm.fileName.split(".")[0]

                geojson = runTransformations(geojson, collectionSource)

                featureCollections[collectionSource] = geojson
        }
    }
    
    // sort units for correct display
    if ("unit" in featureCollections) {

        const sortByRoomtype = {
          corridor  : 0, 
          area : 1,
          room  : 2, 
          yes  : 3, 
          undefined : 4
        }

        featureCollections.unit.features = featureCollections.unit.features.sort(
          (a, b) => sortByRoomtype[a.properties.tags.indoor] - sortByRoomtype[b.properties.tags.indoor]
        )
    }

    

    // generate id references across imdf archive
    generateReferences(featureCollections)

    // generate doors
    if ("opening" in featureCollections) {
        generateDoors(featureCollections.opening, featureCollections.unit)
    }
    
    // create imdf directory
    if (!fs.existsSync(pathToIMDFArchive)) {
        fs.mkdirSync(pathToIMDFArchive, 0744);
    }

    // write out feature collections to imdf archive
    for (const [collectionName, featureCollection] of Object.entries(featureCollections)) {
        // console.log(`${key}: ${value}`);
        var geoJsonString = JSON.stringify(featureCollection, undefined, 2); 
        fs.writeFileSync(path.join(pathToIMDFArchive,collectionName + ".json"), geoJsonString);
    }

    // zip the imdf archive
    console.log("INFO: created zip at " + pathToIMDFArchive.slice(0, -1)  + ".zip");
    console.log("INFO: validate zip here https://register.apple.com/indoor/imdf-sandbox");
    execute(`zip -r "${path.basename(pathToIMDFArchive)}" "${pathToIMDFArchive}"`);

    // try data on apple imdf sandbox
    // await open('https://register.apple.com/indoor/imdf-sandbox');
    // await open(pathToIMDFArchive + "zip", {app: 'finder'});

    // // clear dir
    // await trash(['overpass-queries/geojson-data/*.geojson']);
    
    // const osmtogeojson = require('osmtogeojson');

    // let geoJsonCollections = []

    // for (const osm of osmData) {
    //     var geojson = osmtogeojson(osm.data, {flatProperties: false});
    //     geoJsonCollections.push(geojson)
    //     console.log(geojson);
    //     let osmresponse = await queryOverpass(q.content)
    //     fs.writeFileSync(path.join(pathToGeoJsonData,q.fileName + ".geojson"), JSON.stringify(geojson, null, 2));

    // }

    // var osmdata = await Promise.all(queries.map(async (query) =>  {
    //     return queryOverpass(queries.content)
    // })
    // )
    // console.log(osmdata);

    // let osmData =  await queryOverpass(`
    // [out:json][timeout:25];
    // node(3378340880);
    // out body;
    // `)
    // console.log(osmData);
//   let files = await fetch('/article/promise-chaining/user.json');
//   let user = await response.json();
  
}


function runTransformations(featureCollection, collectionSource) {
    console.log("INFO: Transforming " + collectionSource);
    featureCollection.name = collectionSource

    // console.log(getTagsAndTheirPossibleValues(featureCollection, false));
    
    // general transformations
    featureCollection.features.forEach(function(f) {
        // osmId based on a features "type/id"
        f.properties.osmId = f.properties.type + "/" + f.properties.id;
        // customId based on imdfFeatureType/osmid is used for creating a final uuid
        f.properties.customId = featureCollection.name + "/" + f.properties.osmId;
        // generate a uuid based on customId
        f.id = uuidv4(f.properties.customId);

        f.feature_type = collectionSource

        if (f.geometry.type === "Multipoligon" || f.geometry.type === "Polygon") {
            f.properties._area = turf.area(f.geometry)
        }
    });
    
    // explode features that are present on multiple layers e.g. elevators (level="0;1;2;3;4;5) 
    // https://www.openstreetmap.org/way/374438979
    featureCollection.features.forEach(function(f, index, arr) {        
        if ("level" in f.properties.tags && f.properties.tags.level.includes(";")) {
            // extract features that are on multiple floors
            let levels = f.properties.tags.level
            // create a correlation_id 
            const correlation_id = uuidv4(levels + "/" + f.properties.osmId)
            levels.split(";").forEach(level => {
                 // deep copy
                let newFeature = JSON.parse(JSON.stringify(f));
                newFeature.properties.correlation_id = correlation_id
                newFeature.properties.tags.level = level
                // update id
                newFeature.properties.customId = level + "/" + newFeature.properties.customId;
                newFeature.id = uuidv4(newFeature.customId);
                featureCollection.features.push(newFeature)
            });
        }
    });

    // remove features with (level="0;1;2;3;4;5)
    featureCollection.features = featureCollection.features.filter(f => !
        ("level" in f.properties.tags && f.properties.tags.level.includes(";")));

    featureCollection.features.forEach(function(f) {
        const props = f.properties
        const tags = f.properties.tags
        const geom = f.geometry
        const featureType = f.feature_type

        // TODO: create displaypoints for Building Fixture Geofence Kiosk Opening Level Section Unit Venue
        switch (featureType) {
            case ADRESS : 
                break;
            case AMENITY : 
                // console.log(getTagsAndTheirPossibleValues(featureCollection, true));
                // console.log(tags);

                // set default values
                f.properties.name = null
                f.properties.alt_name = null
                f.properties.category = "unspecified"
                
                if ("name" in tags && "ref" in tags) {
                    f.properties.name = { en: tags.name }
                    f.properties.alt_name = { en: tags.ref }
                } else if ("ref" in tags) {
                    f.properties.name = { en: tags.ref }
                }

                if (tags.indoor === "room") f.properties.category = "room"
                if (tags.indoor === "corridor") f.properties.category = "walkway"
                if (tags.indoor === "yes") f.properties.category = "room"

                if (tags.wheelchair === "yes") f.properties.accessibility = "wheelchair"

                if (tags.highway === "elevator") {
                    f.properties.category = "elevator"
                    f.properties.name = { en: "Elevator", de: "Aufzug" }
                }

                if (tags.amenity === "toilets") {
                    f.properties.category = "restroom"
                    f.properties.name = { en: "Restroom", de: "Toilette" }
                }

                if (tags.male === "yes") {
                    f.properties.category = "restroom.male"
                    f.properties.name = { en: "Male Restroom", de: "Herrentoilette" }
                }

                if (tags.female === "yes") {
                    f.properties.category = "restroom.female"
                    f.properties.name = { en: "Female Restroom", de: "Damentoilette" }
                }

                if (tags.unisex === "yes") {
                    f.properties.category = "restroom.unisex"
                    f.properties.name = { en: "Unisex Restroom", de: "Unisex-Toilette" }

                }

                if (tags.stairs === "yes") {
                    f.properties.category = "stairs"
                    f.properties.name = { en: "Stairs", de: "Treppe" }

                }

                // turn every non point geometry to a point inside the polygon
                if (geom.type !== "Point") {
                    f.geometry = {
                        type: "Point",
                        coordinates: polylabel(geom.coordinates, 1.0)
                    }
                }




                break;
            case ANCHOR : 
                break;
            case BUILDING : 

                f.properties.category = categories.unspecified

                if ("name" in tags) {
                    f.properties.name = {
                        en: tags.name
                    }
                } else if ("ref" in tags) {
                    f.properties.name = tags.ref
                }

                if ("alt_name:en" in tags) {
                    f.properties.alt_name["en"] = tags["alt_name:en"]
                }
                
                if ("alt_name" in tags) {
                    f.properties.alt_name["de"] = tags.alt_name
                }

                f.properties.display_point = {
                    type: "Point",
                    coordinates: polylabel(f.geometry.coordinates, 1.0)
                }

                f.geometry = null
                f.properties.address_id = null

                break;
            case DETAIL : 
                break;
            case FIXTURE : 
                break;
            case FOOTPRINT : 
                // TODO: generate footprints from building outlines by converting multipolygons to polygons (only keep first in geom array https://turfjs.org/docs/#flatten)
                // use turf https://turfjs.org/docs/#dissolve or https://turfjs.org/docs/#union to merge the resulting poligons
                break;
            case GEOFENCE : 
                // https://register.apple.com/resources/imdf/Glossary/#geofence
                break;
            case KIOSK : 
                break;
            case LEVEL : 
                f.properties.restriction = null
                f.properties.category = "unspecified"
                f.properties.outdoor = false
                f.properties.ordinal = parseInt(f.properties.tags.level)
                f.properties.name = { en: f.properties.tags.name }
                f.properties.short_name = { en: f.properties.tags.level }



                
                break;
            case OCCUPANT : 
                break;
            case OPENING : 
                f.properties.category = "pedestrian"
                f.properties.accessibility = null
                f.properties.access_control = null
                f.properties.door = null
                f.properties.name = null
                f.properties.alt_name = null
                f.properties.display_point = null
                
                break;
            case RELATIONSHIP : 
                break;
            case SECTION : 
                break;
            case UNIT : 
                
                // var newProperties = {
                //     name: "name" in tags ? { en: tags.name } : { en: tags.ref },
                //     name: "ref" in tags ? { en: tags.ref } : "",
                //     alt_name: f.properties.tags.name !== undefined ? { en: f.properties.tags.name } : ""
                // }
                
                if ("name" in tags && "ref" in tags) {
                    f.properties.name = { en: tags.name }
                    f.properties.alt_name = { en: tags.ref }
                } else if ("ref" in tags) {
                    f.properties.name = { en: tags.ref }
                }

                if (tags.indoor === "room") f.properties.category = "room"
                if (tags.indoor === "corridor") f.properties.category = "walkway"
                if (tags.indoor === "yes") f.properties.category = "room"

                if (tags.wheelchair === "yes") f.properties.accessibility = "Wheelchair"

                if (tags.highway === "elevator") {
                    f.properties.category = "elevator"
                    f.properties.name = { en: "Elevator", de: "Aufzug" }
                }

                if (tags.amenity === "toilets") {
                    f.properties.category = "restroom"
                    f.properties.name = { en: "Restroom", de: "Toilette" }
                }

                if (tags.male === "yes") {
                    f.properties.category = "restroom.male"
                    f.properties.name = { en: "Male Restroom", de: "Herrentoilette" }
                }

                if (tags.female === "yes") {
                    f.properties.category = "restroom.female"
                    f.properties.name = { en: "Female Restroom", de: "Damentoilette" }
                }

                if (tags.unisex === "yes") {
                    f.properties.category = "restroom.unisex"
                    f.properties.name = { en: "Unisex Restroom", de: "Unisex-Toilette" }

                }

                if (tags.stairs === "yes") {
                    f.properties.category = "stairs"
                    f.properties.name = { en: "Stairs", de: "Treppe" }

                }

                if (tags.stairs === "yes") {
                    f.properties.category = "stairs"
                    f.properties.name = { en: "Stairs", de: "Treppe" }

                }

                break;
            case VENUE : 
                break;
            default:
                break;
        }

    });
    
    return featureCollection
}

function generateDoors(doors, units) {
    // deep copy
    // let _doorFC = JSON.parse(JSON.stringify(doorPointsFC));
    // let _wallFC = JSON.parse(JSON.stringify(intersectingWallsFC));

    // featureCollection.features = featureCollection.features.filter(f => {
    // });

    doors.features.forEach(door => {  
        // if (!"level" in door.properties.tags) {
        //     return
        // }
        
        units.features.forEach(unit => {
            // if (door.properties.tags.level === unit.properties.tags.level ) {}
            if ("ref" in door.properties.tags && "ref" in unit.properties.tags && door.properties.tags.ref === unit.properties.tags.ref) {
                //   replace geometry with an intersecting unit
                // create a circle
                var center = door.geometry.coordinates;
                    var radius = 0.6/1000;
                    var options = {steps: 5 ,units: 'kilometers'};
                    var circle = turf.circle(center, radius, options);                    
                    // find intersection of units and circles
                    let intersections = turf.lineIntersect(unit, circle);
                    // check that there are only 2 intersections
                    if (intersections.features.length !== 2) { return }
                    // replace door geometry with the intersections as a linestring
                    door.geometry = { 
                        type: "LineString",
                        coordinates: intersections.features.map(f => { return f.geometry.coordinates})
                    }
                }
            })
        
    });

    // remove feature that's not a linestring
    doors.features = doors.features.filter(f => f.geometry.type === "LineString" );

    // TODO: generate doors 
    // problem doors are points in the context of openstreetmap which is a strange decision in my opinion
    // therefore we need to turn door points to paths
    // solution a: @turf/along
        // what about doors that are not directly on a line or a corner
        // https://turfjs.org/docs/#nearestPointOnLine
    // solution b: draw circle around door point and cut wall that resides inside
        // works with corners and even if point is not directly on wall
        // https://turfjs.org/docs/#circle
        // directly output line intersect https://turfjs.org/docs/#lineIntersect
        // create intersectiong points
            // https://turfjs.org/docs/#lineSplit
            // https://turfjs.org/docs/#lineSlice
            // combine points to door https://turfjs.org/docs/#combine


}

function generateReferences(featureCollections) {
    
    // get all building_id
    var buildingIds = featureCollections.building.features.map(f => ({ buildingId: f.id}));
    
    // add building_id to levels, footprint
    featureCollections.level.features.forEach(f => {
        f.building_id = buildingIds[0].buildingId
    });

    // get all level_id 
    var levelIds = featureCollections.level.features.map(f => ({ id: f.id, level: f.properties.tags.level}));

    // add level ids to units, fixtures, openings and details
    if ("unit" in featureCollections) {
        featureCollections.unit.features.forEach(f => {
            levelIds.forEach(levelId => {
                if (f.properties.tags.level === levelId.level) {
                    f.properties.level_id = levelId.id
                }
            });
        });
    }

    // add level ids to units, fixtures and details
    if ("opening" in featureCollections) {
        featureCollections.opening.features.forEach(f => {
            levelIds.forEach(levelId => {
                if (f.properties.tags.level === levelId.level) {
                    f.properties.level_id = levelId.id
                }
            });
        });
    }
    

    // IDEA: on device routing
    // https://turfjs.org/docs/#shortestPath

    // TODO: cleanup features
    // https://turfjs.org/docs/#cleanCoords
    
    
    setCorrelatingBuildingIds(featureCollections.level, featureCollections.building)

    // correlate amenities with units and set the unit_id
    if ("amenity" in featureCollections) {
        setCorrelatingUnitIds(featureCollections.amenity, featureCollections.unit)
    }

    // correlate amenities with units and set the unit_id
    if ("anchor" in featureCollections) {
        setCorrelatingUnitIds(featureCollections.anchor, featureCollections.unit)
    }

    // featureCollections.amenity.features.forEach(amenity => {
    //     amenity.properties.unit_ids = []
    //     // hacky but I'm tired
    //     let smallestArea = Number.MAX_VALUE
    //     featureCollections.unit.features.forEach(unit => {
    //         // if (amenity.properties.osmId === unit.properties.osmId) {
    //         //     amenity.properties.unit_ids.push(unit.id)
    //         // }
    //         // else 
    //         // unit and amenity should share the same level
    //         if (amenity.properties.tags.level === unit.properties.tags.level ) {
    //             if (turf.booleanPointInPolygon(amenity, unit)) {
    //                 // if unit is smaller than the last found one
    //                 if (unit.properties._area < smallestArea) {
    //                     smallestArea = unit.properties._area
    //                     amenity.properties.unit_ids = [unit.id]
    //                 }
    //             }
    //         }
    //     });      
        
    //     if (amenity.properties.unit_ids.length == 0 ) {
    //         amenity.properties.unit_ids = null
    //         console.log("INFO: found amenity without unit_ids: " + amenity.properties.osmId)
    //         console.log(amenity.properties.tags)
    //     }
    // });


    // find all amenities that occupy more then one floor
    // add correlation_id to these amenities e.g. elevators


    // do the same for every anchor
    // add anchor_id to occupants, fixtures and kiosks




    /*
    IDEA: create an app that helps you to create an imdf archive
    start by selecting a venue outline drawn or selected
    
    get geojson data from openstreetmap
    select which features should be transformed to their imdf counterpart
     */

    

    // // write out feature collections
    // for (const [collectionName, featureCollection] of Object.entries(featureCollections)) {
    // // do something with each collection
    // }

    // featureCollection.features.forEach(function(f) {
        // create references according to imdf

    // })
}

function validateIMDF(params) {
    assert("manifest.json" in featureCollections, "manifest.json missing")
    assert("venue" in featureCollections, "venue missing")
    assert("footprint" in featureCollections, "footprint missing")
    assert("building" in featureCollections, "building missing")
    assert("level" in featureCollections, "level missing")
    assert("unit" in featureCollections, "unit missing")
    assert("anchor" in featureCollections, "anchor missing")
    assert("amenity" in featureCollections, "amenity missing")
    assert("occupant" in featureCollections, "occupant missing")
}

function setCorrelatingUnitIds(targetCollection, unitCollection) {
    // TODO: finish this 
    //  correlate amenities or anchors with units and set the unit_id
    // problem no easy way to find where amenities reside in

    // solution a
        // get all amenities that were generated from units (type==way)
            // create a unit_id based on type==way and .properties.id
        // get all amenities that are not generated from units (type!=way)
            // find corresponding unit they reside in

    // solution b
        // get all units of a level
        // get all amenities of a level
        // use const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').featureEach,
        // turf.booleanPointInPolygon(pt, poly);
        // to find a unit for each amenity point

    // solution c
    // combination of both

    targetCollection.features.forEach(amenity => {
        amenity.properties.unit_ids = []
        // hacky but I'm tired
        let smallestArea = Number.MAX_VALUE
        unitCollection.features.forEach(unit => {
            // if (amenity.properties.osmId === unit.properties.osmId) {
            //     amenity.properties.unit_ids.push(unit.id)
            // }
            // else 
            // unit and amenity should share the same level
            if (amenity.properties.tags.level === unit.properties.tags.level ) {
                if (turf.booleanPointInPolygon(amenity, unit)) {
                    // if unit is smaller than the last found one
                    if (unit.properties._area < smallestArea) {
                        smallestArea = unit.properties._area
                        amenity.properties.unit_ids = [unit.id]
                    }
                }
            }
        });      

        if (amenity.properties.unit_ids.length == 0 ) {
            amenity.properties.unit_ids = null
            console.log("INFO: found amenity without unit_ids: " + amenity.properties.osmId)
            console.log(amenity.properties.tags)
        }
    });

}

function setCorrelatingBuildingIds(targetCollection, buildingCollection) {
    // TODO: finish this 
    //  correlate amenities or anchors with units and set the unit_id
    // problem no easy way to find where amenities reside in

    // solution a
        // get all amenities that were generated from units (type==way)
            // create a unit_id based on type==way and .properties.id
        // get all amenities that are not generated from units (type!=way)
            // find corresponding unit they reside in

    // solution b
        // get all units of a level
        // get all amenities of a level
        // use const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').featureEach,
        // turf.booleanPointInPolygon(pt, poly);
        // to find a unit for each amenity point

    // solution c
    // combination of both

    targetCollection.features.forEach(level => {
        level.properties.building_ids = []
        // hacky but I'm tired
        let smallestArea = Number.MAX_VALUE
        buildingCollection.features.forEach(building => {
            level.properties.building_ids = [building.id]
                if (turf.booleanOverlap(turf.flatten(level), turf.flatten(building))) {
                // if (turf.booleanContains(level, building)) {
                    // if unit is smaller than the last found one
                    if (building.properties._area < smallestArea) {
                        smallestArea = building.properties._area
                        level.properties.building_ids = [building.id]
                    }
                }
        });      

        if (level.properties.building_ids.length == 0 ) {
            level.properties.building_ids = null
            console.log("INFO: found level without building_ids: " + level.properties.osmId)
            console.log(level.properties.tags)
        }
    });

}


function getTagsAndTheirPossibleValues(featureCollection, excludeEmptyTags) {
    var tagsAndTheirValues = {}

    featureCollection.features.map( (f) => {
        let tags = f.properties.tags
        Object.keys(f.properties.tags).map( (key) => {
            if (key in tagsAndTheirValues) {
            tagsAndTheirValues[key].push(tags[key])
            } else {
                tagsAndTheirValues[key] = []
            }
        }       
        )
    });

    if (excludeEmptyTags) {        
        Object.keys(tagsAndTheirValues).forEach((key) => (tagsAndTheirValues[key].length == 0) && delete tagsAndTheirValues[key]);
    }

    return tagsAndTheirValues    
}

function execute(command) {
    child_process.execSync(command, {stdio: 'inherit'});
}

async function readFiles(dir, ignoreHiddenFiles = true) {
    let fileList = fs.readdirSync(dir);
    
    if (ignoreHiddenFiles) {
        fileList = fileList.filter(f => !f.startsWith("."))
    }
    
    return await Promise.all(fileList.map(async (file) => {
        let filePath = path.join(dir,file);
        return {
            path: filePath,
            fileName: path.parse(file).name,
            content: await fsPromises.readFile(filePath, 'utf8')
        }
    }));
    
}

// function generateAnchors(featureCollection) {
//     return featureCollection
// }

// function expandMultiLevelFeatures(featureCollection) {
// }

// var unitLocalizedMapping = {
//     en: "name"
// }

// function createLocalizedLabel(localisation,localizationMapping) {
//     let localizedLabel = {}

//     localizationMapping.map((mapping) => {
//         if (mapping.exact || ) {
            
//         }
//         localizedLabel.
//     })

//     for (const mapping of localizationMapping) {
//         if (mapping.exact || "exact" in mapping) {
            
//         } else
//     }

//     for (const key in localizationMapping) {
//         if (localizationMapping.hasOwnProperty(key)) {
//             if
//             localizedLabel.[key] = tags[]            
//         }
//     }
//     return {
//         [localisation]: value
//     }
// }

// dissolve
// const dissolve = require('geojson-dissolve')
// var line1 = {
//   type: 'LineString',
//   coordinates: [
//     [0.0, 0.0],
//     [1.0, 1.0],
//     [2.0, 2.0]
//   ]
// }

// var line2 = {
//   type: 'LineString',
//   coordinates: [
//     [2.0, 2.0],
//     [3.0, 3.0]
//   ]
// }

// console.log(dissolve([line1, line2]))


// const geojsonStream = require('geojson-stream');
// const fs = require('fs');
// const out = fs.createWriteStream('buildings-with-id.geojson');

// fs
//     .createReadStream(`buildings.geojson`)
//     .pipe(geojsonStream.parse((building, index) => {
//         if (building.geometry.coordinates === null) {
//             return null;
//         }
//         building.id = index;
//         return building;
//     }))
//     .pipe(geojsonStream.stringify())
//     .pipe(out);

// let fixtures = fs.readdirSync(directories.in).map(filename => {
//     return {
//         filename,
//         name: path.parse(filename).name,
//         geojson: load.sync(directories.in + filename)
//     };
// });

// Function to get current filenames 
// in directory with "withFileTypes" 
// set to "true"  
  
// const fs = require('fs'); 


// files.forEach(function(file) {
// var contents = fs.readFileSync(__dirname + '/files/' + file, 'utf8');
// console.log(contents);
// })


// generates a uuid based on features type/id
// function generateId(featureCollection, collectionSource) {
    
//     featureCollection.features.forEach(function(f) {
//         // create a feature ids
//         f.properties.osmId = f.properties.type + "/" + f.properties.id;
//         f.id = uuidv4(f.properties.customId);
//     });
    
//     return geojson;
// }

// function unitTransformation(featureCollection) {
//     featureCollection.features.forEach(function(feature) {
//         var keep = [""]
//         var rename = []
//         valueMapping = {
//             t: "t"
//         }

//       for (var m in p.meta || {}) f.properties["@" + m] = p.meta[m];
//       // expose internal properties:
//       // * tainted: indicates that the feature's geometry is incomplete
//       if (p.tainted) f.properties["@tainted"] = p.tainted;
//       // * geometry: indicates that the feature's geometry is approximated via the Overpass geometry types "center" or "bounds"
//       if (p.geometry) f.properties["@geometry"] = p.geometry;
//       // expose relation membership (complex data type)
//       if (p.relations && p.relations.length > 0)
//         f.properties["@relations"] = p.relations;
//       // todo: expose way membership for nodes?
//     });
// }