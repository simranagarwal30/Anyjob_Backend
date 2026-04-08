import mongoose, { Schema, Model } from "mongoose";
import { IContactUsSchema } from "../../types/schemaTypes";
import { boolean } from "joi";

const ContactUsSchema: Schema<IContactUsSchema> = new Schema({
    fullName: {
        type: String,
    },
    email: {
        type: String,
    },
    contactNumber: {
        type: String,
    },
    message: {
        type: String,
    },
    senderId: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    receiverId: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
}, { timestamps: true }
);

const ContactUsModel: Model<IContactUsSchema> = mongoose.model<IContactUsSchema>("ContactUs", ContactUsSchema);
export default ContactUsModel;