/**
 * Database collection and connection name constants.
 * Used by databaseUtilities so controllers use db.constants.dbTables.* and db.constants.connectionStrings.*
 */
export const dbTables = {
  users: "users",
  general_master: "general_master",
  meal_time_master: "meal_time_master",
  table_master: "table_master",
  bookings: "bookings",
  feedbacks: "feedbacks",
  venue_config: "venue_config",
  slot_inventory: "slot_inventory",
  images: "images",
  venue_photos: "venue_photos",
  phone_credentials: "phone_credentials",
  table_allocations: "table_allocations",
  menu_categories: "menu_categories",
  menu_products: "menu_products",
  video_categories: "video_categories",
  videos: "videos",
  counters: "counters",
  coupons: "coupons",
  redeems: "redeems",
  staff_permissions: "staff_permissions",
  photo_categories: "photo_categories",
} as const;

export const connectionStrings = {
  tableBooking: "tableBooking",
} as const;