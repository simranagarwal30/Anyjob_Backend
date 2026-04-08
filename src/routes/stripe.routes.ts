import express, { Router } from "express";
import {
  createPaymentIntent,
  createCustomerIfNotExists,
  attatchPaymentMethod,
  createCheckoutsession,
  createAddFundsSession,
  chargeSavedCard,
  isTheFirstPurchase,
  payForService,
  createConnectedAccountAndRedirect,
  createServiceCancellationCheckoutSession,
  withdrawFunds,
  fetchAllAdminTransactions,
} from "../controller/stripe.controller";
import { stripeWebhook } from "../controller/webhook.controller";
import { VerifyJWTToken } from "../middlewares/auth/userAuth";

const router: Router = express.Router();

//STRIPE API ROUTES
router.post("/create-stripe-customer", createCustomerIfNotExists);
router.post("/attatch-payment-method", attatchPaymentMethod);
router.post("/create-payment-intent", createPaymentIntent);

//STRIPE WEBHOOK ROUTE

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

router.get("/fetch-admin-transactions", fetchAllAdminTransactions);
router.use(VerifyJWTToken);

router.post("/create-checkout-session", createCheckoutsession);
router.post(
  "/create-cancellation-session",
  createServiceCancellationCheckoutSession
);
router.post("/charge-saved-card", chargeSavedCard);

router.post("/add-funds", createAddFundsSession);
router.post("/pay-fee", payForService);
router.post("/withdraw-fund", withdrawFunds);

router.get("/check-first-purchase", isTheFirstPurchase);

router.post("/create-stripe-account", createConnectedAccountAndRedirect);


export default router;
