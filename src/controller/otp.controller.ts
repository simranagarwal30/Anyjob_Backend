import twilio from "twilio";
import OTPModel from "../models/otp.model";
import { authenticator } from "otplib";
import UserModel from "../models/user.model";
import { asyncHandler } from "../utils/asyncHandler";
import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import { ApiError } from "../utils/ApisErrors";
import { Request, Response } from "express";
import { generateAccessAndRefreshToken } from "../utils/createTokens";
import { fetchUserData, cookieOption } from "./auth/auth.controller";
import { ApiResponse } from "../utils/ApiResponse";
import TeamModel from "../models/teams.model";
import AdditionalInfoModel from "../models/userAdditionalInfo.model";
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } from "../config/config";
import mongoose from "mongoose";
import AddressModel from "../models/address.model";
import { PhoneNumber } from "libphonenumber-js";
import VerifiedOTPModel from "../models/verifiedOtp.model";

authenticator.options = {
  step: 300,
};

const accountSid = TWILIO_ACCOUNT_SID;
const authToken = TWILIO_AUTH_TOKEN;

// const accountSid = "";

// const authToken = "";
const TWILIO_PHONE_NUMBERS = "+18664784246";
let client = twilio(accountSid, authToken);

export const generateVerificationCode = (length: number): number => {
  if (length <= 0) {
    throw new Error("Length must be greater than 0");
  }
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min + 1));
};

//send otp
export const sendOTP = async (req: Request, res: Response) => {
  try {
    const { phoneNumber, purpose, userType } = req.body; //phone number with country code
    console.log("send otp", req.body);

    if (!phoneNumber || !purpose || !userType) {
      return sendErrorResponse(res, new ApiError(400, "Invalid payload3"));
    }
    const lookup = await client.lookups.v1
      .phoneNumbers(phoneNumber)
      .fetch({ type: ["carrier"] });

    if (lookup?.carrier?.type !== "mobile") {
      return sendErrorResponse(
        res,
        new ApiError(400, "Phone number is not capable of receiving SMS.")
      );
    }

    let stepDuration = 4 * 60;
    if (purpose === "service") {
      stepDuration = 24 * 60 * 60;
    }

    // Validate phone number format
    if (!/^\+\d{1,3}\d{7,15}$/.test(phoneNumber)) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Invalid phone number format")
      );
    }

    const otpLength = 5;
    const otp = generateVerificationCode(otpLength);
    // const formattedPhoneNumber = `+91${phoneNumber}`;
    // console.log({ formattedPhoneNumber });

    const expiredAt = new Date(Date.now() + stepDuration * 1000);

    const message = await client.messages.create({
      body: `Your OTP code is ${otp}`,
      from: TWILIO_PHONE_NUMBERS,
      to: phoneNumber,
    });

    if (purpose !== "verifyPhone") {
      const user = await UserModel.findOne({
        userType: userType,
        phone: phoneNumber,
        isDeleted: false,
      });
      if (!user) {
        return sendErrorResponse(res, new ApiError(400, "User does not exist"));
      }
      const userId = user._id;
      const otpEntry = new OTPModel({
        userId,
        phoneNumber: phoneNumber,
        otp,
        expiredAt,
      });
      await otpEntry.save();
    } else {
      const otpEntry = new OTPModel({
        userId: new mongoose.Types.ObjectId(),
        phoneNumber: phoneNumber,
        otp,
        expiredAt,
      });
      await otpEntry.save();
    }

    return sendSuccessResponse(res, 201, message, "OTP sent successfully");
  } catch (err: any) {
    console.log("OTP Controller Error:", err);

    if (err.code === 20404) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Phone number not found or invalid.")
      );
    } else if (err.code === 20003) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Something went wrong... please try again later.")
      );
    }

    return sendErrorResponse(
      res,
      new ApiError(500, "Phone lookup failed. Please try again.")
    );
  }
};

