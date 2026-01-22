import OpenAI from "openai";
import UserSettings from "../models/userSettings.model.js";
import Flashcard from "../models/flashcard.model.js";
import Category from "../models/category.model.js";
import {
    generatePrompt,
    generateRegenerateExamplesPrompt,
    getRandomSentenceType,
} from "../services/prompts.js";

const OPENAI_TIMEOUT = 15000;
const MAX_RETRIES = 2;

const generateFlashcardContent = async (req, res) => {
    try {
        const { text, englishLevel, promptType, categoryId } = req.body;
        const userId = req.user._id;

        if (!text) {
            return res.status(400).json({ message: "Text is required" });
        }

        if (!englishLevel) {
            return res
                .status(400)
                .json({ message: "English level is required" });
        }

        const systemApiKey = process.env.OPENAI_API_KEY;
        if (!systemApiKey) {
            return res.status(500).json({
                message: "OpenAI API key not configured",
                details: "System OpenAI API key is not available",
            });
        }

        let categoryContext = "";
        if (
            categoryId &&
            categoryId !== "uncategorized" &&
            categoryId !== "null"
        ) {
            try {
                const category = await Category.findOne({
                    _id: categoryId,
                    userId,
                });
                if (category) {
                    categoryContext = `\n\nIMPORTANT CONTEXT: This word/phrase belongs to the topic/category "${category.name}"`;
                    if (category.description && category.description.trim()) {
                        categoryContext += ` (${category.description.trim()})`;
                    }
                }
            } catch (categoryError) {
                console.warn(
                    "Could not fetch category for context:",
                    categoryError.message
                );
            }
        }

        let userSettings = await UserSettings.findOne({ userId });

        if (!userSettings) {
            userSettings = new UserSettings({
                userId,
                ttsSettings: {
                    model: "tts-1",
                    voice: "alloy",
                    speed: 1.0,
                    responseFormat: "mp3",
                    voiceStyle: "neutral",
                    customInstructions: "",
                },
                generalSettings: {
                    cacheAudio: true,
                    defaultEnglishLevel: "B1",
                },
                aiSettings: {
                    chatgptModel: "gpt-4.1-mini",
                },
            });
            await userSettings.save();
        }

        const openai = new OpenAI({
            apiKey: systemApiKey,
            timeout: OPENAI_TIMEOUT,
        });

        const modelToUse =
            userSettings.aiSettings?.chatgptModel || "gpt-4.1-mini";

        const prompt = generatePrompt(
            promptType,
            text,
            englishLevel,
            categoryContext
        );

        const executeOpenAIRequest = async (retryCount = 0) => {
            try {
                const abortController = new AbortController();
                const timeoutId = setTimeout(
                    () => abortController.abort(),
                    OPENAI_TIMEOUT
                );

                const chatCompletion = await openai.chat.completions.create(
                    {
                        model: modelToUse,
                        messages: [
                            {
                                role: "system",
                                content:
                                    "You are a helpful assistant for language learning, specializing in English and Ukrainian. Always follow the exact structure requirements provided in the prompts. For reading comprehension, use ALL provided words exactly as given and follow the specified text type format. For listening exercises, create sentences that match the specified sentence type style.",
                            },
                            { role: "user", content: prompt },
                        ],
                        temperature: 0.7,
                        max_tokens: 10000,
                    },
                    {
                        signal: abortController.signal,
                    }
                );

                clearTimeout(timeoutId);
                return chatCompletion;
            } catch (error) {
                if (
                    retryCount < MAX_RETRIES &&
                    (error.message?.includes("timeout") ||
                        error.message?.includes("network") ||
                        error.status === 429 ||
                        error.status === 500 ||
                        error.status === 502 ||
                        error.status === 503)
                ) {
                    console.log(
                        `Retrying OpenAI request (attempt ${retryCount + 1}/${MAX_RETRIES}) after error:`,
                        error.message
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, Math.pow(2, retryCount) * 1000)
                    );
                    return executeOpenAIRequest(retryCount + 1);
                }
                throw error;
            }
        };

        const chatCompletion = await executeOpenAIRequest();
        const aiResponse = chatCompletion.choices[0].message.content;

        let parsedResponse = aiResponse;
        if (promptType === "completeFlashcard" || promptType === undefined) {
            try {
                const jsonMatch =
                    aiResponse.match(/```json\n([\s\S]*?)\n```/) ||
                    aiResponse.match(/```\n([\s\S]*?)\n```/) ||
                    aiResponse.match(/{[\s\S]*?}/);

                const jsonStr = jsonMatch ? jsonMatch[0] : aiResponse;
                parsedResponse = JSON.parse(
                    jsonStr.replace(/```json|```/g, "")
                );

                parsedResponse.text = text;

                if (typeof parsedResponse.examples === "string") {
                    parsedResponse.examples = [parsedResponse.examples];
                }
                if (!Array.isArray(parsedResponse.examples)) {
                    parsedResponse.examples = [];
                }
            } catch (error) {
                console.log("Error parsing AI response as JSON:", error);
                return res.status(200).json({
                    raw: aiResponse,
                    parsed: false,
                    message: "Couldn't parse AI response as JSON",
                });
            }
        } else if (promptType === "examples") {
            try {
                const jsonMatch =
                    aiResponse.match(/\[[\s\S]*?\]/) ||
                    aiResponse.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    const jsonStr = jsonMatch[0].replace(/```json|```/g, "");
                    parsedResponse = JSON.parse(jsonStr);
                } else {
                    parsedResponse = aiResponse
                        .split("\n")
                        .filter((line) => line.trim())
                        .map((line) =>
                            line
                                .replace(/^\d+\.\s*/, "")
                                .replace(/^["\-]\s*/, "")
                                .replace(/["]*$/, "")
                                .trim()
                        )
                        .filter((line) => line.length > 0)
                        .slice(0, 3);
                }
            } catch (error) {
                console.log("Error parsing examples response:", error);
                parsedResponse = aiResponse
                    .split("\n")
                    .filter((line) => line.trim())
                    .map((line) =>
                        line
                            .replace(/^\d+\.\s*/, "")
                            .replace(/^["\-]\s*/, "")
                            .replace(/["]*$/, "")
                            .trim()
                    )
                    .filter((line) => line.length > 0)
                    .slice(0, 3);
            }
        } else if (promptType === "readingComprehension") {
            try {
                const jsonMatch =
                    aiResponse.match(/{[\s\S]*?}/) ||
                    aiResponse.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    const jsonStr = jsonMatch[0].replace(/```json|```/g, "");
                    parsedResponse = JSON.parse(jsonStr);

                    const requiredFields = [
                        "textType",
                        "text",
                        "usedWords",
                        "facts",
                        "correctOption",
                    ];
                    const hasRequired = requiredFields.every((field) =>
                        parsedResponse.hasOwnProperty(field)
                    );

                    if (!hasRequired) {
                        throw new Error(
                            "Missing required fields in reading comprehension response"
                        );
                    }

                    if (
                        !Array.isArray(parsedResponse.facts) ||
                        parsedResponse.facts.length !== 3
                    ) {
                        throw new Error(
                            "Reading comprehension must have exactly 3 facts"
                        );
                    }

                    if (
                        !Array.isArray(parsedResponse.usedWords) ||
                        parsedResponse.usedWords.length !== 3
                    ) {
                        throw new Error(
                            `Reading comprehension must use exactly 3 words, got ${parsedResponse.usedWords.length}`
                        );
                    }

                    if (
                        typeof parsedResponse.correctOption !== "number" ||
                        parsedResponse.correctOption < 0 ||
                        parsedResponse.correctOption > 2
                    ) {
                        parsedResponse.correctOption = 0;
                    }

                    if (!parsedResponse.explanation) {
                        parsedResponse.explanation =
                            "The correct fact is supported by information in the text.";
                    }

                    if (parsedResponse.text) {
                        parsedResponse.text = parsedResponse.text.replace(
                            /\\n\\n/g,
                            "\n\n"
                        );
                    }

                    const correctFact =
                        parsedResponse.facts[parsedResponse.correctOption];
                    const shuffledFacts = [...parsedResponse.facts].sort(
                        () => Math.random() - 0.5
                    );
                    const newCorrectIndex = shuffledFacts.indexOf(correctFact);

                    parsedResponse.facts = shuffledFacts;
                    parsedResponse.correctOption = newCorrectIndex;
                } else {
                    throw new Error(
                        "No JSON found in reading comprehension response"
                    );
                }
            } catch (error) {
                console.log(
                    "❌ Reading comprehension parsing failed:",
                    error.message
                );
                console.log("Raw AI response:", aiResponse);

                return res.status(422).json({
                    message:
                        "Failed to generate valid reading comprehension structure",
                    details: error.message,
                    error_type: "reading_comprehension_generation_failed",
                    raw_response:
                        aiResponse.substring(0, 500) +
                        (aiResponse.length > 500 ? "..." : ""),
                });
            }
        } else if (promptType === "sentenceWithGap") {
            try {
                const jsonMatch =
                    aiResponse.match(/{[\s\S]*?}/) ||
                    aiResponse.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    const jsonStr = jsonMatch[0].replace(/```json|```/g, "");
                    parsedResponse = JSON.parse(jsonStr);

                    if (
                        !parsedResponse.displaySentence ||
                        !parsedResponse.audioSentence ||
                        !parsedResponse.correctForm
                    ) {
                        throw new Error(
                            "Missing required fields in JSON response"
                        );
                    }

                    if (!parsedResponse.displaySentence.includes("____")) {
                        throw new Error(
                            "Display sentence doesn't contain gap placeholder"
                        );
                    }

                    if (parsedResponse.hint === undefined) {
                        parsedResponse.hint = "";
                    }

                    if (!parsedResponse.sentenceType) {
                        parsedResponse.sentenceType = getRandomSentenceType();
                        console.log(
                            "⚠️ Missing sentenceType, added default:",
                            parsedResponse.sentenceType
                        );
                    }
                } else {
                    throw new Error("No JSON found in response");
                }
            } catch (error) {
                console.log(
                    "Error parsing sentenceWithGap response as JSON:",
                    error
                );

                const cleanResponse = aiResponse
                    .trim()
                    .replace(/^["']|["']$/g, "");
                let displaySentence, audioSentence;

                if (cleanResponse.includes("____")) {
                    displaySentence = cleanResponse;
                    audioSentence = cleanResponse.replace(/____/g, text);
                } else {
                    displaySentence = `I need to ____ this word.`;
                    audioSentence = `I need to ${text} this word.`;
                }

                parsedResponse = {
                    sentenceType: getRandomSentenceType(),
                    displaySentence: displaySentence,
                    audioSentence: audioSentence,
                    correctForm: text,
                    hint: "",
                };
                console.log(
                    "Using fallback sentenceWithGap format:",
                    parsedResponse
                );
            }
        } else if (promptType === "matchingDescription") {
            parsedResponse = aiResponse.trim().replace(/^["']|["']$/g, "");
        } else if (promptType === "translateSentenceToUkrainian") {
            parsedResponse = aiResponse.trim().replace(/^["']|["']$/g, "");
        }

        return res.status(200).json({
            result: parsedResponse,
            raw: aiResponse,
            parsed:
                promptType === "completeFlashcard" ||
                promptType === undefined ||
                promptType === "examples" ||
                promptType === "sentenceWithGap" ||
                promptType === "matchingDescription" ||
                promptType === "translateSentenceToUkrainian" ||
                promptType === "readingComprehension",
            modelUsed: modelToUse,
            categoryContext: categoryContext
                ? "Used category context"
                : "No category context",
        });
    } catch (error) {
        console.log("Error in generateFlashcardContent controller:", error);

        let errorResponse = {
            message: "Error generating content",
            details: "Error occurred while generating content with AI",
        };

        return res.status(error.status || 500).json(errorResponse);
    }
};

const regenerateExamples = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const systemApiKey = process.env.OPENAI_API_KEY;
        if (!systemApiKey) {
            return res.status(500).json({
                message: "OpenAI API key not configured",
                details: "System OpenAI API key is not available",
            });
        }

        const flashcard = await Flashcard.findOne({ _id: id, userId });
        if (!flashcard) {
            return res.status(404).json({ message: "Flashcard not found" });
        }

        let categoryContext = "";
        if (flashcard.categoryId) {
            try {
                const category = await Category.findOne({
                    _id: flashcard.categoryId,
                    userId,
                });
                if (category) {
                    categoryContext = `\n\nIMPORTANT CONTEXT: This word/phrase belongs to the topic/category "${category.name}"`;
                    if (category.description && category.description.trim()) {
                        categoryContext += ` (${category.description.trim()})`;
                    }
                    categoryContext += `. Please consider this context when generating examples. The examples should be relevant to this specific topic/category.`;
                }
            } catch (categoryError) {
                console.warn(
                    "Could not fetch category for examples context:",
                    categoryError.message
                );
            }
        }

        let userSettings = await UserSettings.findOne({ userId });
        if (!userSettings) {
            return res.status(400).json({ message: "User settings not found" });
        }

        const englishLevel =
            userSettings.generalSettings?.defaultEnglishLevel || "B1";
        const modelToUse =
            userSettings.aiSettings?.chatgptModel || "gpt-4.1-mini";

        const openai = new OpenAI({
            apiKey: systemApiKey,
            timeout: OPENAI_TIMEOUT,
        });

        const prompt = generateRegenerateExamplesPrompt(
            flashcard.text,
            englishLevel,
            categoryContext
        );

        const executeRegenerateRequest = async (retryCount = 0) => {
            try {
                const abortController = new AbortController();
                const timeoutId = setTimeout(
                    () => abortController.abort(),
                    OPENAI_TIMEOUT
                );

                const chatCompletion = await openai.chat.completions.create(
                    {
                        model: modelToUse,
                        messages: [
                            {
                                role: "system",
                                content:
                                    "You are a helpful assistant for language learning. Create diverse and creative example sentences.",
                            },
                            { role: "user", content: prompt },
                        ],
                        temperature: 0.8,
                        max_tokens: 10000,
                    },
                    {
                        signal: abortController.signal,
                    }
                );

                clearTimeout(timeoutId);
                return chatCompletion;
            } catch (error) {
                if (
                    retryCount < MAX_RETRIES &&
                    (error.message?.includes("timeout") ||
                        error.message?.includes("network") ||
                        error.status === 429 ||
                        error.status === 500 ||
                        error.status === 502 ||
                        error.status === 503)
                ) {
                    console.log(
                        `Retrying regenerate request (attempt ${retryCount + 1}/${MAX_RETRIES}) after error:`,
                        error.message
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, Math.pow(2, retryCount) * 1000)
                    );
                    return executeRegenerateRequest(retryCount + 1);
                }
                throw error;
            }
        };

        const chatCompletion = await executeRegenerateRequest();
        const aiResponse = chatCompletion.choices[0].message.content;
        let newExamples = [];

        try {
            const jsonMatch =
                aiResponse.match(/\[[\s\S]*?\]/) ||
                aiResponse.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                const jsonStr = jsonMatch[0].replace(/```json|```/g, "");
                newExamples = JSON.parse(jsonStr);
            } else {
                newExamples = aiResponse
                    .split("\n")
                    .filter((line) => line.trim())
                    .map((line) =>
                        line
                            .replace(/^\d+\.\s*/, "")
                            .replace(/^["\-]\s*/, "")
                            .replace(/["]*$/, "")
                            .trim()
                    )
                    .filter((line) => line.length > 0)
                    .slice(0, 3);
            }
        } catch (error) {
            console.log("Error parsing examples response:", error);
            newExamples = aiResponse
                .split("\n")
                .filter((line) => line.trim())
                .map((line) =>
                    line
                        .replace(/^\d+\.\s*/, "")
                        .replace(/^["\-]\s*/, "")
                        .replace(/["]*$/, "")
                        .trim()
                )
                .filter((line) => line.length > 0)
                .slice(0, 3);
        }

        flashcard.examples = newExamples;
        await flashcard.save();

        await flashcard.populate("categoryId", "name color");

        return res.status(200).json({
            success: true,
            flashcard: flashcard,
            newExamples: newExamples,
            message: "Examples regenerated successfully",
            modelUsed: modelToUse,
            categoryContext: categoryContext
                ? "Used category context"
                : "No category context",
        });
    } catch (error) {
        console.log("Error in regenerateExamples controller:", error);

        let errorResponse = {
            message: "Error regenerating examples",
            details: "Error occurred while generating new examples",
        };

        return res.status(error.status || 500).json(errorResponse);
    }
};

export default {
    generateFlashcardContent,
    regenerateExamples,
};
