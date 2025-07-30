import React, { useState, useEffect } from 'react';
import { Ion } from 'cesium';
import { useTheme } from '../context/ThemeContext';
import '../styles/Settings.css';

function Settings() {
  const [ionKey, setIonKey] = useState('');
  const { isDarkMode, toggleTheme } = useTheme();

  useEffect(() => {
    // Load saved key from localStorage
    const savedKey = localStorage.getItem('cesiumIonKey');
    if (savedKey) {
      setIonKey(savedKey);
      Ion.defaultAccessToken = savedKey;
    }
  }, []);

  const handleKeyChange = (e) => {
    const newKey = e.target.value;
    setIonKey(newKey);
  };

  const saveKey = () => {
    localStorage.setItem('cesiumIonKey', ionKey);
    Ion.defaultAccessToken = ionKey;
    alert('Cesium Ion key saved successfully!');
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h1>Settings</h1>
        
        <div className="settings-section">
          <div className="settings-group">
            <div className="setting-item">
              <span>Dark Mode</span>
              <div className={`toggle-switch ${isDarkMode ? 'active' : ''}`} onClick={toggleTheme}>
                <div className="toggle-slider"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h2>Cesium Ion Settings</h2>
          <div className="setting-item">
            <label htmlFor="ionKey">Cesium Ion Access Token:</label>
            <input
              type="text"
              id="ionKey"
              value={ionKey}
              onChange={handleKeyChange}
              placeholder="Enter your Cesium Ion access token"
            />
            <button onClick={saveKey}>Save Token</button>
          </div>
          <p className="help-text">
            <strong>Why do I need a Cesium Ion token?</strong><br/>
            A Cesium Ion token provides access to high-quality 3D terrain and satellite imagery. 
            Without a token, you'll see a basic map with limited terrain detail.<br/><br/>
            Don't have a token? Get a free one at{' '}
            <a href="https://cesium.com/ion/signup" target="_blank" rel="noopener noreferrer">
              cesium.com/ion/signup
            </a>
            <br/><br/>
            <strong>Note:</strong> The application will work without a token, but with reduced terrain quality.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Settings; 