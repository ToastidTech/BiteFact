// BiteFact AI endpoint.
// The Anthropic key stays server-side in the Node.js backend (server.js).
// The frontend can be hosted with the backend or pointed at a deployed backend URL.
const AI_API_URL = window.BITEFACT_API_URL || "/api/bitefact-ai-analyze";

// Daily macro goals (single source of truth for the dashboard).
const DAILY_GOALS = { calories: 2200, protein: 160, carbs: 220, fat: 70 };

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
    // Backstop: first load on a new calendar day zeroes the macros.
    // The live 00:01 scheduler (scheduleDailyReset) handles the in-session case.
    // Plan/trial/identity state is preserved.
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

function resetDailyTotalsToZero(announce) {
    user.calories = 0;
    user.protein = 0;
    user.carbs = 0;
    user.fat = 0;
    user.totalsDate = localDateString(new Date());
    saveUser();
    updateDashboard();
    if (announce) showToast("Daily totals reset — fresh day, fresh fuel.");
}

function scheduleDailyReset() {
    // Fire at the next 00:01 in the user's local timezone, then re-arm.
    // setTimeout maxes out around 24.8 days; our delay is always under 24h.
    if (window.__bitefactResetTimer) clearTimeout(window.__bitefactResetTimer);

    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 1, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);

    const delay = Math.max(1000, next.getTime() - now.getTime());
    window.__bitefactResetTimer = setTimeout(() => {
        resetDailyTotalsToZero(true);
        scheduleDailyReset();
    }, delay);
}

let toastTimer = null;
function showToast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function switchView(name) {
    document.querySelectorAll(".view").forEach(section => {
        section.classList.toggle("view-active", section.id === "view-" + name);
    });
    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.toggle("tab-active", tab.dataset.view === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearDailyTotals() {
    resetDailyTotalsToZero(false);
    showToast("Today's totals cleared.");
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
        showToast("Please enter a food item first.");
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

    showToast(`${food} logged.`);
    await analyzeMealWithAI(meal);
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
        free: "BiteFact Free",
        plus: "BiteFact Plus",
        ai: "BiteFact AI"
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
                    <span class="plan-desc">Manual logging, macro tracking, advanced reports, meal planning.</span>
                    <div class="bitefact-paypal-wrap"><div id="bitefact-paypal-plus"></div></div>
                </div>
                <div class="plan-card">
                    <strong>BiteFact AI</strong>
                    <span class="plan-price">$19.99/mo</span>
                    <span class="plan-desc">Everything in Plus, plus AI coach and the photo plate scanner.</span>
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
                    <span class="plan-desc">Add the AI coach and photo plate scanner.</span>
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

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderMacro(key, amount, unit) {
    const goal = DAILY_GOALS[key];
    setText(key + "Value", `${Math.round(amount)}${unit}`);
    const bar = document.getElementById(key + "Bar");
    if (bar) bar.style.width = `${Math.min(100, (amount / goal) * 100)}%`;
}

function updateDashboard() {
    const calories = Math.max(0, Math.round(user.calories));

    const ring = document.getElementById("calorieRing");
    if (ring) {
        const circumference = 2 * Math.PI * 84;
        const progress = Math.min(1, calories / DAILY_GOALS.calories);
        ring.style.strokeDasharray = String(circumference);
        ring.style.strokeDashoffset = String(circumference * (1 - progress));
    }

    setText("caloriesValue", String(calories));
    setText("caloriesSub", `${calories.toLocaleString()} of ${DAILY_GOALS.calories.toLocaleString()}`);

    renderMacro("protein", user.protein, "g");
    renderMacro("carbs", user.carbs, "g");
    renderMacro("fat", user.fat, "g");
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
scheduleDailyReset();

// Backstop for apps left open in a background tab: re-check the date when visible.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        const before = JSON.stringify({ c: user.calories, p: user.protein, cb: user.carbs, f: user.fat });
        resetDailyTotalsIfNewDay();
        const after = JSON.stringify({ c: user.calories, p: user.protein, cb: user.carbs, f: user.fat });
        if (before !== after) {
            updateDashboard();
            showToast("Daily totals reset — fresh day, fresh fuel.");
        }
    }
});
