import ChatModel from "../models/chat.model";
import { Request, Response } from "express";
import { sendSuccessResponse } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import mongoose from "mongoose";
import ChatListModel from "../models/chatList.model";
import { CustomRequest } from "../../types/commonType";

export const saveChatMessage = async (message: {
  fromUserId: string;
  toUserId: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
}) => {
  const chat = new ChatModel(message);
  await chat.save();
};
//fetch chat controller
export const fetchChatHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId1, userId2 } = req.query;

    if (!userId1 || !userId2) {
      return res
        .status(400)
        .json({ error: "Both userId1 and userId2 are required" });
    }

    // Convert query IDs to ObjectId
    const userId1Obj = new mongoose.Types.ObjectId(userId1 as string);
    const userId2Obj = new mongoose.Types.ObjectId(userId2 as string);

    // Fetch chat history
    const chatHistory = await ChatModel.aggregate([
      {
        $match: {
          $or: [
            { fromUserId: userId1Obj, toUserId: userId2Obj },
            { fromUserId: userId2Obj, toUserId: userId1Obj },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "toUserId",
          as: "toUserId",
        },
      },
      {
        $unwind: {
          path: "$toUserId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "fromUserId",
          as: "fromUserId",
        },
      },
      {
        $unwind: {
          path: "$fromUserId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          content: 1,
          createdAt: 1,
          "toUserId._id": 1,
          "toUserId.firstName": 1,
          "toUserId.lastName": 1,
          "toUserId.avatar": 1,
          "fromUserId._id": 1,
          "fromUserId.firstName": 1,
          "fromUserId.lastName": 1,
          "fromUserId.avatar": 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
    // Return chat history
    return sendSuccessResponse(
      res,
      200,
      chatHistory,
      "Chat history fetched successfully"
    );
  }
);

//update chat function
export const updateChatList = async (
  userId: string,
  chatWithUserId: string,
  message: string,
  timestamp: Date
) => {
  // Check if the chat list entry exists for the user
  const existingChatList = await ChatListModel.findOne({
    userId: userId,
    chatWithUserId: chatWithUserId,
  });

  if (existingChatList) {
    // Update the existing chat list entry with the latest message and timestamp
    existingChatList.lastMessage = message;
    existingChatList.lastMessageAt = timestamp;
    await existingChatList.save();
  } else {
    // Create a new entry in the chat list for the user
    const newChatListEntry = new ChatListModel({
      userId: userId,
      chatWithUserId: chatWithUserId,
      lastMessage: message,
      lastMessageAt: timestamp,
    });
    await newChatListEntry.save();
  }
};

//fetch chat list controller
export const fetchChatList = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const userIdObj = new mongoose.Types.ObjectId(userId as string);

    const chatList = await ChatListModel.aggregate([
      {
        $match: {
          userId: userIdObj,
        },
      },
      {
        $lookup: {
          from: "users",
          foreignField: "_id",
          localField: "chatWithUserId",
          as: "chatWithUserId",
        },
      },
      {
        $unwind: {
          path: "$chatWithUserId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          lastMessage: 1,
          lastMessageAt: 1,
          isRead: 1,
          "chatWithUserId._id": 1,
          "chatWithUserId.firstName": 1,
          "chatWithUserId.lastName": 1,
          "chatWithUserId.avatar": 1,
        },
      },
    ]);

    return sendSuccessResponse(
      res,
      200,
      chatList,
      "Chat list fetched successfully"
    );
  }
);

export const getUnreadMessageCount = async (
  req: CustomRequest,
  res: Response
) => {
  const userId = req.user?._id;
  try {
    const unreadCount = await ChatModel.countDocuments({
      toUserId: userId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching unread message count:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch unread messages count.",
    });
  }
};
