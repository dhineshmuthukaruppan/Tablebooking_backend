/**
 * Privilege / RBAC service – role-based access control.
 * Use as middleware: services.auth.privilege.requireRoles('admin', 'staff')
 */
import type { Role } from "../../constants/roles";
import { requireRoles as requireRolesMiddleware } from "../../middlewares/rbac.middleware";

export function requireRoles(...roles: Role[]) {
  return requireRolesMiddleware(...roles);
}
