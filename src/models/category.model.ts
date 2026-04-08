import mongoose, { Schema, Model } from "mongoose";
import { ICategorySchema } from "../../types/schemaTypes";

const CategorySchema: Schema<ICategorySchema> = new Schema({
    name: {
        type: String,
        default: "",
        required: true
    },
    serviceCost: {
        type: String
    },
    categoryImage: {
        type: String,
        default: "",
    },
    categoryType: {
        type: String,
        enum: ["Regular", "Sessional"],
        default: "Regular",
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
}, { timestamps: true });


const CategoryModel: Model<ICategorySchema> = mongoose.model<ICategorySchema>('category', CategorySchema);
export default CategoryModel;
