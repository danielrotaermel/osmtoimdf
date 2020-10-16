const category = require('./category');

var property = {
  address: {
    address: null,
    unit: null,
    locality: null,
    province: null,
    country: null,
    postal_code: null,
    postal_code_ext: null,
    postal_code_vanity: null,
  },

  amenity: {
    category: category.amenity.unspecified,
    accessibility: null,
    name: null,
    alt_name: null,
    hours: null,
    phone: null,
    website: null,
    unit_ids: null,
    address_id: null,
    correlation_id: null,
  },

  anchor: {
    address_id: null,
    unit_id: null,
  },

  building: {
    name: null,
    alt_name: null,
    category: category.building.unspecified,
    restriction: null,
    display_point: null,
    address_id: null,
  },

  detail: {
    level_id: null,
  },

  fixture: {
    category: category.fixture.furniture,
    name: null,
    alt_name: null,
    anchor_id: null,
    level_id: null,
    display_point: null,
  },

  footprint: {
    category: category.footprint.ground,
    name: null,
    building_ids: null,
  },

  geofence: {
    category: category.geofence.geofence,
    restriction: null,
    name: null,
    alt_name: null,
    correlation_id: null,
    display_point: null,
    building_ids: null,
    level_ids: null,
    parents: null,
  },

  kiosk: {
    name: null,
    alt_name: null,
    anchor_id: null,
    level_id: null,
    display_point: null,
  },

  level: {
    category: category.level.unspecified,
    restriction: null,
    outdoor: null,
    ordinal: null,
    name: null,
    short_name: null,
    display_point: null,
    address_id: null,
    building_ids: null,
  },

  occupant: {
    name: null,
    category: null,
    anchor_id: null,
    hours: null,
    phone: null,
    website: null,
    validity: null,
    correlation_id: null,
  },

  opening: {
    category: null,
    accessibility: null,
    access_control: null,
    door: category.door.door,
    name: null,
    alt_name: null,
    display_point: null,
    level_id: null,
  },

  relationship: {
    category: null,
    direction: null,
    origin: null,
    intermediary: null,
    destination: null,
    hours: null,
  },

  section: {
    category: null,
    restriction: null,
    accessibility: null,
    name: null,
    alt_name: null,
    display_point: null,
    level_id: null,
    address_id: null,
    correlation_id: null,
    parents: null,
  },

  unit: {
    category: null,
    restriction: null,
    accessibility: null,
    name: null,
    alt_name: null,
    level_id: null,
    display_point: null,
  },

  venue: {
    category: null,
    restriction: null,
    name: null,
    alt_name: null,
    hours: null,
    phone: null,
    website: null,
    display_point: null,
    address_id: null,
  },
};

module.exports = property;
