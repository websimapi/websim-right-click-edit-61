// --- Required Utilities defined locally to mimic imports ---

// Type constants
const HOST_READY = "host_ready"; 

// Simplified connectClient placeholder that performs proxy creation
function connectClient(name, targetOrigin, targetPromise) {
    return new Proxy(
        {},
        {
            get(_, fn) {
                return (...args) => {
                    return targetPromise.then(target => {
                        return new Promise((resolve, reject) => {
                            const id = `rpc:${Math.random().toString(36).slice(2)}`;
                            const handler = (event) => {
                                // Checking event.source is crucial for security, especially if target is an iframe contentWindow
                                if (
                                    event.source === target &&
                                    event.data && event.data.id === id
                                ) {
                                    window.removeEventListener("message", handler);
                                    if (event.data.error) {
                                        reject(event.data.error);
                                        return;
                                    }
                                    resolve(event.data.result);
                                }
                            };
                            window.addEventListener("message", handler);
                            target.postMessage({ id, name, fn, args }, targetOrigin);
                        });
                    });
                };
            },
        }
    );
}

// Simple memoizePromise placeholder
function memoizePromise(fn) {
    let promise = null;
    return (...args) => {
        if (promise) return promise;
        promise = fn(...args);
        return promise;
    };
}

// --- Parent API Initialization (New Structure) ---

// Mock/Define __WEBSIM_DATA__ structure for clarity, assuming it exists on window
// Note: window.__WEBSIM_DATA__ is assumed to be defined by the execution environment.
const __WEBSIM_DATA__ = window.__WEBSIM_DATA__ || {
    isTopLevelFrame: false,
    project_id: null,
    hostOrigin: window.location.origin,
    route: {}
};

const parentApi =
  __WEBSIM_DATA__.isTopLevelFrame && __WEBSIM_DATA__.project_id
    ? (() => {
        const windowPromise = new Promise((resolve) => {
          // Create and append iframe when in top level frame
          const iframe = document.createElement("iframe");
          iframe.sandbox.add(
            "allow-scripts",
            "allow-popups",
            "allow-same-origin",
            "allow-modals"
          );
          iframe.style.display = "none";

          const project_id = __WEBSIM_DATA__.project_id;
          const url = new URL(
            `/_embedded_host/${project_id}`,
            __WEBSIM_DATA__.hostOrigin
          );
          url.searchParams.set("__websim_content_frame_origin", window.origin);
          url.searchParams.set(
            "__websim_route",
            JSON.stringify(__WEBSIM_DATA__.route)
          );
          iframe.src = url.toString();

          if (document.body) {
            document.body.appendChild(iframe);
            resolve(iframe.contentWindow);
          } else {
            document.addEventListener("DOMContentLoaded", () => {
              document.body.appendChild(iframe);
              resolve(iframe.contentWindow);
            });
          }
        });

        const parentIsReady = windowPromise.then((w) => {
          return new Promise((resolve) => {
            const fn = (event) => {
              const host_ready = HOST_READY;
              if (event.data && event.data.type === host_ready) {
                resolve(w);
                window.removeEventListener("message", fn);
              }
            };
            window.addEventListener("message", fn);
          });
        });

        const proxy = connectClient(
          "parent",
          __WEBSIM_DATA__.hostOrigin,
          parentIsReady
        );
        return proxy;
      })()
    : connectClient(
        "parent",
        __WEBSIM_DATA__.hostOrigin,
        new Promise((resolve) => {
          const fn = (event) => {
            const host_ready = HOST_READY;
            if (event.data && event.data.type === host_ready) {
              resolve(window.parent);
              window.removeEventListener("message", fn);
            }
          };
          window.addEventListener("message", fn);
        })
      );

// For the Home page
window.__get_params__ = memoizePromise(parentApi.getParams);

// --- Global UI and Feature Logic ---

const WEBSIM_TAG_ID_ATTRIBUTE = "w-tid";

// Utility function to show a toast message
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    toast.style.color = 'white';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.zIndex = '1000';
    toast.style.transition = 'opacity 0.3s ease-in-out';

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}
window.showToast = showToast; // Attach globally

