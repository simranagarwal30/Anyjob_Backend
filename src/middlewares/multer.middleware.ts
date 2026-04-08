import multer from 'multer';
import express, { Request, Response } from 'express';
import fs from "fs";


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/temp');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix)
    }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = /pdf|jpeg|jpg|png/;

    const isValidFileType = allowedTypes.test(file.mimetype);
    if (isValidFileType) {
        cb(null, true);
    } else {
        cb(null, false);
    }
};

/**
 * Deletes an array of files from the file system.
 * @param filesMap - An object where keys are file fields and values are arrays of file paths.
 */

export const deleteUploadedFiles = (filesMap: { [key: string]: Express.Multer.File[] | undefined }) => {
    Object.values(filesMap).forEach((fileArray) => {
        fileArray?.forEach((file) => {
            if (file?.path) {
                fs.unlink(file.path, (err) => {
                    if (err) {
                        console.error(`Error deleting file: ${file.path}`, err);
                    } else {
                        console.log(`Successfully deleted file: ${file.path}`);
                    }
                });
            }
        });
    });
};

export const upload = multer({ storage: storage, fileFilter: fileFilter });

