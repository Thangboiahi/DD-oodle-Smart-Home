/**
 * DD oodle Smart Home — 3D Free Camera & Damped Focus Transition Engine
 *
 * Wraps Three.js OrbitControls with:
 * - 1-finger / left-drag 360° orbit (clamped above floor plane)
 * - 2-finger / right-drag free floor-plane pan across rooms & floors
 * - Pinch / wheel zoom from whole-house overview to close-up module inspection
 * - Smooth exponential damped transitions: focusRoom, focusModule, focusFloor, setCameraMode, resetCamera
 * - Immediate yield back to user the instant manual pointer/touch control starts
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ArchitecturalRoomSpec, HomeArchitectureBlueprint } from '@/lib/twin/architectureBlueprints';

export type CameraMode = 'free' | 'iso' | 'top';

interface PendingCameraTransition {
  active: boolean;
  goalPosition: THREE.Vector3;
  goalTarget: THREE.Vector3;
}

export class Home3DCameraController {
  public readonly controls: OrbitControls;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly isSoftwareGl: boolean;
  private readonly transition: PendingCameraTransition = {
    active: false,
    goalPosition: new THREE.Vector3(),
    goalTarget: new THREE.Vector3(),
  };

  private readonly _offset = new THREE.Vector3();
  private mode: CameraMode = 'free';
  private onUserTakeover?: () => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    isSoftwareGl: boolean,
    onUserTakeover?: () => void
  ) {
    this.camera = camera;
    this.isSoftwareGl = isSoftwareGl;
    this.onUserTakeover = onUserTakeover;

    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = false; // Pan smoothly parallel to floor slabs
    controls.rotateSpeed = 0.85;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 1.05;

    // Clamp polar angle so camera never clips below the ground/floor slab
    controls.minPolarAngle = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.07;

    // Whole-house overview down to close-up 3D hardware faceplate inspection
    controls.minDistance = 0.65;
    controls.maxDistance = 30;

    // Mobile touch ergonomics: 1-finger orbit, 2-finger pan + pinch zoom
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // Immediately yield scripted camera transitions when the user starts interacting
    controls.addEventListener('start', () => {
      if (this.transition.active) {
        this.transition.active = false;
      }
      if (this.mode !== 'free') {
        this.mode = 'free';
        controls.minPolarAngle = 0.06;
        controls.maxPolarAngle = Math.PI / 2 - 0.07;
        this.onUserTakeover?.();
      }
    });

    this.controls = controls;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  /**
   * Temporarily disables/re-enables OrbitControls during direct 3D slider dragging.
   */
  public setInteractionLocked(locked: boolean): void {
    this.controls.enabled = !locked;
  }

  /**
   * Immediately sets camera & target without animation (used on initial mount).
   */
  public snapToOverview(blueprint: HomeArchitectureBlueprint, centerY: number = 1.4): void {
    const dist = Math.max(12.5, blueprint.houseRadius * 1.55);
    this.camera.position.set(
      blueprint.centerX + dist * 0.72,
      centerY + dist * 0.68,
      blueprint.centerZ + dist * 0.86
    );
    this.controls.target.set(blueprint.centerX, centerY, blueprint.centerZ);
    this.transition.active = false;
    this.controls.update();
  }

  /**
   * Smoothly transitions to a Camera Mode preset: Free Orbit, Isometric, or Top-Down Plan.
   */
  public setCameraMode(
    nextMode: CameraMode,
    blueprint: HomeArchitectureBlueprint,
    activeFloorY: number
  ): void {
    this.mode = nextMode;
    const dist = Math.max(12.5, blueprint.houseRadius * 1.55);
    const targetY = activeFloorY + 1.0;

    if (nextMode === 'top') {
      this.controls.minPolarAngle = 0.02;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.07;
      this.startTransition(
        new THREE.Vector3(blueprint.centerX + 0.08, activeFloorY + dist * 1.32, blueprint.centerZ + 0.25),
        new THREE.Vector3(blueprint.centerX, activeFloorY + 0.1, blueprint.centerZ)
      );
      return;
    }

    this.controls.minPolarAngle = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.07;

    if (nextMode === 'iso') {
      const isoD = dist * 0.82;
      this.startTransition(
        new THREE.Vector3(blueprint.centerX + isoD, targetY + isoD * 0.82, blueprint.centerZ + isoD),
        new THREE.Vector3(blueprint.centerX, targetY, blueprint.centerZ)
      );
      return;
    }

    // Free Orbit: gentle 3/4 architectural overview
    this.startTransition(
      new THREE.Vector3(
        blueprint.centerX + dist * 0.72,
        targetY + dist * 0.62,
        blueprint.centerZ + dist * 0.86
      ),
      new THREE.Vector3(blueprint.centerX, targetY, blueprint.centerZ)
    );
  }

  /**
   * Smoothly returns to the whole-house overview and resets to Free Orbit mode.
   */
  public resetCamera(blueprint: HomeArchitectureBlueprint, centerY: number = 1.4): void {
    this.setCameraMode('free', blueprint, Math.max(0, centerY - 0.4));
  }

  /**
   * Smoothly shifts the camera vertical framing when switching floors while keeping user azimuth.
   */
  public focusFloor(
    blueprint: HomeArchitectureBlueprint,
    floorBaseY: number,
    isAllFloors: boolean
  ): void {
    const targetY = isAllFloors ? (blueprint.floors.length > 2 ? 2.4 : 1.4) : floorBaseY + 1.05;
    const dist = isAllFloors
      ? Math.max(12.5, blueprint.houseRadius * 1.58)
      : Math.max(10.5, blueprint.houseRadius * 1.28);

    // Preserve user's current horizontal orbit angle so floor switching feels effortless
    this._offset.subVectors(this.camera.position, this.controls.target);
    const horizLen = Math.hypot(this._offset.x, this._offset.z);
    const dirX = horizLen > 0.01 ? this._offset.x / horizLen : 0.65;
    const dirZ = horizLen > 0.01 ? this._offset.z / horizLen : 0.76;

    if (this.mode === 'top') {
      this.startTransition(
        new THREE.Vector3(blueprint.centerX + 0.08, floorBaseY + dist * 1.28, blueprint.centerZ + 0.2),
        new THREE.Vector3(blueprint.centerX, floorBaseY + 0.1, blueprint.centerZ)
      );
      return;
    }

    const goalPos = new THREE.Vector3(
      blueprint.centerX + dirX * dist * 0.82,
      targetY + dist * 0.62,
      blueprint.centerZ + dirZ * dist * 0.82
    );
    const goalTarget = new THREE.Vector3(blueprint.centerX, targetY, blueprint.centerZ);
    this.startTransition(goalPos, goalTarget);
  }

  /**
   * Smoothly pans and zooms into a specific room from a clean 3/4 interior cutaway angle.
   */
  public focusRoom(room: ArchitecturalRoomSpec, floorBaseY: number): void {
    const roomSpan = Math.max(room.w, room.d);
    const focusDist = Math.max(5.2, roomSpan * 1.25);
    const targetY = floorBaseY + 0.75;

    // Approach from the open front-right quadrant biased toward current camera side
    this._offset.subVectors(this.camera.position, this.controls.target);
    const signX = this._offset.x >= 0 ? 1 : -1;
    const signZ = this._offset.z >= 0 ? 1 : -1;

    const goalTarget = new THREE.Vector3(room.x, targetY, room.z);
    const goalPos = new THREE.Vector3(
      room.x + signX * focusDist * 0.62,
      targetY + focusDist * 0.72,
      room.z + signZ * focusDist * 0.74
    );

    this.startTransition(goalPos, goalTarget);
  }

  /**
   * Smoothly pans and zooms right in front of the actual 3D hardware model facing its front normal.
   */
  public focusModule(
    worldPos: THREE.Vector3,
    frontNormal?: THREE.Vector3,
    focusDistance: number = 1.4,
    focusTargetOffsetY: number = 0
  ): void {
    const goalTarget = new THREE.Vector3(
      worldPos.x,
      worldPos.y + focusTargetOffsetY,
      worldPos.z
    );

    if (frontNormal && frontNormal.lengthSq() > 0.01) {
      const dist = Math.max(0.85, focusDistance);
      const liftY = dist > 2.0 ? 0.55 : 0.16;
      const goalPos = new THREE.Vector3(
        goalTarget.x + frontNormal.x * dist,
        Math.max(goalTarget.y + liftY, 0.7),
        goalTarget.z + frontNormal.z * dist
      );
      this.startTransition(goalPos, goalTarget);
      return;
    }

    this._offset.subVectors(this.camera.position, this.controls.target);
    const horizLen = Math.hypot(this._offset.x, this._offset.z);
    const dirX = horizLen > 0.01 ? this._offset.x / horizLen : 0.62;
    const dirZ = horizLen > 0.01 ? this._offset.z / horizLen : 0.78;

    const inspectDist = Math.max(1.5, focusDistance);
    const goalPos = new THREE.Vector3(
      goalTarget.x + dirX * inspectDist * 0.85,
      Math.max(goalTarget.y + 0.6, 0.9),
      goalTarget.z + dirZ * inspectDist * 0.85
    );

    this.startTransition(goalPos, goalTarget);
  }

  private startTransition(goalPos: THREE.Vector3, goalTarget: THREE.Vector3): void {
    this.transition.goalPosition.copy(goalPos);
    this.transition.goalTarget.copy(goalTarget);
    this.transition.active = true;
  }

  /**
   * Advances damped camera transitions & OrbitControls once per animation frame (zero GC).
   */
  public update(dtSec: number): void {
    const clampedDt = Math.min(0.05, Math.max(0.001, dtSec));

    if (this.transition.active) {
      if (this.isSoftwareGl) {
        // Snappier step on software WebGL so transition completes cleanly without sluggish frames
        const alpha = Math.min(1, clampedDt * 12);
        this.camera.position.lerp(this.transition.goalPosition, alpha);
        this.controls.target.lerp(this.transition.goalTarget, alpha);
      } else {
        const lambda = 6.5;
        this.camera.position.x = THREE.MathUtils.damp(
          this.camera.position.x,
          this.transition.goalPosition.x,
          lambda,
          clampedDt
        );
        this.camera.position.y = THREE.MathUtils.damp(
          this.camera.position.y,
          this.transition.goalPosition.y,
          lambda,
          clampedDt
        );
        this.camera.position.z = THREE.MathUtils.damp(
          this.camera.position.z,
          this.transition.goalPosition.z,
          lambda,
          clampedDt
        );
        this.controls.target.x = THREE.MathUtils.damp(
          this.controls.target.x,
          this.transition.goalTarget.x,
          lambda,
          clampedDt
        );
        this.controls.target.y = THREE.MathUtils.damp(
          this.controls.target.y,
          this.transition.goalTarget.y,
          lambda,
          clampedDt
        );
        this.controls.target.z = THREE.MathUtils.damp(
          this.controls.target.z,
          this.transition.goalTarget.z,
          lambda,
          clampedDt
        );
      }

      const posDist = this.camera.position.distanceTo(this.transition.goalPosition);
      const tgtDist = this.controls.target.distanceTo(this.transition.goalTarget);
      if (posDist < 0.03 && tgtDist < 0.03) {
        this.camera.position.copy(this.transition.goalPosition);
        this.controls.target.copy(this.transition.goalTarget);
        this.transition.active = false;
      }
    }

    this.controls.update();
  }

  public dispose(): void {
    this.controls.dispose();
  }
}
