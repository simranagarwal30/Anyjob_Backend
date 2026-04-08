import express, { Router } from "express";
import { getCategories } from "../../controller/category.controller";

import { fetchShiftbyId, fetchShifs } from "../../controller/shift.controller";

import {
  fetchQuestions,
  fetchSingleQuestion,
} from "../../controller/question.controller";
import {
  VerifyJWTToken,
  verifyUserType,
} from "../../middlewares/auth/userAuth";
import {
  fetchNearByServiceProvider,
  getServiceRequestByStatus,
  fetchAssignedserviceProvider,
  cancelServiceRequest,
  addorUpdateIncentive,
  fetchServiceAddressHistory,
} from "../../controller/service.controller";

import { sendQueryMessage } from "../../controller/contactUs.controller";
const router: Router = express.Router();

//without token

//Categories
router.route("/get-all-categories").get(getCategories);

//questions
router.route("/fetch-all-question").get(fetchQuestions);
router.route("/q/:categoryId/:questionId").get(fetchSingleQuestion);

//Shifts
router.route("/get-all-shifts").get(fetchShifs);
router.route("/fetch-shift/:shiftId").get(fetchShiftbyId);

router
  .route("/nearby-services-providers/:serviceRequestId")
  .get(fetchNearByServiceProvider);

// protected customer routes------------

router.use(VerifyJWTToken);

router
  .route("/get-service-request")
  .post(verifyUserType(["Customer"]), getServiceRequestByStatus);

router
  .route("/fetch-assigned-sp/:serviceId")
  .get(verifyUserType(["Customer"]), fetchAssignedserviceProvider);

router
  .route("/send-query-message")
  .post(verifyUserType(["Customer"]), sendQueryMessage);

router
  .route("/cancel-service")
  .put(verifyUserType(["Customer"]), cancelServiceRequest);

router
  .route("/add-incentive")
  .put(verifyUserType(["Customer"]), addorUpdateIncentive);

router
  .route("/fetch-service-history")
  .get(verifyUserType(["Customer"]), fetchServiceAddressHistory);



export default router;