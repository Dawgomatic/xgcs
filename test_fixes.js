const fs = require('fs');
const path = require('path');

console.log('Testing if compilation errors are fixed...\n');

// Test FlightMap.jsx
const flightMapPath = path.join(__dirname, 'client/src/components/FlightMap.jsx');
if (fs.existsSync(flightMapPath)) {
  const flightMapContent = fs.readFileSync(flightMapPath, 'utf8');
  
  if (flightMapContent.includes('Cesium.Terrain.fromWorldTerrain()')) {
    console.log('✅ FlightMap.jsx - Cesium API fix is in place');
  } else if (flightMapContent.includes('createWorldTerrain')) {
    console.log('❌ FlightMap.jsx - Still has old createWorldTerrain API');
  } else {
    console.log('❌ FlightMap.jsx - No terrain provider found');
  }
} else {
  console.log('❌ FlightMap.jsx - File not found');
}

// Test InstrumentPanel.jsx
const instrumentPanelPath = path.join(__dirname, 'client/src/components/InstrumentPanel.jsx');
if (fs.existsSync(instrumentPanelPath)) {
  const instrumentPanelContent = fs.readFileSync(instrumentPanelPath, 'utf8');
  
  if (instrumentPanelContent.includes('icon: <Height />')) {
    console.log('✅ InstrumentPanel.jsx - Icon fix is in place');
  } else if (instrumentPanelContent.includes('icon: Altitude')) {
    console.log('❌ InstrumentPanel.jsx - Still has incorrect Altitude icon');
  } else {
    console.log('❌ InstrumentPanel.jsx - No icon usage found');
  }
  
  // Check imports
  if (instrumentPanelContent.includes('import.*Height.*from.*@mui/icons-material')) {
    console.log('✅ InstrumentPanel.jsx - Height icon is imported');
  } else {
    console.log('❌ InstrumentPanel.jsx - Height icon import missing');
  }
} else {
  console.log('❌ InstrumentPanel.jsx - File not found');
}

console.log('\nTest complete!');
console.log('\nTo manually test compilation:');
console.log('1. cd xgcs/client');
console.log('2. yarn start');
console.log('\nOr use the unified script:');
console.log('./start.sh --frontend-only --restart --logging'); 