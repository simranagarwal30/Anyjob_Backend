import express, { Router } from 'express';
import { healthcheck } from "../controller/healthcheck.controller"

const router: Router = express.Router();

router.route('/').get(healthcheck);

export default router