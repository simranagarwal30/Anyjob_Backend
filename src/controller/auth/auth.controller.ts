import { Request, Response } from "express";
import UserModel from "../../models/user.model";
import { ApiError } from "../../utils/ApisErrors";
import { addUser } from "../../utils/auth";
import { IRegisterCredentials } from "../../../types/requests_responseType";
import { sendErrorResponse, sendSuccessResponse } from "../../utils/response";
import { generateAccessAndRefreshToken } from "../../utils/createTokens";
import { CustomRequest } from "../../../types/commonType";
import { ApiResponse } from "../../utils/ApiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { IUser } from "../../../types/schemaTypes";
import { GoogleAuth } from "../../utils/socialAuth";
import jwt, { JwtPayload } from "jsonwebtoken";
import TeamModel from "../../models/teams.model";
import mongoose, { ObjectId } from "mongoose";
import PermissionModel from "../../models/permission.model";
import { sendMail } from "../../utils/sendMail";
import { generateVerificationCode } from "../otp.controller";
import OTPModel from "../../models/otp.model";
import AddressModel from "../../models/address.model";
import AdditionalInfoModel from "../../models/userAdditionalInfo.model";
import bcrypt from "bcrypt";
import { firestore } from "../../utils/sendPushNotification";
import admin from "firebase-admin";
import AdminRevenueModel from "../../models/adminRevenue.model";
import WalletModel from "../../models/wallet.model";

// fetchUserData func.
export const fetchUserData = async (userId: string | ObjectId) => {
  const user = await UserModel.aggregate([
    {
      $match: {
        isDeleted: false,
        _id: userId,
      },
    },
    {
      $lookup: {
        from: "permissions",
        foreignField: "userId",
        localField: "_id",
        as: "permission",
      },
    },
    {
      $unwind: {
        preserveNullAndEmptyArrays: true,
        path: "$permission",
      },
    },
    {
      $project: {
        "permission.userId": 0,
        "permission.isDeleted": 0,
        "permission.createdAt": 0,
        "permission.updatedAt": 0,
        "permission.__v": 0,
        password: 0,
        rawPassword: 0,
        refreshToken: 0,
      },
    },
  ]);
  return user;
};

// Set cookieOption
export const cookieOption: {
  httpOnly: boolean;
  secure: boolean;
  maxAge: number;
  sameSite: "lax" | "strict" | "none";
} = {
  httpOnly: true,
  secure: true,
  maxAge: 24 * 60 * 60 * 1000, // 1 Day
  sameSite: "strict",
};

// addAssociate controller
export const addAssociate = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userData: IRegisterCredentials = req.body;
    const userType = req.user?.userType;
    const userId = req.user?._id;
    let serviceProviderId = userId;

    if (userType === "TeamLead") {
      const permissions = await PermissionModel.findOne({ userId }).select(
        "fieldAgentManagement"
      );
      if (!permissions?.fieldAgentManagement) {
        return sendErrorResponse(
          res,
          new ApiError(
            403,
            "Permission denied: Field Agent Management not granted."
          )
        );
      }

      const team = await TeamModel.findOne({
        isDeleted: false,
        fieldAgentIds: userId,
      }).select("serviceProviderId");
      if (!team || !team.serviceProviderId) {
        return sendErrorResponse(
          res,
          new ApiError(400, "Service Provider ID not found in team.")
        );
      }

      serviceProviderId = team.serviceProviderId;
    }

    const savedAgent = await addUser(userData);
    if (userData.userType === "FieldAgent") {
      const team = await TeamModel.findOneAndUpdate(
        { serviceProviderId },
        { $push: { fieldAgentIds: savedAgent._id } },
        { new: true, upsert: true }
      );

      if (!team) {
        return sendErrorResponse(
          res,
          new ApiError(400, "Service Provider team not found.")
        );
      }
    }

    return sendSuccessResponse(
      res,
      200,
      savedAgent,
      `${userData.userType} added successfully.`
    );
  }
);

//add admin Users
export const createAdminUsers = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userData: IRegisterCredentials = req.body;
    const savedUser = await addUser(userData);

    return sendSuccessResponse(
      res,
      200,
      savedUser,
      `${userData.userType} added successfully.`
    );
  }
);

