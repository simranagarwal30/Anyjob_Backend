import { Response, NextFunction, Request } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { CustomRequest } from '../../types/commonType';
import IPLog from '../models/IP.model';



export const captureIP = asyncHandler(async (req: Request, res: Response) => {

    try {
        const {
            ipAddress,
            country,
            region,
            latitude,
            longitude,
            userAgent,
            route,
            userId,
            userType,
        } = req.body;

        if (!ipAddress || !userAgent ) {
            return res.status(400).json({ message: "All required fields must be provided." });
        }

        // Create a new IPLog document
        const newLog = await IPLog.create({
            ipAddress,
            country,
            region,
            latitude,
            longitude,
            userAgent,
            route,
            userId: userId || null,
            userType: userType || null,
        });

        // Respond with the created log entry
        res.status(201).json({
            message: "IP Log entry created successfully.",
            log: newLog,
        });
    } catch (error) {
        console.error("Error creating IP log:", error);
        res.status(500).json({
            message: "An error occurred while creating the IP log.",
        });
    }

});
