// BiteFact AI endpoint.
// The Perplexity key stays server-side in the Node.js backend (server.js).
const AI_API_URL = "/api/bitefact-ai-analyze";

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
            console.warn("Could not restore BiteFact user state:", error);
        }
    }
}

loadUser();
