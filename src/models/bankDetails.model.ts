import mongoose, { Document, Schema, Model } from 'mongoose';
import { IBankDetailsSchema } from '../../types/schemaTypes';


// Define the schema for the BankDetails model
const BankDetailsSchema: Schema = new Schema<IBankDetailsSchema>({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    bankName: { type: String, },
    accountHolderName: { type: String, },
    branchCode: { type: String, },
    accountNumber: { type: String, },
    cardNumber: { type: String, },
    cardType: { type: String, }, 
    cardHolderName: { type: String, },
}, {
    timestamps: true 
});

const BankDetails: Model<IBankDetailsSchema> = mongoose.model<IBankDetailsSchema>('BankDetails', BankDetailsSchema);

export default BankDetails;