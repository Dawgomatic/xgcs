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
    const [isLocked, setIsLocked] = useState(false);
    const [boxStyle, setBoxStyle] = useState({
        width: 200,
        height: 200,
        top: 100,
        left: 100,
    });
    const boxRef = useRef(null);

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

    const handleMouseDown = (e) => {
        if (isLocked) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startTop = boxStyle.top;
        const startLeft = boxStyle.left;

        const handleMouseMove = (e) => {
            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);
            setBoxStyle((prevStyle) => ({
                ...prevStyle,
                top: newTop,
                left: newLeft,
            }));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleResize = (e) => {
        if (isLocked) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = boxStyle.width;
        const startHeight = boxStyle.height;

        const handleMouseMove = (e) => {
            const newWidth = startWidth + (e.clientX - startX);
            const newHeight = startHeight + (e.clientY - startY);
            setBoxStyle((prevStyle) => ({
                ...prevStyle,
                width: newWidth,
                height: newHeight,
            }));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <HomeErrorBoundary>
            <div id="wrapper" style={{ 
                width: '100%', 
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                left: '20px',
                paddingtop: '-10px',
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
                <button onClick={() => setIsLocked(!isLocked)}>
                    {isLocked ? 'Unlock' : 'Lock'}
                </button>
                <div
                    ref={boxRef}
                    style={{
                        position: 'absolute',
                        width: boxStyle.width,
                        height: boxStyle.height,
                        top: boxStyle.top,
                        left: boxStyle.left,
                        backgroundColor: 'lightblue',
                        cursor: isLocked ? 'default' : 'move',
                        zIndex: 9999,
                    }}
                    onMouseDown={handleMouseDown}
                >
                    <div
                        style={{
                            position: 'absolute',
                            width: 10,
                            height: 10,
                            bottom: 0,
                            right: 0,
                            backgroundColor: 'darkblue',
                            cursor: isLocked ? 'default' : 'nwse-resize',
                        }}
                        onMouseDown={handleResize}
                    />
                </div>
            </div>
        </HomeErrorBoundary>
    );
}

export default HomePage; 