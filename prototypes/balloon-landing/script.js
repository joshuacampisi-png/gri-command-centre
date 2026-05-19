// Gender Reveal & Party Balloons — landing page prototype
// Brisbane AEST = UTC+10 fixed (no DST in QLD).

const AEST_OFFSET_MIN = 10 * 60;
const SAME_DAY_CUTOFF_HOUR_AEST = 14;   // 2pm AEST
const SAME_DAY_OPEN_HOUR_AEST = 7;      // 7am AEST
const PICKUP_OPEN_HOUR = 7;
const PICKUP_CLOSE_HOUR = 18;
const LEAD_MINUTES = 60;

// ——— AEST helpers ———
function nowInAest() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + AEST_OFFSET_MIN * 60000);
}
function aestToday() {
  const d = nowInAest();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isSameDayAest(isoDate) {
  return isoDate === aestToday();
}

// ——— Element refs ———
const form = document.getElementById("order-form");
const numberCountInputs = form.querySelectorAll('input[name="numberCount"]');
const bundleInputs = form.querySelectorAll('input[name="bundle"]');
const colourInputs = form.querySelectorAll('input[name="colour"]');
const fulfilmentInputs = form.querySelectorAll('input[name="fulfilment"]');
const digit1 = form.elements.digit1;
const digit2 = form.elements.digit2;
const digit2Wrap = document.getElementById("digit2-wrap");
const digitsPlural = document.getElementById("digits-plural");
const dateInput = document.getElementById("pickup-date");
const timeSelect = document.getElementById("pickup-time");
const dateLegendText = document.getElementById("date-legend-text");
const dateError = document.getElementById("date-error");
const infoBtn = document.getElementById("info-btn");
const infoPop = document.getElementById("info-pop");
const fulfilmentHint = document.getElementById("fulfilment-hint");
const cta = document.getElementById("cta");

// Summary refs
const sumBundle = document.getElementById("sum-bundle");
const sumNumber = document.getElementById("sum-number");
const sumColour = document.getElementById("sum-colour");
const sumFulfilment = document.getElementById("sum-fulfilment");
const sumWhen = document.getElementById("sum-when");

// ——— Gallery ———
document.querySelectorAll(".thumb").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".thumb").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("gallery-main-img").src = t.dataset.src;
  });
});

// ——— Bundle ↔ count sync ———
function syncCountAndBundle(source) {
  const count = form.elements.numberCount.value;
  const bundle = form.elements.bundle.value;
  if (source === "count") {
    const want = count === "2" ? "double" : "single";
    if (bundle !== want) {
      form.querySelector(`input[name="bundle"][value="${want}"]`).checked = true;
    }
  } else if (source === "bundle") {
    const want = bundle === "double" ? "2" : "1";
    if (count !== want) {
      form.querySelector(`input[name="numberCount"][value="${want}"]`).checked = true;
    }
  }
  // Show / hide second digit
  const isDouble = form.elements.bundle.value === "double";
  digit2Wrap.hidden = !isDouble;
  digitsPlural.textContent = isDouble ? "s" : "";
}
numberCountInputs.forEach((i) => i.addEventListener("change", () => { syncCountAndBundle("count"); updateSummary(); }));
bundleInputs.forEach((i) => i.addEventListener("change", () => { syncCountAndBundle("bundle"); updateSummary(); }));

// ——— Fulfilment hint ———
fulfilmentInputs.forEach((i) =>
  i.addEventListener("change", () => {
    const v = form.elements.fulfilment.value;
    fulfilmentHint.textContent =
      v === "pickup"
        ? "Pickup from our Brisbane studio. Address shared on order confirmation."
        : "Delivery available Brisbane & Gold Coast. Fee calculated at checkout.";
    dateLegendText.textContent = v === "pickup" ? "Pickup date & time" : "Delivery date & time";
    updateSummary();
  })
);

