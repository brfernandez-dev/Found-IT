// public/js/modal.js — handles the Claim modal open/close

(function () {
  function initClaimModal() {
    const modal = document.getElementById('claim-modal');
    const opener = document.getElementById('claim-open');

    // This page may not have a claim modal.
    if (!modal) return;

    function openModal() {
      modal.hidden = false;
      document.body.style.overflow = 'hidden';

      const first = modal.querySelector(
        'textarea, input, button'
      );

      if (first) {
        first.focus();
      }
    }

    function closeModal() {
      modal.hidden = true;
      document.body.style.overflow = '';
    }

    // "This is mine — Claim it" button
    if (opener) {
      opener.addEventListener('click', function (event) {
        event.preventDefault();
        openModal();
      });
    }

    // Close button and clicking outside the modal
    modal.addEventListener('click', function (event) {
      if (
        event.target.matches('[data-close]') ||
        event.target === modal
      ) {
        closeModal();
      }
    });

    // ESC key closes the modal
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });

    // Re-open the modal when redirected after a validation error
    const params = new URLSearchParams(window.location.search);

    if (params.get('claim') === 'open') {
      openModal();
    }
  }

  // Because foot.ejs uses defer, this normally runs after the HTML
  // has already been parsed. This also handles either situation safely.
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initClaimModal
    );
  } else {
    initClaimModal();
  }
})();