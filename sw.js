const CACHE_NAME =
"bitefact-v7";


const FILES = [

"./",

"index.html",

"style.css",

"app.js",

"plans.js",

"permissions.js",

"manifest.json"

];


self.addEventListener(
"install",
event=>{

event.waitUntil(

caches.open(
CACHE_NAME
)

.then(cache=>
cache.addAll(FILES)
)

);

});



self.addEventListener(
"fetch",
event=>{

event.respondWith(

caches.match(
event.request
)

.then(response=>

response ||
fetch(event.request)

)

);

});
