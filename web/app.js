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
  priceMode: "student",
  favorites: loadFavorites(),
  mealImageGallery: new Map(),
  activeFilters: {
    vegan: false,
    vegetarian: false,
    noPork: false,
    favoritesOnly: false,
  },
  isLoading: false,
};

const modalState = {
  urls: [],
  index: 0,
  mealName: "",
  isZoomed: false,
  scale: 1,
  translateX: 0,
  translateY: 0,
};

const canteenSelect = document.getElementById("canteenSelect");
const priceModeSelect = document.getElementById("priceModeSelect");
const prevDayButton = document.getElementById("prevDayButton");
const refreshButton = document.getElementById("refreshButton");
const nextDayButton = document.getElementById("nextDayButton");
const todayButton = document.getElementById("todayButton");
const calendarToggleBtn = document.getElementById("calendarToggleBtn");
const calendarToggleText = document.getElementById("calendarToggleText");
const dateDisplay = document.getElementById("dateDisplay");
const weekDaysStrip = document.getElementById("weekDaysStrip");
const monthCalendar = document.getElementById("monthCalendar");
const monthPrevBtn = document.getElementById("monthPrevBtn");
const monthNextBtn = document.getElementById("monthNextBtn");
const monthLabel = document.getElementById("monthLabel");
const monthDaysGrid = document.getElementById("monthDaysGrid");
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
const imageModalViewport = document.getElementById("imageModalViewport");
const imageModalDots = document.getElementById("imageModalDots");
const filterChips = document.querySelectorAll(".filter-chip");

const SHORT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

const calendarState = {
  isExpanded: false,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(),
};

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

const SHORT_GERMAN_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
});

function formatDateDisplay(value) {
  const date = parseDateInput(value);
  const formatter = isMobileLayout() ? SHORT_GERMAN_WEEKDAY_FORMATTER : GERMAN_WEEKDAY_FORMATTER;
  const weekday = formatter.format(date);
  const formatted = GERMAN_DATE_FORMATTER.format(date);
  return `${weekday}, ${formatted}`;
}

function getMondayOfDate(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

const MOBILE_BREAKPOINT = "(max-width: 600px)";

function isMobileLayout() {
  return window.matchMedia(MOBILE_BREAKPOINT).matches;
}

function renderDateDisplay() {
  if (dateDisplay) {
    dateDisplay.textContent = formatDateDisplay(state.date);
  }
}

function renderWeekStrip() {
  if (!weekDaysStrip) return;
  weekDaysStrip.innerHTML = "";

  const currentDate = parseDateInput(state.date);
  const monday = getMondayOfDate(currentDate);
  const todayStr = toDateString(new Date());

  for (let i = 0; i < 5; i++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    const dayStr = toDateString(dayDate);
    const isSelected = dayStr === state.date;
    const isToday = dayStr === todayStr;

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `day-tab ${isSelected ? "active" : ""}`.trim();
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(isSelected));
    tab.setAttribute("aria-label", `${SHORT_WEEKDAYS[i]}, ${dayDate.getDate()}`);

    tab.innerHTML = `
      <span class="day-name">${SHORT_WEEKDAYS[i]}</span>
      <span class="day-num">${dayDate.getDate()}</span>
      ${isToday ? '<span class="today-dot" title="Today"></span>' : ""}
    `;

    tab.addEventListener("click", () => {
      if (state.date !== dayStr) {
        state.date = dayStr;
        renderDateDisplay();
        renderWeekStrip();
        if (calendarState.isExpanded) {
          renderMonthCalendar();
        }
        void loadMealPlan();
      }
    });

    weekDaysStrip.appendChild(tab);
  }

  if (todayButton) {
    todayButton.hidden = state.date === todayStr;
  }
}

