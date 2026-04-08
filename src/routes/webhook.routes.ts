import express, { Router } from "express";
import { stripeWebhook } from "../controller/webhook.controller";

const router: Router = express.Router();



//STRIPE WEBHOOK ROUTE

router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);





export default router;