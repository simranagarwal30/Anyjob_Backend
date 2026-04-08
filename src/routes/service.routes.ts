import express, { Router } from "express";
import { VerifyJWTToken, verifyUserType } from "../middlewares/auth/userAuth";
import {
  addService,
  getServiceRequestList,
  getAcceptedServiceRequestInJobQueue,
  deleteService,
  fetchServiceRequest,
  handleServiceRequestState,
  fetchSingleServiceRequest,
  assignJob,
  totalJobCount,
  sendCustomerNotification,
} from "../controller/service.controller";

const router: Router = express.Router();

router.use(VerifyJWTToken); // Apply verifyJWT middleware to all routes in this file
router
  .route("/")
  .post(verifyUserType(["Customer"]), addService)
  .get(verifyUserType(["SuperAdmin"]), getServiceRequestList);

router
  .route("/get-accepted-service-request")
  .get(getAcceptedServiceRequestInJobQueue);

router
  .route("/get-job-count")
  .get(verifyUserType(["ServiceProvider", "TeamLead"]), totalJobCount);

router
  .route("/nearby-services-request")
  .get(verifyUserType(["ServiceProvider", "TeamLead"]), fetchServiceRequest);

router
  .route("/assign-job")
  .patch(verifyUserType(["ServiceProvider", "TeamLead"]), assignJob);

router
  .route("/notify-customer")
  .post(
    verifyUserType(["ServiceProvider", "TeamLead", "FieldAgent"]),
    sendCustomerNotification
  );

router
  .route("/c/:serviceId")
  .get(
    verifyUserType([
      "SuperAdmin",
      "ServiceProvider",
      "Customer",
      "TeamLead",
      "FieldAgent",
    ]),
    fetchSingleServiceRequest
  )
  .delete(verifyUserType(["SuperAdmin"]), deleteService)
  .patch(
    verifyUserType(["ServiceProvider", "TeamLead", "FieldAgent"]),
    handleServiceRequestState
  );

export default router;
