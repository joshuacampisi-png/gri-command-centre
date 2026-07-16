/* Peptide Tests Australia — front-end interactions
   Static/placeholder build: no backend calls. Booking produces a local
   reference and confirmation. Wire the form POST to a real endpoint later. */
(function () {
  "use strict";

  var BASE_PER_VIAL = 350;      // AUD, base rate
  // Each batch tier stacks a 15% discount (0.85^steps). Exact literals avoid
  // floating-point underflow so the calculator matches the pricing cards to the cent.
  var FACTORS = [1, 0.85, 0.7225, 0.614125];

  /* Number of stacked 15% reductions for a given vial count. */
  function discountSteps(qty) {
    if (qty >= 10) return 3;
    if (qty >= 5) return 2;
    if (qty >= 2) return 1;
    return 0;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function price(qty) {
    var steps = discountSteps(qty);
    var factor = FACTORS[steps];
    var perVial = round2(BASE_PER_VIAL * factor);
    var total = round2(BASE_PER_VIAL * qty * factor);
    var list = BASE_PER_VIAL * qty;
    return {
      steps: steps,
      perVial: perVial,
      total: total,
      list: list,
      discount: round2(list - total),
      pct: Math.round((1 - factor) * 100)
    };
  }

  function money(n) {
    return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyRound(n) {
    return "$" + Math.round(n).toLocaleString("en-AU");
  }

  /* ---------- Live order summary ---------- */
  function selectedQty() {
    var el = document.querySelector('input[name="qty"]:checked');
    return el ? parseInt(el.value, 10) : 5;
  }

  function updateSummary() {
    var qty = selectedQty();
    var p = price(qty);
    var set = function (id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };

    set("sQty", qty);
    set("sList", money(p.list));
    set("sDiscLbl", p.steps > 0 ? "Stacked discount (" + p.pct + "%)" : "Discount");
    set("sDisc", p.discount > 0 ? "−" + money(p.discount) : "$0.00");
    set("sPer", money(p.perVial) + " / vial");

    var parts = p.total.toFixed(2).split(".");
    set("sTotal", Number(parts[0]).toLocaleString("en-AU"));
    set("sTotalDec", "." + parts[1]);
  }

  document.querySelectorAll('input[name="qty"]').forEach(function (r) {
    r.addEventListener("change", updateSummary);
  });
  updateSummary();

  /* ---------- Pricing-card buttons preselect a batch ---------- */
  document.querySelectorAll("[data-qty]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var q = btn.getAttribute("data-qty");
      var radio = document.querySelector('input[name="qty"][value="' + q + '"]');
      if (radio) { radio.checked = true; updateSummary(); }
    });
  });

  /* ---------- Booking submit ---------- */
  var form = document.getElementById("bookForm");
  var step = document.getElementById("formStep");
  var confirmBox = document.getElementById("confirmBox");

  function makeRef() {
    var d = new Date();
    var yy = String(d.getFullYear()).slice(-2);
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var rand = Math.floor(1000 + Math.random() * 9000);
    return "PTA-" + yy + mm + "-" + rand;
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = (document.getElementById("fname").value || "").trim();
      var email = (document.getElementById("femail").value || "").trim();
      if (!name) { document.getElementById("fname").focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { document.getElementById("femail").focus(); return; }

      var qty = selectedQty();
      var p = price(qty);
      var ref = makeRef();

      document.getElementById("cName").textContent = name.split(" ")[0];
      document.getElementById("cRef").textContent = ref;
      document.getElementById("cQty").textContent = qty;
      document.getElementById("cTotal").textContent = Number(p.total.toFixed(2).split(".")[0]).toLocaleString("en-AU");

      step.style.display = "none";
      confirmBox.classList.add("show");
      confirmBox.scrollIntoView({ behavior: "smooth", block: "center" });

      /* Placeholder: POST {name,email,qty,total,ref,peptide,notes} to a booking
         endpoint / payment provider here in production. */
    });
  }

  var again = document.getElementById("againBtn");
  if (again) {
    again.addEventListener("click", function () {
      confirmBox.classList.remove("show");
      step.style.display = "block";
      form.reset();
      var five = document.querySelector('input[name="qty"][value="5"]');
      if (five) five.checked = true;
      updateSummary();
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq-q").forEach(function (q) {
    q.addEventListener("click", function () {
      var item = q.parentElement;
      var answer = q.nextElementSibling;
      var open = item.classList.toggle("open");
      answer.style.maxHeight = open ? answer.scrollHeight + "px" : null;
    });
  });

  /* ---------- Mobile nav ---------- */
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }
})();
