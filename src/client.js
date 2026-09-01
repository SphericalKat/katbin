const alpine = window.Alpine;

alpine?.data("accountMenu", () => ({
  open: false,
  toggle() {
    this.open = !this.open;
  },
  close() {
    this.open = false;
  },
}));

const setFormLoading = (form, loading) => {
  form.toggleAttribute("aria-busy", loading);
  form.dataset.submitting = String(loading);
  const button = form.querySelector('button[type="submit"]');
  button?.classList.toggle("is-loading", loading);
  if (button) button.disabled = loading;
};

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (form.dataset.submitting === "true") {
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
    void fetch(form.action, {
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

document.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
  if (!(event.target instanceof HTMLTextAreaElement)) return;
  event.target.form?.requestSubmit();
});
