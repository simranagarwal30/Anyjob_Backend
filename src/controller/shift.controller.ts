import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { CustomRequest } from "../../types/commonType";
import { ApiError } from "../utils/ApisErrors";
import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import ShiftModel from "../models/shift.model";
import { IShiftTimeSchema } from "../../types/schemaTypes";
import { MomentTimezone } from "moment-timezone";
import moment from "moment-timezone";
import { number } from "joi";

// addShift controller
export const addShift = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    console.log("api hits");

    const {
      shiftName,
      shiftTimes,
    }: { shiftName: String; shiftTimes: IShiftTimeSchema[] } = req.body;

    //trimmed shiftName
    const trimmedShiftName = shiftName.trim().toLowerCase();

    //check for the duplicacy
    const existinfShiftName = await ShiftModel.findOne({
      shiftName: trimmedShiftName,
    });

    if (existinfShiftName) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Shift with the same name already exists.")
      );
    }

    // Function to convert readable time to UTC
    // const convertTimeToUTC = (time: string) => {
    //     const todayDate = moment().format("YYYY-MM-DD");
    //     const dateTimeIST = `${todayDate} ${time}`;
    //     const utcDateTime = moment.tz(dateTimeIST, "YYYY-MM-DD h:mm A", "Asia/Kolkata").utc();
    //     return utcDateTime.toISOString();
    // };

    // Convert all shiftTimes to UTC
    // const formattedShiftTimes = shiftTimes.map(({ startTime, endTime }: IShiftTimeSchema) => ({
    //     startTime: new Date(startTime),
    //     endTime: new Date(endTime),
    // }));

    // Create and save the shift
    const newShift = await ShiftModel.create({
      shiftName: trimmedShiftName,
      shiftTimes: shiftTimes,
      createdBy: req.user?._id,
    });

    if (!newShift) {
      return sendErrorResponse(
        res,
        new ApiError(500, "Something went wrong while adding the Shift.")
      );
    }

    return sendSuccessResponse(res, 201, newShift, "Shift added Successfully");
  }
);

// fetchShiftbyId controller
export const fetchShiftbyId = asyncHandler(
  async (req: Request, res: Response) => {
    const { shiftId } = req.params;
    const results = await ShiftModel.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(shiftId),
        },
      },
      {
        $project: {
          isDeleted: 0,
          __v: 0,
        },
      },
    ]);
    const responseData = results.length
      ? sendSuccessResponse(
          res,
          200,
          results[0],
          "Shift Timings retrieved successfully."
        )
      : sendErrorResponse(res, new ApiError(400, "Shift not found."));
    return responseData;
  }
);

// fetchShifs controller
export const fetchShifs = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const results = await ShiftModel.aggregate([
      { $match: { isDeleted: false } },
      {
        $project: {
          _id: 1,
          shiftName: 1,
          shiftTimes: 1,
        },
      },
    ]);
    if (results.length) {
      return sendSuccessResponse(
        res,
        200,
        results,
        "Shift Timings retrieved successfully."
      );
    } else {
      return sendErrorResponse(res, new ApiError(400, "Shift not found."));
    }
  }
);

// export const fetchAvilableShifs = asyncHandler(
//   async (req: CustomRequest, res: Response) => {
//     // Get current time in EST
//     // const currentESTTime = new Date(
//     //   new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
//     // );
//     const now = new Date(); // Current date and time in local timezone
//     // Display in a specific timezone
//     const formatter = new Intl.DateTimeFormat("en-US", {
//       timeZone: "America/New_York",
//       year: "numeric",
//       month: "long",
//       day: "numeric",
//       hour: "numeric",
//       minute: "numeric",
//       second: "numeric",
//     });
//     console.log({ formatter });

//     const currentESTTime = formatter.format(now);
//     console.log({ currentESTTime });

//     const { fetchingDate } = req.params;
//     const providedDate = new Date(fetchingDate).getTime();
//     console.log({ providedDate });

//     // Get EST current date (midnight)
//     const cleanString = currentESTTime.replace(" at", "");
//     const currentDateEST = new Date(cleanString).getTime();
//     console.log({ currentDateEST });

//     // Check if fetchingDate is in the past (EST context)
//     if (providedDate < currentDateEST) {
//       return sendErrorResponse(
//         res,
//         new ApiError(400, "Booking date cannot be in the past.")
//       );
//     }

//     // Check if booking is for today (EST)
//     const isToday =
//       new Date(providedDate).getDate() === new Date(currentDateEST).getDate();
//     console.log("provided: ", new Date(providedDate).getDate());
//     console.log("currentdate: ", new Date(currentDateEST).getDate());
//     console.log({isToday});

//     const currentHours = new Date(cleanString).getHours();
//     const currentMinutes = new Date(cleanString).getMinutes();
//     console.log({ currentHours });
//     console.log({ currentMinutes });
//     //////////////////////////////////

//     const results = await ShiftModel.aggregate([
//       { $match: { isDeleted: false } },
//     //   {
//     //     $addFields: {
//     //       shiftTimes: {
//     //         $filter: {
//     //           input: {
//     //             $map: {
//     //               input: "$shiftTimes",
//     //               as: "shift",
//     //               in: {
//     //                 endTime: {
//     //                   $dateToString: {
//     //                     format: "%H:%M",
//     //                     date: "$$shift.endTime",
//     //                     timezone: "America/New_York",
//     //                   },
//     //                 },
//     //                 endHour: {
//     //                   $hour: {
//     //                     date: "$$shift.endTime",
//     //                     timezone: "America/New_York",
//     //                   },
//     //                 },
//     //                 endMinute: {
//     //                   $minute: {
//     //                     date: "$$shift.endTime",
//     //                     timezone: "America/New_York",
//     //                   },
//     //                 },
//     //                 _id: "$$shift._id",
//     //               },
//     //             },
//     //           },
//     //           as: "shift",

