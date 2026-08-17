/* ============================================================
   The God I Thought I Knew — reader
   Pagination is measured once per chapter against the real page
   box, then split at line boundaries using Range geometry, so the
   whole book lays out in a handful of layout passes rather than
   one per page.
   ============================================================ */
(function () {
  'use strict';

  var LS = {
    pos: 'tgitik.folio',
    theme: 'tgitik.theme',
    scale: 'tgitik.scale',
  };

  var SPREAD_RATIO = 0.66;      // classic trade-paperback page
  var MIN_SPREAD_W = 900;       // below this we read one page at a time
  var SCALES = [0.85, 0.92, 1, 1.1, 1.22, 1.36];

  var state = {
    book: null,
    pages: [],
    flip: null,
    scaleIdx: 2,
    theme: 'night',
    mode: 'portrait',
    metrics: null,
    chapterPage: {},
    hideTimer: null,
    booted: false,
  };

  var $ = function (s) { return document.querySelector(s); };
  var raf = function () { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); };

  /* ---------------- geometry ---------------- */

  function computeMetrics() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // Room for the top bar and the pager.
    var chromeY = 116;
    var availW = Math.max(240, vw - 24);
    var availH = Math.max(320, vh - chromeY);

    var mode, pw, ph;
    if (availW >= MIN_SPREAD_W && availW / 2 / availH > 0.42) {
      mode = 'landscape';
      ph = availH;
      pw = Math.round(ph * SPREAD_RATIO);
      if (pw * 2 > availW) { pw = Math.floor(availW / 2); ph = Math.round(pw / SPREAD_RATIO); }
      ph = Math.min(ph, availH);
      pw = Math.round(ph * SPREAD_RATIO);
    } else {
      mode = 'portrait';
      // Fill the phone: derive the ratio from the viewport rather than forcing 2:3.
      var r = Math.min(0.78, Math.max(0.5, availW / availH));
      pw = Math.min(availW, Math.round(availH * r));
      ph = Math.round(pw / r);
      if (ph > availH) { ph = availH; pw = Math.round(ph * r); }
    }

    // Type scale: aim for a 60-70 character measure.
    var padX = Math.round(Math.min(58, Math.max(20, pw * 0.098)));
    var innerW = pw - padX * 2;
    var fs = innerW / 32.5;
    fs = Math.max(14.5, Math.min(21, fs)) * SCALES[state.scaleIdx];
    fs = Math.round(fs * 10) / 10;

    var padT = Math.round(Math.max(26, ph * 0.062));
    var padB = Math.round(Math.max(24, ph * 0.055));

    return { mode: mode, pw: pw, ph: ph, padX: padX, padT: padT, padB: padB, fs: fs, lh: 1.62 };
  }

  function applyMetrics(m) {
    var r = document.documentElement.style;
    r.setProperty('--pw', m.pw + 'px');
    r.setProperty('--ph', m.ph + 'px');
    r.setProperty('--pad-x', m.padX + 'px');
    r.setProperty('--pad-t', m.padT + 'px');
    r.setProperty('--pad-b', m.padB + 'px');
    r.setProperty('--fs', m.fs + 'px');
    r.setProperty('--lh', m.lh);
  }

  /* ---------------- page shells ---------------- */

  function pageShell(cls) {
    var d = document.createElement('div');
    d.className = 'page ' + (cls || '');
    d.style.width = state.metrics.pw + 'px';
    d.style.height = state.metrics.ph + 'px';
    return d;
  }

  function textPageHTML(bodyHTML, running, folio) {
    return (
      '<div class="page-face">' +
      '<div class="page-head">' + (running ? '<span class="rh">' + running + '</span>' : '') + '</div>' +
      '<div class="page-body"><div class="flow">' + bodyHTML + '</div></div>' +
      '<div class="page-foot">' + (folio ? '<span class="folio">' + folio + '</span>' : '') + '</div>' +
      '</div>'
    );
  }

  /* ---------------- block rendering ---------------- */

  function blockHTML(b) {
    switch (b.t) {
      case 'chapter':
        return (
          '<div class="chapter-open" data-atomic="1">' +
          (b.label ? '<span class="num">' + b.label + '</span>' : '') +
          '<div class="ttl">' + b.title + '</div>' +
          '<i class="orn"></i>' +
          '</div>'
        );
      case 'p':
        return '<p' + (b.drop ? ' class="drop"' : '') + '>' + b.html + '</p>';
      case 'epigraph':
        return '<p class="epigraph">' + b.html + '</p>';
      case 'sig':
        return '<p class="sig" data-atomic="1">' + b.html + '</p>';
      case 'scene':
        // Drawn rather than set in a glyph: no font has to cover the ornament.
        return '<div class="scene" data-atomic="1" data-scene="1"><i></i><i></i><i></i></div>';
      case 'h3':
        return '<h3 data-atomic="1">' + b.html + '</h3>';
      case 'ul':
        return '<ul data-atomic="1">' + b.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
      default:
        return '';
    }
  }

  /* ---------------- range helpers ---------------- */

  function textNodes(el) {
    var out = [];
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }

  function textLength(el) {
    return textNodes(el).reduce(function (n, t) { return n + t.data.length; }, 0);
  }

  // Map a character offset within el to a (node, offset) pair.
  function locate(el, offset) {
    var nodes = textNodes(el);
    var acc = 0;
    for (var i = 0; i < nodes.length; i++) {
      var len = nodes[i].data.length;
      if (offset <= acc + len) return { node: nodes[i], offset: offset - acc };
      acc += len;
    }
    var last = nodes[nodes.length - 1];
    return last ? { node: last, offset: last.data.length } : { node: el, offset: 0 };
  }

  // Distinct line-box bottoms of an element's text, relative to originY.
  function lineBottoms(el, originY) {
    var r = document.createRange();
    r.selectNodeContents(el);
    var rects = r.getClientRects();
    var out = [];
    for (var i = 0; i < rects.length; i++) {
      var rc = rects[i];
      if (rc.height <= 0) continue;
      var b = rc.bottom - originY;
      if (!out.length || b > out[out.length - 1] + 1.5) out.push(b);
      else if (b > out[out.length - 1]) out[out.length - 1] = b;
    }
    return out;
  }

  // Largest character offset whose rendered bottom is still on or above `target`.
  function offsetAtLine(el, target, originY) {
    var total = textLength(el);
    var r = document.createRange();
    var start = locate(el, 0);
    var lo = 1, hi = total, best = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var end = locate(el, mid);
      try {
        r.setStart(start.node, start.offset);
        r.setEnd(end.node, end.offset);
      } catch (e) { break; }
      var rc = r.getBoundingClientRect();
      if (rc.bottom - originY <= target + 0.6) { best = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    return best;
  }

  // HTML of the character range [from, to) with inline markup preserved.
  function sliceHTML(el, from, to) {
    var clone = el.cloneNode(true);
    var total = textLength(clone);
    if (to < total) {
      var a = locate(clone, to), b = locate(clone, total);
      var r1 = document.createRange();
      r1.setStart(a.node, a.offset);
      r1.setEnd(b.node, b.offset);
      r1.deleteContents();
    }
    if (from > 0) {
      var c = locate(clone, 0), d = locate(clone, from);
      var r2 = document.createRange();
      r2.setStart(c.node, c.offset);
      r2.setEnd(d.node, d.offset);
      r2.deleteContents();
    }
    return clone.innerHTML;
  }

  function openTag(el, extraClass) {
    var tag = el.tagName.toLowerCase();
    var cls = (el.className || '') + (extraClass ? ' ' + extraClass : '');
    cls = cls.replace(/\bdrop\b/, extraClass ? '' : 'drop').trim();
    return '<' + tag + (cls ? ' class="' + cls.trim() + '"' : '') + '>';
  }

  function closeTag(el) { return '</' + el.tagName.toLowerCase() + '>'; }

  /* ---------------- pagination ---------------- */

  function segmentise(blocks) {
    var segs = [];
    var cur = null;
    blocks.forEach(function (b) {
      if (b.t === 'part') { cur = null; segs.push({ kind: 'part', block: b }); return; }
      if (b.t === 'plate') { cur = null; segs.push({ kind: 'plate', block: b }); return; }
      if (b.t === 'break') { cur = null; return; }
      if (b.t === 'chapter' || !cur) { cur = { kind: 'flow', blocks: [] }; segs.push(cur); }
      cur.blocks.push(b);
    });
    return segs;
  }

  async function paginate(book, onProgress) {
    var m = state.metrics;
    var host = $('#measure');
    host.innerHTML = '';

    // A real page, off-screen, so the measure box matches the render box exactly.
    var probe = pageShell('page--single');
    probe.innerHTML = textPageHTML('', 'x', '1');
    host.appendChild(probe);
    var body = probe.querySelector('.page-body');
    var cs = getComputedStyle(body);
    var contentW = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var contentH = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

    var flow = probe.querySelector('.flow');
    flow.style.position = 'relative';
    flow.style.width = contentW + 'px';
    flow.style.height = 'auto';

    var segs = segmentise(book.blocks);
    var pages = [];
    var chapterPage = {};
    var running = book.title;
    var folio = 0;

    function pushText(html, chId) {
      folio++;
      pages.push({ kind: 'text', html: html, running: running, folio: folio, chapterId: chId });
    }

    for (var si = 0; si < segs.length; si++) {
      var seg = segs[si];

      if (seg.kind === 'part') {
        folio++;
        running = seg.block.title;
        pages.push({ kind: 'part', block: seg.block, folio: folio, chapterId: seg.block.id });
        chapterPage[seg.block.id] = pages.length - 1;
        continue;
      }
      if (seg.kind === 'plate') {
        folio++;
        pages.push({ kind: 'plate', block: seg.block, running: running, folio: folio });
        continue;
      }

      var head = seg.blocks[0];
      var chId = head && head.t === 'chapter' ? head.id : null;
      if (head && head.t === 'chapter') running = head.title;

      flow.innerHTML = seg.blocks.map(blockHTML).join('');
      var originY = flow.getBoundingClientRect().top;
      var kids = Array.prototype.slice.call(flow.children);

      var pageTop = 0;
      var buf = [];
      var cursor = 0;
      var elFrom = 0;
      var firstPageOfSeg = true;
      var guard = 0;

      var commit = function () {
        if (!buf.length) return;
        pushText(buf.join(''), firstPageOfSeg ? chId : null);
        if (firstPageOfSeg && chId) chapterPage[chId] = pages.length - 1;
        firstPageOfSeg = false;
        buf = [];
      };

      while (cursor < kids.length && guard++ < 20000) {
        var el = kids[cursor];
        var limit = pageTop + contentH;
        var elTop = el.offsetTop;
        var elBottom = elTop + el.offsetHeight;

        // A scene divider stranded at the top of a page reads as an error.
        if (el.dataset.scene && !buf.length && elFrom === 0) { cursor++; continue; }

        if (elBottom <= limit + 0.5) {
          buf.push(elFrom === 0 ? el.outerHTML : openTag(el, 'cont') + sliceHTML(el, elFrom, textLength(el)) + closeTag(el));
          cursor++; elFrom = 0;
          continue;
        }

        var splittable = !el.dataset.atomic && (el.tagName === 'P') && textLength(el) > 0;

        if (!splittable) {
          if (!buf.length) { // taller than a page on its own: let it overflow rather than loop
            buf.push(el.outerHTML);
            cursor++; elFrom = 0;
            commit();
            pageTop = elBottom;
            continue;
          }
          commit();
          pageTop = elTop;
          continue;
        }

        var bottoms = lineBottoms(el, originY);
        if (bottoms.length < 2) {
          if (!buf.length) { buf.push(el.outerHTML); cursor++; elFrom = 0; commit(); pageTop = elBottom; continue; }
          commit(); pageTop = elTop; continue;
        }

        var startLine = 0;
        while (startLine < bottoms.length && bottoms[startLine] <= pageTop + 0.5) startLine++;

        var k = -1;
        for (var i = bottoms.length - 1; i >= 0; i--) { if (bottoms[i] <= limit + 0.5) { k = i; break; } }

        var kept = k + 1 - startLine;
        var remaining = bottoms.length - (k + 1);

        // Widow control: never carry a single line over, never leave one behind.
        if (remaining === 1 && kept - 1 >= 2) { k--; kept--; remaining = 2; }

        if (k < startLine || kept < 2) {
          if (!buf.length && elFrom === 0) { // nothing else on the page — take what fits
            if (k >= startLine) {
              var off0 = offsetAtLine(el, bottoms[k], originY);
              buf.push(openTag(el, elFrom ? 'cont' : '') + sliceHTML(el, elFrom, off0) + closeTag(el));
              commit();
              pageTop = bottoms[k];
              elFrom = off0;
              continue;
            }
            buf.push(el.outerHTML); cursor++; elFrom = 0; commit(); pageTop = elBottom; continue;
          }
          commit();
          pageTop = elTop;
          continue;
        }

        var off = offsetAtLine(el, bottoms[k], originY);
        if (off <= elFrom) { commit(); pageTop = elTop; continue; }

        buf.push(openTag(el, elFrom ? 'cont' : '') + sliceHTML(el, elFrom, off) + closeTag(el));
        commit();
        pageTop = bottoms[k];
        elFrom = off;
      }
      commit();

      if (onProgress && si % 3 === 0) { onProgress((si + 1) / segs.length); await raf(); }
    }

    host.innerHTML = '';
    state.chapterPage = chapterPage;
    return pages;
  }

  /* ---------------- building the flip book ---------------- */

  function coverHTML() {
    return (
      '<div class="page-face"><div class="cover">' +
      '<div class="art"></div><div class="glow"></div>' +
      '<div class="type">' +
      '<div class="the">The</div>' +
      '<div class="god">God</div>' +
      '<div class="rest">I Thought<br>I Knew</div>' +
      '<div class="div"></div>' +
      '<div class="sub">A journey from religion<br>to real relationship</div>' +
      '</div>' +
      '<div class="author">Moses Campisi</div>' +
      '</div></div>'
    );
  }

  function titlePageHTML() {
    return (
      '<div class="page-face"><div class="titlepage">' +
      '<div class="t1">The God<br>I Thought I Knew</div>' +
      '<div class="t-orn"></div>' +
      '<div class="t2">A journey from religion<br>to real relationship</div>' +
      '<div class="t3">Moses Campisi</div>' +
      '<div class="t4">Written for my children&rsquo;s children</div>' +
      '</div></div>'
    );
  }

  function backCoverHTML() {
    return (
      '<div class="page-face"><div class="backcover">' +
      '<div class="bc-title">The God I Thought I Knew</div>' +
      '<div class="bc-sub">A journey from religion to real relationship</div>' +
      '<div class="bc-orn"><i></i><b></b><i></i></div>' +
      '<div class="lede">Some men inherit land.</div>' +
      '<p>Moses Campisi inherited a faith, carried across four generations and four countries, from a hillside church in Calabria, through the coal mines of Belgium, to the Gold Coast of Australia and the mountains of Sicily.</p>' +
      '<p>His grandfather was a man with a horse, a gun and a fierce heart, until God walked in and overturned everything. His father built a church that seated seven hundred, and a fleet of buses that lifted the family out of the dark of the mines. His mother carried a hidden Bible out of a convent, and a name pressed between its pages that would wait sixteen years to be given.</p>' +
      '<p class="strongline">This is the story of the God who kept showing up. The God who moved through a guitar, a hum, a woman speaking a language she had never learned. The God who gave, and allowed, and never once let go.</p>' +
      '<p>But it is also the story of a harder discovery: that a man can grow up inside the church, know all the words, carry the name, and still have to come to the end of the God he thought he knew, before he could meet the God who was really there.</p>' +
      '<div class="bc-rule"></div>' +
      '<div class="about">' +
      '<div><h4>About the author</h4><p>Moses Campisi was born in Belgium in 1963, the son of an Italian pastor, and has spent his life on the Gold Coast of Australia. This is his story, and the story of the family whose faith he carries, written for his children and for the children who will come after them.</p></div>' +
      '<div class="portrait"><img src="../media/author.webp" alt="Moses Campisi"><span>Moses Campisi</span></div>' +
      '</div>' +
      '<div class="tagline">Faith. Questions. Truth. Grace.<b>A God worth knowing.</b></div>' +
      '</div></div>'
    );
  }

  function partHTML(b, folio) {
    return (
      '<div class="page-face">' +
      '<div class="page-head"></div>' +
      '<div class="page-body"><div class="part-block">' +
      '<div class="lab">' + b.label + '</div>' +
      '<div class="orn"></div>' +
      '<div class="ttl">' + b.title + '</div>' +
      '</div></div>' +
      '<div class="page-foot"><span class="folio">' + folio + '</span></div>' +
      '</div>'
    );
  }

  function plateHTML(b, running, folio) {
    return (
      '<div class="page-face">' +
      '<div class="page-head">' + (running ? '<span class="rh">' + running + '</span>' : '') + '</div>' +
      '<div class="page-body"><figure class="plate">' +
      '<span class="frame"><img src="' + b.src + '" width="' + b.w + '" height="' + b.h + '" alt="' +
      b.caption.replace(/"/g, '&quot;') + '" loading="lazy" decoding="async"></span>' +
      '<figcaption>' + b.caption + '</figcaption>' +
      '</figure></div>' +
      '<div class="page-foot"><span class="folio">' + folio + '</span></div>' +
      '</div>'
    );
  }

  function buildElements(pages) {
    var els = [];
    var cover = pageShell('page--hard');
    cover.dataset.density = 'hard';
    cover.innerHTML = coverHTML();
    els.push(cover);

    var title = pageShell('page--single');
    title.innerHTML = titlePageHTML();
    els.push(title);

    pages.forEach(function (p) {
      var el = pageShell('page--' + (p.kind === 'text' ? 'text' : p.kind));
      if (p.kind === 'text') el.innerHTML = textPageHTML(p.html, p.running, p.folio);
      else if (p.kind === 'part') el.innerHTML = partHTML(p.block, p.folio);
      else if (p.kind === 'plate') el.innerHTML = plateHTML(p.block, p.running, p.folio);
      els.push(el);
    });

    // Keep the leaf count even so the back cover lands on its own.
    if (els.length % 2 !== 0) {
      var blank = pageShell('page--single');
      blank.innerHTML = '<div class="page-face"></div>';
      els.push(blank);
    }

    var back = pageShell('page--hard');
    back.dataset.density = 'hard';
    back.innerHTML = backCoverHTML();
    els.push(back);

    // Left/right gutter shading, assigned once the spread parity is known.
    els.forEach(function (el, i) {
      if (i === 0 || i === els.length - 1) return;
      el.classList.add(i % 2 === 1 ? 'page--left' : 'page--right');
    });

    return els;
  }

  /* ---------------- flip lifecycle ---------------- */

  function startPage(folio) {
    // pages[] is offset by cover + title page.
    if (!folio) return 0;
    for (var i = 0; i < state.pages.length; i++) {
      if (state.pages[i].folio === folio) return i + 2;
    }
    return 0;
  }

  // Tap-to-turn. Drag and swipe stay with the library; we only act on a genuine
  // tap, so a corner fold or a swipe never turns two pages at once.
  function wireTapZones(host) {
    var down = null;
    host.addEventListener('pointerdown', function (e) {
      down = { x: e.clientX, y: e.clientY, t: Date.now() };
    }, { passive: true });

    host.addEventListener('pointercancel', function () { down = null; }, { passive: true });

    // pointerup rather than click: touch taps do not reliably synthesise a click
    // once the library has called preventDefault on the touch sequence.
    host.addEventListener('pointerup', function (e) {
      if (!down) return;
      var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
      var held = Date.now() - down.t;
      down = null;
      if (moved > 12 || held > 500) return;   // that was a drag or a swipe

      var r = host.getBoundingClientRect();
      var x = e.clientX - r.left;
      var spread = host.offsetWidth > state.metrics.pw * 1.5;
      var backZone = spread ? r.width / 2 : r.width * 0.3;
      if (x < backZone) state.flip.flipPrev();
      else state.flip.flipNext();
    });
  }

  function mount(startAt) {
    var host = $('#book');
    host.innerHTML = '';
    var m = state.metrics;
    host.style.width = (m.mode === 'landscape' ? m.pw * 2 : m.pw) + 'px';
    host.style.height = m.ph + 'px';

    var els = buildElements(state.pages);
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    state.flip = new St.PageFlip(host, {
      width: m.pw,
      height: m.ph,
      size: 'fixed',
      showCover: true,
      usePortrait: true,
      autoSize: false,
      maxShadowOpacity: 0.45,
      drawShadow: !reduce,
      flippingTime: reduce ? 1 : 680,
      swipeDistance: 24,
      mobileScrollSupport: false,
      useMouseEvents: true,
      clickEventForward: true,
      // The library only arms its touch handler after a 250ms timeout, so an
      // ordinary quick tap never reaches it. Tap-to-turn is handled below.
      disableFlipByClick: true,
      startPage: Math.min(startAt || 0, els.length - 1),
    });

    state.flip.loadFromHTML(els);
    wireTapZones(host);
    window.__mode = m.mode;
    window.__pf = state.flip;
    state.flip.on('flip', function (e) { onFlip(e.data); });
    state.flip.on('changeOrientation', function () { updateChrome(); });
    onFlip(state.flip.getCurrentPageIndex());
  }

  function currentFolio() {
    var i = state.flip ? state.flip.getCurrentPageIndex() : 0;
    var p = state.pages[i - 2];
    return p ? p.folio : 0;
  }

  function onFlip(index) {
    var total = state.pages.length;
    var p = state.pages[index - 2];
    var label, pct;

    if (index === 0) { label = 'Cover'; pct = 0; }
    else if (index === 1) { label = 'Title page'; pct = 0; }
    else if (!p) { label = 'Back cover'; pct = 100; }
    else {
      pct = Math.round((p.folio / total) * 100);
      label = 'Page ' + p.folio + ' of ' + total + ' · ' + pct + '%';
    }

    $('#fill').style.width = pct + '%';
    $('#plabel').textContent = label;
    // The page carries its own running head; the bar keeps the book's identity.
    $('#rh-text').textContent = state.book.title;

    $('#btn-prev').disabled = index <= 0;
    $('#btn-next').disabled = index >= state.flip.getPageCount() - 1;

    if (p) { try { localStorage.setItem(LS.pos, String(p.folio)); } catch (e) {} }
    markCurrentChapter(index);
    showChrome();
  }

  function markCurrentChapter(index) {
    var best = null;
    Object.keys(state.chapterPage).forEach(function (id) {
      var at = state.chapterPage[id] + 2;
      if (at <= index && (best === null || at > state.chapterPage[best] + 2)) best = id;
    });
    document.querySelectorAll('#toc li').forEach(function (li) {
      li.classList.toggle('is-current', li.dataset.id === best);
    });
  }

  /* ---------------- chrome ---------------- */

  function showChrome() {
    document.body.classList.remove('chrome-hidden');
    clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(function () {
      if (!$('#contents').hidden || !$('#typepanel').hidden) return;
      document.body.classList.add('chrome-hidden');
    }, 3600);
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function buildTOC() {
    var ol = $('#toc');
    ol.innerHTML = '';
    state.book.toc.forEach(function (e) {
      var at = state.chapterPage[e.id];
      if (at === undefined) return;
      var li = document.createElement('li');
      li.dataset.id = e.id;
      if (e.kind === 'part') li.className = 'part-row';
      var folio = state.pages[at] ? state.pages[at].folio : '';
      li.innerHTML =
        '<button type="button">' +
        (e.kind === 'part'
          ? '<span class="t">' + e.label + ' · ' + e.title + '</span>'
          : '<span class="n">' + (e.label || '') + '</span><span class="t">' + e.title + '</span>') +
        '<span class="pg">' + folio + '</span></button>';
      li.querySelector('button').addEventListener('click', function () {
        closeDrawers();
        state.flip.flip(at + 2);
      });
      ol.appendChild(li);
    });
  }

  function closeDrawers() {
    $('#contents').hidden = true;
    $('#scrim').hidden = true;
    $('#typepanel').hidden = true;
  }

  function setTheme(t) {
    state.theme = t;
    document.body.dataset.theme = t;
    document.querySelectorAll('.sw').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.theme === t));
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'night' ? '#14120f' : t === 'sepia' ? '#2b2018' : '#2a231b');
    try { localStorage.setItem(LS.theme, t); } catch (e) {}
  }

  async function repaginate() {
    var folio = currentFolio();
    $('#boot').classList.remove('gone');
    $('#boot-note').textContent = 'Resetting the type…';
    await raf();
    state.metrics = computeMetrics();
    applyMetrics(state.metrics);
    if (state.flip) { try { state.flip.destroy(); } catch (e) {} state.flip = null; }
    state.pages = await paginate(state.book, function (p) { $('#boot-fill').style.width = Math.round(p * 100) + '%'; });
    buildTOC();
    mount(startPage(folio));
    $('#boot').classList.add('gone');
  }

  function setScale(delta) {
    var next = Math.max(0, Math.min(SCALES.length - 1, state.scaleIdx + delta));
    if (next === state.scaleIdx) return;
    state.scaleIdx = next;
    $('#sizeval').textContent = Math.round(SCALES[next] * 100) + '%';
    try { localStorage.setItem(LS.scale, String(next)); } catch (e) {}
    repaginate();
  }

  function wire() {
    $('#btn-next').addEventListener('click', function () { state.flip.flipNext(); });
    $('#btn-prev').addEventListener('click', function () { state.flip.flipPrev(); });

    $('#btn-contents').addEventListener('click', function () {
      $('#typepanel').hidden = true;
      var open = $('#contents').hidden;
      $('#contents').hidden = !open;
      $('#scrim').hidden = !open;
      if (open) {
        var cur = document.querySelector('#toc li.is-current');
        if (cur) cur.scrollIntoView({ block: 'center' });
      }
      showChrome();
    });
    $('#btn-close-contents').addEventListener('click', closeDrawers);
    $('#scrim').addEventListener('click', closeDrawers);

    $('#btn-type').addEventListener('click', function () {
      $('#contents').hidden = true;
      $('#scrim').hidden = true;
      $('#typepanel').hidden = !$('#typepanel').hidden;
      showChrome();
    });

    $('#btn-smaller').addEventListener('click', function () { setScale(-1); });
    $('#btn-bigger').addEventListener('click', function () { setScale(1); });
    document.querySelectorAll('.sw').forEach(function (b) {
      b.addEventListener('click', function () { setTheme(b.dataset.theme); });
    });

    $('#btn-share').addEventListener('click', async function () {
      var data = {
        title: 'The God I Thought I Knew',
        text: 'A memoir by Moses Campisi — four generations, four countries, and the God who kept showing up.',
        url: location.href.split('#')[0],
      };
      if (navigator.share) {
        try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(data.url); toast('Link copied'); }
      catch (e) { toast(data.url); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { state.flip.flipNext(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { state.flip.flipPrev(); e.preventDefault(); }
      if (e.key === 'Escape') closeDrawers();
    });

    document.addEventListener('click', function (e) {
      if (!$('#typepanel').hidden && !e.target.closest('#typepanel') && !e.target.closest('#btn-type')) {
        $('#typepanel').hidden = true;
      }
    });

    document.addEventListener('mousemove', showChrome, { passive: true });
    document.addEventListener('touchstart', showChrome, { passive: true });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var m = computeMetrics();
        if (!state.metrics || m.pw !== state.metrics.pw || m.ph !== state.metrics.ph) repaginate();
      }, 260);
    });
  }

  /* ---------------- boot ---------------- */

  async function boot() {
    try { state.theme = localStorage.getItem(LS.theme) || 'night'; } catch (e) {}
    try {
      var s = parseInt(localStorage.getItem(LS.scale), 10);
      if (!isNaN(s)) state.scaleIdx = Math.max(0, Math.min(SCALES.length - 1, s));
    } catch (e) {}
    setTheme(state.theme);
    $('#sizeval').textContent = Math.round(SCALES[state.scaleIdx] * 100) + '%';

    $('#boot-note').textContent = 'Fetching the manuscript…';
    var res = await fetch('../content/book.json');
    state.book = await res.json();

    if (document.fonts && document.fonts.ready) {
      $('#boot-note').textContent = 'Setting the type…';
      try { await document.fonts.load('400 17px Literata'); await document.fonts.load('300 30px Cormorant'); } catch (e) {}
      await document.fonts.ready;
    }

    state.metrics = computeMetrics();
    applyMetrics(state.metrics);
    await raf();

    var t0 = performance.now();
    state.pages = await paginate(state.book, function (p) {
      $('#boot-fill').style.width = Math.round(p * 100) + '%';
    });
    var ms = Math.round(performance.now() - t0);
    window.__paginationMs = ms;
    window.__pageCount = state.pages.length;

    buildTOC();

    var saved = 0;
    try { saved = parseInt(localStorage.getItem(LS.pos), 10) || 0; } catch (e) {}
    mount(0);
    wire();
    state.booted = true;

    $('#boot-fill').style.width = '100%';
    setTimeout(function () { $('#boot').classList.add('gone'); }, 240);

    if (saved > 1) {
      var r = $('#resume');
      $('#resume-text').textContent = 'You were on page ' + saved;
      r.hidden = false;
      $('#resume-go').addEventListener('click', function () {
        r.hidden = true;
        state.flip.flip(startPage(saved));
      });
      $('#resume-dismiss').addEventListener('click', function () { r.hidden = true; });
      setTimeout(function () { r.hidden = true; }, 9000);
    }
  }

  boot().catch(function (err) {
    console.error(err);
    $('#boot-note').textContent = 'The book could not be opened. ' + (err && err.message ? err.message : '');
  });
})();
