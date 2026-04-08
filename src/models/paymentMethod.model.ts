import mongoose, { Model, Schema } from "mongoose";
import { IPaymentMethodSchema } from "../../types/schemaTypes";


const PaymentMethodSchema: Schema<IPaymentMethodSchema> = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
        paymentMethodId: { type: String, required: true },
        stripeCustomerId: { type: String, required: true },
        last4: { type: String, required: true },
        brand: { type: String, required: true },
        exp_month: { type: Number, required: true },
        exp_year: { type: Number, required: true },
        is_default: { type: Boolean, required: false },
        isDeleted: { type: Boolean, default:false },
    },
    { timestamps: true }
);

const PaymentMethodModel: Model<IPaymentMethodSchema> = mongoose.model("PaymentMethod", PaymentMethodSchema);
export default PaymentMethodModel;