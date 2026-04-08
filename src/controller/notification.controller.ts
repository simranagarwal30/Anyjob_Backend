import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { CustomRequest } from "../../types/commonType";
import { sendSuccessResponse } from "../utils/response";
import { NotificationModel } from "../models/notification.model";
import TeamModel from "../models/teams.model";

export const getNotifications = asyncHandler(async (req: CustomRequest, res: Response) => {
    var serviceProviderId = req.user?._id;
    console.log(req.user?._id);
    if (req.user?.userType === "FieldAgent") {
        const findTeam = await TeamModel.findOne(
            {
                fieldAgentIds: req.user?._id
            }
        );
        if (findTeam) {
            serviceProviderId = findTeam.serviceProviderId
        }
    };

    const results = await NotificationModel.aggregate([
        {
            $match: {
                receiverId: req.user?._id,
            }
        },
        {
            $addFields: { serviceProviderId: serviceProviderId }
        },
        {
            $lookup: {
                from: "users",
                foreignField: "_id",
                localField: "senderId",
                as: "senderDetails"
            }
        },
        {
            $lookup: {
                from: "additionalinfos",
                foreignField: "userId",
                localField: "serviceProviderId",
                as: "companyDetails"
            }
        },
        {
            $unwind: {
                preserveNullAndEmptyArrays: true,
                path: "$senderDetails"
            }
        },
        {
            $unwind: {
                preserveNullAndEmptyArrays: true,
                path: "$companyDetails"
            }
        },
        {
            $addFields: {
                senderAvatar: "$senderDetails.avatar",
                senderCompanyImage: "$companyDetails.businessImage",
            }
        },
        {
            $project: {
                _id: 1,
                title: 1,
                createdAt: 1,
                senderAvatar: 1,
                senderCompanyImage: 1,
            }
        }
    ]);
    return sendSuccessResponse(res, 200, results, "Notifications retrieved successfully.");
});