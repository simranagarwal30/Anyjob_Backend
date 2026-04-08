import { Request, Response, NextFunction } from "express";
import { AsyncHandler } from '../../types/commonType'

const asyncHandler = (fn: AsyncHandler) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        await fn(req, res, next);
    } catch (error: any) {
        console.log(error.message);
        res.status(error.code || 500).json({
            success: false,
            message: error.message
        });
    }
}

export {
    asyncHandler
};

