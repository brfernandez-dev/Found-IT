(function () {
  var sidebar = document.getElementById('admin-sidebar');
  var toggle = document.querySelector('.admin-menu-toggle');

  if (!sidebar || !toggle) return;

  // Dimmed layer behind the open sidebar on phones; tap it to close.
  var backdrop = document.createElement('div');
  backdrop.className = 'admin-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.appendChild(backdrop);

  function setOpen(isOpen) {
    sidebar.classList.toggle('is-open', isOpen);
    backdrop.classList.toggle('is-visible', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  }

  toggle.addEventListener('click', function () {
    setOpen(!sidebar.classList.contains('is-open'));
  });

  backdrop.addEventListener('click', function () {
    setOpen(false);
  });

  // Choosing a link closes the drawer so the next page starts clean.
  sidebar.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
}());