// register user controller
export const registerUser = asyncHandler(
  async (req: Request, res: Response) => {
    const userData: IRegisterCredentials = req.body;

    const savedUser = await addUser(userData);

    if (userData.userType === "ServiceProvider") {
      const newTeam = new TeamModel({
        serviceProviderId: savedUser._id,
        fieldAgents: [],
      });
      const savedTeam = await newTeam.save();
      if (!savedTeam) {
        return sendErrorResponse(
          res,
          new ApiError(400, "ServiceProvider team not created")
        );
      }
    }
    const newUser = await fetchUserData(savedUser._id);
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      res,
      savedUser._id
    );

    return res
      .status(200)
      .cookie("accessToken", accessToken, cookieOption)
      .cookie("refreshToken", refreshToken, cookieOption)
      .json({
        statusCode: 200,
        data: {
          user: newUser[0],
          accessToken,
          refreshToken,
        },
        message: "User Registered Successfully",
        success: true,
      });
  }
);

// login user controller
export const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const {
    email,
    password,
    userType,
    fcmToken,
    isAdminPanel,
  }: IUser & { isAdminPanel?: boolean; userType: Array<string> } = req.body;
  // console.log(req.body.password, "password from body");
  // console.log(typeof (req.body.password));

  if (!email) {
    return sendErrorResponse(res, new ApiError(400, "Email is required"));
  }

  const user = await UserModel.findOne({ email, userType, isDeleted: false });

  if (!user) {
    return sendErrorResponse(res, new ApiError(400, "User does not exist"));
  }

  if (userType && !userType.includes(user.userType)) {
    return sendErrorResponse(res, new ApiError(403, "Access denied"));
  }

  const userId = user._id;
  const isPasswordValid = await user.isPasswordCorrect(password);
  console.log(isPasswordValid, "isPasswordValid");

  if (!isPasswordValid) {
    return sendErrorResponse(
      res,
      new ApiError(403, "Invalid user credentials")
    );
  }

  if (user.isDeleted) {
    return sendErrorResponse(
      res,
      new ApiError(403, "Your account is banned from a AnyJob.")
    );
  }

  // Check for admin panel access
  if (isAdminPanel) {
    const allowedAdminTypes = ["SuperAdmin", "Admin", "Finance"];
    if (!allowedAdminTypes.includes(user.userType)) {
      return sendErrorResponse(
        res,
        new ApiError(
          403,
          "Access denied. Only authorized users can log in to the admin panel."
        )
      );
    }
  }

  // Save FCM Token if provided
  if (fcmToken) {
    user.fcmToken = fcmToken;
    await user.save();
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    res,
    user._id
  );
  const loggedInUser = await fetchUserData(user._id);
  const filteredUser = {
    _id: loggedInUser[0]._id,
    firstName: loggedInUser[0].firstName,
    lastName: loggedInUser[0].lastName,
    email: loggedInUser[0].email,
    userType: loggedInUser[0].userType,
    isVerified: loggedInUser[0].isVerified,
    avatar: loggedInUser[0].avatar,
    permission: loggedInUser[0].permission,
  };

  if (user.userType === "ServiceProvider") {
    // Fetch additional info and address by userId
    const userAddress = await AddressModel.findOne({ userId: user._id }).select(
      "_id userId zipCode addressType location "
    );
    const userAdditionalInfo = await AdditionalInfoModel.findOne({
      userId: user._id,
    });

    if (!userAddress || !userAdditionalInfo) {
      const deleteUser = await UserModel.findOneAndDelete({ _id: user?._id });
      return sendErrorResponse(res, new ApiError(400, "User does not exist"));
      // return sendErrorResponse(
      //   res,
      //   new ApiError(
      //     403,
      //     "Your account is created but please add address & your additional information.",
      //     [],
      //     { accessToken }
      //   )
      // );
    }

    if (!user.isVerified) {
      return sendErrorResponse(
        res,
        new ApiError(
          403,
          "Your account verification is under process. Please wait for confirmation.",
          [],
          { accessToken }
        )
      );
    }

    // Include address and additional info in the response
    const loggedInUser = {
      ...filteredUser,
      address: userAddress || null,
      additionalInfo: userAdditionalInfo || null,
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, cookieOption)
      .cookie("refreshToken", refreshToken, cookieOption)
      .json(
        new ApiResponse(
          200,
          { user: loggedInUser, accessToken, refreshToken },
          "User logged In successfully"
        )
      );
  }

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOption)
    .cookie("refreshToken", refreshToken, cookieOption)
    .json(
      new ApiResponse(
        200,
        { user: filteredUser, accessToken, refreshToken },
        "User logged In successfully"
      )
    );
});

//save fcm token in user data
export const saveFcmToken = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userId = req.user?._id;
    const { fcmToken } = req.body;

    if (!fcmToken || !userId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Missing FCM token or user ID")
      );
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return sendSuccessResponse(res, 200, "User does not exist");
    }

    user.fcmToken = fcmToken;

    await user.save();

    return sendSuccessResponse(res, 200, "FCM token saved successfully");
  }
);

