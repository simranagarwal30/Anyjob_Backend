import { Request, Response } from "express";
import Stripe from "stripe";
import UserModel from "../models/user.model";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "../config/config";
import PurchaseModel from "../models/purchase.model";
import PaymentMethodModel from "../models/paymentMethod.model";
import WalletModel from "../models/wallet.model";
import CancellationFeeModel from "../models/cancellationFee.model";
import ServiceModel from "../models/service.model";
import mongoose from "mongoose";
import AdminRevenueModel from "../models/adminRevenue.model";
import { ApiError } from "../utils/ApisErrors";
import { sendErrorResponse } from "../utils/response";
const stripe = new Stripe(STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-09-30.acacia" as any,
});

export const stripeWebhook = async (req: Request, res: Response) => {
  console.log("webhook runs");

  const sig = req.headers["stripe-signature"] as string;

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_WEBHOOK_SECRET!
    );
    // console.log("given event details==>", event);

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case "customer.created":
        await handleCustomerCreated(event.data.object);
        break;

      case "payment_method.attached":
        await handlePaymentMethodAttached(event.data.object);
        break;

      case "payment_method.updated":
        await handlePaymentMethodUpdated(event.data.object);
        break;

      case "payment_method.detached":
        await handlePaymentMethodDeleted(event.data.object);
        break;

      case "payment_intent.succeeded":
        await handlePaymentSuccess(event.data.object);
        break;

      case "payment_intent.processing":
        await handlePaymentDelayed(event.data.object);
        break;

      case "payment_intent.canceled":
        await handlePaymentCanceled(event.data.object);
        break;

      case "transfer.created":
        await handleTransferCreated(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
};

//EVENT HANDLERS
const handleCustomerCreated = async (customer: any) => {
  try {
    console.log("WEBHOOK RUNS: CUSTOMER CREATED", customer);
    const userType = customer.metadata.appUserType;
    const email = customer.email;
    // Store customer ID in database
    await UserModel.findOneAndUpdate(
      { email, userType },
      { stripeCustomerId: customer.id },
      { new: true, upsert: true }
    );
  } catch (err) {
    console.error("❌ Error in handleCustomerCreated:", err);
    throw err;
    // return new ApiError(400, "Something went wrong,please try again later");
  }
};

const handlePaymentMethodAttached = async (paymentMethod: any) => {
  try {
    console.log("WEBHOOK RUNS: ATTATCH PAYMENT METHOD");

    // Attach the new payment method to the Stripe customer
    const attach = await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: paymentMethod.customer,
    });
    console.log("ATTATCH PAYMENT METHOD: ", attach);

    // Set the payment method as the default for future payments
    await stripe.customers.update(paymentMethod.customer, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    await UserModel.findOneAndUpdate(
      { stripeCustomerId: paymentMethod.customer },
      { paymentMethodId: paymentMethod.id },
      { new: true }
    );
    console.log("Payment Method Attached:", paymentMethod.id);
  } catch (err) {
    console.error("❌ Error in handlePaymentMethodAttached:", err);
    throw err;
  }
};

const handlePaymentMethodUpdated = async (paymentMethod: any) => {
  console.log("Payment Method Updated:", paymentMethod.id);

  // No direct update in database needed, but you may log or notify the user
};

const handlePaymentMethodDeleted = async (paymentMethod: any) => {
  try {
    console.log("Payment Method Deleted:", paymentMethod.id);

    await UserModel.findOneAndUpdate(
      { stripeCustomerId: paymentMethod.customer },
      { $pull: { paymentMethods: paymentMethod.id } }, // Remove from the array
      { new: true }
    );
  } catch (err) {
    console.error("❌ Error in handlePaymentSuccess:", err);
    throw err;
  }
};

const handlePaymentSuccess = async (paymentIntent: any) => {
  try {
    console.log("WEBHOOK RUNS: CHECKING PAYMENT SUCCESS");

    const charges = await stripe.charges.list({
      payment_intent: paymentIntent.id,
    });
    console.log("Webhook runs: paymnet status updated :)");
  } catch (err) {
    console.error("❌ Error in handlePaymentSuccess:", err);
    throw err;
  }
};

const handlePaymentDelayed = async (paymentIntent: any) => {
  try {
    console.log("WEBHOOK RUNS: CHECKING PAYMENT DELAY");

    await PurchaseModel.findOneAndUpdate(
      {
        stripeCustomerId: paymentIntent.customer,
        paymentIntentId: paymentIntent.id,
      },
      { lastPendingPaymentIntentId: paymentIntent.id },
      { new: true }
    );
  } catch (err) {
    console.error("❌ Error in handlePaymentDelayed:", err);
    throw err;
  }
};

