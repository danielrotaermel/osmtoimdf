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

// get geojson from overpass
// execute(runQueries);

run().catch(err => console.log(err));

// anonymous async function
(async () =>  {
   console.log("use await here");
})

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
    let osmFiles = await readFiles(pathToOsmData);
    
    var featureCollections = {}

    // read xml files convert to geojson and transform according to imdf
    for (const osm of osmFiles) {
            // console.log(osm.content);
            // console.log(xmldom.parseFromString(osm.content));
            // featureCollections.push(
            //     {
            //         collectionSource: osm.fileName.split(".")[0],
            //         collection: geojson
            //     }
            // )
            var geojson = osmtogeojson(xmldom.parseFromString(osm.content), {flatProperties: false});
            const collectionSource = osm.fileName.split(".")[0]
            
            geojson = runTransformations(geojson, collectionSource)
            featureCollections[collectionSource] = geojson
    }

    // generate id references across imdf archive
    generateReferences(featureCollections)
    
    // create directory
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
    console.log(collectionSource);
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

        // TODO: create displaypoints for Building Fixture Geofence Kiosk Opening Level Section Unit Venue
        switch (collectionSource) {
            case "address" : 
                break;
            case "amenity" : 
                // console.log(getTagsAndTheirPossibleValues(featureCollection, true));
                // console.log(tags);
                
                // name/alt_name
                if ("ref" in tags && "name" in tags) {
                    f.properties.name = {
                        en: tags.ref
                    }
                    f.properties.alt_name = {
                        en: tags.name
                    }
                } else if ("name" in tags) {
                    f.properties.name = {
                        en: tags.name
                    }
                } else if ("ref" in tags) {
                    f.properties.name = {
                        en: tags.ref
                    }
                } else {
                    f.properties.name = null
                }

                if (geom.type !== "Point") {
                    f.geometry = {
                        type: "Point",
                        coordinates: polylabel(geom.coordinates, 1.0)
                    }
                }


                break;
            case "anchor" : 
                break;
            case "building" : 
                // name/alt_name
                if ("name" in tags) {
                    f.properties.name = {
                        en: tags.name
                    }
                } else {
                    f.properties.name = null
                }

                break;
            case "detail" : 
                break;
            case "fixture" : 
                break;
            case "footprint" : 
                // TODO: generate footprints from building outlines by converting multipolygons to polygons (only keep first in geom array https://turfjs.org/docs/#flatten)
                // use turf https://turfjs.org/docs/#dissolve or https://turfjs.org/docs/#union to merge the resulting poligons
                break;
            case "geofence" : 
                // https://register.apple.com/resources/imdf/Glossary/#geofence
                break;
            case "kiosk" : 
                break;
            case "level" : 
                break;
            case "occupant" : 
                break;
            case "opening" : 
                break;
            case "relationship" : 
                break;
            case "section" : 
                break;
            case "unit" : 
                break;
            case "venue" : 
                break;
            default:
                break;
        }

    });
    
    return featureCollection
}

function generateDoors(doorPointsFC, intersectingWallsFC) {
    // deep copy
    let _doorFC = JSON.parse(JSON.stringify(doorPointsFC));
    let _wallFC = JSON.parse(JSON.stringify(intersectingWallsFC));

    featureCollection.features = featureCollection.features.filter(f => {

    });

    _doorFC.features.map(function(f, index, arr) {        
        if ("level" in f.properties.tags && f.properties.tags.level.includes(";")) {
            // extract features that are on multiple floors
            let levels = f.properties.tags.level
            levels.split(";").forEach(level => {
                 // deep copy
                 let newFeature = JSON.parse(JSON.stringify(f));
                 newFeature.properties.tags.level = level
                // update id
                newFeature.properties.customId = level + "/" + newFeature.customId;
                newFeature.id = uuidv4(newFeature.customId);
                featureCollection.features.push(newFeature)
            });
        }
        
    });

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

    // add level ids to units, fixtures and details
    featureCollections.unit.features.forEach(f => {
        levelIds.forEach(levelId => {
            if (f.properties.tags.level === levelId.level) {
                f.level_id = levelId.id
            }
        });
    });

    // IDEA: on device routing
    // https://turfjs.org/docs/#shortestPath

    // TODO: cleanup features
    // https://turfjs.org/docs/#cleanCoords
    
    


    // TODO: correlate amenities with units and set the unit_id
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
    featureCollections.amenity.features.forEach(amenity => {
        amenity.properties.unit_ids = []
        // hacky but I'm tired
        let smallestArea = Number.MAX_VALUE
        featureCollections.unit.features.forEach(unit => {
            // if (amenity.properties.osmId === unit.properties.osmId) {
            //     amenity.properties.unit_ids.push(unit.id)
            // }
            // else 
            // if unit and anchor share the same level
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

async function readFiles(dir) {
    const fileList = fs.readdirSync(dir);
    console.log(fileList);

    var files = []
    await Promise.all(fileList.map(async (file) => {
        if (path.extname(file) != ".xml") return
        // console.log(file)
        const filePath = path.join(dir,file)
      const content = await fsPromises.readFile(filePath, 'utf8')
      const fileName = path.parse(file).name
      files.push(
          {
              path: filePath,
              fileName: fileName,
              content: content
          }
      )
    }));
    
    return files;
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