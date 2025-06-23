const fs = require('fs');
const path = require('path');

// Test if the files exist and have the correct syntax
const files = [
  'client/src/components/FlightMap.jsx',
  'client/src/components/InstrumentPanel.jsx'
];

console.log('Testing compilation of React components...');

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for common syntax issues
    const issues = [];
    
    if (content.includes('createWorldTerrain')) {
      issues.push('Found old createWorldTerrain API call');
    }
    
    if (content.includes('import.*Altitude.*from.*@mui/icons-material')) {
      issues.push('Found incorrect Altitude icon import');
    }
    
    if (content.includes('icon: Altitude')) {
      issues.push('Found incorrect Altitude icon usage');
    }
    
    if (issues.length === 0) {
      console.log(`✅ ${file} - No syntax issues found`);
    } else {
      console.log(`❌ ${file} - Issues found:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
  } else {
    console.log(`❌ ${file} - File not found`);
  }
});

console.log('\nCompilation test complete!'); 