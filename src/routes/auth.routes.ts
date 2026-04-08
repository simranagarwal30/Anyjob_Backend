import express, { Router } from "express";
import ModelAuth from "../middlewares/auth/modelAuth";
import ValidateUser from "../models/validator/user.validate";
import {
  refreshAccessToken,
  logoutUser,
  loginUser,
  registerUser,
  AuthUserSocial,
  addAssociate,
  forgetPassword,
  resetPassword,
  createAdminUsers,
  saveFcmToken,
  sendOTPEmail,
  deleteUser,
  getRevnue,
} from "../controller/auth/auth.controller";

import { upload } from "../middlewares/multer.middleware";
import { VerifyJWTToken, verifyUserType } from "../middlewares/auth/userAuth";
import { HandleSocialAuthError } from "../middlewares/auth/socialAuth";
import { rateLimiter } from "../middlewares/rateLimiter.middleware";
import { CheckJWTTokenExpiration } from "../utils/auth";
import {
  storeFcmToken,
  removeStaleFcmTokens,
} from "../utils/sendPushNotification";

const router: Router = express.Router();

router.route("/store-fcm-token").post(storeFcmToken);

//sign-up
router
  .route("/signup")
  .post(
    rateLimiter,
    upload.fields([{ name: "avatar", maxCount: 1 }]),
    registerUser
  );

// Auth user (social)
router.post(
  "/user/social",
  rateLimiter,
  [HandleSocialAuthError],
  AuthUserSocial
);

//login or sign-in route
router.route("/signin").post(rateLimiter, loginUser);

/***************************** secured routes *****************************/
// Logout
router
  .route("/save-fcm-token")
  .post(rateLimiter, [VerifyJWTToken], saveFcmToken);
// Logout
router.route("/logout").post(rateLimiter, [VerifyJWTToken], logoutUser);
router
  .route("/add-associate")
  .post(
    rateLimiter,
    [VerifyJWTToken],
    verifyUserType(["ServiceProvider", "TeamLead"]),
    addAssociate
  );
router
  .route("/add-admin-user")
  .post(
    rateLimiter,
    [VerifyJWTToken],
    verifyUserType(["SuperAdmin"]),
    createAdminUsers
  );

// Refresh token routes
router.route("/refresh-token").post(rateLimiter, refreshAccessToken);

router.route("/forget-password").post(forgetPassword);
router.route("/reset-password").post(resetPassword);

//check-token-expiration
router.route("/check-token-expiration").get(CheckJWTTokenExpiration);

//emial verification
router.route("/send-code-email").post(sendOTPEmail);

// User Delete
router
  .route("/delete-user")
  .delete([VerifyJWTToken], verifyUserType(["SuperAdmin"]), deleteUser);



export default router;
