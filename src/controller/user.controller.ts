import { Request, Response } from "express";
import UserModel from "../models/user.model";
import AddressModel from "../models/address.model";
import additionalInfoModel from "../models/userAdditionalInfo.model";
import TeamModel from "../models/teams.model";
import { ApiError } from "../utils/ApisErrors";
import { sendSuccessResponse, sendErrorResponse } from "../utils/response";
import { CustomRequest } from "../../types/commonType";
import { uploadOnCloudinary } from "../utils/cloudinary";
import { asyncHandler } from "../utils/asyncHandler";
import mongoose from "mongoose";
import { deleteUploadedFiles } from "../middlewares/multer.middleware";
import IPLog from "../models/IP.model";
import BankDetails from "../models/bankDetails.model";
import PaymentMethodModel from "../models/paymentMethod.model";
import { getCardType } from "../utils/auth";
import UserPreferenceModel from "../models/userPreference.model";
import PurchaseModel from "../models/purchase.model";
import WalletModel from "../models/wallet.model";
import { STRIPE_SECRET_KEY } from "../config/config";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import Stripe from "stripe";
import AdminRevenueModel from "../models/adminRevenue.model";
import ServiceModel from "../models/service.model";
import CancellationFeeModel from "../models/cancellationFee.model";
import axios from "axios";
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-09-30.acacia" as any,
});

async function uploadToStripeFromCloudinary(imageUrl: any) {
  const response = await axios.get(imageUrl, { responseType: "arraybuffer" });

  //  Convert it to a Buffer
  const imageBuffer = Buffer.from(response.data);
  console.log({ imageBuffer });

  const stripeFile = await stripe.files.create({
    purpose: "identity_document",
    file: {
      data: imageBuffer,
      name: "id.jpg",
      type: "image/jpeg",
    },
  });
  // console.log({stripeFile});

  return stripeFile.id;
}

//  const test =  typeof(uploadToStripeFromCloudinary(
//     "https://res.cloudinary.com/dhj5yyosd/image/upload/v1760008955/fyv6wvnqaoyz5f85xlyx.png"
//   ))
//   console.log({test});

