
       import { loadGLTF } from "../libs/loader.js";
import * as THREE from "../libs/three123/three.module.js";
import { ARButton } from "../libs/jsm/ARButton.js";

// Utility functions remain unchanged
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

// Item categories remain unchanged
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

// Setup function remains unchanged
const setupAR = async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    document.body.appendChild(renderer.domElement);

    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: document.body },
        sessionInit: {
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.body }
        }
    });
    document.body.appendChild(arButton);

    return { scene, camera, renderer };
};

document.addEventListener("DOMContentLoaded", () => {
    const initialize = async () => {
        const { scene, camera, renderer } = await setupAR();

        // Lights setup remains unchanged
        const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        scene.add(light);
        scene.add(directionalLight);

        // Modified touch interaction setup
        const raycaster = new THREE.Raycaster();
        const touches = new THREE.Vector2();
        let selectedObject = null;
        let isRotating = false;
        let isDragging = false;
        let isPinching = false;
        let initialPinchDistance = 0;
        let initialScale = 1;
        let previousTouchX = 0;

        // Modified touch handlers
        const onTouchStart = (event) => {
            event.preventDefault();
            
            if (event.touches.length === 1) {
                // Single finger for rotation
                touches.x = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                touches.y = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;
                
                raycaster.setFromCamera(touches, camera);
                const intersects = raycaster.intersectObjects(placedItems, true);
                
                if (intersects.length > 0) {
                    selectedObject = intersects[0].object.parent;
                    isRotating = true;
                    previousTouchX = event.touches[0].pageX;
                }
            } else if (event.touches.length === 2) {
                // Two fingers for dragging or pinching
                if (selectedObject) {
                    isRotating = false;
                    
                    // Check if it's a pinch gesture
                    const dx = event.touches[0].pageX - event.touches[1].pageX;
                    const dy = event.touches[0].pageY - event.touches[1].pageY;
                    initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                    initialScale = selectedObject.scale.x;
                    
                    // Set dragging flag
                    isDragging = true;
                }
            }
        };

        const onTouchMove = (event) => {
            event.preventDefault();
            
            if (selectedObject) {
                if (event.touches.length === 1 && isRotating) {
                    // Single finger rotation (horizontal only)
                    const deltaX = event.touches[0].pageX - previousTouchX;
                    selectedObject.rotation.y += deltaX * 0.01;
                    previousTouchX = event.touches[0].pageX;
                } else if (event.touches.length === 2) {
                    const dx = event.touches[0].pageX - event.touches[1].pageX;
                    const dy = event.touches[0].pageY - event.touches[1].pageY;
                    const pinchDistance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (Math.abs(pinchDistance - initialPinchDistance) > 10) {
                        // Pinch gesture
                        isPinching = true;
                        isDragging = false;
                        const scale = (pinchDistance / initialPinchDistance) * initialScale;
                        selectedObject.scale.set(scale, scale, scale);
                    } else if (isDragging) {
                        // Two-finger drag
                        const centerX = (event.touches[0].pageX + event.touches[1].pageX) / 2;
                        const centerY = (event.touches[0].pageY + event.touches[1].pageY) / 2;
                        
                        touches.x = (centerX / window.innerWidth) * 2 - 1;
                        touches.y = -(centerY / window.innerHeight) * 2 + 1;
                        
                        raycaster.setFromCamera(touches, camera);
                        const intersect = raycaster.intersectObject(reticle);
                        
                        if (intersect.length > 0) {
                            const point = intersect[0].point;
                            selectedObject.position.x = point.x;
                            selectedObject.position.z = point.z;
                        }
                    }
                }
            }
        };

        const onTouchEnd = (event) => {
            if (event.touches.length === 0) {
                isRotating = false;
                isDragging = false;
                isPinching = false;
                selectedObject = null;
            } else if (event.touches.length === 1) {
                isDragging = false;
                isPinching = false;
            }
        };

        // Add touch event listeners
        renderer.domElement.addEventListener('touchstart', onTouchStart, false);
        renderer.domElement.addEventListener('touchmove', onTouchMove, false);
        renderer.domElement.addEventListener('touchend', onTouchEnd, false);

        // Rest of the code remains unchanged
        const controller = renderer.xr.getController(0);
        scene.add(controller);

        // Create reticle
        const reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        reticle.visible = false;
        reticle.matrixAutoUpdate = false;
        scene.add(reticle);

        // UI Elements setup remains unchanged
        const menuButton = document.getElementById("menu-button");
        const closeButton = document.getElementById("close-button");
        const sidebarMenu = document.getElementById("sidebar-menu");
        const confirmButtons = document.getElementById("confirm-buttons");
        const placeButton = document.querySelector("#place");
        const cancelButton = document.querySelector("#cancel");

        confirmButtons.style.display = "none";

        // Model Management
        const loadedModels = new Map();
        const placedItems = [];
        let previewItem = null;
        let hitTestSource = null;
        let hitTestSourceRequested = false;

     
        // Updated Touch event handlers
        const onTouchStart = (event) => {
            event.preventDefault();
            
            if (event.touches.length === 1) {
                touches.x = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                touches.y = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;
                dragStartPosition.set(event.touches[0].pageX, event.touches[0].pageY);
                
                raycaster.setFromCamera(touches, camera);
                const intersects = raycaster.intersectObjects(placedItems, true);
                
                if (intersects.length > 0) {
                    selectedObject = intersects[0].object.parent;
                    isRotating = true;
                    isDragging = false;
                    previousTouchX = event.touches[0].pageX;
                }
            } else if (event.touches.length === 2 && selectedObject) {
                isRotating = false;
                isDragging = false;
                isPinching = true;
                const dx = event.touches[0].pageX - event.touches[1].pageX;
                const dy = event.touches[0].pageY - event.touches[1].pageY;
                initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                initialScale = selectedObject.scale.x;
            }
        };

        const onTouchMove = (event) => {
            event.preventDefault();
            
            if (selectedObject) {
                if (event.touches.length === 1) {
                    const moveX = Math.abs(event.touches[0].pageX - dragStartPosition.x);
                    const moveY = Math.abs(event.touches[0].pageY - dragStartPosition.y);
                    
                    // Determine if we should start dragging
                    if (!isDragging && !isRotating && (moveX > DRAG_THRESHOLD || moveY > DRAG_THRESHOLD)) {
                        isDragging = true;
                        isRotating = false;
                    }
                    
                    if (isRotating) {
                        // Only rotate around Y axis
                        const deltaX = event.touches[0].pageX - previousTouchX;
                        selectedObject.rotation.y += deltaX * 0.01;
                        previousTouchX = event.touches[0].pageX;
                    } else if (isDragging) {
                        // Handle dragging
                        touches.x = (event.touches[0].pageX / window.innerWidth) * 2 - 1;
                        touches.y = -(event.touches[0].pageY / window.innerHeight) * 2 + 1;
                        
                        raycaster.setFromCamera(touches, camera);
                        const intersect = raycaster.intersectObject(reticle);
                        
                        if (intersect.length > 0) {
                            const point = intersect[0].point;
                            selectedObject.position.x = point.x;
                            selectedObject.position.z = point.z;
                        }
                    }
                } else if (isPinching && event.touches.length === 2) {
                    const dx = event.touches[0].pageX - event.touches[1].pageX;
                    const dy = event.touches[0].pageY - event.touches[1].pageY;
                    const pinchDistance = Math.sqrt(dx * dx + dy * dy);
                    const scale = (pinchDistance / initialPinchDistance) * initialScale;
                    selectedObject.scale.set(scale, scale, scale);
                }
            }
        };

        const onTouchEnd = (event) => {
            if (event.touches.length === 0) {
                isRotating = false;
                isDragging = false;
                isPinching = false;
                selectedObject = null;
            } else if (event.touches.length === 1) {
                isPinching = false;
            }
        };

        // Add touch event listeners
        renderer.domElement.addEventListener('touchstart', onTouchStart, false);
        renderer.domElement.addEventListener('touchmove', onTouchMove, false);
        renderer.domElement.addEventListener('touchend', onTouchEnd, false);

        // Menu event handlers
        document.addEventListener("click", (event) => {
            const isClickInsideMenu = sidebarMenu?.contains(event.target);
            const isClickOnMenuButton = menuButton?.contains(event.target);
            const isMenuOpen = sidebarMenu?.classList.contains("open");
            
            if (!isClickInsideMenu && !isClickOnMenuButton && isMenuOpen) {
                sidebarMenu.classList.remove("open");
                closeButton.style.display = "none";
                menuButton.style.display = "block";
            }
        });

        menuButton.addEventListener("click", (event) => {
            event.stopPropagation();
            sidebarMenu.classList.add("open");
            menuButton.style.display = "none";
            closeButton.style.display = "block";
        });

        closeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            sidebarMenu.classList.remove("open");
            closeButton.style.display = "none";
            menuButton.style.display = "block";
        });

        // Category handlers
        const icons = document.querySelectorAll(".icon");
        icons.forEach((icon) => {
            icon.addEventListener("click", (event) => {
                event.stopPropagation();
                const clickedSubmenu = icon.querySelector(".submenu");
                
                document.querySelectorAll('.submenu').forEach(submenu => {
                    if (submenu !== clickedSubmenu) {
                        submenu.classList.remove('open');
                    }
                });
                
                clickedSubmenu.classList.toggle("open");
            });
        });

        const showModel = (item) => {
            if (previewItem) {
                scene.remove(previewItem);
            }
            previewItem = item;
            scene.add(previewItem);
            setOpacity(previewItem, 0.5);
            confirmButtons.style.display = "flex";
        };

        const placeModel = () => {
            if (previewItem && reticle.visible) {
                const clone = deepClone(previewItem);
                setOpacity(clone, 1.0);
                
                const position = new THREE.Vector3();
                const rotation = new THREE.Quaternion();
                const scale = new THREE.Vector3();
                reticle.matrix.decompose(position, rotation, scale);
                
                clone.position.copy(position);
                clone.quaternion.copy(rotation);
                
                scene.add(clone);
                placedItems.push(clone);
                cancelModel();
            }
        };

        const cancelModel = () => {
            if (previewItem) {
                scene.remove(previewItem);
                previewItem = null;
            }
            confirmButtons.style.display = "none";
        };

        // Load models
        for (const category in itemCategories) {
            for (const itemInfo of itemCategories[category]) {
                try {
                    const model = await loadGLTF(`../assets/models/${category}/${itemInfo.name}/scene.gltf`);
                    normalizeModel(model.scene, itemInfo.height);

                    const item = new THREE.Group();
                    item.add(model.scene);
                    
                    loadedModels.set(`${category}-${itemInfo.name}`, item);

                    const thumbnail = document.querySelector(`#${category}-${itemInfo.name}`);
                    if (thumbnail) {
                        thumbnail.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const model = loadedModels.get(`${category}-${itemInfo.name}`);
                            if (model) {
                                const modelClone = deepClone(model);
                                showModel(modelClone);
                            }
                        });
                    }
                } catch (error) {
                    console.error(`Error loading model ${category}/${itemInfo.name}:`, error);
                }
            }
        }

        // Button Event Listeners
        placeButton.addEventListener("click", placeModel);
        cancelButton.addEventListener("click", cancelModel);

        // AR Session and Render Loop
        renderer.setAnimationLoop((timestamp, frame) => {
            if (frame) {
                const referenceSpace = renderer.xr.getReferenceSpace();
                const session = renderer.xr.getSession();

                if (!hitTestSourceRequested) {
                    session.requestReferenceSpace('viewer').then((referenceSpace) => {
                        session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                            hitTestSource = source;
                        });
                    });
                    hitTestSourceRequested = true;
                }

                if (hitTestSource) {
                    const hitTestResults = frame.getHitTestResults(hitTestSource);
                    if (hitTestResults.length > 0) {
                        const hit = hitTestResults[0];
                        reticle.visible = true;
                        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);

                        if (previewItem) {
                            const position = new THREE.Vector3();
                            const rotation = new THREE.Quaternion();
                            const scale = new THREE.Vector3();
                            reticle.matrix.decompose(position, rotation, scale);
                            
                            previewItem.position.copy(position);
                            previewItem.quaternion.copy(rotation);
                        }
                    } else {
                        reticle.visible = false;
                    }
                }
            }

            renderer.render(scene, camera);
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    };

        // Initialize everything else
        initialize().catch(console.error);
    
});
