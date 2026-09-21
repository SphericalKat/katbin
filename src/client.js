const registerAccountMenu = () => {
  window.Alpine?.data("accountMenu", () => ({
    open: false,
    toggle() {
      this.open = !this.open;
    },
    close() {
      this.open = false;
    },
  }));
};

if (window.Alpine) registerAccountMenu();
else document.addEventListener("alpine:init", registerAccountMenu, { once: true });

const pasteForm = document.querySelector("form[data-paste-form]");
const saveButton = pasteForm?.querySelector('button[type="submit"]');
const editor = pasteForm?.querySelector('textarea[name="paste[content]"]');

const syncSaveButton = () => {
  if (saveButton && editor) {
    const isEmpty = editor.value.trim().length === 0;
    const isSubmitting = pasteForm?.dataset.submitting === "true";
    saveButton.disabled = isEmpty || isSubmitting;
  }
};

editor?.addEventListener("input", syncSaveButton);
syncSaveButton();
window.addEventListener("pageshow", syncSaveButton);

const setFormLoading = (form, loading) => {
  form.toggleAttribute("aria-busy", loading);
  form.dataset.submitting = String(loading);
  const button = form.querySelector('button[type="submit"]');
  button?.classList.toggle("is-loading", loading);
  if (button) button.disabled = loading;
  syncSaveButton();
};

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (form.dataset.submitting === "true") {
      event.preventDefault();
      return;
    }
    if (form === pasteForm && editor?.value.trim().length === 0) {
      event.preventDefault();
      syncSaveButton();
      return;
    }
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
      event.preventDefault();
      return;
    }
    setFormLoading(form, true);

    if (!form.dataset.method) return;

    event.preventDefault();
    const body = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") body.append(key, value);
    });
    const action = form.getAttribute("action");
    void fetch(action, {
      method: form.dataset.method,
      body,
    })
      .then((response) => {
        if (response.redirected) window.location.assign(response.url);
        else setFormLoading(form, false);
      })
      .catch(() => {
        setFormLoading(form, false);
      });
  });
});

const saveShortcut = document.querySelector("[data-save-shortcut]");

if (saveShortcut && saveButton instanceof HTMLButtonElement) {
  const platform =
    navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  const isApplePlatform = /Mac|iPhone|iPad|iPod/i.test(platform);
  const modifier = saveShortcut.querySelector("[data-save-modifier]");
  if (modifier) modifier.textContent = isApplePlatform ? "⌘" : "Ctrl";
  saveButton.title = `Save paste (${isApplePlatform ? "⌘S" : "Ctrl+S"})`;
  saveButton.setAttribute("aria-keyshortcuts", isApplePlatform ? "Meta+S" : "Control+S");
  saveShortcut.classList.remove("invisible");
}

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Paste request failed");
  return response.text();
};

document.querySelectorAll("textarea[data-raw-url]").forEach((textarea) => {
  const rawUrl = textarea.dataset.rawUrl;
  if (!rawUrl) return;
  void fetchText(rawUrl)
    .then((content) => {
      textarea.value = content;
      textarea.removeAttribute("aria-busy");
      textarea.removeAttribute("placeholder");
    })
    .catch(() => {
      textarea.value = "Unable to load paste.";
      textarea.setAttribute("aria-invalid", "true");
      textarea.removeAttribute("aria-busy");
    });
});

const reportCopy = (button, message) => {
  const feedback = button.parentElement?.querySelector('[role="status"]');
  if (feedback) feedback.textContent = message;
};

const registerPasteCopyHandlers = () => {
  document.querySelectorAll("[data-copy-raw-url]").forEach((button) => {
    const rawUrl = button.dataset.copyRawUrl;
    let content;
    if (rawUrl) {
      // Fetch the original paste content when the page loads. The click handler
      // then writes to the clipboard without an async gap, which some browsers
      // treat as lost user activation.
      void fetchText(rawUrl)
        .then((value) => {
          content = value;
        })
        .catch(() => {});
    }
    button.addEventListener("click", () => {
      if (content === undefined) return reportCopy(button, "Copy failed");
      void navigator.clipboard
        .writeText(content)
        .then(() => reportCopy(button, "Copied"))
        .catch(() => reportCopy(button, "Copy failed"));
    });
  });
};

registerPasteCopyHandlers();

document.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;

  if (event.key.toLowerCase() === "s" && !event.altKey) {
    if (!(pasteForm instanceof HTMLFormElement) || !(saveButton instanceof HTMLButtonElement)) {
      return;
    }
    event.preventDefault();
    if (
      !(editor instanceof HTMLTextAreaElement) ||
      editor.value.trim().length === 0 ||
      pasteForm.dataset.submitting === "true" ||
      saveButton.disabled ||
      event.repeat
    ) {
      return;
    }
    pasteForm.requestSubmit(saveButton);
    return;
  }

  if (event.key !== "Enter") return;
  if (!(event.target instanceof HTMLTextAreaElement)) return;
  if (event.target === editor) {
    if (
      !(pasteForm instanceof HTMLFormElement) ||
      !(saveButton instanceof HTMLButtonElement) ||
      editor.value.trim().length === 0 ||
      pasteForm.dataset.submitting === "true" ||
      saveButton.disabled
    ) {
      event.preventDefault();
      syncSaveButton();
      return;
    }
  }
  event.target.form?.requestSubmit();
});
