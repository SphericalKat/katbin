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

document.querySelectorAll("form[data-method]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") body.append(key, value);
    });
    void fetch(form.action, {
      method: form.dataset.method,
      body,
    }).then((response) => {
      if (response.redirected) window.location.assign(response.url);
    });
  });
});

document.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
  if (!(event.target instanceof HTMLTextAreaElement)) return;
  event.target.form?.requestSubmit();
});
