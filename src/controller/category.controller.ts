import { Response, Request } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { CustomRequest } from "../../types/commonType";
import { ApiError } from "../utils/ApisErrors";
import { sendErrorResponse, sendSuccessResponse } from "../utils/response";
import CategoryModel from "../models/category.model";
import SubCategoryModel from "../models/subcategory.model";
import QuestionModel from "../models/question.model";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary";
import { IAddCategoryPayloadReq } from "../../types/requests_responseType";
import { deleteUploadedFiles } from "../middlewares/multer.middleware";


// addCategory controller
export const addCategory = asyncHandler(async (req: CustomRequest, res: Response) => {
    
    const { name, serviceCost }: IAddCategoryPayloadReq = req.body;

    const trimmedName = name.trim();
    const existingCategory = await CategoryModel.findOne({ name: { $regex: new RegExp(`^${trimmedName}$`, 'i') } });

    if (existingCategory) {
        // Delete the local image if it exists
        const categoryImageFile = req.files as { [key: string]: Express.Multer.File[] } | undefined;
        const catImgFile = categoryImageFile?.categoryImage ? categoryImageFile.categoryImage[0] : undefined;

        if (catImgFile) {
            deleteUploadedFiles({ categoryImage: categoryImageFile?.categoryImage });
        }

        return sendErrorResponse(res, new ApiError(400, "Category with the same name already exists."));
    }

    const categoryImageFile = req.files as { [key: string]: Express.Multer.File[] } | undefined;
    if (!categoryImageFile) {
        return sendErrorResponse(res, new ApiError(400, "No files were uploaded"));
    };

    const catImgFile = categoryImageFile.categoryImage ? categoryImageFile.categoryImage[0] : undefined;

    const catImg = await uploadOnCloudinary(catImgFile?.path as string);

    const newCategory = await CategoryModel.create({
        name: trimmedName,
        categoryImage: catImg?.secure_url,
        serviceCost,
        owner: req.user?._id,
    });    

    if (!newCategory) {
        return sendErrorResponse(res, new ApiError(500, "Something went wrong while adding the Category."));
    };

    return sendSuccessResponse(res, 201, newCategory, "Category added Successfully");
});

//fetch all category
export const getCategories = asyncHandler(async (req: Request, res: Response) => {

    const results = await CategoryModel.aggregate([
        {
            $match: { isDeleted: false, categoryType: "Regular" }
        },
    ]);
    return sendSuccessResponse(res, 200, results, "Regular category retrieved successfully.");
});

// updateCategory controller
// export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
//     const { CategoryId } = req.params;
//     const { name,  }: { name: string,  } = req.body;

//     if (!CategoryId) {
//         return sendErrorResponse(res, new ApiError(400, "Category ID is required."));
//     };

//     const trimmedName = name.trim();

//     const existingCategory = await CategoryModel.findOne({
//         _id: { $ne: new mongoose.Types.ObjectId(CategoryId) },
//         name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
//     });

//     if (existingCategory) {
//         const categoryImageFile = req.files as { [key: string]: Express.Multer.File[] } | undefined;
//         const catImgFile = categoryImageFile?.categoryImage ? categoryImageFile.categoryImage[0] : undefined;

//         if (catImgFile) {
//             deleteUploadedFiles({ categoryImage: categoryImageFile?.categoryImage })
//         }

//         return sendErrorResponse(res, new ApiError(400, "Category with the same name already exists."));
//     }

//     const categoryImageFile = req.files as { [key: string]: Express.Multer.File[] } | undefined;
//     const catImgFile = categoryImageFile?.categoryImage ? categoryImageFile.categoryImage[0] : undefined;

//     let catImgUrl;
//     if (catImgFile) {
//         const catImg = await uploadOnCloudinary(catImgFile.path);
//         catImgUrl = catImg?.secure_url;
//     }

//     const updatedCategory = await CategoryModel.findByIdAndUpdate(
//         new mongoose.Types.ObjectId(CategoryId),
//         {
//             $set: {
//                 name: trimmedName,
//                 ...(catImgUrl && { categoryImage: catImgUrl }) // Only update image if uploaded
//             },
//         },
//         { new: true }
//     );

//     if (!updatedCategory) {
//         return sendErrorResponse(res, new ApiError(400, "Category not found for updating."));
//     };

