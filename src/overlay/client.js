/* eslint-env browser */
/* global io */
const socket = io();

const container = document.getElementById('container');
// MAX_LINES and REMOVE_TIMEOUT removed as we now use off-screen detection

let currentDisplayFormat = '%1(%2)';

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
}

function addSubtitle(original, translation) {
  const div = document.createElement('div');
  div.classList.add('subtitle-line');

  // Create the content based on format
  const srcText = original || '';
  const dstText = translation || '';

  // Replace %1 with original text, %2 with wrapped translation text
  // We wrap %2 in a span with .dst-text class for styling
  let formattedHTML = currentDisplayFormat
    .replace(/%1/g, srcText)
    .replace(/%2/g, `<span class="dst-text">${dstText}</span>`);

  div.innerHTML = formattedHTML;
  container.appendChild(div);

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