// get loggedin user
export const getUser = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userId = req.user?._id as string;

    const userDetails = await UserModel.aggregate([
      {
        $match: {
          isDeleted: false,
          _id: userId,
        },
      },
      {
        $lookup: {
          from: "additionalinfos",
          foreignField: "userId",
          localField: "_id",
          as: "additionalInfo",
        },
      },
      {
        $lookup: {
          from: "addresses",
          foreignField: "userId",
          localField: "_id",
          as: "userAddress",
        },
      },
      {
        $lookup: {
          from: "services",
          foreignField: "assignedAgentId",
          localField: "_id",
          as: "ServicesRelatedToAgent",
        },
      },
      {
        $lookup: {
          from: "teams",
          foreignField: "fieldAgentIds",
          localField: "_id",
          as: "teamDetails",
          pipeline: [
            {
              $lookup: {
                from: "additionalinfos",
                foreignField: "userId",
                localField: "serviceProviderId",
                as: "companyDetails",
              },
            },
            {
              $unwind: {
                preserveNullAndEmptyArrays: true,
                path: "$companyDetails",
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$teamDetails",
        },
      },

      {
        $addFields: {
          CompletedServicesByAgent: {
            $filter: {
              input: "$ServicesRelatedToAgent",
              as: "completedServicesByAgent",
              cond: {
                $and: [
                  {
                    $eq: [
                      "$$completedServicesByAgent.requestProgress",
                      "Completed",
                    ],
                  },
                  {
                    $eq: ["$$completedServicesByAgent.assignedAgentId", "$_id"],
                  },
                ],
              },
            },
          },
          totalAssignedToAgent: {
            $filter: {
              input: "$ServicesRelatedToAgent",
              as: "assignedServicesToAgent",
              cond: {
                $and: [
                  {
                    $or: [
                      {
                        $eq: [
                          "$$assignedServicesToAgent.requestProgress",
                          "Pending",
                        ],
                      },
                      {
                        $eq: [
                          "$$assignedServicesToAgent.requestProgress",
                          "CancelledByFA",
                        ],
                      },
                    ],
                  },
                  {
                    $eq: ["$$assignedServicesToAgent.assignedAgentId", "$_id"],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          totalCompletedServicesByAgent: { $size: "$CompletedServicesByAgent" },
          totalAssignedServicesByAgent: { $size: "$totalAssignedToAgent" },
        },
      },
      {
        $addFields: {
          agentSuccessRate: {
            $cond: {
              if: { $eq: ["$totalAssignedServicesByAgent", 0] },
              then: 0,
              else: {
                $multiply: [
                  {
                    $divide: [
                      "$totalCompletedServicesByAgent",
                      "$totalAssignedServicesByAgent",
                    ],
                  },
                  100,
                ],
              },
            },
          },
          agentAccuracy: 50,

          agentRelatedToCompany: "$teamDetails.companyDetails.companyName",
        },
      },
      {
        $project: {
          __v: 0,
          isDeleted: 0,
          refreshToken: 0,
          password: 0,
          "additionalInfo.__v": 0,
          "additionalInfo.isDeleted": 0,
          "userAddress.__v": 0,
          "userAddress.isDeleted": 0,
          ServicesRelatedToAgent: 0,
          CompletedServicesByAgent: 0,
          totalAssignedToAgent: 0,
          teamDetails: 0,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      userDetails[0],
      "User retrieved successfully."
    );
  }
);

// Add address for the user
export const addAddress = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { zipCode, latitude, longitude, addressType, location } = req.body;

    if (!zipCode || !latitude || !longitude) {
      return sendErrorResponse(
        res,
        new ApiError(400, "All address fields are required")
      );
    }

    const existingAddress = await AddressModel.findOne({
      userId: req.user?._id,
    });

    if (existingAddress) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Address already exists for this user")
      );
    }

    const geoLocation = {
      type: "Point",
      coordinates: [longitude, latitude], // [longitude, latitude]
    };
    if (!geoLocation)
      return sendErrorResponse(res, new ApiError(400, "Location is required."));

    const updateUser = await UserModel.findByIdAndUpdate(
      { _id: req.user?._id },
      { $set: { geoLocation: geoLocation } },
      { new: true }
    );

    const newAddress = new AddressModel({
      userId: req.user?._id,
      zipCode,
      latitude,
      longitude,
      addressType,
      location,
    });

    const savedAddress = await newAddress.save();

    return sendSuccessResponse(
      res,
      201,
      savedAddress,
      "Address added successfully"
    );
  }
);

export const addAdditionalInfo = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      companyName,
      companyIntroduction,
      DOB,
      driverLicense,
      EIN,
      socialSecurity,
      companyLicense,
      insurancePolicy,
      businessName,
      phone,
      totalYearExperience,
      routing_number,
      account_number,
      account_holder_name,
      account_holder_type,
    } = req.body;
    console.log("addAdditionalInfo payload:", req.body);

    // Check if additional info already exists for the user
    const existingAdditionalInfo = await additionalInfoModel.findOne({
      userId: req.user?._id,
    });

    if (existingAdditionalInfo) {
      // Delete uploaded files if they exist
      const files = req.files as
        | { [key: string]: Express.Multer.File[] }
        | undefined;
      if (files) {
        deleteUploadedFiles(files);
      }
      return sendErrorResponse(
        res,
        new ApiError(400, "Additional info already exists for this user")
      );
    }

    // Extract files from the request
    const files = req.files as
      | { [key: string]: Express.Multer.File[] }
      | undefined;

    if (!files) {
      return sendErrorResponse(
        res,
        new ApiError(400, "No files were uploaded")
      );
    }

    const companyLicenseImageFile = files.companyLicenseImage?.[0];
    const licenseProofImageFile = files.licenseProofImage?.[0];
    const businessLicenseImageFile = files.businessLicenseImage?.[0];
    const businessImageFile = files.businessImage?.[0];
    const driverLicenseImages = files.driverLicenseImage || [];

    // Ensure all required files are provided
    if (
      !companyLicenseImageFile ||
      !licenseProofImageFile ||
      !businessLicenseImageFile ||
      !businessImageFile ||
      driverLicenseImages.length < 2
    ) {
      // Delete uploaded files if they exist
      if (files) {
        deleteUploadedFiles(files);
      }
      return sendErrorResponse(
        res,
        new ApiError(
          400,
          "All files are required, including two driver license images"
        )
      );
    }
    if (
      !routing_number ||
      !account_number ||
      !account_holder_name ||
      !account_holder_type
    ) {
      return sendErrorResponse(
        res,
        new ApiError(
          400,
          "All banking details like routing_number,account_number,account_holder_name,account_holder_type are required"
        )
      );
    }

    // Upload driver license images to Cloudinary
    const uploadedDriverLicenseImages = [];
    for (const file of driverLicenseImages) {
      const uploadResult = await uploadOnCloudinary(file.path);
      if (!uploadResult) {
        return sendErrorResponse(
          res,
          new ApiError(400, "Error uploading driver license images")
        );
      }
      uploadedDriverLicenseImages.push(uploadResult.secure_url);
    }

    // Upload other files to Cloudinary
    const companyLicenseImage = await uploadOnCloudinary(
      companyLicenseImageFile.path
    );
    const licenseProofImage = await uploadOnCloudinary(
      licenseProofImageFile.path
    );
    const businessLicenseImage = await uploadOnCloudinary(
      businessLicenseImageFile.path
    );
    const businessImage = await uploadOnCloudinary(businessImageFile.path);

    // Ensure all files were uploaded successfully
    if (
      !companyLicenseImage ||
      !licenseProofImage ||
      !businessLicenseImage ||
      !businessImage
    ) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Error uploading other files")
      );
    }

    // Update phone number and DOB in user data
    const updateUser = await UserModel.findByIdAndUpdate(
      { _id: req.user?._id },
      { $set: { phone, dob: DOB } },
      { new: true }
    );

    // Create new additional info record
    const newAdditionalInfo = new additionalInfoModel({
      userId: req.user?._id,
      companyName,
      companyIntroduction,
      DOB,
      driverLicense,
      EIN,
      socialSecurity,
      companyLicense,
      insurancePolicy,
      businessName,
      totalYearExperience,
      driverLicenseImages: uploadedDriverLicenseImages,
      companyLicenseImage: companyLicenseImage.secure_url,
      licenseProofImage: licenseProofImage.secure_url,
      businessLicenseImage: businessLicenseImage.secure_url,
      businessImage: businessImage.secure_url,
      routing_number,
      account_number,
      account_holder_name,
      account_holder_type,
    });

    // Save the new additional info record
    const savedAdditionalInfo = await newAdditionalInfo.save();

    //Create the stripe connected account
    if (savedAdditionalInfo) {
      const userWallet = await WalletModel.findOne({ userId: savedAdditionalInfo?.userId });

      if (userWallet?.stripeConnectedAccountId) {
        return res.status(200).json({
          message: "Account already exists",
        });
      }

      const dob = updateUser?.dob;
      if (!dob || !(dob instanceof Date)) {
        return res.status(400).json({ error: "Invalid date of birth" });
      }

      const phoneNumber = parsePhoneNumberFromString(updateUser?.phone || "");

      const localPhone = phoneNumber ? phoneNumber.nationalNumber : "";
      console.log({ localPhone });

      const accountParams: Stripe.AccountCreateParams = {
        type: "custom",
        country: "US",
        email: updateUser?.email,
        business_type: "individual",
        capabilities: {
          transfers: { requested: true },
        },
        individual: {
          first_name: updateUser?.firstName,
          last_name: updateUser?.lastName,
          email: updateUser?.email,
          phone: localPhone,
          ssn_last_4: savedAdditionalInfo?.socialSecurity,
          dob: {
            day: dob.getDate(),
            month: dob.getMonth() + 1,
            year: dob.getFullYear(),
          },
          verification: {
            document: {
              front: await uploadToStripeFromCloudinary(
                savedAdditionalInfo?.driverLicenseImages[0]
              ),
              back: await uploadToStripeFromCloudinary(
                savedAdditionalInfo?.driverLicenseImages[1]
              ),
            },
          },
        },
        business_profile: {
          url: "https://your-test-business.com",
          mcc: "5818",
        },

        // external_account: 'btok_us_verified',
        external_account: {
          object: "bank_account",
          country: "US",
          currency: "usd",
          routing_number: savedAdditionalInfo?.routing_number as string,
          account_number: savedAdditionalInfo?.account_number as string,
          account_holder_name: savedAdditionalInfo?.account_holder_name,
          account_holder_type: savedAdditionalInfo?.account_holder_type,
        },
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: req.ip || "127.0.0.1",
        },
      };

      const account = await stripe.accounts.create(accountParams);

      await stripe.accounts.update(account.id, {
        settings: {
          payouts: {
            schedule: {
              interval: "manual",
            },
          },
        },
      });

      await new WalletModel({
        userId: updateUser?._id,
        stripeConnectedAccountId: account.id,
        balance: 0,
      }).save();

      console.log("Stripe account created successfully:", account.id);
    }

    return sendSuccessResponse(
      res,
      201,
      savedAdditionalInfo,
      "Additional info added successfully"
    );
  }
);