const handlePaymentCanceled = async (paymentIntent: any) => {
  try {
    console.log("WEBHOOK RUNS: CHECKING PAYMENT FALIURE");

    await PurchaseModel.findOneAndUpdate(
      {
        stripeCustomerId: paymentIntent.customer,
        paymentIntentId: paymentIntent.id,
      },
      { status: "failed", lastPendingPaymentIntentId: "" },
      { new: true }
    );
  } catch (err) {
    console.error("❌ Error in handlePaymentCanceled:", err);
    throw err;
  }
};

const handleCheckoutSessionCompleted = async (session: any) => {
  try {
    console.log("WEBHOOK RUNS: CHECKOUT SESSION ");

    const customerId = session.customer;
    const paymentIntentId = session.payment_intent;

    const purpose = session.metadata?.purpose;
    console.log("handleCheckoutSessionCompleted", purpose);

    if (purpose === "wallet_topup") {
      await handleWalletTopUp(session); //for sp
    } else if (purpose === "leadGenerationFee") {
      await handleLeadGenerationFee(session); //for sp
    } else if (purpose === "CancellationFee") {
      await handleServiceCancellationFee(session); //for customer
    } else {
      await handleServiceIncentivePayment(session); //for customer
    }

    if (!customerId || !paymentIntentId) {
      console.warn("Missing customer or payment_intent in session");
      return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId as string
    );
    const paymentMethodId = paymentIntent.payment_method as string;

    if (!paymentMethodId) {
      console.warn("No payment method found in payment intent");
      return;
    }
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    const { brand, exp_month, exp_year, last4 } = paymentMethod.card || {};

    if (!last4 || !brand || !exp_month || !exp_year) {
      console.warn("Missing card details in payment method");
      return;
    }

    const user = await UserModel.findOneAndUpdate(
      { stripeCustomerId: customerId },
      { paymentMethodId: paymentMethodId },
      { new: true, upsert: true }
    );

    // Update the user's payment method record in the DB
    // const payment_method_details = {
    //   userId: user?._id,
    //   stripeCustomerId: customerId,
    //   paymentMethodId: paymentMethodId,
    //   last4,
    //   brand,
    //   exp_month,
    //   exp_year,
    // };
    // const existingData = await PaymentMethodModel.findOne({
    //   userId: user?._id,
    //   paymentMethodId: paymentMethodId,
    // });
    // if (!existingData) {
    //   await new PaymentMethodModel(payment_method_details).save();
    // }

    // //create purchase details when user will initiate a payment intent
    // const purchaseData = {
    //   userId: user?._id,
    //   serviceId: session.metadata.serviceId,
    //   paymentMethodId: user?.paymentMethodId,
    //   paymentMethodDetails: payment_method_details,

    //   stripeCustomerId: paymentIntent?.customer,
    //   paymentIntentId: paymentIntent?.id,
    //   status: session.status === "complete" ? "succeeded" : "failed",
    //   currency: "usd",
    //   amount: Math.ceil(session.amount_total / 100),
    // };
    // const savePurchaseData = await new PurchaseModel(purchaseData).save();
  } catch (err) {
    console.error("❌ Error in handleCheckoutSessionCompleted:", err);
    throw err;
  }
};

const handleServiceIncentivePayment = async (session: any) => {
  try {
    console.log("WEBHOOK RUNS: SERVICE INCENTIVE CHECKOUT SESSION ");

    const customerId = session.customer;
    const paymentIntentId = session.payment_intent;

    if (!customerId || !paymentIntentId) {
      console.warn("Missing customer or payment_intent in session");
      return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId as string
    );
    const paymentMethodId = paymentIntent.payment_method as string;

    if (!paymentMethodId) {
      console.warn("No payment method found in payment intent");
      return;
    }
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    const { brand, exp_month, exp_year, last4 } = paymentMethod.card || {};

    if (!last4 || !brand || !exp_month || !exp_year) {
      console.warn("Missing card details in payment method");
      return;
    }

    const user = await UserModel.findOneAndUpdate(
      { stripeCustomerId: customerId },
      { paymentMethodId: paymentMethodId },
      { new: true, upsert: true }
    );

    // Update the user's payment method record in the DB
    const payment_method_details = {
      userId: user?._id,
      stripeCustomerId: customerId,
      paymentMethodId: paymentMethodId,
      last4,
      brand,
      exp_month,
      exp_year,
    };
    const existingData = await PaymentMethodModel.findOne({
      userId: user?._id,
      paymentMethodId: paymentMethodId,
    });
    if (!existingData) {
      await new PaymentMethodModel(payment_method_details).save();
    }

    //create purchase details when user will initiate a payment intent
    const purchaseData = {
      userId: user?._id,
      serviceId: session.metadata.serviceId,
      paymentMethodId: user?.paymentMethodId,
      paymentMethodDetails: payment_method_details,

      stripeCustomerId: paymentIntent?.customer,
      paymentIntentId: paymentIntent?.id,
      status: session.status === "complete" ? "succeeded" : "failed",
      currency: "usd",
      amount: Math.ceil(session.amount_total / 100),
    };
    const savePurchaseData = await new PurchaseModel(purchaseData).save();

    // const updatedService = await ServiceModel.findOneAndUpdate(
    //   {
    //     _id: session.metadata.serviceId,
    //     userId: user?._id,
    //   },
    //   {
    //     isIncentiveGiven: true,
    //     incentiveAmount: Math.ceil(session.amount_total / 100),
    //   },
    //   { new: true }
    // );
  } catch (error: any) {
    console.error("❌ Error in handleServiceIncentivePayment:", error);
    throw error;
  }
};

