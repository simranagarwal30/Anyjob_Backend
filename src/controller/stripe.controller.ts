import { Request, Response } from "express";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../config/config";
import UserModel from "../models/user.model";
import WalletModel from "../models/wallet.model";
import mongoose from "mongoose";
import PurchaseModel from "../models/purchase.model";
import PaymentMethodModel from "../models/paymentMethod.model";
import { CustomRequest } from "../../types/commonType";
import ServiceModel from "../models/service.model";
import CategoryModel from "../models/category.model";
import AdditionalInfoModel from "../models/userAdditionalInfo.model";
import { asyncHandler } from "../utils/asyncHandler";
import AdminRevenueModel from "../models/adminRevenue.model";
import { sendSuccessResponse } from "../utils/response";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-09-30.acacia" as any,
});

export async function createCustomerIfNotExists(userId: string) {
  const user = await UserModel.findById({ _id: userId });

  if (!user) throw new Error("User not found");

  if (!user.stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.firstName + " " + user.lastName || "default",
      metadata: {
        appUserType: user.userType,
        appUserId: String(user._id),
      },
    });
    await UserModel.findByIdAndUpdate(
      { _id: userId },
      { stripeCustomerId: customer.id },
    );
  }
}

export async function transferIncentiveToSP(serviceId: string) {
  const serviceData = await ServiceModel.findById({ _id: serviceId });
  if (!serviceData) throw new Error("Service not found");

  if (serviceData.isIncentiveGiven) {
    const givenIncentiveByCustomer = serviceData.incentiveAmount;
    const spIncentiveAmt = givenIncentiveByCustomer * 0.8;
    const adminIncentiveAmt = givenIncentiveByCustomer * 0.2;
    const spId = serviceData.serviceProviderId;

    const spAccount = await WalletModel.findOne({ userId: spId });
    if (!spAccount) throw new Error("SP account not found");
    const spStripeAccountId = spAccount.stripeConnectedAccountId;

    const transferGroup = `incentive_fee_${serviceData?.serviceProviderId?.toString()}_service_${serviceId}`;

    // const transfer = await stripe.transfers.create({
    //   amount: spIncentiveAmt * 100,
    //   currency: "usd",
    //   destination: spStripeAccountId,
    //   transfer_group: transferGroup,
    //   description: `IncentiveFee_transfer_to_sp_${serviceData?.serviceProviderId?.toString()}_for_service_${serviceId}`,
    // });
    const transaction = {
      userId: serviceData.userId,
      type: "credit",
      amount: adminIncentiveAmt,
      description: "ServiceIncentiveAmount",
      serviceId: serviceData._id,
      stripeTransactionId: "",
    };
    await new AdminRevenueModel(transaction).save();
  }
}

//session for incentive payment
export const createCheckoutsession = async (
  req: CustomRequest,
  res: Response,
) => {
  const { amount, serviceId } = req.body;
  const userId = req.user?._id;
  const currency = "usd";

  const user = await UserModel.findById(userId);
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  let stripeCustomerId = user.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
    });
    stripeCustomerId = customer.id;
    await UserModel.findByIdAndUpdate(userId, { stripeCustomerId });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer: stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amount * 100,
          product_data: {
            name: "Service Payment",
          },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      description: `IncentiveFee_paid_by_customer_${userId?.toString()}_for_service_${serviceId}`,
      setup_future_usage: "on_session",
    },

    payment_method_data: {
      allow_redisplay: "always",
    },

    payment_method_options: {
      card: {
        request_three_d_secure: "any",
      },
    },

    metadata: {
      serviceId,
    },

    success_url: "https://frontend.theassure.co.uk/payment-success",
    cancel_url: "https://frontend.theassure.co.uk/payment-error",
  } as Stripe.Checkout.SessionCreateParams);
  console.log({ Incentivesession: session });

  res.json({ url: session.url });
};

export const chargeSavedCard = async (req: CustomRequest, res: Response) => {
  const userId = req.user?._id;
  const { amount, serviceId } = req.body;
  const currency = "usd";

  const user = await UserModel.findById(userId);
  if (!user || !user.stripeCustomerId || !user.paymentMethodId) {
    return res.status(400).json({ message: "Missing Stripe data for user" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: user.stripeCustomerId,
      payment_method_data: {
        allow_redisplay: "always",
        // user.paymentMethodId, // attach saved card
      },
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amount * 100,
            product_data: {
              name: "Service Payment",
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        setup_future_usage: "off_session", // Save again if needed
        metadata: {
          serviceId,
        },
      },
      success_url: "https://frontend.theassure.co.uk/payment-success",
      cancel_url: "https://frontend.theassure.co.uk/payment-error",
    } as Stripe.Checkout.SessionCreateParams);

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe checkout session error:", error);
    return res.status(500).json({ message: error.message });
  }
};

