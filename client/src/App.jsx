import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Ion } from 'cesium';
import './styles/App.css';
import { ThemeProvider } from './context/ThemeContext';
import { VehicleProvider } from './context/VehicleContext';
import TopBar from './components/TopBar';
import Settings from './pages/Settings';
import VehicleConnections from './pages/VehicleConnections';
import TemplatePage from './pages/TemplatePage';

import Simulation from './pages/Simulation';
import FlightDisplay from './pages/FlightDisplay';
import Parameters from './pages/Parameters';
import MavlinkSender from './pages/MavlinkSender';
import FirmwareUpdate from './pages/FirmwareUpdate';
import SensorCalibration from './pages/SensorCalibration';
import Analysis from './pages/Analysis';

import TuningPage from './pages/TuningPage';


function App() {
  // Initialize Cesium Ion token from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('cesiumIonKey');
    console.log('App.jsx - Checking for Cesium Ion token:', !!savedToken);
    if (savedToken) {
      Ion.defaultAccessToken = savedToken;
      console.log('Cesium Ion token loaded from localStorage and set as default');
    } else {
      console.log('No Cesium Ion token found. You can add one in Settings to remove 401 errors.');
    }
  }, []);

  return (
    <ThemeProvider>
      <VehicleProvider>
        <Router>
          <div className="App">
            <TopBar />
            <div className="content">
              <Routes>
                <Route path="/settings" element={<Settings />} />
                <Route path="/" element={<FlightDisplay />} />
                <Route path="/flight-display" element={<FlightDisplay />} />
                <Route path="/vehicle-connections" element={<VehicleConnections />} />
                <Route path="/template" element={<TemplatePage />} />

                <Route path="/simulation" element={<Simulation />} />
                <Route path="/parameters" element={<Parameters />} />
                <Route path="/mavlink-sender" element={<MavlinkSender />} />
                <Route path="/firmware" element={<FirmwareUpdate />} />
                <Route path="/calibration" element={<SensorCalibration />} />
                <Route path="/analysis" element={<Analysis />} />
                <Route path="/tuning" element={<TuningPage />} />

              </Routes>
            </div>
          </div>
        </Router>
      </VehicleProvider>
    </ThemeProvider>
  );
}

export default App; 