//get serviceProvider List
export const getServiceProviderList = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      query = "",
      sortBy = "createdAt",
      sortType = "desc",
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    const searchQuery = query
      ? {
          $or: [
            { firstName: { $regex: query, $options: "i" } },
            { lastName: { $regex: query, $options: "i" } },
            { email: { $regex: query, $options: "i" } },
          ],
        }
      : {};

    const matchCriteria = {
      isDeleted: false,
      userType: "ServiceProvider",
      ...searchQuery,
    };

    const sortCriteria: any = {};
    sortCriteria[sortBy as string] = sortType === "desc" ? -1 : 1;

    const results = await UserModel.aggregate([
      { $match: matchCriteria },
      {
        $lookup: {
          from: "additionalinfos",
          foreignField: "userId",
          localField: "_id",
          as: "additionalInfo",
        },
      },
      {
        $lookup: {
          from: "addresses",
          foreignField: "userId",
          localField: "_id",
          as: "userAddress",
        },
      },
      {
        $lookup: {
          from: "teams",
          localField: "_id",
          foreignField: "serviceProviderId",
          as: "teams",
        },
      },
      {
        $unwind: {
          path: "$teams",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "teams.fieldAgentIds",
          foreignField: "_id",
          as: "fieldAgents",
        },
      },
      {
        $addFields: {
          fieldAgentCount: { $size: "$fieldAgents" },
        },
      },
      {
        $project: {
          teams: 0,
          __v: 0,
          isDeleted: 0,
          refreshToken: 0,
          password: 0,
          "additionalInfo.__v": 0,
          "additionalInfo.isDeleted": 0,
          "userAddress.__v": 0,
          "userAddress.isDeleted": 0,
          "fieldAgents.password": 0,
          "fieldAgents.refreshToken": 0,
          "fieldAgents.isDeleted": 0,
          "fieldAgents.__v": 0,
          rawPassword: 0,
        },
      },
      { $sort: sortCriteria },
      { $skip: (pageNumber - 1) * limitNumber },
      { $limit: limitNumber },
    ]);

    const totalRecords = await UserModel.countDocuments(matchCriteria);

    return sendSuccessResponse(
      res,
      200,
      {
        serviceProviders: results,
        pagination: {
          total: totalRecords,
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "ServiceProvider list retrieved successfully."
    );
  }
);

