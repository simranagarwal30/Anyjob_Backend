import mongoose, { Schema, Model } from "mongoose";
import { IAnswer, IDerivedAnswer, IServiceSchema } from "../../types/schemaTypes";


// Schema for Derived Answer (Recursive)
const derivedAnswerSchema = new Schema<IDerivedAnswer>({
    option: { type: String, required: true },
    answer: { type: String, required: true },
    derivedAnswers: [this] // Recursive structure to hold derived answers
});

// Schema for Main Answer
const answerSchema = new Schema<IAnswer>({
    answer: { type: String, required: true },
    selectedOption: { type: String, required: true },
    derivedAnswers: [derivedAnswerSchema] // Derived answers are nested here
});


const ServiceSchema: Schema<IServiceSchema> = new Schema({
    categoryId: {
        type: Schema.Types.ObjectId,
        ref: "category",
        required: [true, "Category Id is Required"]
    },
    serviceStartDate: {
        type: Date,
        required: [true, "Service Start Date is Required"]
    },
    serviceShifftId: {
        type: Schema.Types.ObjectId,
        ref: "shift",
        required: [true, "Service Shift is Required"]
    },
    SelectedShiftTime: {
        shiftId: {
            type: Schema.Types.ObjectId,
            ref: "shift",
            required: [true, "Service Shift is Required"]
        },
        shiftTimeId: {
            type: Schema.Types.ObjectId,
            ref: "shift",
            required: true
        }

        // required:  [true, "Service Shift Time is Required"]
    },
    serviceZipCode: {
        type: String,
        // required: [true, "Service Zipcode is required"]
    },
    neighbourLandmark: {
        type: String,
        // required: [true, "Service Zipcode is required"]
    },
    landmarkPostalcode: {
        type: String,
        // required: [true, "Service Zipcode is required"]
    },
    serviceLatitude: {
        type: String,
        // required: [true, "Service Latitude is required"]
    },
    serviceLongitude: {
        type: String,
        // required: [true, "Service Longitude is required"]
    },
    serviceAddress: {
        type: String,
        default:"",
        // required: [true, "Service Address is required"]
    },    
    serviceLandMark: {
        type: String,
        default:"",
        // required: [true, "Service Address is required"]
    },    
    location: {
        type: {
            type: String, // Always 'Point'
            enum: ["Point"], // GeoJSON format
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
        },
    },
    isIncentiveGiven: {
        type: Boolean,
        default: false
    },
    acceptedAt: {
        type: Date,
        default: null
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    incentiveAmount: {
        type: Number,
        default: 0,
    },
    isTipGiven: {
        type: Boolean,
        default: false
    },
    useMyCurrentLocation: {
        type: Boolean,
        default: false
    },
    tipAmount: {
        type: Number,
        default: 0,
    },
    isReqAcceptedByServiceProvider: {
        type: Boolean,
        default: false
    },
    serviceProviderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        default: null
    },
    assignedAgentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        default: null
    },//can be a tl or fieldAgent
    answerArray: [answerSchema],
    serviceProductImage: {
        type: String,
        default: ""
    },
    otherInfo: {
        type: {
            productSerialNumber: {
                type: String
            },
            serviceDescription: {
                type: String,
                default: ""
            }

        }
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "user"
    },
    requestProgress: {
        type: String,
        enum: ["NotStarted", "Pending", "Started", "Completed", "Blocked","CancelledBySP","CancelledByFA"],
        //...."NotStarted"||"Pending"||"Started".....for all this state mark them inprogress//
        default: "NotStarted"
    },
    cancelledBy: {
        type: Schema.Types.ObjectId,
        ref: "user"
    },
    cancellationReason : {
        type: String,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },

}, { timestamps: true });


//adding geospatial index
ServiceSchema.index({ location: "2dsphere" });

const ServiceModel: Model<IServiceSchema> = mongoose.model<IServiceSchema>('service', ServiceSchema);
export default ServiceModel;