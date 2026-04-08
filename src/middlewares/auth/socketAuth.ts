import { Socket, ExtendedError } from 'socket.io';
import jwt from 'jsonwebtoken';
import UserModel from '../../models/user.model';
import { log } from 'console';


// Middleware function to verify JWT token for socket connections
export const socketAuthMiddleware = (socket: Socket, next: (err?: ExtendedError) => void) => {
    const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET;
    const token = socket.handshake.headers.accesstoken || socket.handshake.auth.accessToken;
    // console.log(token);


    if (!token) {
        return next(new Error("Authentication error: No token provided"));
    }

    // Verify the token
    jwt.verify(token as string, JWT_SECRET as string, async (err, decoded) => {
        if (err) {
            return next(new Error("Authentication error: Invalid token"));
        }
        const connectedUser = await UserModel.findById((decoded as any)._id).select("-password -refreshToken");
        if (!connectedUser) {
            return next(new Error("Authentication error: User not found"));
        }
        socket.data.userId = connectedUser._id;
        socket.data.userType = connectedUser.userType;

        next();
    });
};
