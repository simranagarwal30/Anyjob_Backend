import { IUser } from "./schemaTypes";
declare global{
    namespace Express {
        interface Request{
            user?:IUser;
        }
    }
}