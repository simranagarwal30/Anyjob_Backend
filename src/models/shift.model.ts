import mongoose, { Schema, Model } from "mongoose";
import { IShiftSchema, IShiftTimeSchema } from '../../types/schemaTypes';

// Define a schema for shift times
const shiftTimeSchema: Schema<IShiftTimeSchema> = new Schema({
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  }
},);

// Define the main Shift schema
const shiftSchema: Schema<IShiftSchema> = new Schema({
  shiftName: {
    type: String,  // Example: 'Morning', 'Evening', 'Night'
    required: true,
    unique: true
  },
  shiftTimes: [shiftTimeSchema],  // Array of shift times for each shift
  isDeleted: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

}, { timestamps: true });

// Create the Shift model
const ShiftModel: Model<IShiftSchema> = mongoose.model<IShiftSchema>('shift', shiftSchema);
export default ShiftModel;