export const attatchPaymentMethod = async (req: Request, res: Response) => {
  try {
    const { userId, paymentMethodId, last4, brand, exp_month, exp_year } =
      req.body;
    console.log({ paymentMethodId });

    if (!userId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "userId and paymentMethodId are required",
      });
    }

    // Fetch user from the database
    const user = await UserModel.findById({ _id: userId });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.stripeCustomerId || user.paymentMethodId) {
      return res.status(200).json({
        success: true,
        message: "User has already a saved payement method ",
      });
    }

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.firstName + " " + user.lastName || "default",
    });
    console.log({ customer });

    const newPaymentMethod = {
      userId: userId,
      paymentMethodId: paymentMethodId,
      last4: last4,
      brand: brand,
      exp_month: exp_month,
      exp_year: exp_year,
      is_default: true,
    };

    const saveMethodInDB = await new PaymentMethodModel(
      newPaymentMethod,
    ).save();

    // Attach the new payment method to the Stripe customer
    const attach = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });
    console.log("ATTATCH PAYMENT METHOD: ", attach);

    // Set the payment method as the default for future payments
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    //save the stripe infi in user data
    await UserModel.findByIdAndUpdate(
      { _id: userId },
      { stripeCustomerId: customer.id, paymentMethodId: paymentMethodId },
    );

    return res
      .status(200)
      .json({ success: true, message: "Payment method added successfully" });
  } catch (error: any) {
    console.error("Error adding payment method:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createPaymentIntent = async (req: Request, res: Response) => {
  try {
    const { userId, amount, currency, serviceId } = req.body;

    // Validate request body
    if (!userId || !amount || !currency) {
      return res.status(400).json({
        success: false,
        message: "userId, amount, and currency are required",
      });
    }

    // Fetch user details
    const user = await UserModel.findById({ _id: userId });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "User does not have a Stripe Customer ID",
      });
    }

    if (!user.paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "User does not have a saved payment method",
      });
    }

    // Create a PaymentIntent using the customer's default payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency,
      customer: user.stripeCustomerId,
      payment_method: user.paymentMethodId,
      receipt_email: user.email,
      description: "Service booking payment",
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
      metadata: {
        customer_name: user.firstName + " " + user.lastName,
        sender_name: user.firstName + " " + user.lastName,
        receiver_name: "AnyJob",
        // order_id: "ORD123456",
      },
    });

    //create purchase details when user will initiate a payment intent
    const purchaseData = {
      userId: user?._id,
      serviceId: new mongoose.Types.ObjectId(serviceId),
      paymentMethodId: user?.paymentMethodId,
      stripeCustomerId: paymentIntent?.customer,
      paymentIntentId: paymentIntent?.id,
      currency: currency,
      amount: amount,
    };
    const savePurchaseData = await new PurchaseModel(purchaseData).save();

    return res.status(200).json({ success: true, paymentIntent });
  } catch (error: any) {
    console.error("Error creating payment intent:", error);

    let failedPaymentIntent = error.payment_intent || null;

    // Save purchase details even for failed payments
    await new PurchaseModel({
      userId: req.body.userId,
      serviceId: req.body.serviceId,
      paymentMethodId: error.payment_method.id,
      stripeCustomerId: failedPaymentIntent?.customer || null,
      paymentIntentId: failedPaymentIntent?.id || null,
      currency: req.body.currency || "unknown",
      amount: req.body.amount || 0,
      status: "failed",
      errorMessage: error.message,
    }).save();

    return res.status(500).json({ success: false, message: error.message });
  }
};

