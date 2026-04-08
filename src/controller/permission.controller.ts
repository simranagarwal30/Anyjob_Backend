import { Request, Response } from "express";
import { CustomRequest } from "../../types/commonType";
import { ApiError } from "../utils/ApisErrors";
import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import PermissionModel from "../models/permission.model";
import TeamModel from "../models/teams.model";


export const givePermission = asyncHandler(async (req: CustomRequest, res: Response) => {
    const { userId, acceptRequest, assignJob, fieldAgentManagement } = req.body;
    const serviceProviderId = req.user?._id;

    // Check if the user exists in the service provider's team
    const team = await TeamModel.findOne({
        serviceProviderId,
        fieldAgentIds: { $in: [userId] }  // Make sure userId is an array for $in
    });

    if (!team) {
        return sendErrorResponse(res, new ApiError(400, "Agent not found in the service provider's team."))
    }

    // Create or update permissions for the user
    const updatedPermissions = await PermissionModel.findOneAndUpdate(
        { userId }, // Find by userId
        {
            serviceProviderId,
            userId,
            acceptRequest,
            assignJob,
            fieldAgentManagement
        },
        { new: true, upsert: true }
    );

    if (!updatedPermissions) {
        return sendErrorResponse(res, new ApiError(500, "Failed to create or update permissions."))
    }


    return sendSuccessResponse(res, 200, updatedPermissions, "Permissions added successfully.")

});

export const getUserPermissions = asyncHandler(async (req: CustomRequest, res: Response) => {
    const { page = "1", limit = "10", query = '', sortBy = 'createdAt', sortType = 'desc' } = req.query;

    const pageNumber = parseInt(page as string, 10) || 1;
    const limitNumber = parseInt(limit as string, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const searchQuery = query
        ? {
            $or: [
                { "userId.firstName": { $regex: query, $options: "i" } },
                { "userId.lastName": { $regex: query, $options: "i" } },
            ]
        }
        : {};

    const validSortBy = (sortBy as string) || 'createdAt';
    const validSortType = (sortType as string).toLowerCase() === 'desc' ? -1 : 1;
    const sortCriteria: any = { [validSortBy]: validSortType };

    const permissions = await PermissionModel.aggregate([
        { $match: { isDeleted: false } },
        {
            $lookup: {
                from: "users",
                foreignField: "_id",
                localField: "userId",
                as: "userId"
            }
        },
        { $unwind: { path: "$userId", preserveNullAndEmptyArrays: true } },
        { $match: searchQuery },
        {
            $project: {
                'userId.isDeleted': 0,
                'userId.updatedAt': 0,
                'userId.createdAt': 0,
                "userId.__v": 0,
                "userId.email": 0,
                "userId.phone": 0,
                "userId.password": 0,
                "userId.avatar": 0,
                "userId.isVerified": 0,
                "userId.refreshToken": 0,
                isDeleted: 0,
                updatedAt: 0,
                createdAt: 0,
                __v: 0,
            }
        },
        { $sort: sortCriteria },
        { $skip: skip },
        { $limit: limitNumber }
    ]);

    const totalRecords = await PermissionModel.countDocuments({ isDeleted: false });
    const totalPages = Math.ceil(totalRecords / limitNumber);

    return sendSuccessResponse(res, 200, {
        permissions,
        pagination: {
            total: totalRecords,
            page: pageNumber,
            limit: limitNumber,
            totalPages,
        }
    }, "Permissions retrieved successfully.");
});
