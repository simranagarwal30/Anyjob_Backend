import { Schema, Model, model } from 'mongoose';
// import { IDerivedQuestion, IQuestion } from '../../types/requests_responseType';
import { IDerivedQuestion,IQuestion } from '../../types/schemaTypes';

// Schema for Derived Questions (Recursive Structure)
const derivedQuestionSchema = new Schema<IDerivedQuestion>({
  option: { type: String, required: true },
  question: { type: String, required: true },
  options: {
    type: Map,
    of: String,
    required: true,
  },
  derivedQuestions: [this] // Recursively storing derived questions
});
// Main Question Schema
const questionSchema = new Schema<IQuestion>({
  categoryId: { type: Schema.Types.ObjectId, required: true, ref: 'Category' },
  question: { type: String, required: true },
  options: {
    type: Map,
    of: String,
    required: true,
  },
  derivedQuestions: [derivedQuestionSchema],
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

const QuestionModel: Model<IQuestion> = model<IQuestion>('question', questionSchema);
export default QuestionModel;


