import mongoose from "mongoose";

// Функція для перемішування масиву (Fisher-Yates shuffle)
const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

const flashcardSchema = new mongoose.Schema(
    {
        text: {
            type: String,
            required: true,
            trim: true,
        },
        transcription: {
            type: String,
            default: "",
            trim: true,
        },
        translation: {
            type: String,
            default: "",
            trim: true,
        },
        shortDescription: {
            type: String,
            default: "",
            trim: true,
            maxlength: 200,
        },
        explanation: {
            type: String,
            default: "",
            trim: true,
        },
        examples: [
            {
                type: String,
                trim: true,
            },
        ],
        notes: {
            type: String,
            default: "",
            trim: true,
        },
        isAIGenerated: {
            type: Boolean,
            default: false,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
        },

        status: {
            type: String,
            enum: ["learning", "review"],
            default: "learning",
        },

        isSentenceCompletionExercise: {
            type: Boolean,
            default: false,
        },
        isMultipleChoiceExercise: {
            type: Boolean,
            default: false,
        },
        isListenAndFillExercise: {
            type: Boolean,
            default: false,
        },
        isListenAndChooseExercise: {
            type: Boolean,
            default: false,
        },

        isReadingComprehensionExercise: {
            type: Boolean,
            default: false,
        },

        lastReviewedAt: {
            type: Date,
            default: Date.now,
        },
        addedToLearningAt: {
            type: Date,
            default: Date.now,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Middleware для міграції старих даних при зчитуванні
flashcardSchema.post("find", function (docs) {
    if (docs && Array.isArray(docs)) {
        docs.forEach((doc) => {
            if (doc.example && (!doc.examples || doc.examples.length === 0)) {
                doc.examples = [doc.example];
            }
        });
    }
});

flashcardSchema.post("findOne", function (doc) {
    if (doc) {
        if (doc.example && (!doc.examples || doc.examples.length === 0)) {
            doc.examples = [doc.example];
        }
    }
});

flashcardSchema.methods.isReadyForReview = function () {
    return (
        this.isSentenceCompletionExercise &&
        this.isMultipleChoiceExercise &&
        this.isListenAndFillExercise &&
        this.isListenAndChooseExercise
    );
};

// Оновлення статусу на review якщо всі вправи пройдені
flashcardSchema.methods.updateToReviewIfReady = function () {
    if (this.isReadyForReview() && this.status !== "review") {
        this.status = "review";
        this.reviewedAt = new Date();
        return true;
    }
    return false;
};

// Обробка правильної відповіді у вправі (включає нову вправу)
flashcardSchema.methods.handleCorrectAnswer = function (exerciseType) {
    let wasUpdated = false;

    switch (exerciseType) {
        case "sentence-completion":
            if (!this.isSentenceCompletionExercise) {
                this.isSentenceCompletionExercise = true;
                wasUpdated = true;
            }
            break;
        case "multiple-choice":
            if (!this.isMultipleChoiceExercise) {
                this.isMultipleChoiceExercise = true;
                wasUpdated = true;
            }
            break;
        case "listen-and-fill":
            if (!this.isListenAndFillExercise) {
                this.isListenAndFillExercise = true;
                wasUpdated = true;
            }
            break;
        case "listen-and-choose":
            if (!this.isListenAndChooseExercise) {
                this.isListenAndChooseExercise = true;
                wasUpdated = true;
            }
            break;
    }

    if (wasUpdated) {
        this.lastReviewedAt = new Date();

        // Перевіряємо чи готове для review (тільки основні вправи)
        if (exerciseType !== "reading-comprehension") {
            if (this.updateToReviewIfReady()) {
                wasUpdated = true;
            }
        }
    }

    return wasUpdated;
};

// Обробка неправильної відповіді (включає нову вправу)
flashcardSchema.methods.handleIncorrectAnswer = function (exerciseType) {
    // Reading comprehension не скидає прогрес
    if (exerciseType === "reading-comprehension") {
        return false;
    }

    const hadProgress =
        this.isSentenceCompletionExercise ||
        this.isMultipleChoiceExercise ||
        this.isListenAndFillExercise ||
        this.isListenAndChooseExercise;

    // Скидаємо весь прогрес основних вправ (включаючи нову)
    this.isSentenceCompletionExercise = false;
    this.isMultipleChoiceExercise = false;
    this.isListenAndFillExercise = false;
    this.isListenAndChooseExercise = false;

    // Статус залишається learning
    this.status = "learning";
    this.reviewedAt = null;
    this.lastReviewedAt = new Date();

    return hadProgress;
};

// Перевірка чи слово може використовуватися у вправі (включає нову вправу)
flashcardSchema.methods.canUseInExercise = function (exerciseType) {
    switch (exerciseType) {
        case "sentence-completion":
            return !this.isSentenceCompletionExercise;
        case "multiple-choice":
            return !this.isMultipleChoiceExercise;
        case "listen-and-fill":
            return !this.isListenAndFillExercise;
        case "listen-and-choose":
            return !this.isListenAndChooseExercise;
        case "reading-comprehension":
            return !this.isReadingComprehensionExercise;
        default:
            return true;
    }
};

// Отримання прогресу слова у відсотках (тільки основні вправи, тепер 4)
flashcardSchema.methods.getProgress = function () {
    const completed = [
        this.isSentenceCompletionExercise,
        this.isMultipleChoiceExercise,
        this.isListenAndFillExercise,
        this.isListenAndChooseExercise,
    ].filter(Boolean).length;

    return Math.round((completed / 4) * 100);
};

// Отримання інформації про прогрес (включає нову вправу)
flashcardSchema.methods.getProgressInfo = function () {
    return {
        status: this.status,
        progress: this.getProgress(),
        exercises: {
            sentenceCompletion: this.isSentenceCompletionExercise,
            multipleChoice: this.isMultipleChoiceExercise,
            listenAndFill: this.isListenAndFillExercise,
            listenAndChoose: this.isListenAndChooseExercise,
            readingComprehension: this.isReadingComprehensionExercise,
        },
        lastReviewedAt: this.lastReviewedAt,
        addedToLearningAt: this.addedToLearningAt,
        reviewedAt: this.reviewedAt,
    };
};

// Логіка reading comprehension з НЕГАЙНИМ позначенням слів як використаних - тільки learning картки
flashcardSchema.statics.getWordsForReadingComprehensionWithRotationInfo =
    async function (
        userId,
        categoryId = null,
        requestedCount = 3,
        sessionExcludeIds = []
    ) {
        try {
            const baseQuery = {
                userId,
                status: "learning",
            };

            // Фільтруємо по категорії
            if (categoryId && categoryId !== "all" && categoryId !== null) {
                if (categoryId === "uncategorized") {
                    baseQuery.categoryId = null;
                } else {
                    baseQuery.categoryId = categoryId;
                }
            }

            // КРОК 1: Отримуємо ВСІ learning слова в категорії для перевірки ротації
            const allLearningWordsInCategory = await this.find(baseQuery);

            if (allLearningWordsInCategory.length === 0) {
                console.warn(`No learning words found in category`);
                return {
                    words: [],
                    wasRotationApplied: false,
                    allCategoryWords: [],
                };
            }

            if (allLearningWordsInCategory.length < requestedCount) {
                console.warn(
                    `Not enough learning words in category: ${allLearningWordsInCategory.length} < ${requestedCount}`
                );
                return {
                    words: allLearningWordsInCategory.slice(0, requestedCount),
                    wasRotationApplied: false,
                    allCategoryWords: allLearningWordsInCategory,
                };
            }

            // КРОК 2: ПЕРЕВІРКА РОТАЦІЇ - чи є достатньо слів з isReadingComprehensionExercise = false
            const availableWordsBeforeRotation =
                allLearningWordsInCategory.filter(
                    (word) =>
                        !word.isReadingComprehensionExercise &&
                        !sessionExcludeIds.includes(word._id.toString())
                );

            let wasRotationApplied = false;
            let availableWords = availableWordsBeforeRotation;

            // УМОВА РОТАЦІЇ: якщо доступних слів менше ніж потрібно для кроку
            if (availableWordsBeforeRotation.length < requestedCount) {
                wasRotationApplied = true;

                // Тепер отримуємо всі доступні слова після ротації
                const allWordsAfterRotation = await this.find(baseQuery);
                availableWords = allWordsAfterRotation.filter(
                    (word) => !sessionExcludeIds.includes(word._id.toString())
                );
            }

            // КРОК 3: Вибираємо слова для поточного кроку
            if (availableWords.length < requestedCount) {
                console.warn(
                    `Still not enough learning words after rotation: ${availableWords.length} < ${requestedCount}`
                );
                return {
                    words: availableWords.slice(0, requestedCount),
                    wasRotationApplied: wasRotationApplied,
                    allCategoryWords: allLearningWordsInCategory,
                };
            }

            // Перемішуємо і вибираємо потрібну кількість
            const shuffled = shuffleArray(availableWords);
            const selectedWords = shuffled.slice(0, requestedCount);

            // КЛЮЧОВА ЗМІНА: НЕГАЙНО позначаємо вибрані слова як використані
            const selectedWordIds = selectedWords.map((word) => word._id);

            // Populate categoryId для selectedWords та оновлюємо їх стан
            const updatedSelectedWords = await this.find({
                _id: { $in: selectedWordIds },
            }).populate("categoryId", "name color");

            // КРОК 4: Отримуємо АКТУАЛЬНІ дані всіх learning слів категорії для ExerciseResult
            const finalAllCategoryWords = await this.find(baseQuery).populate(
                "categoryId",
                "name color"
            );

            return {
                words: updatedSelectedWords,
                wasRotationApplied: wasRotationApplied,
                allCategoryWords: finalAllCategoryWords,
            };
        } catch (error) {
            console.error(
                "Error getting learning words for reading comprehension:",
                error
            );
            throw error;
        }
    };

// Отримання слів для конкретної вправи - тільки learning картки (включаючи нову вправу)
flashcardSchema.statics.getWordsForExercise = async function (
    userId,
    exerciseType,
    limit = 10,
    excludeIds = []
) {
    try {
        // Для reading comprehension використовуємо спеціальний метод
        if (exerciseType === "reading-comprehension") {
            const result =
                await this.getWordsForReadingComprehensionWithRotationInfo(
                    userId,
                    null,
                    limit,
                    excludeIds
                );
            return result.words;
        }

        // Логіка для основних вправ - тільки learning картки з рандомізацією (включаючи нову вправу)
        const learningQuery = {
            userId,
            status: "learning",
        };

        if (excludeIds.length > 0) {
            learningQuery._id = { $nin: excludeIds };
        }

        // Додаємо умову що слово ще не пройшло цю вправу (включаючи нову)
        switch (exerciseType) {
            case "sentence-completion":
                learningQuery.isSentenceCompletionExercise = false;
                break;
            case "multiple-choice":
                learningQuery.isMultipleChoiceExercise = false;
                break;
            case "listen-and-fill":
                learningQuery.isListenAndFillExercise = false;
                break;
            case "listen-and-choose":
                learningQuery.isListenAndChooseExercise = false;
                break;
        }

        // Спочатку отримуємо всі learning слова, потім перемішуємо
        let learningWords = await this.find(learningQuery)
            .populate("categoryId", "name color")
            .sort({ lastReviewedAt: 1 });

        // Перемішуємо learning слова
        learningWords = shuffleArray(learningWords);
        let words = learningWords.slice(0, limit);

        return words;
    } catch (error) {
        console.error("Error getting learning words for exercise:", error);
        throw error;
    }
};

// Отримання статистики прогресу користувача (включаючи нову вправу)
flashcardSchema.statics.getLearningStats = async function (userId) {
    try {
        const [learningCount, reviewCount, totalCount] = await Promise.all([
            this.countDocuments({ userId, status: "learning" }),
            this.countDocuments({ userId, status: "review" }),
            this.countDocuments({ userId }),
        ]);

        // Детальна статистика по вправах (включаючи нову)
        const exerciseStats = await this.aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: null,
                    totalSentenceCompletion: {
                        $sum: {
                            $cond: ["$isSentenceCompletionExercise", 1, 0],
                        },
                    },
                    totalMultipleChoice: {
                        $sum: { $cond: ["$isMultipleChoiceExercise", 1, 0] },
                    },
                    totalListenAndFill: {
                        $sum: { $cond: ["$isListenAndFillExercise", 1, 0] },
                    },
                    totalListenAndChoose: {
                        $sum: { $cond: ["$isListenAndChooseExercise", 1, 0] },
                    },
                    totalReadingComprehension: {
                        $sum: {
                            $cond: ["$isReadingComprehensionExercise", 1, 0],
                        },
                    },
                },
            },
        ]);

        const stats = exerciseStats[0] || {
            totalSentenceCompletion: 0,
            totalMultipleChoice: 0,
            totalListenAndFill: 0,
            totalListenAndChoose: 0,
            totalReadingComprehension: 0,
        };

        return {
            learning: learningCount,
            review: reviewCount,
            total: totalCount,
            exercises: {
                sentenceCompletion: stats.totalSentenceCompletion,
                multipleChoice: stats.totalMultipleChoice,
                listenAndFill: stats.totalListenAndFill,
                listenAndChoose: stats.totalListenAndChoose,
                readingComprehension: stats.totalReadingComprehension,
            },
        };
    } catch (error) {
        console.error("Error getting learning stats:", error);
        throw error;
    }
};

