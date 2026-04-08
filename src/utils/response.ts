import { Response } from "express";
import { ApiError } from "./ApisErrors";
import { ApiResponse } from "./ApiResponse";

export const sendSuccessResponse = <T>(
    res: Response,
    statusCode: number,
    data: T,
    message: string = "Success",
) => {
    const response = new ApiResponse(statusCode, data, message);
    return res.status(response.statusCode).json(response);
};

export const sendErrorResponse = (res: Response, error: ApiError) => {
    const responsePayload: any = {
        statusCode: error.statusCode,
        success: error.success,
        message: error.message,
        errors: error.errors,
        data: error.data
    };
    // Conditionally add the data field if it exists and is not null
    if (error.data) {  // This will check if data exists and is not null/undefined
        responsePayload.data = error.data;
    }

    return res.status(error.statusCode).json(responsePayload);
};