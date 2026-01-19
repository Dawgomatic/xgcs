// Sync external waypoints
useEffect(() => {
    if (!viewerRef.current || !externalWaypoints) return;

    // Clear existing waypoints
    const viewer = viewerRef.current;
    const entitiesToRemove = [];
    viewer.entities.values.forEach(entity => {
        if (entity.id && entity.id.toString().startsWith('waypoint-')) {
            entitiesToRemove.push(entity);
        }
    });
    entitiesToRemove.forEach(e => viewer.entities.remove(e));

    // Add new waypoints
    externalWaypoints.forEach((wp, index) => {
        // Adapt structure: MissionPlanning uses {lat, lon, altitude}
        // FlightMap expects {coordinate: {lat, lon}, altitude}
        const adaptedWp = {
            id: wp.id || Date.now() + index,
            coordinate: wp.coordinate || { lat: wp.lat, lon: wp.lon },
            altitude: wp.altitude || 0,
            sequence: index + 1,
            name: wp.description || `WP ${index + 1}`
        };
        addWaypointToMap(adaptedWp);
    });
}, [externalWaypoints]);

// Sync external polygons (Fence/Survey)
useEffect(() => {
    if (!viewerRef.current || !externalPolygons) return;

    // Clear existing polygons
    const viewer = viewerRef.current;
    const entitiesToRemove = [];
    viewer.entities.values.forEach(entity => {
        if (entity.id && (entity.id.toString().startsWith('polygon-') || entity.id === 'fence-polygon')) {
            entitiesToRemove.push(entity);
        }
    });
    entitiesToRemove.forEach(e => viewer.entities.remove(e));

    // Add new polygons
    externalPolygons.forEach((poly, index) => {
        if (!poly.points || poly.points.length < 3) return;

        const positions = poly.points.map(p =>
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat)
        );

        viewer.entities.add({
            id: `polygon-${index}`,
            polygon: {
                hierarchy: positions,
                material: poly.color ? Cesium.Color.fromCssColorString(poly.color).withAlpha(0.3) : Cesium.Color.GREEN.withAlpha(0.3),
                outline: true,
                outlineColor: poly.color ? Cesium.Color.fromCssColorString(poly.color) : Cesium.Color.GREEN
            }
        });
    });
}, [externalPolygons]);
