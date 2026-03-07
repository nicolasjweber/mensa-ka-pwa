const API_URL = "/api/";
const CACHE_PREFIX = "mensa-ka-pwa-cache:";
const FAVORITES_KEY = "mensa-ka-pwa-favorites";

const EURO_FORMATTER = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
});
const GERMAN_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const GERMAN_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
});

const GET_MEAL_PLAN_QUERY = `
  query GetMealPlanForDay($date: NaiveDate!) {
    getCanteens {
      id
      name
      lines {
        id
        name
        meals(date: $date) {
          id
          name
          mealType
          images {
            url
            rank
          }
          ratings {
            averageRating
            ratingsCount
          }
          price {
            student
            employee
            pupil
            guest
          }
        }
      }
    }
  }
`;

const state = {
  date: toDateString(new Date()),
  canteens: [],
  selectedCanteenId: "",
  searchQuery: "",
  priceMode: "student",
  controlsExpanded: false,
  favorites: loadFavorites(),
  mealImageGallery: new Map(),
};

const modalState = {
  urls: [],
  index: 0,
  mealName: "",
};

const controlsSection = document.querySelector(".controls");
const controlsToggleButton = document.getElementById("controlsToggleButton");
const controlsExtraGroups = document.getElementById("controlsExtraGroups");
const canteenSelect = document.getElementById("canteenSelect");
const priceModeSelect = document.getElementById("priceModeSelect");
const searchInput = document.getElementById("searchInput");
const prevDayButton = document.getElementById("prevDayButton");
const refreshButton = document.getElementById("refreshButton");
const nextDayButton = document.getElementById("nextDayButton");
const dateDisplay = document.getElementById("dateDisplay");
const statusMessage = document.getElementById("statusMessage");
const summaryMessage = document.getElementById("summaryMessage");
const mealPlanContainer = document.getElementById("mealPlanContainer");
const installButton = document.getElementById("installButton");
const imageModal = document.getElementById("imageModal");
const imageModalClose = document.getElementById("imageModalClose");
const imageModalPrev = document.getElementById("imageModalPrev");
const imageModalNext = document.getElementById("imageModalNext");
const imageModalContent = document.getElementById("imageModalContent");
const imageModalCaption = document.getElementById("imageModalCaption");
const imageModalCounter = document.getElementById("imageModalCounter");
const viewportMeta = document.querySelector('meta[name="viewport"]');

const VIEWPORT_NO_ZOOM =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
const VIEWPORT_ALLOW_ZOOM = "width=device-width, initial-scale=1";
const MOBILE_IMAGE_BREAKPOINT = "(max-width: 560px)";

function loadFavorites() {
  const raw = localStorage.getItem(FAVORITES_KEY);
  if (!raw) return new Set();

  try {
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.map(String));
  } catch {
    return new Set();
  }
}

function persistFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }
  return new Date(year, month - 1, day);
}

function normalizeToLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function relativeDateLabel(date) {
  const target = normalizeToLocalMidnight(date);
  const today = normalizeToLocalMidnight(new Date());
  const diffDays = Math.round((target - today) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return "";
}

function formatGermanDateWithRelative(value) {
  const date = parseDateInput(value);
  const weekday = GERMAN_WEEKDAY_FORMATTER.format(date);
  const formatted = GERMAN_DATE_FORMATTER.format(date);
  const relative = relativeDateLabel(date);
  const dateWithWeekday = `${weekday}, ${formatted}`;
  return relative ? `${dateWithWeekday} (${relative})` : dateWithWeekday;
}

function renderDateDisplay() {
  dateDisplay.textContent = `Date: ${formatGermanDateWithRelative(state.date)}`;
}

function isMobileLayout() {
  return window.matchMedia(MOBILE_IMAGE_BREAKPOINT).matches;
}

function syncControlsVisibility() {
  const mobile = isMobileLayout();
  const expanded = !mobile || state.controlsExpanded;

  controlsToggleButton.hidden = !mobile;
  controlsToggleButton.textContent = expanded ? "Hide filters" : "Show filters";
  controlsToggleButton.setAttribute("aria-expanded", String(expanded));
  controlsExtraGroups.hidden = !expanded;

  controlsSection.classList.toggle("mobile-collapsed", mobile && !expanded);
}

function setZoomAllowed(allowed) {
  if (!viewportMeta) return;
  viewportMeta.setAttribute("content", allowed ? VIEWPORT_ALLOW_ZOOM : VIEWPORT_NO_ZOOM);
}

function renderModalImage() {
  if (modalState.urls.length === 0) return;

  const index = Math.min(Math.max(modalState.index, 0), modalState.urls.length - 1);
  modalState.index = index;

  const imageUrl = modalState.urls[index];
  const total = modalState.urls.length;
  const mealName = modalState.mealName || "Meal image";

  imageModalContent.src = imageUrl;
  imageModalContent.alt = `${mealName} (${index + 1}/${total})`;
  imageModalCaption.textContent = mealName;
  imageModalCounter.textContent = `${index + 1} / ${total}`;

  const singleImage = total <= 1;
  imageModalPrev.hidden = singleImage;
  imageModalNext.hidden = singleImage;
}

function openImageModal(urls, startIndex, mealName) {
  if (!Array.isArray(urls) || urls.length === 0) return;

  modalState.urls = urls;
  modalState.index = Number.isInteger(startIndex) ? startIndex : 0;
  modalState.mealName = String(mealName ?? "");

  renderModalImage();
  imageModal.hidden = false;
  document.body.style.overflow = "hidden";
  setZoomAllowed(true);
}

function closeImageModal() {
  imageModal.hidden = true;
  imageModalContent.src = "";
  modalState.urls = [];
  modalState.index = 0;
  modalState.mealName = "";
  document.body.style.overflow = "";
  setZoomAllowed(false);
}

function showPreviousModalImage() {
  if (modalState.urls.length <= 1) return;
  modalState.index =
    (modalState.index - 1 + modalState.urls.length) % modalState.urls.length;
  renderModalImage();
}

function showNextModalImage() {
  if (modalState.urls.length <= 1) return;
  modalState.index = (modalState.index + 1) % modalState.urls.length;
  renderModalImage();
}

function isTextInputFocused() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;

  const tag = active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return active.isContentEditable;
}

function setStatus(message, level = "info") {
  statusMessage.textContent = message;
  statusMessage.className = `status ${level === "info" ? "" : level}`.trim();
}