function renderMonthCalendar() {
  if (!monthCalendar || !monthDaysGrid || !monthLabel) return;

  const viewDate = new Date(calendarState.viewYear, calendarState.viewMonth, 1);
  monthLabel.textContent = MONTH_YEAR_FORMATTER.format(viewDate);

  monthDaysGrid.innerHTML = "";

  const firstDayOfWeek = (viewDate.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const daysInMonth = new Date(calendarState.viewYear, calendarState.viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calendarState.viewYear, calendarState.viewMonth, 0).getDate();

  const todayStr = toDateString(new Date());

  // Previous month padding days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const prevDate = new Date(calendarState.viewYear, calendarState.viewMonth - 1, daysInPrevMonth - i);
    const dayStr = toDateString(prevDate);
    const isWeekendDay = prevDate.getDay() === 0 || prevDate.getDay() === 6;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cal-day other-month ${isWeekendDay ? "weekend" : ""}`.trim();
    btn.textContent = String(prevDate.getDate());
    if (isWeekendDay) {
      btn.disabled = true;
      btn.title = "Closed on weekends";
    } else {
      btn.addEventListener("click", () => selectCalendarDate(dayStr));
    }
    monthDaysGrid.appendChild(btn);
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const curDate = new Date(calendarState.viewYear, calendarState.viewMonth, day);
    const dayStr = toDateString(curDate);
    const isSelected = dayStr === state.date;
    const isToday = dayStr === todayStr;
    const isWeekendDay = curDate.getDay() === 0 || curDate.getDay() === 6;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cal-day ${isSelected ? "active" : ""} ${isToday ? "today" : ""} ${isWeekendDay ? "weekend" : ""}`.trim();
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-selected", String(isSelected));
    btn.innerHTML = `${day}${isToday ? '<span class="cal-dot"></span>' : ""}`;

    if (isWeekendDay) {
      btn.disabled = true;
      btn.title = "Closed on weekends";
    } else {
      btn.addEventListener("click", () => selectCalendarDate(dayStr));
    }
    monthDaysGrid.appendChild(btn);
  }

  // Next month padding days to complete 7-day row
  const totalRendered = firstDayOfWeek + daysInMonth;
  const remainingDays = (7 - (totalRendered % 7)) % 7;
  for (let day = 1; day <= remainingDays; day++) {
    const nextDate = new Date(calendarState.viewYear, calendarState.viewMonth + 1, day);
    const dayStr = toDateString(nextDate);
    const isWeekendDay = nextDate.getDay() === 0 || nextDate.getDay() === 6;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cal-day other-month ${isWeekendDay ? "weekend" : ""}`.trim();
    btn.textContent = String(day);
    if (isWeekendDay) {
      btn.disabled = true;
      btn.title = "Closed on weekends";
    } else {
      btn.addEventListener("click", () => selectCalendarDate(dayStr));
    }
    monthDaysGrid.appendChild(btn);
  }
}

function selectCalendarDate(dayStr) {
  state.date = dayStr;
  renderDateDisplay();
  renderWeekStrip();
  toggleMonthCalendar(false);
  void loadMealPlan();
}

function toggleMonthCalendar(forceOpen) {
  const nextExpanded = typeof forceOpen === "boolean" ? forceOpen : !calendarState.isExpanded;
  calendarState.isExpanded = nextExpanded;

  if (nextExpanded) {
    const selectedDate = parseDateInput(state.date);
    calendarState.viewYear = selectedDate.getFullYear();
    calendarState.viewMonth = selectedDate.getMonth();
    renderMonthCalendar();
  }

  if (monthCalendar) {
    monthCalendar.hidden = !nextExpanded;
  }
  if (calendarToggleBtn) {
    calendarToggleBtn.setAttribute("aria-expanded", String(nextExpanded));
  }
  if (calendarToggleText) {
    calendarToggleText.textContent = nextExpanded ? "Close" : "Month";
  }
}

function shiftCalendarMonth(offset) {
  const d = new Date(calendarState.viewYear, calendarState.viewMonth + offset, 1);
  calendarState.viewYear = d.getFullYear();
  calendarState.viewMonth = d.getMonth();
  renderMonthCalendar();
}

function resetModalZoom() {
  modalState.isZoomed = false;
  modalState.scale = 1;
  modalState.translateX = 0;
  modalState.translateY = 0;
  imageModalContent.classList.remove("zoomed", "dragging");
  imageModalContent.style.transform = "";
  imageModal.style.backgroundColor = "";
}

function preloadAdjacentImages() {
  const { urls, index } = modalState;
  if (urls.length <= 1) return;
  const nextIdx = (index + 1) % urls.length;
  const prevIdx = (index - 1 + urls.length) % urls.length;
  if (urls[nextIdx]) {
    const imgNext = new Image();
    imgNext.src = urls[nextIdx];
  }
  if (urls[prevIdx]) {
    const imgPrev = new Image();
    imgPrev.src = urls[prevIdx];
  }
}

function renderModalDots() {
  if (!imageModalDots) return;
  imageModalDots.innerHTML = "";
  const total = modalState.urls.length;
  if (total <= 1) {
    imageModalDots.hidden = true;
    return;
  }
  imageModalDots.hidden = false;

  for (let i = 0; i < total; i++) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `lb-dot ${i === modalState.index ? "active" : ""}`.trim();
    dot.setAttribute("aria-label", `Photo ${i + 1} of ${total}`);
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-selected", String(i === modalState.index));
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      goToModalImage(i);
    });
    imageModalDots.appendChild(dot);
  }
}

function renderModalImage() {
  if (modalState.urls.length === 0) return;

  const index = Math.min(Math.max(modalState.index, 0), modalState.urls.length - 1);
  modalState.index = index;

  resetModalZoom();

  const imageUrl = modalState.urls[index];
  const total = modalState.urls.length;
  const mealName = modalState.mealName || "Meal photo";

  if (imageModalViewport) {
    imageModalViewport.classList.add("loading");
  }

  imageModalContent.src = imageUrl;
  imageModalContent.alt = `${mealName} (${index + 1}/${total})`;
  imageModalCaption.textContent = mealName;
  imageModalCounter.textContent = `${index + 1} / ${total}`;

  imageModalContent.onload = () => {
    if (imageModalViewport) {
      imageModalViewport.classList.remove("loading");
    }
  };

  const singleImage = total <= 1;
  imageModalPrev.hidden = singleImage;
  imageModalNext.hidden = singleImage;
  imageModalCounter.hidden = singleImage;

  renderModalDots();
  preloadAdjacentImages();
}

function goToModalImage(newIndex) {
  if (modalState.urls.length === 0) return;
  const total = modalState.urls.length;
  modalState.index = (newIndex + total) % total;
  renderModalImage();
}

function showPreviousModalImage() {
  if (modalState.urls.length <= 1) return;
  goToModalImage(modalState.index - 1);
}

function showNextModalImage() {
  if (modalState.urls.length <= 1) return;
  goToModalImage(modalState.index + 1);
}

function toggleModalZoom() {
  if (modalState.isZoomed) {
    resetModalZoom();
  } else {
    modalState.isZoomed = true;
    modalState.scale = 2;
    imageModalContent.classList.add("zoomed");
    imageModalContent.style.transform = `scale(${modalState.scale})`;
  }
}

function openImageModal(urls, startIndex, mealName) {
  if (!Array.isArray(urls) || urls.length === 0) return;

  modalState.urls = urls;
  modalState.index = Number.isInteger(startIndex) ? startIndex : 0;
  modalState.mealName = String(mealName ?? "");

  renderModalImage();
  if (typeof imageModal.showModal === "function") {
    if (!imageModal.open) {
      imageModal.showModal();
    }
  } else {
    imageModal.setAttribute("open", "");
  }
  document.body.style.overflow = "hidden";
}

function closeImageModal() {
  if (typeof imageModal.close === "function") {
    if (imageModal.open) {
      imageModal.close();
    }
  } else {
    imageModal.removeAttribute("open");
  }
  imageModalContent.src = "";
  modalState.urls = [];
  modalState.index = 0;
  modalState.mealName = "";
  resetModalZoom();
  document.body.style.overflow = "";
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
    <span class="rating-stars" role="img" aria-label="${clampedAverage.toFixed(1)} of 5 stars">${stars}</span>
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
  const { vegan, vegetarian, noPork, favoritesOnly } = state.activeFilters;

  return meals.filter((meal) => {
    const mealId = String(meal.id ?? "");
    const mealType = meal.mealType;

    // Favorites only filter
    if (favoritesOnly && !state.favorites.has(mealId)) {
      return false;
    }

    // Dietary filters
    if (vegan && mealType !== "VEGAN") {
      return false;
    }
    if (vegetarian && mealType !== "VEGAN" && mealType !== "VEGETARIAN") {
      return false;
    }
    if (noPork && (mealType === "PORK" || mealType === "PORK_AW")) {
      return false;
    }

    return true;
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
  const { mealCount } = summarizeLines(lines);
  const filterActive = Object.values(state.activeFilters).some(Boolean);
  const filterIndicator = filterActive ? " (filtered)" : "";
  summaryMessage.textContent = `${mealCount} meals${filterIndicator}`;
}

function renderSkeletons() {
  const skeletonCard = `
    <article class="skeleton-card" aria-hidden="true">
      <div class="skeleton-shimmer skeleton-title"></div>
      <div class="meal-layout">
        <div class="skeleton-shimmer meal-skeleton-image"></div>
        <div class="meal-content" style="display: grid; gap: 0.5rem;">
          <div class="skeleton-shimmer skeleton-text"></div>
          <div class="skeleton-shimmer skeleton-subtext"></div>
        </div>
      </div>
    </article>
  `;
  mealPlanContainer.innerHTML = skeletonCard + skeletonCard + skeletonCard;
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
  let totalRenderedMeals = 0;

  const lineMarkup = lines
    .map((line) => {
      const allMeals = Array.isArray(line.meals) ? line.meals : [];
      const meals = filterMeals(allMeals);

      if (meals.length === 0) {
        return "";
      }

      const mealsMarkup = meals
        .map((meal) => {
          totalRenderedMeals += 1;
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

          const fetchPriority = totalRenderedMeals <= 2 ? `fetchpriority="high"` : "";
          const imageMarkup = hideImageForFreeMeal
            ? ""
            : imageUrls.length > 0
              ? `
                <div class="meal-image-wrap">
                  <img
                    class="meal-image"
                    loading="lazy"
                    decoding="async"
                    ${fetchPriority}
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

function transitionView(callback) {
  if (
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    document.startViewTransition(callback);
  } else {
    callback();
  }
}

async function fetchMealPlan(date, forceRefresh = false) {
  const headers = { "Content-Type": "application/json" };
  if (forceRefresh) {
    headers["Cache-Control"] = "no-cache";
    headers["Pragma"] = "no-cache";
    headers["X-Refresh"] = "true";
  }

  const endpoint = forceRefresh ? `${API_URL}?refresh=1` : API_URL;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
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

async function loadMealPlan(options = {}) {
  const forceRefresh = options.forceRefresh ?? false;
  const date = state.date;
  renderDateDisplay();

  setStatus("");
  state.isLoading = true;

  if (forceRefresh) {
    refreshButton.classList.add("refreshing");
  }

  // If container is empty, show skeleton loaders
  if (!mealPlanContainer.hasChildNodes() || mealPlanContainer.querySelector(".empty")) {
    renderSkeletons();
  }

  try {
    const canteens = await fetchMealPlan(date, forceRefresh);
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
    state.isLoading = false;
    refreshButton.classList.remove("refreshing");
    renderCanteenOptions();
    transitionView(() => renderMealPlan());
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
  renderWeekStrip();
  if (calendarState.isExpanded) {
    renderMonthCalendar();
  }
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

function setupTouchGestures() {
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchend",
    (event) => {
      if (imageModal.open) return;
      if (isTextInputFocused()) return;
      if (event.changedTouches.length !== 1) return;

      const deltaX = event.changedTouches[0].clientX - touchStartX;
      const deltaY = event.changedTouches[0].clientY - touchStartY;

      // Ensure horizontal swipe is dominant and exceeds threshold (60px)
      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0) {
          // Swipe left -> Next day
          shiftDate(1);
        } else {
          // Swipe right -> Prev day
          shiftDate(-1);
        }
      }
    },
    { passive: true },
  );
}

function setupLightboxGestures() {
  let touchStartX = 0;
  let touchStartY = 0;
  let currentX = 0;
  let currentY = 0;
  let isDragging = false;
  let lastTapTime = 0;
  const overlay = imageModal.querySelector(".lightbox-overlay");

  if (!imageModalViewport) return;

  imageModalViewport.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;

      const now = Date.now();
      if (now - lastTapTime < 300) {
        event.preventDefault();
        toggleModalZoom();
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;

      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      currentX = touchStartX;
      currentY = touchStartY;
      isDragging = true;
    },
    { passive: false },
  );

  imageModalViewport.addEventListener(
    "touchmove",
    (event) => {
      if (!isDragging || event.touches.length !== 1) return;

      currentX = event.touches[0].clientX;
      currentY = event.touches[0].clientY;
      const deltaX = currentX - touchStartX;
      const deltaY = currentY - touchStartY;

      if (modalState.isZoomed) {
        modalState.translateX = deltaX / modalState.scale;
        modalState.translateY = deltaY / modalState.scale;
        imageModalContent.classList.add("dragging");
        imageModalContent.style.transform = `scale(${modalState.scale}) translate3d(${modalState.translateX}px, ${modalState.translateY}px, 0)`;
        return;
      }

      // Vertical drag down to dismiss
      if (deltaY > 0 && Math.abs(deltaY) > Math.abs(deltaX) * 0.8) {
        event.preventDefault();
        imageModalContent.classList.add("dragging");
        const progress = Math.min(deltaY / 400, 1);
        const scaleVal = 1 - progress * 0.25;
        imageModalContent.style.transform = `translate3d(0, ${deltaY}px, 0) scale(${scaleVal})`;
        imageModal.style.backgroundColor = `rgba(4, 15, 13, ${0.96 * (1 - progress * 0.75)})`;
        return;
      }

      // Horizontal swipe feedback
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        imageModalContent.classList.add("dragging");
        imageModalContent.style.transform = `translate3d(${deltaX * 0.45}px, 0, 0)`;
      }
    },
    { passive: false },
  );

  imageModalViewport.addEventListener(
    "touchend",
    () => {
      if (!isDragging) return;
      isDragging = false;
      imageModalContent.classList.remove("dragging");

      if (modalState.isZoomed) {
        return;
      }

      const deltaX = currentX - touchStartX;
      const deltaY = currentY - touchStartY;

      // Check vertical swipe down to dismiss (threshold: 90px)
      if (deltaY > 90 && Math.abs(deltaY) > Math.abs(deltaX)) {
        closeImageModal();
        return;
      }

      // Check horizontal swipe (threshold: 45px)
      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) {
          showNextModalImage();
        } else {
          showPreviousModalImage();
        }
        return;
      }

      resetModalZoom();
    },
    { passive: true },
  );

  imageModalContent.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    toggleModalZoom();
  });
}