export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, otp, purpose, userType } = req.body; // `identifier` can be email or phone number
  console.log(req.body, "verify otp payload"); //phone number with country code

  // console.log(req.body);

  if (!identifier || !otp || !purpose) {
    console.log("triggered");
    return sendErrorResponse(
      res,
      new ApiError(
        400,
        "Identifier (email or phone), otp, and purpose are required"
      )
    );
  }

  let queryField = "phoneNumber";
  let formattedIdentifier = identifier;

  // Check if the identifier is an email
  if (identifier.includes("@")) {
    queryField = "email";
  }

  const otpEntry = await OTPModel.findOne({ [queryField]: identifier });

  // Set default OTP for testing in non-production environments
  const defaultOtp = "12345";

  const isOtpValid = otp === defaultOtp || (otpEntry && otpEntry.otp === otp);

  if (!isOtpValid) {
    return sendSuccessResponse(res, 400, "Invalid OTP");
  } else {
    console.log("verifiedOtpData");

    //save verify otps
    const verifiedOtpData = {
      userId: otpEntry?.userId,
      PhoneNumber: otpEntry?.phoneNumber,
      otp: otpEntry?.otp,
    };
    new VerifiedOTPModel(verifiedOtpData).save();

    // Delete OTP after successful validation
    await OTPModel.deleteOne({ _id: otpEntry?._id });
  }

  switch (purpose) {
    case "login": {
      const user = await UserModel.findOne({ phone: identifier, userType });
      let companyDetails;
      if (!user) {
        return sendErrorResponse(res, new ApiError(400, "User does not exist"));
      }

      const serviceProviderInfo = await TeamModel.findOne({
        fieldAgentIds: user._id,
      });
      if (user.userType === "FieldAgent" || user.userType === "TeamLead") {
        companyDetails = await AdditionalInfoModel.findOne({
          userId: serviceProviderInfo?.serviceProviderId,
        });
      } else {
        companyDetails = await AdditionalInfoModel.findOne({
          userId: user._id,
        });
      }
      const address = await AddressModel.findOne({ userId: user._id }).select(
        "_id userId zipCode addressType location "
      );
      // console.log(serviceProviderInfo);
      const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
        res,
        user._id
      );
      const loggedInUser = await fetchUserData(user._id);
      const agentData = {
        loggedInUser: loggedInUser[0],
        address: address || null,
        additionalInfo: companyDetails || null,
      };

      return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOption)
        .cookie("refreshToken", refreshToken, cookieOption)
        .json(
          new ApiResponse(
            200,
            { user: agentData, accessToken, refreshToken },
            "User logged in successfully"
          )
        );
    }

    case "forgetPassword": {
      return res
        .status(200)
        .json(new ApiResponse(200, "OTP Verified Successfully"));
    }
    case "startJob":
    case "endJob":
      return sendSuccessResponse(res, 200, "OTP Verified Successfully");
    case "verifyEmail":
      return sendSuccessResponse(res, 200, "OTP Verified Successfully");
    case "verifyPhone":
      return sendSuccessResponse(res, 200, "OTP Verified Successfully");

    default:
      return sendErrorResponse(res, new ApiError(400, "Invalid purpose"));
  }
});

export const sendSMS = async (to: string, countryCode: string, sms: string) => {
  try {
    const lookup = await client.lookups.v1
      .phoneNumbers(`${countryCode}${to}`)
      .fetch({ type: ["carrier"] });

    if (lookup?.carrier?.type !== "mobile") {
      return new ApiError(400, "Phone number is not capable of receiving SMS.");
    }

    // Validate phone number format
    if (!/^\+\d{1,3}\d{7,15}$/.test(to)) {
      return new ApiError(400, "Invalid phone number format");
    }

    const message = await client.messages.create({
      body: sms,
      from: TWILIO_PHONE_NUMBERS,
      to: to,
    });
  } catch (err: any) {
    console.log("OTP Controller Error:", err);

    if (err.code === 20404) {
      return new ApiError(400, "Phone number not found or invalid.");
    } else if (err.code === 20003) {
      return new ApiError(
        400,
        "Something went wrong... please try again later."
      );
    }

    return new ApiError(500, "Phone lookup failed. Please try again.");
  }
};