export async function createCustomConnectedAccount(
  req: CustomRequest,
  res: Response,
) {
  try {
    const userWallet = await WalletModel.findOne({ userId: req.user?._id });

    if (userWallet?.stripeConnectedAccountId) {
      return res.status(200).json({
        message: "Account already exists",
      });
    }

    const dob = req.user?.dob;
    if (!dob || !(dob instanceof Date)) {
      return res.status(400).json({ error: "Invalid date of birth" });
    }

    const accountParams: Stripe.AccountCreateParams = {
      type: "custom",
      country: "US",
      email: req.user?.email,
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
      },
      individual: {
        first_name: req.user?.firstName,
        last_name: req.user?.lastName,
        email: req.user?.email,
        phone: req.user?.phone,
        dob: {
          day: dob.getDate(),
          month: dob.getMonth() + 1,
          year: dob.getFullYear(),
        },
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: req.ip || "127.0.0.1",
      },
    };

    const account = await stripe.accounts.create(accountParams);

    await new WalletModel({
      userId: req.user?._id,
      stripeConnectedAccountId: account.id,
      balance: 0,
    }).save();

    await stripe.accounts.update(account.id, {
      settings: {
        payouts: {
          schedule: {
            interval: "manual",
          },
        },
      },
    });

    res.status(200).json({
      message: "Custom connected account created successfully",
      accountId: account.id,
    });
  } catch (error: any) {
    console.error("Stripe Custom Account Error:", error);
    res.status(500).json({ error: error.message });
  }
}

//-------------------------------------create connected account-------------------------------------------->>
export const createConnectedAccountAndRedirect = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const user = req.user; // assuming auth middleware attached user

    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const dob = user.dob;
    if (!dob || !(dob instanceof Date)) {
      return res
        .status(400)
        .json({ error: "Invalid or missing date of birth" });
    }

    const additionalInfo = await AdditionalInfoModel.findOne({
      userId: user._id,
    });

    // Step 1: Create the Stripe custom account (without external_account)
    const account = await stripe.accounts.create({
      type: "custom",
      country: "US",
      email: user.email,
      business_type: "individual",
      capabilities: {
        transfers: { requested: true },
      },
      individual: {
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email,
        phone: user.phone?.slice(3),
        ssn_last_4: additionalInfo?.socialSecurity,
        dob: {
          day: dob.getDate(),
          month: dob.getMonth() + 1,
          year: dob.getFullYear(),
        },
      },
      business_profile: {
        url: "https://your-test-business.com",
        mcc: "5818",
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: req.ip || "127.0.0.1",
      },
    });

    // Save to DB (create Wallet entry)
    await new WalletModel({
      userId: user._id,
      stripeConnectedAccountId: account.id,
      balance: 0,
    }).save();

    // Step 2: Create the Stripe onboarding link (redirect user to it)
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "https://your-frontend.com/onboarding-refresh",
      return_url: "https://your-frontend.com/onboarding-return",
      type: "account_onboarding",
    });

    // Send back the onboarding URL
    res.status(200).json({
      message: "Stripe account created. Redirect user to onboarding.",
      onboardingUrl: accountLink.url,
    });
  } catch (err: any) {
    console.error("Stripe onboarding error:", err);
    res.status(500).json({ error: err.message });
  }
};

//----------------------wallet integration------------------------------------------------------------------>>

// //add fund into wallet
export const createAddFundsSession = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const { amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer: req.user?.stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amount * 100,
            product_data: {
              name: "Add Funds to Wallet",
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        setup_future_usage: "on_session",
      },

      payment_method_data: {
        allow_redisplay: "always",
      },
      metadata: {
        purpose: "wallet_topup",
      },
      success_url: `https://frontend.theassure.co.uk/payment-success`,
      cancel_url: `https://frontend.theassure.co.uk/payment-error`,
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// pay lead generation fee with stripe hosted UI not in use
export const createLeadGenerationCheckoutSession = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const { serviceId } = req.body;
    const userId = req.user?._id;

    const serviceDetails = await ServiceModel.findOne({ _id: serviceId });
    const categoryId = serviceDetails?.categoryId;
    const categoryDetails = await CategoryModel.findById({ _id: categoryId });
    const leadGenerationFee = Math.floor(
      Number(categoryDetails?.serviceCost) * 0.25,
    );
    const amount = leadGenerationFee;

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });
      stripeCustomerId = customer.id;
      await UserModel.findByIdAndUpdate(userId, { stripeCustomerId });
    }

    // const session = await stripe.checkout.sessions.create({
    //   payment_method_types: ["card"],
    //   mode: "payment",
    //   customer: stripeCustomerId,
    //   line_items: [
    //     {
    //       price_data: {
    //         currency: "usd",
    //         unit_amount: amount * 100,
    //         product_data: {
    //           name: "Lead Generation Fee",
    //         },
    //       },
    //       quantity: 1,
    //     },
    //   ],
    //   metadata: {
    //     purpose: "leadGenerationee",
    //     serviceId,
    //     userId: userId?.toString(),
    //   },
    //   success_url: "https://frontend.theassure.co.uk/service-payment-success",
    //   cancel_url: "https://frontend.theassure.co.uk/service-payment-cancel",
    // } as Stripe.Checkout.SessionCreateParams);

    const transaction = {
      type: "debit",
      amount,
      description: "LeadGenerationFee",
      serviceId,
      stripeTransactionId: "",
    };
    res.json({
      url: "https://frontend.theassure.co.uk/service-payment-success",
    });
  } catch (err: any) {
    console.error("Error creating Checkout Session for service fee:", err);
    res.status(500).json({ error: err.message });
  }
};

