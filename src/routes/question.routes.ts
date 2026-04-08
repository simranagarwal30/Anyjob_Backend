import express, { Router } from "express";
import { VerifyJWTToken, verifyUserType } from "../middlewares/auth/userAuth";
import {
  addQuestions,
  // fetchQuestionsCategorywise,
  fetchSingleQuestion,
  updateSingleQuestion,
  fetchQuestions,
  deleteSingleQuestion,
  deleteSpecificDerivedQuestionSet,
} from "../controller/question.controller";

const router: Router = express.Router();
router.use(VerifyJWTToken);

router
  .route("/")
  .post(verifyUserType(["SuperAdmin"]), addQuestions)
  .get(fetchQuestions);

// router.route('/:categoryId').get(fetchQuestionsCategorywise);

router
  .route("/q/:categoryId/:questionId")
  .get(fetchSingleQuestion)
  .patch(verifyUserType(["SuperAdmin"]), updateSingleQuestion);

router
  .route("/q/:questionId")
  .delete(verifyUserType(["SuperAdmin"]), deleteSingleQuestion);

router
  .route("/delete-derived-question")
  .delete(verifyUserType(["SuperAdmin"]), deleteSpecificDerivedQuestionSet);

export default router;

