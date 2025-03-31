import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './styles/App.css';
import { ThemeProvider } from './context/ThemeContext';
import { VehicleProvider } from './context/VehicleContext';
import TopBar from './components/TopBar';
import Settings from './pages/Settings';
import HomePage from './pages/HomePage';
import VehicleConnections from './pages/VehicleConnections';
import TemplatePage from './pages/TemplatePage';

function App() {
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
                <Route path="/vehicle-connections" element={<VehicleConnections />} />
                <Route path="/template" element={<TemplatePage />} />
              </Routes>
            </div>
          </div>
        </Router>
      </VehicleProvider>
    </ThemeProvider>
  );
}

export default App; 