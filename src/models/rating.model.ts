import mongoose, { Model, Schema } from "mongoose";
import { IRatingSchema } from "../../types/schemaTypes";

const RatingSchema: Schema<IRatingSchema> = new Schema({
    ratedBy: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: [true, "Rated By 'ID' is missing!"]
    },
    ratedTo: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: [true, "Rated To 'ID' is missing!"]
    },
    rating: {
        type: Number,
        required: [true, "Some rating must be needed!"]
    },
    comments: {
        type: String,
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
}, { timestamps: true });

const RatingModel: Model<IRatingSchema> = mongoose.model<IRatingSchema>('rating', RatingSchema);
export default RatingModel;