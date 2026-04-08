import { Request, Response } from "express";
import QuestionModel from "../models/question.model";
import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import mongoose from "mongoose";
import { ApiError } from "../utils/ApisErrors";
import { CustomRequest } from "../../types/commonType";
import { IAddQuestionPayloadReq } from "../../types/requests_responseType";
import { IQuestion } from "../../types/schemaTypes";

// addQuestions controller
export const addQuestions = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { categoryId, questionArray }: IAddQuestionPayloadReq = req.body;

    const parsedQuestionArray =
      typeof questionArray === "string"
        ? JSON.parse(questionArray)
        : questionArray;

    const saveQuestions = async (
      questionData: any,
      categoryId: mongoose.Types.ObjectId
    ) => {
      const optionsMap = new Map<string, string>(
        Object.entries(questionData.options)
      );

      const derivedQuestions =
        questionData.derivedQuestions?.map((derivedQuestion: any) => ({
          option: derivedQuestion.option,
          question: derivedQuestion.question,
          options: new Map<string, string>(
            Object.entries(derivedQuestion.options)
          ),
          derivedQuestions: derivedQuestion.derivedQuestions || [],
        })) || [];

      const mainQuestion = await QuestionModel.create({
        categoryId,
        question: questionData.question,
        options: optionsMap,
        derivedQuestions,
      });
      return mainQuestion._id;
    };

    const questionIds = await Promise.all(
      parsedQuestionArray.map((questionData: IQuestion) =>
        saveQuestions(questionData, categoryId as mongoose.Types.ObjectId)
      )
    );

    return sendSuccessResponse(
      res,
      201,
      { questionIds },
      "Questions added successfully."
    );
  }
);

// export const fetchQuestionsCategorywise = asyncHandler(async (req: Request, res: Response) => {
//     const { categoryId } = req.params;
//     let finalResult;

//     const results = await QuestionModel.aggregate([
//         {
//             $match: {
//                 isDeleted: false,
//                 categoryId: new mongoose.Types.ObjectId(categoryId)
//             }
//         },
//         {
//             $lookup: {
//                 from: "categories",
//                 foreignField: "_id",
//                 localField: "categoryId",
//                 as: "categoryId"
//             }
//         },
//         {
//             $unwind: {
//                 path: "$categoryId",
//                 preserveNullAndEmptyArrays: true
//             }
//         },

//         {
//             $project: {
//                 isDeleted: 0,
//                 __v: 0,
//                 'categoryId.isDeleted': 0,
//                 'categoryId.__v': 0,
//             }
//         },
//         {
//             $sort: {
//                 createdAt: 1
//             }
//         }
//     ]);
//     if (results.length) {
//         let category = results[0].categoryId;
//         const questions = results.map(question => ({
//             _id: question._id,
//             question: question.question,
//             options: question.options,
//             derivedQuestions: question.derivedQuestions,
//             createdAt: question.createdAt,
//             updatedAt: question.updatedAt
//         }));
//         finalResult = {
//             category: {
//                 _id: category._id,
//                 name: category.name,
//                 categoryImage: category.categoryImage,
//                 owner: category.owner,
//                 questions: questions
//             }

//         }
//     }
//     return sendSuccessResponse(res, 200, finalResult, "Questions retrieved successfully for the given Category.");
// });

// fetchQuestions controller
export const fetchQuestions = asyncHandler(
  async (req: Request, res: Response) => {
    const categoryId = req.query.categoryId; // Get categoryId from query parameters

    const matchCriteria: {
      isDeleted: boolean;
      categoryId?: mongoose.Types.ObjectId;
    } = {
      isDeleted: false,
    };

    // Add categoryId to match criteria if it exists
    if (categoryId) {
      matchCriteria.categoryId = new mongoose.Types.ObjectId(
        categoryId as string
      );
    }

    const results = await QuestionModel.aggregate([
      {
        $match: matchCriteria, // Use the built match criteria
      },
      {
        $lookup: {
          from: "categories",
          foreignField: "_id",
          localField: "categoryId",
          as: "categoryId",
        },
      },
      {
        $unwind: {
          path: "$categoryId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isDeleted: 0,
          __v: 0,
          "categoryId.isDeleted": 0,
          "categoryId.__v": 0,
        },
      },
      {
        $sort: {
          createdAt: 1,
        },
      },
    ]);

    const groupedResults: Record<string, any> = {};

    results.forEach((question: any) => {
      const categoryKey = question.categoryId._id.toString();

      if (!groupedResults[categoryKey]) {
        groupedResults[categoryKey] = {
          _id: question.categoryId._id,
          name: question.categoryId.name,
          categoryImage: question.categoryId.categoryImage,
          owner: question.categoryId.owner,
          questions: [],
        };
      }

      groupedResults[categoryKey].questions.push({
        _id: question._id,
        question: question.question,
        options: question.options,
        derivedQuestions: question.derivedQuestions,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
      });
    });

    // Convert groupedResults object into an array
    const finalResults = Object.values(groupedResults);

    return sendSuccessResponse(
      res,
      200,
      finalResults,
      "Questions retrieved successfully."
    );
  }
);