// Function to copy content to clipboard (consolidated version that handles animation feedback)
function copyToClipboard(sectionId, type) {
    const section = document.getElementById(sectionId);
    let content = '';
    let elementToAnimate = null;

    if (type === 'all') {
        const frame = section.closest('.feature-frame') || section;
        content = frame.outerHTML;
        elementToAnimate = frame; 
    } else if (type === 'html') {
        // Find the actual HTML content div
        const htmlSection = section.closest('.feature-frame')?.querySelector('.feature-content') || section;
        content = htmlSection.innerHTML;
        elementToAnimate = htmlSection;
    } else if (type === 'css') {
        const styleTag = section.querySelector('style');
        content = styleTag ? styleTag.textContent : '';
        elementToAnimate = section; // The copy-css button
    } else if (type === 'js') {
        const scriptTag = section.querySelector('script');
        content = scriptTag ? scriptTag.textContent : '';
        elementToAnimate = section; // The copy-js button
    }

    navigator.clipboard.writeText(content).then(() => {
        if (elementToAnimate) {
            elementToAnimate.classList.add('copy-feedback');
            setTimeout(() => {
                elementToAnimate.classList.remove('copy-feedback');
            }, 500);
        }
        showToast(`${type.toUpperCase()} content copied to clipboard!`);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showToast('Failed to copy content. Please try again.');
    });
}
window.copyToClipboard = copyToClipboard; // Attach globally

// Dropdown state
let currentDropdown = null;

function showDropdown(event, elementId, type) {
    event.stopPropagation();
    if (currentDropdown) {
        document.body.removeChild(currentDropdown);
        currentDropdown = null;
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';

    // Use window scope for global functions called from inline handlers inside the dropdown
    dropdown.innerHTML = `
        <button onclick="window.handleDropdownAction('${elementId}', '${type}', 'edit')">Edit</button>
        <button onclick="window.handleDropdownAction('${elementId}', '${type}', 'copy')">Copy</button>
    `;

    dropdown.style.left = `${event.clientX}px`;
    dropdown.style.top = `${event.clientY}px`;

    document.body.appendChild(dropdown);
    dropdown.style.display = 'block';
    currentDropdown = dropdown;

    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
        // If we click inside the dropdown or on the trigger button, keep it open (or let the action handle closing)
        if (currentDropdown && !currentDropdown.contains(e.target) && e.target !== event.target) {
            document.body.removeChild(currentDropdown);
            currentDropdown = null;
            document.removeEventListener('click', closeDropdown);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeDropdown);
    }, 0);
}
window.showDropdown = showDropdown; // Attach globally

function handleDropdownAction(elementId, type, action) {
    if (currentDropdown) {
        document.body.removeChild(currentDropdown);
        currentDropdown = null;
    }

    if (action === 'edit') {
        const element = document.getElementById(elementId);

        // Logic to determine the correct tag ID for the edit operation
        let tagId = element.getAttribute(WEBSIM_TAG_ID_ATTRIBUTE);

        if (!tagId) {
            // If editing ALL (frame click) or HTML (content click), the tag ID should typically be on the feature content element or the outer frame.
            const frame = element.closest('.feature-frame');
            if (frame) {
                // If the element itself is featureX-js/css, find the content/frame tag ID
                if (type === 'all' || type === 'css' || type === 'js') {
                    tagId = frame.getAttribute(WEBSIM_TAG_ID_ATTRIBUTE) || frame.id;
                } else if (type === 'html') {
                    const content = frame.querySelector('.feature-content');
                    tagId = content ? content.getAttribute(WEBSIM_TAG_ID_ATTRIBUTE) || content.id : elementId;
                }
            }
        }

        // Fallback to elementId if no w-tid found
        const effectiveTagId = tagId || elementId;

        showEditModal(effectiveTagId, type);

    } else if (action === 'copy') {
        copyToClipboard(elementId, type);
    }
}
window.handleDropdownAction = handleDropdownAction; // Attach globally

let currentEditModal = null;

