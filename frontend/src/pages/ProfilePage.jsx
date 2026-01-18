import { useState, useEffect } from "react";
import {
    User,
    Edit3,
    TrendingUp,
    BarChart3,
    BookOpen,
    Folder,
    Trophy,
    Activity,
    CheckCircle2,
    RotateCcw,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore.js";
import { useFlashcardStore } from "../store/useFlashcardStore.js";
import { useCategoryStore } from "../store/useCategoryStore.js";
import { useUserSettingsStore } from "../store/useUserSettingsStore.js";
import ProfileEditModal from "../components/ProfileEditModal.jsx";
import toast from "react-hot-toast";

const ProfilePage = () => {
    const { authUser, updateProfile, isUpdatingProfile } = useAuthStore();
    const { flashcards, getFlashcards, getLearningStats, learningStats } = useFlashcardStore();
    const { categories, getCategories } = useCategoryStore();
    const { settings, loadSettings } = useUserSettingsStore();

    // Modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [statsLoading, setStatsLoading] = useState(true);
    const [stats, setStats] = useState(null);

    // Load data on component mount
    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        setStatsLoading(true);
        try {
            // Завантажуємо дані послідовно з обробкою помилок
            const promises = [];

            // Завантажуємо flashcards
            promises.push(
                getFlashcards().catch((error) => {
                    if (error.name !== "AbortError" && error.name !== "CanceledError") {
                        console.error("Error loading flashcards:", error);
                        throw error;
                    }
                    return []; // Повертаємо порожній масив якщо запит скасовано
                })
            );

            // Завантажуємо categories
            promises.push(
                getCategories().catch((error) => {
                    if (error.name !== "AbortError" && error.name !== "CanceledError") {
                        console.error("Error loading categories:", error);
                        throw error;
                    }
                    return []; // Повертаємо порожній масив якщо запит скасовано
                })
            );

            // Завантажуємо learning stats
            promises.push(
                getLearningStats().catch((error) => {
                    if (error.name !== "AbortError" && error.name !== "CanceledError") {
                        console.error("Error loading learning stats:", error);
                        throw error;
                    }
                    return null;
                })
            );

            // Завантажуємо settings (опціонально)
            promises.push(
                loadSettings().catch((error) => {
                    if (error.name !== "AbortError" && error.name !== "CanceledError") {
                        console.error("Error loading settings:", error);
                        // Не кидаємо помилку для settings, бо вони не критичні для профілю
                    }
                    return null;
                })
            );

            const results = await Promise.allSettled(promises); // Використовуємо allSettled замість all
        } catch (error) {
            if (error.name !== "AbortError" && error.name !== "CanceledError") {
                console.error("Error loading profile data:", error);
                toast.error("Помилка завантаження даних профілю");
            }
        } finally {
            setStatsLoading(false);
        }
    };

    // Calculate statistics whenever data changes
    useEffect(() => {
        if (flashcards && categories && learningStats && !statsLoading) {
            calculateStats();
        }
    }, [flashcards, categories, learningStats, statsLoading]);

    const calculateStats = () => {
        // Перевірка на існування даних
        if (!flashcards || !categories || !learningStats) {
            console.log("Missing data for stats calculation");
            return;
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        // Basic counts
        const totalCards = flashcards.length;
        const totalCategories = categories.length;
        const aiGeneratedCards = flashcards.filter((card) => card.isAIGenerated).length;
        const manualCards = totalCards - aiGeneratedCards;

        // Time-based stats
        const cardsThisMonth = flashcards.filter(
            (card) => new Date(card.createdAt) >= startOfMonth
        ).length;

        const cardsThisYear = flashcards.filter(
            (card) => new Date(card.createdAt) >= startOfYear
        ).length;

        // Weekly activity starting from Monday
        const today = new Date();
        const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, ...
        const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1; // Convert Sunday to 6, others to day-1

        const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(today);
            date.setDate(date.getDate() - daysFromMonday + i); // Start from Monday

            const dayCards = flashcards.filter((card) => {
                const cardDate = new Date(card.createdAt);
                return cardDate.toDateString() === date.toDateString();
            }).length;

            const isToday = date.toDateString() === today.toDateString();

            return {
                day: date.toLocaleDateString("uk-UA", { weekday: "short" }),
                date: date.toLocaleDateString("uk-UA", {
                    day: "numeric",
                    month: "short",
                }),
                count: dayCards,
                isToday: isToday,
            };
        });

        const cardsThisWeek = weeklyActivity.reduce((sum, day) => sum + day.count, 0);

        // Category distribution
        const categoryStats = categories
            .map((category) => {
                const cardsInCategory = flashcards.filter(
                    (card) => card.categoryId?._id === category._id
                ).length;
                return {
                    id: category._id,
                    name: category.name,
                    color: category.color,
                    count: cardsInCategory,
                    percentage: totalCards > 0 ? (cardsInCategory / totalCards) * 100 : 0,
                };
            })
            .sort((a, b) => b.count - a.count);

        // Uncategorized cards
        const uncategorizedCount = flashcards.filter((card) => !card.categoryId).length;
        if (uncategorizedCount > 0) {
            categoryStats.push({
                id: "uncategorized",
                name: "Без папки",
                color: "#6B7280",
                count: uncategorizedCount,
                percentage: totalCards > 0 ? (uncategorizedCount / totalCards) * 100 : 0,
            });
        }

        // ОНОВЛЕНО: Використовуємо learningStats замість обчислення mistake words
        const learningProgress = {
            totalLearning: learningStats.learning || 0,
            totalReview: learningStats.review || 0,
            exerciseStats: learningStats.exercises || {
                sentenceCompletion: 0,
                multipleChoice: 0,
                listenAndFill: 0,
            },
        };

        setStats({
            totalCards,
            totalCategories,
            aiGeneratedCards,
            manualCards,
            cardsThisWeek,
            cardsThisMonth,
            cardsThisYear,
            categoryStats: categoryStats.slice(0, 5), // Top 5 categories
            weeklyActivity,
            learningProgress, // ОНОВЛЕНО: Нова структура
        });
    };

    // Open edit modal
    const handleEdit = () => {
        setShowEditModal(true);
    };

    // Handle profile update from modal
    const handleProfileUpdate = async (formData) => {
        try {
            console.log("Updating profile with data:", formData);
            await updateProfile(formData);
            setShowEditModal(false);
        } catch (error) {
            console.error("Profile update error:", error);
            // Error is handled in the store and modal
            throw error; // Re-throw so modal can handle it
        }
    };

    // Close edit modal
    const handleCloseModal = () => {
        setShowEditModal(false);
    };

    if (!authUser) {
        return (
            <div className="ml-64 min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-center">
                    <User className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                    <p className="text-gray-600">Завантаження профілю...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="ml-64 min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
            {/* Header */}
            <div className="bg-white border-b border-gray-200">
                <div className="p-8">
                    <div className="max-w-7xl mx-auto flex items-center">
                        <div className="bg-gradient-to-r from-orange-600 to-red-600 w-10 h-10 rounded-lg flex items-center justify-center mr-3 shadow-md">
                            <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Профіль</h1>
                            <p className="text-gray-600">Ваша статистика та налаштування профілю</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-8">
                <div className="max-w-7xl mx-auto space-y-8">
                    {/* Profile Card - Clean Design */}
                    <div className="bg-white rounded-xl shadow-md p-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                {/* Profile Picture */}
                                <div className="w-20 h-20 rounded-full bg-gradient-to-r from-orange-100 to-red-100 overflow-hidden">
                                    {authUser.profilePic ? (
                                        <img
                                            src={authUser.profilePic}
                                            alt="Profile"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User className="w-10 h-10 text-orange-400" />
                                        </div>
                                    )}
                                </div>

                                {/* Profile Info */}
                                <div>
                                    <h2 className="text-2xl font-semibold text-gray-900">
                                        {authUser.fullName}
                                    </h2>
                                    <p className="text-gray-600 text-sm mt-1">{authUser.email}</p>
                                    <p className="text-gray-500 text-xs mt-1">
                                        З нами з{" "}
                                        {new Date(
                                            authUser.createdAt || Date.now()
                                        ).toLocaleDateString("uk-UA")}
                                    </p>
                                </div>
                            </div>

                            {/* Edit Button */}
                            <div>
                                <button
                                    onClick={handleEdit}
                                    disabled={isUpdatingProfile}
                                    className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-70 text-white px-6 py-3 rounded-xl text-sm flex items-center space-x-2 transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed"
                                >
                                    <Edit3 className="w-4 h-4" />
                                    <span>
                                        {isUpdatingProfile ? "Збереження..." : "Редагувати"}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {statsLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-4 text-gray-600">Завантаження статистики...</p>
                        </div>
                    ) : stats ? (
                        <>
                            {/* ОНОВЛЕНО: Quick Stats з новою логікою - 2 ряди по 3 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* ОНОВЛЕНО: Статистика слів що вивчаються */}
                                <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">
                                                Вивчається карток
                                            </p>
                                            <p className="text-3xl font-bold text-orange-600">
                                                {stats.learningProgress.totalLearning}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg shadow-md">
                                            <RotateCcw className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">Активно вивчаються</p>
                                </div>

                                <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">
                                                Всього карток
                                            </p>
                                            <p className="text-3xl font-bold text-blue-600">
                                                {stats.totalCards}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-md">
                                            <BookOpen className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        +{stats.cardsThisMonth} цього місяця
                                    </p>
                                </div>

                                <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">
                                                Папок
                                            </p>
                                            <p className="text-3xl font-bold text-emerald-600">
                                                {stats.totalCategories}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-lg shadow-md">
                                            <Folder className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Організація матеріалів
                                    </p>
                                </div>

                                {/* ОНОВЛЕНО: Статистика вивчених слів */}
                                <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">
                                                Вивчено слів
                                            </p>
                                            <p className="text-3xl font-bold text-green-600">
                                                {stats.learningProgress.totalReview}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-md">
                                            <CheckCircle2 className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">Статус: review</p>
                                </div>

                                <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">
                                                Макс. карток за тиждень
                                            </p>
                                        </div>
                                        <div className="p-3 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg shadow-md">
                                            <Trophy className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Найпродуктивніший тиждень
                                    </p>
                                </div>

                                <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">
                                                Карток цього тижня
                                            </p>
                                            <p className="text-3xl font-bold text-indigo-600">
                                                {stats.cardsThisWeek}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-lg shadow-md">
                                            <TrendingUp className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">Поточна активність</p>
                                </div>
                            </div>

                            {/* Charts and detailed stats */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Weekly Activity */}
                                <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-center space-x-3 mb-6">
                                        <Activity className="w-5 h-5 text-blue-600" />
                                        <h3 className="text-lg font-semibold text-gray-900">
                                            Активність за тиждень
                                        </h3>
                                    </div>
                                    <div className="space-y-4">
                                        {stats.weeklyActivity.map((day, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center space-x-3"
                                            >
                                                <div
                                                    className={`w-12 text-sm text-right font-medium ${
                                                        day.isToday
                                                            ? "text-blue-600 bg-blue-50 px-2 py-1 rounded-md"
                                                            : "text-gray-600"
                                                    }`}
                                                >
                                                    {day.day}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="bg-gray-200 rounded-full h-3 relative overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                day.isToday
                                                                    ? "bg-gradient-to-r from-blue-500 to-blue-600 shadow-md"
                                                                    : "bg-blue-500"
                                                            }`}
                                                            style={{
                                                                width: `${Math.max(5, (day.count / Math.max(...stats.weeklyActivity.map((d) => d.count), 1)) * 100)}%`,
                                                            }}
                                                        ></div>
                                                    </div>
                                                </div>
                                                <div
                                                    className={`w-8 text-sm font-medium text-right ${
                                                        day.isToday
                                                            ? "text-blue-600"
                                                            : "text-gray-700"
                                                    }`}
                                                >
                                                    {day.count}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Category Distribution */}
                                <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-center space-x-3 mb-6">
                                        <BarChart3 className="w-5 h-5 text-emerald-600" />
                                        <h3 className="text-lg font-semibold text-gray-900">
                                            Топ категорії
                                        </h3>
                                    </div>
                                    <div className="space-y-4">
                                        {stats.categoryStats.slice(0, 5).map((category, index) => (
                                            <div
                                                key={category.id}
                                                className="flex items-center space-x-3"
                                            >
                                                <div className="flex items-center space-x-2 flex-1">
                                                    <div
                                                        className="w-4 h-4 rounded"
                                                        style={{
                                                            backgroundColor: category.color,
                                                        }}
                                                    ></div>
                                                    <span className="text-sm font-medium text-gray-700 truncate">
                                                        {category.name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-24 bg-gray-200 rounded-full h-2">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                backgroundColor: category.color,
                                                                width: `${Math.max(5, category.percentage)}%`,
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-600 w-8 text-right">
                                                        {category.count}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12">
                            <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-xl font-medium text-gray-900 mb-2">
                                Ще немає даних
                            </h3>
                            <p className="text-gray-600">
                                Створіть свої перші флешкартки, щоб побачити статистику
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Profile Edit Modal */}
            <ProfileEditModal
                isOpen={showEditModal}
                onClose={handleCloseModal}
                onSave={handleProfileUpdate}
                initialData={authUser}
                isLoading={isUpdatingProfile}
            />
        </div>
    );
};

export default ProfilePage;
