import mongoose, { Model, Schema } from "mongoose";
import {  ICancellationFeeSchema } from "../../types/schemaTypes";


const CancellationFeeSchema: Schema<ICancellationFeeSchema> = new mongoose.Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: false },
        paymentMethodId: { type: String, required: true },
        paymentMethodDetails: {
            type: {
                userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
                paymentMethodId: { type: String, required: true },
                stripeCustomerId: { type: String, required: true },
                last4: { type: String, required: true },
                brand: { type: String, required: true },
                exp_month: { type: Number, required: true },
                exp_year: { type: Number, required: true },
            },
        },
        stripeCustomerId: { type: String, required: true },
        lastPendingPaymentIntentId: { type: String },
        paymentIntentId: { type: String, required: true },
        currency: { type: String, required: true },
        amount: { type: Number, required: true },
        status: { type: String, enum: ["pending", "succeeded", "failed"], default: "pending" },
    },
    { timestamps: true }
);

const CancellationFeeModel: Model<ICancellationFeeSchema> = mongoose.model("CancellationFee", CancellationFeeSchema);
export default CancellationFeeModel;