// ——— Date & time logic ———
function setDateBounds() {
  // Min date = today (AEST) unless past 2pm AEST → tomorrow
  const aestNow = nowInAest();
  const pastCutoff = aestNow.getHours() >= SAME_DAY_CUTOFF_HOUR_AEST;
  const minDate = new Date(aestNow);
  if (pastCutoff) minDate.setDate(minDate.getDate() + 1);
  const iso = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, "0")}-${String(minDate.getDate()).padStart(2, "0")}`;
  dateInput.min = iso;
  if (!dateInput.value || dateInput.value < iso) dateInput.value = iso;
}

function buildTimeOptions() {
  timeSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = "Select a time";
  timeSelect.appendChild(placeholder);

  const sameDay = isSameDayAest(dateInput.value);
  const aestNow = nowInAest();
  // Same-day window: 7am – 2pm with min 1hr lead time from current AEST time.
  // Other days: 7am – 6pm.
  const openHour = PICKUP_OPEN_HOUR;
  const closeHour = sameDay ? SAME_DAY_CUTOFF_HOUR_AEST : PICKUP_CLOSE_HOUR;

  // Earliest allowed slot
  let earliest = new Date(aestNow);
  if (sameDay) {
    earliest.setMinutes(earliest.getMinutes() + LEAD_MINUTES);
  } else {
    earliest.setHours(openHour, 0, 0, 0);
  }

  let added = 0;
  for (let h = openHour; h < closeHour; h++) {
    for (const m of [0, 15, 30, 45]) {
      const slot = new Date(aestNow);
      slot.setFullYear(parseInt(dateInput.value.slice(0, 4)));
      slot.setMonth(parseInt(dateInput.value.slice(5, 7)) - 1);
      slot.setDate(parseInt(dateInput.value.slice(8, 10)));
      slot.setHours(h, m, 0, 0);
      if (sameDay && slot < earliest) continue;
      const opt = document.createElement("option");
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      opt.value = `${hh}:${mm}`;
      const display = formatTime12(h, m);
      opt.textContent = display;
      timeSelect.appendChild(opt);
      added++;
    }
  }

  if (added === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.disabled = true;
    opt.textContent = "No slots available — pick another date";
    timeSelect.appendChild(opt);
  }
}

function formatTime12(h, m) {
  const am = h < 12;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${am ? "am" : "pm"}`;
}

function validateDate() {
  dateError.hidden = true;
  dateError.textContent = "";
  if (!dateInput.value) return true;
  const aestNow = nowInAest();
  const pastCutoff = aestNow.getHours() >= SAME_DAY_CUTOFF_HOUR_AEST;
  if (isSameDayAest(dateInput.value) && pastCutoff) {
    dateError.textContent = "Same-day cutoff has passed (2pm AEST). Please pick tomorrow or later.";
    dateError.hidden = false;
    return false;
  }
  if (dateInput.value < dateInput.min) {
    dateError.textContent = "Date is in the past. Please pick a future date.";
    dateError.hidden = false;
    return false;
  }
  return true;
}

dateInput.addEventListener("change", () => {
  if (validateDate()) {
    buildTimeOptions();
  } else {
    timeSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = "Select a date first";
    timeSelect.appendChild(opt);
  }
  updateSummary();
});
timeSelect.addEventListener("change", updateSummary);

// ——— Info popover ———
infoBtn.addEventListener("click", () => {
  const open = infoPop.hidden;
  infoPop.hidden = !open;
  infoBtn.setAttribute("aria-expanded", String(open));
});

// ——— Digit changes ———
digit1.addEventListener("change", updateSummary);
digit2.addEventListener("change", updateSummary);
colourInputs.forEach((i) => i.addEventListener("change", updateSummary));

// ——— Summary ———
function updateSummary() {
  const bundle = form.elements.bundle.value;
  sumBundle.textContent = bundle === "double" ? "2 Numbers + Bundle" : "1 Number + Bundle";

  const n1 = digit1.value;
  const n2 = digit2Wrap.hidden ? "" : (digit2.value || "");
  if (bundle === "double") {
    sumNumber.textContent = n1 && n2 ? `${n1}${n2}` : "—";
  } else {
    sumNumber.textContent = n1 || "—";
  }

  const colour = form.querySelector('input[name="colour"]:checked');
  const colourLabel = colour ? colour.closest(".swatch").querySelector(".swatch-label").textContent : "—";
  sumColour.textContent = colourLabel;

  sumFulfilment.textContent = form.elements.fulfilment.value === "pickup" ? "Pickup" : "Delivery";

  if (dateInput.value && timeSelect.value) {
    const dateStr = new Date(dateInput.value + "T00:00:00").toLocaleDateString("en-AU", {
      weekday: "short", day: "numeric", month: "short",
    });
    const [hh, mm] = timeSelect.value.split(":").map(Number);
    sumWhen.textContent = `${dateStr} · ${formatTime12(hh, mm)}`;
  } else {
    sumWhen.textContent = "—";
  }

  cta.disabled = !canSubmit();
}

function canSubmit() {
  if (!digit1.value) return false;
  if (!digit2Wrap.hidden && !digit2.value) return false;
  if (!dateInput.value || !timeSelect.value) return false;
  if (!validateDate()) return false;
  return true;
}

// ——— Submit ———
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!canSubmit()) return;
  const payload = {
    bundle: form.elements.bundle.value,
    number: form.elements.bundle.value === "double" ? `${digit1.value}${digit2.value}` : digit1.value,
    colour: form.elements.colour.value,
    fulfilment: form.elements.fulfilment.value,
    date: dateInput.value,
    time: timeSelect.value,
  };
  // TODO: replace with Shopify cart/checkout integration when porting
  console.log("Order payload", payload);
  alert(`Order ready!\n\n${JSON.stringify(payload, null, 2)}`);
});

// ——— Init ———
setDateBounds();
buildTimeOptions();
syncCountAndBundle("count");
updateSummary();
