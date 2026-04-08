import mongoose, { Schema, Model } from "mongoose";
import { IChatSchema } from "../../types/schemaTypes";

const ChatSchema: Schema<IChatSchema> = new Schema(
    {
        fromUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        toUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const ChatModel: Model<IChatSchema> = mongoose.model<IChatSchema>("Chat", ChatSchema);
export default ChatModel;
