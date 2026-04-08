import mongoose, { Model, Schema } from "mongoose";
import { IPermissionSchema } from "../../types/schemaTypes";

const PermissionSchema: Schema<IPermissionSchema> = new Schema({   
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: [true, "User ID is missing!"]
    },
    acceptRequest: {
        type: Boolean,
        default: false
    },
    assignJob: {
        type: Boolean,
        default: false
    },
    fieldAgentManagement: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
}, { timestamps: true });

const PermissionModel: Model<IPermissionSchema> = mongoose.model<IPermissionSchema>('permission', PermissionSchema);
export default PermissionModel;