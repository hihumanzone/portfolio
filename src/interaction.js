import * as THREE from 'three';

export class InteractionManager {
  constructor(scene, camera, domElement, cameraRig, onOpenModal, onSwitchWaypoint, onSummitPan) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.cameraRig = cameraRig;
    this.onOpenModal = onOpenModal;
    this.onSwitchWaypoint = onSwitchWaypoint;
    this.onSummitPan = onSummitPan;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-999, -999);
    this.interactiveTargets = [];
    this.raycastColliders = [];
    this.hoveredTarget = null;
    this.isOverUI = false;
    this.mouseDirty = false;

    this.tooltipEl = document.getElementById('object-tooltip');
    this.tooltipText = document.getElementById('tooltip-text');
    this._tooltipHidden = true;
    this._lastTooltipX = 0;
    this._lastTooltipY = 0;
    this._pendingMouseX = 0;
    this._pendingMouseY = 0;

    // Touch & Panorama Drag tracking
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.lastTouchX = 0;
    this.touchStartTime = 0;
    this.isPanningSummit = false;

    this.bindEvents();
  }

  registerTarget(object, data) {
    const targetData = { ...object.userData, ...data, isInteractive: true };
    object.userData = targetData;
    
    // If a lightweight proxy collider exists on the object, raycast against it directly
    const collider = object.userData.collider || object;
    collider.userData = targetData;
    
    this.interactiveTargets.push(object);
    this.raycastColliders.push(collider);
  }

  performTargetInteraction(target) {
    if (!target) return;
    const { waypointIndex, modalId, onClick } = target.userData;

    if (typeof onClick === 'function') {
      onClick();
    }

    if (typeof waypointIndex === 'number') {
      if (this.onSwitchWaypoint) {
        this.onSwitchWaypoint(waypointIndex);
      } else if (this.cameraRig) {
        this.cameraRig.goToWaypoint(waypointIndex);
      }
    }

    if (modalId && this.onOpenModal) {
      setTimeout(() => {
        this.onOpenModal(modalId);
      }, 350);
    }
  }

  findInteractiveObjectAt(normalizedPoint) {
    this.raycaster.setFromCamera(normalizedPoint, this.camera);
    const targetsToTest = this.raycastColliders.length ? this.raycastColliders : this.interactiveTargets;
    const intersects = this.raycaster.intersectObjects(targetsToTest, true);

    if (intersects.length > 0) {
      let targetInteractive = null;
      for (let i = 0; i < intersects.length; i++) {
        let obj = intersects[i].object;
        while (obj && !obj.userData.isInteractive && obj.parent) {
          obj = obj.parent;
        }
        if (obj && obj.userData.isInteractive) {
          if (obj.userData.id === 'signalTower') {
            return obj;
          }
          if (!targetInteractive) {
            targetInteractive = obj;
          }
        }
      }
      return targetInteractive;
    }
    return null;
  }

  bindEvents() {
    const isPointerOverUI = (e) => {
      const target = e.target;
      if (!target) return false;

      // Efficient check against UI overlay elements without triggering layout reflow
      const element = (target instanceof Element) ? target : target.parentElement;
      if (element && typeof element.closest === 'function') {
        if (element.closest('.bottom-dock, .top-bar, .modal-backdrop, .modal-container, .modal-overlay, .hud-btn, .audio-control-cluster, .audio-volume-panel, .audio-mixer-panel, button, a, input, textarea')) {
          return true;
        }
      }

      return false;
    };

    window.addEventListener('mousemove', (e) => {
      if (isPointerOverUI(e)) {
        this.isOverUI = true;
        this.mouse.set(-999, -999);
        this.mouseDirty = true;
        if (this.hoveredTarget) {
          this.hoveredTarget = null;
          this.domElement.style.cursor = 'default';
        }
        if (this.tooltipEl && !this._tooltipHidden) {
          this.tooltipEl.classList.add('hidden');
          this._tooltipHidden = true;
        }
        return;
      }

      this.isOverUI = false;
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.mouseDirty = true;

      // Defer tooltip positioning to update() via transform (no layout thrash)
      this._pendingMouseX = e.clientX;
      this._pendingMouseY = e.clientY;
      this._hasPendingMouse = true;
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      this.isOverUI = true;
      this.mouse.set(-999, -999);
      if (this.hoveredTarget) {
        this.hoveredTarget = null;
        this.domElement.style.cursor = 'default';
      }
      if (this.tooltipEl) {
        this.tooltipEl.classList.add('hidden');
      }
    });

    this.domElement.addEventListener('click', (e) => {
      if (isPointerOverUI(e)) return;
      if (!this.hoveredTarget) return;
      this.performTargetInteraction(this.hoveredTarget);
    });

    // Touch Support: Tap detection for raycasting + Mobile-only Drag for Summit Panorama + Swipe for Waypoints
    this.domElement.addEventListener('touchstart', (e) => {
      if (isPointerOverUI(e)) return;
      if (e.touches.length > 0) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.lastTouchX = this.touchStartX;
        this.isPanningSummit = false;
        this.touchStartTime = Date.now();
      }
    }, { passive: true });

    this.domElement.addEventListener('touchmove', (e) => {
      if (isPointerOverUI(e) || !e.touches.length) return;
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;
      const deltaX = clientX - this.lastTouchX;
      const totalDistX = Math.abs(clientX - this.touchStartX);
      const totalDistY = Math.abs(clientY - this.touchStartY);

      // In Summit Waypoint (index 0) on mobile phones: horizontal drag pans the mountain & river panorama!
      const isMobile = this.cameraRig?.isMobileDevice ? this.cameraRig.isMobileDevice() : (window.innerWidth <= 768);
      if (isMobile && this.cameraRig && this.cameraRig.activeWaypointIndex === 0 && !this.cameraRig.isTransitioning) {
        if (totalDistX > 6 && totalDistX > totalDistY * 0.7) {
          this.isPanningSummit = true;
          // Drag right pulls river onto screen from the left (+pan)
          // Drag left pulls mountain peaks onto screen from the right (-pan)
          const sensitivity = (deltaX / window.innerWidth) * 0.95;
          this.cameraRig.panSummit(sensitivity);
          this.lastTouchX = clientX;
          if (this.onSummitPan) {
            this.onSummitPan(this.cameraRig.getSummitPanRatio());
          }
        }
      }
    }, { passive: true });

    this.domElement.addEventListener('touchend', (e) => {
      if (isPointerOverUI(e)) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      if (this.cameraRig && this.cameraRig.isTransitioning) return;

      if (this.isPanningSummit) {
        this.isPanningSummit = false;
        return; // Prevent tap or waypoint switch when panning panorama
      }

      const deltaX = touch.clientX - this.touchStartX;
      const deltaY = touch.clientY - this.touchStartY;
      const dist = Math.hypot(deltaX, deltaY);
      const elapsed = Date.now() - this.touchStartTime;

      // 1. Horizontal Swipe Gesture -> Switch waypoints when NOT in summit panorama mode
      if (this.cameraRig && this.cameraRig.activeWaypointIndex !== 0) {
        if (dist > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && elapsed < 650) {
          const totalWaypoints = this.cameraRig.waypoints.length;
          const currentIdx = this.cameraRig.activeWaypointIndex;
          if (deltaX < 0) {
            // Swipe left -> advance to next waypoint
            const nextIdx = (currentIdx + 1) % totalWaypoints;
            if (this.onSwitchWaypoint) this.onSwitchWaypoint(nextIdx);
            else this.cameraRig.goToWaypoint(nextIdx);
          } else {
            // Swipe right -> return to previous waypoint
            const prevIdx = (currentIdx - 1 + totalWaypoints) % totalWaypoints;
            if (this.onSwitchWaypoint) this.onSwitchWaypoint(prevIdx);
            else this.cameraRig.goToWaypoint(prevIdx);
          }
          return;
        }
      }

      // 2. Clean Tap Gesture (< 16px movement) -> Raycast touch coordinates
      if (dist < 16 && elapsed < 450) {
        const touchPoint = new THREE.Vector2(
          (touch.clientX / window.innerWidth) * 2 - 1,
          -(touch.clientY / window.innerHeight) * 2 + 1
        );
        const hitTarget = this.findInteractiveObjectAt(touchPoint);
        if (hitTarget) {
          // Brief mobile visual feedback: position tooltip at tap
          if (this.tooltipEl && this.tooltipText) {
            this.tooltipText.textContent = hitTarget.userData.label || 'Opening...';
            this.tooltipEl.style.left = `${touch.clientX}px`;
            this.tooltipEl.style.top = `${touch.clientY}px`;
            this.tooltipEl.classList.remove('hidden');
            setTimeout(() => {
              if (this.tooltipEl) this.tooltipEl.classList.add('hidden');
            }, 800);
          }
          this.performTargetInteraction(hitTarget);
        }
      }
    }, { passive: true });
  }

  update() {
    // Coalesce tooltip positioning to one style write per frame (was per-mousemove)
    if (this.tooltipEl && !this._tooltipHidden && this._hasPendingMouse) {
      this._hasPendingMouse = false;
      if (this._pendingMouseX !== this._lastTooltipX || this._pendingMouseY !== this._lastTooltipY) {
        this._lastTooltipX = this._pendingMouseX;
        this._lastTooltipY = this._pendingMouseY;
        this.tooltipEl.style.left = `${this._lastTooltipX}px`;
        this.tooltipEl.style.top = `${this._lastTooltipY}px`;
      }
    }

    // Skip raycast when pointer hasn't moved and hover state is settled
    if (!this.mouseDirty) return;
    this.mouseDirty = false;

    if (this.isOverUI || !this.interactiveTargets.length) {
      if (this.hoveredTarget) {
        this.hoveredTarget = null;
        this.domElement.style.cursor = 'default';
        if (this.tooltipEl && !this._tooltipHidden) {
          this.tooltipEl.classList.add('hidden');
          this._tooltipHidden = true;
        }
      }
      return;
    }

    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Raycast against proxy colliders or target meshes
    const targetsToTest = this.raycastColliders.length ? this.raycastColliders : this.interactiveTargets;
    const intersects = this.raycaster.intersectObjects(targetsToTest, true);

    if (intersects.length > 0) {
      let targetInteractive = null;

      for (let i = 0; i < intersects.length; i++) {
        let obj = intersects[i].object;
        while (obj && !obj.userData.isInteractive && obj.parent) {
          obj = obj.parent;
        }
        if (obj && obj.userData.isInteractive) {
          // Priority to dedicated sub-features like signalTower over parent cabin
          if (obj.userData.id === 'signalTower') {
            targetInteractive = obj;
            break;
          }
          if (!targetInteractive) {
            targetInteractive = obj;
          }
        }
      }

      if (targetInteractive) {
        if (this.hoveredTarget !== targetInteractive) {
          this.hoveredTarget = targetInteractive;
          this.domElement.style.cursor = 'pointer';
          if (this.tooltipEl && this.tooltipText) {
            this.tooltipText.textContent = targetInteractive.userData.label || 'Click to Inspect';
            if (this._tooltipHidden) {
              this.tooltipEl.classList.remove('hidden');
              this._tooltipHidden = false;
            }
          }
        }
        return;
      }
    }

    if (this.hoveredTarget) {
      this.hoveredTarget = null;
      this.domElement.style.cursor = 'default';
      if (this.tooltipEl && !this._tooltipHidden) {
        this.tooltipEl.classList.add('hidden');
        this._tooltipHidden = true;
      }
    }
  }
}
