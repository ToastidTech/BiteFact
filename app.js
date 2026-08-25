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

        console.log("BiteFact AI response:", data);

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

    if (plan === "ai") {
        user.trial = false;

        saveUser();

        alert("AI Coach activated!");

        document.getElementById("coachMessage").innerHTML =
            "🤖 AI Coach is active. Let’s tighten the macros and keep the momentum.";

    } else if (plan === "plus") {
        saveUser();

        alert("Plus plan selected.");

        document.getElementById("coachMessage").innerHTML =
            "Plus plan selected. Solid move.";

    } else {
        user.trial = true;

        saveUser();

        alert("Free plan selected.");

        document.getElementById("coachMessage").innerHTML =
            "Free plan selected. Still tracking, still winning.";
    }

    updateDashboard();
}


/* =========================
   CAMERA
   ========================= */

function openCameraGuide(event) {

    // Prevent the camera button from submitting a form
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    let cameraInput =
        document.getElementById("bitefactCameraInput");

    if (!cameraInput) {

        cameraInput = document.createElement("input");

        cameraInput.type = "file";
        cameraInput.id = "bitefactCameraInput";
        cameraInput.accept = "image/*";
        cameraInput.setAttribute("capture", "environment");

        cameraInput.style.display = "none";

        document.body.appendChild(cameraInput);

        cameraInput.addEventListener(
            "change",
            handleBiteFactCameraPhoto
        );
    }

    cameraInput.value = "";
    cameraInput.click();

    return false;
}


/* =========================
   CAMERA PHOTO HANDLER
   ========================= */

async function handleBiteFactCameraPhoto(event) {

    const cameraInput = event.target;

    if (!cameraInput.files || !cameraInput.files.length) {
        return;
    }

    const photo = cameraInput.files[0];

    const cameraNote =
        document.getElementById("cameraNote");

    if (cameraNote) {

        cameraNote.innerHTML = `
            <div class="bitefact-ai-result">
                <h3>🤖 BiteFact AI</h3>
                <p>Analyzing your food photo...</p>
            </div>
        `;
    }

    try {

        console.log("BiteFact camera photo:", photo);

        const imageBase64 =
            await fileToBase64(photo);

        console.log(
            "BiteFact image converted to Base64."
        );

        const response =
            await fetch(AI_API_URL, {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    image: imageBase64
                })
            });

        console.log(
            "BiteFact AI HTTP status:",
            response.status
        );

        if (!response.ok) {

            throw new Error(
                `AI API returned ${response.status}`
            );
        }

        const data =
            await response.json();

        console.log(
            "BiteFact AI raw response:",
            data
        );

        let result = data;


        /*
         * API Gateway / Lambda may return:
         *
         * {
         *   statusCode: 200,
         *   body: "{...}"
         * }
         */

        if (
            data &&
            typeof data.body === "string"
        ) {

            try {

                result =
                    JSON.parse(data.body);

            } catch {

                console.warn(
                    "Lambda body was not JSON:",
                    data.body
                );

                result = {
                    message: data.body
                };
            }
        }


        /*
         * Some APIs return another nested
         * response object.
         */

        if (
            result &&
            result.body &&
            typeof result.body === "string"
        ) {

            try {

                result =
                    JSON.parse(result.body);

            } catch {

                console.warn(
                    "Nested Lambda body was not JSON."
                );
            }
        }

        console.log(
            "BiteFact AI parsed result:",
            result
        );

        displayAIResults(result);

    } catch (error) {

        console.error(
            "BiteFact camera AI error:",
            error
        );

        if (cameraNote) {

            cameraNote.innerHTML = `
                <div class="bitefact-ai-result">

                    <h3>⚠️ BiteFact AI</h3>

                    <p>
                        We got your photo, but BiteFact
                        could not analyze it yet.
                    </p>

                    <p style="font-size:12px;">
                        ${error.message || "Unknown error"}
                    </p>

                </div>
            `;
        }
    }
}


/* =========================
   IMAGE → BASE64
   ========================= */

function fileToBase64(file) {

    return new Promise((resolve, reject) => {

        const reader =
            new FileReader();

        reader.onload = () => {

            resolve(reader.result);
        };

        reader.onerror = () => {

            reject(
                new Error(
                    "Could not read food photo."
                )
            );
        };

        reader.readAsDataURL(file);
    });
}


