import axios from "axios";
import { asyncHandler } from "../utils/asyncHandler";
import { CustomRequest } from "../../types/commonType";
import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import { ApiError } from "../utils/ApisErrors";
import { Request, Response } from "express";


// reverseGeocode to fetch address or location string from coordinates
export const reverseGeocode = asyncHandler(async (req: Request, res: Response) => {
    const { latitude, longitude } = req.query;

    const apiKey = process.env.GOOGLE_API_KEY;

    if (!latitude || !longitude) {
        return sendErrorResponse(
            res,
            new ApiError(400, "Latitude and longitude are required.", [], null)
        );
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;

    try {
        const response = await axios.get(url);

        if (!response.data.results || response.data.results.length === 0) {
            throw new ApiError(400, "No address found for the given coordinates.", [], response.data);
        }

        const address = {
            zipCode: response.data.results[0].address_components[1],
            geometry: response.data.results[0].geometry,
            formatted_address: response.data.results[0].formatted_address // First result is usually the most relevant
        };

        return sendSuccessResponse(res, 200, address, "Current address fetched.");
    } catch (error: any) {
        const errorData = error.response?.data || error.message || error;
        return sendErrorResponse(
            res,
            new ApiError(
                400,
                "Failed to fetch address.",
                errorData
            )
        );
    }
});

//get coordinates from zipcode
export const getCoordinatesFromZip = asyncHandler(async (req: Request, res: Response) => {
    const { zipCode } = req.query;

    const apiKey = process.env.GOOGLE_API_KEY;

    if (!zipCode) {
        return sendErrorResponse(
            res,
            new ApiError(400, "ZIP code is required.", [], null)
        );
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${zipCode}&key=${apiKey}`;

    try {
        const response = await axios.get(url);

        if (!response.data.results || response.data.results.length === 0) {
            throw new ApiError(400, "No coordinates found for the given ZIP code.", [], response.data);
        }

        const location = response.data.results[0];

        const coordinates = {
            latitude: location.geometry.location.lat,
            longitude: location.geometry.location.lng,
            formattedAddress:location.formatted_address
        };

        return sendSuccessResponse(res, 200, coordinates, "Coordinates fetched successfully.");
    } catch (error: any) {
        const errorData = error.response?.data || error.message || error;
        return sendErrorResponse(
            res,
            new ApiError(400, "Failed to fetch coordinates.", errorData)
        );
    }
});
