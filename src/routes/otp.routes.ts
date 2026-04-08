import express, { Router } from 'express';
import { sendOTP, verifyOTP } from "../controller/otp.controller";
import { VerifyJWTToken, verifyUserType } from '../middlewares/auth/userAuth';
import { rateLimiter } from '../middlewares/rateLimiter.middleware'

const router: Router = express.Router();

router.route('/send').post(rateLimiter, sendOTP);

router.route('/verify').post(rateLimiter, verifyOTP);


export default router;