//get registered customer list
export const getRegisteredCustomerList = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      query = "",
      sortBy = "createdAt",
      sortType = "asc",
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const pageSize = parseInt(limit as string, 10);

    const sortDirection = sortType === "asc" ? 1 : -1;

    const sortField = typeof sortBy === "string" ? sortBy : "createdAt";
    console.log("sortBy==");

    const searchFilter = {
      $or: [
        { firstName: { $regex: query, $options: "i" } },
        { lastName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    };

    const matchCriteria = {
      userType: "Customer",
      ...searchFilter,
    };

    // Fetch the total number of customers before pagination
    const totalCustomers = await UserModel.countDocuments(matchCriteria);

    // Calculate total pages
    const totalPages = Math.ceil(totalCustomers / pageSize);

    // Fetch the filtered and paginated results
    const customers = await UserModel.aggregate([
      { $match: matchCriteria },

      {
        $lookup: {
          from: "ratings",
          foreignField: "ratedTo",
          localField: "_id",
          as: "userRating",
        },
      },
      {
        $addFields: {
          customerAvgRating: { $round: [{ $avg: "$userRating.rating" }, 2] },
        },
      },
      {
        $project: {
          __v: 0,
          refreshToken: 0,
          password: 0,
          rawPassword: 0,
          userRating: 0,
        },
      },
      { $sort: { [sortField]: sortDirection } },
      { $skip: (pageNumber - 1) * pageSize },
      { $limit: pageSize },
    ]);

    return sendSuccessResponse(
      res,
      200,
      {
        customers,
        pagination: {
          total: totalCustomers,
          totalPages,
          currentPage: pageNumber,
          limit: pageSize,
        },
      },
      "Registered Customers list retrieved successfully."
    );
  }
);
//get admin user list
export const getAdminUsersList = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      query = "",
      sortBy = "createdAt",
      sortType = "asc",
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const pageSize = parseInt(limit as string, 10);

    const sortDirection = sortType === "asc" ? 1 : -1;

    const sortField = typeof sortBy === "string" ? sortBy : "createdAt";

    const searchFilter = {
      $or: [
        { firstName: { $regex: query, $options: "i" } },
        { lastName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    };

    const matchCriteria = {
      userType: { $in: ["Admin", "Finance"] },
      ...searchFilter,
    };

    const totalAdminUsers = await UserModel.countDocuments(matchCriteria);

    const totalPages = Math.ceil(totalAdminUsers / pageSize);

    const adminUsers = await UserModel.aggregate([
      { $match: matchCriteria },
      {
        $project: {
          __v: 0,
          refreshToken: 0,
          password: 0,
          rawPassword: 0,
        },
      },
      { $sort: { [sortField]: sortDirection } },
      { $skip: (pageNumber - 1) * pageSize },
      { $limit: pageSize },
    ]);

    return sendSuccessResponse(
      res,
      200,
      {
        adminUsers,
        pagination: {
          total: totalAdminUsers,
          totalPages,
          currentPage: pageNumber,
          limit: pageSize,
        },
      },
      "Admin Users list retrieved successfully."
    );
  }
);

//get all users list
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const results = await UserModel.aggregate([
    {
      $match: {
        isDeleted: false,
      },
    },
    {
      $lookup: {
        from: "additionalinfos",
        foreignField: "userId",
        localField: "_id",
        as: "additionalInfo",
      },
    },
    {
      $lookup: {
        from: "addresses",
        foreignField: "userId",
        localField: "_id",
        as: "userAddress",
      },
    },
    {
      $project: {
        __v: 0,
        isDeleted: 0,
        refreshToken: 0,
        password: 0,
        "additionalInfo.__v": 0,
        "additionalInfo.isDeleted": 0,
        "userAddress.__v": 0,
        "userAddress.isDeleted": 0,
        rawPassword: 0,
      },
    },
  ]);

  return sendSuccessResponse(
    res,
    200,
    results,
    "Users retrieved successfully."
  );
});

