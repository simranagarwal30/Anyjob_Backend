import Joi from 'joi';
import { IUser } from '../../../types/schemaTypes';

const validateUser = (userModel: IUser) => {
    const UserSchema = Joi.object({
        firstName: Joi.string().min(3).max(60).required().trim().messages({
            "string.empty": "First name is required!",
            "string.min": "Minimum length should be 3",
            "string.max": "Maximum length should be 60"
        }),
        lastName: Joi.string().min(3).max(60).required().trim().messages({
            "string.empty": "Last name is required!",
            "string.min": "Minimum length should be 3",
            "string.max": "Maximum length should be 60"
        }),
        email: Joi.string().email().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).required().lowercase().trim().messages({
            "string.empty": "Email Address is required",
            "string.email": "Invalid email format",
            "string.pattern.base": "Email must be a valid format"
        }),
        password: Joi.string().required().messages({
            "string.empty": "Password is required"
        }),
        phone: Joi.string()
            .pattern(/^[0-9]{10}$/)
            .optional()
            .messages({
                'string.pattern.base': 'Phone number must be a valid 10-digit number.',
                'string.empty': 'Phone number is required.',
                'any.required': 'Phone number is a required field.'
            }),
        coverImage: Joi.string().optional().allow("").default(""),
        refreshToken: Joi.string().optional().allow("").default(""),
        isDeleted: Joi.boolean().default(false),
    }).unknown(true);

    return UserSchema.validate(userModel, { abortEarly: false });
};

export default validateUser;