//when add fund is initiated
const handleWalletTopUp = async (session: any) => {
  try {
    console.log("WEBHOOK RUNS: WALLET ADD FUND CHECKOUT SESSION ", session);

    const customerId = session.customer;
    const amount = session.amount_total / 100;

    const user = await UserModel.findOne({ stripeCustomerId: customerId });
    const wallet = await WalletModel.findOne({ userId: user?._id });
    if (!user || !wallet) {
      console.log("User or wallet not found for customerId:", customerId);
      return;
    }

    // transfer added wallet amount in sp's wallet---------------------------------
    // const transfer = await stripe.transfers.create({
    //   amount: session.amount_total,
    //   currency: "usd",
    //   destination: wallet.stripeConnectedAccountId,
    // });
    // -----------------------------------------------------------------------------

    // Update the wallet after successful add money (wallet credited)----------------
    const transaction = {
      type: "credit",
      amount,
      description: "AddMoney",
      // stripeTransactionId: transfer.id,
    };

    await WalletModel.findOneAndUpdate(
      { userId: user._id },
      {
        $push: { transactions: transaction },
        $inc: { balance: amount },
        updatedAt: Date.now(),
      }
    );
  } catch (err) {
    console.error("❌ Error in handleWalletTopUp:", err);
    throw err;
  }
};
// wallet update complete-------------------------------------------------------------

const handleLeadGenerationFee = async (session: any) => {
  try {
    console.log("WEBHOOK RUNS: LEAD GENERATION FEE CHECKOUT SESSION ", session);

    const purpose = session.metadata?.purpose;
    if (purpose !== "leadGenerationFee") return;

    const userId = session.metadata?.userId;
    const serviceId = session.metadata?.serviceId;

    const user = await UserModel.findById(userId);
    if (!user) {
      console.warn("User not found in leadgenerationfee webhook");
      return;
    }
    // Update wallet against successfull lead generaion fee payment---------------------------
    // const wallet = await WalletModel.findOne({ userId });
    // if (!wallet) {
    //   console.warn("Wallet not found for user in leadgenerationfee webhook");
    //   return;
    // }

    // const amount = session.amount_total / 100;

    // // Transfer funds from platform to itself (simulating)
    // const platformAccount = await stripe.accounts.retrieve();

    // const transfer = await stripe.transfers.create(
    //   {
    //     amount: session.amount_total,
    //     currency: "usd",
    //     destination: platformAccount.id,
    //   },
    //   {
    //     stripeAccount: wallet.stripeConnectedAccountId,
    //   }
    // );

    // const transaction = {
    //   type: "debit",
    //   amount,
    //   description: "LeadGenerationFee",
    //   serviceId,
    //   stripeTransactionId: transfer.id,
    // };

    // await WalletModel.findOneAndUpdate(
    //   { userId },
    //   {
    //     $push: { transactions: transaction },
    //     $inc: { balance: -amount },
    //     updatedAt: Date.now(),
    //   }
    // );
    // -----------------------------------------------------------------------------------------
  } catch (error: any) {
    console.error(
      "❌ Error in handleLeadGenerationFee (Lead Generation Fee):",
      error
    );
    throw error;
  }
};