//get single user
export const getSingleUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      return sendErrorResponse(res, new ApiError(400, "User ID is required."));
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendErrorResponse(res, new ApiError(400, "Invalid User ID."));
    }

    const userDetails = await UserModel.aggregate([
      {
        $match: {
          isDeleted: false,
          _id: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $lookup: {
          from: "additionalinfos",
          foreignField: "userId",
          localField: "_id",
          as: "additionalInfo",
        },
      },
      {
        $lookup: {
          from: "addresses",
          foreignField: "userId",
          localField: "_id",
          as: "userAddress",
        },
      },
      {
        $lookup: {
          from: "teams",
          foreignField: "serviceProviderId",
          localField: "_id",
          as: "teamDetails",
        },
      },
      {
        $lookup: {
          from: "services",
          foreignField: "serviceProviderId",
          localField: "_id",
          as: "Services",
          pipeline: [
            {
              // requestProgress:{$or:["Completed","Pending"]}
              $match: {
                $or: [
                  { requestProgress: "Completed" },
                  { requestProgress: "Pending" },
                ],
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "services",
          foreignField: "assignedAgentId",
          localField: "_id",
          as: "ServicesRelatedToAgent",
          // pipeline: [
          //     {
          //         // requestProgress:{$or:["Completed","Pending"]}
          //         $match: {
          //             $or: [
          //                 { requestProgress: "Completed" },
          //                 { requestProgress: "Pending" }
          //             ]
          //         }
          //     }
          // ]
        },
      },

      {
        $addFields: {
          totalFieldAgent: {
            $reduce: {
              input: "$teamDetails",
              initialValue: 0,
              in: { $add: ["$$value", { $size: "$$this.fieldAgentIds" }] },
            },
          },
          CompletedServices: {
            $filter: {
              input: "$Services",
              as: "completedServices",
              cond: {
                $eq: ["$$completedServices.requestProgress", "Completed"],
              },
            },
          },
          CompletedServicesByAgent: {
            $filter: {
              input: "$ServicesRelatedToAgent",
              as: "completedServicesByAgent",
              cond: {
                $and: [
                  {
                    $eq: [
                      "$$completedServicesByAgent.requestProgress",
                      "Completed",
                    ],
                  },
                  {
                    $eq: ["$$completedServicesByAgent.assignedAgentId", "$_id"],
                  },
                ],
              },
            },
          },
          totalAssignedToAgent: {
            $filter: {
              input: "$ServicesRelatedToAgent",
              as: "assignedServicesToAgent",
              cond: {
                $and: [
                  {
                    $or: [
                      {
                        $eq: [
                          "$$assignedServicesToAgent.requestProgress",
                          "Pending",
                        ],
                      },
                      {
                        $eq: [
                          "$$assignedServicesToAgent.requestProgress",
                          "CancelledByFA",
                        ],
                      },
                    ],
                  },
                  {
                    $eq: ["$$assignedServicesToAgent.assignedAgentId", "$_id"],
                  },
                ],
              },
            },
          },
          newServices: {
            $filter: {
              input: "$Services",
              as: "completedServices",
              cond: { $eq: ["$$completedServices.requestProgress", "Pending"] },
            },
          },
        },
      },
      {
        $addFields: {
          totalCompletedServices: { $size: "$CompletedServices" },
          totalNewServices: { $size: "$newServices" },
          totalCompletedServicesByAgent: { $size: "$CompletedServicesByAgent" },
          totalAssignedServicesByAgent: { $size: "$totalAssignedToAgent" },
        },
      },
      {
        $addFields: {
          successRate: {
            $cond: {
              if: { $eq: ["$totalAssignedServicesByAgent", 0] },
              then: 0,
              else: {
                $multiply: [
                  {
                    $divide: [
                      "$totalCompletedServicesByAgent",
                      "$totalAssignedServicesByAgent",
                    ],
                  },
                  100,
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          __v: 0,
          isDeleted: 0,
          refreshToken: 0,
          password: 0,
          "additionalInfo.__v": 0,
          "additionalInfo.isDeleted": 0,
          "userAddress.__v": 0,
          "userAddress.isDeleted": 0,
          teamDetails: 0,
          CompletedServices: 0,
          Services: 0,
          newServices: 0,
          rawPassword: 0,
          ServicesRelatedToAgent: 0,
          CompletedServicesByAgent: 0,
          totalAssignedToAgent: 0,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      userDetails[0],
      "User retrieved successfully."
    );
  }
);

// verifyServiceProvider controller
export const verifyServiceProvider = asyncHandler(
  async (req: Request, res: Response) => {
    const { serviceProviderId } = req.params;
    const { isVerified }: { isVerified: boolean } = req.body;

    if (!serviceProviderId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service Provider ID is required.")
      );
    }

    if (!mongoose.Types.ObjectId.isValid(serviceProviderId)) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Invalid Service Provider ID.")
      );
    }

    const results = await UserModel.findByIdAndUpdate(
      serviceProviderId,
      { $set: { isVerified } },
      { new: true }
    ).select("-password -refreshToken -__V");

    if (!results) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service Provider not found.")
      );
    }

    const additionalInfo = await additionalInfoModel.findOne({
      userId: serviceProviderId,
    });

    // if (isVerified && results.userType === "ServiceProvider") {
    //   const userWallet = await WalletModel.findOne({ userId: results?._id });

    //   if (userWallet?.stripeConnectedAccountId) {
    //     return res.status(200).json({
    //       message: "Account already exists",
    //     });
    //   }

    //   const dob = results?.dob;
    //   if (!dob || !(dob instanceof Date)) {
    //     return res.status(400).json({ error: "Invalid date of birth" });
    //   }

    //   const phoneNumber = parsePhoneNumberFromString(results?.phone || "");

    //   const localPhone = phoneNumber ? phoneNumber.nationalNumber : "";
    //   console.log({ localPhone });

    //   const accountParams: Stripe.AccountCreateParams = {
    //     type: "custom",
    //     country: "US",
    //     email: results?.email,
    //     business_type: "individual",
    //     capabilities: {
    //       transfers: { requested: true },
    //     },
    //     individual: {
    //       first_name: results?.firstName,
    //       last_name: results?.lastName,
    //       email: results?.email,
    //       phone: localPhone,
    //       ssn_last_4: additionalInfo?.socialSecurity,
    //       dob: {
    //         day: dob.getDate(),
    //         month: dob.getMonth() + 1,
    //         year: dob.getFullYear(),
    //       },
    //       verification: {
    //         document: {
    //           front: await uploadToStripeFromCloudinary(additionalInfo?.driverLicenseImages[0]),
    //           back: await uploadToStripeFromCloudinary(additionalInfo?.driverLicenseImages[1]),
    //         },
    //       },
    //     },
    //     business_profile: {
    //       url: "https://your-test-business.com",
    //       mcc: "5818",
    //     },

    //     // external_account: 'btok_us_verified',
    //     external_account: {
    //       object: "bank_account",
    //       country: "US",
    //       currency: "usd",
    //       routing_number: additionalInfo?.routing_number as string,
    //       account_number: additionalInfo?.account_number as string,
    //       account_holder_name: additionalInfo?.account_holder_name,
    //       account_holder_type: additionalInfo?.account_holder_type,
    //     },
    //     tos_acceptance: {
    //       date: Math.floor(Date.now() / 1000),
    //       ip: req.ip || "127.0.0.1",
    //     },
    //   };

    //   const account = await stripe.accounts.create(accountParams);

    //   await stripe.accounts.update(account.id, {
    //     settings: {
    //       payouts: {
    //         schedule: {
    //           interval: "manual",
    //         },
    //       },
    //     },
    //   });

    //   await new WalletModel({
    //     userId: results?._id,
    //     stripeConnectedAccountId: account.id,
    //     balance: 0,
    //   }).save();

    //   console.log("Stripe account created successfully:", account.id);
    // }
    const message = isVerified
      ? "Service Provider profile verified successfully."
      : "Service Provider profile made unverified.";

    return sendSuccessResponse(res, 200, {}, message);
  }
);

// banUser controller
export const banUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { isDeleted }: { isDeleted: boolean } = req.body;

  if (!userId) {
    return sendErrorResponse(res, new ApiError(400, "User ID is required."));
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return sendErrorResponse(res, new ApiError(400, "Invalid User ID."));
  }

  const results = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { isDeleted } },
    { new: true }
  ).select("-password -refreshToken -__V");

  if (!results) {
    return sendErrorResponse(res, new ApiError(400, "User not found."));
  }

  const message = isDeleted
    ? "User profile made banned."
    : "User profile made unbanned.";
  return sendSuccessResponse(res, 200, {}, message);
});

