import express from "express";

import userSettingsController from "../controllers/userSettings.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = express.Router();

// Get user settings
router.get(
    "/",
    authMiddleware.protectRoute,
    userSettingsController.getUserSettings
);

// Update user settings
router.put(
    "/",
    authMiddleware.protectRoute,
    userSettingsController.updateUserSettings
);

// Reset settings to default
router.post(
    "/reset",
    authMiddleware.protectRoute,
    userSettingsController.resetUserSettings
);

// Get available options for dropdowns
router.get(
    "/options",
    authMiddleware.protectRoute,
    userSettingsController.getAvailableOptions
);

// Test API key
router.post(
    "/test-api-key",
    authMiddleware.protectRoute,
    userSettingsController.testApiKey
);

// Clear user API key
router.delete(
    "/api-key",
    authMiddleware.protectRoute,
    userSettingsController.clearUserApiKey
);

export default router;
