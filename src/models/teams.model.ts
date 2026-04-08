import mongoose, { Model, Schema } from "mongoose";
import { ITeamSchema } from "../../types/schemaTypes";

const TeamSchema: Schema<ITeamSchema> = new Schema({
    serviceProviderId: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: [true, "Service provider ID is missing!"]
    },
    fieldAgentIds: {
        type: [Schema.Types.ObjectId],
        ref: 'user',
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
}, { timestamps: true });

const TeamModel: Model<ITeamSchema> = mongoose.model<ITeamSchema>('team', TeamSchema);
export default TeamModel;