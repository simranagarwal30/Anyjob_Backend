import Joi from 'joi';

import { ISubCategorySchema } from '../../../types/schemaTypes';

const validateSubCategory = (subcategoryModel: ISubCategorySchema) => {
    const SubCategorySchema = Joi.object({
        name: Joi.string().min(1).max(1000).required().trim().messages({
            "string.empty": "Category name is required",
            "string.min": "Category name should be at least 1 character long",
            "string.max": "Category name should be at most 1000 characters long"
        }),       
    });

    return SubCategorySchema.validate(subcategoryModel, { abortEarly: false });
};

export default validateSubCategory;