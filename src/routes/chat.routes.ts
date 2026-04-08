import express, { Router } from 'express';
import { fetchChatHistory, fetchChatList, getUnreadMessageCount } from "../controller/chat.controller";
import { VerifyJWTToken } from '../middlewares/auth/userAuth';

const router: Router = express.Router();


router.route('/fetch-chat-history')
    .get(fetchChatHistory);

router.route('/fetch-chat-list')
    .get(fetchChatList);

//Authorized chat routes...............
router.use(VerifyJWTToken);

router.route('/get-unread-count').get(getUnreadMessageCount);


export default router;