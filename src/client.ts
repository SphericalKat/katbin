import Alpine from "@alpinejs/csp";

Alpine.start();

document.querySelectorAll<HTMLFormElement>("form[data-method]").forEach((form) => {
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
