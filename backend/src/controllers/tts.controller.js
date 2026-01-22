import OpenAI from "openai";
import UserSettings from "../models/userSettings.model.js";

const activeRequests = new Map();

process.on("SIGTERM", () => {
    console.log("TTS Controller: Cleaning up before shutdown");
    activeRequests.clear();
});

process.on("SIGINT", () => {
    console.log("TTS Controller: Cleaning up before shutdown");
    activeRequests.clear();
});

const generateSpeech = async (req, res) => {
    let requestId = null;

    try {
        const { text, sessionId, cardId, exercise } = req.body;
        const userId = req.user._id;

        if (!text) {
            return res.status(400).json({ message: "Text is required" });
        }

        // ДОДАНО: Встановлюємо CORS заголовки явно (якщо потрібно)
        res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
        res.header("Access-Control-Allow-Credentials", "true");
        res.header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, Cache-Control, Pragma, X-Requested-With"
        );

        // ДОДАНО: Унікальний ID для запиту
        requestId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(
            `[${requestId}] TTS Request - User: ${userId}, Session: ${sessionId}, Card: ${cardId}, Exercise: ${exercise}`
        );

        // ДОДАНО: Реєструємо активний запит
        activeRequests.set(requestId, {
            userId,
            sessionId,
            startTime: Date.now(),
            aborted: false,
        });

        // Get user settings first
        let userSettings = await UserSettings.findOne({ userId });

        // Create default settings if none exist
        if (!userSettings) {
            userSettings = new UserSettings({
                userId,
                apiKeySource: "system",
                ttsSettings: {
                    voice: "alloy",
                    speed: 1.0,
                    voiceStyle: "neutral",
                },
            });
            await userSettings.save();
        }

        const effectiveApiKey = userSettings.getEffectiveApiKey();
        const apiKeyInfo = userSettings.getApiKeyInfo();

        if (!effectiveApiKey) {
            return res.status(500).json({
                message: "No OpenAI API key available",
                details: "Please configure an API key in Settings",
                apiKeyInfo,
            });
        }

        // Validate API key format
        if (!effectiveApiKey.startsWith("sk-")) {
            return res.status(500).json({
                message: "Invalid OpenAI API key format",
                apiKeyInfo,
            });
        }

        // ДОДАНО: Перевіряємо чи запит не було скасовано
        const requestInfo = activeRequests.get(requestId);
        if (!requestInfo || requestInfo.aborted) {
            console.log(
                `[${requestId}] Request was aborted before OpenAI call`
            );
            return res.status(409).json({ message: "Request was cancelled" });
        }

        // ДОДАНО: AbortController для cancellation
        const abortController = new AbortController();

        // ДОДАНО: Timeout для OpenAI запиту
        const timeoutId = setTimeout(() => {
            console.log(`[${requestId}] Request timeout, aborting`);
            abortController.abort();
        }, 30000);

        // Initialize OpenAI with effective API key and timeout
        const openai = new OpenAI({
            apiKey: effectiveApiKey,
            timeout: 30000,
        });

        // Prepare TTS parameters
        const ttsParams = {
            model: "gpt-4o-mini-tts",
            voice: userSettings.ttsSettings.voice,
            input: text.substring(0, 4096),
            response_format: "mp3",
            speed: Math.max(
                0.25,
                Math.min(4.0, userSettings.ttsSettings.speed)
            ),
        };

        try {
            // ОНОВЛЕНО: Generate speech з abort signal
            const mp3Response = await openai.audio.speech.create(ttsParams, {
                signal: abortController.signal,
            });

            clearTimeout(timeoutId);

            // ДОДАНО: Перевіряємо чи запит ще активний
            const currentRequestInfo = activeRequests.get(requestId);
            if (!currentRequestInfo || currentRequestInfo.aborted) {
                console.log(
                    `[${requestId}] Request was aborted during OpenAI processing`
                );
                return res
                    .status(409)
                    .json({ message: "Request was cancelled" });
            }

            const buffer = Buffer.from(await mp3Response.arrayBuffer());

            console.log(
                `[${requestId}] TTS generated successfully. Buffer size: ${buffer.length}`
            );

            // ДОДАНО: Очищаємо запит з активних
            activeRequests.delete(requestId);

            res.set({
                "Content-Type": "audio/mpeg",
                "Content-Length": buffer.length,
                "Cache-Control": "public, max-age=86400",
                "X-Audio-Source": "generated",
                "X-API-Key-Source": apiKeyInfo.effectiveSource,
                "X-TTS-Model": userSettings.ttsSettings.model,
                "X-TTS-Voice": userSettings.ttsSettings.voice,
                "X-Session-Id": sessionId || "no-session",
                "X-Exercise": exercise || "general",
                "X-Request-Id": requestId,
            });

            return res.send(buffer);
        } catch (openaiError) {
            clearTimeout(timeoutId);

            // ДОДАНО: Обробка cancellation
            if (openaiError.name === "AbortError") {
                console.log(`[${requestId}] OpenAI request was aborted`);
                return res
                    .status(409)
                    .json({ message: "Request was cancelled" });
            }

            throw openaiError;
        }
    } catch (error) {
        console.log(
            `[${requestId}] Error in generateSpeech controller:`,
            error.message
        );

        // ДОДАНО: Очищаємо активний запит при помилці
        if (requestId) {
            activeRequests.delete(requestId);
        }

        // Enhanced error handling
        let errorResponse = {
            message: "Error generating speech",
            details: "Internal server error occurred while generating speech",
        };

        return res.status(error.status || 500).json(errorResponse);
    }
};

const cancelUserRequests = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        let cancelledCount = 0;

        for (const [requestId, requestInfo] of activeRequests.entries()) {
            if (requestInfo.userId.toString() === userId) {
                requestInfo.aborted = true;
                activeRequests.delete(requestId);
                cancelledCount++;
            }
        }

        return res.status(200).json({
            success: true,
            message: `Cancelled ${cancelledCount} active requests`,
            cancelled_requests: cancelledCount,
        });
    } catch (error) {
        console.log("Error cancelling user requests:", error.message);
        return res.status(500).json({ message: "Error cancelling requests" });
    }
};

export default {
    generateSpeech,
    cancelUserRequests,
};
