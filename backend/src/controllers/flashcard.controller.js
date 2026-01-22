import Flashcard from "../models/flashcard.model.js";
import Category from "../models/category.model.js";

const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

/**
 * МЕТОД 1: createFlashcard
 *
 * ПРИЗНАЧЕННЯ:
 * Створює нову флешкартку (слово/фразу для вивчення) в базі даних.
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - Коли користувач натискає кнопку "Додати нове слово" на головній сторінці
 * - Коли користувач зберігає AI-згенероване слово
 *
 * ЩО РОБИТЬ:
 * 1. Перевіряє чи є текст слова (обов'язкове поле)
 * 2. Якщо вказана категорія - перевіряє чи вона існує і належить користувачу
 * 3. Обробляє масив прикладів (examples) - фільтрує пусті значення
 * 4. Створює нову флешкартку з усіма даними:
 *    - text (слово/фраза)
 *    - transcription (транскрипція)
 *    - translation (переклад)
 *    - shortDescription (короткий опис для grid режиму)
 *    - explanation (детальне пояснення)
 *    - examples (масив прикладів використання)
 *    - notes (нотатки користувача)
 *    - categoryId (ID папки)
 * 5. Встановлює початкові значення для системи вивчення:
 *    - status: "learning" (статус вивчення)
 *    - всі прапорці вправ: false (слово ще не опрацьовано)
 * 6. Зберігає в базу даних
 * 7. Повертає створену флешкартку з інформацією про категорію
 *
 * РОЛЬ В ДОДАТКУ:
 * Це точка входу для всіх нових слів в системі. Без цього методу користувач
 * не зможе додавати нові слова для вивчення.
 */
