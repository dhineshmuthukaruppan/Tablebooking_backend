/**
 * Services aggregator – central entry for auth and other services.
 * Usage in routes: services.auth.authentication.authenticate, services.auth.privilege.requireRoles(...)
 */
import * as authentication from "./auth/authentication";
import * as privilege from "./auth/privilege";

export const auth = {
  authentication: {
    authenticate: authentication.authenticate,
  },
  privilege: {
    requireRoles: privilege.requireRoles,
  },
};
