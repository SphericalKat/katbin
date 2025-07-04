// Keyboard shortcuts for Katbin
export class KeyboardShortcuts {
  static init() {
    document.addEventListener("keydown", this.handleKeydown.bind(this), false);
    
    // Initialize form submission handling
    this.initFormSubmission();
  }

  static handleKeydown(e) {
    if ((window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey) && e.keyCode == 83) {
      e.preventDefault();
      this.submitForm();
    }

    if ((window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey) && e.keyCode == 65 && this.isTextareaFocused()) {
      e.preventDefault();
      this.selectAllInTextarea();
    }
  }

  static initFormSubmission() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-submit-form]')) {
        const form = document.getElementById(e.target.closest('[data-submit-form]').dataset.submitForm);
        if (form) {
          form.submit();
        }
      }
    });
  }

  static submitForm() {
    const form = document.getElementById("page_form");
    if (form) {
      form.submit();
    }
  }

  static isTextareaFocused() {
    const activeElement = document.activeElement;
    return activeElement && activeElement.tagName.toLowerCase() === 'textarea';
  }

  static selectAllInTextarea() {
    const textarea = document.activeElement;
    if (textarea && textarea.tagName.toLowerCase() === 'textarea') {
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
    }
  }
}