function addEditContainer(modal, initialTagId, initialType) {
    const editContainers = modal.querySelector('#edit-containers');
    const editContainer = document.createElement('div');
    editContainer.className = 'edit-container';

    editContainer.setAttribute('data-tag-id', initialTagId);
    editContainer.setAttribute('data-type', initialType.toLowerCase());

    editContainer.innerHTML = `
        <div class="edit-header">Edit ${initialType.toUpperCase()} Content (Tag ID: ${initialTagId})</div>
        <textarea placeholder="Enter your edit prompt here..."></textarea>
        <button class="remove-edit">Remove Edit</button>
    `;
    editContainers.appendChild(editContainer);

    const removeButton = editContainer.querySelector('.remove-edit');
    removeButton.addEventListener('click', () => {
        editContainers.removeChild(editContainer);
        if (editContainers.children.length === 0) {
            closeEditModal();
        }
    });

    editContainer.querySelector('textarea').focus();
}

function closeEditModal() {
    if (currentEditModal) {
        document.body.removeChild(currentEditModal);
        currentEditModal = null;
    }
}

function handleSubmit(modal) {
    const editContainers = modal.querySelector('#edit-containers');
    const operations = Array.from(editContainers.querySelectorAll('.edit-container')).map(container => {
        const textarea = container.querySelector('textarea');
        const currentTagId = container.getAttribute('data-tag-id');
        const currentType = container.getAttribute('data-type').toUpperCase();

        const rawPrompt = textarea.value.trim();

        return {
            tagId: currentTagId,
            currentType: currentType, // Keep type separate for filtering
            rawPrompt: rawPrompt
        };
    }).filter(op => op.rawPrompt !== ''); // Filter out empty prompts

    if (operations.length > 0) {
        const editPayload = {
            version: 1,
            operations: operations.map(op => ({
                type: "edit_element",
                tagId: op.tagId,
                // Format prompt for AI request
                prompt: `${op.currentType.toLowerCase()}: ${op.rawPrompt}`,
            }))
        };

        parentApi.navigate({
            method: "eval",
            command: `!edit ${JSON.stringify(editPayload)}`,
            source: "edit",
        }).catch(error => console.error('Error during edit:', error));
    } else {
        showToast("No content submitted for edit.");
    }

    closeEditModal();
}

