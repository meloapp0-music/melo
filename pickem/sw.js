/* Pick 'Em service worker.
   The whole app is one HTML file, so precaching it plus the icons makes the
   thing work with no signal at all. CACHE is stamped by the build, so a new
   deploy installs a fresh worker and drops the old cache. */

const CACHE = "pickem-e873c5215478";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(ASSETS); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(keys.map(function(k){
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* navigations go to the network first so a deploy is picked up promptly,
     and fall back to the cached shell when there is nothing to reach */
  if (req.mode === "navigate"){
    e.respondWith(
      fetch(req)
        .then(function(res){
          const copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put("./index.html", copy); });
          return res;
        })
        .catch(function(){
          return caches.match("./index.html").then(function(hit){
            return hit || caches.match("./");
          });
        })
    );
    return;
  }

  /* everything else is immutable per build: serve from cache, refresh behind */
  e.respondWith(
    caches.match(req).then(function(hit){
      const net = fetch(req).then(function(res){
        if (res && res.status === 200){
          const copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