// Отримання слів з деталями прогресу
flashcardSchema.statics.getWordsWithProgress = async function (
    userId,
    status = null
) {
    try {
        const query = { userId };
        if (status) {
            query.status = status;
        }

        const words = await this.find(query)
            .populate("categoryId", "name color")
            .sort({ lastReviewedAt: -1 });

        return words.map((word) => ({
            ...word.toObject(),
            progressInfo: word.getProgressInfo(),
        }));
    } catch (error) {
        console.error("Error getting words with progress:", error);
        throw error;
    }
};

// Index for better performance
flashcardSchema.index({ userId: 1, status: 1 });
flashcardSchema.index({ userId: 1, categoryId: 1 });
flashcardSchema.index({ userId: 1, lastReviewedAt: 1 });

// Індекси для вправ
flashcardSchema.index({
    userId: 1,
    status: 1,
    isSentenceCompletionExercise: 1,
});
flashcardSchema.index({ userId: 1, status: 1, isMultipleChoiceExercise: 1 });
flashcardSchema.index({ userId: 1, status: 1, isListenAndFillExercise: 1 });
flashcardSchema.index({ userId: 1, status: 1, isListenAndChooseExercise: 1 });
flashcardSchema.index({ userId: 1, isReadingComprehensionExercise: 1 });

const Flashcard = mongoose.model("Flashcard", flashcardSchema);
export default Flashcard;