// fetchSingleQuestion controller
export const fetchSingleQuestion = asyncHandler(
  async (req: Request, res: Response) => {
    const { categoryId, questionId } = req.params;
    let finalResult;

    if (!categoryId && !questionId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Both CategoryId ID and Question ID are required.")
      );
    }

    const results = await QuestionModel.aggregate([
      {
        $match: {
          categoryId: new mongoose.Types.ObjectId(categoryId),
          _id: new mongoose.Types.ObjectId(questionId),
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: "categories",
          foreignField: "_id",
          localField: "categoryId",
          as: "categoryId",
        },
      },
      {
        $unwind: {
          path: "$categoryId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          isDeleted: 0,
          __v: 0,
          "categoryId.isDeleted": 0,
          "categoryId.__v": 0,
        },
      },
    ]);

    if (!results) {
      return sendErrorResponse(res, new ApiError(400, "Question not found."));
    }

    if (results.length) {
      let category = results[0].categoryId;
      const questions = results.map((question) => ({
        _id: question._id,
        question: question.question,
        options: question.options,
        derivedQuestions: question.derivedQuestions,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
      }));
      finalResult = {
        _id: category._id,
        name: category.name,
        categoryImage: category.categoryImage,
        owner: category.owner,
        questions: questions,
      };
    }
    return sendSuccessResponse(
      res,
      200,
      finalResult,
      "Questions retrieved successfully ."
    );
  }
);

// updateSingleQuestion controller
export const updateSingleQuestion = asyncHandler(
  async (req: Request, res: Response) => {
    const { categoryId, questionId } = req.params;
    const updates = req.body;

    if (!categoryId && !questionId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Both Category ID and Question ID are required.")
      );
    }

    // Find and update the question by subcategoryId and questionId
    const updatedQuestion = await QuestionModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(questionId),
        categoryId: new mongoose.Types.ObjectId(categoryId),
      },
      { $set: updates },
      { new: true }
    ).select("-isDeleted -__v");

    if (!updatedQuestion) {
      return sendErrorResponse(res, new ApiError(400, "Question not found."));
    }

    return sendSuccessResponse(
      res,
      200,
      updatedQuestion,
      "Question updated successfully."
    );
  }
);

// deleteSingleQuestion controller
export const deleteSingleQuestion = asyncHandler(
  async (req: Request, res: Response) => {
    const { questionId } = req.params;

    if (!questionId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Question ID are required.")
      );
    }

    // Find and update the question by subcategoryId and questionId
    const deletedQuestion = await QuestionModel.findByIdAndDelete({
      _id: new mongoose.Types.ObjectId(questionId),
    });

    if (!deletedQuestion) {
      return sendErrorResponse(res, new ApiError(400, "Question not found."));
    }

    return sendSuccessResponse(res, 200, {}, "Question deleted successfully.");
  }
);

export const deleteSpecificDerivedQuestionSet = asyncHandler(
  async (req: Request, res: Response) => {
    const { questionId, derivedQuestionId } = req.body;

    if (!questionId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Question ID is required.")
      );
    }
    if (!derivedQuestionId) {
      return sendErrorResponse(
        res,
        new ApiError(400, "Derived question ID is required.")
      );
    }
    const updatedQuestionSet = await QuestionModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(questionId) },
      {
        $pull: {
          derivedQuestions: {
            _id: new mongoose.Types.ObjectId(derivedQuestionId),
          },
        },
      },
      { new: true }
    );
    console.log({ updatedQuestionSet });

    return sendSuccessResponse(
      res,
      200,
      {},
      //   updatedQuestionSet,
      "Derived question deleted successfully."
    );
  }
);