// logout user controller
export const logoutUser = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    if (!req.user || !req.user._id) {
      return sendErrorResponse(
        res,
        new ApiError(400, "User not found in request")
      );
    }

    const userId = req.user._id.toString();
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ message: "Device ID is required." });
    }

    // Remove the FCM token for the specific device
    const userRef = firestore.collection("fcmTokens").doc(userId);
    const doc = await userRef.get();

    if (doc.exists) {
      const tokens: { token: string; deviceId: string }[] =
        doc.data()?.tokens || [];

      const updatedTokens = tokens.filter(
        (entry) => entry.deviceId !== deviceId
      );

      await userRef.update({
        tokens: updatedTokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Clear the refresh token in DB
    await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          refreshToken: "",
        },
      },
      { new: true }
    );

    // Clear auth cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
    };

    return res
      .status(200)
      .clearCookie("accessToken", cookieOptions)
      .clearCookie("refreshToken", cookieOptions)
      .json(new ApiResponse(200, {}, "User logged out successfully"));
  }
);

// refreshAccessToken controller
export const refreshAccessToken = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const incomingRefreshToken =
      req.cookies.refreshToken ||
      req.body.refreshToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!incomingRefreshToken) {
      return sendErrorResponse(res, new ApiError(401, "Unauthorized request"));
    }

    try {
      const decodedToken = jwt.verify(
        incomingRefreshToken,
        process.env.REFRESH_TOKEN_SECRET as string
      ) as JwtPayload;
      const user = await UserModel.findById(decodedToken?._id);

      if (!user) {
        return sendErrorResponse(
          res,
          new ApiError(401, "Invalid refresh token")
        );
      }

      if (user?.refreshToken !== incomingRefreshToken) {
        return sendErrorResponse(
          res,
          new ApiError(401, "Refresh token is expired or used")
        );
      }

      const cookieOption: { httpOnly: boolean; secure: boolean } = {
        httpOnly: true,
        secure: true,
      };

      const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
        res,
        user._id
      );

      return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOption)
        .cookie("refreshToken", refreshToken, cookieOption)
        .json(
          new ApiResponse(
            200,
            { accessToken, refreshToken },
            "Access token refreshed"
          )
        );
    } catch (exc: any) {
      return sendErrorResponse(
        res,
        new ApiError(401, exc.message || "Invalid refresh token")
      );
    }
  }
);

// Auth user (Social)
export const AuthUserSocial = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    try {
      // Check if user object is already attached by the middleware
      let user: any = req.user;

      // If user object is not attached, it means user needs to be fetched from req.body
      if (!user) {
        const {
          email,
          uid,
          displayName,
          photoURL,
          phoneNumber,
          providerId,
          userType,
        } = req.body;

        // Check if user already exists in the database
        user = await UserModel.findOne({ email, userType });

        if (!user) {
          // If user doesn't exist, create a new one
          if (providerId === "google.com") {
            user = await GoogleAuth(
              email,
              uid,
              displayName,
              photoURL,
              phoneNumber,
              userType
            );
          } else if (providerId === "facebook.com") {
            return res.status(400).json({
              success: false,
              message: "Facebook login is not supported yet",
            });
          }

          // Handle error while creating user
          if (user.err) {
            return res
              .status(500)
              .json({ success: false, message: user.message, error: user.err });
          }
        }
      }

      // Continue with login logic
      const USER_DATA = { ...user._doc };
      const tokenData = generateAccessAndRefreshToken(res, USER_DATA._id);

      // Format the response as per the provided JSON structure
      return res.status(200).json({
        statusCode: 200,
        data: {
          user: {
            _id: USER_DATA._id,
            firstName: USER_DATA.firstName,
            lastName: USER_DATA.lastName,
            email: USER_DATA.email,
            avatar: USER_DATA.avatar, // Add avatar if it's in USER_DATA
            userType: USER_DATA.userType, // Ensure this is available in USER_DATA
            isDeleted: false, // You might want to set this dynamically based on your logic
            createdAt: USER_DATA.createdAt, // Ensure this is available in USER_DATA
            updatedAt: USER_DATA.updatedAt, // Ensure this is available in USER_DATA
            __v: USER_DATA.__v, // Ensure this is available in USER_DATA
          },
          accessToken: (await tokenData).accessToken, // Assuming tokenData returns accessToken
          refreshToken: (await tokenData).refreshToken, // Assuming tokenData returns refreshToken
        },
        message: "User logged In successfully",
        success: true,
      });
    } catch (exc: any) {
      console.log(exc.message);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: exc.message,
      });
    }
  }
);

