import { Response } from "express";
import { CustomRequest } from "../../types/commonType";
import { asyncHandler } from "../utils/asyncHandler";
import RatingModel from "../models/rating.model";
import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import { ApiError } from "../utils/ApisErrors";
import mongoose from "mongoose";
import AppReviewModel from "../models/appReview.model";

// addRating controller
export const addRating = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { rating, ratedTo, comments } = req.body;

    // Validate required fields
    if (!rating || !ratedTo) {
      return sendErrorResponse(
        res,
        new ApiError(400, "At least some rating required")
      );
    }

    // Create a rating
    const newrating = new RatingModel({
      ratedBy: req.user?._id,
      ratedTo,
      rating,
      comments,
    });

    // Save the rating to the database
    const savedRating = await newrating.save();

    return sendSuccessResponse(
      res,
      201,
      savedRating,
      "Rating submitted successfully"
    );
  }
);

// deleteRating controller
export const deleteRating = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { ratingId } = req.params;

    // Validate required fields
    if (!ratingId) {
      return sendErrorResponse(res, new ApiError(400, "Rating Id is required"));
    }
    const deletedRating = await RatingModel.findByIdAndDelete({
      _id: new mongoose.Types.ObjectId(ratingId),
    });

    if (!deletedRating) {
      return sendErrorResponse(res, new ApiError(400, "Rating not found."));
    }

    return sendSuccessResponse(res, 201, {}, "Rating deleted successfully");
  }
);

export const addAppRating = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { rating, review } = req.body;

    // Validate required fields
    if (!rating) {
      return sendErrorResponse(
        res,
        new ApiError(400, "At least some rating required")
      );
    }

    // Create a rating
    const newrating = new AppReviewModel({
      ratedBy: req.user?._id,
      rating,
      review,
    });

    // Save the rating to the database
    const savedRating = await newrating.save();

    return sendSuccessResponse(
      res,
      201,
      savedRating,
      "Rating submitted successfully"
    );
  }
);

export const fetchAppRatingAnalysis = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const AppReviewDetails = await AppReviewModel.aggregate([
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "ratedBy",
          as: "ratedBy",
        },
      },
      {
        $unwind: {
          path: "$ratedBy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          firstName: "$ratedBy.firstName",
          lastName: "$ratedBy.lastName",
          avatar: "$ratedBy.avatar",
        },
      },
      {
        $facet: {
          totalStats: [
            {
              $group: {
                _id: null,
                totalRatings: { $sum: 1 },
                totalReviews: {
                  $sum: {
                    $cond: [{ $ne: ["$review", ""] }, 1, 0],
                  },
                },
                avgRating: { $avg: "$rating" },
              },
            },
            {
              $project: {
                _id: 0,
                totalRatings: 1,
                totalReviews: 1,
                avgRating: { $round: ["$avgRating", 2] },
              },
            },
          ],
          groupedByRating: [
            {
              $group: {
                _id: "$rating",
                count: { $sum: 1 },
                reviews: {
                  $push: {
                    firstName: "$firstName",
                    lastName: "$lastName",
                    avatar: "$avatar",
                    review: "$review",
                    createdAt: "$createdAt",
                    updatedAt: "$updatedAt",
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                rating: "$_id",
                count: 1,
                // reviews: 1
              },
            },
            {
              $sort: { rating: 1 },
            },
          ],
        },
      },
      {
        $project: {
          totalStats: { $arrayElemAt: ["$totalStats", 0] },
          groupedByRating: 1,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      AppReviewDetails[0],
      "Ratings analysis fetched successfully"
    );
  }
);

export const fetchUserRatings = asyncHandler(
  async (req: CustomRequest, res: Response) => {
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
        { ratedBy_firstName: { $regex: query, $options: "i" } },
        { ratedTo_firstName: { $regex: query, $options: "i" } },
        // { email: { $regex: query, $options: "i" } },
      ],
    };

    const matchCriteria = {
      isDeleted: false,
      //   ...searchFilter,
    };

    const totalDocuments = await RatingModel.countDocuments(matchCriteria);
    console.log("ghgh");

    const totalPages = Math.ceil(totalDocuments / pageSize);

    const userReviews = await RatingModel.aggregate([
      {
        $match: matchCriteria,
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "ratedBy",
          as: "ratedBy",
        },
      },
      {
        $unwind: {
          path: "$ratedBy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          ratedBy_firstName: "$ratedBy.firstName",
          ratedBy_lastName: "$ratedBy.lastName",
          ratedBy_avatar: "$ratedBy.avatar",
          ratedBy_userType: "$ratedBy.userType",
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "ratedTo",
          as: "ratedTo",
        },
      },
      {
        $unwind: {
          path: "$ratedTo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          ratedTo_firstName: "$ratedTo.firstName",
          ratedTo_lastName: "$ratedTo.lastName",
          ratedTo_avatar: "$ratedTo.avatar",
          ratedTo_userType: "$ratedTo.userType",
        },
      },
      {
        $project: {
          // _id: 0,
          ratedBy: 0,
          ratedTo: 0,
          __v: 0,
          isDeleted: 0,
          updatedAt: 0,
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
        userReviews,
        pagination: {
          total: totalDocuments,
          totalPages,
          currentPage: pageNumber,
          limit: pageSize,
        },
      },
      "Ratings fetched successfully"
    );
  }
);