//     return sendSuccessResponse(res, 200, updatedCategory, "Category updated Successfully");
// });
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const { CategoryId } = req.params;
    const { name, serviceCost }: { name: string, serviceCost: string } = req.body;
    console.log(req.body);    
    if (!CategoryId) {
        return sendErrorResponse(res, new ApiError(400, "Category ID is required."));
    };
    const trimmedName = name.trim();
    const existingCategory = await CategoryModel.findOne({
        _id: { $ne: new mongoose.Types.ObjectId(CategoryId) },
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') }
    });
    if (existingCategory) {
        const categoryImageFile = req.files as { [key: string]: Express.Multer.File[] } | undefined;
        const catImgFile = categoryImageFile?.categoryImage ? categoryImageFile.categoryImage[0] : undefined;
        if (catImgFile) {
            deleteUploadedFiles({ categoryImage: categoryImageFile?.categoryImage })
        }
        return sendErrorResponse(res, new ApiError(400, "Category with the same name already exists."));
    }
    const categoryImageFile = req.files as { [key: string]: Express.Multer.File[] } | undefined;
    const catImgFile = categoryImageFile?.categoryImage ? categoryImageFile.categoryImage[0] : undefined;
    let catImgUrl;
    if (catImgFile) {
        const catImg = await uploadOnCloudinary(catImgFile.path);
        catImgUrl = catImg?.secure_url;
    }
    const updatedCategory = await CategoryModel.findByIdAndUpdate(
        new mongoose.Types.ObjectId(CategoryId),
        {
            $set: {
                name: trimmedName,
                serviceCost,
                ...(catImgUrl && { categoryImage: catImgUrl }) // Only update image if uploaded
            },
        },
        { new: true }
    );
    if (!updatedCategory) {
        return sendErrorResponse(res, new ApiError(400, "Category not found for updating."));
    };
    return sendSuccessResponse(res, 200, updatedCategory, "Category updated Successfully");
});
// deleteCategory controller
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const { CategoryId } = req.params;
    if (!CategoryId) {
        return sendErrorResponse(res, new ApiError(400, "Category ID is required."));
    };

    const categoryToDelete = await CategoryModel.findById(CategoryId);
    if (!categoryToDelete) {
        return sendErrorResponse(res, new ApiError(400, "Category not found for deleting."));
    };
    const imageUrls = [];
    if (categoryToDelete.categoryImage) imageUrls.push(categoryToDelete.categoryImage);

    const subcategories = await SubCategoryModel.find({ CategoryId })
    subcategories.forEach((subCategory) => {
        if (subCategory.subCategoryImage) imageUrls.push(subCategory.subCategoryImage);
    });

    await QuestionModel.deleteMany({
        $or: [
            { categoryId: CategoryId },
        ]
    });

    await SubCategoryModel.deleteMany({ categoryId: CategoryId });

    await CategoryModel.findByIdAndDelete(CategoryId);

    const deleteImages = imageUrls.map((url) => {
        deleteFromCloudinary(url);
    });

    return sendSuccessResponse(res, 200, {}, "Category and its related subcategories and questions deleted successfully");
});

//fetch category by id
export const getCategorieById = asyncHandler(async (req: Request, res: Response) => {
    const { CategoryId } = req.params;

    if (!CategoryId) {
        return sendErrorResponse(res, new ApiError(400, "Category ID is required."));
    };

    const categoryToFetch = await CategoryModel.findById(CategoryId);
    if (!categoryToFetch) {
        return sendErrorResponse(res, new ApiError(400, "Category not found."));
    };

    return sendSuccessResponse(res, 200, categoryToFetch, "Category retrieved successfully.");
});

//search category controller
export const searchCategories = asyncHandler(async (req: Request, res: Response) => {
    const { serachKey } = req.body;

    if (!serachKey || serachKey.trim().length < 3) {
        return res.status(400).json({
            success: false,
            message: "Search key must be at least 3 characters long."
        });
    }
    const categoryData = await CategoryModel.aggregate([
        {
            $match: {
                isDeleted: false,
                name: { $regex: serachKey, $options: "i" }
            }
        },
        {
            $project: {
                isDeleted: 0,
                owner: 0,
                createdAt: 0,
                updatedAt: 0,
                __v: 0,
            }
        }
    ])
    return sendSuccessResponse(res, 200, categoryData, "Category retrieved successfully.");

})