// frontend/src/components/exercises/ReadingComprehensionExercise.jsx - ВИПРАВЛЕНА ВЕРСІЯ БЕЗ ПОВТОРІВ СЛІВ

import { useState, useEffect, useCallback } from "react";
import { useFlashcardStore } from "../../store/useFlashcardStore.js";
import { useUserSettingsStore } from "../../store/useUserSettingsStore.js";
import ExerciseLayout from "../shared/ExerciseLayout.jsx";
import DetailedCardInfo from "../shared/DetailedCardInfo.jsx";
import {
    CheckCircle,
    XCircle,
    BookOpen,
    Loader,
    FileText,
    Sparkles,
    Eye,
    Target,
    AlertCircle,
    RefreshCw,
} from "lucide-react";

const ReadingComprehensionExercise = ({
    rightOptionCard,
    optionCards, // Всі доступні картки для вибору 3 слів
    onExit,
    progress = null,
    isLastQuestion = false,
    onRestart,
    isProcessing = false,
    onProgressUpdate = null,
    sessionUsedWordIds = [], // ДОДАНО: ID слів, використаних в поточній сесії
}) => {
    const { generateFieldContent, getFlashcards } = useFlashcardStore();
    const { getDefaultEnglishLevel } = useUserSettingsStore();

    // Основні стейти
    const [readingData, setReadingData] = useState(null);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isCorrect, setIsCorrect] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [canRetry, setCanRetry] = useState(true);
    const [internalProcessing, setInternalProcessing] = useState(false);

    // ДОДАНО: Стейти для табів з 3 словами
    const [activeWordTab, setActiveWordTab] = useState(0);
    const [usedWords, setUsedWords] = useState([]); // Слова що використані в тексті
    const [updatedCards, setUpdatedCards] = useState({}); // Оновлені картки для кожного слова

    const combinedProcessing = isProcessing || internalProcessing;
    const englishLevel = getDefaultEnglishLevel();

    // Словник типів текстів для відображення
    const textTypeNames = {
        documentary: "Документальний",
        story: "Оповідання",
        news: "Новини",
        article: "Стаття",
        blog: "Блог",
        scientific: "Наукова стаття",
        announcement: "Оголошення",
        advertisement: "Реклама",
        instruction: "Інструкція",
        "review on product / video / post etc": "Відгук",
        letter: "Лист",
        report: "Звіт",
        documentation: "Документація",
        interview: "Інтерв'ю",
        speech: "Промова",
        comment: "Коментар",
        "social media post": "Пост у соцмережах",
    };

    // Функція для reset стану
    const resetExerciseState = useCallback(() => {
        console.log(`📖 Resetting reading comprehension state`);

        setReadingData(null);
        setSelectedAnswer(null);
        setIsCorrect(null);
        setShowResult(false);
        setIsLoading(true);
        setIsGenerating(false);
        setHasError(false);
        setErrorMessage("");
        setCanRetry(true);
        setInternalProcessing(false);
        setActiveWordTab(0);
        setUsedWords([]);
        setUpdatedCards({});
    }, []);

    // Функція для підсвічування слів та форматування абзаців
    const processTextContent = (text, usedWords) => {
        if (!text) return "";

        let processedText = text;

        // Підсвічуємо слова якщо є
        if (usedWords && usedWords.length > 0) {
            usedWords.forEach((word, index) => {
                if (word && word.trim()) {
                    const colorClasses = [
                        "bg-blue-200 text-blue-800",
                        "bg-green-200 text-green-800",
                        "bg-purple-200 text-purple-800",
                    ];
                    const colorClass =
                        colorClasses[index] || "bg-yellow-200 text-yellow-800";

                    const wordPattern = new RegExp(
                        "\\b" +
                            word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                            "\\b",
                        "gi"
                    );
                    processedText = processedText.replace(
                        wordPattern,
                        `<mark class="${colorClass} px-1 py-0.5 rounded font-semibold">${word.trim()}</mark>`
                    );
                }
            });
        }

        // Обробляємо абзаци
        processedText = processedText.replace(
            /\n\n/g,
            '</p><p class="mb-4 last:mb-0">'
        );
        processedText = `<p class="mb-4 last:mb-0">${processedText}</p>`;

        return processedText;
    };

    // ВИПРАВЛЕНО: Функція знаходження карток за використаними словами
    const findCardsForUsedWords = useCallback(
        (usedWordsFromText) => {
            if (!usedWordsFromText || !optionCards) {
                console.log("❌ findCardsForUsedWords: Missing data", {
                    usedWordsFromText,
                    optionCards: optionCards?.length,
                });
                return [];
            }

            console.log(
                `🔍 Finding cards for ${usedWordsFromText.length} used words:`,
                usedWordsFromText
            );
            console.log(`🔍 Available option cards: ${optionCards.length}`);

            const foundCards = [];

            usedWordsFromText.forEach((usedWord, index) => {
                console.log(`🔍 Processing word ${index + 1}: "${usedWord}"`);

                // Спробуємо різні стратегії пошуку
                let matchingCard = null;

                // Стратегія 1: Точний збіг
                matchingCard = optionCards.find(
                    (card) =>
                        card.text.toLowerCase().trim() ===
                        usedWord.toLowerCase().trim()
                );

                if (!matchingCard) {
                    // Стратегія 2: Перевірка включення (used word містить text картки)
                    matchingCard = optionCards.find((card) =>
                        usedWord
                            .toLowerCase()
                            .includes(card.text.toLowerCase().trim())
                    );
                }

                if (!matchingCard) {
                    // Стратегія 3: Перевірка включення (text картки містить used word)
                    matchingCard = optionCards.find((card) =>
                        card.text
                            .toLowerCase()
                            .includes(usedWord.toLowerCase().trim())
                    );
                }

                if (!matchingCard) {
                    // Стратегія 4: Перевірка по словах (якщо used word складний)
                    const usedWordParts = usedWord.toLowerCase().split(/\s+/);
                    matchingCard = optionCards.find((card) => {
                        const cardTextLower = card.text.toLowerCase();
                        return usedWordParts.some(
                            (part) =>
                                part.length > 2 && cardTextLower.includes(part)
                        );
                    });
                }

                if (
                    matchingCard &&
                    !foundCards.find((c) => c._id === matchingCard._id)
                ) {
                    foundCards.push(matchingCard);
                    console.log(
                        `✅ Found match for "${usedWord}": "${matchingCard.text}" (ID: ${matchingCard._id})`
                    );
                } else if (!matchingCard) {
                    console.warn(`❌ No match found for word: "${usedWord}"`);

                    // FALLBACK: Якщо не знайшли точного збігу, можемо взяти першу доступну картку
                    // Це не ідеально, але краще ніж пустий масив
                    const fallbackCard = optionCards.find(
                        (card) => !foundCards.find((c) => c._id === card._id)
                    );

                    if (fallbackCard) {
                        foundCards.push(fallbackCard);
                        console.warn(
                            `⚠️ Using fallback card for "${usedWord}": "${fallbackCard.text}" (ID: ${fallbackCard._id})`
                        );
                    }
                }
            });

            console.log(
                `🎯 Final result: Found ${foundCards.length} cards:`,
                foundCards.map((c) => c.text)
            );

            return foundCards;
        },
        [optionCards]
    );

    // ВИПРАВЛЕНО: Генерація reading comprehension з врахуванням сесійних excludeIds
    const generateReadingExercise = useCallback(async () => {
        if (!optionCards || optionCards.length < 3) {
            console.error("📖 Not enough cards for reading comprehension");
            setHasError(true);
            setErrorMessage("Потрібно мінімум 3 картки для генерації тексту");
            setCanRetry(false);
            setIsLoading(false);
            setIsGenerating(false);
            return;
        }

        setIsLoading(true);
        setIsGenerating(true);
        setHasError(false);
        setErrorMessage("");
        setShowResult(false);

        try {
            // ВИПРАВЛЕНО: Врахування сесійних excludeIds
            console.log(`📖 Session used word IDs:`, sessionUsedWordIds);

            // Фільтруємо доступні картки, виключаючи використані в сесії
            const availableCards = optionCards.filter(
                (card) => !sessionUsedWordIds.includes(card._id)
            );

            console.log(
                `📖 Available cards after session filtering: ${availableCards.length}/${optionCards.length}`
            );

            if (availableCards.length < 3) {
                console.warn(
                    `📖 Not enough unused cards: ${availableCards.length} < 3`
                );
                setHasError(true);
                setErrorMessage(
                    `Недостатньо невикористаних слів для генерації (доступно ${availableCards.length}, потрібно 3)`
                );
                setCanRetry(false);
                setIsLoading(false);
                setIsGenerating(false);
                return;
            }

            // Вибираємо 3 картки з доступних
            const shuffledCards = [...availableCards].sort(
                () => Math.random() - 0.5
            );
            const selectedCards = shuffledCards.slice(0, 3);

            const wordsString = selectedCards
                .map((card) => card.text)
                .join(", ");

            console.log(
                `📖 Generating reading comprehension with available words: ${wordsString}`
            );

            const result = await generateFieldContent(
                wordsString,
                englishLevel,
                "readingComprehension"
            );

            if (
                !result ||
                !result.text ||
                !result.facts ||
                !Array.isArray(result.facts)
            ) {
                throw new Error(
                    "ШІ повернула некоректні дані для reading comprehension"
                );
            }

            if (result.facts.length !== 3) {
                throw new Error(
                    "Reading comprehension повинна мати рівно 3 факти"
                );
            }

            if (
                !Array.isArray(result.usedWords) ||
                result.usedWords.length !== 3
            ) {
                throw new Error(
                    "Reading comprehension повинна використовувати рівно 3 слова"
                );
            }

            if (
                typeof result.correctOption !== "number" ||
                result.correctOption < 0 ||
                result.correctOption > 2
            ) {
                throw new Error("Некоректний індекс правильної відповіді");
            }

            console.log(`📖 Reading comprehension generated successfully`);

            // ДОДАНО: Детальне логування для debug
            console.log(`📖 AI Response details:`);
            console.log(`   Text type: ${result.textType}`);
            console.log(`   Text length: ${result.text.length} characters`);
            console.log(`   Facts count: ${result.facts.length}`);
            console.log(
                `   Used words from AI: [${result.usedWords.join(", ")}]`
            );
            console.log(`   Correct option: ${result.correctOption}`);

            // ВИПРАВЛЕНО: Використовуємо selectedCards замість пошуку
            console.log(
                `📖 Using selected cards directly:`,
                selectedCards.map((c) => ({ id: c._id, text: c.text }))
            );

            setUsedWords(selectedCards);
            setReadingData(result);
        } catch (error) {
            console.error("📖 Error generating reading comprehension:", error);

            setHasError(true);

            if (error.response?.status === 401) {
                setErrorMessage("API ключ недійсний. Перевірте налаштування.");
            } else if (error.response?.status === 402) {
                setErrorMessage(
                    "Недостатньо кредитів OpenAI. Поповніть баланс."
                );
            } else if (error.response?.status === 429) {
                setErrorMessage(
                    "Перевищено ліміт запитів. Спробуйте через кілька хвилин."
                );
            } else if (error.message?.includes("timeout")) {
                setErrorMessage("Запит занадто довгий. Спробуйте ще раз.");
            } else if (error.message?.includes("некоректні дані")) {
                setErrorMessage(
                    "ШІ згенерувала некоректні дані. Спробуйте ще раз."
                );
            } else {
                setErrorMessage(
                    "Помилка генерації тексту для читання. Спробуйте ще раз."
                );
            }

            setCanRetry(true);
            setReadingData(null);
        } finally {
            setIsLoading(false);
            setIsGenerating(false);
        }
    }, [generateFieldContent, englishLevel, optionCards, sessionUsedWordIds]);

    // Ефект для ініціалізації
    useEffect(() => {
        console.log("📖 ReadingComprehensionExercise effect triggered");

        if (rightOptionCard && optionCards && optionCards.length >= 3) {
            console.log(
                `📖 Reading comprehension initialized with rightOptionCard: ${rightOptionCard.text}`
            );
            console.log(
                `📖 Session used words count: ${sessionUsedWordIds.length}`
            );
            resetExerciseState();

            const timer = setTimeout(() => {
                generateReadingExercise();
            }, 100);

            return () => {
                clearTimeout(timer);
            };
        } else {
            console.log("📖 Insufficient data for reading comprehension");
        }
    }, [
        rightOptionCard?._id,
        resetExerciseState,
        generateReadingExercise,
        sessionUsedWordIds,
    ]);

    // Функція для повторної спроби
    const handleRetry = useCallback(() => {
        if (!canRetry) return;

        console.log("📖 Retrying reading comprehension generation");
        resetExerciseState();

        const timer = setTimeout(() => {
            generateReadingExercise();
        }, 100);

        return () => clearTimeout(timer);
    }, [canRetry, resetExerciseState, generateReadingExercise]);

    // Функція вибору відповіді
    const handleAnswerSelect = (answerIndex) => {
        if (selectedAnswer !== null || combinedProcessing) return;

        const correct = answerIndex === readingData.correctOption;
        setSelectedAnswer(answerIndex);
        setIsCorrect(correct);
        setShowResult(true);

        // ДОДАНО: Миттєве оновлення прогресу
        if (onProgressUpdate && progress) {
            const updatedProgress = {
                ...progress,
                correct: progress.correct + (correct ? 1 : 0),
                currentAnswered: progress.current, // Відповіли на поточне питання
            };
            onProgressUpdate(updatedProgress);
        }

        console.log(
            `📖 Answer selected: index ${answerIndex}, correct: ${correct}`
        );
    };

    // ВИПРАВЛЕНО: Обробка завершення з оновленням store
    const handleContinue = useCallback(async () => {
        if (combinedProcessing || !readingData) {
            console.log(
                "📖 Cannot continue: processing in progress or missing data"
            );
            return;
        }

        console.log(
            "📖 Reading comprehension completing with result:",
            isCorrect
        );
        setInternalProcessing(true);

        try {
            // ВИПРАВЛЕНО: Правильна передача ВСІХ 3 використаних слів
            const allUsedWordIds = usedWords.map((word) => word._id);

            // ДОДАНО: Валідація перед передачею
            if (allUsedWordIds.length !== 3) {
                console.warn(
                    `⚠️ Expected 3 words, but got ${allUsedWordIds.length} words!`
                );
                console.warn(
                    `⚠️ Used words:`,
                    usedWords.map((w) => ({ id: w._id, text: w.text }))
                );
            }

            console.log(
                `📖 Передаємо ${allUsedWordIds.length} слів до backend:`,
                usedWords.map((w) => w.text)
            );
            console.log(`📖 IDs для передачі:`, allUsedWordIds);

            // ДОДАНО: Валідація що всі ID є валідними
            const invalidIds = allUsedWordIds.filter(
                (id) => !id || typeof id !== "string"
            );
            if (invalidIds.length > 0) {
                console.error(`❌ Invalid IDs detected:`, invalidIds);
                throw new Error(`Invalid word IDs: ${invalidIds.join(", ")}`);
            }

            // ДОДАНО: Оновлюємо store перед виходом щоб синхронізувати стан
            console.log(
                `📖 Refreshing flashcards to sync with backend changes`
            );
            try {
                await getFlashcards();
                console.log(`✅ Flashcards refreshed successfully`);
            } catch (error) {
                console.warn(`⚠️ Failed to refresh flashcards:`, error);
            }

            onExit({
                completed: true,
                isCorrect: isCorrect,
                rightOptionCard: {
                    ...rightOptionCard,
                    exerciseType: "reading-comprehension",
                },
                // ВИПРАВЛЕНО: Передаємо ID ВСІХ використаних слів (не тільки rightOptionCard)
                usedWordIds: allUsedWordIds,
                // ВИПРАВЛЕНО: Передаємо інформацію про всі слова для результатів
                allWordsData: usedWords.map((word) => ({
                    _id: word._id,
                    text: word.text,
                    exerciseType: "reading-comprehension",
                    isCorrect: isCorrect, // Всі слова мають однаковий результат
                })),
                // ДОДАНО: Передаємо ID використаних слів для наступного кроку
                newSessionUsedWordIds: [
                    ...sessionUsedWordIds,
                    ...allUsedWordIds,
                ],
            });
        } catch (error) {
            console.error("📖 Error processing exercise result:", error);

            // FALLBACK: У разі помилки все одно передаємо всі слова
            const fallbackWordIds = usedWords.map((word) => word._id);

            onExit({
                completed: true,
                isCorrect: isCorrect,
                rightOptionCard: {
                    ...rightOptionCard,
                    exerciseType: "reading-comprehension",
                },
                usedWordIds: fallbackWordIds,
                allWordsData: usedWords.map((word) => ({
                    _id: word._id,
                    text: word.text,
                    exerciseType: "reading-comprehension",
                    isCorrect: isCorrect,
                })),
                newSessionUsedWordIds: [
                    ...sessionUsedWordIds,
                    ...fallbackWordIds,
                ],
            });
        }
    }, [
        combinedProcessing,
        isCorrect,
        rightOptionCard,
        onExit,
        readingData,
        usedWords,
        sessionUsedWordIds,
        getFlashcards,
    ]);

    // Функція restart
    const handleRestartExercise = useCallback(() => {
        if (combinedProcessing) {
            console.log("📖 Cannot restart: processing in progress");
            return;
        }

        console.log("📖 Restarting reading comprehension exercise");

        if (onRestart && typeof onRestart === "function") {
            onRestart();
        }
    }, [combinedProcessing, onRestart]);

    // Функція оновлення картки
    const handleCardUpdate = useCallback((wordIndex, newCard) => {
        setUpdatedCards((prev) => ({
            ...prev,
            [wordIndex]: newCard,
        }));
    }, []);

    // Перевірка доступності карток
    if (!optionCards || optionCards.length < 3) {
        return (
            <ExerciseLayout
                icon={BookOpen}
                title="Розуміння прочитаного"
                description="Прочитайте текст та оберіть правильний факт"
                gradientClasses="from-emerald-400 to-teal-400"
                onExit={onExit}
                progress={progress}
                onRestart={handleRestartExercise}
                onContinue={handleContinue}
                isLastQuestion={isLastQuestion}
                showResult={showResult}
                isProcessing={combinedProcessing}
            >
                <div className="bg-white rounded-2xl shadow-md p-8">
                    <div className="text-center py-12">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
                            <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                                Недостатньо слів
                            </h3>
                            <p className="text-yellow-700">
                                Для цієї вправи потрібно мінімум 3 слова.
                            </p>
                        </div>
                        <button
                            onClick={() => onExit({ completed: false })}
                            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
                        >
                            Повернутися
                        </button>
                    </div>
                </div>
            </ExerciseLayout>
        );
    }

    return (
        <ExerciseLayout
            icon={BookOpen}
            title="Розуміння прочитаного"
            description="Прочитайте текст та оберіть правильний факт"
            gradientClasses="from-emerald-400 to-teal-400"
            onExit={onExit}
            progress={progress}
            onRestart={handleRestartExercise}
            onContinue={handleContinue}
            isLastQuestion={isLastQuestion}
            showResult={showResult}
            isProcessing={combinedProcessing}
        >
            {/* Question Content */}
            <div className="bg-white rounded-2xl shadow-md p-8 pb-10">
                {/* Відображення помилки */}
                {hasError ? (
                    <div className="text-center py-12">
                        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-red-800 mb-4">
                            Помилка генерації тексту
                        </h3>
                        <p className="text-red-600 mb-6 max-w-md mx-auto">
                            {errorMessage}
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            {canRetry && (
                                <button
                                    onClick={handleRetry}
                                    disabled={isGenerating}
                                    className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center justify-center"
                                >
                                    {isGenerating ? (
                                        <>
                                            <Loader className="w-5 h-5 mr-2 animate-spin" />
                                            Генерую...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw className="w-5 h-5 mr-2" />
                                            Спробувати ще раз
                                        </>
                                    )}
                                </button>
                            )}

                            <button
                                onClick={() => onExit({ completed: false })}
                                className="bg-gray-500 hover:bg-gray-600 text-white py-3 px-6 rounded-lg font-medium transition-colors"
                            >
                                Повернутися
                            </button>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="text-center py-12">
                        <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-600" />
                        <p className="text-gray-600">
                            {isGenerating
                                ? "Генерую текст для читання..."
                                : "Завантаження..."}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Text Type and Instructions */}
                        <div className="text-center mb-6">
                            <div className="flex items-center justify-center mb-4">
                                <FileText className="w-6 h-6 text-emerald-600 mr-2" />
                                <span className="text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                                    {textTypeNames[readingData?.textType] ||
                                        "Текст"}
                                </span>
                            </div>
                            <h2 className="text-lg font-medium text-gray-700 mb-2 border-b border-emerald-400 mx-30 pb-1">
                                Прочитайте текст уважно та оберіть правильний
                                факт
                            </h2>
                        </div>

                        {/* Reading Text */}
                        <div className="bg-white rounded-xl p-6 mb-8 border-l-4 border-emerald-400">
                            <div className="text-lg leading-relaxed text-gray-800">
                                <div
                                    dangerouslySetInnerHTML={{
                                        __html: processTextContent(
                                            readingData?.text,
                                            readingData?.usedWords
                                        ),
                                    }}
                                />
                            </div>
                        </div>

                        {/* Answer Options */}
                        <div className="space-y-4 max-w-4xl mx-auto">
                            {readingData?.facts.map((fact, index) => {
                                let buttonClass =
                                    "w-full p-6 text-left rounded-xl border-2 transition-all duration-200 font-medium text-base ";

                                if (selectedAnswer === null) {
                                    buttonClass += combinedProcessing
                                        ? "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
                                        : "border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-700 hover:shadow-lg cursor-pointer";
                                } else if (
                                    index === readingData.correctOption
                                ) {
                                    buttonClass +=
                                        "border-green-500 bg-green-50 text-green-700 shadow-lg";
                                } else if (index === selectedAnswer) {
                                    buttonClass +=
                                        "border-red-500 bg-red-50 text-red-700 shadow-lg";
                                } else {
                                    buttonClass +=
                                        "border-gray-200 bg-gray-50 text-gray-500";
                                }

                                return (
                                    <button
                                        key={index}
                                        onClick={() =>
                                            handleAnswerSelect(index)
                                        }
                                        disabled={
                                            selectedAnswer !== null ||
                                            combinedProcessing
                                        }
                                        className={buttonClass}
                                    >
                                        <div className="flex items-center">
                                            <div className="bg-teal-100 text-teal-600 w-8 h-8 rounded-full flex items-center justify-center font-bold mr-4 flex-shrink-0">
                                                {String.fromCharCode(
                                                    65 + index
                                                )}
                                            </div>
                                            <span className="flex-1">
                                                {fact}
                                            </span>
                                            {selectedAnswer !== null && (
                                                <span className="ml-3">
                                                    {index ===
                                                    readingData.correctOption ? (
                                                        <CheckCircle className="w-6 h-6 text-green-600" />
                                                    ) : index ===
                                                      selectedAnswer ? (
                                                        <XCircle className="w-6 h-6 text-red-600" />
                                                    ) : null}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* ВИПРАВЛЕНО: Таби з деталями всіх 3 слів з передачею isCorrect */}
            {showResult && usedWords.length > 0 && (
                <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-6">
                    {/* Таби для слів */}
                    <div className="border-b border-gray-200">
                        <div className="flex">
                            {usedWords.map((word, index) => (
                                <button
                                    key={word._id}
                                    onClick={() => setActiveWordTab(index)}
                                    className={`px-6 py-4 font-medium text-sm border-b-2 transition-colors ${
                                        activeWordTab === index
                                            ? "border-emerald-500 text-emerald-600 bg-emerald-50"
                                            : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                    }`}
                                >
                                    {word.text}
                                    <span className="ml-2 text-xs opacity-60">
                                        ({index + 1})
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Контент активного табу - ОНОВЛЕНО: передаємо isCorrect */}
                    {usedWords[activeWordTab] && (
                        <DetailedCardInfo
                            displayCard={
                                updatedCards[activeWordTab] ||
                                usedWords[activeWordTab]
                            }
                            onCardUpdate={(newCard) =>
                                handleCardUpdate(activeWordTab, newCard)
                            }
                            isCorrect={isCorrect} // ДОДАНО: передача результату для керування станом згортання
                        />
                    )}
                </div>
            )}
        </ExerciseLayout>
    );
};

export default ReadingComprehensionExercise;
