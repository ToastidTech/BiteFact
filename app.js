const trialStart =
localStorage.getItem(
"plateiq_trial"
);


if(!trialStart){

localStorage.setItem(
"plateiq_trial",
Date.now()
);

}

let user = {

plan:"free",

trial:true,

trialDays:3,

calories:0,

protein:0,

carbs:0,

fat:0

};

function saveUser(){

localStorage.setItem(
"plateiq_user",
JSON.stringify(user)
);

}

function addMeal(){

let food =
document.getElementById(
"foodName"
).value;


let calories =
Number(
document.getElementById(
"foodCalories"
).value
);


let protein =
Number(
document.getElementById(
"foodProtein"
).value
);


user.calories += calories;

user.protein += protein;

saveUser();
}



function selectPlan(plan){

user.plan = plan;


if(plan==="ai"){

alert(
"AI Coach activated!"
);

}

else if(plan==="plus"){

alert(
"Plus plan selected."
);

}

else {

alert(
"Free plan selected."
);

}


}


const savedUser =
localStorage.getItem(
"plateiq_user"
);

if(savedUser){

user = JSON.parse(savedUser);

}


function updateDashboard(){

document.getElementById(
"calories"
).innerHTML =

`${user.calories} / 2200`;


document.getElementById(
"protein"
).innerHTML =

`${user.protein}g / 160g`;

}
