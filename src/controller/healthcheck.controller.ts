import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import mongoose from "mongoose";
import os from 'os';
import { HealthcheckApiResponse, HealthcheckResponse } from "../../types/requests_responseType";
import { ApiError } from "../utils/ApisErrors";

// healthcheck controller
export const healthcheck = asyncHandler(async (req: Request, res: Response<HealthcheckApiResponse>) => {
    try {
        const networkInterfaces = os.networkInterfaces();

        // Extract IPv4 addresses
        const IPv4Addresses = Object.values(networkInterfaces)
            .flat()
            .filter((interfaceInfo): interfaceInfo is os.NetworkInterfaceInfo =>
                interfaceInfo !== undefined && interfaceInfo.family === 'IPv4')
            .map(interfaceInfo => interfaceInfo.address);

        if (mongoose.connection.name) {
            const message: HealthcheckResponse = {
                host: IPv4Addresses,
                message: 'Healthy',
                status: true,
                time: new Date(),
            };
            return res.status(200).json({ response: message });
        } else {
            const message: HealthcheckResponse = {
                host: IPv4Addresses,
                message: 'Unhealthy',
                status: false,
                time: new Date(),
            };
            return res.status(501).json({ response: message });
        }
    } catch (error) {
        throw new ApiError(500, (error as Error).message);
    }
});