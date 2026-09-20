// BiteFact AI endpoint.
// The Anthropic key stays server-side in the Node.js backend (server.js).
// The frontend can be hosted with the backend or pointed at a deployed backend URL.
const AI_API_URL = window.BITEFACT_API_URL || "/api/bitefact-ai-analyze";

let user = {
    plan: "free",
    trial: false,
    trialDays: 0,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    totalsDate: ""
};

function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function resetDailyTotalsIfNewDay() {
    // Daily totals reset at 00:01 local time: first load on a new calendar day
    // zeroes the macros. Plan/trial/identity state is preserved.
    const today = localDateString(new Date());
    if (user.totalsDate !== today) {
        user.calories = 0;
        user.protein = 0;
        user.carbs = 0;
        user.fat = 0;
        user.totalsDate = today;
        saveUser();
    }
}

function clearDailyTotals() {
    user.calories = 0;
    user.protein = 0;
    user.carbs = 0;
    user.fat = 0;
    user.totalsDate = localDateString(new Date());
    saveUser();
    updateDashboard();
}

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

    if (!["free", "plus", "ai"].includes(user.plan)) {
        user.plan = "free";
    }

    resetDailyTotalsIfNewDay();
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

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `AI API returned ${response.status}`);
        }

        const insight = data.notes || data.message || "Meal analyzed successfully.";
        coachMessage.innerHTML = `🤖 ${escapeHtml(insight)}`;
    } catch (error) {
        console.error("BiteFact AI error:", error);
        coachMessage.innerHTML = "🤖 Meal logged successfully. AI Coach is temporarily unavailable.";
    }
}

async function addMeal() {
    const food = document.getElementById("foodName").value.trim();
    const calories = Number(document.getElementById("foodCalories").value) || 0;
    const protein = Number(document.getElementById("foodProtein").value) || 0;
    const carbs = Number(document.getElementById("foodCarbs").value) || 0;
    const fat = Number(document.getElementById("foodFat").value) || 0;

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

    const meal = { food, calories, protein, carbs, fat };

    document.getElementById("foodName").value = "";
    document.getElementById("foodCalories").value = "";
    document.getElementById("foodProtein").value = "";
    document.getElementById("foodCarbs").value = "";
    document.getElementById("foodFat").value = "";

    await analyzeMealWithAI(meal);
}

/* =========================
   VIEWS
   ========================= */

function showUpgradeView() {
    document.getElementById("view-dashboard").hidden = true;
    document.getElementById("view-upgrade").hidden = false;
    window.scrollTo(0, 0);
    updatePlanUI();
}

function showDashboardView() {
    document.getElementById("view-upgrade").hidden = true;
    document.getElementById("view-dashboard").hidden = false;
    window.scrollTo(0, 0);
}

function trialIsActive() {
    return typeof window.bitefactTrialActive === "function" && window.bitefactTrialActive();
}

function trialDaysLeft() {
    return typeof window.bitefactTrialDaysLeft === "function" ? window.bitefactTrialDaysLeft() : 0;
}

// The AI plate scanner is an AI-tier feature; the 3-day trial unlocks it.
function plateScannerAccess() {
    if (user.plan === "ai") return true;
    return trialIsActive();
}

window.bitefactRefreshPlans = function () {
    updatePlanUI();
    updateDashboard();
};

window.bitefactOnSubscriptionApproved = function (plan) {
    if (!["plus", "ai"].includes(plan)) return;
    selectPlan(plan);
};

function selectPlan(plan) {
    if (!["free", "plus", "ai"].includes(plan)) return;

    user.plan = plan;
    user.trial = false;
    user.trialDays = 0;
    saveUser();
    updatePlanUI();
    updateDashboard();

    const messages = {
        free: "Free plan selected. Your nutrition tracking is ready.",
        plus: "BiteFact Plus selected. Advanced tracking is ready.",
        ai: "BiteFact AI selected. Photo-based meal estimation is ready."
    };

    const coachMessage = document.getElementById("coachMessage");
    if (coachMessage) {
        coachMessage.innerHTML = `🤖 ${escapeHtml(messages[plan])}`;
    }
}

