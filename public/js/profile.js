document.addEventListener("DOMContentLoaded", () => {
  // Profile settings open/close buttons
  const settings = document.getElementById("profile-settings");
  const settingsToggles = document.querySelectorAll(
    "[data-profile-settings-toggle]",
  );

  const setSettingsVisible = (visible) => {
    if (!settings) return;

    settings.hidden = !visible;

    settingsToggles.forEach((button) => {
      button.setAttribute("aria-expanded", String(visible));
      button.textContent = visible ? "Close settings ×" : "Edit profile";
    });
  };

  if (settings && settingsToggles.length) {
    if (window.location.hash === "#profile-settings") {
      setSettingsVisible(true);
    }

    settingsToggles.forEach((button) => {
      button.addEventListener("click", () => {
        const shouldOpen = settings.hidden;
        setSettingsVisible(shouldOpen);

        if (shouldOpen) {
          settings.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    });
  }

  // Recent reports: search, filters, sorting, and reset
  const reportTable = document.querySelector("[data-report-table]");
  const reportSearch = document.querySelector("[data-report-search]");
  const typeFilter = document.querySelector("[data-report-type-filter]");
  const statusFilter = document.querySelector("[data-report-status-filter]");
  const sortSelect = document.querySelector("[data-report-sort]");
  const resultsLabel = document.querySelector("[data-report-results]");
  const noResults = document.querySelector("[data-report-no-results]");
  const resetButtons = document.querySelectorAll("[data-report-reset]");

  if (reportTable) {
    const originalRows = Array.from(
      reportTable.querySelectorAll("[data-report-row]"),
    );

    const normalize = (value) =>
      String(value || "")
        .trim()
        .toLowerCase();

    const applyReportFilters = () => {
      const keyword = normalize(reportSearch?.value);
      const selectedType = typeFilter?.value || "all";
      const selectedStatus = statusFilter?.value || "all";
      const sortBy = sortSelect?.value || "newest";

      let visibleRows = originalRows.filter((row) => {
        const searchableText = [
          row.dataset.title,
          row.dataset.location,
          row.dataset.reference,
          row.textContent,
        ].join(" ");

        const matchesSearch =
          !keyword || normalize(searchableText).includes(keyword);

        const matchesType =
          selectedType === "all" || row.dataset.type === selectedType;

        const matchesStatus =
          selectedStatus === "all" || row.dataset.status === selectedStatus;

        return matchesSearch && matchesType && matchesStatus;
      });

      visibleRows.sort((a, b) => {
        if (sortBy === "title") {
          return (a.dataset.title || "").localeCompare(b.dataset.title || "");
        }

        const dateA = Number(a.dataset.date || 0);
        const dateB = Number(b.dataset.date || 0);

        return sortBy === "oldest" ? dateA - dateB : dateB - dateA;
      });

      originalRows.forEach((row) => {
        row.hidden = true;
      });

      visibleRows.forEach((row) => {
        row.hidden = false;
        reportTable.appendChild(row);
      });

      if (resultsLabel) {
        const count = visibleRows.length;
        resultsLabel.textContent = `${count} matching report${count === 1 ? "" : "s"}`;
      }

      if (noResults) {
        noResults.hidden = visibleRows.length > 0;
      }

      reportTable
        .closest(".profile-table-wrap")
        ?.classList.toggle("profile-table-empty", visibleRows.length === 0);
    };

    [reportSearch, typeFilter, statusFilter, sortSelect].forEach((control) => {
      if (!control) return;

      control.addEventListener("input", applyReportFilters);
      control.addEventListener("change", applyReportFilters);
    });

    resetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (reportSearch) reportSearch.value = "";
        if (typeFilter) typeFilter.value = "all";
        if (statusFilter) statusFilter.value = "all";
        if (sortSelect) sortSelect.value = "newest";

        applyReportFilters();
        reportSearch?.focus();
      });
    });

    applyReportFilters();
  }

  // Preview a selected profile picture before uploading
  const imageInput = document.querySelector("[data-profile-image-input]");
  const imagePreview = document.querySelector("[data-profile-image-preview]");
  const imagePlaceholder = document.querySelector(
    "[data-profile-image-placeholder]",
  );

  if (imageInput && imagePreview) {
    imageInput.addEventListener("change", () => {
      const file = imageInput.files && imageInput.files[0];

      if (!file) return;

      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

      if (!allowedTypes.includes(file.type)) {
        window.alert("Please select a PNG, JPG, or WEBP image.");
        imageInput.value = "";
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        window.alert("The profile picture must be 5 MB or smaller.");
        imageInput.value = "";
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        imagePreview.src = reader.result;
        imagePreview.hidden = false;

        if (imagePlaceholder) {
          imagePlaceholder.hidden = true;
        }
      };

      reader.readAsDataURL(file);
    });
  }

  // Validate that the new password and confirmation match
  const passwordForm = document.querySelector("[data-password-form]");
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");
  const passwordError = document.querySelector("[data-password-error]");

  if (passwordForm && newPassword && confirmPassword) {
    const validatePasswordConfirmation = () => {
      const matches =
        !confirmPassword.value || newPassword.value === confirmPassword.value;

      confirmPassword.setCustomValidity(
        matches ? "" : "The new passwords do not match.",
      );

      if (passwordError) {
        passwordError.hidden = matches;
        passwordError.textContent = matches
          ? ""
          : "The new passwords do not match.";
      }

      return matches;
    };

    newPassword.addEventListener("input", validatePasswordConfirmation);

    confirmPassword.addEventListener("input", validatePasswordConfirmation);

    passwordForm.addEventListener("submit", (event) => {
      if (!validatePasswordConfirmation()) {
        event.preventDefault();
        confirmPassword.reportValidity();
        confirmPassword.focus();
      }
    });
  }

  // Confirm before removing the profile picture
  document.querySelectorAll("[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const message = form.dataset.confirm;

      if (message && !window.confirm(message)) {
        event.preventDefault();
      }
    });
  });
});