async function bootstrap() {
  renderDateDisplay();
  renderWeekStrip();

  canteenSelect.addEventListener("change", () => {
    state.selectedCanteenId = canteenSelect.value;
    transitionView(() => renderMealPlan());
  });

  priceModeSelect.addEventListener("change", () => {
    state.priceMode = priceModeSelect.value;
    transitionView(() => renderMealPlan());
  });

  if (todayButton) {
    todayButton.addEventListener("click", () => {
      const todayStr = toDateString(new Date());
      if (state.date !== todayStr) {
        state.date = todayStr;
        renderDateDisplay();
        renderWeekStrip();
        void loadMealPlan();
      }
    });
  }

  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const filterKey = chip.dataset.filter;
      if (!filterKey || !(filterKey in state.activeFilters)) return;

      state.activeFilters[filterKey] = !state.activeFilters[filterKey];
      chip.setAttribute("aria-pressed", String(state.activeFilters[filterKey]));
      transitionView(() => renderMealPlan());
    });
  });

  if (calendarToggleBtn) {
    calendarToggleBtn.addEventListener("click", () => toggleMonthCalendar());
  }

  if (monthPrevBtn) {
    monthPrevBtn.addEventListener("click", () => shiftCalendarMonth(-1));
  }

  if (monthNextBtn) {
    monthNextBtn.addEventListener("click", () => shiftCalendarMonth(1));
  }

  prevDayButton.addEventListener("click", () => shiftDate(-1));
  refreshButton.addEventListener("click", () => {
    void loadMealPlan({ forceRefresh: true });
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
  imageModalPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    showPreviousModalImage();
  });
  imageModalNext.addEventListener("click", (e) => {
    e.stopPropagation();
    showNextModalImage();
  });

  imageModal.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target === imageModal ||
      target.classList.contains("lb-body") ||
      target.classList.contains("lb-img-container") ||
      target.id === "imageModalViewport"
    ) {
      if (modalState.isZoomed) {
        resetModalZoom();
      } else {
        closeImageModal();
      }
    }
  });

  imageModal.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeImageModal();
  });

  window.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const isPrev = key === "a" || key === "arrowleft";
    const isNext = key === "d" || key === "arrowright";

    if (imageModal.open) {
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
    renderDateDisplay();
  });

  setupTouchGestures();
  setupLightboxGestures();
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