const createFlashcard = async (req, res) => {
    try {
        const {
            text,
            transcription,
            translation,
            shortDescription,
            explanation,
            example,
            examples,
            notes,
            isAIGenerated,
            categoryId,
        } = req.body;
        const userId = req.user._id;

        if (!text) {
            return res.status(400).json({ message: "Text is required" });
        }

        if (categoryId) {
            const category = await Category.findOne({
                _id: categoryId,
                userId,
            });
            if (!category) {
                return res.status(404).json({ message: "Category not found" });
            }
        }

        let processedExamples = [];
        if (examples && Array.isArray(examples)) {
            processedExamples = examples
                .filter((ex) => ex && ex.trim())
                .map((ex) => ex.trim());
        } else if (example && example.trim()) {
            processedExamples = [example.trim()];
        }

        const newFlashcard = new Flashcard({
            text: text.trim(),
            transcription: transcription?.trim() || "",
            translation: translation?.trim() || "",
            shortDescription: shortDescription?.trim() || "",
            explanation: explanation?.trim() || "",
            examples: processedExamples,
            example: example?.trim() || "",
            notes: notes?.trim() || "",
            isAIGenerated: isAIGenerated || false,
            categoryId: categoryId || null,
            userId,
            status: "learning",
            isSentenceCompletionExercise: false,
            isMultipleChoiceExercise: false,
            isListenAndFillExercise: false,
            isListenAndChooseExercise: false,
            isReadingComprehensionExercise: false,
            addedToLearningAt: new Date(),
            lastReviewedAt: new Date(),
        });

        await newFlashcard.save();
        await newFlashcard.populate("categoryId", "name color");

        return res.status(201).json(newFlashcard);
    } catch (error) {
        console.log("Error in createFlashcard controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 2: getFlashcards
 *
 * ПРИЗНАЧЕННЯ:
 * Отримує список флешкарток користувача з можливістю фільтрації.
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - При завантаженні головної сторінки (HomePage)
 * - Коли користувач вибирає конкретну категорію
 * - Коли користувач фільтрує за статусом (learning/review)
 * - При оновленні списку після додавання/видалення картки
 *
 * ЩО РОБИТЬ:
 * 1. Отримує параметри фільтрації з URL (categoryId, status)
 * 2. Будує MongoDB query:
 *    - Завжди фільтрує по userId (безпека - тільки свої картки)
 *    - Якщо categoryId="uncategorized" - шукає картки без категорії
 *    - Якщо categoryId вказаний - шукає в цій категорії
 *    - Якщо status вказаний - фільтрує по статусу (learning/review)
 * 3. Виконує запит до бази даних
 * 4. Приєднує інформацію про категорію (populate)
 * 5. Сортує за датою створення (найновіші першими)
 * 6. Повертає масив флешкарток
 *
 * РОЛЬ В ДОДАТКУ:
 * Основний метод для відображення списку слів. Без нього користувач не побачить
 * свої слова на екрані. Використовується ДУЖЕ часто - майже на кожній сторінці.
 */
const getFlashcards = async (req, res) => {
    try {
        const userId = req.user._id;
        const { categoryId, status } = req.query;

        let query = { userId };

        if (categoryId) {
            if (categoryId === "uncategorized") {
                query.categoryId = null;
            } else {
                query.categoryId = categoryId;
            }
        }

        if (status && ["learning", "review"].includes(status)) {
            query.status = status;
        }

        const flashcards = await Flashcard.find(query)
            .populate("categoryId", "name color")
            .sort({ createdAt: -1 });

        return res.status(200).json(flashcards);
    } catch (error) {
        console.log("Error in getFlashcards controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 3: updateFlashcard
 *
 * ПРИЗНАЧЕННЯ:
 * Оновлює існуючу флешкартку (редагування слова).
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - Коли користувач натискає кнопку "Редагувати" і зберігає зміни
 * - Коли користувач регенерує приклади через AI
 * - Коли користувач змінює категорію картки
 *
 * ЩО РОБИТЬ:
 * 1. Перевіряє чи текст не пустий (обов'язкове поле)
 * 2. Шукає флешкартку по ID і userId (безпека)
 * 3. Якщо картка не знайдена - повертає помилку 404
 * 4. Якщо вказана нова категорія - перевіряє чи вона існує
 * 5. Обробляє масив прикладів (фільтрує пусті значення)
 * 6. Оновлює всі поля флешкартки:
 *    - text, transcription, translation
 *    - shortDescription, explanation
 *    - examples, notes
 *    - isAIGenerated
 *    - categoryId (можна переміщувати між папками)
 * 7. Зберігає зміни в базу даних
 * 8. Повертає оновлену флешкартку з інформацією про категорію
 *
 * РОЛЬ В ДОДАТКУ:
 * Дозволяє користувачам виправляти помилки, додавати інформацію,
 * покращувати свої картки. Важливий для підтримки якості навчального матеріалу.
 */
const updateFlashcard = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            text,
            transcription,
            translation,
            shortDescription,
            explanation,
            example,
            examples,
            notes,
            isAIGenerated,
            categoryId,
        } = req.body;
        const userId = req.user._id;

        if (!text) {
            return res.status(400).json({ message: "Text is required" });
        }

        const flashcard = await Flashcard.findOne({ _id: id, userId });

        if (!flashcard) {
            return res.status(404).json({ message: "Flashcard not found" });
        }

        if (categoryId) {
            const category = await Category.findOne({
                _id: categoryId,
                userId,
            });
            if (!category) {
                return res.status(404).json({ message: "Category not found" });
            }
        }

        let processedExamples = [];
        if (examples && Array.isArray(examples)) {
            processedExamples = examples
                .filter((ex) => ex && ex.trim())
                .map((ex) => ex.trim());
        } else if (example && example.trim()) {
            processedExamples = [example.trim()];
        }

        flashcard.text = text.trim();
        flashcard.transcription = transcription?.trim() || "";
        flashcard.translation = translation?.trim() || "";
        flashcard.shortDescription = shortDescription?.trim() || "";
        flashcard.explanation = explanation?.trim() || "";
        flashcard.examples = processedExamples;
        flashcard.example = example?.trim() || "";
        flashcard.notes = notes?.trim() || "";
        if (isAIGenerated !== undefined)
            flashcard.isAIGenerated = isAIGenerated;
        flashcard.categoryId = categoryId || null;

        await flashcard.save();
        await flashcard.populate("categoryId", "name color");

        return res.status(200).json(flashcard);
    } catch (error) {
        console.log("Error in updateFlashcard controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 4: deleteFlashcard
 *
 * ПРИЗНАЧЕННЯ:
 * Видаляє флешкартку назавжди з бази даних.
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - Коли користувач натискає кнопку "Видалити" і підтверджує дію
 * - В модальному вікні підтвердження видалення
 *
 * ЩО РОБИТЬ:
 * 1. Отримує ID флешкартки з параметрів URL
 * 2. Шукає і відразу видаляє флешкартку (findOneAndDelete)
 * 3. Перевіряє userId - безпека (можна видаляти тільки свої картки)
 * 4. Якщо картка не знайдена - повертає помилку 404
 * 5. Якщо успішно - повертає повідомлення про видалення
 *
 * РОЛЬ В ДОДАТКУ:
 * Дозволяє користувачам прибирати непотрібні слова, виправляти помилки,
 * підтримувати чистоту свого словника. ВАЖЛИВО: операція незворотна!
 */
const deleteFlashcard = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const flashcard = await Flashcard.findOneAndDelete({ _id: id, userId });

        if (!flashcard) {
            return res.status(404).json({ message: "Flashcard not found" });
        }

        return res.status(200).json({ message: "Flashcard deleted" });
    } catch (error) {
        console.log("Error in deleteFlashcard controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 5: getFlashcardsGrouped
 *
 * ПРИЗНАЧЕННЯ:
 * Отримує флешкартки згруповані по категоріях (папках).
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - При відображенні списку категорій на головній сторінці
 * - Коли потрібно показати скільки слів в кожній папці
 * - Для статистики по категоріях
 *
 * ЩО РОБИТЬ:
 * 1. Використовує MongoDB aggregation pipeline для групування:
 *    - Фільтрує тільки картки поточного користувача ($match)
 *    - Приєднує інформацію про категорії ($lookup)
 *    - Групує картки по categoryId ($group)
 *    - Рахує кількість карток в кожній групі ($count)
 * 2. Сортує результат за categoryId
 * 3. Повертає масив об'єктів:
 *    {
 *      _id: categoryId,
 *      category: { name, color, ... },
 *      flashcards: [...],
 *      count: число
 *    }
 *
 * РОЛЬ В ДОДАТКУ:
 * Показує структуру всіх слів користувача по папках. Дає візуальне уявлення
 * про організацію словника. Допомагає побачити які теми найбільш/найменш заповнені.
 */
const getFlashcardsGrouped = async (req, res) => {
    try {
        const userId = req.user._id;

        const result = await Flashcard.aggregate([
            { $match: { userId } },
            {
                $lookup: {
                    from: "categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "category",
                },
            },
            {
                $group: {
                    _id: "$categoryId",
                    category: { $first: { $arrayElemAt: ["$category", 0] } },
                    flashcards: { $push: "$$ROOT" },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        return res.status(200).json(result);
    } catch (error) {
        console.log("Error in getFlashcardsGrouped controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 6: handleExerciseResult
 *
 * ПРИЗНАЧЕННЯ:
 * Обробляє результат виконання вправи користувачем - найважливіший метод
 * для системи прогресивного вивчення слів.
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - Після кожної вправи (Sentence Completion, Multiple Choice, Listen and Fill, Listen and Choose, Reading Comprehension)
 * - Коли користувач дає правильну або неправильну відповідь
 * - Для оновлення прогресу вивчення слів
 *
 * ЩО РОБИТЬ:
 *
 * 1. ВАЛІДАЦІЯ ДАНИХ:
 *    - Перевіряє flashcardId або usedWordIds (для reading comprehension)
 *    - Перевіряє exerciseType (має бути одним з 5 дозволених типів)
 *    - Перевіряє isCorrect (true/false)
 *
 * 2. ВИЗНАЧЕННЯ ТИПУ ВПРАВИ:
 *    - Для reading comprehension: обробляє масив слів (usedWordIds)
 *    - Для звичайних вправ: обробляє одне слово (flashcardId)
 *
 * 3. ОБРОБКА КОЖНОГО СЛОВА:
 *    а) Якщо відповідь ПРАВИЛЬНА:
 *       - Викликає flashcard.handleCorrectAnswer(exerciseType)
 *       - Встановлює прапорець для цієї вправи (напр. isSentenceCompletionExercise = true)
 *       - Якщо всі 4 основні вправи пройдені - змінює status на "review"
 *       - Оновлює lastReviewedAt
 *       - Зберігає в базу даних
 *
 *    б) Якщо відповідь НЕПРАВИЛЬНА:
 *       - Викликає flashcard.handleIncorrectAnswer(exerciseType)
 *       - Скидає ВСІ прапорці вправ на false
 *       - Повертає status на "learning"
 *       - Користувач починає вивчення слова заново
 *
 * 4. СПЕЦІАЛЬНА ЛОГІКА ДЛЯ REVIEW:
 *    - Слова зі статусом "review" НЕ обробляються у вправах
 *    - Вони пропускаються (це слова які вже вивчені)
 *
 * 5. ФОРМУВАННЯ ВІДПОВІДІ:
 *    - Для reading comprehension: повідомлення про всі оброблені слова
 *    - Для звичайних вправ: показує прогрес у відсотках
 *    - Повертає масив оброблених слів з оновленими статусами
 *
 * РОЛЬ В ДОДАТКУ:
 * **ЦЕ СЕРЦЕ ВСІЄЇ СИСТЕМИ ВИВЧЕННЯ!**
 * Цей метод відповідає за:
 * - Відслідковування прогресу вивчення
 * - Переведення слів з "learning" в "review"
 * - Повернення слів назад при помилках
 * - Мотивацію користувача (показує прогрес)
 * Без цього методу вся система вивчення не працюватиме.
 */
const handleExerciseResult = async (req, res) => {
    try {
        const { flashcardId, exerciseType, isCorrect, usedWordIds } = req.body;
        const userId = req.user._id;

        let wordIds;

        if (
            exerciseType === "reading-comprehension" &&
            usedWordIds &&
            Array.isArray(usedWordIds) &&
            usedWordIds.length > 0
        ) {
            wordIds = usedWordIds;
        } else {
            wordIds = [flashcardId];
        }

        if (
            wordIds.length === 0 ||
            !exerciseType ||
            typeof isCorrect !== "boolean"
        ) {
            return res.status(400).json({
                message:
                    "FlashcardId(s), exerciseType and isCorrect are required",
            });
        }

        const validExerciseTypes = [
            "sentence-completion",
            "multiple-choice",
            "listen-and-fill",
            "listen-and-choose",
            "reading-comprehension",
        ];
        if (!validExerciseTypes.includes(exerciseType)) {
            return res.status(400).json({
                message: "Invalid exercise type",
            });
        }

        let processedWords = [];
        let resultMessage = "";

        for (const wordId of wordIds) {
            const flashcard = await Flashcard.findOne({ _id: wordId, userId });

            if (!flashcard) {
                console.warn(`Flashcard not found: ${wordId}`);
                continue;
            }

            if (flashcard.status === "review") {
                continue;
            }

            let progressChanged = false;

            if (exerciseType === "reading-comprehension") {
                flashcard.lastReviewedAt = new Date();
                progressChanged = true;

                if (progressChanged) {
                    await flashcard.save();
                }

                processedWords.push({
                    _id: flashcard._id,
                    text: flashcard.text,
                    status: flashcard.status,
                    progressInfo: flashcard.getProgressInfo(),
                    wasUpdated: progressChanged,
                    isSentenceCompletionExercise:
                        flashcard.isSentenceCompletionExercise,
                    isMultipleChoiceExercise:
                        flashcard.isMultipleChoiceExercise,
                    isListenAndFillExercise: flashcard.isListenAndFillExercise,
                    isListenAndChooseExercise:
                        flashcard.isListenAndChooseExercise,
                    isReadingComprehensionExercise:
                        flashcard.isReadingComprehensionExercise,
                    lastReviewedAt: flashcard.lastReviewedAt,
                });
            } else if (isCorrect) {
                if (
                    [
                        "sentence-completion",
                        "multiple-choice",
                        "listen-and-fill",
                        "listen-and-choose",
                    ].includes(exerciseType)
                ) {
                    progressChanged =
                        flashcard.handleCorrectAnswer(exerciseType);

                    if (progressChanged) {
                        await flashcard.save();
                    }

                    processedWords.push({
                        _id: flashcard._id,
                        text: flashcard.text,
                        status: flashcard.status,
                        progressInfo: flashcard.getProgressInfo(),
                        wasUpdated: progressChanged,
                        isSentenceCompletionExercise:
                            flashcard.isSentenceCompletionExercise,
                        isMultipleChoiceExercise:
                            flashcard.isMultipleChoiceExercise,
                        isListenAndFillExercise:
                            flashcard.isListenAndFillExercise,
                        isListenAndChooseExercise:
                            flashcard.isListenAndChooseExercise,
                        isReadingComprehensionExercise:
                            flashcard.isReadingComprehensionExercise,
                        lastReviewedAt: flashcard.lastReviewedAt,
                    });
                }
            } else {
                if (
                    [
                        "sentence-completion",
                        "multiple-choice",
                        "listen-and-fill",
                        "listen-and-choose",
                    ].includes(exerciseType)
                ) {
                    progressChanged =
                        flashcard.handleIncorrectAnswer(exerciseType);

                    if (progressChanged) {
                        await flashcard.save();
                    }

                    processedWords.push({
                        _id: flashcard._id,
                        text: flashcard.text,
                        status: flashcard.status,
                        progressInfo: flashcard.getProgressInfo(),
                        wasUpdated: progressChanged,
                        isSentenceCompletionExercise:
                            flashcard.isSentenceCompletionExercise,
                        isMultipleChoiceExercise:
                            flashcard.isMultipleChoiceExercise,
                        isListenAndFillExercise:
                            flashcard.isListenAndFillExercise,
                        isListenAndChooseExercise:
                            flashcard.isListenAndChooseExercise,
                        isReadingComprehensionExercise:
                            flashcard.isReadingComprehensionExercise,
                        lastReviewedAt: flashcard.lastReviewedAt,
                    });
                }
            }
        }

        if (exerciseType === "reading-comprehension") {
            if (isCorrect) {
                resultMessage = `Правильна відповідь! Прочитано успішно. Опрацьовано ${processedWords.length} слів.`;
            } else {
                resultMessage = `Неправильна відповідь. Читайте уважніше. Опрацьовано ${processedWords.length} слів.`;
            }
        } else if (isCorrect) {
            const mainWord = processedWords[0];
            if (mainWord) {
                const progressInfo = mainWord.progressInfo;
                resultMessage = `Правильна відповідь! Прогрес: ${progressInfo.progress}%`;
            } else {
                resultMessage = "Правильна відповідь!";
            }
        } else {
            resultMessage = "Неправильна відповідь. Прогрес скинуто.";
        }

        const isMainExercise = [
            "sentence-completion",
            "multiple-choice",
            "listen-and-fill",
            "listen-and-choose",
        ].includes(exerciseType);

        return res.status(200).json({
            success: true,
            flashcard: processedWords.length > 0 ? processedWords[0] : null,
            allWords: processedWords,
            message: resultMessage,
            isMainExercise: isMainExercise,
            exerciseType: exerciseType,
            wordsProcessed: processedWords.length,
        });
    } catch (error) {
        console.log("Error in handleExerciseResult controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 7: getWordsForExercise
 *
 * ПРИЗНАЧЕННЯ:
 * Вибирає слова для конкретної вправи з розумною логікою фільтрації.
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - Перед початком будь-якої вправи (Sentence Completion, Multiple Choice, тощо)
 * - Коли потрібно завантажити нову порцію слів
 * - При оновленні списку слів після виконання вправи
 *
 * ЩО РОБИТЬ:
 *
 * 1. ПАРАМЕТРИ ЗАПИТУ:
 *    - exerciseType: тип вправи
 *    - limit: скільки слів потрібно (за замовчуванням 10)
 *    - categoryId: фільтр по категорії (опціонально)
 *    - excludeIds: ID слів які треба виключити (вже використані)
 *
 * 2. ЗАГАЛЬНА ЛОГІКА:
 *    - Шукає тільки слова зі статусом "learning"
 *    - Виключає слова які вже в review (вони вивчені)
 *    - Фільтрує по категорії якщо вказано
 *    - Виключає ID з excludeIds
 *
 * 3. СПЕЦІАЛЬНА ЛОГІКА ДЛЯ READING COMPREHENSION:
 *    - Шукає слова де isReadingComprehensionExercise = false
 *    - Якщо таких немає - скидає прапорці у ВСІХ слів категорії
 *    - Це дозволяє циклічно використовувати слова
 *
 * 4. СПЕЦІАЛЬНА ЛОГІКА ДЛЯ ОСНОВНИХ ВПРАВ:
 *    - Sentence Completion: шукає де isSentenceCompletionExercise = false
 *    - Multiple Choice: шукає де isMultipleChoiceExercise = false
 *    - Listen and Fill: шукає де isListenAndFillExercise = false
 *    - Listen and Choose: шукає де isListenAndChooseExercise = false
 *
 * 5. РАНДОМІЗАЦІЯ:
 *    - Перемішує слова (shuffleArray)
 *    - Вибирає потрібну кількість
 *    - Повертає в випадковому порядку
 *
 * 6. ВІДПОВІДЬ:
 *    - words: масив слів для вправи
 *    - total: загальна кількість
 *    - exerciseType: тип вправи
 *    - breakdown: статистика (learning/review)
 *
 * РОЛЬ В ДОДАТКУ:
 * Це "мозок" вибору слів для вправ. Забезпечує:
 * - Справедливий розподіл вправ (не повторює одні й ті ж слова)
 * - Циклічність (коли всі слова опрацьовані - починає заново)
 * - Різноманітність (рандомізація)
 * Без цього методу вправи не матимуть слів для відображення.
 */
const getWordsForExercise = async (req, res) => {
    try {
        const { exerciseType } = req.params;
        const { limit = 10, categoryId, excludeIds } = req.query;
        const userId = req.user._id;

        const validExerciseTypes = [
            "sentence-completion",
            "multiple-choice",
            "listen-and-fill",
            "listen-and-choose",
            "reading-comprehension",
        ];
        if (!validExerciseTypes.includes(exerciseType)) {
            return res.status(400).json({
                message: "Invalid exercise type",
            });
        }

        let excludeIdsList = [];
        if (excludeIds) {
            try {
                excludeIdsList = Array.isArray(excludeIds)
                    ? excludeIds
                    : excludeIds.split(",");
            } catch (error) {
                console.warn("Failed to parse excludeIds:", error);
            }
        }

        let words;
        let wasRotationApplied = false;
        let allCategoryWords = [];

        const coreExercises = [
            "sentence-completion",
            "multiple-choice",
            "listen-and-fill",
            "listen-and-choose",
        ];

        if (coreExercises.includes(exerciseType)) {
            const baseQuery = {
                userId,
                status: "learning",
            };

            if (categoryId && categoryId !== "all" && categoryId !== null) {
                if (categoryId === "uncategorized") {
                    baseQuery.categoryId = null;
                } else {
                    baseQuery.categoryId = categoryId;
                }
            }

            if (excludeIdsList.length > 0) {
                baseQuery._id = { $nin: excludeIdsList };
            }

            switch (exerciseType) {
                case "sentence-completion":
                    baseQuery.isSentenceCompletionExercise = false;
                    break;
                case "multiple-choice":
                    baseQuery.isMultipleChoiceExercise = false;
                    break;
                case "listen-and-fill":
                    baseQuery.isListenAndFillExercise = false;
                    break;
                case "listen-and-choose":
                    baseQuery.isListenAndChooseExercise = false;
                    break;
            }

            let learningWords = await Flashcard.find(baseQuery)
                .populate("categoryId", "name color")
                .sort({ lastReviewedAt: 1 });

            learningWords = shuffleArray(learningWords);
            words = learningWords.slice(0, parseInt(limit));

            return res.status(200).json({
                words,
                total: words.length,
                exerciseType,
                mode: "fast",
                breakdown: {
                    learning: words.length,
                    review: 0,
                },
            });
        }

        if (exerciseType === "reading-comprehension") {
            const result =
                await Flashcard.getWordsForReadingComprehensionWithRotationInfo(
                    userId,
                    categoryId,
                    parseInt(limit) || 3,
                    excludeIdsList
                );

            words = result.words;
            wasRotationApplied = result.wasRotationApplied;
            allCategoryWords = result.allCategoryWords;

            if (words.length === 0) {
                console.warn(`No words found for reading comprehension`);
                return res.status(200).json({
                    words: [],
                    total: 0,
                    exerciseType,
                    mode: "network",
                    wasRotationApplied: false,
                    allCategoryWords: allCategoryWords,
                    note: "No words available for reading comprehension",
                });
            }

            words = shuffleArray(words);

            return res.status(200).json({
                words: words,
                total: words.length,
                exerciseType,
                mode: "network",
                wasRotationApplied,
                allCategoryWords: allCategoryWords,
                note: wasRotationApplied
                    ? `Words selected after rotation reset - all RC flags cleared for fresh cycle`
                    : `Words selected for reading comprehension using rotation logic - already marked as used`,
            });
        }

        return res.status(200).json({
            words: words || [],
            total: (words || []).length,
            exerciseType,
            mode: "network",
            breakdown: {
                learning: (words || []).filter((w) => w.status === "learning")
                    .length,
                review: (words || []).filter((w) => w.status === "review")
                    .length,
            },
        });
    } catch (error) {
        console.log("Error in getWordsForExercise controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 8: getLearningStats
 *
 * ПРИЗНАЧЕННЯ:
 * Отримує статистику вивчення слів користувача.
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - При завантаженні головної сторінки
 * - Після виконання вправи (для оновлення прогресу)
 * - На сторінці статистики (якщо є)
 * - Для відображення прогрес-барів
 *
 * ЩО РОБИТЬ:
 * 1. Викликає статичний метод моделі Flashcard.getLearningStats(userId)
 * 2. Модель рахує:
 *    - Загальна кількість слів
 *    - Кількість слів в "learning"
 *    - Кількість слів в "review"
 *    - Прогрес у відсотках для кожної вправи
 *    - Середній прогрес по всіх словах
 * 3. Повертає об'єкт статистики
 *
 * РОЛЬ В ДОДАТКУ:
 * Показує користувачу його прогрес, мотивує продовжувати вчити слова.
 * Візуалізує скільки слів вивчено, скільки залишилось.
 */
const getLearningStats = async (req, res) => {
    try {
        const userId = req.user._id;

        const stats = await Flashcard.getLearningStats(userId);

        return res.status(200).json(stats);
    } catch (error) {
        console.log("Error in getLearningStats controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 9: getWordsWithProgress
 *
 * ПРИЗНАЧЕННЯ:
 * Отримує список слів з детальною інформацією про прогрес вивчення.
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - На сторінці прогресу (якщо є)
 * - Для відображення детальної статистики
 * - При фільтрації слів по статусу
 *
 * ЩО РОБИТЬ:
 * 1. Приймає опціональний параметр status (learning/review)
 * 2. Викликає статичний метод моделі Flashcard.getWordsWithProgress(userId, status)
 * 3. Модель повертає слова з додатковою інформацією:
 *    - Прогрес у відсотках
 *    - Які вправи пройдені
 *    - Дата останнього повторення
 * 4. Повертає масив слів з прогресом
 *
 * РОЛЬ В ДОДАТКУ:
 * Дає детальний вигляд на стан вивчення кожного слова.
 * Допомагає користувачу зрозуміти які слова потребують більше уваги.
 */
const getWordsWithProgress = async (req, res) => {
    try {
        const { status } = req.query;
        const userId = req.user._id;

        const words = await Flashcard.getWordsWithProgress(userId, status);

        return res.status(200).json(words);
    } catch (error) {
        console.log("Error in getWordsWithProgress controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * МЕТОД 10: resetWordProgress
 *
 * ПРИЗНАЧЕННЯ:
 * Скидає прогрес вивчення конкретного слова (починає вивчення заново).
 *
 * КОЛИ ВИКОРИСТОВУЄТЬСЯ:
 * - Коли користувач хоче почати вивчення слова заново
 * - Якщо слово було помилково переведено в review
 * - Для "важких" слів які потребують повторення
 *
 * ЩО РОБИТЬ:
 * 1. Знаходить флешкартку по ID
 * 2. Скидає всі параметри вивчення:
 *    - status = "learning"
 *    - всі прапорці вправ = false
 *    - reviewedAt = null
 *    - lastReviewedAt = поточна дата
 * 3. Зберігає зміни
 * 4. Повертає оновлену флешкартку з прогресом
 *
 * РОЛЬ В ДОДАТКУ:
 * Дає користувачу контроль над процесом вивчення. Дозволяє "почати заново"
 * якщо слово забулось або потребує повторення. Важливо для гнучкості системи.
 */
const resetWordProgress = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const flashcard = await Flashcard.findOne({ _id: id, userId });

        if (!flashcard) {
            return res.status(404).json({ message: "Flashcard not found" });
        }

        flashcard.status = "learning";
        flashcard.isSentenceCompletionExercise = false;
        flashcard.isMultipleChoiceExercise = false;
        flashcard.isListenAndFillExercise = false;
        flashcard.isListenAndChooseExercise = false;
        flashcard.isReadingComprehensionExercise = false;
        flashcard.reviewedAt = null;
        flashcard.lastReviewedAt = new Date();

        await flashcard.save();

        return res.status(200).json({
            message: "Прогрес скинуто",
            flashcard: {
                _id: flashcard._id,
                text: flashcard.text,
                status: flashcard.status,
                progressInfo: flashcard.getProgressInfo(),
                isSentenceCompletionExercise:
                    flashcard.isSentenceCompletionExercise,
                isMultipleChoiceExercise: flashcard.isMultipleChoiceExercise,
                isListenAndFillExercise: flashcard.isListenAndFillExercise,
                isListenAndChooseExercise: flashcard.isListenAndChooseExercise,
                isReadingComprehensionExercise:
                    flashcard.isReadingComprehensionExercise,
                lastReviewedAt: flashcard.lastReviewedAt,
            },
        });
    } catch (error) {
        console.log("Error in resetWordProgress controller", error.message);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export default {
    createFlashcard,
    getFlashcards,
    updateFlashcard,
    deleteFlashcard,
    getFlashcardsGrouped,
    handleExerciseResult,
    getWordsForExercise,
    getLearningStats,
    getWordsWithProgress,
    resetWordProgress,
};
