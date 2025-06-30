import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Ion } from 'cesium';
import './styles/App.css';
import { ThemeProvider } from './context/ThemeContext';
import { VehicleProvider } from './context/VehicleContext';
import TopBar from './components/TopBar';
import Settings from './pages/Settings';
import HomePage from './pages/HomePage';
import VehicleConnections from './pages/VehicleConnections';
import TemplatePage from './pages/TemplatePage';
import MissionPlanning from './pages/MissionPlanning';
import Simulation from './pages/Simulation';
import FlightDisplay from './pages/FlightDisplay';
import Parameters from './pages/Parameters';
import MavlinkSender from './pages/MavlinkSender';

function App() {
  // Initialize Cesium Ion token from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('cesiumIonKey');
    if (savedToken) {
      Ion.defaultAccessToken = savedToken;
      console.log('Cesium Ion token loaded from localStorage');
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
                <Route path="/" element={<HomePage />} />
                <Route path="/flight-display" element={<FlightDisplay />} />
                <Route path="/vehicle-connections" element={<VehicleConnections />} />
                <Route path="/template" element={<TemplatePage />} />
                <Route path="/mission-planning" element={<MissionPlanning />} />
                <Route path="/simulation" element={<Simulation />} />
                <Route path="/parameters" element={<Parameters />} />
                <Route path="/mavlink-sender" element={<MavlinkSender />} />
              </Routes>
            </div>
          </div>
        </Router>
      </VehicleProvider>
    </ThemeProvider>
  );
}

export default App; 