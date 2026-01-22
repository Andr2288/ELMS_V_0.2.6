import express from "express";

import ttsController from "../controllers/tts.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = express.Router();

// Generate speech with user settings and automatic key selection
router.post(
    "/speech",
    authMiddleware.protectRoute,
    ttsController.generateSpeech
);

export default router;
