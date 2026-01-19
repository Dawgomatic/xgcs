/**
 * StructureScan.js
 * Generates orbital patterns for structure inspection
 */

export class StructureScan {
    constructor(center, options = {}) {
        this.center = center; // {lat, lng}
        this.radius = options.radius || 20; // meters
        this.startAltitude = options.startAltitude || 30;
        this.endAltitude = options.endAltitude || 30;
        this.layers = options.layers || 1;
        this.steps = options.steps || 16; // Points per circle
        this.startAngle = options.startAngle || 0; // Angle to start at
    }

    generate() {
        if (!this.center) return [];

        const waypoints = [];

        // Add ROI (Region of Interest) at center
        // Command 201 (DO_SET_ROI) is obsolete, usually MAV_CMD_DO_SET_ROI_LOCATION (195)
        // or just use MAV_CMD_DO_SET_ROI (201) with param 5,6,7
        waypoints.push({
            lat: this.center.lat,
            lng: this.center.lng,
            alt: this.center.alt || 0, // ROI at ground?
            action: 'CMD_DO_SET_ROI_LOCATION', // Or generic ROI
            command: 195,
            param5: 0, param6: 0, param7: 0 // Will need to be set to lat/lon/alt in backend if using command
            // Actually, frontend usually sends 'action' and backend handles packing.
            // But 'CMD_DO_SET_ROI_LOCATION' isn't standard in our current backend map.
            // We'll stick to 'NAV_WAYPOINT' with Yaw facing center for now?
            // Better: Add ROI item first.
        });

        // Backend `connection_manager.cpp` doesn't explicitly handle ROI command mapping from string "CMD_DO_SET_ROI_LOCATION" yet.
        // We'll create waypoints. Facing is handled by vehicle if ROI is active.
        // For now, let's just generate the path.

        const altStep = (this.endAltitude - this.startAltitude) / Math.max(1, this.layers - 1);

        for (let l = 0; l < this.layers; l++) {
            const currentAlt = this.startAltitude + (l * altStep);

            // Generate circle points
            for (let i = 0; i <= this.steps; i++) { // <= steps to close loop? usually orbit is continuous.
                // If just orbit, we don't need to close loop if we go to next layer?
                // MAVSDK Orbit is a smart shot. Structure scan is usually manual waypoints.

                // If i == steps, we repeat first point. Helpful for ensuring full circle.
                // But for spiral/structure, maybe just go around.

                if (i === this.steps && l < this.layers - 1) continue; // Skip closure if moving to next layer?

                const angle = this.startAngle + (i * (360 / this.steps));
                const p = this.destinationPoint(this.center, this.radius, angle);

                waypoints.push({
                    lat: p.lat,
                    lng: p.lng,
                    alt: currentAlt,
                    action: 'NAV_WAYPOINT'
                });
            }
        }

        // Cancel ROI at end
        waypoints.push({
            lat: 0, lng: 0, alt: 0,
            action: 'CMD_DO_SET_ROI_NONE',
            command: 197
        });

        return waypoints;
    }

    // Helper: Destination point given distance and bearing
    destinationPoint(p, distance, bearing) {
        const R = 6371e3;
        const δ = distance / R;
        const θ = bearing * Math.PI / 180;
        const φ1 = p.lat * Math.PI / 180;
        const λ1 = p.lng * Math.PI / 180;

        const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) +
            Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
        const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
            Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

        return {
            lat: φ2 * 180 / Math.PI,
            lng: λ2 * 180 / Math.PI
        };
    }
}
