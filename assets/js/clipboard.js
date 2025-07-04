// Clipboard functionality for Katbin
export class ClipboardManager {
  static copyContent(content) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(content)
        .then(() => this.showFeedback(true))
        .catch(() => this.fallbackCopy(content));
    } else {
      return this.fallbackCopy(content);
    }
  }

  static copyFromTextarea(textarea) {
    if (!textarea) return Promise.reject('Textarea not found');
    
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(textarea.value)
        .then(() => this.showFeedback(true))
        .catch(() => this.fallbackCopyFromTextarea(textarea));
    } else {
      return this.fallbackCopyFromTextarea(textarea);
    }
  }

  static fallbackCopy(content) {
    const textArea = document.createElement('textarea');
    textArea.value = content;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      this.showFeedback(successful);
      return successful ? Promise.resolve() : Promise.reject();
    } catch (err) {
      this.showFeedback(false);
      return Promise.reject(err);
    } finally {
      document.body.removeChild(textArea);
    }
  }

  static fallbackCopyFromTextarea(textarea) {
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    
    try {
      const successful = document.execCommand('copy');
      this.showFeedback(successful);
      return successful ? Promise.resolve() : Promise.reject();
    } catch (err) {
      this.showFeedback(false);
      return Promise.reject(err);
    }
  }

  static showFeedback(success) {
    const buttons = document.querySelectorAll('[data-clipboard-copy], [data-clipboard-button]');
    
    buttons.forEach(button => {
      const originalTitle = button.title;
      const originalOpacity = button.style.opacity;
      
      button.title = success ? 'Copied!' : 'Copy failed';
      button.style.opacity = '0.7';
      
      setTimeout(() => {
        button.title = originalTitle;
        button.style.opacity = originalOpacity || '1';
      }, 1000);
    });
  }

  // Initialize clipboard functionality
  static init() {
    // Handle copy buttons with data-clipboard-copy attribute
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-clipboard-copy]')) {
        e.preventDefault();
        this.handleCopyClick(e.target.closest('[data-clipboard-copy]'));
      }
    });
  }

  static handleCopyClick(button) {
    const copyType = button.dataset.clipboardCopy;
    
    if (copyType === 'paste-content') {
      // Copy from global paste data
      const pasteData = window.PASTE_DATA;
      if (pasteData) {
        this.copyContent(pasteData);
      }
    } else if (copyType === 'textarea') {
      // Copy from form textarea
      const textarea = document.querySelector('textarea[name="paste[content]"]');
      this.copyFromTextarea(textarea);
    }
  }
}

// Global functions for backward compatibility
window.copyPasteContent = function() {
  const pasteData = window.PASTE_DATA;
  if (pasteData) {
    ClipboardManager.copyContent(pasteData);
  }
};

window.copyToClipboard = function() {
  const textarea = document.querySelector('textarea[name="paste[content]"]');
  ClipboardManager.copyFromTextarea(textarea);
};
