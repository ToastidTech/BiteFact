const AI_API_URL =
    "https://m180adcme9.execute-api.us-west-2.amazonaws.com/bitefact-ai-analyze";

const trialStart = localStorage.getItem("bitefact_trial");

if (!trialStart) {
    localStorage.setItem("bitefact_trial", Date.now());
}

let user = {
    plan: "free",
    trial: true,
    trialDays: 3,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
};

function saveUser() {
    localStorage.setItem("bitefact_user", JSON.stringify(user));
}

function loadUser() {
    const savedUser = localStorage.getItem("bitefact_user");

    if (savedUser) {
        try {
            const parsed = JSON.parse(savedUser);

            user = {
                ...user,
                ...parsed,
                calories: Number(parsed.calories) || 0,
                protein: Number(parsed.protein) || 0,
                carbs: Number(parsed.carbs) || 0,
                fat: Number(parsed.fat) || 0
            };
        } catch (error) {
            console.warn("Could not load saved user state:", error);
        }
    }
}

async function analyzeMealWithAI(meal) {
    const coachMessage = document.getElementById("coachMessage");

    coachMessage.innerHTML = "🤖 BiteFact AI is analyzing your meal...";

    try {
        const response = await fetch(AI_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                food: meal.food,
                calories: meal.calories,
                protein: meal.protein,
                carbs: meal.carbs,
                fat: meal.fat
            })
        });

        if (!response.ok) {
            throw new Error(`AI API returned ${response.status}`);
        }

        const data = await response.json();

        let result = data;

        if (typeof data.body === "string") {
            try {
                result = JSON.parse(data.body);
            } catch {
                result = data.body;
            }
        }

        const insight =
            result.message ||
            result.insight ||
            result.analysis ||
            result.response ||
            result.text ||
            result.body ||
            "Meal analyzed successfully.";

        coachMessage.innerHTML = `🤖 ${insight}`;

    } catch (error) {
        console.error("BiteFact AI error:", error);

        coachMessage.innerHTML =
            "🤖 Meal logged successfully. AI Coach is temporarily unavailable.";
    }
}

async function addMeal() {
    const food = document.getElementById("foodName").value.trim();
    const calories =
        Number(document.getElementById("foodCalories").value) || 0;
    const protein =
        Number(document.getElementById("foodProtein").value) || 0;
    const carbs =
        Number(document.getElementById("foodCarbs").value) || 0;
    const fat =
        Number(document.getElementById("foodFat").value) || 0;

    if (!food) {
        alert("Please enter a food item.");
        return;
    }

    user.calories += calories;
    user.protein += protein;
    user.carbs += carbs;
    user.fat += fat;

    saveUser();
    updateDashboard();

    const meal = {
        food,
        calories,
        protein,
        carbs,
        fat
    };

    document.getElementById("foodName").value = "";
    document.getElementById("foodCalories").value = "";
    document.getElementById("foodProtein").value = "";
    document.getElementById("foodCarbs").value = "";
    document.getElementById("foodFat").value = "";

    await analyzeMealWithAI(meal);
}

function selectPlan(plan) {
    user.plan = plan;
    saveUser();

    if (plan === "ai") {
        alert("AI Coach activated!");

        document.getElementById("coachMessage").innerHTML =
            "🤖 AI Coach is active. Let’s tighten the macros and keep the momentum.";
    } else if (plan === "plus") {
        alert("Plus plan selected.");

        document.getElementById("coachMessage").innerHTML =
            "Plus plan selected. Solid move.";
    } else {
        alert("Free plan selected.");

        document.getElementById("coachMessage").innerHTML =
            "Free plan selected. Still tracking, still winning.";
    }
}

function openCameraGuide() {
    document.getElementById("cameraNote").innerHTML =
        "Camera mode concept: point at the plate, estimate portions, then verify the numbers before saving. Estimates only, never exact.";

    alert(
        "Camera usage will guide users to estimate portions, then confirm before logging."
    );
}

function updateDashboard() {
    document.getElementById("calories").innerHTML =
        `${user.calories} / 2200`;

    document.getElementById("protein").innerHTML =
        `${user.protein}g / 160g`;

    document.getElementById("carbs").innerHTML =
        `${user.carbs}g / 220g`;

    document.getElementById("fat").innerHTML =
        `${user.fat}g / 70g`;

    const trialDate = new Date(Number(trialStart));
    const now = new Date();

    const trialEnd = new Date(
        trialDate.getTime() + 3 * 24 * 60 * 60 * 1000
    );

    const remainingMs = trialEnd - now;

    if (remainingMs > 0) {
        const daysLeft = Math.ceil(
            remainingMs / (24 * 60 * 60 * 1000)
        );

        document.getElementById("trialStatus").innerHTML =
            `${daysLeft}-Day AI Coach Trial Active`;
    } else {
        document.getElementById("trialStatus").innerHTML =
            "Trial ended. Upgrade to continue using AI Coach.";
    }
}

loadUser();
updateDashboard();
