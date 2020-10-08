// download all data
// function execute(command) {
//   const exec = require('child_process').exec

//   exec(command, (err, stdout, stderr) => {
//     process.stdout.write(stdout)
//   })
// }

// execute('echo "Hello World!"')

// dissolve
var dissolve = require('geojson-dissolve')

var line1 = {
  type: 'LineString',
  coordinates: [
    [0.0, 0.0],
    [1.0, 1.0],
    [2.0, 2.0]
  ]
}

var line2 = {
  type: 'LineString',
  coordinates: [
    [2.0, 2.0],
    [3.0, 3.0]
  ]
}

console.log(dissolve([line1, line2]))


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


const polylabel = require('polylabel');

const turf = {
    featureEach: require('@turf/meta').featureEach,
};


const load = require('load-json-file');
const write = require('write-json-file');

// const directories = {
    // in: path.join(__dirname, 'test', 'in') + path.sep,
    // out: path.join(__dirname, 'test', 'out') + path.sep
// };

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


const queryOverpass = require('@derhuerst/query-overpass')

const assert = require('assert');


const fs = require('fs');
const fsPromises = fs.promises;
var path = require('path');

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


const pathToQueries = path.join(__dirname + '/overpass-queries/queries/');
const pathToOsmData = path.join(__dirname + '/overpass-queries/osm-data/');
const pathToGeoJsonData = path.join(__dirname + '/overpass-queries/geojson-data/');

(async () => {
    // let queries = await readFiles(pathToQueries)
    // console.log(queries);

    // // clear dir
    // const trash = require('trash');
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
    const trash = require('trash');
    await trash(['overpass-queries/geojson-data/*.geojson']);
    const xmldom = new (require('xmldom').DOMParser)();
    const osmtogeojson = require('osmtogeojson');

    let geoJsonCollections = []

    let osmFiles = await readFiles(pathToOsmData);
    
    for (const osm of osmFiles) {
            // console.log(osm.content);
            // console.log(xmldom.parseFromString(osm.content));
            var geojson = osmtogeojson(xmldom.parseFromString(osm.content), {flatProperties: false});
            geoJsonCollections.push(
                {
                    collectionSource: osm.fileName.split(".")[0],
                    collection: geojson
                }
            )
            fs.writeFileSync(path.join(pathToGeoJsonData,osm.fileName + ".geojson"), constructGeojsonString(geojson, null, 2));
    }


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
  
})();





// queryOverpass(`
// 	[out:json][timeout:25];
// 	node(3378340880);
// 	out body;
// `)
// .then(console.log)
// .catch(console.error)



// GeoJSON format
function constructGeojsonString(geojson) {
  var geoJSON_str;
  var gJ = {
      type: "FeatureCollection",
      generator: "osmtoimdf",
      features: geojson.features.map(function(feature) {
        return {
          type: "Feature",
          properties: feature.properties,
          geometry: feature.geometry
        };
      }) // makes deep copy
    };
    gJ.features.forEach(function(f) {
      var p = f.properties;
      f.id = p.type + "/" + p.id;
      f.properties = {
        "@id": f.id
      };
      // escapes tags beginning with an @ with another @
      for (var m in p.tags || {})
        f.properties[m.replace(/^@/, "@@")] = p.tags[m];
      for (var m in p.meta || {}) f.properties["@" + m] = p.meta[m];
      // expose internal properties:
      // * tainted: indicates that the feature's geometry is incomplete
      if (p.tainted) f.properties["@tainted"] = p.tainted;
      // * geometry: indicates that the feature's geometry is approximated via the Overpass geometry types "center" or "bounds"
      if (p.geometry) f.properties["@geometry"] = p.geometry;
      // expose relation membership (complex data type)
      if (p.relations && p.relations.length > 0)
        f.properties["@relations"] = p.relations;
      // todo: expose way membership for nodes?
    });
    geoJSON_str = JSON.stringify(gJ, undefined, 2);
  return geoJSON_str;
}