function getLocalCache(date) {
  const raw = localStorage.getItem(`${CACHE_PREFIX}${date}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.canteens)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setLocalCache(date, canteens) {
  localStorage.setItem(
    `${CACHE_PREFIX}${date}`,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      canteens,
    }),
  );
}

function isWeekend(date) {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

function formatPrice(price) {
  if (typeof price !== "number" || Number.isNaN(price)) return "-";
  return EURO_FORMATTER.format(price / 100);
}

function safeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeAttr(value) {
  return safeText(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function humanMealType(rawType) {
  switch (rawType) {
    case "VEGAN":
      return "Vegan";
    case "VEGETARIAN":
      return "Vegetarian";
    case "POULTRY":
      return "Poultry";
    case "FISH":
      return "Fish";
    case "BEEF":
    case "BEEF_AW":
      return "Beef";
    case "PORK":
    case "PORK_AW":
      return "Pork";
    default:
      return "Unknown";
  }
}

function getMealImageUrls(meal) {
  if (!Array.isArray(meal?.images) || meal.images.length === 0) {
    return [];
  }

  const sorted = [...meal.images].sort((a, b) => {
    const rankA = typeof a?.rank === "number" ? a.rank : -Infinity;
    const rankB = typeof b?.rank === "number" ? b.rank : -Infinity;
    return rankB - rankA;
  });

  const urls = [];
  const seen = new Set();
  for (const entry of sorted) {
    const url = entry?.url;
    if (typeof url !== "string" || url.length === 0 || seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function renderRating(ratings) {
  const average = ratings?.averageRating;
  const count = ratings?.ratingsCount;

  if (typeof average !== "number" || typeof count !== "number" || count <= 0) {
    return `<span class="rating-number">No ratings yet</span>`;
  }

  const clampedAverage = Math.min(5, Math.max(0, average));
  const fullStars = Math.round(clampedAverage);
  const stars = "\u2605".repeat(fullStars) + "\u2606".repeat(5 - fullStars);

  return `
    <span class="rating-stars" aria-label="${clampedAverage.toFixed(1)} of 5 stars">${stars}</span>
    <span class="rating-number">${clampedAverage.toFixed(1)}/5 (${count})</span>
  `;
}

function renderCanteenOptions() {
  canteenSelect.innerHTML = "";

  if (state.canteens.length === 0) {
    canteenSelect.innerHTML = `<option value="">No canteens found</option>`;
    canteenSelect.disabled = true;
    state.selectedCanteenId = "";
    return;
  }

  canteenSelect.disabled = false;
  const selectedExists = state.canteens.some(
    (canteen) => canteen.id === state.selectedCanteenId,
  );
  if (!selectedExists) {
    state.selectedCanteenId = state.canteens[0].id;
  }

  canteenSelect.innerHTML = state.canteens
    .map((canteen) => {
      const selected = canteen.id === state.selectedCanteenId ? "selected" : "";
      return `<option value="${safeText(canteen.id)}" ${selected}>${safeText(canteen.name)}</option>`;
    })
    .join("");
}

function filterMeals(meals) {
  const normalizedQuery = state.searchQuery.trim().toLowerCase();
  return meals.filter((meal) => {
    if (!normalizedQuery) {
      return true;
    }
    return String(meal.name ?? "").toLowerCase().includes(normalizedQuery);
  });
}

function summarizeLines(lines) {
  let mealCount = 0;
  let visibleLines = 0;
  for (const line of lines) {
    const meals = filterMeals(Array.isArray(line.meals) ? line.meals : []);
    mealCount += meals.length;
    if (meals.length > 0) {
      visibleLines += 1;
    }
  }
  return { mealCount, visibleLines };
}

function renderSummary(lines) {
  const { mealCount, visibleLines } = summarizeLines(lines);
  summaryMessage.textContent = `${visibleLines} lines, ${mealCount} meals, ${state.favorites.size} favorites`;
}

function renderMealPlan() {
  if (state.canteens.length === 0 || !state.selectedCanteenId) {
    state.mealImageGallery = new Map();
    mealPlanContainer.innerHTML = `<p class="empty">No meal data available.</p>`;
    summaryMessage.textContent = "";
    return;
  }

  const canteen = state.canteens.find((entry) => entry.id === state.selectedCanteenId);
  if (!canteen) {
    state.mealImageGallery = new Map();
    mealPlanContainer.innerHTML = `<p class="empty">No meal data available.</p>`;
    summaryMessage.textContent = "";
    return;
  }

  const lines = Array.isArray(canteen.lines) ? canteen.lines : [];
  renderSummary(lines);

  const mealImageGallery = new Map();
  const lineMarkup = lines
    .map((line) => {
      const allMeals = Array.isArray(line.meals) ? line.meals : [];
      const meals = filterMeals(allMeals);

      if (meals.length === 0) {
        return "";
      }

      const mealsMarkup = meals
        .map((meal) => {
          const mealId = String(meal.id ?? "");
          const mealName = String(meal.name ?? "Meal image");
          const isFavorite = state.favorites.has(mealId);
          const selectedPrice = meal?.price?.[state.priceMode];
          const hideImageForFreeMeal = selectedPrice === 0 && isMobileLayout();
          const mealTypeLabel = humanMealType(meal.mealType);
          const mealTypeTag =
            mealTypeLabel === "Unknown"
              ? ""
              : `<span class="tag">${safeText(mealTypeLabel)}</span>`;
          const priceTag = `<span class="tag price-tag">${formatPrice(selectedPrice)}</span>`;
          const imageUrls = getMealImageUrls(meal);

          if (!hideImageForFreeMeal && imageUrls.length > 0) {
            mealImageGallery.set(mealId, {
              urls: imageUrls,
              mealName,
            });
          }

          const imageMarkup = hideImageForFreeMeal
            ? ""
            : imageUrls.length > 0
              ? `
                <div class="meal-image-wrap">
                  <img
                    class="meal-image"
                    loading="lazy"
                    src="${safeAttr(imageUrls[0])}"
                    alt="${safeAttr(mealName)}"
                    data-meal-id="${safeAttr(mealId)}"
                    data-image-index="0"
                  />
                  ${
                    imageUrls.length > 1
                      ? `<span class="meal-image-count">${imageUrls.length}x</span>`
                      : ""
                  }
                </div>
              `
              : `<div class="meal-image-placeholder">No image</div>`;
          const layoutClass = hideImageForFreeMeal ? "meal-layout no-image" : "meal-layout";

          return `
            <article class="meal-item">
              <div class="${layoutClass}">
                ${imageMarkup}
                <div class="meal-content">
                  <div class="meal-head">
                    <h3 class="meal-name">${safeText(mealName)}</h3>
                    <button
                      class="favorite-button"
                      data-favorite-id="${safeText(mealId)}"
                      aria-label="Toggle favorite"
                      title="Toggle favorite"
                    >${isFavorite ? "\u2665" : "\u2661"}</button>
                  </div>
                  <p class="meal-meta">
                    ${mealTypeTag}
                    ${priceTag}
                  </p>
                  <p class="meal-meta meal-rating">${renderRating(meal.ratings)}</p>
                </div>
              </div>
            </article>
          `;
        })
        .join("");

      return `
        <article class="line-card">
          <div class="line-head">
            <h2>${safeText(line.name)}</h2>
            <span class="line-count">${meals.length} ${meals.length === 1 ? "meal" : "meals"}</span>
          </div>
          ${mealsMarkup}
        </article>
      `;
    })
    .filter(Boolean)
    .join("");

  state.mealImageGallery = mealImageGallery;
  mealPlanContainer.innerHTML =
    lineMarkup || `<p class="empty">No meals match your current filters.</p>`;
}

async function fetchMealPlan(date) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: GET_MEAL_PLAN_QUERY,
      variables: { date },
      operationName: "GetMealPlanForDay",
    }),
  });

  if (!response.ok) {
    throw new Error(`Server request failed (${response.status})`);
  }

  const body = await response.json();
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(body.errors[0].message || "GraphQL request failed");
  }

  const canteens = body?.data?.getCanteens;
  if (!Array.isArray(canteens)) {
    throw new Error("Unexpected API response format");
  }
  return canteens;
}

async function loadMealPlan() {
  const date = state.date;
  state.date = date;
  renderDateDisplay();

  setStatus("");

  try {
    const canteens = await fetchMealPlan(date);
    state.canteens = canteens;
    setLocalCache(date, canteens);
    setStatus("");
  } catch (error) {
    const cached = getLocalCache(date);
    if (cached) {
      state.canteens = cached.canteens;
      setStatus(
        `Using cached data from ${new Date(cached.updatedAt).toLocaleString("de-DE")}.`,
        "warning",
      );
    } else {
      state.canteens = [];
      setStatus(error.message || "Failed to load data.", "error");
    }
  } finally {
    renderCanteenOptions();
    renderMealPlan();
  }
}

function shiftDate(days) {
  if (!Number.isInteger(days) || days === 0) return;

  const direction = days > 0 ? 1 : -1;
  let remainingWeekdays = Math.abs(days);
  const current = parseDateInput(state.date);

  while (remainingWeekdays > 0) {
    current.setDate(current.getDate() + direction);
    if (!isWeekend(current)) {
      remainingWeekdays -= 1;
    }
  }

  state.date = toDateString(current);
  renderDateDisplay();
  void loadMealPlan();
}

function toggleFavorite(mealId) {
  if (!mealId) return;
  if (state.favorites.has(mealId)) {
    state.favorites.delete(mealId);
  } else {
    state.favorites.add(mealId);
  }
  persistFavorites();
  renderMealPlan();
}

function setupInstallPrompt() {
  let deferredPrompt = null;

  if (window.matchMedia("(display-mode: standalone)").matches) {
    installButton.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    installButton.hidden = true;
  });
}

async function bootstrap() {
  setZoomAllowed(false);
  renderDateDisplay();
  let isCurrentlyMobile = isMobileLayout();
  state.controlsExpanded = !isCurrentlyMobile;
  syncControlsVisibility();

  controlsToggleButton.addEventListener("click", () => {
    if (!isMobileLayout()) return;
    state.controlsExpanded = !state.controlsExpanded;
    syncControlsVisibility();
  });

  canteenSelect.addEventListener("change", () => {
    state.selectedCanteenId = canteenSelect.value;
    renderMealPlan();
  });

  priceModeSelect.addEventListener("change", () => {
    state.priceMode = priceModeSelect.value;
    renderMealPlan();
  });

  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value;
    renderMealPlan();
  });

  prevDayButton.addEventListener("click", () => shiftDate(-1));
  refreshButton.addEventListener("click", () => {
    void loadMealPlan();
  });
  nextDayButton.addEventListener("click", () => shiftDate(1));

  mealPlanContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.classList.contains("meal-image")) {
      const mealId = target.dataset.mealId || "";
      const imageIndex = Number.parseInt(target.dataset.imageIndex || "0", 10) || 0;
      const galleryInfo = state.mealImageGallery.get(mealId);

      if (galleryInfo?.urls?.length > 0) {
        openImageModal(galleryInfo.urls, imageIndex, galleryInfo.mealName);
      }
      return;
    }

    const favoriteId = target.dataset.favoriteId;
    if (favoriteId) {
      toggleFavorite(favoriteId);
    }
  });

  imageModalClose.addEventListener("click", closeImageModal);
  imageModalPrev.addEventListener("click", showPreviousModalImage);
  imageModalNext.addEventListener("click", showNextModalImage);

  imageModal.addEventListener("click", (event) => {
    if (event.target === imageModal) {
      closeImageModal();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const isPrev = key === "a" || key === "arrowleft";
    const isNext = key === "d" || key === "arrowright";

    if (!imageModal.hidden) {
      if (event.key === "Escape") {
        closeImageModal();
      } else if (isPrev) {
        event.preventDefault();
        showPreviousModalImage();
      } else if (isNext) {
        event.preventDefault();
        showNextModalImage();
      }
      return;
    }

    if (isTextInputFocused()) {
      return;
    }

    if (isPrev) {
      event.preventDefault();
      shiftDate(-1);
    } else if (isNext) {
      event.preventDefault();
      shiftDate(1);
    }
  });

  window.addEventListener("resize", () => {
    const nextMobileState = isMobileLayout();
    if (nextMobileState !== isCurrentlyMobile) {
      isCurrentlyMobile = nextMobileState;
      state.controlsExpanded = !nextMobileState;
      syncControlsVisibility();
      renderMealPlan();
    }
  });

  // iOS Safari pinch gestures can bypass viewport settings unless explicitly blocked.
  const blockGestureWhenNotModal = (event) => {
    if (imageModal.hidden) {
      event.preventDefault();
    }
  };
  window.addEventListener("gesturestart", blockGestureWhenNotModal, {
    passive: false,
  });
  window.addEventListener("gesturechange", blockGestureWhenNotModal, {
    passive: false,
  });
  window.addEventListener("gestureend", blockGestureWhenNotModal, {
    passive: false,
  });

  setupInstallPrompt();

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (error) {
      setStatus(`Service worker registration failed: ${error.message}`, "warning");
    }
  }

  await loadMealPlan();
}

void bootstrap();
