import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        stripeConnectedAccountId: {
            type: String,
            required: true,
            unique: true,
        },
        balance: {
            type: Number,
            default: 0, // Amount in dollars
        },
        currency: {
            type: String,
            default: 'usd',
        },
        transactions: [
            {
                type: {
                    type: String, // 'credit' | 'debit'
                    enum: ['credit', 'debit'],
                },
                amount: Number,
                description: { type: String, enum: ['AddMoney', 'LeadGenerationFee', 'WithdrawFund', 'ServiceCancellationAmount','ServiceIncentiveAmount'] },
                serviceId: mongoose.Schema.Types.ObjectId,
                date: {
                    type: Date,
                    default: Date.now,
                },
                stripeTransactionId: String,
                stripeTransferId: String,
            },
        ],
    },
    { timestamps: true }
);

const WalletModel = mongoose.model('Wallet', walletSchema);
export default WalletModel;