// pay lead generation fee without stripe hosted UI
export const payForService = async (req: CustomRequest, res: Response) => {
  try {
    const { serviceId } = req.body;
    const userId = req.user?._id;
    const spWalletDetails = await WalletModel.findOne({ userId });
    if (!spWalletDetails) {
      return res
        .status(400)
        .json({ error: "User does not have a connected Wallet account" });
    }
    //calculate fee
    const serviceDetails = await ServiceModel.findOne({ _id: serviceId });
    const categoryId = serviceDetails?.categoryId;
    const categoryDetails = await CategoryModel.findById({ _id: categoryId });
    const leadGenerationFee = Math.floor(
      Number(categoryDetails?.serviceCost) * 0.25,
    );
    const amount = leadGenerationFee;
    //---------------------------------------------------------------------------------->
    if (spWalletDetails?.balance - amount < 200) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    const account = await stripe.accounts.retrieve();

    // Transfer funds from user's connected account to platform (admin)
    // const transfer = await stripe.transfers.create(
    //   {
    //     amount: 100 * amount,
    //     currency: "usd",
    //     destination: account?.id,
    //     description: `LeadGenerationFee_for_service_${serviceId}`,
    //     transfer_group: `service-67ac74fb12c4396eb2f5d52b}-${Date.now()}`,
    //   },
    //   {
    //     stripeAccount: spWalletDetails?.stripeConnectedAccountId,
    //   }
    // );
    // console.log({ transfer });

    const transactionData = {
      type: "debit",
      amount: amount,
      description: "LeadGenerationFee",
      serviceId: serviceId,
      stripeTransactionId: "",
    };
    await WalletModel.findOneAndUpdate(
      { userId: req.user?._id },
      {
        $push: {
          transactions: transactionData,
        },
        $inc: {
          balance:
            transactionData.type === "credit"
              ? transactionData.amount
              : -transactionData.amount,
        },
        updatedAt: Date.now(),
      },
      { new: true },
    );
    const Admintransaction = {
      userId: userId,
      type: "credit",
      amount: amount,
      description: "LeadGenerationFee",
      stripeTransactionId: "",
      serviceId,
    };
    await new AdminRevenueModel(Admintransaction).save();
    console.log({ Admintransaction });
    res.status(200).json({
      message: "Payment for the Service made successfully",
      success: true,
    });
  } catch (error: any) {
    console.error("Service payment error:", error);
    res.status(500).json({ error: error.message });
  }
};

export const isTheFirstPurchase = async (req: CustomRequest, res: Response) => {
  const userId = req.user?._id;
  const checkPurchaseModel = await PurchaseModel.find({ userId });
  const isTheFirstPurchase = checkPurchaseModel.length > 0 ? true : false;
  res.status(200).json({
    message: "Payment status check successfully",
    isTheFirstPurchase: isTheFirstPurchase,
  });
};

