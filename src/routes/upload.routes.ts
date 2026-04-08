import multer from 'multer';
import express, { Request, Response } from 'express';
import fs from "fs";
import { upload } from '../middlewares/multer.middleware';
import { uploadOnCloudinary } from '../utils/cloudinary';
const router = express.Router();


// Upload Image Endpoint
router.post('/upload-image', upload.single('image'), (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded or invalid file type.' });
        }

        const { path, filename } = req.file;

        // You can handle the file further here (e.g., move it to permanent storage, process it, etc.)
        return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully.',
            data: {
                filename,
                path,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'An error occurred during image upload.',
        });
    }
});

router.post('/upload-to-cloudinary', upload.single('image'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded or invalid file type.' });
        }

        const localFilePath = req.file.path;

        // Upload the file to Cloudinary
        const uploadResponse = await uploadOnCloudinary(localFilePath);

        if (!uploadResponse) {
            return res.status(500).json({ success: false, message: 'Failed to upload image to Cloudinary.' });
        }

        return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully.',
            data: {
                url: uploadResponse.secure_url,
                public_id: uploadResponse.public_id,
            },
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'An error occurred during the upload.',
            error: error.message,
        });
    }
});

export default router;