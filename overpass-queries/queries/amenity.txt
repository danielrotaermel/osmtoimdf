// query for anything that should be converted to a amenity
// https://register.apple.com/resources/imdf/Amenity/

// make sure to always use xml
[out:xml][timeout:25];

// retrieve building inside of bounding box
// nwr(poly: "48.4161673803 9.935054926 48.4244567539 9.9235464773  48.4273787968 9.9349424739 48.4292520745 9.9572219862 48.4261996257  9.9662373217 48.4212753586 9.9607336622 48.421138819 9.9560665997  48.4192906851 9.9518096519 48.4161673803 9.935054926")[building][name="O27"];

(wr(poly: "48.4161673803 9.935054926 48.4244567539 9.9235464773  48.4273787968 9.9349424739 48.4292520745 9.9572219862 48.4261996257  9.9662373217 48.4212753586 9.9607336622 48.421138819 9.9560665997  48.4192906851 9.9518096519 48.4161673803 9.935054926")[building="university"];
wr(poly: "48.4161673803 9.935054926 48.4244567539 9.9235464773  48.4273787968 9.9349424739 48.4292520745 9.9572219862 48.4261996257  9.9662373217 48.4212753586 9.9607336622 48.421138819 9.9560665997  48.4192906851 9.9518096519 48.4161673803 9.935054926")[name="Uni-West"];
 wr(poly: "48.4161673803 9.935054926 48.4244567539 9.9235464773  48.4273787968 9.9349424739 48.4292520745 9.9572219862 48.4261996257  9.9662373217 48.4212753586 9.9607336622 48.421138819 9.9560665997  48.4192906851 9.9518096519 48.4161673803 9.935054926")[operator~"Universität Ulm|Studentenwerk Ulm"];
//wr(poly: "48.4161673803 9.935054926 48.4244567539 9.9235464773  48.4273787968 9.9349424739 48.4292520745 9.9572219862 48.4261996257  9.9662373217 48.4212753586 9.9607336622 48.421138819 9.9560665997  48.4192906851 9.9518096519 48.4161673803 9.935054926")[amenity="parking"];
//[access!="private"];
);

// convert building to area to search inside
map_to_area ->.area;

(
	(
		// features to include
		// amenities
		node[amenity](area.area);
		way[amenity](area.area);
		// indoor units
      	 way[indoor~"room|yes"](area.area)(if:is_closed());
		// elevators
        way[highway="elevator"](area.area);
		// stairs
        way[stairs=yes](area.area);
		// main entries
		node[entrance](area.area);
		
		// doors used to tag rooms
		// node[door][ref](area.area)(if:count_tags() > 0);

	);
-
  	(
		// features to exclude e.g. rooms not completely in building
		way(id: 361240594);
        //way(id:374418923,374347716,374418922,374580730,372022910);
  	);
);

out geom;


//[~"."~"."] //only with tags
//(if:is_closed()) //only closed paths