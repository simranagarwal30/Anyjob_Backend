import mongoose, { Schema, Model } from "mongoose";
import { IVerifiedOTPSchema } from "../../types/schemaTypes";

const verifiedOtpSchema: Schema<IVerifiedOTPSchema> = new Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    phoneNumber: {
        type: String,
    },
    otp: {
        type: String,
        unique: true,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },

}, { timestamps: true });

const VerifiedOTPModel: Model<IVerifiedOTPSchema> = mongoose.model<IVerifiedOTPSchema>('verifiedotp', verifiedOtpSchema);
export default VerifiedOTPModel;
