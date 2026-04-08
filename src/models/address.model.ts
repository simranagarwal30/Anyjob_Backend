import mongoose, { Schema, Model } from "mongoose";
import { IAddressType } from "../../types/schemaTypes";

// Address Schema
const AddressSchema: Schema<IAddressType> = new Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, require: true },
    street: { type: String, required: false, default: "" },
    zipCode: { type: String, required: [true, "Zipcode is Required"] },
    addressType: { type: String, required: [true, "addressType is Required"], enum: ["home", "office", "others"], },
    location: { type: String, required: [true, "location is Required"], },
    latitude: { type: String, required: [true, "Latitude is Required"] },
    longitude: { type: String, required: [true, "Longitude is Required"] },
    city: { type: String, required: false, default: "" },
    state: { type: String, required: false, default: "" },
    country: { type: String, required: false, default: "" },
    apartmentNumber: { type: String, default: "" },
    landmark: { type: String, default: "" },
}, { timestamps: true });

const AddressModel: Model<IAddressType> = mongoose.model<IAddressType>("address", AddressSchema);
export default AddressModel;