function updatePlanUI() {
    const currentPlan = document.getElementById("currentPlan");
    const options = document.getElementById("planOptions");

    if (!currentPlan || !options) return;

    const labels = {
        free: "Current Plan: Free",
        plus: "Current Plan: Plus",
        ai: "Current Plan: AI"
    };

    currentPlan.textContent = labels[user.plan] + (trialIsActive() && user.plan === "free" ? ` (Trial: ${trialDaysLeft()}d left)` : "");

    const trialBanner = trialIsActive() && user.plan === "free"
        ? `<div class="trial-banner">🎉 Trial active — ${trialDaysLeft()} day(s) of AI plate scanner left.</div>`
        : "";

    if (user.plan === "free") {
        options.innerHTML = `
            ${trialBanner}
            <div class="plan-cards">
                <div class="plan-card">
                    <strong>BiteFact Plus</strong>
                    <span class="plan-price">$12.99/mo</span>
                    <span class="plan-desc">Manual nutrition entry with calorie &amp; macro tracking and daily totals.</span>
                    <div class="bitefact-paypal-wrap"><div id="bitefact-paypal-plus"></div></div>
                </div>
                <div class="plan-card">
                    <strong>BiteFact AI</strong>
                    <span class="plan-price">$19.99/mo</span>
                    <span class="plan-desc">Everything in Plus, plus the AI photo plate scanner and AI nutrition insights.</span>
                    <div class="bitefact-paypal-wrap"><div id="bitefact-paypal-ai"></div></div>
                </div>
            </div>
            <p class="plan-note">New here? Your first visit starts a 3-day free trial of the AI plate scanner — no credit card required.</p>
        `;
        if (typeof window.bitefactRenderPayPal === "function") window.bitefactRenderPayPal();
        return;
    }

    if (user.plan === "plus") {
        options.innerHTML = `
            ${trialBanner}
            <div class="plan-option-copy">
                <strong>BiteFact Plus</strong>
                <span>You're already on Plus.</span>
            </div>
            <div class="plan-cards">
                <div class="plan-card">
                    <strong>BiteFact AI</strong>
                    <span class="plan-price">$19.99/mo</span>
                    <span class="plan-desc">Add the AI photo plate scanner and AI nutrition insights.</span>
                    <div class="bitefact-paypal-wrap"><div id="bitefact-paypal-ai"></div></div>
                </div>
            </div>
        `;
        if (typeof window.bitefactRenderPayPal === "function") window.bitefactRenderPayPal();
        return;
    }

    options.innerHTML = `
        <div class="plan-thank-you">
            <strong>Thank you for trusting Toastid Tech for your Nutritional information</strong>
        </div>
    `;
}

/* =========================
   CAMERA
   ========================= */

function openCameraGuide(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    // The AI plate scanner is an AI-tier feature; the 3-day trial unlocks it.
    if (!plateScannerAccess()) {
        if (typeof window.bitefactShowLeadPrompt === "function") {
            window.bitefactShowLeadPrompt();
        } else {
            alert("The AI plate scanner needs an active trial or a paid plan.");
        }
        return false;
    }

    let cameraInput = document.getElementById("bitefactCameraInput");

    if (!cameraInput) {
        cameraInput = document.createElement("input");
        cameraInput.type = "file";
        cameraInput.id = "bitefactCameraInput";
        cameraInput.accept = "image/jpeg,image/png,image/webp,image/gif";
        cameraInput.setAttribute("capture", "environment");
        cameraInput.style.display = "none";

        document.body.appendChild(cameraInput);
        cameraInput.addEventListener("change", handleBiteFactCameraPhoto);
    }

    cameraInput.value = "";
    cameraInput.click();
    return false;
}

async function handleBiteFactCameraPhoto(event) {
    const cameraInput = event.target;

    if (!cameraInput.files || !cameraInput.files.length) return;

    const photo = cameraInput.files[0];
    const cameraNote = document.getElementById("cameraNote");

    if (cameraNote) {
        cameraNote.innerHTML = `
            <div class="bitefact-ai-result">
                <h3>🤖 BiteFact AI</h3>
                <p>Analyzing your food photo...</p>
            </div>
        `;
    }

    try {
        const imageBase64 = await fileToBase64(photo);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        let response;
        try {
            response = await fetch(AI_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ image: imageBase64 }),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `AI API returned ${response.status}`);
        }

        displayAIResults(data);
    } catch (error) {
        console.error("BiteFact camera AI error:", error);

        if (cameraNote) {
            const message = error.name === "AbortError"
                ? "The AI analysis took too long. Please try the photo again."
                : (error.message || "Unknown error");

            cameraNote.innerHTML = `
                <div class="bitefact-ai-result error">
                    <h3>⚠️ BiteFact AI</h3>
                    <p>We got your photo, but BiteFact could not analyze it yet.</p>
                    <p class="result-detail">${escapeHtml(message)}</p>
                </div>
            `;
        }
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith("image/")) {
            reject(new Error("Please select a valid food photo."));
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            const image = new Image();

            image.onload = () => {
                const maxDimension = 1600;
                const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
                const width = Math.max(1, Math.round(image.naturalWidth * scale));
                const height = Math.max(1, Math.round(image.naturalHeight * scale));
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const context = canvas.getContext("2d", { alpha: false });
                context.drawImage(image, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.82));
            };

            image.onerror = () => reject(new Error("Could not process food photo."));
            image.src = reader.result;
        };

        reader.onerror = () => reject(new Error("Could not read food photo."));
        reader.readAsDataURL(file);
    });
}