/* =========================
   AI RESULTS
   ========================= */

function displayAIResults(result) {

    const cameraNote =
        document.getElementById("cameraNote");

    if (!cameraNote) {

        console.error(
            "BiteFact error: #cameraNote was not found."
        );

        return;
    }


    /*
     * Make sure result is an object.
     */

    if (
        !result ||
        typeof result !== "object"
    ) {

        result = {};
    }


    const food =
        result.food ||
        result.name ||
        result.foodName ||
        "Food detected";


    const calories =
        Number(result.calories) || 0;


    const protein =
        Number(result.protein) || 0;


    const carbs =
        Number(result.carbs) || 0;


    const fat =
        Number(result.fat) || 0;


    const portion =
        result.portion ||
        result.serving ||
        "1 serving";


    console.log(
        "BiteFact final nutrition:",
        {
            food,
            portion,
            calories,
            protein,
            carbs,
            fat
        }
    );


    /*
     * Store the result BEFORE displaying it.
     */

    window.bitefactAIResult = {

        food,
        calories,
        protein,
        carbs,
        fat,
        portion
    };


    /*
     * Display the estimation.
     */

    cameraNote.innerHTML = `

        <div class="bitefact-ai-result">

            <h3>🍽️ ${food}</h3>

            <label>
                Portion

                <input
                    id="aiPortion"
                    type="text"
                    value="${portion}"
                >
            </label>

            <p>
                🔥 Calories:
                <strong>${calories}</strong>
            </p>

            <p>
                💪 Protein:
                <strong>${protein}g</strong>
            </p>

            <p>
                🍞 Carbs:
                <strong>${carbs}g</strong>
            </p>

            <p>
                🥑 Fat:
                <strong>${fat}g</strong>
            </p>

            <button
                type="button"
                onclick="logAIResult()"
            >
                ✅ Verify & Log
            </button>

        </div>
    `;
}

    window.bitefactAIResult = {
        food,
        calories,
        protein,
        carbs,
        fat,
        portion
    };
}


/* =========================
   LOG AI RESULT
   ========================= */

function logAIResult() {

    const result = window.bitefactAIResult;

    if (!result) {
        alert("No AI result is available.");
        return;
    }

    user.calories += result.calories;
    user.protein += result.protein;
    user.carbs += result.carbs;
    user.fat += result.fat;

    saveUser();
    updateDashboard();

    const cameraNote =
        document.getElementById("cameraNote");

    if (cameraNote) {
        cameraNote.innerHTML =
            `✅ ${result.food} logged successfully.`;
    }

    const coachMessage =
        document.getElementById("coachMessage");

    if (coachMessage) {
        coachMessage.innerHTML =
            `🤖 ${result.food} added to your daily nutrition.`;
    }

    window.bitefactAIResult = null;
}


/* =========================
   DASHBOARD
   ========================= */

function updateDashboard() {

    document.getElementById("calories").innerHTML =
        `${user.calories} / 2200`;

    document.getElementById("protein").innerHTML =
        `${user.protein}g / 160g`;

    document.getElementById("carbs").innerHTML =
        `${user.carbs}g / 220g`;

    document.getElementById("fat").innerHTML =
        `${user.fat}g / 70g`;


    /*
     * AI PLAN OVERRIDES TRIAL TIMER
     *
     * If the user has activated AI Coach,
     * do NOT show "Trial ended."
     */

    if (user.plan === "ai") {

        document.getElementById("trialStatus").innerHTML =
            "🤖 AI Coach Active";

        return;
    }


    /*
     * Otherwise calculate the original
     * 3-day trial.
     */

    const currentTrialStart =
        localStorage.getItem("bitefact_trial");

    if (!currentTrialStart) {
        document.getElementById("trialStatus").innerHTML =
            "AI Coach Trial Available";

        return;
    }

    const trialDate =
        new Date(Number(currentTrialStart));

    const now =
        new Date();

    const trialEnd =
        new Date(
            trialDate.getTime() +
            3 * 24 * 60 * 60 * 1000
        );

    const remainingMs =
        trialEnd - now;

    if (remainingMs > 0) {

        const daysLeft =
            Math.ceil(
                remainingMs /
                (24 * 60 * 60 * 1000)
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