const handleServiceCancellationFee = async (session: any) => {
  try {
    console.log(
      "WEBHOOK RUNS: SERVICE CANCELLATION FEE CHECKOUT SESSION ",
      session
    );

    const purpose = session.metadata?.purpose;
    if (purpose !== "CancellationFee") return;

    const userId = session.metadata?.userId;
    const serviceId = session.metadata?.serviceId;
    const cancellationReason = session.metadata?.cancellationReason;
    const SPAmount = session.metadata?.SPAmount;
    const SPStripeAccountId = session.metadata?.SPStripeAccountId;
    const SPId = session.metadata?.SPId;

    const user = await UserModel.findById(userId);
    if (!user) {
      console.warn("User not found in leadgenerationfee webhook");
      return;
    }

    //transfer cancellation amount to sp ----------------------------------------------------------------
    // const transfer = await stripe.transfers.create({
    //   amount: SPAmount * 100,
    //   description: `cancellationfee_transfer_to_sp_${SPId?.toString()}_for_service_${serviceId}`,
    //   currency: "usd",
    //   destination: SPStripeAccountId,
    //   transfer_group: `cancellation_fee_sp_${SPId?.toString()}_service_${serviceId}`,
    // });
    // console.log({ cancellationfee_transfer_to_sp: transfer });
    // ------------------------------------------------------------------------------------------------------

    // Update payment method details-------------------------------------------------------------------------
    const paymentIntentId = session.payment_intent;
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId as string
    );
    const paymentMethodId = paymentIntent.payment_method as string;

    if (!paymentMethodId) {
      console.warn("No payment method found in payment intent");
      return;
    }
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const customerId = session.customer;

    const { brand, exp_month, exp_year, last4 } = paymentMethod.card || {};

    if (!last4 || !brand || !exp_month || !exp_year) {
      console.warn("Missing card details in payment method");
      return;
    }

    // Update the user's payment method record in the DB
    const payment_method_details = {
      userId: user?._id,
      stripeCustomerId: customerId,
      paymentMethodId: paymentMethodId,
      last4,
      brand,
      exp_month,
      exp_year,
    };

    // -------------------------------------------------------------------------------------------------------

    //create cancellation record for customer-----------------------------------------------------------------
    const CancellationFeeData = {
      userId: user?._id,
      serviceId: session.metadata.serviceId,
      paymentMethodId: user?.paymentMethodId,
      paymentMethodDetails: payment_method_details,
      stripeCustomerId: paymentIntent?.customer,
      paymentIntentId: paymentIntent?.id,
      status: session.status === "complete" ? "succeeded" : "failed",
      currency: "usd",
      amount: Math.ceil(session.amount_total / 100),
    };
    const saveCancellationFee = await new CancellationFeeModel(
      CancellationFeeData
    ).save();
    // ---------------------------------------------------------------------------------------------------------

    // After successfully saved the related data finally cancel the service by customer's side------------------
    const updatedService = await ServiceModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(serviceId), userId: user._id },
      {
        $set: {
          requestProgress: "Blocked",
          cancelledBy: user._id,
          cancellationReason: cancellationReason,
          serviceProviderId: null,
          assignedAgentId: null,
        },
      },
      { new: true }
    );
    // ---------------------------------------------------------------------------------------------------------

    // Update sp wallet for service cancellation fee--------------------

    //------------------------------------------------------------------
    // Create a record for admin revenue as some amt of cancellation will be credited to admin'a account--------
    const transaction = {
      userId: user._id,
      type: "credit",
      amount: (session.amount_total / 100) * 0.25,
      description: "ServiceCancellationAmount",
      stripeTransactionId: paymentIntent?.id,
      serviceId: session.metadata.serviceId,
    };
    await new AdminRevenueModel(transaction).save();
    // -----------------------------------------------------------------------------------------------------------
  } catch (error: any) {
    console.error(
      "❌ Error in handleServiceCancellationFee (Lead Generation Fee):",
      error
    );
    throw error;
  }
};

const handleTransferCreated = async (transfer: any) => {
  try {
    console.log("Transfer Created Event:", transfer);

    const amount = transfer.amount / 100;
    const stripeTransferId = transfer.id;
    const transferGroup = transfer.transfer_group;

    if (!transferGroup) {
      console.warn("Transfer group missing in transfer event.");
      return;
    }

    let description = "";
    let SPId = "";
    console.log({ transferGroup });

    if (transferGroup.startsWith("cancellation_fee_sp_")) {
      description = "ServiceCancellationAmount";
      const parts = transferGroup.split("_");
      console.log("parts", parts);
      SPId = parts[3]; // Extract SPId
    } else if (transferGroup.startsWith("incentive_fee_")) {
      description = "ServiceIncentiveAmount";
      const parts = transferGroup.split("_");
      console.log("parts", parts);
      SPId = parts[2]; // Extract SPId
    } else {
      console.warn("Unhandled transfer group:", transferGroup);
      return;
    }

    if (!SPId) {
      console.error("Service Provider ID not found in transfer group.");
      return;
    }
    console.log({ SPId });

    const transaction = {
      type: "credit",
      amount,
      description,
      stripeTransferId,
    };

    const updateResult = await WalletModel.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(SPId) },
      {
        $push: { transactions: transaction },
        $inc: { balance: amount },
        updatedAt: Date.now(),
      },
      { new: true }
    );

    if (updateResult) {
      console.log(`${description} transferred to SP's account successfully.`);
    } else {
      console.warn(`Wallet not found for SP ID: ${SPId}`);
    }
  } catch (error: any) {
    console.error("Error in handleTransferCreated:", error.message);
    throw error;
  }
};
