import { Request, Response } from "express";
import { sendSuccessResponse } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import mongoose from "mongoose";
import WalletModel from "../models/wallet.model";
import { CustomRequest } from "../../types/commonType";

export const fetchWalletBalance = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const walletDetails = await WalletModel.aggregate([
      {
        $match: {
          userId: req.user?._id,
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
        },
      },
      {
        $project: {
          _id: 1,
          userName: 1,
          balance: 1,
          currency: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      walletDetails,
      "Wallet balance fetched successfully"
    );
  }
);

export const fetchTransaction = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const walletDetails = await WalletModel.aggregate([
      {
        $match: {
          userId: req.user?._id,
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
          transactions: {
            $map: {
              input: "$transactions",
              as: "transaction",
              in: {
                _id: {
                  $cond: {
                    if: "$$transaction.stripeTransactionId",
                    then: "$$transaction.stripeTransactionId",
                    else: "$$transaction.stripeTransferId",
                  },
                },
                type: "$$transaction.type",
                amount: "$$transaction.amount",
                description: "$$transaction.description",
                date: "$$transaction.date",
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          userName: 1,
          balance: 1,
          transactions: 1,
          currency: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      walletDetails,
      "Wallet balance fetched successfully"
    );
  }
);
