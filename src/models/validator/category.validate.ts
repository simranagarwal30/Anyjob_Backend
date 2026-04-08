import Joi from 'joi';
import { ICategorySchema } from '../../../types/schemaTypes';

const validateCategory = (categoryModel: ICategorySchema) => {
    const CategorySchema = Joi.object({
        name: Joi.string().min(1).max(1000).required().trim().messages({
            "string.empty": "Category name is required",
            "string.min": "Category name should be at least 1 character long",
            "string.max": "Category name should be at most 1000 characters long"
        }),
    });

    return CategorySchema.validate(categoryModel, { abortEarly: false });
};

export default validateCategory;