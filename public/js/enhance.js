// public/js/enhance.js
// Small, dependency-free UX helpers shared by the student and admin pages:
//   1. Submit buttons show a spinner and ignore double-clicks.
//   2. Password fields get a Show/Hide button.
//   3. Success messages fade away after a few seconds.
//   4. A back-to-top button appears on long pages.
(function () {
  'use strict';

  // ---- 1. Double-submit guard + loading state --------------------------
  var RESET_AFTER_MS = 15000; // in case the navigation is cancelled

  function clearLoading(form) {
    delete form.dataset.submitting;
    form.removeAttribute('aria-busy');
    form.querySelectorAll('.is-loading').forEach(function (el) {
      el.classList.remove('is-loading');
    });
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (event.defaultPrevented) return;               // a confirm() said no
    if (form.hasAttribute('data-no-lock')) return;
    if ((form.getAttribute('method') || 'get').toLowerCase() === 'get') return;

    if (form.dataset.submitting === '1') {
      event.preventDefault();                         // second click
      return;
    }
    form.dataset.submitting = '1';
    form.setAttribute('aria-busy', 'true');

    // Do not disable the button: a disabled button's name/value would be
    // dropped from the request. A CSS class blocks further clicks instead.
    var btn = event.submitter || form.querySelector('[type="submit"]');
    if (btn) btn.classList.add('is-loading');

    window.setTimeout(function () { clearLoading(form); }, RESET_AFTER_MS);
  });

  // Coming back with the browser's Back button should not show a stuck spinner.
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    document.querySelectorAll('form[data-submitting]').forEach(clearLoading);
  });

  // ---- 2. Password show / hide ----------------------------------------
  function addPasswordToggle(input) {
    var wrap = input.parentElement;
    if (!wrap || wrap.classList.contains('has-pw-toggle')) return;
    if (window.getComputedStyle(wrap).position === 'static') {
      wrap.style.position = 'relative';
    }
    wrap.classList.add('has-pw-toggle');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.style.top = input.offsetTop + input.offsetHeight / 2 + 'px';

    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
      input.focus();
    });

    input.insertAdjacentElement('afterend', btn);
  }

  // ---- 3. Auto-dismiss success flashes ---------------------------------
  function fadeSuccessFlashes() {
    document.querySelectorAll('.flash-success').forEach(function (el) {
      window.setTimeout(function () {
        el.classList.add('is-leaving');
        window.setTimeout(function () { el.remove(); }, 450);
      }, 6000);
    });
  }

  // ---- 4. Back to top -------------------------------------------------
  function addBackToTop() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.textContent = '\u2191';
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(btn);

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        btn.classList.toggle('is-visible', window.scrollY > 700);
        ticking = false;
      });
    }, { passive: true });
  }

  function init() {
    document.querySelectorAll('input[type="password"]').forEach(addPasswordToggle);
    fadeSuccessFlashes();
    addBackToTop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
