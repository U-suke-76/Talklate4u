/* eslint-env browser */
/* global io */
const socket = io();

const container = document.getElementById('container');
// MAX_LINES and REMOVE_TIMEOUT removed as we now use off-screen detection

socket.on('connect', () => {
    console.log('Connected to Overlay Server');
});

socket.on('translation', (data) => {
    // data: { original: string, translation: string }
    addSubtitle(data.original, data.translation);
});

function addSubtitle(original, translation) {
    const div = document.createElement('div');
    div.classList.add('subtitle-line');

    // Create the content: "Original / <span class='dst-text'>Translation</span>"
    // Handle potential null/undefined just in case, though TS shouldn't send it if properly typed
    const srcText = original || '';
    const dstText = translation || '';
    
    // Use innerHTML to allow span for color
    div.innerHTML = `${srcText}<span class="dst-text">(${dstText})</span>`;
    container.appendChild(div);
    
    // Run cleanup immediately and synchronously to ensure the new message is visible.
    // This forces a layout reflow, which is acceptable for this use case.
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