function showEditModal(tagId, type) {
    if (currentEditModal) {
        // If a modal is already open, append the new edit container
        addEditContainer(currentEditModal, tagId, type);
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'websim-edit-modal';
    modal.innerHTML = `
        <h3>Edit Content</h3>
        <div id="edit-containers"></div>
        <div class="button-container">
            <button class="add-edit">Add Another Edit</button>
            <div>
                <button class="submit">Submit Edits</button>
                <button class="cancel">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const addEditButton = modal.querySelector('.add-edit');
    const submitButton = modal.querySelector('.submit');
    const cancelButton = modal.querySelector('.cancel');

    addEditContainer(modal, tagId, type); // Add the first edit container

    addEditButton.addEventListener('click', () => {
        const newTagId = prompt("Enter the tag ID for the new edit:");
        if (newTagId) {
            const newType = prompt("Enter the type for the new edit (HTML/CSS/JS/ALL):") || 'ALL';
            addEditContainer(modal, newTagId, newType);
        }
    });

    modal.style.display = 'block';

    submitButton.onclick = () => handleSubmit(modal);
    cancelButton.onclick = closeEditModal;

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            handleSubmit(modal);
        }
        if (e.key === 'Escape') {
            closeEditModal();
        }
    });

    currentEditModal = modal;
}

// --- Drag and Drop Logic ---

let isDragging = false;
let currentFeature = null;
let offsetX, offsetY;
let dragMode = false;

function toggleComponent(type) {
    const frames = document.querySelectorAll('.feature-frame');
    frames.forEach(frame => {
        if (type === 'html') {
            const htmlContent = frame.querySelector('.feature-content');
            if(htmlContent) htmlContent.classList.toggle('no-copy');
        } else if (type === 'css') {
            const cssButton = frame.querySelector('.copy-css');
            if(cssButton) cssButton.classList.toggle('hidden');
        } else if (type === 'js') {
            const jsButton = frame.querySelector('.copy-js');
            if(jsButton) jsButton.classList.toggle('hidden');
        }
    });
}
window.toggleComponent = toggleComponent; // Attach globally

function toggleAllComponents() {
    const allFrames = document.querySelectorAll('.feature-frame');
    allFrames.forEach(frame => {
        frame.classList.toggle('no-copy');
    });
}
window.toggleAllComponents = toggleAllComponents; // Attach globally

function toggleDragMode() {
    dragMode = !dragMode;
    document.querySelectorAll('.feature-frame').forEach(feature => {
        if (dragMode) {
            feature.classList.add('draggable');
        } else {
            feature.classList.remove('draggable');
        }
    });
    const toggleDragModeBtn = document.getElementById('toggleDragMode');
    if (toggleDragModeBtn) {
        toggleDragModeBtn.textContent = dragMode ? 'Exit Drag Mode' : 'Toggle Drag Mode';
    }
}
window.toggleDragMode = toggleDragMode; // Attach globally

function startDragging(e) {
    // Only allow dragging if dragMode is active and the click target is the frame itself or its parent container, 
    // but not internal components or corners.
    if (!dragMode || e.target.closest('.corner-button') || e.target.closest('.feature-content')) return;

    const frame = e.currentTarget;
    const rect = frame.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if the click is in the top-left 'ALL' corner trigger area (40px x 25px)
    if (x < 40 && y < 25) {
        // Prevent drag initiation in the corner area reserved for the 'ALL' menu.
        return; 
    }

    isDragging = true;
    currentFeature = frame;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    currentFeature.style.resize = 'none';
}

function drag(e) {
    if (!isDragging || !dragMode) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    currentFeature.style.left = `${x}px`;
    currentFeature.style.top = `${y}px`;
}

function stopDragging() {
    if (isDragging && currentFeature) {
        saveFeaturePosition(currentFeature);
        currentFeature.style.resize = 'both'; // Restore resizing
    }
    isDragging = false;
    currentFeature = null;
}

function saveFeaturePosition(feature) {
    const id = feature.id;
    const position = {
        left: feature.style.left,
        top: feature.style.top,
        width: feature.style.width,
        height: feature.style.height
    };
    localStorage.setItem(id, JSON.stringify(position));
}

function loadFeaturePositions() {
    document.querySelectorAll('.feature-frame').forEach(feature => {
        const id = feature.id;
        const savedPosition = localStorage.getItem(id);
        if (savedPosition) {
            const position = JSON.parse(savedPosition);
            feature.style.left = position.left;
            feature.style.top = position.top;
            feature.style.width = position.width;
            feature.style.height = position.height;
        } else {
            feature.style.left = `${Math.random() * (window.innerWidth / 2)}px`;
            feature.style.top = `${Math.random() * (window.innerHeight / 2)}px`;
        }
    });
}

// --- Event Handling (Corner detection) ---

// Handle click on parent frame or feature frame for 'ALL' copy/edit corner
function handleFrameClick(event, element) {
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if click is in the top-left 'ALL' corner trigger area
    if (x < 40 && y < 25) {
        // Element ID passed should be the feature frame ID (e.g., feature1-frame)
        const frame = element.closest('.feature-frame');
        if (frame) {
             showDropdown(event, frame.id, 'all');
        }
        // Stop propagation if we clicked the corner area, ensuring the click event is handled here 
        // and doesn't propagate up, especially if a dropdown was initiated.
        event.stopPropagation();
    }
}
window.handleFrameClick = handleFrameClick; // Attach globally

// Handle click on feature content for 'HTML' copy/edit corner
function handleContentClick(event, element) {
    // Check if the click is on a child interactive element (like a toggle button), if so, ignore.
    if (event.target.closest('.toggle-buttons')) {
        return;
    }

    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if click is in the top-right 'HTML' corner trigger area
    if (x > rect.width - 40 && y < 25) {
        // Element ID passed should be the content ID (e.g., feature1-html)
        showDropdown(event, element.id, 'html');
        event.stopPropagation();
    }
}
window.handleContentClick = handleContentClick; // Attach globally


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {

    // Initialize drag mode toggle button event listener (if using feature 10 button)
    const toggleDragModeBtn = document.getElementById('toggleDragMode');
    if (toggleDragModeBtn && !toggleDragModeBtn.onclick) {
        // If the HTML inline handler wasn't set, set it here. We rely on the inline one now.
        // toggleDragModeBtn.addEventListener('click', toggleDragMode);
    }

    // Initialize drag listeners on feature frames
    document.querySelectorAll('.feature-frame').forEach(feature => {
        feature.addEventListener('mousedown', startDragging);
        feature.addEventListener('mouseup', () => {
            saveFeaturePosition(feature);
        });
    });

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDragging);

    loadFeaturePositions();
});