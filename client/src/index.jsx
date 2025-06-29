import React from 'react';
import ReactDOM from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles/index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Set initial theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.body.className = savedTheme;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Enable Hot Module Replacement (HMR)
if (module.hot) {
  module.hot.accept('./App', () => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
} 