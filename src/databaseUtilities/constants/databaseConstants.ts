/**
 * Database collection and connection name constants.
 * Used by databaseUtilities so controllers use db.constants.dbTables.* and db.constants.connectionStrings.*
 */
export const dbTables = {
  users: "users",
  guest_date: "guest_date",
  meal_time_master: "meal_time_master",
  table_master: "table_master",
  bookings: "bookings",
  feedbacks: "feedbacks",
  venue_config: "venue_config",
  slot_inventory: "slot_inventory",
  venue_photos: "venue_photos",
  table_allocations: "table_allocations",
  menu_categories: "menu_categories",
  menu_products: "menu_products",
  counters: "counters",
} as const;

export const connectionStrings = {
  tableBooking: "tableBooking",
} as const;