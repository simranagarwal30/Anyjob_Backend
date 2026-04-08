import { CustomRequest } from '../../../types/commonType';
import { Request, Response, NextFunction } from 'express';
import UserModel from '../../models/user.model';
import { IUser } from '../../../types/schemaTypes';
import { asyncHandler } from '../../utils/asyncHandler';






// HandleSocialAuthError
export const HandleSocialAuthError = asyncHandler(async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { email, uid, displayName, photoURL, phoneNumber } = req.body;

    try {
        // Check if all required fields are present
        if (!email || !uid || !displayName || !photoURL ) {
            return res.status(400).send({
                success: false,
                message: 'Social login data is missing or incomplete!',
                key: 'social_login_data'
            });
        };

        let user;

        if (email) {
            user = await UserModel.findOne({ email: email });
        }
        else if (phoneNumber) {
            user = await UserModel.findOne({ phone: phoneNumber });
        };

        // If user exists, attach user object to the request and skip password check
        if (user) {
            // If user exists and is deleted, return appropriate response
            if (user.isDeleted === true) {
                return res.status(403).json({ success: false, message: 'Your account has been deleted. Please contact support for further assistance.', key: 'user' });
            }
            req.user = user ;
            return next();
        } else {
            // If user doesn't exist, proceed to the next middleware/controller
            return next();
        }

    } catch (exc: any) {
        console.log(exc.message);
        return res.status(500).json({ success: false, message: "Something went wrong. Please try again.", error: exc.message });
    }
});