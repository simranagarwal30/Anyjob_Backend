import { Document, ObjectId } from "mongoose";
export interface IGeoJSONPoint {
    type: "Point";
    coordinates: [string, string]; // [longitude, latitude]
}

export interface IPurchaseSchema {
    userId: ObjectId;
    serviceId: ObjectId;
    paymentMethodId: string;
    paymentMethodDetails: IPaymentMethodSchema;
    stripeCustomerId: string;
    lastPendingPaymentIntentId: string;
    paymentIntentId: string;
    currency: string;
    amount: number;
    status: string;
    // receipt_url: string;
    createdAt?: Date;
    updatedAt?: Date;
};
export interface ICancellationFeeSchema {
    userId: ObjectId;
    serviceId: ObjectId;
    paymentMethodId: string;
    paymentMethodDetails: IPaymentMethodSchema;
    stripeCustomerId: string;
    lastPendingPaymentIntentId: string;
    paymentIntentId: string;
    currency: string;
    amount: number;
    status: string;
    receipt_url: string;
    createdAt?: Date;
    updatedAt?: Date;
};
export interface IPaymentMethodSchema {
    userId: ObjectId;
    paymentMethodId: string;
    stripeCustomerId: string;
    last4: string;
    brand: string;
    exp_month: number;
    exp_year: number;
    is_default: boolean;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};

export interface IUser extends Document {
    _id: string | ObjectId;
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dob: Date;
    oldPassword: string;
    password: string;
    avatar: string;
    coverImage: string;
    isVerified: boolean;
    isOtpPolicyAccepted: boolean;
    userType: string;
    refreshToken?: string;
    fcmToken?: string;
    stripeCustomerId?: string;
    paymentMethodId?: string;
    isPasswordCorrect(password: string): Promise<boolean>;
    generateAccessToken(): string;
    generateRefreshToken(): string;
    isDeleted?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    geoLocation: IGeoJSONPoint;
};
export interface IAdditionalUserInfo extends Document {
    _id: string | ObjectId;
    userId: ObjectId;
    companyName: string;
    companyIntroduction: string;
    driverLicense: string;
    driverLicenseImages: Array<string>;
    EIN: string;
    socialSecurity: string;
    companyLicense: string;
    companyLicenseImage: string;
    insurancePolicy: string;
    licenseProofImage: string;
    businessLicenseImage: string;
    businessImage: string;
    businessName: string;
    routing_number: string;//bank account details
    account_number: string;//bank account details
    account_holder_name: string;//bank account details
    account_holder_type: string;//bank account details
    isReadAggrement: boolean;
    isAnyArrivalFee?: boolean;
    arrivalFee: number;
    totalYearExperience: Number,
    isDeleted?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};

