import { loadGLTF } from "../libs/loader.js";
import * as THREE from "../libs/three123/three.module.js";
import { ARButton } from "../libs/jsm/ARButton.js";

// Utility functions
const normalizeModel = (obj, height) => {
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = bbox.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(height / size.y);

    const bbox2 = new THREE.Box3().setFromObject(obj);
    const center = bbox2.getCenter(new THREE.Vector3());
    obj.position.set(-center.x, -center.y, -center.z);
};

const setOpacity = (obj, opacity) => {
    obj.traverse((child) => {
        if (child.isMesh) {
            child.material.transparent = true;
            child.material.opacity = opacity;
        }
    });
};

const deepClone = (obj) => {
    const newObj = obj.clone();
    newObj.traverse((o) => {
        if (o.isMesh) {
            o.material = o.material.clone();
        }
    });
    return newObj;
};

// Updated item categories with multiple items per category
const itemCategories = {
    lamp: [
        { name: "lamp1", height: 0.3 },
        { name: "lamp2", height: 0.35 },
        { name: "lamp3", height: 0.28 }
    ],
    sofa: [
        { name: "sofa1", height: 0.1 },
        { name: "sofa2", height: 0.12 },
        { name: "sofa3", height: 0.15 }
    ],
    table: [
        { name: "table1", height: 0.2 },
        { name: "table2", height: 0.25 },
        { name: "table3", height: 0.22 }
    ]
};

