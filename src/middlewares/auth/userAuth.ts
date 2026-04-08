import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../utils/ApisErrors';
import { sendErrorResponse } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import jwt, { JwtPayload } from 'jsonwebtoken';
import UserModel from '../../models/user.model';
import { CustomRequest } from '../../../types/commonType';

// VerifyToken
export const VerifyJWTToken = asyncHandler(async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        let token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            console.log("Token is missing or empty");
            return sendErrorResponse(res, new ApiError(401, "Unauthorized Request"));
        };

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as string) as JwtPayload;
        const user = await UserModel.findById(decodedToken?._id).select("-password -refreshToken");

        if (!user) {
            return sendErrorResponse(res, new ApiError(401, "Invalid access token"));
        };
        req.user = user;

        next();
    } catch (error: any) {
        return sendErrorResponse(res, new ApiError(401, error.message || "Invalid access token"));
    }
});

// verifyUserType
export const verifyUserType = (requiredUserTypes: string[] | null = null) => {
    return asyncHandler(async (req: CustomRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return sendErrorResponse(res, new ApiError(401, "Unauthorized Request"));
        }

        if (requiredUserTypes && !requiredUserTypes.includes(req.user.userType)) {
            return sendErrorResponse(res, new ApiError(403, `Access denied. Requires one of the following roles: ${requiredUserTypes.join(", ")}.`));
        }

        next();
    });
};