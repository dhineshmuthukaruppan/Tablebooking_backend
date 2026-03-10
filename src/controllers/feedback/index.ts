import { submitFeedbackHandler as submitHandler } from "./feedback.handler";

export { getFeedbackByBookingIdHandler, getPublicFeedbackHandler } from "./feedback.handler";
export const submitFeedbackHandler = submitHandler;
export { getPublicFeedbackHandler as listFeedbackHandler } from "./feedback.handler";
