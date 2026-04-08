import { Request, Response } from "express";
import { CustomRequest } from "../../types/commonType";
import ServiceModel from "../models/service.model";
import AddressModel from "../models/address.model";
import { ApiError } from "../utils/ApisErrors";
import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import mongoose from "mongoose";
import { IAddServicePayloadReq } from "../../types/requests_responseType";
import PermissionModel from "../models/permission.model";
import TeamModel from "../models/teams.model";
import UserModel from "../models/user.model";
import { PipelineStage } from "mongoose";
import axios from "axios";
import { sendPushNotification } from "../utils/sendPushNotification";
import { isNotificationPreferenceOn } from "../utils/auth";
import WalletModel from "../models/wallet.model";
import { transferIncentiveToSP } from "./stripe.controller";
import { sendSMS } from "./otp.controller";
import tzLookup from "tz-lookup";
import moment from "moment-timezone";
import ShiftModel from "../models/shift.model";
import AdditionalInfoModel from "../models/userAdditionalInfo.model";
const testFcm =
  "fVSB8tntRb2ufrLcySfGxs:APA91bH3CCLoxCPSmRuTo4q7j0aAxWLCdu6WtAdBWogzo79j69u8M_qFwcNygw7LIGrLYBXFqz2SUZI-4js8iyHxe12BMe-azVy2v7d22o4bvxy2pzTZ4kE";

//is cancellation fee is applicable or not
export async function isCancellationFeeApplicable(serviceId: String) {
  let serviceDeatils = await ServiceModel.findById(serviceId);
  let requestProgress: String = "",
    isCancellationFeeApplicable = false;
  requestProgress = serviceDeatils?.requestProgress || "";
  var serviceStartDate = serviceDeatils?.serviceStartDate;

  if (requestProgress === "Pending" || requestProgress === "CancelledBySP") {
    const givenTimestamp = serviceStartDate && new Date(serviceStartDate);
    console.log({ givenTimestamp });

    const currentTimestamp = new Date();
    const diffInMilliseconds =
      givenTimestamp && givenTimestamp.getTime() - currentTimestamp.getTime();
    const diffInHours = diffInMilliseconds
      ? diffInMilliseconds / (1000 * 60 * 60)
      : 0;
    console.log(diffInHours, "diffInHours");

    if (diffInHours < 24) {
      console.log("triggered");

      isCancellationFeeApplicable = true;
    }
  } else if (
    requestProgress === "Started" ||
    requestProgress === "Completed" ||
    requestProgress === "CancelledByFA"
  ) {
    isCancellationFeeApplicable = true;
  }

  return isCancellationFeeApplicable;
}

