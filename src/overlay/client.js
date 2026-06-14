/* eslint-env browser */
/* global io */
const socket = io();

const container = document.getElementById('container');
// MAX_LINES and REMOVE_TIMEOUT removed as we now use off-screen detection

// MAX_LINES and REMOVE_TIMEOUT variables added back for configurable settings
let currentDisplayFormat = '%1(%2)';
let currentMaxLines = 0;
let currentFadeTimeout = 0;
let customStyleTag = null;

socket.on('connect', () => {
  console.log('Connected to Overlay Server');
});

socket.on('initial_style', (styles) => {
  applyStyles(styles);
});

socket.on('style_update', (styles) => {
  applyStyles(styles);
});

socket.on('translation', (data) => {
  // data: { original: string, translation: string }
  addSubtitle(data.original, data.translation);
});

function applyStyles(styles) {
  if (!styles) return;
  const root = document.documentElement;

  if (styles.align) root.style.setProperty('--align', styles.align);
  if (styles.fontSize) root.style.setProperty('--font-size', styles.fontSize + 'px');
  if (styles.originalColor) root.style.setProperty('--original-color', styles.originalColor);
  if (styles.originalStrokeColor)
    root.style.setProperty('--original-stroke-color', styles.originalStrokeColor);
  if (styles.translatedColor) root.style.setProperty('--translated-color', styles.translatedColor);
  if (styles.translatedStrokeColor)
    root.style.setProperty('--translated-stroke-color', styles.translatedStrokeColor);
  if (styles.backgroundColor) root.style.setProperty('--background-color', styles.backgroundColor);

  if (styles.displayFormat) currentDisplayFormat = styles.displayFormat;

  if (styles.maxLines !== undefined) {
    currentMaxLines = parseInt(styles.maxLines, 10) || 0;
  }
  if (styles.fadeTimeout !== undefined) {
    currentFadeTimeout = parseInt(styles.fadeTimeout, 10) || 0;
  }

  // Handle Custom CSS dynamic injection
  if (styles.useCustomCSS && styles.customCSS) {
    if (!customStyleTag) {
      customStyleTag = document.createElement('style');
      customStyleTag.id = 'custom-overlay-styles';
      document.head.appendChild(customStyleTag);
    }
    customStyleTag.textContent = styles.customCSS;
  } else {
    if (customStyleTag) {
      customStyleTag.textContent = '';
    }
  }
}

function addSubtitle(original, translation) {
  const div = document.createElement('div');
  div.classList.add('subtitle-line');

  // Fade out event listener to clean up DOM after animation finishes
  div.addEventListener('animationend', (e) => {
    if (e.animationName === 'fadeOut') {
      div.remove();
    }
  });

  // Create the content based on format
  const srcText = original || '';
  const dstText = translation || '';

  // Replace %1 with original text
  // Extract %2 along with any surrounding brackets or spaces and wrap it in dst-text
  let formattedHTML = currentDisplayFormat
    .replace(/([([{]?\s*%2\s*[)\]}]?)/g, `<span class="dst-text">$1</span>`)
    .replace(/%1/g, srcText)
    .replace(/%2/g, dstText);

  div.innerHTML = `<span class="subtitle-content">${formattedHTML}</span>`;

  // Apply max lines rule BEFORE appending the new element to container.
  // This triggers the fade-out on the oldest message first, making room and sliding remaining lines up.
  const activeLines = Array.from(container.getElementsByClassName('subtitle-line')).filter(
    (line) => !line.classList.contains('fade-out'),
  );

  if (currentMaxLines > 0 && activeLines.length >= currentMaxLines) {
    const overflowCount = activeLines.length + 1 - currentMaxLines;
    for (let i = 0; i < overflowCount; i++) {
      activeLines[i].classList.add('fade-out');
    }
  }

  // Now append the new subtitle to the container
  container.appendChild(div);

  // Apply timeout fade
  if (currentFadeTimeout > 0) {
    setTimeout(() => {
      if (div && !div.classList.contains('fade-out')) {
        div.classList.add('fade-out');
      }
    }, currentFadeTimeout * 1000);
  }

  // Run cleanup immediately and synchronously to ensure the new message is visible.
  cleanupMessages();
}

function cleanupMessages() {
  // Get the visible window bottom.
  // Since body is overflow: hidden and fixed 100%, this implies the viewport bottom.
  // The container expands indefinitely, so we must compare against the window limit.
  const limit = window.innerHeight;

  // Check if the newest message (last child) is overflowing the bottom of the viewport.
  while (container.childElementCount > 1) {
    const lastChild = container.lastElementChild;
    const lastRect = lastChild.getBoundingClientRect();

    // If the bottom of the last message is below the viewport bottom,
    // it means it's strictly cut off (overflowing).
    if (lastRect.bottom > limit) {
      container.removeChild(container.firstElementChild);
      // Removing a child triggers a layout update.
    } else {
      // The last message fits within the viewport!
      break;
    }
  }
}