export interface IAddressType extends Document {
    _id: string | ObjectId;
    userId: ObjectId;
    location: string;
    addressType: string;
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    apartmentNumber?: string;
    landmark?: string;
    latitude: string;
    longitude: string;
    isPrimary?: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export interface ICategorySchema extends Document {
    _id: ObjectId;
    name: string;
    categoryImage: string;
    serviceCost: string;
    categoryType: string;
    owner: ObjectId;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    serviceCost: string;
};

export interface ISubCategorySchema extends Document {
    _id: ObjectId;
    categoryId: ObjectId;
    name: string;
    subCategoryImage: string;
    questionArray: Array<any>;
    owner: ObjectId;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};



export interface IServiceSchema extends Document {
    _id: ObjectId;
    categoryId: ObjectId;
    serviceStartDate: Date;
    serviceShifftId: ObjectId;
    SelectedShiftTime: object;
    serviceProductImage: string;
    serviceZipCode: string;
    serviceLatitude: string;
    serviceLongitude: string;
    serviceAddress: string;
    location: IGeoJSONPoint;
    serviceLandMark: string;
    startedAt: Date;
    completedAt: Date;
    isIncentiveGiven: boolean;
    incentiveAmount: number;
    isTipGiven: boolean;
    tipAmount: number;
    isApproved: string;
    isReqAcceptedByServiceProvider: boolean;
    serviceProviderId: ObjectId;
    assignedAgentId: ObjectId;
    otherInfo: object;
    userId: ObjectId;
    answerArray: Array<any>;
    requestProgress: string;
    useMyCurrentLocation: boolean,
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    acceptedAt?: Date;
    cancelledBy: ObjectId;
    cancellationReason: string;
    neighbourLandmark: string;
    landmarkPostalcode: string;
    
};

export interface IDerivedQuestion {
    option: string;
    question: string;
    options: Map<string, string>;
    derivedQuestions: IDerivedQuestion[];
};

export interface IQuestion {
    map(arg0: (questionData: IQuestion) => Promise<import("mongoose").Types.ObjectId>): any;
    categoryId: mongoose.Types.ObjectId;
    subCategoryId: mongoose.Types.ObjectId;
    question: string;
    options: Map<string, string>;
    derivedQuestions: IDerivedQuestion[]; // Derived questions are stored here
    isDeleted: boolean,
    createdAt?: Date;
    updatedAt?: Date;

};

// Interface for Derived Answer
interface IDerivedAnswer extends Document {
    option: string;
    answer: string;
    derivedAnswers: IDerivedAnswer[];
}

// Interface for Answer
interface IAnswer extends Document {
    answer: string;
    selectedOption: string;
    derivedAnswers: IDerivedAnswer[];
}

export interface IShiftTimeSchema extends Document {
    _id: ObjectId;
    startTime: string;
    endTime: string;
};

export interface IShiftSchema extends Document {
    _id: ObjectId;
    shiftName: string;
    shiftTimes: IShiftTimeSchema[];
    createdBy: ObjectId;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};

export interface IOTPSchema extends Document {
    _id: ObjectId;
    userId: ObjectId;
    phoneNumber: string;
    email: string;
    otp: string;
    secret: string;
    twilioSid: string;
    createdAt?: Date;
    expiredAt: Date;
    updatedAt?: Date;
    isVerified?: boolean;
};
export interface IVerifiedOTPSchema extends Document {
    _id: ObjectId;
    userId: ObjectId;
    phoneNumber: string;
    otp: string;
    createdAt?: Date;
    updatedAt?: Date;
};

export interface IRatingSchema extends Document {
    _id: ObjectId;
    ratedBy: ObjectId;
    ratedTo: ObjectId;
    rating: number;
    comments: string;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};
export interface ITeamSchema extends Document {
    _id: ObjectId;
    serviceProviderId: ObjectId;
    fieldAgentIds: Array;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};

export interface IPermissionSchema extends Document {
    _id: ObjectId;
    userId: ObjectId;
    acceptRequest: boolean;
    assignJob: boolean;
    fieldAgentManagement: boolean;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};

export interface IIPLogSchema extends Document {
    _id: ObjectId;
    ipAddress: string;
    country: string;
    region: string;
    latitude: string;
    longitude: string;
    userAgent: string;
    version: string;
    route: string;
    userId: string;
    userType: string;
    timestamp: Date;
};

export interface IChatSchema {
    fromUserId: ObjectId;
    toUserId: ObjectId;
    content: string;
    isRead?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};

export interface IChatListSchema {
    userId: ObjectId;
    chatWithUserId: ObjectId;
    lastMessage: string;
    lastMessageAt: Date;
    isRead?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};
export interface IBankDetailsSchema {
    userId: ObjectId;
    bankName: string;
    accountHolderName: string;
    branchCode: string;
    accountNumber: string;
    cardNumber: string;
    cardType: string;
    cardHolderName: string;
    createdAt?: Date;
    updatedAt?: Date;
};

export interface IContactUsSchema {
    fullName: string;
    email: string;
    contactNumber: string;
    message: string;
    senderId: ObjectId;
    receiverId: ObjectId;
    isRead: boolean;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};
export interface IUserPreferenceSchema {
    userId: ObjectId;
    userType: string
    notificationPreference: boolean;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};
export interface INotificationSchema {
    senderId: ObjectId;
    receiverId: ObjectId;
    title: string;
    notificationType: string
    isRead: boolean;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};
export interface IAppReviewSchema {
    ratedBy: ObjectId;
    rating: number;
    review: string;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
};