// addService controller
export const addService = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    let locationDetails: any, finalLongitude, finalLatitude, finalLocation;

    const {
      categoryId,
      serviceStartDate,
      serviceShifftId,
      SelectedShiftTime,
      serviceZipCode,
      serviceAddress,
      serviceLatitude,
      serviceLongitude,
      useMyCurrentLocation,
      serviceLandMark,
      userPhoneNumber,
      isIncentiveGiven,
      incentiveAmount,
      isTipGiven,
      tipAmount,
      otherInfo,
      serviceProductImage,
      answerArray,
      serviceAddressId, // Expecting answerArray instead of answers
    }: IAddServicePayloadReq = req.body;
    console.log(req.body);

    // Validate required fields
    if (!categoryId)
      return sendErrorResponse(
        res,
        new ApiError(400, "Category ID is required.")
      );
    if (!serviceStartDate)
      return sendErrorResponse(
        res,
        new ApiError(400, "Service start date is required.")
      );
    if (!serviceShifftId)
      return sendErrorResponse(
        res,
        new ApiError(400, "Service shift ID is required.")
      );
    if (!SelectedShiftTime)
      return sendErrorResponse(
        res,
        new ApiError(400, "Selected shift time is required.")
      );
    if (!answerArray || !Array.isArray(answerArray))
      return sendErrorResponse(
        res,
        new ApiError(400, "Answer array is required and must be an array.")
      );

    if (useMyCurrentLocation) {
      if (!serviceLatitude || !serviceLongitude)
        return sendErrorResponse(
          res,
          new ApiError(400, "Service latitude and longitude is required.")
        );
      if (!serviceAddress)
        return sendErrorResponse(
          res,
          new ApiError(400, "Service address is required.")
        );

      finalLongitude = serviceLongitude;
      finalLatitude = serviceLatitude;

      finalLocation = {
        type: "Point",
        coordinates: [finalLongitude, finalLatitude], // [longitude, latitude]
      };
    }

    const Service_Requested_From_Timezone = "America/New_York";

    const serviceCreatedAt = moment()
      .clone()
      .tz(Service_Requested_From_Timezone);
    console.log({ Service_Requested_From_Timezone });

    const FormattedServiceStartDate = String(serviceStartDate).replace(
      /\.000\+00:00$/,
      "-04:00"
    );
    const tetsStartDate = new Date(`${serviceStartDate}T04:00:00Z`);
    console.log("datestring_original", serviceStartDate);
    console.log("test date string", tetsStartDate);
    console.log("datestring", String(serviceStartDate));
    console.log({ FormattedServiceStartDate });

    // **Step 1: Check the count of unique pre-saved addresses for the user**
    const existingAddresses = await ServiceModel.aggregate([
      { $match: { userId: req.user?._id } },
      {
        $group: {
          _id: { serviceAddress: "$serviceAddress" },
          count: { $sum: 1 },
        },
      },
    ]);

    if (existingAddresses.length >= 600) {
      return sendErrorResponse(
        res,
        new ApiError(400, "You cannot have more than six pre-saved addresses.")
      );
    }

    // Conditional checks for incentive and tip amounts
    if (
      isIncentiveGiven &&
      (incentiveAmount === undefined || incentiveAmount <= 0)
    ) {
      return sendErrorResponse(
        res,
        new ApiError(
          400,
          "Incentive amount must be provided and more than zero if incentive is given."
        )
      );
    }
    if (isTipGiven && (tipAmount === undefined || tipAmount <= 0)) {
      return sendErrorResponse(
        res,
        new ApiError(
          400,
          "Tip amount must be provided and more than zero if tip is given."
        )
      );
    }

    if (!serviceAddressId) {
      if (!useMyCurrentLocation) {
        if (!serviceZipCode)
          return sendErrorResponse(
            res,
            new ApiError(
              400,
              "Service ZIP code is required for manual address."
            )
          );
        if (!serviceAddress)
          return sendErrorResponse(
            res,
            new ApiError(
              400,
              "Service address  is required for manual address."
            )
          );

        //extracting coordinates from zip code
        const apiKey = process.env.GOOGLE_API_KEY;
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${serviceZipCode}&key=${apiKey}`;

        const geocodeResponse = await axios.get(geocodeUrl);

        locationDetails = geocodeResponse?.data?.results[0];

        if (!locationDetails)
          return sendErrorResponse(
            res,
            new ApiError(400, "Service ZIP code is invalid.")
          );

        let fetchedCoordinates = {
          longitude: locationDetails?.geometry?.location?.lng,
          latitude: locationDetails?.geometry?.location?.lat,
        };
        finalLongitude = fetchedCoordinates.longitude;
        finalLatitude = fetchedCoordinates.latitude;

        finalLocation = {
          type: "Point",
          coordinates: [finalLongitude, finalLatitude], // [longitude, latitude]
        };
      }
    }

    if (serviceAddressId) {
      const previouslybookedAddress = await ServiceModel.findOne({
        _id: serviceAddressId,
      }).select("serviceLatitude serviceLongitude location");
      // console.log(previouslybookedAddress);

      if (previouslybookedAddress) {
        finalLongitude = previouslybookedAddress.serviceLongitude;
        finalLatitude = previouslybookedAddress.serviceLatitude;
      }
      finalLocation = {
        type: "Point",
        coordinates: [finalLongitude, finalLatitude], // [longitude, latitude]
      };
    }

    const geoUrlfindNeighbour = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${finalLatitude},${finalLongitude}&radius=10000&type=locality&key=${process.env.GOOGLE_API_KEY}`;
    const findNeighbour = await axios.get(geoUrlfindNeighbour);

    const neighbourLandmark = findNeighbour.data?.results
      ? findNeighbour.data?.results[0]?.name
      : "N/A";

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${finalLatitude},${finalLongitude}&key=${process.env.GOOGLE_API_KEY}`;

    const response = await axios.get(url);
    const results = response.data.results;
    let landmarkPostalcode = "";

    for (let result of results) {
      for (let component of result.address_components) {
        if (component.types.includes("postal_code")) {
          landmarkPostalcode = component.long_name; // e.g. "110001"
        }
      }
    }

    // Prepare the new service object
    const newService = await ServiceModel.create({
      categoryId,
      serviceShifftId,
      SelectedShiftTime,
      serviceStartDate: tetsStartDate,
      useMyCurrentLocation,
      serviceZipCode,
      serviceLatitude: finalLatitude,
      serviceLongitude: finalLongitude,
      neighbourLandmark,
      landmarkPostalcode,
      serviceAddress: serviceAddress,
      serviceLandMark: serviceLandMark,
      location: finalLocation,
      isIncentiveGiven,
      incentiveAmount: incentiveAmount === null ? 0 : incentiveAmount,
      isTipGiven,
      tipAmount,
      otherInfo,
      answerArray,
      serviceProductImage,
      userId: req.user?._id,
      createdAt: serviceCreatedAt,
      updatedAt: serviceCreatedAt,
    });
    console.log("created service data : ", newService);

    if (userPhoneNumber) {
      const addNumber = await UserModel.findByIdAndUpdate(
        {
          userId: req.user?._id,
        },
        {
          $set: {
            phone: userPhoneNumber,
          },
        }
      );
    }

    if (!newService) {
      return sendErrorResponse(
        res,
        new ApiError(
          500,
          "Something went wrong while creating the Service Request."
        )
      );
    }

    return sendSuccessResponse(
      res,
      201,
      newService,
      "Service Request added Successfully"
    );
  }
);

// getServiceRequestList controller
export const getServiceRequestList = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = "1",
      limit = "10",
      query = "",
      sortBy = "createdAt",
      sortType = "desc",
    } = req.query;
    console.log(req.query);

    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = {
      isDeleted: false,
      ...(query && {
        $or: [
          { "userId.firstName": { $regex: query, $options: "i" } },
          { "userId.lastName": { $regex: query, $options: "i" } },
          { requestProgress: { $regex: query, $options: "i" } },
          { email: { $regex: query, $options: "i" } },
        ],
      }),
    };

    const validSortBy = (sortBy as string) || "createdAt";
    const validSortType =
      (sortType as string).toLowerCase() === "desc" ? -1 : 1;

    const sortCriteria: any = {};
    sortCriteria[validSortBy] = validSortType;

    const results = await ServiceModel.aggregate([
      { $match: { isDeleted: false } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userId",
        },
      },
      { $unwind: "$userId" },

      {
        $addFields: {
          timeInQueue: {
            $cond: {
              if: { $ne: ["$acceptedAt", null] },
              then: {
                $dateDiff: {
                  startDate: "$createdAt",
                  endDate: "$acceptedAt",
                  unit: "minute",
                },
              },
              else: 0,
            },
          },
        },
      },

      { $match: searchQuery },
      { $sort: { [validSortBy]: validSortType } },
      { $skip: skip },
      { $limit: limitNumber },
      {
        $project: {
          _id: 1,
          serviceStartDate: 1,
          requestProgress: 1,
          tipAmount: 1,
          incentiveAmount: 1,
          "userId.firstName": 1,
          "userId.lastName": 1,
          // userName: { $concat: ["$userId.firstName", " ", "$userId.lastName"] },
          createdAt: 1,
          acceptedAt: 1,
          startedAt: 1,
          completedAt: 1,
          timeInQueue: 1,
        },
      },
    ]);
    // console.log({ results });
    const totalRecords = await ServiceModel.aggregate([
      { $match: { isDeleted: false } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userId",
        },
      },
      { $unwind: "$userId" },
      { $match: searchQuery },
      { $count: "total" },
      { $sort: { updatedAt: -1 } },
    ]);

    const total = totalRecords[0]?.total || 0;
    // console.log(total);

    return sendSuccessResponse(
      res,
      200,
      {
        serviceRequests: results,
        pagination: {
          totalRecords: total,
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "All Service requests retrieved successfully."
    );
  }
);

// get accepted ServiceRequest controller
export const getAcceptedServiceRequestInJobQueue = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    console.log(await isCancellationFeeApplicable("67d27d035ddbaf78d6bea182"));

    const { page = "1", limit = "10", query = "" } = req.query;
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = {
      isUserBanned: false,
      ...(query && {
        $or: [
          { customerName: { $regex: query, $options: "i" } },
          { requestProgress: { $regex: query, $options: "i" } },
        ],
      }),
    };

    const results = await ServiceModel.aggregate([
      {
        $match: {
          $or: [
            { requestProgress: "Pending" },
            { requestProgress: "CancelledByFA" },
          ],
          assignedAgentId: null,
          serviceProviderId: req.user?._id,
          isReqAcceptedByServiceProvider: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userId",
          pipeline: [
            {
              $lookup: {
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "userRatings",
              },
            },
            {
              $addFields: {
                totalRatings: { $ifNull: [{ $size: "$userRatings" }, 0] },
                userAvgRating: {
                  $ifNull: [{ $avg: "$userRatings.rating" }, 0],
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userId",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$categoryDetails",
        },
      },
      { $sort: { acceptedAt: -1 } },

      {
        $project: {
          categoryName: "$categoryDetails.name",
          customerName: {
            $concat: ["$userId.firstName", " ", "$userId.lastName"],
          },
          distance: 1,
          serviceStartDate: 1,
          serviceAddress: 1,
          isIncentiveGiven: 1,
          incentiveAmount: 1,
          requestProgress: 1,
          totalRatings: "$userId.totalRatings",
          userAvgRating: "$userId.userAvgRating",
          userAvtar: "$userId.avatar",
          isUserBanned: "$userId.isDeleted",
          serviceProviderId: 1,
          updatedAt: 1,
        },
      },
      // {
      //     $match: {
      //         isUserBanned: false
      //     }
      // },
      { $match: searchQuery },
      { $skip: skip },
      { $limit: limitNumber },
    ]);

    return sendSuccessResponse(
      res,
      200,
      {
        results,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "Job queue retrieved successfully."
    );
  }
);

// updateService controller by customer
export const cancelServiceRequest = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      requestProgress,
      serviceId,
      cancellationReason,
    }: {
      requestProgress: string;
      serviceId: string;
      cancellationReason: string;
    } = req.body;
    console.log(req.body);

    if (!serviceId || !requestProgress) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service ID and request progress are required.")
      );
    }

    const serviceDetails = await ServiceModel.findById(serviceId);
    if (!serviceDetails) {
      return sendErrorResponse(res, new ApiError(404, "Service not found."));
    }
    let isChragesAppicable = await isCancellationFeeApplicable(serviceId);

    if (isChragesAppicable) {
      return sendErrorResponse(
        res,
        new ApiError(
          403,
          "Service starts within 24 hours. A cancellation fee of 25% will be charged."
        )
      );
    }

    const updatedService = await ServiceModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(serviceId), userId: req.user?._id },
      {
        $set: {
          requestProgress: "Blocked",
          cancelledBy: req.user?._id,
          cancellationReason: cancellationReason,
          serviceProviderId: null,
          assignedAgentId: null,
        },
      },
      { new: true }
    );

    if (!updatedService) {
      return sendSuccessResponse(res, 200, "Service not found for updating.");
    }
    if (updatedService.serviceProviderId) {
      const userFcm = req.user?.fcmToken || "";
      const notiTitle = "Service Requested Cancelled by Customer ";
      const notiBody = `${req.user?.firstName ?? "User"} ${
        req.user?.lastName ?? ""
      } has cancelled the service request`;
      const notiData1 = {
        senderId: req.user?._id,
        receiverId: updatedService.serviceProviderId,
        title: notiTitle,
        notificationType: "Customer Cancelled Service",
      };
      // const notifyUser1 = await sendNotification(userFcm, notiTitle, notiBody, notiData1)
    }

    return sendSuccessResponse(
      res,
      200,
      "Service Request cancelled Successfully"
    );
  }
);

// updateService controller
export const addorUpdateIncentive = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      incentiveAmount,
      serviceId,
    }: {
      isIncentiveGiven: boolean;
      incentiveAmount: number;
      serviceId: string;
    } = req.body;
    console.log("addorUpdateIncentive req.body", req.body);
    console.log(typeof req.body.incentiveAmount);

    if (!serviceId || !incentiveAmount) {
      return sendErrorResponse(
        res,
        new ApiError(
          400,
          "Service ID, incentive check and incentive amount is required."
        )
      );
    }

    const serviceDeatils = await ServiceModel.findById({ _id: serviceId });
    let dataToUpdate = {};
    let previousIncentiveAmount = serviceDeatils?.incentiveAmount;
    if (
      previousIncentiveAmount === 0 &&
      serviceDeatils?.isIncentiveGiven === false
    ) {
      dataToUpdate = {
        isIncentiveGiven: true,
        incentiveAmount,
      };
    } else {
      dataToUpdate = {
        isIncentiveGiven: true,
        // $inc:{incentiveAmount:Number(incentiveAmount)}
        incentiveAmount:
          Number(incentiveAmount) + Number(previousIncentiveAmount),
      };
    }

    const updatedService = await ServiceModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(serviceId), userId: req.user?._id },
      {
        $set: dataToUpdate,
      },
      { new: true }
    );
    console.log({ updatedService });

    if (!updatedService) {
      return sendSuccessResponse(
        res,
        200,
        "Service request not found for updating."
      );
    }

    return sendSuccessResponse(
      res,
      200,
      "Incentive added for the service request."
    );
  }
);

export const handleServiceRequestState = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userType = req.user?.userType;
    let userId = req.user?._id;
    const { serviceId } = req.params;
    const {
      isReqAcceptedByServiceProvider,
      requestProgress,
    }: { isReqAcceptedByServiceProvider: boolean; requestProgress: string } =
      req.body;
    if (!serviceId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service ID is required.")
      );
    }
    const serviceRequest = await ServiceModel.findById(serviceId);
    if (!serviceRequest) {
      return sendErrorResponse(res, new ApiError(400, "Service not found."));
    }
    const customerDetails = await UserModel.findById(serviceRequest?.userId);
    if (!customerDetails) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Customer details not found.")
      );
    }
    const serviceProviderDetails = await UserModel.findById(
      serviceRequest?.serviceProviderId
    ).select("serviceProviderId");
    let serviceProviderId = userId;
    if (userType === "TeamLead") {
      const permissions = await PermissionModel.findOne({ userId }).select(
        "acceptRequest"
      );
      if (!permissions?.acceptRequest) {
        return sendErrorResponse(
          res,
          new ApiError(403, "Permission denied: Accept Request not granted.")
        );
      }
      const team = await TeamModel.findOne({
        isDeleted: false,
        fieldAgentIds: userId,
      }).select("serviceProviderId");
      if (!team || !team.serviceProviderId) {
        return sendErrorResponse(
          res,
          new ApiError(400, "Service Provider ID not found for team.")
        );
      }
      serviceProviderId = team.serviceProviderId;
    }
    if (userType === "FieldAgent") {
      if (!serviceRequest.assignedAgentId) {
        return sendErrorResponse(
          res,
          new ApiError(403, "Job is not assigned yet. Permission denied.")
        );
      }
      if (serviceRequest.assignedAgentId.toString() !== userId?.toString()) {
        return sendErrorResponse(
          res,
          new ApiError(
            403,
            "Permission denied: You are not assigned to this service."
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
          new ApiError(400, "Service Provider ID not found for team.")
        );
      }
      serviceProviderId = team.serviceProviderId;
    }
    const updateData: any = {
      isReqAcceptedByServiceProvider,
      updatedAt: Date.now(),
    };
    if (isReqAcceptedByServiceProvider) {
      updateData.serviceProviderId = serviceProviderId;
      //a newly created service request or a service cancelled by sp can be accepted again by SPs
      if (
        serviceRequest.requestProgress === "NotStarted" ||
        serviceRequest.requestProgress === "CancelledBySP"
      ) {
        if (requestProgress === "Pending") {
          const spWalletDetails = await WalletModel.findOne({ userId });
          if (!spWalletDetails) {
            return res.status(400).json({
              message: "User does not have a connected Wallet account",
            });
          }
          if (spWalletDetails?.balance <= 200) {
            return res.status(400).json({
              message:
                "Insufficient balance (minimum $200 wallet balance required)",
            });
          }

          updateData.requestProgress = "Pending";
          updateData.acceptedAt = Date.now();
        }
        const notificationContent = `Your Service Request is accepted by ${
          req.user?.firstName ?? "User"
        } ${req.user?.lastName ?? ""}`;
        await sendPushNotification(
          serviceRequest?.userId.toString() as string,
          // userId?.toString() as string,
          "Service Request Accepted",
          notificationContent,
          {
            senderId: req.user?._id,
            receiverId: serviceRequest.userId,
            title: notificationContent,
            notificationType: "Service Accepted",
          }
        );
        const customerPhoneNumber = customerDetails?.phone;
        // await sendSMS(customerPhoneNumber, notificationContent);
      }
      //if a service is in accepted mode or CancelledByFA mode then one can start that service by assigning FA...
      if (
        (serviceRequest.requestProgress === "Pending" ||
          serviceRequest.requestProgress === "CancelledByFA") &&
        requestProgress === "Started"
      ) {
        updateData.requestProgress = "Started";
        updateData.startedAt = new Date();
        const notificationContent = `${req.user?.firstName ?? "User"} ${
          req.user?.lastName ?? ""
        } has marked the job as started`;
        if (req.user?.userType === "ServiceProvider") {
          await sendPushNotification(
            serviceRequest?.userId.toString() as string,
            // userId?.toString() as string,
            "Mark job as started",
            notificationContent,
            {
              senderId: req.user?._id,
              receiverId: serviceRequest.userId,
              title: notificationContent,
              notificationType: "Service Started",
            }
          );
          const customerPhoneNumber = customerDetails?.phone;
          // await sendSMS(customerPhoneNumber, notificationContent);
        } else if (req.user?.userType === "FieldAgent") {
          await sendPushNotification(
            serviceRequest?.serviceProviderId.toString() as string,
            // userId?.toString() as string,
            "Mark job as started",
            notificationContent,
            {
              senderId: req.user?._id,
              receiverId: serviceRequest.serviceProviderId,
              title: notificationContent,
              notificationType: "Service Started",
            }
          );
          await sendPushNotification(
            serviceRequest?.userId.toString() as string,
            // userId?.toString() as string,
            "Mark job as started",
            notificationContent,
            {
              senderId: req.user?._id,
              receiverId: serviceRequest.userId,
              title: notificationContent,
              notificationType: "Service Started",
            }
          );
          const customerPhoneNumber = customerDetails?.phone;
          // await sendSMS(customerPhoneNumber, notificationContent);
        }
      }
      if (
        serviceRequest.requestProgress === "Started" &&
        requestProgress === "Completed"
      ) {
        updateData.requestProgress = "Completed";
        updateData.completedAt = new Date();
        const notificationContent = `${req.user?.firstName ?? "User"} ${
          req.user?.lastName ?? ""
        } has marked the job as completed`;
        if (req.user?.userType === "ServiceProvider") {
          await sendPushNotification(
            serviceRequest?.userId.toString() as string,
            // userId?.toString() as string,
            "Mark job as completed",
            notificationContent,
            {
              senderId: req.user?._id,
              receiverId: serviceRequest.userId,
              title: notificationContent,
              notificationType: "Service Started",
            }
          );
          const customerPhoneNumber = customerDetails?.phone;
          // await sendSMS(customerPhoneNumber, notificationContent);
        } else if (req.user?.userType === "FieldAgent") {
          await sendPushNotification(
            serviceRequest?.serviceProviderId.toString() as string,
            // userId?.toString() as string,
            "Mark job as completed",
            notificationContent,
            {
              senderId: req.user?._id,
              receiverId: serviceRequest.serviceProviderId,
              title: notificationContent,
              notificationType: "Service Started",
            }
          );
          await sendPushNotification(
            serviceRequest?.userId.toString() as string,
            // userId?.toString() as string,
            "Mark job as completed",
            notificationContent,
            {
              senderId: req.user?._id,
              receiverId: serviceRequest.userId,
              title: notificationContent,
              notificationType: "Service Started",
            }
          );
          const customerPhoneNumber = customerDetails?.phone;
          // await sendSMS(customerPhoneNumber, notificationContent);
        }
      }
    }
    if (
      serviceRequest.requestProgress !== "NotStarted" &&
      requestProgress === "Cancelled"
    ) {
      if (userType === "ServiceProvider") {
        (updateData.requestProgress = "CancelledBySP"),
          (updateData.isReqAcceptedByServiceProvider = false);
        updateData.cancelledBy = req.user?._id;
        updateData.serviceProviderId = null;
        const notificationContent = `${req.user?.firstName ?? "User"} ${
          req.user?.lastName ?? ""
        } has marked the job as cancelled`;
        await sendPushNotification(
          serviceRequest?.userId.toString() as string,
          // userId?.toString() as string,
          "Mark job as cancelled",
          notificationContent,
          {
            senderId: req.user?._id,
            receiverId: serviceRequest.userId,
            title: notificationContent,
            notificationType: "Service Started",
          }
        );
        const customerPhoneNumber = customerDetails?.phone;
        // await sendSMS(customerPhoneNumber, notificationContent);
      }
      if (userType === "FieldAgent") {
        (updateData.requestProgress = "CancelledByFA"),
          (updateData.cancelledBy = req.user?._id);
        updateData.assignedAgentId = null;
        const notificationContent = `${req.user?.firstName ?? "User"} ${
          req.user?.lastName ?? ""
        } has marked the job as cancelled`;
        await sendPushNotification(
          serviceRequest?.serviceProviderId.toString() as string,
          "Mark job as cancelled",
          notificationContent,
          {
            senderId: req.user?._id,
            receiverId: serviceRequest.serviceProviderId,
            title: notificationContent,
            notificationType: "Service Cancelled",
          }
        );
      }
    }
    const updatedService = await ServiceModel.findByIdAndUpdate(
      serviceId,
      { $set: updateData },
      { new: true }
    );
    if (!updatedService) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service not found for updating.")
      );
    }
    if (requestProgress === "Pending") {
      return sendSuccessResponse(
        res,
        200,
        { updatedService },
        "Service request accepted successfully."
      );
    }
    if (requestProgress === "Started") {
      await transferIncentiveToSP(serviceId);
      return sendSuccessResponse(
        res,
        200,
        { updatedService },
        "Service request started successfully."
      );
    }
    if (requestProgress === "Completed") {
      let totalExecutionTimeInMinutes = 0;
      if (updatedService.completedAt && updatedService.startedAt) {
        totalExecutionTimeInMinutes =
          (new Date(updatedService.completedAt).getTime() -
            new Date(updatedService.startedAt).getTime()) /
          (1000 * 60);
      }
      return sendSuccessResponse(
        res,
        200,
        { updatedService, totalExecutionTimeInMinutes },
        "Service request completed successfully."
      );
    }
    return sendSuccessResponse(
      res,
      200,
      { updatedService },
      "Service request cancelled successfully."
    );
  }
);

// deleteService controller
export const deleteService = asyncHandler(
  async (req: Request, res: Response) => {
    const { serviceId } = req.params;
    if (!serviceId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service ID is required.")
      );
    }

    // Remove the Category from the database
    const deletedService = await ServiceModel.findByIdAndUpdate(serviceId, {
      $set: { isDeleted: true },
    });

    if (!deletedService) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service  not found for deleting.")
      );
    }

    return sendSuccessResponse(res, 200, {}, "Service deleted successfully");
  }
);

// fetch nearby ServiceRequest controller
export const fetchServiceRequest = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      page = "1",
      limit = "10",
      query = "",
      sortBy = "isIncentiveGiven",
      sortType = "desc",
      categoryName = "",
    } = req.query;
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = {
      isDeleted: false,
      ...(query && {
        $or: [
          { serviceAddress: { $regex: query, $options: "i" } },
          { "userId.firstName": { $regex: query, $options: "i" } },
          { "userId.lastName": { $regex: query, $options: "i" } },
          { "categoryDetails.name": { $regex: query, $options: "i" } },
        ],
      }),
    };

    const validSortBy =
      (sortBy as string) || "isIncentiveGiven" || "incentiveAmount";
    const validSortType =
      (sortType as string).toLowerCase() === "desc" ? -1 : 1;

    const sortCriteria: any = {};
    sortCriteria[validSortBy] = validSortType;

    const userId = req.user?._id as string; //sp
    const userType = req.user?.userType;

    let serviceProviderId: string | undefined;
    let address: any;

    if (userType === "TeamLead") {
      const team = await TeamModel.aggregate([
        {
          $match: {
            isDeleted: false,
            fieldAgentIds: userId,
          },
        },
      ]);

      if (team.length === 0) {
        return sendErrorResponse(res, new ApiError(400, "Team not found."));
      }

      serviceProviderId = team[0].serviceProviderId;
      if (!serviceProviderId) {
        return sendErrorResponse(
          res,
          new ApiError(400, "Service Provider ID not found in team.")
        );
      }

      address = await AddressModel.findOne({ userId: serviceProviderId });
    } else {
      address = await AddressModel.findOne({ userId });
    }

    if (
      !address ||
      !address.zipCode ||
      !address.longitude ||
      !address.latitude
    ) {
      return sendErrorResponse(
        res,
        new ApiError(400, "User's location not found.")
      );
    }

    const longitude = address.longitude;
    const latitude = address.latitude;
    // Extract coordinates and validate
    const serviceProviderLongitude: number = parseFloat(longitude);
    const serviceProviderLatitude: number = parseFloat(latitude);

    if (isNaN(serviceProviderLongitude) || isNaN(serviceProviderLatitude)) {
      return sendErrorResponse(
        res,
        new ApiError(400, `Invalid longitude or latitude`)
      );
    }
    const radius = 400000000; // in meters

    const serviceRequests = await ServiceModel.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [serviceProviderLongitude, serviceProviderLatitude],
          },
          distanceField: "distance",
          spherical: true,
          maxDistance: radius,
        },
      },
      {
        $match: {
          isDeleted: false,
          isReqAcceptedByServiceProvider: false,
          $or: [
            { requestProgress: "NotStarted" },
            { requestProgress: "CancelledBySP" },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userId",
          pipeline: [
            {
              $lookup: {
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "userRatings",
              },
            },
            {
              $addFields: {
                totalRatings: { $ifNull: [{ $size: "$userRatings" }, 0] },
                userAvgRating: {
                  $ifNull: [{ $avg: "$userRatings.rating" }, 0],
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userId",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$categoryDetails",
        },
      },
      { $match: searchQuery },
      // { $sort: { isIncentiveGiven: validSortType } },

      {
        $project: {
          categoryName: "$categoryDetails.name",
          LeadGenerationFee: {
            $floor: {
              $multiply: [{ $toDouble: "$categoryDetails.serviceCost" }, 0.25],
            },
          },
          customerName: {
            $concat: ["$userId.firstName", " ", "$userId.lastName"],
          },
          distance: 1,
          serviceStartDate: 1,
          serviceAddress: 1,
          isIncentiveGiven: 1,
          incentiveAmount: 1,
          requestProgress: 1,
          totalRatings: "$userId.totalRatings",
          userAvgRating: "$userId.userAvgRating",
          userAvtar: "$userId.avatar",
          isUserBanned: "$userId.isDeleted",
          createdAt: 1,
          neighbourLandmark: 1,
          landmarkPostalcode: 1,
        },
      },
      {
        $match: {
          isUserBanned: false,
        },
      },
      { $skip: skip },
      { $limit: limitNumber },
      { $sort: { createdAt: -1, isIncentiveGiven: -1, incentiveAmount: -1 } },
    ]);
    if (!serviceRequests.length) {
      return sendSuccessResponse(
        res,
        200,
        serviceRequests,
        "No nearby service request found"
      );
    }
    const totalRecords = await ServiceModel.countDocuments({
      isDeleted: false,
      isReqAcceptedByServiceProvider: false,
      $or: [
        { requestProgress: "NotStarted" },
        { requestProgress: "CancelledBySP" },
      ],
    });
    // const total = serviceRequests[0] ? serviceRequests.length : 0
    return sendSuccessResponse(
      res,
      200,
      {
        serviceRequests,
        pagination: {
          totalRecords: totalRecords,
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "Service requests fetched successfully"
    );
  }
);

//fetch nearby service provider
export const fetchNearByServiceProvider = asyncHandler(
  async (req: Request, res: Response) => {
    const { serviceRequestId } = req.params;

    if (!serviceRequestId) {
      return sendErrorResponse(
        res,
        new ApiError(400, `Invalid ServiceRequest ID`)
      );
    }

    const serviceRequest = await ServiceModel.findById(serviceRequestId);
    if (!serviceRequest) {
      return sendErrorResponse(
        res,
        new ApiError(400, `Service request not found`)
      );
    }

    // Extract coordinates and validate
    const serviceRequestLongitude: number = parseFloat(
      serviceRequest.serviceLongitude
    );
    const serviceRequestLatitude: number = parseFloat(
      serviceRequest.serviceLatitude
    );

    if (isNaN(serviceRequestLongitude) || isNaN(serviceRequestLatitude)) {
      return sendErrorResponse(
        res,
        new ApiError(400, `Invalid longitude or latitude`)
      );
    }

    const radius = 40000; // Radius in meters

    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [serviceRequestLongitude, serviceRequestLatitude],
          },
          distanceField: "distance",
          spherical: true,
          maxDistance: radius,
          query: {
            userType: "ServiceProvider",
            isDeleted: false,
          },
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
        $project: {
          __v: 0,
          isDeleted: 0,
          refreshToken: 0,
          password: 0,
          "additionalInfo.__v": 0,
          "additionalInfo.isDeleted": 0,
        },
      },
      // {
      //     $sort: { distance: -1 }
      // }
    ];

    const serviceProviders = (await UserModel.aggregate(
      pipeline
    )) as Array<any>;
    if (!serviceProviders.length) {
      return sendErrorResponse(
        res,
        new ApiError(400, "No nearby service providers found.")
      );
    }

    const updatePayload = {
      isReqAcceptedByServiceProvider: true,
      requestProgress: "Pending",
      serviceProviderId: serviceProviders[0]._id,
    };

    const acceptRequest = await ServiceModel.findByIdAndUpdate(
      { _id: serviceRequestId },
      updatePayload,
      { new: true }
    );

    return sendSuccessResponse(
      res,
      200,
      serviceProviders[0],
      "Nearby Service Providers assigned successfully"
    );
  }
);

// fetchSingleServiceRequest controller
export const fetchSingleServiceRequest = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { serviceId } = req.params;
    let SP_Timezone = "America/New_York";

    if (!serviceId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service request ID is required.")
      );
    }
    console.log({ serviceId });
    const serviceDeatils = await ServiceModel.findById({ _id: serviceId });
    if (!serviceDeatils) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service deatils ID is required.")
      );
    }
    if (req.user?.userType === "ServiceProvider") {
      const address = await AddressModel.findOne({ userId: req.user?._id });
      if (!address) {
        return sendErrorResponse(
          res,
          new ApiError(400, "Address is not found.")
        );
      }
      const longitude = address.longitude;
      const latitude = address.latitude;
      // Extract coordinates and validate
      const serviceProviderLongitude: number = parseFloat(longitude);
      const serviceProviderLatitude: number = parseFloat(latitude);

      SP_Timezone = tzLookup(serviceProviderLatitude, serviceProviderLongitude);
      console.log("Default sp timezone: ", SP_Timezone);
    }

    const assignedSPId = serviceDeatils?.serviceProviderId;
    if (assignedSPId) {
      const address = await AddressModel.findOne({ userId: assignedSPId });
      if (!address) {
        return sendErrorResponse(
          res,
          new ApiError(400, "Address is not found.")
        );
      }
      const longitude = address.longitude;
      const latitude = address.latitude;
      // Extract coordinates and validate
      const serviceProviderLongitude: number = parseFloat(longitude);
      const serviceProviderLatitude: number = parseFloat(latitude);

      SP_Timezone = tzLookup(serviceProviderLatitude, serviceProviderLongitude);
      console.log(SP_Timezone);
    }

    const serviceRequestToFetch = await ServiceModel.aggregate([
      {
        $match: {
          isDeleted: false,
          _id: new mongoose.Types.ObjectId(serviceId),
        },
      },
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
          // preserveNullAndEmptyArrays: true,
          path: "$categoryId",
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
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "userRatings",
              },
            },
            {
              $addFields: {
                totalRatings: { $ifNull: [{ $size: "$userRatings" }, 0] },
                userAvgRating: {
                  $ifNull: [{ $avg: "$userRatings.rating" }, 0],
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userId",
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "serviceProviderId",
          as: "serviceProviderId",
          pipeline: [
            {
              $lookup: {
                from: "additionalinfos",
                foreignField: "userId",
                localField: "_id",
                as: "providerAdditionalInfo",
              },
            },
          ],
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
          foreignField: "_id",
          localField: "assignedAgentId",
          as: "assignedAgentId",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$assignedAgentId",
        },
      },
      {
        $lookup: {
          from: "shifts",
          foreignField: "_id",
          localField: "serviceShifftId",
          as: "serviceShifftId",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$serviceShifftId",
        },
      },
      {
        $addFields: {
          bookedTimeSlot: {
            $filter: {
              input: "$serviceShifftId.shiftTimes",
              as: "shiftTime",
              cond: {
                $eq: ["$$shiftTime._id", "$SelectedShiftTime.shiftTimeId"],
              },
            },
          },
        },
      },
      {
        $project: {
          categoryName: "$categoryId.name",
          LeadGenerationFee: {
            $floor: {
              $multiply: [{ $toDouble: "$categoryId.serviceCost" }, 0.25],
            },
          },
          bookedServiceShift: "$serviceShifftId.shiftName",
          bookedTimeSlot: 1,
          serviceStartDate: 1,
          customerId: "$userId._id",
          customerName: {
            $concat: ["$userId.firstName", " ", "$userId.lastName"],
          },
          customerEmail: "$userId.email",
          customerAvatar: "$userId.avatar",
          customerPhone: "$userId.phone",
          totalCustomerRatings: "$userId.totalRatings",
          customerAvgRating: "$userId.userAvgRating",
          serviceProviderName: {
            $concat: [
              "$serviceProviderId.firstName",
              " ",
              "$serviceProviderId.lastName",
            ],
          },
          serviceProviderID: "$serviceProviderId._id",
          serviceProviderEmail: "$serviceProviderId.email",
          serviceProviderAvatar: "$serviceProviderId.avatar",
          serviceProviderPhone: "$serviceProviderId.phone",
          serviceProviderCompanyName:
            "$serviceProviderId.providerAdditionalInfo.companyName",
          serviceProviderCompanyDesc:
            "$serviceProviderId.providerAdditionalInfo.companyIntroduction",
          serviceProviderBusinessImage:
            "$serviceProviderId.providerAdditionalInfo.businessImage",
          assignedAgentName: {
            $concat: [
              "$assignedAgentId.firstName",
              " ",
              "$assignedAgentId.lastName",
            ],
          },
          assignedAgentID: "$assignedAgentId._id",
          assignedAgentEmail: "$assignedAgentId.email",
          assignedAgentAvatar: "$assignedAgentId.avatar",
          assignedAgentPhone: "$assignedAgentId.phone",
          serviceAddress: 1,
          answerArray: 1,
          serviceProductImage: 1,
          serviceDescription: "$otherInfo.serviceDescription",
          serviceProductSerialNumber: "$otherInfo.productSerialNumber",
          isReqAcceptedByServiceProvider: 1,
          requestProgress: 1,
          isIncentiveGiven: 1,
          incentiveAmount: 1,
          createdAt: 1,
          updatedAt: 1,
          serviceLatitude: 1,
          serviceLongitude: 1,
          startedAt: 1,
          completedAt: 1,
          acceptedAt: 1,
          neighbourLandmark: 1,
          landmarkPostalcode: 1,
        },
      },
    ]);
    if (!serviceRequestToFetch.length) {
      return sendErrorResponse(
        res,
        new ApiError(404, "Service request not found.")
      );
    }

    const serviceData = serviceRequestToFetch[0];

    // ✅ Timezone-aware conversion logic
    const serviceStartDate = serviceData.serviceStartDate;
    const bookedTimeSlot = serviceData.bookedTimeSlot?.[0]?.startTime;
    console.log({ bookedTimeSlot });

    const m = moment.tz(serviceStartDate, "America/New_York");
    console.log(m.format());

    if (serviceStartDate && bookedTimeSlot) {
      const combinedUtcDateTime = moment.utc(serviceStartDate).set({
        hour: moment.utc(bookedTimeSlot).hour(),
        minute: moment.utc(bookedTimeSlot).minute(),
        second: 0,
        millisecond: 0,
      });

      const converted = combinedUtcDateTime.clone().tz(SP_Timezone);
      console.log("converted timezone: ", converted);

      serviceData.serviceStartInSPTimeZone = converted.toISOString();
      serviceData.serviceStartReadableFormat = converted.format(
        "MMMM DD, YYYY, hh:mm A z"
      );

      // Service end time = +2 hours
      const endTime = converted.clone().add(2, "hours");
      console.log({ endTime });

      // Add service end time in SP time zone
      serviceData.serviceEndsInSPTimeZone = endTime.toISOString();
      serviceData.serviceEndReadableFormat = endTime.format(
        "MMMM DD, YYYY, hh:mm A z"
      );
      serviceData.serviceStartDate = m;
    }
    return sendSuccessResponse(
      res,
      200,
      serviceRequestToFetch,
      "Service request retrieved successfully."
    );
  }
);

// Function to fetch associated customer with the service request
export const fetchAssociatedCustomer = async (serviceId: string) => {
  if (!serviceId) {
    throw new Error("Service request ID is required.");
  }

  const serviceRequest = await ServiceModel.aggregate([
    {
      $match: {
        isDeleted: false,
        _id: new mongoose.Types.ObjectId(serviceId),
      },
    },
  ]);

  if (!serviceRequest || serviceRequest.length === 0) {
    throw new Error("Service request not found.");
  }

  return serviceRequest[0].userId;
};

//get service request for customer
export const getServiceRequestByStatus = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { page = "1", limit = "10", query = "" } = req.query;
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = {
      ...(query && {
        $or: [
          { requestProgress: { $regex: query, $options: "i" } },
          { serviceAddress: { $regex: query, $options: "i" } },
          { "categoryId.name": { $regex: query, $options: "i" } },
        ],
      }),
    };

    const userId = req.user?._id;
    const { requestProgress } = req.body;
    const progressFilter =
      requestProgress === "InProgress"
        ? { requestProgress: { $in: ["Pending", "Started"] } }
        : requestProgress === "jobQueue"
        ? { requestProgress: { $in: ["NotStarted", "CancelledBySP"] } }
        : { requestProgress };

    const results = await ServiceModel.aggregate([
      {
        $match: {
          ...progressFilter,
          userId: userId,
        },
      },
      {
        $lookup: {
          from: "categories",
          foreignField: "_id",
          localField: "categoryId",
          as: "categoryId",
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
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "customerRatings",
              },
            },
            {
              $addFields: {
                numberOfRatings: { $size: "$customerRatings" },
                customerAvgRating: {
                  $cond: {
                    if: { $gt: [{ $size: "$customerRatings" }, 0] },
                    then: { $avg: "$customerRatings.rating" },
                    else: 0,
                  },
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userId",
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "serviceProviderId",
          as: "serviceProviderId",
          pipeline: [
            {
              $lookup: {
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "serviceProviderIdRatings",
              },
            },
            {
              $lookup: {
                from: "additionalinfos",
                foreignField: "userId",
                localField: "_id",
                as: "serviceProviderAdditionalInfo",
              },
            },
            {
              $addFields: {
                numberOfRatings: { $size: "$serviceProviderIdRatings" },
                serviceProviderRatings: {
                  $cond: {
                    if: { $gt: [{ $size: "$serviceProviderIdRatings" }, 0] },
                    then: { $avg: "$serviceProviderIdRatings.rating" },
                    else: 0,
                  },
                },
                spBusinessImage: "$serviceProviderAdditionalInfo.businessImage",
              },
            },
          ],
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
          foreignField: "_id",
          localField: "assignedAgentId",
          as: "assignedAgentId",
          pipeline: [
            {
              $lookup: {
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "fieldAgentRatings",
              },
            },
            {
              $addFields: {
                numberOfRatings: { $size: "$fieldAgentRatings" },
                filedAgentRatings: {
                  $cond: {
                    if: { $gt: [{ $size: "$fieldAgentRatings" }, 0] },
                    then: { $avg: "$fieldAgentRatings.rating" },
                    else: 0,
                  },
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$assignedAgentId",
        },
      },
      {
        $project: {
          _id: 1,
          "categoryId.name": 1,
          "categoryId.categoryImage": 1,
          serviceStartDate: 1,
          serviceAddress: 1,
          startedAt: 1,
          completedAt: 1,
          isIncentiveGiven: 1,
          incentiveAmount: 1,
          requestProgress: 1,
          "serviceProviderId.firstName": 1,
          "serviceProviderId.lastName": 1,
          "serviceProviderId.avatar": 1,
          "serviceProviderId.spBusinessImage": 1,
          "serviceProviderId.numberOfRatings": 1,
          "serviceProviderId.serviceProviderRatings": 1,
          "assignedAgentId.firstName": 1,
          "assignedAgentId.lastName": 1,
          "assignedAgentId.avatar": 1,
          "assignedAgentId.numberOfRatings": 1,
          "assignedAgentId.filedAgentRatings": 1,
          createdAt: 1,
        },
      },
      { $match: searchQuery },
      { $skip: skip },
      { $limit: limitNumber },
      { $sort: { createdAt: -1 } },
    ]);

    const totalDocs = await ServiceModel.aggregate([
      {
        $match: {
          ...progressFilter,
          userId: userId,
        },
      },
    ]);
    const totalRequest = totalDocs.length;

    return sendSuccessResponse(
      res,
      200,
      {
        results,
        totalRequest: totalRequest,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "Service request retrieved successfully."
    );
  }
);

//get service request for service provider
export const getJobByStatus = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { page = "1", limit = "10", query = "" } = req.query;
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = {
      isUserBanned: false,
      ...(query && {
        $or: [
          { requestProgress: { $regex: query, $options: "i" } },
          { categoryName: { $regex: query, $options: "i" } },
          { customerFirstName: { $regex: query, $options: "i" } },
          { "assignedAgentId.firstName": { $regex: query, $options: "i" } },
        ],
      }),
    };

    const serviceProviderId = req.user?._id;
    const { requestProgress } = req.body;
    const progressFilter =
      requestProgress === "Accepted"
        ? { requestProgress: { $in: ["Pending", "CancelledByFA"] } }
        : requestProgress === "Assigned"
        ? {
            requestProgress: { $in: ["Pending", "CancelledByFA"] },
            assignedAgentId: { $ne: null, $exists: true },
          }
        : requestProgress === "Started"
        ? { requestProgress: "Started" }
        : requestProgress === "All"
        ? {}
        : { requestProgress };

    const results = await ServiceModel.aggregate([
      {
        $match: {
          ...progressFilter,
          serviceProviderId: serviceProviderId,
        },
      },
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
          preserveNullAndEmptyArrays: true,
          path: "$categoryId",
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
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "userRatings",
              },
            },
            {
              $addFields: {
                totalRatings: { $ifNull: [{ $size: "$userRatings" }, 0] },
                userAvgRating: {
                  $ifNull: [{ $avg: "$userRatings.rating" }, 0],
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userId",
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "assignedAgentId",
          as: "assignedAgentId",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userId",
        },
      },
      { $sort: { updatedAt: -1 } },
      {
        $project: {
          _id: 1,
          categoryName: "$categoryId.name",
          requestProgress: 1,
          isIncentiveGiven: 1,
          incentiveAmount: 1,
          customerFirstName: "$userId.firstName",
          customerLastName: "$userId.lastName",
          "assignedAgentId.firstName": 1,
          "assignedAgentId.lastName": 1,
          "assignedAgentId._id": 1,
          "assignedAgentId.avatar": 1,
          "assignedAgentId.phone": 1,
          customerAvatar: "$userId.avatar",
          isUserBanned: "$userId.isDeleted",
          totalCustomerRatings: "$userId.totalRatings",
          customerAvgRating: "$userId.userAvgRating",

          createdAt: 1,
        },
      },
      {
        $match: searchQuery,
      },
      { $skip: skip },
      { $limit: limitNumber },
    ]);

    const totalRequest = results.length;

    return sendSuccessResponse(
      res,
      200,
      {
        results,
        totalRequest: totalRequest,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "Service request retrieved successfully."
    );
  }
);

//get service request for field agent
export const getJobByStatusByAgent = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    // console.log(req.user?._id);
    const { page = "1", limit = "10", query = "" } = req.query;
    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = {
      isUserBanned: false,
      ...(query && {
        $or: [
          { categoryName: { $regex: query, $options: "i" } },
          { customerFirstName: { $regex: query, $options: "i" } },
          { "assignedAgentId.firstName": { $regex: query, $options: "i" } },
        ],
      }),
    };

    const assignedAgentId = req.user?._id;
    const { requestProgress } = req.body;
    const progressFilter =
      requestProgress === "Assigned"
        ? {
            requestProgress: { $in: ["Pending", "CancelledByFA"] },
            assignedAgentId: req.user?._id,
          }
        : { requestProgress };

    const results = await ServiceModel.aggregate([
      {
        $match: {
          ...progressFilter,
          assignedAgentId: assignedAgentId,
        },
      },
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
          preserveNullAndEmptyArrays: true,
          path: "$categoryId",
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
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "userRatings",
              },
            },
            {
              $addFields: {
                totalRatings: { $ifNull: [{ $size: "$userRatings" }, 0] },
                userAvgRating: {
                  $ifNull: [{ $avg: "$userRatings.rating" }, 0],
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userId",
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "assignedAgentId",
          as: "assignedAgentId",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$userId",
        },
      },
      {
        $project: {
          _id: 1,
          categoryName: "$categoryId.name",
          requestProgress: 1,
          isIncentiveGiven: 1,
          incentiveAmount: 1,
          customerFirstName: "$userId.firstName",
          customerLastName: "$userId.lastName",
          "assignedAgentId.firstName": 1,
          "assignedAgentId.lastName": 1,
          "assignedAgentId._id": 1,
          "assignedAgentId.avatar": 1,
          "assignedAgentId.phone": 1,
          customerAvatar: "$userId.avatar",
          isUserBanned: "$userId.isDeleted",
          totalCustomerRatings: "$userId.totalRatings",
          customerAvgRating: "$userId.userAvgRating",
          createdAt: 1,
        },
      },
      {
        $match: searchQuery,
      },
      { $skip: skip },
      { $limit: limitNumber },
      { $sort: { createdAt: -1 } },
    ]);

    const totalRequest = results.length;

    return sendSuccessResponse(
      res,
      200,
      {
        results,
        totalRequest: totalRequest,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
        },
      },
      "Service request retrieved successfully."
    );
  }
);
interface ShiftTimSlots {
  shiftId: string;
  shiftTimeId: string;
}

const fetchCalculatedServiceStartTime = async (serviceId: string) => {
  const serviceDetails = await ServiceModel.findById(serviceId);
  if (!serviceDetails) {
    return new ApiError(400, "Service id is required.");
  }
  const serviceStartDate = serviceDetails.serviceStartDate;
  const serviceShift = serviceDetails.serviceShifftId;
  const selectedSlot = serviceDetails.SelectedShiftTime as ShiftTimSlots;
  const shiftTimeId = selectedSlot?.shiftTimeId;
  const shiftDetails = await ShiftModel.findById(serviceShift);

  const slotArray = shiftDetails?.shiftTimes;

  if (!slotArray) {
    return new ApiError(400, "Service Details is required.");
  }
  const selectedTimeRange = slotArray.filter(
    (slot) => String(slot._id) == String(shiftTimeId)
  );

  const datePart = moment.utc(serviceStartDate).format("YYYY-MM-DD");

  const timePart = moment
    .utc(selectedTimeRange[0].startTime)
    .format("HH:mm:ss");
  const combinedDateTimeString = `${datePart}T${timePart}Z`;

  const serviceCalculatedStartTime = moment
    .utc(combinedDateTimeString)
    .toDate();

  console.log("Combined UTC timestamp:", serviceCalculatedStartTime);

  return serviceCalculatedStartTime;
};

export const assignJob = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userType = req.user?.userType;
    let serviceProviderId = req.user?._id;
    const { assignedAgentId, serviceId } = req.body;

    if (!serviceId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service ID is required.")
      );
    }
    if (userType === "TeamLead") {
      const permissions = await PermissionModel.findOne({
        userId: req.user?._id,
      }).select("assignJob");
      if (!permissions?.fieldAgentManagement) {
        return sendErrorResponse(
          res,
          new ApiError(403, "Permission denied: Assign Job not granted.")
        );
      }

      // const teamInfo = await TeamModel.findOne({ fieldAgentIds: req.user?._id });
      // if (teamInfo) {
      //     serviceProviderId = teamInfo?.serviceProviderId;
      // }

      // const agentUser = await UserModel.findById(assignedAgentId).select('userType');
      // isAssignable = agentUser?.userType === "FieldAgent" || agentUser?.userType === "TeamLead";
    }
    const assignedServicesToAgent = await ServiceModel.aggregate([
      {
        $match: {
          assignedAgentId: new mongoose.Types.ObjectId(assignedAgentId),
        },
      },
    ]);
    const AgentBookedTimeslot = await Promise.all(
      assignedServicesToAgent.map(async (service) => {
        const time = await fetchCalculatedServiceStartTime(service._id);
        return time; // returns Date
      })
    );
    const incomingServiceCalculatedDate = await fetchCalculatedServiceStartTime(
      serviceId
    );

    console.log({ AgentBookedTimeslot });
    console.log({ incomingServiceCalculatedDate });

    const isConflict = AgentBookedTimeslot.filter(
      (bookedTime) =>
        String(bookedTime) == String(incomingServiceCalculatedDate)
    );
    console.log({ isConflict });
    if (isConflict.length > 0) {
      console.log("conflict due to same slot");
      return sendErrorResponse(
        res,
        new ApiError(400, "Field agent is not avilable for this date and slot.")
      );
    }

    const updatedService = await ServiceModel.findByIdAndUpdate(
      serviceId,
      {
        $set: {
          assignedAgentId: new mongoose.Types.ObjectId(assignedAgentId),
          // serviceProviderId: serviceProviderId
        },
      },
      { new: true }
    );

    if (!updatedService) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service not found for assigning.")
      );
    } //send notification to field agent when a job is assigned to him

    const notificationContent = `You have been assigned a job by ${
      req.user?.firstName ?? "SP"
    } ${req.user?.lastName ?? ""}`;

    await sendPushNotification(
      assignedAgentId.toString() as string,
      "Job Assigned",
      notificationContent,
      {
        senderId: req.user?._id,
        receiverId: assignedAgentId,
        title: notificationContent,
        notificationType: "Service Assigned",
      }
    );

    const agentDetails = await UserModel.findById(assignedAgentId);
    if (agentDetails) {
      const agentPhoneNumber = agentDetails.phone;
      // await sendSMS(agentPhoneNumber, notificationContent);
      // await sendSMS(agentPhoneNumber, notificationContent);
    }

    return sendSuccessResponse(
      res,
      200,
      updatedService,
      "Job assigned to the agent successfully."
    );
  }
);

export const totalJobCount = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const serviceProviderId = req.user?._id;

    if (!serviceProviderId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service provider ID is required.")
      );
    }

    const jobData = await ServiceModel.aggregate([
      {
        $match: {
          isDeleted: false,
          serviceProviderId: serviceProviderId,
        },
      },
      {
        $group: {
          _id: "$requestProgress",
          count: { $sum: 1 },
          jobDetails: { $push: "$$ROOT" },
        },
      },
    ]);
    return sendSuccessResponse(
      res,
      200,
      jobData,
      "Job counts retrieved successfully."
    );
  }
);

export const fetchAssignedserviceProvider = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { serviceId } = req.params;

    if (!serviceId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Service ID is required.")
      );
    }

    const assignedSPDetails = await ServiceModel.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(serviceId),
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "serviceProviderId",
          as: "SP_Details",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$SP_Details",
        },
      },
      {
        $lookup: {
          from: "additionalinfos",
          foreignField: "userId",
          localField: "serviceProviderId",
          as: "SP_Additional_Details",
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$SP_Additional_Details",
        },
      },
      {
        $addFields: {
          spFullName: {
            $concat: ["$SP_Details.firstName", " ", "$SP_Details.lastName"],
          },
          companyDesc: "$SP_Additional_Details.companyIntroduction",
          backgroundCheck: {
            $cond: ["$SP_Details.isVerified", true, false],
          },
          licenseVerified: {
            $cond: ["$SP_Details.isVerified", true, false],
          },
          insuranceVerified: {
            $cond: ["$SP_Details.isVerified", true, false],
          },
          arrivalFee: {
            $cond: [
              "$SP_Additional_Details.isAnyArrivalFee",
              "$SP_Additional_Details.arrivalFee",
              0,
            ],
          },
        },
      },
      {
        $project: {
          spFullName: 1,
          companyDesc: 1,
          backgroundCheck: 1,
          licenseVerified: 1,
          insuranceVerified: 1,
          arrivalFee: 1,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      assignedSPDetails[0],
      "Assigned service provider retrieved successfully."
    );
  }
);

//get service request for customer
export const getCompletedService = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userId = req.user?._id;

    const results = await ServiceModel.aggregate([
      {
        $match: {
          requestProgress: "Completed",
          userId: userId,
        },
      },
      {
        $lookup: {
          from: "categories",
          foreignField: "_id",
          localField: "categoryId",
          as: "categoryId",
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "serviceProviderId",
          as: "serviceProviderId",
          pipeline: [
            {
              $lookup: {
                from: "ratings",
                foreignField: "ratedTo",
                localField: "_id",
                as: "serviceProviderIdRatings",
              },
            },
            {
              $addFields: {
                numberOfRatings: { $size: "$serviceProviderIdRatings" },
                serviceProviderRatings: {
                  $cond: {
                    if: { $gt: [{ $size: "$serviceProviderIdRatings" }, 0] },
                    then: { $avg: "$serviceProviderIdRatings.rating" },
                    else: 0,
                  },
                },
              },
            },
          ],
        },
      },
      {
        $unwind: {
          preserveNullAndEmptyArrays: true,
          path: "$serviceProviderId",
        },
      },
      {
        $project: {
          _id: 1,
          "categoryId.name": 1,
          "categoryId.categoryImage": 1,
          requestProgress: 1,
          "serviceProviderId.numberOfRatings": 1,
          "serviceProviderId.serviceProviderRatings": 1,
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    const totalRequest = results.length;

    return sendSuccessResponse(
      res,
      200,
      { results, totalRequest: totalRequest },
      "Service request retrieved successfully."
    );
  }
);

//get customer's address history
export const fetchServiceAddressHistory = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userId = req.user?._id;

    const results = await ServiceModel.aggregate([
      {
        $match: {
          userId: userId,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$serviceAddress",
          createdAt: { $max: "$createdAt" },
          serviceId: { $first: "$_id" },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $project: {
          _id: 0,
          serviceAddress: "$_id",
          // createdAt: 1,
          serviceId: 1,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      { results, totalRequest: results.length },
      "Unique service address history retrieved successfully."
    );
  }
);

//fetch incentive details
export const fetchIncentiveDetails = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userId = req.user?._id;
    const results = await ServiceModel.aggregate([
      {
        $match: {
          isDeleted: false,
          requestProgress: "Completed",
          isIncentiveGiven: true,
          serviceProviderId: userId,
        },
      },
    ]);
    return sendSuccessResponse(
      res,
      200,
      { results, totalRequest: results.length },
      "Incentive details retrieved successfully."
    );
  }
);

export const sendCustomerNotification = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const userType = req.user?.userType;
    const { serviceId } = req.body;
    const serviceDeatils = await ServiceModel.findById({
      _id: serviceId,
    });
    console.log({ serviceDeatils });

    //notify customer
    const customerId = serviceDeatils?.userId;
    let technician, customerNotiContent;
    if (userType === "ServiceProvider") {
      const spFullName = await UserModel.findById({ _id: req.user?._id });
      console.log({ spFullName });

      technician = `${spFullName?.firstName} ${spFullName?.lastName}`;

      const spCompanyDetails = await AdditionalInfoModel.findOne({
        userId: req.user?._id,
      });

      customerNotiContent = `The service technician ${technician} from ${spCompanyDetails?.companyName} ${spCompanyDetails?.companyLicense} is on their way!
Please feel free to communicate with your service technician through the AnyJob app.Thank you for using AnyJob!`;
    } else {
      const agentFullName = await UserModel.findById({ _id: req.user?._id });

      technician = `${agentFullName?.firstName}  ${agentFullName?.lastName}`;
      customerNotiContent = `The service technician,${technician} is on their way!
Please feel free to communicate with your service technician through the AnyJob app.Thank you for using AnyJob!`;
    }

    await sendPushNotification(
      customerId?.toString() as string,
      "Job Assigned",
      customerNotiContent,
      {
        senderId: req.user?._id,
        receiverId: customerId,
        title: customerNotiContent,
        notificationType: "Service Assigned",
      }
    );

    const customerDetails = await UserModel.findById({ _id: customerId });

    // await sendSMS(customerDetails?.phone || "", customerNotiContent);

    return sendSuccessResponse(res, 200, {}, "Customer notified successfully.");
    
  }
);
