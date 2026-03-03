export const ROLES = ["admin", "staff", "user"] as const;

export type Role = (typeof ROLES)[number];