//checkout session for service cancellation by customer
export const createServiceCancellationCheckoutSession = async (
  req: CustomRequest,
  res: Response,
) => {
  try {
    const { serviceId, cancellationReason } = req.body;
    const userId = req.user?._id;
    const serviceDeatils = await ServiceModel.findOne({
      _id: serviceId,
    });
    const categoryId = serviceDeatils?.categoryId;
    const categoryDetails = await CategoryModel.findById(categoryId);
    if (!categoryDetails) {
      return sendSuccessResponse(res, 200, "categoryDetails not found");
    }
    const serviceCost = parseInt(categoryDetails.serviceCost);
    const SPStripeAccount = await WalletModel.findOne({
      userId: serviceDeatils?.serviceProviderId,
    });
    const SPStripeAccountId = SPStripeAccount?.stripeConnectedAccountId;
    const amount = Math.round(serviceCost * 0.25);
    console.log({ amount });
    const AnyJobAmount = Math.ceil(amount * 25) / 100;
    const SPAmount = Math.ceil(amount * 75) / 100;
    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });
      stripeCustomerId = customer.id;
      await UserModel.findByIdAndUpdate(userId, { stripeCustomerId });
    }
    const transferGroup = `cancellation_fee_sp_${serviceDeatils?.serviceProviderId?.toString()}_service_${serviceId}`;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer: stripeCustomerId,

      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: (AnyJobAmount + SPAmount) * 100,
            product_data: {
              name: "Cancellation Fee",
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        setup_future_usage: "on_session",
        description: `cancellationfee_paid_by_customer_${serviceDeatils?.serviceProviderId?.toString()}_for_service_${serviceId}`,
      },

      payment_method_data: {
        allow_redisplay: "always",
      },
      metadata: {
        purpose: "CancellationFee",
        serviceId,
        cancellationReason,
        userId: userId?.toString(),
        SPId: serviceDeatils?.serviceProviderId?.toString(),
        SPAmount,
        SPStripeAccountId,
      },
      success_url: "https://frontend.theassure.co.uk/payment-success",
      cancel_url: "https://frontend.theassure.co.uk/payment-error",
    } as Stripe.Checkout.SessionCreateParams);
    console.log({ cancellationSession: session });

    const transaction = {
      type: "credit",
      amount,
      description: "ServiceCancellationAmount",
      stripeTransferId: "",
    };

    const updateResult = await WalletModel.findOneAndUpdate(
      { userId: serviceDeatils?.serviceProviderId },
      {
        $push: { transactions: transaction },
        $inc: { balance: amount },
        updatedAt: Date.now(),
      },
      { new: true },
    );

    if (updateResult) {
      console.log(
        "ServiceCancellationAmount transferred to SP's account successfully.",
      );
    } else {
      console.warn(
        `Wallet not found for SP ID: ${serviceDeatils?.serviceProviderId}`,
      );
    }

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Error creating Checkout Session for service fee:", err);
    res.status(500).json({ error: err.message });
  }
};

export const withdrawFunds = async (req: CustomRequest, res: Response) => {
  try {
    let { amount, currency = "usd" } = req.body;
    const walletDetails = await WalletModel.findOne({ userId: req.user?._id });
    const connectedAccountId = walletDetails?.stripeConnectedAccountId;

    if (!connectedAccountId) {
      return res.status(400).json({ error: "Missing connected account ID." });
    }

    if (!amount || !currency) {
      return res
        .status(400)
        .json({ error: "Amount and currency are required." });
    }

    // Optional: Check available balance
    const balance = walletDetails.balance;

    if (!balance || balance - amount < 200) {
      return res
        .status(400)
        .json({ error: "Insufficient balance for payout." });
    }

    // // Create the payout
    // const payout = await stripe.payouts.create(
    //   {
    //     amount: amount * 100,
    //     currency,
    //   },
    //   {
    //     stripeAccount: connectedAccountId,
    //   }
    // );
    const transfer = await stripe.transfers.create({
      amount: amount * 100, // in cents
      currency: "usd",
      destination: connectedAccountId,
      description: "WithdrawFund",
    });

    const transaction = {
      type: "debit",
      amount,
      description: "WithdrawFund",
      stripeTransactionId: transfer.id,
    };

    await WalletModel.findOneAndUpdate(
      { userId: req.user?._id },
      {
        $push: { transactions: transaction },
        $inc: { balance: -amount },
        updatedAt: Date.now(),
      },
    );

    return res.status(200).json({
      message: "Payout initiated successfully.",
      success: true,
      payout: {},
    });
  } catch (error: any) {
    console.error("Payout Error:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const fetchAllAdminTransactions = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = "1",
      limit = "100",
      startingAfter = "",
      query = "",
      sortBy = "created",
      sortType = "desc",
    } = req.query;

    const limitNumber = Math.min(parseInt(limit as string, 10) || 10, 100);

    const stripeParams: any = {
      limit: limitNumber,
    };

    if (startingAfter) {
      stripeParams.starting_after = startingAfter;
    }

    // Fetch transactions from Stripe
    const transactions = await stripe.balanceTransactions.list(stripeParams);

    return res.status(200).json({
      message: "Admin transactions fetched successfully.",
      success: true,
      data: transactions.data,
      //   hasMore: transactions.has_more,
      //   nextStartingAfter: transactions.data.length > 0 ? transactions.data[transactions.data.length - 1].id : null,
    });
  },
);
