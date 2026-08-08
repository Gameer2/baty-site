import { DEFAULT_LASER_COLOR, easeOut } from "@excalidraw/common";

import type { LaserPointerOptions } from "@excalidraw/laser-pointer";

import { AnimatedTrail } from "./animatedTrail";
import { getClientColor } from "./clients";

import type { Trail } from "./animatedTrail";
import type App from "./components/App";
import type { SocketId } from "./types";

export class LaserTrails implements Trail {
  public localTrail: AnimatedTrail;
  private collabTrails = new Map<SocketId, AnimatedTrail>();
  private container?: SVGSVGElement;
  // Set the instant a stroke ends — the decay below is anchored to this,
  // not to each point's own creation time (see getTrailOptions for why).
  private localTrailEndedAt = 0;
  private collabTrailEndedAt = new Map<SocketId, number>();

  constructor(private app: App) {
    this.localTrail = new AnimatedTrail(app, {
      ...this.getTrailOptions(
        () => this.localTrail.hasCurrentTrail,
        () => this.localTrailEndedAt,
      ),
      fill: () => DEFAULT_LASER_COLOR,
    });
  }

  private getTrailOptions(isActive: () => boolean, endedAt: () => number) {
    return {
      simplify: 0,
      streamline: 0.4,
      sizeMapping: () => {
        const DECAY_TIME = 1000;
        // While the user is actively drawing/pointing, keep the trail fully
        // visible — don't fade it out from under the cursor. Only apply the
        // decay once they release (the trail moves to pastTrails), so it fades
        // out gradually after they stop instead of vanishing while they draw.
        if (isActive()) {
          return 1;
        }
        // Anchored to when the STROKE ended, applied uniformly to every point
        // in it — not to each point's own creation timestamp (`c.pressure`)
        // or its distance from the tip (`c.totalLength - c.currentIndex`, the
        // old `DECAY_LENGTH` term). Either of those meant a point could
        // already be past its decay window the instant the stroke ended —
        // it'd jump straight to invisible on release instead of fading,
        // which is what read as "not smooth". Anchoring to release time
        // guarantees every point is at full width right up to release and
        // eases out together afterward, regardless of the stroke's length or
        // how long it took to draw.
        const t = Math.max(0, 1 - (performance.now() - endedAt()) / DECAY_TIME);

        return easeOut(t);
      },
    } as Partial<LaserPointerOptions>;
  }

  startPath(x: number, y: number): void {
    this.localTrail.startPath(x, y);
  }

  addPointToPath(x: number, y: number): void {
    this.localTrail.addPointToPath(x, y);
  }

  endPath(): void {
    this.localTrailEndedAt = performance.now();
    this.localTrail.endPath();
  }

  start(container: SVGSVGElement) {
    this.container = container;
    this.localTrail.start(container);
  }

  stop() {
    this.localTrail.stop();
    this.stopCollabTrails();
    this.container = undefined;
  }

  private stopCollabTrails(collaborators?: App["state"]["collaborators"]) {
    for (const [key, trail] of this.collabTrails) {
      const collaborator = collaborators?.get(key);

      if (!collaborator) {
        trail.stop();
        this.collabTrails.delete(key);
        this.collabTrailEndedAt.delete(key);
      }
    }
  }

  updateCollabTrails(collaborators: App["state"]["collaborators"]) {
    this.stopCollabTrails(collaborators);

    if (!this.container || collaborators.size === 0) {
      return;
    }

    for (const [key, collaborator] of collaborators.entries()) {
      // Current user has their own trail drawn via localTrail
      if (collaborator.isCurrentUser) {
        continue;
      }

      // IDEA: Use the collaborator pointer coordinates to trace out the
      // laser pointer trail when 1) the selected collab tool is the laser
      // pointer and 2) the collab pointer button is in the "down" state.
      let trail = this.collabTrails.get(key);
      if (!trail) {
        trail = new AnimatedTrail(this.app, {
          ...this.getTrailOptions(
            () => trail!.hasCurrentTrail,
            () => this.collabTrailEndedAt.get(key) ?? 0,
          ),
          fill: () =>
            collaborator.pointer?.laserColor ||
            getClientColor(key, collaborator),
        });
        trail.start(this.container);

        this.collabTrails.set(key, trail);
      }

      if (collaborator.pointer && collaborator.pointer.tool === "laser") {
        const buttonDown = collaborator.button === "down";
        const buttonUp = collaborator.button === "up";
        const hasTrail = trail.hasCurrentTrail;

        // Initialize a new trail
        if (buttonDown && !hasTrail) {
          trail.startPath(collaborator.pointer.x, collaborator.pointer.y);
        }

        // Add only original points
        const lastPointOriginal = !trail.hasLastPoint(
          collaborator.pointer.x,
          collaborator.pointer.y,
        );
        if (buttonDown && lastPointOriginal) {
          trail.addPointToPath(collaborator.pointer.x, collaborator.pointer.y);
        }

        // End the trail on button up
        if (buttonUp && hasTrail) {
          trail.addPointToPath(collaborator.pointer.x, collaborator.pointer.y);
          this.collabTrailEndedAt.set(key, performance.now());
          trail.endPath();
        }
      }
    }
  }
}
