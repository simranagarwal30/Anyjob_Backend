import express, { Router } from "express";
import { upload } from "../middlewares/multer.middleware";
import { VerifyJWTToken, verifyUserType } from "../middlewares/auth/userAuth";
import {
  getUser,
  addAddress,
  addAdditionalInfo,
  getServiceProviderList,
  getRegisteredCustomerList,
  getUsers,
  verifyServiceProvider,
  getSingleUser,
  banUser,
  fetchAssociates,
  assignTeamLead,
  getAgentEngagementStatus,
  getAdminUsersList,
  fetchIPlogs,
  updateUser,
  getIpLogs,
  addBankDetails,
  updateUserPreference,
  getPaymentMethods,
  getCustomersTransaction,
  fetchAdminReceivedFund,
  fetchAdminAllTransactions,
  getDashboardCardsDetails,
} from "../controller/user.controller";
import {
  givePermission,
  getUserPermissions,
} from "../controller/permission.controller";
import {
  fetchIncentiveDetails,
  getJobByStatus,
  getJobByStatusByAgent,
} from "../controller/service.controller";
import { captureIP } from "../middlewares/IP.middleware";
import {
  fetchQueryMessage,
  deleteQueryMessage,
} from "../controller/contactUs.controller";
import { getNotifications } from "../controller/notification.controller";
import { getRevnue } from "../controller/auth/auth.controller";

const router: Router = express.Router();

//Protected routes for users
router.use(VerifyJWTToken);

//get user
// router.route('/get-user').get(getUser);

//add user Address
router
  .route("/add-address")
  .post(verifyUserType(["ServiceProvider"]), addAddress);

//add user additional information
router.route("/add-additional-info").post(
  upload.fields([
    { name: "driverLicenseImage", maxCount: 2 },
    { name: "companyLicenseImage", maxCount: 1 },
    { name: "licenseProofImage", maxCount: 1 },
    { name: "businessLicenseImage", maxCount: 1 },
    { name: "businessImage", maxCount: 1 },
  ]),
  verifyUserType(["ServiceProvider"]),
  addAdditionalInfo
);

//fetch serviceProvider List
router.route("/get-service-providers").get(getServiceProviderList);

//fetch customers List
router.route("/get-registered-customers").get(getRegisteredCustomerList);

//fetch admin users List
router.route("/get-admin-users").get(getAdminUsersList);

//fetch users List
router.route("/get-users").get(getUsers);

//fetch profile user
router
  .route("/get-profile")
  .get(
    verifyUserType([
      "SuperAdmin",
      "Admin",
      "Finance",
      "ServiceProvider",
      "Customer",
      "FieldAgent",
      "TeamLead",
    ]),
    getUser
  );

//fetch iplogs
router
  .route("/fetch-iplogs")
  .get(verifyUserType(["SuperAdmin", "Admin", "Finance"]), getIpLogs);

//fetch associate List
router
  .route("/get-associates")
  .get(verifyUserType(["SuperAdmin", "ServiceProvider"]), fetchAssociates);
router
  .route("/get-agent-engagement")
  .get(
    verifyUserType(["SuperAdmin", "ServiceProvider"]),
    getAgentEngagementStatus
  );

router
  .route("/u/:userId")
  .get(verifyUserType(["SuperAdmin", "ServiceProvider"]), getSingleUser)
  .patch(verifyUserType(["SuperAdmin"]), banUser);

router
  .route("/update-user")
  .put(
    verifyUserType([
      "SuperAdmin",
      "ServiceProvider",
      "Customer",
      "FieldAgent",
      "TeamLead",
    ]),
    upload.fields([{ name: "userImage" }]),
    updateUser
  );

router
  .route("/verify/:serviceProviderId")
  .patch(verifyUserType(["SuperAdmin"]), verifyServiceProvider);

router
  .route("/assign-teamlead")
  .post([VerifyJWTToken], verifyUserType(["ServiceProvider"]), assignTeamLead);

router
  .route("/give-permission")
  .post(verifyUserType(["SuperAdmin", "ServiceProvider"]), givePermission);

router
  .route("/fetch-permission")
  .get(verifyUserType(["SuperAdmin", "ServiceProvider"]), getUserPermissions);

router.route("/fetch-iplogs").get(verifyUserType(["SuperAdmin"]), fetchIPlogs);

router
  .route("/fetch-job-by-status")
  .post([VerifyJWTToken], verifyUserType(["ServiceProvider"]), getJobByStatus);

router
  .route("/fetch-job-by-status-by-agent")
  .post(
    [VerifyJWTToken],
    verifyUserType(["FieldAgent", "TeamLead"]),
    getJobByStatusByAgent
  );

router
  .route("/add-bank-details")
  .post(
    verifyUserType([
      "ServiceProvider",
      "Customer",
      "Admin",
      "Finance",
      "FieldAgent",
      "TeamLead",
    ]),
    addBankDetails
  );

router
  .route("/create-iplog")
  .post(
    verifyUserType([
      "ServiceProvider",
      "Customer",
      "Admin",
      "Finance",
      "FieldAgent",
      "TeamLead",
      "SuperAdmin",
    ]),
    captureIP
  );

router
  .route("/fetch-query-messages")
  .get(verifyUserType(["SuperAdmin"]), fetchQueryMessage);

router
  .route("/delete-query-message/:messageId")
  .delete(verifyUserType(["SuperAdmin"]), deleteQueryMessage);

router
  .route("/update-user-preference")
  .put(
    verifyUserType(["ServiceProvider", "Customer", "FieldAgent", "TeamLead"]),
    updateUserPreference
  );

router
  .route("/fetch-notifications")
  .get(
    verifyUserType([
      "SuperAdmin",
      "ServiceProvider",
      "Customer",
      "Admin",
      "Finance",
      "FieldAgent",
      "TeamLead",
    ]),
    getNotifications
  );

router
  .route("/fetch-incentive-details")
  .get(
    verifyUserType(["SuperAdmin", "ServiceProvider"]),
    fetchIncentiveDetails
  );

router
  .route("/fetch-payment-method")
  .get(verifyUserType(["SuperAdmin", "Customer"]), getPaymentMethods);
router
  .route("/fetch-transactions")
  .get(verifyUserType(["SuperAdmin", "Customer"]), getCustomersTransaction);
router
  .route("/fetch-admin-received-fund")
  .get(verifyUserType(["SuperAdmin"]), fetchAdminReceivedFund);
router
  .route("/fetch-admin-all-transactions")
  .get(verifyUserType(["SuperAdmin"]), fetchAdminAllTransactions);

router
  .route("/get-dashboard-card-details")
  .get(verifyUserType(["SuperAdmin"]), getDashboardCardsDetails);

//Revenue
router
  .route("/get-revenue")
  .get([VerifyJWTToken], verifyUserType(["SuperAdmin"]), getRevnue);

export default router;
