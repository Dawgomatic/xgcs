/**
 * CorridorScan.js
 * Generates zig-zag pattern for linear infrastructure inspection
 */

export class CorridorScan {
    constructor(path, options = {}) {
        this.path = path; // Array of {lat, lng}
        this.width = options.width || 20; // meters total width
        this.altitude = options.altitude || 50;
        this.spacing = options.spacing || 10; // spacing between zig-zag legs along the path (approx)
    }

    generate() {
        if (!this.path || this.path.length < 2) return [];

        const waypoints = [];
        const halfWidth = this.width / 2;

        for (let i = 0; i < this.path.length - 1; i++) {
            const p1 = this.path[i];
            const p2 = this.path[i + 1];

            const segmentPoints = this.generateSegmentZigZag(p1, p2, halfWidth);
            waypoints.push(...segmentPoints);
        }

        return waypoints.map(p => ({
            lat: p.lat,
            lng: p.lng,
            alt: this.altitude,
            action: 'NAV_WAYPOINT'
        }));
    }

    generateSegmentZigZag(p1, p2, halfWidth) {
        // Calculate heading and distance
        const dist = this.getDistance(p1, p2);
        const heading = this.getHeading(p1, p2);

        const legs = Math.ceil(dist / this.spacing);
        const actualSpacing = dist / legs;

        const points = [];
        const normal = heading + 90; // Right normal

        // Generate points along the centerline, then offset
        for (let i = 0; i <= legs; i++) {
            const d = i * actualSpacing;
            const centerPoint = this.destinationPoint(p1, d, heading);

            // Toggle left/right
            const offsetDir = (i % 2 === 0) ? -1 : 1; // Start Left (-1) then Right (1)
            // Or specific pattern. Let's do Left -> Right -> Right -> Left? 
            // Standard ZigZag: (Left, dist=0) -> (Right, dist=spacing) -> (Left, dist=2*spacing)

            const offsetHeading = (i % 2 === 0) ? (heading - 90) : (heading + 90);
            const p = this.destinationPoint(centerPoint, halfWidth, offsetHeading);
            points.push(p);
        }

        return points;
    }

    // Helper: Distance in meters
    getDistance(p1, p2) {
        const R = 6371e3; // Earth radius
        const φ1 = p1.lat * Math.PI / 180;
        const φ2 = p2.lat * Math.PI / 180;
        const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
        const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    // Helper: Heading in degrees
    getHeading(p1, p2) {
        const φ1 = p1.lat * Math.PI / 180;
        const φ2 = p2.lat * Math.PI / 180;
        const λ1 = p1.lng * Math.PI / 180;
        const λ2 = p2.lng * Math.PI / 180;

        const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
        const θ = Math.atan2(y, x);
        const brng = (θ * 180 / Math.PI + 360) % 360;
        return brng;
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
