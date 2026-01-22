import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.route.js";
import flashcardRoutes from "./routes/flashcard.route.js";
import categoryRoutes from "./routes/category.route.js";
import ttsRoutes from "./routes/tts.route.js";
import userSettingsRoutes from "./routes/userSettings.route.js";
import openaiRoutes from "./routes/openai.route.js";

import database from "./lib/db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.use(cookieParser());

const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
        ];

        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.log("CORS: Blocked request from origin", {
            origin,
            ip: req?.ip,
        });
        const msg = `CORS policy: Origin ${origin} is not allowed`;
        return callback(new Error(msg), false);
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-internal-token",
        "Cache-Control",
        "Pragma",
        "X-Requested-With",
        "Accept",
        "Origin",
    ],
};

app.use(cors(corsOptions));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/flashcards", flashcardRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/tts", ttsRoutes);
app.use("/api/settings", userSettingsRoutes);
app.use("/api/openai", openaiRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
    console.error("Error:", err.message);
    res.status(err.status || 500).json({
        message: err.message || "Internal Server Error",
    });
});

// Start server
const server = app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);

    try {
        await database.connectDB();
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    }
});
