(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('book').textContent);
  var sections = DATA.sections;
  var current = 0;
  var dirty = Object.create(null);
  var readOnly = false;
  var artifact = null;

  // The interface markup lives here as a constant, so the page can regenerate
  // itself exactly rather than serialising the live DOM (whose inputs hold
  // viewer-typed state).
  var SHELL =
    '<div class="app">' +
      '<aside>' +
        '<div class="head"><b>The God I Thought I Knew</b><span>Manuscript</span></div>' +
        '<div id="list"></div>' +
      '</aside>' +
      '<main>' +
        '<div class="bar">' +
          '<button class="ghost" id="theme" type="button">Day</button>' +
          '<span class="grow"></span>' +
          '<span id="status"></span>' +
          '<button class="btn" id="save" type="button" disabled>Save</button>' +
        '</div>' +
        '<div class="editor"><div class="inner">' +
          '<div class="ro" id="ro" hidden>This is a read-only view, so changes cannot be saved.</div>' +
          '<label class="f" for="title">Chapter</label>' +
          '<input class="h sm" id="title" type="text" autocomplete="off">' +
          '<label class="f" for="sub">Title</label>' +
          '<input class="h" id="sub" type="text" autocomplete="off">' +
          '<label class="f" for="body">Text</label>' +
          '<textarea id="body" spellcheck="true"></textarea>' +
          '<div class="hint">Leave a blank line between paragraphs. ' +
            '<code>*word*</code> is italic, <code>**word**</code> is bold, and a line ' +
            'containing only <code>---</code> is a scene break. ' +
            'Press Ctrl+S or Cmd+S to save.</div>' +
        '</div></div>' +
      '</main>' +
    '</div>';

  var $ = function (s) { return document.querySelector(s); };
  var words = function (s) { return s.trim() ? s.trim().split(/\s+/).length : 0; };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderList() {
    $('#list').innerHTML = sections.map(function (s, i) {
      var cls = (s.isPart ? 'part' : '') + (i === current ? ' on' : '') + (dirty[i] ? ' dirty' : '');
      return '<button type="button" data-i="' + i + '" class="' + cls + '">' +
        '<span class="t">' + esc(s.sub || s.title) + '</span>' +
        (s.isPart ? '' : '<span class="w">' + words(s.body).toLocaleString() + '</span>') +
        '</button>';
    }).join('');
  }

  function autosize(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, Math.round(window.innerHeight * 0.6)) + 'px';
  }

  function renderEditor() {
    var s = sections[current];
    $('#title').value = s.title;
    $('#sub').value = s.sub || '';
    $('#body').value = s.body;
    autosize($('#body'));
    $('.editor').scrollTop = 0;
  }

  function setStatus(text, cls) {
    var el = $('#status');
    el.textContent = text;
    el.className = cls || '';
  }

  function markDirty() {
    dirty[current] = true;
    if (!readOnly) $('#save').disabled = false;
    setStatus('Unsaved changes', '');
    renderList();
  }

  function pull() {
    var s = sections[current];
    s.title = $('#title').value;
    s.sub = $('#sub').value;
    s.body = $('#body').value;
  }

  function buildDoc() {
    var CLOSE = '<' + '/script>';
    var CLOSE_STYLE = '<' + '/style>';
    var css = document.getElementById('css').textContent;
    var app = document.getElementById('app').textContent;
    var json = JSON.stringify(DATA).replace(/</g, '\\u003c');
    return '<!doctype html>\n<html lang="en-AU">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(DATA.title) + ' — Manuscript</title>\n' +
      '<style id="css">' + css + CLOSE_STYLE + '\n' +
      '</head>\n<body data-theme="night">\n' +
      '<script id="book" type="application/json">' + json + CLOSE + '\n' +
      '<div id="root"></div>\n' +
      '<script id="app">' + app + CLOSE + '\n' +
      '</body>\n</html>\n';
  }

  async function save() {
    if (readOnly || !artifact) return;
    pull();
    $('#save').disabled = true;
    setStatus('Saving…', '');
    try {
      await artifact.publish(buildDoc());
      dirty = Object.create(null);
      setStatus('Saved', 'ok');
      renderList();
    } catch (err) {
      var code = err && err.code;
      if (code === 'conflict') {
        // Every open view is already reloading to the winning version.
        setStatus('Someone else saved first — reloading', 'warn');
        return;
      }
      if (code === 'not_writer' || code === 'not_granted') {
        readOnly = true;
        $('#ro').hidden = false;
        setStatus('Read-only view', 'warn');
        return;
      }
      $('#save').disabled = false;
      setStatus('Could not save. Try again.', 'warn');
    }
  }

  function wire() {
    $('#list').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (!b) return;
      pull();
      current = Number(b.dataset.i);
      renderList();
      renderEditor();
    });

    $('#title').addEventListener('input', markDirty);
    $('#sub').addEventListener('input', markDirty);
    $('#body').addEventListener('input', function () { autosize(this); markDirty(); });
    $('#save').addEventListener('click', save);

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        save();
      }
    });

    window.addEventListener('beforeunload', function (e) {
      if (Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ''; }
    });

    $('#theme').addEventListener('click', function () {
      var next = document.body.dataset.theme === 'day' ? 'night' : 'day';
      document.body.dataset.theme = next;
      this.textContent = next === 'day' ? 'Night' : 'Day';
      try { localStorage.setItem('tgitik.ed.theme', next); } catch (err) {}
    });
  }

  document.getElementById('root').innerHTML = SHELL;
  renderList();
  renderEditor();
  wire();
  setStatus('Connecting…', '');

  try {
    if (localStorage.getItem('tgitik.ed.theme') === 'day') $('#theme').click();
  } catch (err) {}

  claude.use('artifact').then(function (a) {
    artifact = a;
    if (!a) {
      readOnly = true;
      $('#ro').hidden = false;
      $('#save').disabled = true;
      setStatus('Read-only view', 'warn');
    } else {
      setStatus(Object.keys(dirty).length ? 'Unsaved changes' : 'Ready', '');
    }
  });
})();