document.addEventListener("DOMContentLoaded", () => {
    const initialize = async () => {
        // Scene and AR setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;

        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
        scene.add(light);

        // Controller for hit-testing
        const controller = renderer.xr.getController(0);
        scene.add(controller);

        // AR Session setup
        let hitTestSource = null;
        let hitTestSourceRequested = false;
        let currentHitMatrix = new THREE.Matrix4();
        let hasValidHit = false;

        const arButton = ARButton.createButton(renderer, {
            requiredFeatures: ["hit-test"],
            optionalFeatures: ["dom-overlay"],
            domOverlay: { root: document.body },
        });
        document.body.appendChild(renderer.domElement);
        document.body.appendChild(arButton);

        // UI Elements
        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");
        const confirmButtons = document.getElementById("confirm-buttons");
        const placeButton = document.querySelector("#place");
        const cancelButton = document.querySelector("#cancel");

        // Model Management
        const loadedModels = new Map();
        const placedItems = [];
        let previewItem = null;
        let selectedItem = null;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        // UI Event Listeners
        menuButton.addEventListener("click", () => {
            sidebarMenu.classList.add("open");
            menuButton.style.display = "none";
            closeButton.style.display = "block";
        });

        closeButton.addEventListener("click", () => {
            sidebarMenu.classList.remove("open");
            closeButton.style.display = "none";
            menuButton.style.display = "block";
        });

        const icons = document.querySelectorAll(".icon");
        icons.forEach((icon) => {
            icon.addEventListener("click", (event) => {
                const submenu = icon.querySelector(".submenu");
                submenu.classList.toggle("open");
                event.stopPropagation();
            });
        });

        const showModel = (item) => {
            if (previewItem) {
                previewItem.visible = false;
            }
            previewItem = item;
            previewItem.visible = hasValidHit;
            setOpacity(previewItem, 0.5);
            confirmButtons.style.display = "flex";
            
            if (hasValidHit) {
                previewItem.matrix.copy(currentHitMatrix);
                previewItem.matrixAutoUpdate = false;
            }
        };

        const placeModel = () => {
            if (previewItem && hasValidHit) {
                const clone = deepClone(previewItem);
                setOpacity(clone, 1.0);
                clone.matrix.copy(currentHitMatrix);
                clone.matrixAutoUpdate = false;
                scene.add(clone);
                placedItems.push(clone);
                cancelModel();
            }
        };

        const cancelModel = () => {
            confirmButtons.style.display = "none";
            if (previewItem) {
                previewItem.visible = false;
                previewItem = null;
            }
        };

        // Model Selection & Interaction
        const selectModel = (model) => {
            if (selectedItem && selectedItem !== model) {
                setOpacity(selectedItem, 1.0);
            }
            selectedItem = model;
            setOpacity(selectedItem, 0.8);
        };

        const checkIntersection = (event) => {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(placedItems, true);

            if (intersects.length > 0) {
                let targetObject = intersects[0].object;
                while (targetObject.parent && !placedItems.includes(targetObject)) {
                    targetObject = targetObject.parent;
                }
                if (placedItems.includes(targetObject)) {
                    selectModel(targetObject);
                    return true;
                }
            }
            return false;
        };

        // Touch interaction state
        let touchState = {
            isRotating: false,
            isDragging: false,
            isScaling: false,
            lastTouch: new THREE.Vector2(),
            initialRotation: 0,
            initialScale: new THREE.Vector3(),
            initialDistance: 0,
            lastPinchDistance: 0,
            rotationSpeed: 0.01,
            movementSpeed: 0.003,
            scaleSpeed: 0.5,
            minScale: 0.5,
            maxScale: 2.0,
            movementThreshold: 1,
            rotationThreshold: 1,
        };

        // Touch interaction helper functions
        const getDistance = (touch1, touch2) => {
            const dx = touch1.clientX - touch2.clientX;
            const dy = touch1.clientY - touch2.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const getCenter = (touch1, touch2) => {
            return {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
        };

        // Touch Event Handlers
        const onTouchStart = async (event) => {
            event.preventDefault();
            
            if (event.touches.length === 1) {
                const touch = event.touches[0];
                const didSelect = checkIntersection({
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                });

                if (!didSelect && previewItem) {
                    // Update preview item position based on hit-test
                    if (hasValidHit) {
                        previewItem.visible = true;
                        previewItem.matrix.copy(currentHitMatrix);
                    }
                } else if (didSelect && selectedItem) {
                    touchState.isRotating = true;
                    touchState.lastTouch.set(touch.clientX, touch.clientY);
                    touchState.initialRotation = selectedItem.rotation.y;
                }
            } else if (event.touches.length === 2 && selectedItem) {
                const touch1 = event.touches[0];
                const touch2 = event.touches[1];
                
                touchState.isDragging = true;
                touchState.isScaling = true;
                touchState.isRotating = false;
                
                touchState.initialDistance = getDistance(touch1, touch2);
                touchState.lastPinchDistance = touchState.initialDistance;
                touchState.initialScale.copy(selectedItem.scale);
                
                const center = getCenter(touch1, touch2);
                touchState.lastTouch.set(center.x, center.y);
            }
        };

        // Keep existing onTouchMove and onTouchEnd handlers

        // Load all models
        for (const category in itemCategories) {
            for (const itemInfo of itemCategories[category]) {
                try {
                    const model = await loadGLTF(`../assets/models/${category}/${itemInfo.name}/scene.gltf`);
                    normalizeModel(model.scene, itemInfo.height);

                    const item = new THREE.Group();
                    item.add(model.scene);
                    item.visible = false;
                    item.matrixAutoUpdate = false;
                    scene.add(item);

                    loadedModels.set(`${category}-${itemInfo.name}`, item);

                    const thumbnail = document.querySelector(`#${category}-${itemInfo.name}`);
                    if (thumbnail) {
                        thumbnail.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const model = loadedModels.get(`${category}-${itemInfo.name}`);
                            if (model) {
                                showModel(model);
                            }
                        });
                    }
                } catch (error) {
                    console.error(`Error loading model ${category}/${itemInfo.name}:`, error);
                }
            }
        }

        // Button Event Listeners
        placeButton.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            placeModel();
        });

        cancelButton.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cancelModel();
        });

        // Add touch event listeners
        renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: false });
        renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: false });
        renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: false });

        // Render Loop with hit-testing
        const renderLoop = () => {
            renderer.setAnimationLoop((timestamp, frame) => {
                if (frame) {
                    if (!hitTestSourceRequested) {
                        frame.requestHitTestSource({ space: renderer.xr.getReferenceSpace() }).then((source) => {
                            hitTestSource = source;
                        });
                        hitTestSourceRequested = true;
                    }

                    if (hitTestSource) {
                        const hitTestResults = frame.getHitTestResults(hitTestSource);
                        if (hitTestResults.length > 0) {
                            const hit = hitTestResults[0];
                            const hitPose = hit.getPose(renderer.xr.getReferenceSpace());
                            
                            currentHitMatrix.fromArray(hitPose.transform.matrix);
                            hasValidHit = true;

                            if (previewItem && previewItem.visible) {
                                previewItem.matrix.copy(currentHitMatrix);
                            }
                        } else {
                            hasValidHit = false;
                            if (previewItem) {
                                previewItem.visible = false;
                            }
                        }
                    }
                }
                renderer.render(scene, camera);
            });
        };

        renderLoop();
    };

    initialize();
});
