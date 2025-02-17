import React, { useState, useEffect } from 'react';
import { Ion } from 'cesium';

function Settings() {
  const [ionKey, setIonKey] = useState('');

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
      <h1>Settings</h1>
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
          Don't have a token? Get one at{' '}
          <a href="https://cesium.com/ion/signup" target="_blank" rel="noopener noreferrer">
            cesium.com/ion/signup
          </a>
        </p>
      </div>
    </div>
  );
}

export default Settings; 