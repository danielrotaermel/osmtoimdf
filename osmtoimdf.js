// 'use strict';
const assert = require('assert');
const polylabel = require('polylabel');
const turf = require('@turf/turf');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const child_process = require('child_process');
const trash = require('trash');
const xmldom = new (require('xmldom').DOMParser)();
const osmtogeojson = require('osmtogeojson');
const { v4: uuidv4 } = require('uuid');
const open = require('open');
var clone = require('clone');
const { log } = require('console');

const pathToQueries = path.join(__dirname + '/overpass-queries/queries/');
const pathToOsmData = path.join(__dirname + '/overpass-queries/osm-data/');
const pathToGeoJsonData = path.join(__dirname + '/overpass-queries/geojson-data/');
const pathToIMDFArchive = path.join(__dirname + '/IMDFData/');
const pathToIMDFArchiveZip = path.join(__dirname + '');
const runQueries = './overpass-queries/runQueries.sh';

const imdf = {
  featureType: require('./imdf-model/feature-type'),
  category: require('./imdf-model/category'),
  properties: require('./imdf-model/property'),
  categoryExtended: require('./imdf-model/category-extended'),
};

const DEBUG = true;

run().catch((err) => console.log(err));

function deepCopy(params) {}

async function run() {
  //   get geojson from overpass
  // execute(runQueries);

  // clear dir
  await trash(['/IMDFData/*']);

  featureCollections = {};
  let geojsonFiles = await readFiles(pathToGeoJsonData);

  allOSMTagValues = {};

  for (const file of geojsonFiles) {
    var geojson = JSON.parse(file.content);
    const collectionSource = file.fileName.split('.')[0];
    allOSMTagValues[collectionSource] = getTagsAndTheirPossibleValues(geojson, true);
    geojson = runTransformations(geojson, collectionSource);
    featureCollections[collectionSource] = geojson;
  }

  // remove all buildings without a name
  if ('building' in featureCollections) {
    console.log(featureCollections.building.features.length);
    featureCollections.building.features = featureCollections.building.features.filter(
      (f) => !(f.properties.name === null)
    );
    console.log(featureCollections.building.features.length);
  }

  // sort units for correct display
  if ('unit' in featureCollections) {
    const sortByRoomtype = {
      corridor: 0,
      area: 1,
      room: 2,
      yes: 3,
      undefined: 4,
    };

    featureCollections.unit.features = featureCollections.unit.features.sort(
      (a, b) => sortByRoomtype[a.properties.tags.indoor] - sortByRoomtype[b.properties.tags.indoor]
    );
  }

  // generate id references across imdf archive
  generateReferences(featureCollections);

  // generate doors
  if ('opening' in featureCollections) {
    generateDoors(featureCollections.opening, featureCollections.unit);
  }

  // create imdf directory
  if (!fs.existsSync(pathToIMDFArchive)) {
    fs.mkdirSync(pathToIMDFArchive, 0744);
  }

  // write out feature collections to imdf archive
  for (const [collectionName, featureCollection] of Object.entries(featureCollections)) {
    // console.log(`${key}: ${value}`);
    var geoJsonString = JSON.stringify(featureCollection, undefined, 2);
    fs.writeFileSync(path.join(pathToIMDFArchive, collectionName + '.json'), geoJsonString);
  }

  // zip the imdf archive
  console.log('INFO: created zip at ' + pathToIMDFArchive.slice(0, -1) + '.zip');
  console.log('INFO: validate zip here https://register.apple.com/indoor/imdf-sandbox');
  execute(`zip -r "${path.basename(pathToIMDFArchive)}" "${pathToIMDFArchive}"`);

  // write out overview of available properties and values
  allOSMTagValues = JSON.stringify(allOSMTagValues, undefined, 2);
  fs.writeFileSync(path.join(pathToIMDFArchiveZip, 'osm-tag-report' + '.json'), allOSMTagValues);

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

// explode features that are present on multiple layers
// e.g. elevators (level="0;1;2;3;4;5) https://www.openstreetmap.org/way/374438979
function explodeOSMMultiLevelFeatures(featureCollection) {
  featureCollection.features.forEach(function (f, index, arr) {
    if ('level' in f.properties.tags && f.properties.tags.level.includes(';')) {
      // extract features that are on multiple floors
      let levels = f.properties.tags.level;
      // create a correlation_id
      const correlation_id = uuidv4(levels + '/' + f.properties.osmId);
      levels.split(';').forEach((level) => {
        // deep copy
        let newFeature = JSON.parse(JSON.stringify(f));
        newFeature.properties.correlation_id = correlation_id;
        newFeature.properties.tags.level = level;
        // update id
        newFeature.properties.customId = level + '/' + newFeature.properties.customId;
        newFeature.id = uuidv4(newFeature.customId);
        featureCollection.features.push(newFeature);
      });
    }
  });

  // remove features with (level="0;1;2;3;4;5")
  featureCollection.features = featureCollection.features.filter(
    (f) => !('level' in f.properties.tags && f.properties.tags.level.includes(';'))
  );
}

function runTransformations(featureCollection, collectionSource) {
  console.log('INFO: Transforming ' + collectionSource);
  featureCollection.name = collectionSource;
  // general transformations
  featureCollection.features.forEach(function (f) {
    // osmId based on a features "type/id"
    f.properties.osmId = f.properties.type + '/' + f.properties.id;
    // customId based on imdfFeatureType/osmid is used for creating a final uuid
    f.properties.customId = featureCollection.name + '/' + f.properties.osmId;
    // generate a uuid based on customId
    f.id = uuidv4(f.properties.customId);

    f.feature_type = collectionSource;

    if (f.geometry.type === 'Multipoligon' || f.geometry.type === 'Polygon') {
      f.properties._area = turf.area(f.geometry);
    }
  });

  explodeOSMMultiLevelFeatures(featureCollection);

  // featureType based transformations
  featureCollection.features.forEach(function (f) {
    const props = f.properties;
    const tags = f.properties.tags;
    const geom = f.geometry;
    const featureType = f.feature_type;

    if (props === undefined) {
      console.error('properties is undefined');
      return;
    }
    if (tags === undefined) {
      console.error('tags is undefined');
      return;
    }
    if (featureType === undefined) {
      console.error('featureType is undefined');
      return;
    }
    if (geom === undefined) {
      console.error('geometry is undefined');
      return;
    }

    // if (!(featureType in imdf.featureType)) {
    //   return;
    // }

    let imdfProps;
    let category;

    // TODO: create displaypoints for Building Fixture Geofence Kiosk Opening Level Section Unit Venue
    switch (featureType) {
      case imdf.featureType.ADRESS:
        imdfProps = clone(imdf.properties.address);
        // TODO: implement
        break;
      case imdf.featureType.AMENITY:
        let amenityCategory = { ...imdf.category.amenity, ...imdf.categoryExtended.amenity };
        imdfProps = clone(imdf.properties.amenity);

        // try to use name as name
        if (tags.name != null) {
          imdfProps.name = { en: tags.name };
        }

        // try to use ref as name
        if (imdfProps.name == null) {
          imdfProps.name = tags?.ref ? { en: tags.ref } : null;
        } else {
          // set alt_name to ref
          imdfProps.alt_name = tags?.ref ? { en: tags.ref } : null;
        }

        // set category
        if (tags.indoor === 'room') imdfProps.category = amenityCategory.room;
        if (tags.indoor === 'yes') imdfProps.category = amenityCategory.room;
        // if (tags.name?.contains('/'))
        //   imdfProps.category = imdf.categoryExtended.amenity.seminarRoom;

        if (tags.highway === 'elevator') {
          imdfProps.category = amenityCategory.elevator;
          imdfProps.name = { en: 'Elevator', de: 'Aufzug' };
        }

        if (tags.amenity === 'toilets') {
          imdfProps.category = amenityCategory.restroom;
          imdfProps.name = { en: 'Restroom', de: 'WC' };
        }

        if (tags.male === 'yes') {
          imdfProps.category = amenityCategory.restroomMale;
          imdfProps.name = { en: 'Male Restroom', de: 'WC Herren' };
        }

        if (tags.female === 'yes') {
          imdfProps.category = amenityCategory.restroomFemale;
          imdfProps.name = { en: 'Female Restroom', de: 'WC Damen' };
        }

        if (tags.unisex === 'yes') {
          imdfProps.category = amenityCategory.restroomUnisex;
          imdfProps.name = { en: 'Unisex Restroom', de: 'WC Unisex' };
        }

        if (tags.stairs === 'yes') {
          imdfProps.category = amenityCategory.stairs;
          imdfProps.name = { en: 'Stairs', de: 'Treppe' };
        }

        if (tags.entrance === 'yes') {
          imdfProps.category = amenityCategory.entry;
          imdfProps.name = { en: 'Entrance', de: 'Eingang' };
        }

        if (tags.entrance === 'emergency') {
          imdfProps.category = amenityCategory.emergencyexit;
          imdfProps.name = { en: 'Emergency Exit', de: 'Notausgang' };
        }
        // set accessibility
        if (tags.wheelchair === 'yes')
          imdfProps.accessibility = imdf.category.accessibility.wheelchair;

        // turn every non point geometry to a central point inside the polygon
        if (geom.type !== 'Point') {
          f.geometry = {
            type: 'Point',
            coordinates: polylabel(geom.coordinates, 1.0),
          };
        }

        break;
      case imdf.featureType.ANCHOR:
        let anchorCategory = imdf.category.anchor;
        imdfProps = clone(imdf.properties.anchor);
        break;
      case imdf.featureType.BUILDING:
        let buidingCategory = imdf.category.building;
        imdfProps = clone(imdf.properties.building);
        imdfProps.category = imdf.category.building.unspecified;

        if ('name' in tags) {
          imdfProps.name = {
            en: tags.name,
          };
        } else if ('ref' in tags) {
          imdfProps.name = {
            en: tags.ref,
          };
        }

        if ('alt_name' in tags) {
          imdfProps.alt_name = {};
          imdfProps.alt_name['de'] = tags.alt_name;
          if ('alt_name:en' in tags) {
            imdfProps.alt_name['en'] = tags['alt_name:en'];
          }
        }

        switch (tags.building) {
          case 'hospital':
            imdfProps.category = imdf.categoryExtended.building.hospital;
            break;
          case 'university':
            imdfProps.category = imdf.categoryExtended.building.university;
            break;
          case 'office':
            imdfProps.category = imdf.categoryExtended.building.office;
            break;
          case 'dormitory':
            imdfProps.category = imdf.categoryExtended.building.dormitory;
            break;
          case 'parking':
            imdfProps.category = imdf.category.building.parking;
            break;
          case 'garages':
            imdfProps.category = imdf.category.building.parking;
            break;
        }

        if ('amenity' in tags) {
          if (tags.amenity === 'parking') {
            imdfProps.category = imdf.category.building.parking;
          }
        }

        if ('access' in tags) {
          switch (String(tags.access)) {
            case 'private':
              imdfProps.restriction = imdf.category.restriction.restricted;
            case 'military':
              imdfProps.restriction = imdf.category.restriction.restricted;
            case 'no':
              imdfProps.restriction = imdf.category.restriction.restricted;
            default:
              break;
          }
        }

        f.geometry = turf.center(f).geometry;
        imdfProps.display_point = turf.center(f).geometry;
        imdfProps.address_id = null;

        // console.log(imdfProps.category);

        // buildings should not include a geometry
        f.geometry = null;

        break;
      case imdf.featureType.DETAIL:
        imdfProps = clone(imdf.properties.detail);
        break;
      case imdf.featureType.FIXTURE:
        let fixturecategory = imdf.category.fixture;
        imdfProps = clone(imdf.properties.fixture);
        imdfProps.display_point = turf.center(f).geometry;
        break;
      case imdf.featureType.FOOTPRINT:
        let footprintCategory = imdf.category.footprint;
        imdfProps = clone(imdf.properties.footprint);
        imdfProps.name = { en: tags.name };

        imdfProps.category = imdf.category.footprint.subterranean;

        // turn linestrings into polygons
        // there is an issue with osm data not having an intrinsic datatype
        // https://wiki.openstreetmap.org/wiki/Overpass_turbo/Polygon_Features
        if (f.geometry.type === 'LineString') {
          f.geometry = turf.lineToPolygon(f.geometry).geometry;
        }

        // TODO: generate footprints from building outlines by converting multipolygons to polygons (only keep first in geom array https://turfjs.org/docs/#flatten)
        // use turf https://turfjs.org/docs/#dissolve or https://turfjs.org/docs/#union to merge the resulting polygons
        break;
      case imdf.featureType.GEOFENCE:
        let geofenceCategory = imdf.category.geofence;
        imdfProps = clone(imdf.properties.geofence);
        imdfProps.name = { en: tags.name };
        // https://register.apple.com/resources/imdf/Glossary/#geofence
        break;
      case imdf.featureType.KIOSK:
        imdfProps = clone(imdf.properties.kiosk);
        imdfProps.name = { en: tags.name };
        break;
      case imdf.featureType.LEVEL:
        let levelCategory = imdf.category.level;
        imdfProps = clone(imdf.properties.level);

        imdfProps.name = { en: tags.name };
        imdfProps.short_name = { en: tags.level };
        imdfProps.ordinal = parseInt(tags.level);
        imdfProps.category = levelCategory.unspecified;
        imdfProps.outdoor = false;
        break;
      case imdf.featureType.OCCUPANT:
        let occupantCategory = imdf.category.occupant;
        imdfProps = clone(imdf.properties.occupant);

        imdfProps.name = { en: tags.name };
        break;
      case imdf.featureType.OPENING:
        let openingCategory = imdf.category.opening;
        imdfProps = clone(imdf.properties.opening);
        // imdfProps.name = { en: tags.name };
        break;
      case imdf.featureType.RELATIONSHIP:
        let relationshipCategory = imdf.category.relationship;
        imdfProps = clone(imdf.properties.relationship);
        // imdfProps.name = { en: tags.name };
        break;
      case imdf.featureType.SECTION:
        let sectionCategory = imdf.category.section;
        imdfProps = clone(imdf.properties.section);

        // imdfProps.name = { en: tags.name };
        break;
      case imdf.featureType.UNIT:
        let unitCategory = imdf.category.unit;
        imdfProps = clone(imdf.properties.unit);

        if ('name' in tags && 'ref' in tags) {
          imdfProps.name = { en: tags.name };
          imdfProps.alt_name = { en: tags.ref };
        } else if ('ref' in tags) {
          imdfProps.name = { en: tags.ref };
        }

        if (tags.indoor === 'room') imdfProps.category = unitCategory.room;
        if (tags.indoor === 'corridor') imdfProps.category = unitCategory.walkway;
        if (tags.indoor === 'yes') imdfProps.category = unitCategory.room;

        if (tags.wheelchair === 'yes') {
          imdfProps.accessibility = imdf.category.accessibility.wheelchair;
        }

        if (tags.highway === 'elevator') {
          imdfProps.category = unitCategory.elevator;
          imdfProps.name = { en: 'Elevator', de: 'Aufzug' };
        }

        if (tags.amenity === 'toilets') {
          imdfProps.category = unitCategory.restroom;
          imdfProps.name = { en: 'Restroom', de: 'Toilette' };
        }

        if (tags.male === 'yes') {
          imdfProps.category = unitCategory.restroomMale;
          imdfProps.name = { en: 'Male Restroom', de: 'Herrentoilette' };
        }

        if (tags.female === 'yes') {
          imdfProps.category = unitCategory.restroomFemale;
          imdfProps.name = { en: 'Female Restroom', de: 'Damentoilette' };
        }

        if (tags.unisex === 'yes') {
          imdfProps.category = unitCategory.restroomUnisex;
          imdfProps.name = { en: 'Unisex Restroom', de: 'Unisex-Toilette' };
        }

        if (tags.stairs === 'yes') {
          imdfProps.category = unitCategory.stairs;
          imdfProps.name = { en: 'Stairs', de: 'Treppe' };
        }
        break;
      case imdf.featureType.VENUE:
        let venueCategory = imdf.category.venue;
        imdfProps = clone(imdf.properties.venue);
        break;
      default:
        break;
    }

    // overwrite properties with imdf based properties
    f.properties = { ...f.properties, ...imdfProps };
    // f.properties = imdfProps;
  });

  return featureCollection;
}

function generateReferences(featureCollections) {
  // get all building_id
  var buildingIds = featureCollections.building.features.map((f) => ({ buildingId: f.id }));

  // add building_id to levels, footprint
  featureCollections.level.features.forEach((f) => {
    f.building_id = buildingIds[0].buildingId;
  });

  // get all level_id
  var levelIds = featureCollections.level.features.map((f) => ({
    id: f.id,
    level: f.properties.tags.level,
  }));

  // add level ids to units, fixtures, openings and details
  featureCollections.unit?.features.forEach((f) => {
    levelIds.forEach((levelId) => {
      if (f.properties.tags.level === levelId.level) {
        f.properties.level_id = levelId.id;
      }
    });
  });

  // add level ids to fixtures
  featureCollections.fixture?.features.forEach((f) => {
    levelIds.forEach((levelId) => {
      if (f.properties.tags.level === levelId.level) {
        f.properties.level_id = levelId.id;
      }
    });
  });

  // add level ids to openings
  featureCollections.opening?.features.forEach((f) => {
    levelIds.forEach((levelId) => {
      if (f.properties.tags.level === levelId.level) {
        f.properties.level_id = levelId.id;
      }
    });
  });

  // add level ids to details
  featureCollections.detail?.features.forEach((f) => {
    levelIds.forEach((levelId) => {
      if (f.properties.tags.level === levelId.level) {
        f.properties.level_id = levelId.id;
      }
    });
  });

  // IDEA: on device routing
  // https://turfjs.org/docs/#shortestPath

  // TODO: cleanup features
  // https://turfjs.org/docs/#cleanCoords

  if ('building' in featureCollections) {
    setCorrelatingBuildingIds(featureCollections.level, featureCollections.building);
  }

  // correlate footprints and buildings
  if ('building' in featureCollections && 'footprint' in featureCollections) {
    setCorrelatingBuildingIdsForFootprints(
      featureCollections.footprint,
      featureCollections.building
    );
  }

  // correlate amenities with units and set the unit_id
  if ('amenity' in featureCollections) {
    setCorrelatingUnitIds(featureCollections.amenity, featureCollections.unit);
  }

  // correlate amenities with units and set the unit_id
  if ('anchor' in featureCollections) {
    setCorrelatingUnitIds(featureCollections.anchor, featureCollections.unit);
  }
}

function validateIMDF(params) {
  assert('manifest.json' in featureCollections, 'manifest.json missing');
  assert('venue' in featureCollections, 'venue missing');
  assert('footprint' in featureCollections, 'footprint missing');
  assert('building' in featureCollections, 'building missing');
  assert('level' in featureCollections, 'level missing');
  assert('unit' in featureCollections, 'unit missing');
  assert('anchor' in featureCollections, 'anchor missing');
  assert('amenity' in featureCollections, 'amenity missing');
  assert('occupant' in featureCollections, 'occupant missing');
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

  targetCollection.features.forEach((amenity) => {
    amenity.properties.unit_ids = [];
    let smallestArea = Number.MAX_VALUE;
    unitCollection.features.forEach((unit) => {
      if (
        amenity.properties.osmId === unit.properties.osmId &&
        amenity.properties.tags.level === unit.properties.tags.level
      ) {
        amenity.properties.unit_ids = [unit.id];
      }
      // unit and amenity should share the same level
      else if (amenity.properties.tags.level === unit.properties.tags.level) {
        if (turf.booleanPointInPolygon(amenity, unit)) {
          // if unit is smaller than the last found one
          if (unit.properties._area < smallestArea) {
            smallestArea = unit.properties._area;
            amenity.properties.unit_ids = [unit.id];
          }
        }
      }
    });

    // log any amenity without a associated unit
    if (amenity.properties.unit_ids.length == 0) {
      amenity.properties.unit_ids = null;
      console.log(
        'INFO: found amenity without unit_ids: ' +
          amenity.properties.osmId +
          ' ' +
          'https://www.openstreetmap.org/' +
          amenity.properties.osmId +
          '/#map=18/' +
          amenity.geometry.coordinates[1] +
          '/' +
          amenity.geometry.coordinates[0]
      );
    }
  });
}

function setCorrelatingBuildingIds(targetCollection, buildingCollection) {
  targetCollection.features.forEach((level) => {
    level.properties.building_ids = [];
    let smallestArea = Number.MAX_VALUE;
    buildingCollection.features.forEach((building) => {
      level.properties.building_ids = [building.id];
      if (turf.booleanPointInPolygon(turf.center(building.geometry), level)) {
        // if (turf.booleanOverlap(turf.flatten(level), turf.flatten(building))) {
        // if (turf.booleanContains(level, building)) {
        if (building.properties._area < smallestArea) {
          // if unit is smaller than the last found one
          smallestArea = building.properties._area;
          level.properties.building_ids = [building.id];
        }
      }
    });

    if (level.properties.building_ids.length == 0) {
      level.properties.building_ids = null;
      console.log('INFO: found level without building_ids: ' + level.properties.osmId);
      console.log(level.properties.tags);
    }
  });
}

function setCorrelatingBuildingIdsForFootprints(footprintsCollection, buildingCollection) {
  footprintsCollection.features.forEach((footprint) => {
    footprint.properties.building_ids = [];
    let smallestArea = Number.MAX_VALUE;
    buildingCollection.features.forEach((building) => {
      if (turf.booleanPointInPolygon(building.properties.display_point, footprint)) {
        if (footprint.properties._area < smallestArea) {
          smallestArea = footprint.properties._area;
          // if building is smaller than the last found one
          footprint.properties.building_ids = [building.id];
        }
      }
    });

    if (footprint.properties.building_ids.length == 0) {
      footprint.properties.building_ids = null;
      console.log('INFO: found footprint without building_ids: ' + footprint.properties.osmId);
      console.log(footprint.properties.tags);
    }
  });
}

function getTagsAndTheirPossibleValues(featureCollection, excludeEmptyTags) {
  var tagsAndTheirValues = {};

  featureCollection.features.map((f) => {
    let tags = f.properties.tags;
    Object.keys(f.properties.tags).map((key) => {
      if (key in tagsAndTheirValues) {
        tagsAndTheirValues[key].push(tags[key]);
      } else {
        tagsAndTheirValues[key] = [];
      }
    });
  });

  if (excludeEmptyTags) {
    Object.keys(tagsAndTheirValues).forEach(
      (key) => tagsAndTheirValues[key].length == 0 && delete tagsAndTheirValues[key]
    );
  }

  for (const [key, value] of Object.entries(tagsAndTheirValues)) {
    tagsAndTheirValues[key] = Array.from(new Set(value));
  }

  return tagsAndTheirValues;
}

function execute(command) {
  child_process.execSync(command, { stdio: 'inherit' });
}

async function readFiles(dir, ignoreHiddenFiles = true) {
  let fileList = fs.readdirSync(dir);

  if (ignoreHiddenFiles) {
    fileList = fileList.filter((f) => !f.startsWith('.'));
  }

  return await Promise.all(
    fileList.map(async (file) => {
      let filePath = path.join(dir, file);
      return {
        path: filePath,
        fileName: path.parse(file).name,
        content: await fsPromises.readFile(filePath, 'utf8'),
      };
    })
  );
}

// function generateAnchors(featureCollection) {
//     return featureCollection
// }

function generateDoors(doors, units) {
  // deep copy
  // let _doorFC = JSON.parse(JSON.stringify(doorPointsFC));
  // let _wallFC = JSON.parse(JSON.stringify(intersectingWallsFC));

  // featureCollection.features = featureCollection.features.filter(f => {
  // });

  doors.features.forEach((door) => {
    // if (!"level" in door.properties.tags) {
    //     return
    // }

    units.features.forEach((unit) => {
      // if (door.properties.tags.level === unit.properties.tags.level ) {}
      if (
        'ref' in door.properties.tags &&
        'ref' in unit.properties.tags &&
        door.properties.tags.ref === unit.properties.tags.ref
      ) {
        //   replace geometry with an intersecting unit
        // create a circle
        var center = door.geometry.coordinates;
        var radius = 0.6 / 1000;
        var options = { steps: 5, units: 'kilometers' };
        var circle = turf.circle(center, radius, options);
        // find intersection of units and circles
        let intersections = turf.lineIntersect(unit, circle);
        // check that there are only 2 intersections
        if (intersections.features.length !== 2) {
          return;
        }
        // replace door geometry with the intersections as a linestring
        door.geometry = {
          type: 'LineString',
          coordinates: intersections.features.map((f) => {
            return f.geometry.coordinates;
          }),
        };
      }
    });
  });

  // remove feature that's not a linestring
  doors.features = doors.features.filter((f) => f.geometry.type === 'LineString');

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
