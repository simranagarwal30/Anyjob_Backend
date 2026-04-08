import { Request, Response, NextFunction } from 'express';
import { ValidationResult } from 'joi';
import { ApiError } from '../../utils/ApisErrors';
import { sendErrorResponse } from '../../utils/response';

// Define the type for the validator function
type ValidatorFunction = (data: any) => ValidationResult;

// Define the middleware function
const ModelAuth = (validator: ValidatorFunction) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const { error, value } = validator(req.body);
        // console.log(req.body);
        
        if (error) {
            // Create an ApiError instance for validation errors
            const errorResponse = new ApiError(
                400,
                "Validation Error",
                error.details.map(detail => ({
                    message: detail.message,
                    path: detail.path
                }))
            );

            return sendErrorResponse(res, errorResponse);
        }

        // Attach validated body to request object
        (req as any).validatedBody = value;
        next();
    };
};

export default ModelAuth;