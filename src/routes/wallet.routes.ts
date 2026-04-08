import express, { Router } from 'express';
import { fetchTransaction, fetchWalletBalance } from "../controller/wallet.controller";
import { VerifyJWTToken } from '../middlewares/auth/userAuth';

const router: Router = express.Router();

router.use(VerifyJWTToken);

router.route('/fetch-wallet-balance').get(fetchWalletBalance);
router.route('/fetch-transactions').get(fetchTransaction);


export default router;