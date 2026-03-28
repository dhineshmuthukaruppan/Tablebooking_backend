export const ROLES = ["admin", "staff", "manager", "user"] as const;

export type Role = (typeof ROLES)[number];
