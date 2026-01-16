// frontend/src/components/exercises/DialogExercise.jsx - ВИПРАВЛЕНА ВЕРСІЯ З МИТТЄВИМ ОНОВЛЕННЯМ ПРОГРЕСУ

import { useState, useEffect, useCallback } from "react";
import { useFlashcardStore } from "../../store/useFlashcardStore.js";
import { useUserSettingsStore } from "../../store/useUserSettingsStore.js";
import ExerciseLayout from "../shared/ExerciseLayout.jsx";
import DetailedCardInfo from "../shared/DetailedCardInfo.jsx";
import {
    MessageCircle,
    Loader,
    Users,
    CheckCircle,
    ChevronRight,
    BookOpen,
    Sparkles,
    Eye,
    ArrowRight,
    RefreshCw,
    AlertCircle,
} from "lucide-react";

const DialogExercise = ({
    rightOptionCard,
    optionCards,
    onExit,
    progress = null,
    isLastQuestion = false,
    onRestart,
    isProcessing = false,
    onProgressUpdate = null, // ДОДАНО: Callback для оновлення прогресу
}) => {
    const { generateInteractiveDialog } = useFlashcardStore();
    const { getDefaultEnglishLevel } = useUserSettingsStore();

    // Основні стейти
    const [dialogData, setDialogData] = useState(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedChoices, setSelectedChoices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showResult, setShowResult] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [canRetry, setCanRetry] = useState(true);
    const [internalProcessing, setInternalProcessing] = useState(false);

    // Додаткові стейти для табів з 3 словами
    const [activeWordTab, setActiveWordTab] = useState(0);
    const [usedWords, setUsedWords] = useState([]);
    const [updatedCards, setUpdatedCards] = useState({});

    const combinedProcessing = isProcessing || internalProcessing;
    const englishLevel = getDefaultEnglishLevel();

    // Функція для reset стану
    const resetExerciseState = useCallback(() => {
        console.log(`💬 Resetting dialog exercise state`);

        setDialogData(null);
        setCurrentStep(0);
        setSelectedChoices([]);
        setIsLoading(true);
        setIsGenerating(false);
        setShowResult(false);
        setHasError(false);
        setErrorMessage("");
        setCanRetry(true);
        setInternalProcessing(false);
        setActiveWordTab(0);
        setUsedWords([]);
        setUpdatedCards({});
    }, []);

    // Генерація інтерактивного діалогу
    const generateDialogExercise = useCallback(async () => {
        if (!optionCards || optionCards.length < 3) {
            console.error("💬 Not enough cards for dialog");
            setHasError(true);
            setErrorMessage("Потрібно мінімум 3 картки для генерації діалогу");
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
            // Беремо rightOptionCard як основу і додаємо ще 2 картки
            let selectedCards = [];

            if (rightOptionCard) {
                selectedCards.push(rightOptionCard);

                // Додаємо ще 2 рандомні картки (різні від rightOptionCard)
                const otherCards = optionCards.filter(
                    (card) => card._id !== rightOptionCard._id
                );
                const shuffledOthers = otherCards.sort(
                    () => Math.random() - 0.5
                );
                selectedCards.push(...shuffledOthers.slice(0, 2));
            } else {
                // Fallback: беремо перші 3 картки або рандомно вибираємо 3
                const shuffledCards = [...optionCards].sort(
                    () => Math.random() - 0.5
                );
                selectedCards = shuffledCards.slice(0, 3);
            }

            const wordsArray = selectedCards.map((card) => card.text);

            console.log(`💬 Generating dialog with words:`, wordsArray);

            const result = await generateInteractiveDialog(
                wordsArray,
                englishLevel
            );

            if (
                !result ||
                !result.title ||
                !result.steps ||
                !Array.isArray(result.steps)
            ) {
                throw new Error("ШІ повернула некоректні дані для діалогу");
            }

            if (result.steps.length < 2) {
                throw new Error("Діалог повинен мати мінімум 2 кроки");
            }

            // Валідація кожного кроку
            result.steps.forEach((step, index) => {
                if (
                    !step.text ||
                    !step.choices ||
                    !Array.isArray(step.choices)
                ) {
                    throw new Error(
                        `Крок ${index + 1} має некоректну структуру`
                    );
                }
                if (step.choices.length < 2) {
                    throw new Error(
                        `Крок ${index + 1} повинен мати мінімум 2 варіанти вибору`
                    );
                }
            });

            console.log(
                `💬 Dialog generated successfully with ${result.steps.length} steps`
            );

            setUsedWords(selectedCards);
            setDialogData(result);
        } catch (error) {
            console.error("💬 Error generating dialog:", error);

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
                setErrorMessage("Помилка генерації діалогу. Спробуйте ще раз.");
            }

            setCanRetry(true);
            setDialogData(null);
        } finally {
            setIsLoading(false);
            setIsGenerating(false);
        }
    }, [generateInteractiveDialog, englishLevel, optionCards, rightOptionCard]);

    // Ефект для ініціалізації
    useEffect(() => {
        console.log("💬 DialogExercise effect triggered");

        if (rightOptionCard && optionCards && optionCards.length >= 3) {
            console.log(
                `💬 Dialog initialized with rightOptionCard: ${rightOptionCard.text}`
            );
            resetExerciseState();

            const timer = setTimeout(() => {
                generateDialogExercise();
            }, 100);

            return () => {
                clearTimeout(timer);
            };
        } else {
            console.log("💬 Insufficient data for dialog");
        }
    }, [rightOptionCard?._id, resetExerciseState, generateDialogExercise]);

    // Функція для повторної спроби
    const handleRetry = useCallback(() => {
        if (!canRetry) return;

        console.log("💬 Retrying dialog generation");
        resetExerciseState();

        const timer = setTimeout(() => {
            generateDialogExercise();
        }, 100);

        return () => clearTimeout(timer);
    }, [canRetry, resetExerciseState, generateDialogExercise]);

    // Функція вибору варіанту в діалозі
    const handleChoiceSelect = (choiceIndex) => {
        if (combinedProcessing) return;

        const newChoices = [...selectedChoices, choiceIndex];
        setSelectedChoices(newChoices);

        console.log(
            `💬 Choice selected for step ${currentStep}: ${choiceIndex}`
        );

        // ДОДАНО: Миттєве оновлення прогресу при виборі варіанту
        if (onProgressUpdate && progress) {
            const updatedProgress = {
                ...progress,
                correct: progress.correct + 1, // У діалозі всі варіанти "правильні"
                currentAnswered: currentStep + 1, // Відповіли на поточний крок
            };
            onProgressUpdate(updatedProgress);
        }

        // Переходимо до наступного кроку або завершуємо
        if (currentStep < dialogData.steps.length - 1) {
            setTimeout(() => {
                setCurrentStep((prev) => prev + 1);
            }, 1000);
        } else {
            // Діалог завершено
            setTimeout(() => {
                setShowResult(true);
            }, 1000);
        }
    };

    // Функція завершення діалогу
    const handleContinue = useCallback(async () => {
        if (combinedProcessing || !dialogData) {
            console.log(
                "💬 Cannot continue: processing in progress or missing data"
            );
            return;
        }

        console.log("💬 Dialog completing successfully");
        setInternalProcessing(true);

        try {
            // Передаємо всі використані слова
            const allUsedWordIds = usedWords.map((word) => word._id);

            console.log(
                `💬 Передаємо ${allUsedWordIds.length} слів до backend:`,
                usedWords.map((w) => w.text)
            );

            onExit({
                completed: true,
                isCorrect: true, // Діалог завжди "правильний"
                rightOptionCard: {
                    ...rightOptionCard,
                    exerciseType: "dialog",
                },
                usedWordIds: allUsedWordIds,
                allWordsData: usedWords.map((word) => ({
                    _id: word._id,
                    text: word.text,
                    exerciseType: "dialog",
                    isCorrect: true, // Діалог завжди успішний
                })),
            });
        } catch (error) {
            console.error("💬 Error processing dialog result:", error);

            // FALLBACK
            const fallbackWordIds = usedWords.map((word) => word._id);

            onExit({
                completed: true,
                isCorrect: true,
                rightOptionCard: {
                    ...rightOptionCard,
                    exerciseType: "dialog",
                },
                usedWordIds: fallbackWordIds,
                allWordsData: usedWords.map((word) => ({
                    _id: word._id,
                    text: word.text,
                    exerciseType: "dialog",
                    isCorrect: true,
                })),
            });
        }
    }, [combinedProcessing, rightOptionCard, onExit, dialogData, usedWords]);

    // Функція restart
    const handleRestartExercise = useCallback(() => {
        if (combinedProcessing) {
            console.log("💬 Cannot restart: processing in progress");
            return;
        }

        console.log("💬 Restarting dialog exercise");

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
                icon={MessageCircle}
                title="Інтерактивний діалог"
                description="Створіть свій шлях у розмові"
                gradientClasses="from-indigo-400 to-purple-500"
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
            icon={MessageCircle}
            title="Інтерактивний діалог"
            description="Створіть свій шлях у розмові та покращте читання"
            gradientClasses="from-indigo-400 to-purple-500"
            onExit={onExit}
            progress={progress}
            onRestart={handleRestartExercise}
            onContinue={handleContinue}
            isLastQuestion={isLastQuestion}
            showResult={showResult}
            isProcessing={combinedProcessing}
        >
            {/* Main Content */}
            <div className="bg-white rounded-2xl shadow-md p-8 pb-10">
                {/* Відображення помилки */}
                {hasError ? (
                    <div className="text-center py-12">
                        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-red-800 mb-4">
                            Помилка генерації діалогу
                        </h3>
                        <p className="text-red-600 mb-6 max-w-md mx-auto">
                            {errorMessage}
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            {canRetry && (
                                <button
                                    onClick={handleRetry}
                                    disabled={isGenerating}
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center justify-center"
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
                        <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-indigo-600" />
                        <p className="text-gray-600">
                            {isGenerating
                                ? "Генерую інтерактивний діалог..."
                                : "Завантаження..."}
                        </p>
                    </div>
                ) : showResult ? (
                    /* Results Screen */
                    <div className="text-center py-12">
                        <div className="mb-8">
                            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">
                                Діалог завершено!
                            </h2>
                            <p className="text-gray-600 mb-6 max-w-md mx-auto">
                                Чудово! Ви успішно пройшли інтерактивний діалог
                                і покращили навички читання та розуміння
                                контексту.
                            </p>
                        </div>

                        {/* Summary */}
                        <div className="bg-indigo-50 rounded-xl p-6 mb-8 max-w-md mx-auto">
                            <h3 className="text-lg font-semibold text-indigo-800 mb-4">
                                Ваш результат
                            </h3>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-indigo-600">
                                        {dialogData?.steps?.length || 0}
                                    </div>
                                    <div className="text-gray-600">Кроків</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-indigo-600">
                                        3
                                    </div>
                                    <div className="text-gray-600">Слів</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-indigo-600">
                                        100%
                                    </div>
                                    <div className="text-gray-600">
                                        Завершено
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Dialog Summary */}
                        {dialogData && (
                            <div className="bg-white border border-indigo-200 rounded-xl p-6 text-left max-w-2xl mx-auto">
                                <h4 className="text-lg font-semibold text-indigo-800 mb-4 text-center">
                                    "{dialogData.title}"
                                </h4>
                                <div className="space-y-3">
                                    {dialogData.steps.map((step, index) => (
                                        <div
                                            key={index}
                                            className="flex items-start"
                                        >
                                            <div className="bg-indigo-100 text-indigo-600 w-6 h-6 rounded-full flex items-center justify-center font-bold mr-3 mt-0.5 flex-shrink-0 text-sm">
                                                {index + 1}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-gray-800 mb-1">
                                                    {step.text}
                                                </p>
                                                {selectedChoices[index] !==
                                                    undefined && (
                                                    <p className="text-indigo-600 text-sm font-medium">
                                                        ➤{" "}
                                                        {
                                                            step.choices[
                                                                selectedChoices[
                                                                    index
                                                                ]
                                                            ]
                                                        }
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Dialog Steps */
                    <div>
                        {/* Progress Indicator */}
                        <div className="flex justify-center mb-8">
                            <div className="flex items-center space-x-2">
                                {dialogData?.steps?.map((_, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center"
                                    >
                                        <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                                index < currentStep
                                                    ? "bg-green-500 text-white"
                                                    : index === currentStep
                                                      ? "bg-indigo-500 text-white"
                                                      : "bg-gray-200 text-gray-500"
                                            }`}
                                        >
                                            {index + 1}
                                        </div>
                                        {index <
                                            dialogData.steps.length - 1 && (
                                            <div
                                                className={`w-8 h-0.5 ${
                                                    index < currentStep
                                                        ? "bg-green-500"
                                                        : "bg-gray-200"
                                                }`}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Dialog Title */}
                        {dialogData?.title && (
                            <div className="text-center mb-8">
                                <h2 className="text-xl font-bold text-gray-900 mb-2">
                                    {dialogData.title}
                                </h2>
                                <p className="text-gray-600 text-sm">
                                    Крок {currentStep + 1} з{" "}
                                    {dialogData.steps.length}
                                </p>
                            </div>
                        )}

                        {/* Current Step */}
                        {dialogData?.steps && dialogData.steps[currentStep] && (
                            <div className="max-w-3xl mx-auto">
                                {/* Step Text */}
                                <div className="bg-indigo-50 rounded-xl p-6 mb-8 border-l-4 border-indigo-400">
                                    <div className="flex items-start">
                                        <Users className="w-6 h-6 text-indigo-500 mr-3 mt-1 flex-shrink-0" />
                                        <p className="text-lg text-gray-800 leading-relaxed">
                                            {dialogData.steps[currentStep].text}
                                        </p>
                                    </div>
                                </div>

                                {/* Choices */}
                                <div className="space-y-3">
                                    <h3 className="text-lg font-medium text-gray-700 mb-4 text-center">
                                        Оберіть вашу відповідь:
                                    </h3>
                                    {dialogData.steps[currentStep].choices.map(
                                        (choice, index) => (
                                            <button
                                                key={index}
                                                onClick={() =>
                                                    handleChoiceSelect(index)
                                                }
                                                disabled={combinedProcessing}
                                                className={`w-full p-4 text-left rounded-xl border-2 transition-all duration-200 font-medium ${
                                                    combinedProcessing
                                                        ? "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
                                                        : "border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 hover:shadow-lg cursor-pointer"
                                                }`}
                                            >
                                                <div className="flex items-center">
                                                    <div className="bg-indigo-100 text-indigo-600 w-6 h-6 rounded-full flex items-center justify-center font-bold mr-3 flex-shrink-0 text-sm">
                                                        {String.fromCharCode(
                                                            65 + index
                                                        )}
                                                    </div>
                                                    <span className="flex-1">
                                                        {choice}
                                                    </span>
                                                    <ChevronRight className="w-5 h-5 text-indigo-400" />
                                                </div>
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Words Info - показуємо тільки після завершення діалогу */}
            {showResult && usedWords.length > 0 && (
                <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-6">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            <BookOpen className="w-5 h-5 mr-2 text-indigo-600" />
                            Детальна інформація про слова у діалозі
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                            Переглядайте детальну інформацію про кожне слово
                        </p>
                    </div>

                    {/* Таби для слів */}
                    <div className="border-b border-gray-200">
                        <div className="flex">
                            {usedWords.map((word, index) => (
                                <button
                                    key={word._id}
                                    onClick={() => setActiveWordTab(index)}
                                    className={`px-6 py-4 font-medium text-sm border-b-2 transition-colors ${
                                        activeWordTab === index
                                            ? "border-indigo-500 text-indigo-600 bg-indigo-50"
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

                    {/* Контент активного табу */}
                    {usedWords[activeWordTab] && (
                        <DetailedCardInfo
                            displayCard={
                                updatedCards[activeWordTab] ||
                                usedWords[activeWordTab]
                            }
                            onCardUpdate={(newCard) =>
                                handleCardUpdate(activeWordTab, newCard)
                            }
                            isCorrect={true} // Діалог завжди "правильний"
                        />
                    )}
                </div>
            )}
        </ExerciseLayout>
    );
};

export default DialogExercise;