export const fetchAssociates = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const serviceProviderId = req.user?._id;
    if (!serviceProviderId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service provider ID is required.")
      );
    }

    const results = await TeamModel.aggregate([
      {
        $match: {
          isDeleted: false,
          serviceProviderId: serviceProviderId,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "serviceProviderId",
          foreignField: "_id",
          as: "serviceProviderId",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$serviceProviderId",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "fieldAgentIds",
          foreignField: "_id",
          as: "teamMembers",
          pipeline: [
            {
              $lookup: {
                from: "permissions",
                localField: "_id",
                foreignField: "userId",
                as: "agentPermission",
              },
            },
          ],
        },
      },
      {
        $project: {
          _id: 1,
          serviceProviderName: {
            $concat: [
              "$serviceProviderId.firstName",
              " ",
              "$serviceProviderId.lastName",
            ],
          },
          teamMembers: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            email: 1,
            phone: 1,
            userType: 1,
            agentPermission: {
              _id: 1,
              acceptRequest: 1,
              assignJob: 1,
              fieldAgentManagement: 1,
            },
          },
        },
      },
    ]);

    if (!results || results.length === 0) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Field agents not found.")
      );
    }

    return sendSuccessResponse(
      res,
      200,
      results,
      "Field Agent list retrieved successfully."
    );
  }
);

export const assignTeamLead = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { fieldAgentId } = req.body;
    const serviceProviderId = req.user?._id;

    try {
      const team = await TeamModel.findOne({
        serviceProviderId,
        fieldAgentIds: { $in: fieldAgentId },
      });

      if (!team) {
        return res.status(400).json({
          message: "Field agent not found in the service provider's team.",
        });
      }

      const fieldAgent = await UserModel.findById(fieldAgentId);
      if (fieldAgent?.userType === "TeamLead") {
        return sendSuccessResponse(
          res,
          200,
          "This agent is already a teamlead."
        );
        return res
          .status(400)
          .json({ message: "This agent is already a teamlead." });
      }

      const updatedFieldAgent = await UserModel.findByIdAndUpdate(
        fieldAgentId,
        { userType: "TeamLead" },
        { new: true }
      );

      if (!updatedFieldAgent) {
        return res
          .status(500)
          .json({ message: "Failed to update user role to teamlead." });
      }

      return sendSuccessResponse(
        res,
        200,
        updatedFieldAgent,
        "Field agent promoted to team lead successfully."
      );
    } catch (error) {
      console.error("Error promoting field agent to team lead:", error);
      res
        .status(500)
        .json({ message: "An error occurred while assigning team lead." });
    }
  }
);

export const getAgentEngagementStatus = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const serviceProviderId = req.user?._id;
    if (!serviceProviderId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service provider ID is required.")
      );
    }

    const results = await TeamModel.aggregate([
      {
        $match: {
          isDeleted: false,
          serviceProviderId: serviceProviderId,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "serviceProviderId",
          foreignField: "_id",
          as: "serviceProviderId",
        },
      },
      {
        $unwind: {
          path: "$serviceProviderId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "fieldAgentIds",
          foreignField: "_id",
          as: "teamMembers",
          pipeline: [
            {
              $match: {
                isDeleted: false,
              },
            },
            {
              $lookup: {
                from: "services",
                localField: "_id",
                foreignField: "assignedAgentId",
                as: "engagement",
              },
            },
            {
              $addFields: {
                isEngaged: {
                  $cond: {
                    if: {
                      $gt: [{ $size: "$engagement" }, 0],
                    },
                    then: true,
                    else: false,
                  },
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          serviceProviderName: {
            $concat: [
              "$serviceProviderId.firstName",
              " ",
              "$serviceProviderId.lastName",
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          serviceProviderName: 1,
          "teamMembers._id": 1,
          "teamMembers.firstName": 1,
          "teamMembers.lastName": 1,
          "teamMembers.email": 1,
          "teamMembers.phone": 1,
          "teamMembers.userType": 1,
          "teamMembers.avatar": 1,
          "teamMembers.isEngaged": 1,
        },
      },
    ]);

    if (!results || results.length === 0) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Field agents not found.")
      );
    }

    return sendSuccessResponse(
      res,
      200,
      results,
      "Field Agent list with engagement status retrieved successfully."
    );
  }
);

// fetch IPlogs for admin
export const fetchIPlogs = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userId = req.user?._id;
    if (!userId) {
      return sendErrorResponse(res, new ApiError(400, "User does not exist"));
    }

    const iplogs = await IPLog.find({ userId: userId }).populate({
      path: "userId",
      select: "firstName lastName email phone",
    });
    return sendSuccessResponse(
      res,
      200,
      iplogs,
      "IPlogs retrieved successfully."
    );
  }
);

export const updateUser = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      return sendErrorResponse(res, new ApiError(400, "User ID is required."));
    }

    const { firstName, lastName }: { firstName: string; lastName: string } =
      req.body;
    const userAvtarFile = req.files as
      | { [key: string]: Express.Multer.File[] }
      | undefined;
    const userImgFile = userAvtarFile?.userImage
      ? userAvtarFile.userImage[0]
      : undefined;

    let userImgUrl;
    if (userImgFile) {
      const userImg = await uploadOnCloudinary(userImgFile.path);
      userImgUrl = userImg?.secure_url;
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      { _id: userId },
      {
        $set: {
          firstName: firstName,
          lastName: lastName,
          ...(userImgUrl && { avatar: userImgUrl }), // Only update image if uploaded
        },
      },
      { new: true }
    ).select("-rawPassword");

    if (!updatedUser) {
      return sendSuccessResponse(
        res,
        200,
        updatedUser,
        "User not found for updating."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      updatedUser,
      "User updated Successfully"
    );
  }
);

