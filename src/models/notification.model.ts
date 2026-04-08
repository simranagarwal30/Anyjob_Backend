import mongoose, { Schema, model } from "mongoose";
import { INotificationSchema } from "../../types/schemaTypes";

const NotificationSchema = new Schema<INotificationSchema>(
    {
        senderId: { type: Schema.Types.ObjectId, ref: "User" },
        receiverId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
        title: { type: String, required: true },
        notificationType: { type: String, required: true },
        isRead: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const NotificationModel = model<INotificationSchema>("Notification", NotificationSchema);
