/**
 * SurveyPattern.js
 * Generates grid patterns for aerial surveys
 */

export class SurveyPattern {
    constructor(polygon, options = {}) {
        this.polygon = polygon; // Array of {lat, lng}
        this.altitude = options.altitude || 100;
        this.cameraFOV = options.cameraFOV || 60;
        this.overlapFront = options.overlapFront || 70; // percentage
        this.overlapSide = options.overlapSide || 60;
        this.angle = options.angle || 0; // grid angle in degrees
        this.cameraLandscape = options.cameraLandscape !== false;
    }

    generate() {
        if (!this.polygon || this.polygon.length < 3) return [];

        // 1. Calculate grid spacing based on camera specs
        const spacing = this.calculateSpacing();

        // 2. Get polygon bounds
        const bounds = this.getPolygonBounds();

        // 3. Generate grid lines
        // We will generate lines rotated by the angle, then rotate them back?
        // Easier: Rotate polygon to align with axes using -angle, generate axis-aligned grid, rotate points back by +angle.
        const center = this.getPolygonCenter(bounds);
        const rotatedPolygon = this.rotatePoints(this.polygon, center, -this.angle);
        const rotatedBounds = this.getBounds(rotatedPolygon);

        // Generate lines covering rotated bounds
        const lines = [];
        let y = rotatedBounds.south;
        while (y <= rotatedBounds.north) {
            lines.push({
                start: { lat: y, lng: rotatedBounds.west },
                end: { lat: y, lng: rotatedBounds.east }
            });
            y += this.metersToDegreesLat(spacing.side);
        }

        // 4. Clip lines to polygon
        // Basic scanline algorithm: intersect Y-line with all polygon edges.
        const waypoints = [];
        let reverse = false;

        lines.forEach(line => {
            // Find intersections with rotated polygon
            const intersections = [];
            const y = line.start.lat;

            for (let i = 0; i < rotatedPolygon.length; i++) {
                const p1 = rotatedPolygon[i];
                const p2 = rotatedPolygon[(i + 1) % rotatedPolygon.length];

                // Check for intersection with horizontal line at Y
                if ((p1.lat <= y && p2.lat > y) || (p2.lat <= y && p1.lat > y)) {
                    // Linear interpolation for X (lng)
                    const t = (y - p1.lat) / (p2.lat - p1.lat);
                    const lng = p1.lng + t * (p2.lng - p1.lng);
                    intersections.push({ lat: y, lng: lng });
                }
            }

            intersections.sort((a, b) => a.lng - b.lng);

            // Add segments (pairs of points)
            for (let i = 0; i < intersections.length; i += 2) {
                if (i + 1 < intersections.length) {
                    const pStart = intersections[i];
                    const pEnd = intersections[i + 1];

                    // Add waypoints along the line for front overlap? 
                    // For simplicity, just start and end of segment for now.
                    // TODO: Add intermediate points for camera triggering if not standard behavior

                    const segmentPoints = reverse ? [pEnd, pStart] : [pStart, pEnd];

                    segmentPoints.forEach(p => {
                        // Rotate back
                        const originalP = this.rotatePoint(p, center, this.angle);
                        waypoints.push({
                            lat: originalP.lat,
                            lng: originalP.lng,
                            alt: this.altitude,
                            action: 'NAV_WAYPOINT'
                        });
                    });
                }
            }

            if (intersections.length > 0) {
                reverse = !reverse;
            }
        });

        return waypoints;
    }

    calculateSpacing() {
        // Basic approximation assuming flat earth for small areas
        // Ground width = 2 * alt * tan(fov/2)
        const fovRad = (this.cameraFOV * Math.PI) / 180;
        const groundWidth = 2 * this.altitude * Math.tan(fovRad / 2);

        // Assuming 4:3 aspect ratio sensor, side overlap affects spacing between lines
        const spacingSide = groundWidth * (1 - this.overlapSide / 100);

        // Front overlap typically handled by camera trigger interval, not waypoint spacing,
        // unless we generate explicit trigger waypoints.
        const spacingFront = groundWidth * (1 - this.overlapFront / 100); // 4:3 scaling?

        return { front: spacingFront, side: spacingSide };
    }

    getPolygonBounds() {
        return this.getBounds(this.polygon);
    }

    getBounds(points) {
        let north = -90, south = 90, east = -180, west = 180;
        points.forEach(p => {
            north = Math.max(north, p.lat);
            south = Math.min(south, p.lat);
            east = Math.max(east, p.lng);
            west = Math.min(west, p.lng);
        });
        return { north, south, east, west };
    }

    getPolygonCenter(bounds) {
        return {
            lat: (bounds.north + bounds.south) / 2,
            lng: (bounds.east + bounds.west) / 2
        };
    }

    rotatePoint(point, center, angleDeg) {
        const angleRad = (angleDeg * Math.PI) / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        // Convert to meters relative to center
        const dy = (point.lat - center.lat) * 111320;
        const dx = (point.lng - center.lng) * 111320 * Math.cos(center.lat * Math.PI / 180);

        const newDx = dx * cos - dy * sin;
        const newDy = dx * sin + dy * cos;

        // Convert back to degrees
        const newLat = center.lat + newDy / 111320;
        const newLng = center.lng + newDx / (111320 * Math.cos(center.lat * Math.PI / 180));

        return { lat: newLat, lng: newLng };
    }

    rotatePoints(points, center, angle) {
        return points.map(p => this.rotatePoint(p, center, angle));
    }

    metersToDegreesLat(meters) {
        return meters / 111320;
    }
}