//---------------FORGET PASSWORD CONTROLLERS-------------//
//-------------1.send verification code to given mail
export const forgetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, userType } = req.body;
    if (!email || !userType) {
      return sendErrorResponse(res, new ApiError(400, "Email is required"));
    }
    const checkEmail = await UserModel.findOne({ email, userType });
    if (!checkEmail) {
      return sendSuccessResponse(res, 200, "Email does not exist");
    }
    const receiverEmail = checkEmail.email;
    const verificationCode = generateVerificationCode(5);
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // Expires in 15 minutes

    await OTPModel.create({
      userId: checkEmail._id,
      email: receiverEmail,
      otp: verificationCode,
      expiredAt,
    });

    const to = receiverEmail;
    const subject = "Verification code to reset password of your account";
    const html = `Dear ${checkEmail.firstName} ${checkEmail.lastName},</br>
  Thank you for joining us. You have requested OTP to reset your password. Please use this code to verify your account.Your verification code for reset password is:
</br>
  <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
    <b><h2 style="margin: 5px 0;">Verification Code: ${verificationCode}</h2></b>
  </div>`;
    await sendMail(to, subject, html);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Verification code sent to given email successfully"
        )
      );
  }
);
//-------------2.verify otp

//-------------3.Reset Password
export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, userType } = req.body;
    // const userId = req.user?._id;

    if (!email || !userType) {
      return sendErrorResponse(res, new ApiError(400, "email is required"));
    }

    const userDetails = await UserModel.findOne({ email, userType });

    if (!userDetails) {
      return sendSuccessResponse(res, 200, "User not found");
    }

    // Update the password
    userDetails.password = req.body.password;
    await userDetails.save();
    return sendSuccessResponse(res, 200, "Password reset successfull");
  }
);

//verify email during sign up by email
export const sendOTPEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
      return sendErrorResponse(res, new ApiError(400, "Email is required"));
    }
    const verificationCode = generateVerificationCode(5);
    const expiredAt = new Date(Date.now() + 5 * 60 * 1000); // Expires in 5 minutes

    await OTPModel.create({
      // userId: email,
      email: email,
      otp: verificationCode,
      expiredAt,
    });

    const to = email;
    const subject = "Verification code to reset password of your account";
    const html = `Dear User,</br>
  Please verify your email address to complete your registration.Your verification code is:
</br>
  <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
    <b><h2 style="margin: 5px 0;">Verification Code: ${verificationCode}</h2></b>
  </div>`;
    await sendMail(to, subject, html);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Verification code sent to given email successfully"
        )
      );
  }
);

// addAssociate controller
export const deleteUser = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { userId } = req.body;

    const userDetails = await UserModel.findById({ _id: userId });
    const userType = userDetails?.userType;
    if (userType === "ServiceProvider") {
      const clearAdditionalInfo = await AdditionalInfoModel.findOneAndDelete(
        userId
      );
      const clearAddress = await AddressModel.findOneAndDelete(userId);
      const clearSP = await UserModel.findOneAndDelete({
        _id: new mongoose.Types.ObjectId(userId),
      });
    } else {
      const clearCustomer = await UserModel.findOneAndDelete({
        _id: new mongoose.Types.ObjectId(userId),
      });
    }

    return sendSuccessResponse(res, 200, {}, `User deleted successfully.`);
  }
);

//get revenue
export const getRevnue = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const revenuedata = await AdminRevenueModel.find();
    if (revenuedata.length === 0) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Revenue data not found")
      );
    }
    let LeadGenerationFee = 0,
      cancellation = 0,
      incentive = 0,
      TotalminimumBalance = 0;

    revenuedata.map((item) => {
      if (item.description === "LeadGenerationFee") {
        LeadGenerationFee = LeadGenerationFee + Number(item.amount);
      } else if (item.description === "ServiceCancellationAmount") {
        cancellation = cancellation + Number(item.amount);
      } else if (item.description === "ServiceIncentiveAmount") {
        incentive = incentive + Number(item.amount);
      }
    });

    const minimumBalanceHolder = await WalletModel.find();
    minimumBalanceHolder.map((item) => {
      if (item.balance <= 200) {
        TotalminimumBalance = TotalminimumBalance + Number(item.balance);
      } else if (item.balance > 200) {
        TotalminimumBalance = TotalminimumBalance + 200;
      }
    });

    return sendSuccessResponse(
      res,
      200,
      {
        LeadGenerationFee,
        cancellation,
        incentive,
        TotalminimumBalance,
        Revenue:
          LeadGenerationFee + cancellation + incentive + TotalminimumBalance,
      },
      "Revenue fetched successfull"
    );
  }
);
