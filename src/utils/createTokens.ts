import { Response } from "express";
import { ObjectId } from "mongoose";
import { ApiError } from "./ApisErrors";
import userModel from '../models/user.model';

export const generateAccessAndRefreshToken = async (res: Response, userId: string | ObjectId): Promise<{ accessToken: string | undefined; refreshToken: string | undefined }> => {
    try {
        const user = await userModel.findById(userId);
        const accessToken = user?.generateAccessToken();
        const refreshToken = user?.generateRefreshToken();

        if (!user) {
            throw new ApiError(400, "User Not Found");
        }
        user.refreshToken = refreshToken;
        await user?.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };


    } catch (err) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    };
};