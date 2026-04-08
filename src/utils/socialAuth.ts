import UserModel from "../models/user.model";
import bcrypt from "bcrypt"

const SecurePassword = async (password: string) => {
    try {
        // Generate a salt with a cost factor of 10 (you can increase this for more security)
        const salt = await bcrypt.genSalt(10);
        // Hash the password using the salt
        const hashedPassword = await bcrypt.hash(password, salt);
        return hashedPassword;
    } catch (error) {
        throw new Error('Error while hashing the password');
    }
};

// GoogleAuth
export const GoogleAuth = async (email: string, uid: string, displayName: string, photoURL: string, phoneNumber: number,userType:string) => {
    try {
        const HashedPassword = await SecurePassword(uid);
        let trimmed = displayName.trim().split(' ')
        console.log(trimmed)


        
        const NewUser = new UserModel({
            lastName: trimmed.pop(),
            firstName:  trimmed.join(' '),
            avatar: photoURL,
            email: email,
            phone: phoneNumber,
            password: HashedPassword,
            userType:userType
        });
        const userData = await NewUser.save();

        return userData;

    } catch (exc: any) {
        console.log(exc.message);
        return { message: "Error login with gmail!", err: exc.message };
    };
};

export const FacebookAuth = async (email: string, uid: string, displayName: string, photoURL: string, phoneNumber: number, userType: string) => {
    try {
        const HashedPassword = await SecurePassword(uid);
        let trimmed = displayName.trim().split(' ');
        console.log(trimmed);

        const NewUser = new UserModel({
            lastName: trimmed.pop(),
            firstName: trimmed.join(' '), 
            email: email,
            phone: phoneNumber,
            password: HashedPassword,
            userType: userType
        });

        const userData = await NewUser.save();

        return userData;

    } catch (exc: any) {
        console.log(exc.message);
        return { message: "Error logging in with Facebook!", err: exc.message };
    }
};



