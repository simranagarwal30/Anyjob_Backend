import { ObjectId } from "mongoose";

interface ICredentials {
    email: string;
    password: string;
};
export interface ILoginCredentials extends ICredentials { };

export interface IRegisterCredentials extends ICredentials {
    firstName: string;
    lastName: string;
    userType: string;
    email:string;
    phone:string;
    avatar:string;
};

export interface IAddCategoryPayloadReq {
    name: string,
    categoryImage: string
    serviceCost: string
};

export interface IAddSubCategoryPayloadReq {
    categoryId: mongoose.Types.ObjectId,
    name: string,
    subCategoryImage: string,
    questionArray: IQuestion
};

export interface IAddSubCategoryQuestionArray {
    question: string,
    options: Map<string, string>;
    derivedQuestions: IDerivedQuestion[]; // Derived questions are stored here
};

export interface IDerivedQuestion {
    option: string;
    question: string;
    options: Map<string, string>;
    derivedQuestions: IDerivedQuestion[];
};

export interface IAddQuestionPayloadReq {
    categoryId: mongoose.Types.ObjectId,
    questionArray: IQuestion
};

export interface IQuestion {
    map(arg0: (questionData: IQuestion) => Promise<import("mongoose").Types.ObjectId>): any;
    categoryId: mongoose.Types.ObjectId;
    subCategoryId: mongoose.Types.ObjectId;
    question: string;
    options: Map<string, string>;
    derivedQuestions: IDerivedQuestion[]; // Derived questions are stored here
    isDeleted: boolean
};

export interface IFetchQuestionCatSubCatWiseParams {
    categoryId: ObjectId;
    subCategoryId: ObjectId;
};

export interface IAddServicePayloadReq {
    categoryId: ObjectId,
    serviceStartDate: Date,
    serviceShifftId: ObjectId,
    SelectedShiftTime: object,
    serviceZipCode: number,
    serviceLandMark: string,
    serviceLatitude: number,
    serviceLongitude: number,
    userPhoneNumber: string,
    serviceAddress:string,
    isIncentiveGiven: boolean,
    incentiveAmount: number,
    serviceProductImage:string;
    isTipGiven: boolean,
    tipAmount: number,
    otherInfo:object,
    userId: ObjectId,
    answerArray: IQuestion,
    useMyCurrentLocation:boolean,
    serviceAddressId:ObjectId
};

export interface HealthcheckResponse {
    host: Array<string>;
    message: string;
    status: boolean;
    time: Date;
};

export interface HealthcheckApiResponse {
    response: HealthcheckResponse;
};