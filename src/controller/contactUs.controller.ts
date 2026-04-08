import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import ContactUsModel from "../models/contactUs.model";
import { CustomRequest } from "../../types/commonType";
import { Request, Response } from "express";
import { ApiError } from "../utils/ApisErrors";
import mongoose from "mongoose";
import { sendMail, sendMailToAdmin } from "../utils/sendMail";

export const sendQueryMessage = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { fullName, email, contactNumber, message } = req.body;
    const senderId = req.user?._id;

    if (!fullName || !email || !contactNumber || !message) {
      return sendErrorResponse(
        res,
        new ApiError(
          400,
          "Fullname email,contact and message all are required field"
        )
      );
    }

    const from = email;
    const html = `
    <p><strong>Full Name:</strong> ${fullName}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Contact Number:</strong> ${contactNumber}</p>
    <p><strong>Message:</strong></p>
<p style="margin-left: 20px; font-style: italic;">${message}</p>`;

    const sendMailToAdminEmail = await sendMailToAdmin(from, fullName, html);
    if (sendMailToAdminEmail) {
      const to = email;
      const subject = "Thank You";
      const html = `Dear ${fullName}, thank you for contacting us`;
      await sendMail(to, subject, html);

      const contactUsData = await ContactUsModel.create({
        fullName,
        email,
        contactNumber,
        message,
        senderId,
      });

      if (!contactUsData) {
        return sendErrorResponse(
          res,
          new ApiError(500, "Failed to send your message.")
        );
      }
    }

    return sendSuccessResponse(res, 200, "Message sent successfully.");
  }
);

export const fetchQueryMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const queryMessages = await ContactUsModel.aggregate([
      {
        $match: {
          isDeleted: false,
          isRead: false,
        },
      },
      {
        $project: {
          _id: 1,
          fullName: 1,
          email: 1,
          contactNumber: 1,
          message: 1,
          isRead: 1,
        },
      },
    ]);
    if (!queryMessages.length) {
      return sendSuccessResponse(res, 200, "No messages till now.");
    }

    return sendSuccessResponse(
      res,
      200,
      queryMessages,
      "Query messages fetched successfully."
    );
  }
);

export const deleteQueryMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const { messageId } = req.params;

    if (!messageId) {
      return sendErrorResponse(res, new ApiError(400, "messageId is required"));
    }
    const deletedQueryMessages = await ContactUsModel.findByIdAndDelete({
      _id: new mongoose.Types.ObjectId(messageId),
    });
    if (!deletedQueryMessages) {
      return sendSuccessResponse(res, 200, "No messages deleted");
    }

    return sendSuccessResponse(
      res,
      200,
      "Query messages deleted successfully."
    );
  }
);