//     //         },
//     //       },
//     //     },
//     //   },
//       {
//         $project: {
//           _id: 1,
//           shiftName: 1,
//           "shiftTimes._id": 1,
//           "shiftTimes.startTime": 1,
//           "shiftTimes.endTime": 1,
//         },
//       },
//       {
//         $match: {
//           $expr: { $gt: [{ $size: "$shiftTimes" }, 0] },
//         },
//       },
//     ]);

//     if (results.length) {
//       return sendSuccessResponse(
//         res,
//         200,
//         results,
//         "Available shift timings retrieved successfully."
//       );
//     } else {
//       return sendErrorResponse(
//         res,
//         new ApiError(400, "No available shift timings.")
//       );
//     }
//   }
// );

export const fetchAvilableShifs = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const now = new Date();

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false, // Use 24-hour format so 13:00 is clear
    });

    const currentESTString = formatter.format(now);
    const cleanString = currentESTString.replace(" at", "");
    const currentESTDateObj = new Date(cleanString);

    const { fetchingDate } = req.params;
    const providedDate = new Date(fetchingDate).getTime();
    const currentDateEST = new Date(cleanString).setHours(0, 0, 0, 0);

    if (providedDate < currentDateEST) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Booking date cannot be in the past.")
      );
    }

    const isToday =
      new Date(providedDate).getDate() === new Date(currentDateEST).getDate() &&
      new Date(providedDate).getMonth() ===
        new Date(currentDateEST).getMonth() &&
      new Date(providedDate).getFullYear() ===
        new Date(currentDateEST).getFullYear();

    const currentHourEST = currentESTDateObj.getHours();
    const currentMinuteEST = currentESTDateObj.getMinutes();

    // Fetch all shifts
    let shifts = await ShiftModel.aggregate([{ $match: { isDeleted: false } }]);

    // If today, filter shiftTimes to only future slots
    if (isToday) {
      shifts = shifts.map((shift) => {
        const availableTimes = shift.shiftTimes.filter(
          (timeSlot: { startTime: string; endTime: string }) => {
            const slotHour = Number(timeSlot.startTime);
            const slotEndHour = Number(timeSlot.endTime);
            const currentFractionalHour =
              currentHourEST + currentMinuteEST / 60;
            return currentFractionalHour < slotEndHour;

            // If slot hour > current hour, it's in future
            // if (slotHour >= currentHourEST && currentHourEST < slotEndHour)
            //   return true;

            // If slot hour == current hour, check minutes
            // if (slotHour >= currentHourEST) return true;

            // return false;
          }
        );

        return {
          ...shift,
          shiftTimes: availableTimes,
        };
      });
    }
    return sendSuccessResponse(
      res,
      200,
      shifts,
      "Shift fetched Successfully"
    );

    // res.status(200).json({ isToday, shifts });
  }
);

export const updateShift = asyncHandler(async (req: Request, res: Response) => {
  const { shiftId } = req.params;
  const {
    shiftName,
    shiftTimes,
  }: { shiftName: string; shiftTimes: Array<IShiftTimeSchema> } = req.body;

  if (!shiftId) {
    return sendErrorResponse(res, new ApiError(400, "Shift ID is required."));
  }

  if (!mongoose.Types.ObjectId.isValid(shiftId)) {
    return sendErrorResponse(res, new ApiError(400, "Invalid shift ID."));
  }

  // Trim and convert name to lowercase for case-insensitive comparison
  const trimmedName = shiftName.trim();

  // Check if a category with the same name already exists, excluding the current category being updated
  const existingShift = await ShiftModel.findOne({
    _id: { $ne: new mongoose.Types.ObjectId(shiftId) }, // Exclude the current category
    shiftName: { $regex: new RegExp(`^${trimmedName}$`, "i") }, // Case-insensitive name comparison
  });

  if (existingShift) {
    return sendErrorResponse(
      res,
      new ApiError(400, "Category with the same name already exists.")
    );
  }

  // Update the shift details with new name and image (if uploaded)
  const updatedShift = await ShiftModel.findByIdAndUpdate(
    new mongoose.Types.ObjectId(shiftId),
    {
      $set: {
        shiftName: trimmedName,
        shiftTimes: shiftTimes,
      },
    },
    { new: true }
  );

  if (!updatedShift) {
    return sendErrorResponse(
      res,
      new ApiError(400, "Shift not found for updating.")
    );
  }

  return sendSuccessResponse(
    res,
    200,
    updatedShift,
    "Shift updated Successfully"
  );
});

// deleteShift controller
export const deleteShift = asyncHandler(async (req: Request, res: Response) => {
  const { shiftId } = req.params;

  if (!shiftId) {
    return sendErrorResponse(res, new ApiError(400, "Shift ID is required."));
  }

  if (!mongoose.Types.ObjectId.isValid(shiftId)) {
    return sendErrorResponse(res, new ApiError(400, "Invalid shift ID."));
  }

  // Delete the shift details
  const deletedShift = await ShiftModel.findByIdAndDelete(
    new mongoose.Types.ObjectId(shiftId)
  );

  if (!deletedShift) {
    return sendErrorResponse(
      res,
      new ApiError(400, "Shift not found for deleting.")
    );
  }

  return sendSuccessResponse(res, 200, {}, "Shift deleted Successfully");
});