function displayAIResults(result) {
    const cameraNote = document.getElementById("cameraNote");

    if (!cameraNote) return;
    if (!result || typeof result !== "object") result = {};

    const food = result.food || result.name || result.foodName || "Food detected";
    const calories = Number(result.calories) || 0;
    const protein = Number(result.protein) || 0;
    const carbs = Number(result.carbs) || 0;
    const fat = Number(result.fat) || 0;
    const portion = result.portion || result.serving || "1 serving";
    const confidence = Number(result.confidence);
    const notes = result.notes || "Nutrition values are estimates.";

    window.bitefactAIResult = { food, calories, protein, carbs, fat, portion };

    const confidenceText = Number.isFinite(confidence)
        ? `<p class="result-detail">AI confidence: ${Math.round(confidence * 100)}%</p>`
        : "";

    cameraNote.innerHTML = `
        <div class="bitefact-ai-result success">
            <div class="result-title-row">
                <h3>🍽️ ${escapeHtml(food)}</h3>
                <span class="result-badge">AI ESTIMATE</span>
            </div>
            <label>
                Portion
                <input id="aiPortion" type="text" value="${escapeAttribute(portion)}">
            </label>
            <div class="result-grid">
                <div><span>Calories</span><strong>${Math.round(calories)}</strong></div>
                <div><span>Protein</span><strong>${protein}g</strong></div>
                <div><span>Carbs</span><strong>${carbs}g</strong></div>
                <div><span>Fat</span><strong>${fat}g</strong></div>
            </div>
            ${confidenceText}
            <p class="result-notes">${escapeHtml(notes)}</p>
            <button type="button" onclick="logAIResult()">✅ Verify &amp; Log to Daily Totals</button>
        </div>
    `;
}

function logAIResult() {
    const result = window.bitefactAIResult;

    if (!result) {
        alert("No AI result is available.");
        return;
    }

    const portionInput = document.getElementById("aiPortion");
    if (portionInput && portionInput.value.trim()) result.portion = portionInput.value.trim();

    user.calories += result.calories;
    user.protein += result.protein;
    user.carbs += result.carbs;
    user.fat += result.fat;

    saveUser();
    updateDashboard();

    const cameraNote = document.getElementById("cameraNote");
    if (cameraNote) cameraNote.innerHTML = `✅ ${escapeHtml(result.food)} logged successfully.`;

    const coachMessage = document.getElementById("coachMessage");
    if (coachMessage) coachMessage.innerHTML = `🤖 ${escapeHtml(result.food)} added to your daily nutrition.`;

    window.bitefactAIResult = null;
}

const GOALS = { calories: 2200, protein: 160, carbs: 220, fat: 70 };
const RING_CIRCUMFERENCE = 2 * Math.PI * 84;

function setMacro(name, value, goal) {
    const val = document.getElementById(name);
    if (val) val.textContent = `${Math.round(value)}g / ${goal}g`;
    const bar = document.getElementById(name + "Bar");
    if (bar) bar.style.width = `${Math.min((value / goal) * 100, 100)}%`;
}

function updateDashboard() {
    const calPct = Math.min(user.calories / GOALS.calories, 1);

    const ring = document.getElementById("ringProgress");
    if (ring) ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - calPct));

    const calEl = document.getElementById("calories");
    if (calEl) calEl.textContent = Math.round(user.calories).toLocaleString("en-US");

    const caption = document.getElementById("ringCaption");
    if (caption) caption.textContent = `Daily calories — ${Math.round(calPct * 100)}% of goal`;

    setMacro("protein", user.protein, GOALS.protein);
    setMacro("carbs", user.carbs, GOALS.carbs);
    setMacro("fat", user.fat, GOALS.fat);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
}

loadUser();
updateDashboard();
updatePlanUI();

// Signal a successful boot for the stuck-loading guard in index.html.
window.__bitefactBooted = true;
