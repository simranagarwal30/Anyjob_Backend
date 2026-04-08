import mongoose, { Schema, Model } from "mongoose";
import { IAppReviewSchema } from "../../types/schemaTypes";

const AppReviewSchema: Schema<IAppReviewSchema> = new Schema(
    {
        ratedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        rating: {
            type: Number,
        },
        review: {
            type: String,
            default:""
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const AppReviewModel: Model<IAppReviewSchema> = mongoose.model<IAppReviewSchema>("AppReview", AppReviewSchema);
export default AppReviewModel;