const CACHE_NAME = "papergrade-shell-v5";

// Bypass and do not cache on localhost / dev
const isLocalhost =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "[::1]";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          // Delete all old caches or all caches on localhost
          if (isLocalhost || key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Always bypass for localhost, non-GET, API calls, or Next.js dev server assets
  if (
    isLocalhost ||
    event.request.method !== "GET" ||
    event.request.url.includes("/api/") ||
    event.request.url.includes("/_next/")
  ) {
    return;
  }

  // Network-First strategy (never serve stale HTML if network is available)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match("/");
        });
      })
  );
});

// Push notification incoming event from Google/Apple WebPush cloud
self.addEventListener("push", (event) => {
  let data = {
    title: "PaperGrade AI",
    body: "You have a new academic update.",
    url: "/student/portal"
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const origin = self.location.origin;
  const options = {
    body: data.body,
    icon: new URL("/icon-192.png", origin).href,
    badge: new URL("/icon-192.png", origin).href,
    vibrate: [200, 100, 200],
    tag: `papergrade-push-${Date.now()}`,
    renotify: true,
    data: {
      url: data.url || "/student/portal",
    },
    actions: [
      { action: "open", title: "View Update" }
    ]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Client message event for foreground notification dispatch
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, options } = event.data;
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// User clicked on system notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/student/portal";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing open window if possible
      for (const client of clientList) {
        if ("focus" in client) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
