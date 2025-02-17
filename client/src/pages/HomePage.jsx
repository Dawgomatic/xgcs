import React, { useEffect, useState, useRef } from 'react';
import { 
    Ion, 
    Viewer,
    createWorldTerrainAsync,
    ImageryLayer,
    IonImageryProvider,
    Color,
    createDefaultImageryProviderViewModels
} from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";

const defaultToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2MmM0MDgzZC00OGVkLTRjZTItOWI2MS1jMGVhYTM2MmMzODYiLCJpZCI6MjczNywiaWF0IjoxNjYyMTI4MjkxfQ.fPqhawtYLhwyZirKCi8fEjPEIn1CjYqETvA0bYYhWRA';

class HomeErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        console.error('Error boundary caught error:', error);
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-container">
                    <h2>Something went wrong in the home page.</h2>
                    <button onClick={() => this.setState({ hasError: false })}>Try again</button>
                </div>
            );
        }
        return this.props.children;
    }
}

function HomePage() {
    const viewerContainer = useRef(null);
    const [viewer, setViewer] = useState(null);

    useEffect(() => {
        const savedToken = localStorage.getItem('cesiumIonKey') || defaultToken;
        Ion.defaultAccessToken = savedToken;
        window.CESIUM_BASE_URL = '/cesium';

        if (viewerContainer.current) {
            const cesiumViewer = new Viewer(viewerContainer.current, {
                homeButton: false,
                timeline: true,
                animation: true,
                requestRenderMode: true,
                shouldAnimate: false,
                scene3DOnly: false,
                selectionIndicator: false,
                shadows: true,
                baseLayer: new ImageryLayer.fromProviderAsync(
                    IonImageryProvider.fromAssetId(3954)
                ),
                imageryProviderViewModels: createDefaultImageryProviderViewModels(),
                orderIndependentTranslucency: false,
                useBrowserRecommendedResolution: false
            });

            const initTerrain = async () => {
                try {
                    cesiumViewer.terrainProvider = await createWorldTerrainAsync();
                } catch (error) {
                    console.error('Error creating terrain provider:', error);
                }
            };

            initTerrain();
            setViewer(cesiumViewer);

            return () => {
                if (cesiumViewer && !cesiumViewer.isDestroyed()) {
                    cesiumViewer.destroy();
                }
            };
        }
    }, []); // Empty dependency array

    return (
        <HomeErrorBoundary>
            <div id="wrapper" style={{ 
                width: '100%', 
                height: '100vh',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* <div id="toolbar">
                    <table className="infoPanel">
                        <tbody>
                            <tr>
                                <td className="mode" style={{ color: Color.WHITE }}>Default Mode</td>
                            </tr>
                        </tbody>
                    </table>
                </div> */}
                <div ref={viewerContainer} id="cesiumContainer" style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflow: 'hidden'
                }}></div>
            </div>
        </HomeErrorBoundary>
    );
}

export default HomePage; 