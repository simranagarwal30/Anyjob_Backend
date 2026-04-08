import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import fs from "fs";

// Configuration
cloudinary.config({
    cloud_name: "dhj5yyosd",
    api_key: "165417273536245",
    api_secret: "bhadtrccRbIK7TG6EjqNyr2Zc6Q"
});

// Function to upload file in Cloudinary
export const uploadOnCloudinary = async (localFilePath: string): Promise<UploadApiResponse | null> => {
    try {
        if (!localFilePath) return null;

        // Upload the file to Cloudinary with secure URLs
        const response: UploadApiResponse = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "image",
            secure: true, // Ensure the URL is HTTPS
        });

        // Remove the locally saved temporary file
        fs.unlinkSync(localFilePath);
        return response;
    } catch (error: any) {
        console.log({ error: error.message });
        // Remove the locally saved temporary file as the upload operation failed
        fs.unlinkSync(localFilePath);
        return null;
    }
};

// Function to delete a file from Cloudinary
export const deleteFromCloudinary = async (publicUrl: string, resourceType: "image" | "video" = "image"): Promise<void> => {
    const publicId = publicUrl.split('/').slice(-1)[0].split('.')[0];
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        // console.log("files deleted");

    } catch (error) {
        console.error(`Failed to delete ${resourceType} with public_id: ${publicId} from Cloudinary`, error);
        throw new Error(`Failed to delete ${resourceType} from Cloudinary`);
    }
};

