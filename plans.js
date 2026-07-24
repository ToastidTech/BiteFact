const plans = {

    free: {

        name: "Free",

        price: 0,

        features: {

            foodLogging: true,

            macroTracking: true,

            mealHistory: true,

            aiCoach: false,

            plateScanner: false,

            advancedReports: false

        }

    },


    plus: {

        name: "Plus",

        price: 9.99,

        features: {

            foodLogging: true,

            macroTracking: true,

            mealHistory: true,

            aiCoach: false,

            plateScanner: false,

            advancedReports: true,

            mealPlanning: true

        }

    },


    ai: {

        name: "AI Coach",

        price: 19.99,

        features: {

            foodLogging: true,

            macroTracking: true,

            mealHistory: true,

            aiCoach: true,

            plateScanner: true,

            advancedReports: true,

            mealPlanning: true,

            recommendations: true

        }

    }

};
