import mongoose, { Schema, Model } from "mongoose";
import { IChatListSchema } from "../../types/schemaTypes"; 

const ChatListSchema: Schema<IChatListSchema> = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User", 
            required: true,
        },
        chatWithUserId: {
            type: Schema.Types.ObjectId,
            ref: "User", 
            required: true,
        },
        lastMessage: {
            type: String,
            required: true,
        },
        lastMessageAt: {
            type: Date,
            required: true,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const ChatListModel: Model<IChatListSchema> = mongoose.model<IChatListSchema>("ChatList", ChatListSchema);
export default ChatListModel;
