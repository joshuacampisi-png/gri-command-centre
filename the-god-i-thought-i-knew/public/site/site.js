/* mosescampisi.com — launch page behaviour */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- hero image ----------
     The hero wants a high-resolution photograph of Moses. Until that file is in
     place we fall back to the cover artwork rather than shipping a broken image. */
  var hero = document.getElementById('hero-img');
  if (hero) {
    hero.addEventListener('error', function () {
      hero.src = 'media/cover-art.webp';
      hero.alt = 'The cover artwork for The God I Thought I Knew';
      hero.dataset.fallback = 'true';
    }, { once: true });
  }

  /* ---------- scroll reveals ---------- */
  var revealables = document.querySelectorAll('.reveal, .rise');
  if (reduce || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    revealables.forEach(function (el) { io.observe(el); });
    // The hero is above the fold: bring it in on load rather than on scroll.
    requestAnimationFrame(function () {
      document.querySelectorAll('.hero .rise').forEach(function (el) { el.classList.add('in'); });
    });
  }

  /* ---------- nav + hero parallax ---------- */
  var nav = document.getElementById('nav');
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    nav.classList.toggle('solid', y > 60);
    if (hero && !reduce && y < window.innerHeight * 1.2) {
      hero.style.transform = 'scale(1.06) translate3d(0,' + (y * 0.16).toFixed(1) + 'px,0)';
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- checkout ----------
     Every CTA routes through startCheckout. To go live with Stripe, replace the
     body of this function with a redirect to the Checkout Session and delete the
     modal markup; nothing else on the page needs to change. */
  var modal = document.getElementById('checkout');
  var lastFocus = null;

  function startCheckout() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    var input = document.getElementById('email');
    if (input) setTimeout(function () { input.focus(); }, 60);
    document.addEventListener('keydown', onModalKey);
  }

  function closeCheckout() {
    modal.hidden = true;
    document.removeEventListener('keydown', onModalKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onModalKey(e) {
    if (e.key === 'Escape') closeCheckout();
    if (e.key !== 'Tab') return;
    var f = modal.querySelectorAll('button, input, [href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  document.querySelectorAll('.js-buy').forEach(function (b) {
    b.addEventListener('click', startCheckout);
  });
  modal.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', closeCheckout);
  });

  var form = document.getElementById('notify');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('email');
      var note = document.getElementById('notify-note');
      if (!input.value || input.validity.typeMismatch || input.value.indexOf('@') < 1) {
        note.textContent = 'That email does not look right.';
        input.focus();
        return;
      }
      // No mailing list is wired up yet; hand the address to the author directly.
      var subject = encodeURIComponent('The God I Thought I Knew — notify me');
      var body = encodeURIComponent('Please let me know when the book is available.\n\n' + input.value);
      window.location.href = 'mailto:joshuacampisi@gmail.com?subject=' + subject + '&body=' + body;
      note.textContent = 'Thank you. Your email app will open.';
    });
  }

  /* ---------- year ---------- */
  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
})();
