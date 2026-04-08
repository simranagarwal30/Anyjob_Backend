import mongoose, { Schema, Model } from "mongoose";
import { IUserPreferenceSchema } from "../../types/schemaTypes";

const UserPreferenceSchema: Schema<IUserPreferenceSchema> = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    userType: {
        type: String,
    },
    notificationPreference: {
        type: Boolean,
        default: true,
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
}, { timestamps: true }
);

const UserPreferenceModel: Model<IUserPreferenceSchema> = mongoose.model<IUserPreferenceSchema>("UserPreference", UserPreferenceSchema);
export default UserPreferenceModel;