export const getIpLogs = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      page = 1,
      limit = 10,
      query = "",
      sortBy = "timestamp",
      sortType = "desc",
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    const searchQuery = query
      ? {
          $or: [
            { method: { $regex: query, $options: "i" } },
            { route: { $regex: query, $options: "i" } },
            { hostname: { $regex: query, $options: "i" } },
            { ipAddress: { $regex: query, $options: "i" } },
          ],
        }
      : {};

    const matchCriteria = {
      userId: req.user?._id,
      ...searchQuery,
    };

    const sortCriteria: any = {};
    sortCriteria[sortBy as string] = sortType === "desc" ? -1 : 1;

    const results = await IPLog.aggregate([
      { $match: matchCriteria },

      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userId",
        },
      },
      {
        $project: {
          __v: 0,
          isDeleted: 0,
          refreshToken: 0,
          password: 0,
          "userId.__v": 0,
          "userId.isDeleted": 0,
          "userId.password": 0,
          "userId.refreshToken": 0,
          "userId.rawPassword": 0,
          "userId.isVerified": 0,
          "userId.createdAt": 0,
          "userId.updatedAt": 0,
          "userId.fcmToken": 0,
        },
      },
      { $sort: sortCriteria },
      { $skip: (pageNumber - 1) * limitNumber },
      { $limit: limitNumber },
    ]);

    const totalRecords = await IPLog.countDocuments(matchCriteria);

    return sendSuccessResponse(
      res,
      200,
      {
        ipLogs: results,
        pagination: {
          total: totalRecords,
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "IPLogs retrieved successfully."
    );
  }
);

// Add address for the user
export const addBankDetails = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      bankName,
      accountHolderName,
      branchCode,
      accountNumber,
      cardNumber,
      cardHolderName,
    } = req.body;

    const existingAddress = await BankDetails.findOne({
      userId: req.user?._id,
    });

    if (existingAddress) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Bank Details already exists for this user")
      );
    }

    var cardType = getCardType(cardNumber ? cardNumber : "visa");

    const userAddress = new BankDetails({
      userId: req.user?._id,
      bankName,
      accountHolderName,
      branchCode,
      accountNumber,
      cardNumber,
      cardHolderName,
      cardType,
    });

    const savedBankDetails = await userAddress.save();

    return sendSuccessResponse(
      res,
      201,
      savedBankDetails,
      "Bank Details added successfully"
    );
  }
);

export const updateUserPreference = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      return sendErrorResponse(res, new ApiError(400, "User ID is required."));
    }

    const { notificationPreference }: { notificationPreference: Boolean } =
      req.body;

    const updatedUserPreference = await UserPreferenceModel.findOneAndUpdate(
      { userId: userId },
      {
        $set: {
          notificationPreference,
          updatedAt: new Date(),
        },
      },
      { new: true }
    ).select("-__v -isDeleted");

    if (!updatedUserPreference) {
      return sendSuccessResponse(
        res,
        200,
        updatedUserPreference,
        "User not found for updating."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      updatedUserPreference,
      "User preference updated successfully"
    );
  }
);

// GET /api/payment-methods
export const getPaymentMethods = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?._id;

    const paymentMethodDetails = await PaymentMethodModel.find({ userId });

    if (!paymentMethodDetails) {
      return res.status(404).json({ message: "Payment Method not found" });
    }

    return sendSuccessResponse(
      res,
      200,
      paymentMethodDetails,
      "Payment Method found successfully"
    );
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// export const getCustomersTransaction = async (
//   req: CustomRequest,
//   res: Response
// ) => {
//   try {
//     const userId = req.user?._id;

//     const transactionsDetails = await PurchaseModel.aggregate([
//       {
//         $match: {
//           userId: userId,
//         },
//       },
//       {
//         $lookup: {
//           from: "cancellationfees",
//           foreignField: "userId",
//           localField: "userId",
//           as: "cancellationDetails",
//         },
//       },
//       {
//         $lookup: {
//           from: "users",
//           foreignField: "_id",
//           localField: "userId",
//           as: "userDetails",
//         },
//       },
//       {
//         $unwind: {
//           preserveNullAndEmptyArrays: true,
//           path: "$userDetails",
//         },
//       },
//       {
//         $addFields: {
//           userName: {
//             $concat: ["$userDetails.firstName", " ", "$userDetails.lastName"],
//           },
//           userImage: "$userDetails.avatar",
//         },
//       },
//       {
//         $project: {
//           _id: 1,
//           userId: 1,
//           userName: 1,
//           userImage: 1,
//           cancellationDetails: 1,
//           serviceId: 1,
//           paymentMethodDetails: 1,
//           paymentIntentId: 1,
//           currency: 1,
//           amount: 1,
//           status: 1,
//           createdAt: 1,
//           updatedAt: 1,
//         },
//       },
//     ]);

//     if (!transactionsDetails) {
//       return res.status(404).json({ message: "No transaction was found" });
//     }

//     return sendSuccessResponse(
//       res,
//       200,
//       transactionsDetails,
//       "Transaction history fetched successfully"
//     );
//   } catch (error) {
//     console.error("Error fetching payment methods:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

