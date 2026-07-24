function hasPermission(feature){

const currentPlan =
plans[user.plan];


if(!currentPlan){

return false;

}


return Boolean(
currentPlan.features[feature]
);

}



function requirePermission(feature){

if(
hasPermission(feature)
){

return true;

}


alert(
"This feature requires an upgraded PlateIQ plan."
);


return false;

}
