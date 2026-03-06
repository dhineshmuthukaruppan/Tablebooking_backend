/**
 * Database collection and connection name constants.
 * Used by databaseUtilities so controllers use db.constants.dbTables.* and db.constants.connectionStrings.*
 */
export const dbTables = {
  users: "users",
} as const;

export const connectionStrings = {
  tableBooking: "tableBooking",
} as const;