export const getCustomersTransaction = async (
  req: CustomRequest,
  res: Response
) => {
  try {
    const userId = req.user?._id;

    const [purchases, cancellations] = await Promise.all([
      PurchaseModel.aggregate([
        { $match: { userId } },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            userName: {
              $concat: ["$userDetails.firstName", " ", "$userDetails.lastName"],
            },
            userImage: "$userDetails.avatar",
            type: { $literal: "incentiveFee" },
          },
        },
        {
          $project: {
            userDetails: 0,
          },
        },
      ]),
      CancellationFeeModel.aggregate([
        { $match: { userId } },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            userName: {
              $concat: ["$userDetails.firstName", " ", "$userDetails.lastName"],
            },
            userImage: "$userDetails.avatar",
            type: { $literal: "cancellationFee" },
          },
        },
        {
          $project: {
            userDetails: 0,
          },
        },
      ]),
    ]);

    const transactions = [...purchases, ...cancellations];

    return sendSuccessResponse(
      res,
      200,
      transactions,
      "Transaction history fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching customer transactions:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const fetchAdminReceivedFund = async (
  req: CustomRequest,
  res: Response
) => {
  try {
    const incentiveDetails = await PurchaseModel.aggregate([
      {
        $match: {
          status: "succeeded",
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "userId",
          as: "userDetails",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userDetails",
        },
      },
      {
        $addFields: {
          userName: {
            $concat: ["$userDetails.firstName", " ", "$userDetails.lastName"],
          },
          userImage: "$userDetails.avatar",
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          userName: 1,
          userImage: 1,
          serviceId: 1,
          paymentMethodDetails: 1,
          paymentIntentId: 1,
          currency: 1,
          amount: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);
    const cancellationFeeDetails = await PurchaseModel.aggregate([
      {
        $match: {
          status: "succeeded",
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "userId",
          as: "userDetails",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userDetails",
        },
      },
      {
        $addFields: {
          userName: {
            $concat: ["$userDetails.firstName", " ", "$userDetails.lastName"],
          },
          userImage: "$userDetails.avatar",
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          userName: 1,
          userImage: 1,
          serviceId: 1,
          paymentMethodDetails: 1,
          paymentIntentId: 1,
          currency: 1,
          amount: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      {
        incentiveDetails,
        cancellationFeeDetails,
      },
      "Transactions to admin fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const fetchAdminAllTransactions = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { page = "1", limit = "10", query = "" } = req.query;
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = {
      type: "credit",
      ...(query && {
        $or: [
          { stripeTransactionId: { $regex: query, $options: "i" } },
          { customerName: { $regex: query, $options: "i" } },
          { categoryName: { $regex: query, $options: "i" } },
        ],
      }),
    };

    const transactionsData = await AdminRevenueModel.aggregate([
      {
        $match: {
          type: "credit",
        },
      },
      {
        $lookup: {
          from: "services",
          foreignField: "_id",
          localField: "serviceId",
          as: "serviceId",
          pipeline: [
            {
              $lookup: {
                from: "categories",
                foreignField: "_id",
                localField: "categoryId",
                as: "categoryId",
              },
            },
            {
              $unwind: {
                path: "$categoryId",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: "users",
                foreignField: "_id",
                localField: "serviceProviderId",
                as: "serviceProviderId",
              },
            },
            {
              $unwind: {
                path: "$serviceProviderId",
                preserveNullAndEmptyArrays: true,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$serviceId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "userId",
          as: "userId",
          pipeline: [
            {
              $lookup: {
                from: "additionalinfos",
                foreignField: "userId",
                localField: "_id",
                as: "spCompanyDetails",
              },
            },
            {
              $unwind: {
                preserveNullAndEmptyArrays: true,
                path: "$spCompanyDetails",
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: "$userId",
        },
      },
      {
        $addFields: {
          spCompanyName: {
            $ifNull: ["$userId.spCompanyDetails.companyName", null],
          },
        },
      },
      {
        $addFields: {
          serviceProviderName: {
            $concat: [
              "$serviceId.serviceProviderId.firstName",
              " ",
              "$serviceId.serviceProviderId.lastName",
            ],
          },
          customerName: {
            $concat: ["$userId.firstName", " ", "$userId.lastName"],
          },
          categoryName: "$serviceId.categoryId.name",
          categoryCost: "$serviceId.categoryId.serviceCost",
          // serviceBookingDate: "$serviceId.serviceProviderId.createdAt",
        },
      },
      { $sort: { createdAt: -1 } },
      { $match: searchQuery },
      { $skip: skip },
      { $limit: limitNumber },

      {
        $project: {
          _id: 1,
          // userId:1,
          type: 1,
          currency: 1,
          amount: 1,
          description: 1,
          stripeTransactionId: 1,
          createdAt: 1,
          updatedAt: 1,
          serviceProviderName: 1,
          customerName: 1,
          categoryName: 1,
          categoryCost: 1,
          spCompanyName: 1,
        },
      },
    ]);
    return sendSuccessResponse(
      res,
      200,
      {
        transactionsData,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "Admin's all transactions fetched successfully"
    );
  }
);

export const getDashboardCardsDetails = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const totalCustomer = await UserModel.find({
      userType: "Customer",
      isDeleted: false,
    }).countDocuments();

    const totalServiceProvider = await UserModel.find({
      userType: "ServiceProvider",
      isVerified: true,
      isDeleted: false,
    }).countDocuments();

    const totalGeneratedService = await ServiceModel.find({}).countDocuments();

    const balance = await stripe.balance.retrieve();
    const avilable = balance.available[0].amount;
    const pending = balance.pending[0].amount;

    return sendSuccessResponse(
      res,
      200,
      {
        totalCustomer,
        totalServiceProvider,
        totalGeneratedService,
        balance: {
          avilable,
          pending,
        },
      },
      "Dashboard card details fetched successfully"
    );
  }
);
