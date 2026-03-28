export { dashboardHandler } from "./dashboard.handler";
export { getUsersHandler, patchUserHandler } from "./users.handler";
export {
  listAdminBookingsHandler,
  exportAdminBookingsHandler,
  patchBookingByAdminHandler,
  postWalkInPaymentHandler,
} from "./bookings.handler";
export {
  getTableAllocationsHandler,
  postTableAllocationsHandler,
  deleteTableAllocationsHandler,
} from "./allocations.handler";
export { getAdminFeedbackHandler, patchAdminFeedbackHandler } from "./feedback.handler";
export { cleanupSlotInventoryHandler } from "./jobs.handler";
export {
  getAdminCategoriesHandler,
  postAdminCategoryHandler,
  patchAdminCategoryHandler,
  getAdminProductsHandler,
  postAdminProductHandler,
  patchAdminProductHandler,
} from "./menu.handler";
export {
  listAdminCouponsHandler,
  getAdminCouponByIdHandler,
  createCouponHandler,
  updateCouponHandler,
  softDeleteCouponHandler,
} from "./coupons.handler";
export {
  getStaffPermissionsHandler,
  putStaffPermissionsHandler,
} from "./rbac.handler";
