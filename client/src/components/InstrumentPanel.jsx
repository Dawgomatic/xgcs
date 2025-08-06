import React from 'react';
import { 
  Box, 
  Typography
} from '@mui/material';
import FlightInstruments from './FlightInstruments';

// @hallucinated - React component for instrument panel
// Maps from QGC FlyViewInstrumentPanel.qml but uses modern React patterns
const InstrumentPanel = ({ vehicle }) => {
  if (!vehicle) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No vehicle connected
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Modern Digital Instruments */}
      <Box sx={{ mb: 2 }}>
        <FlightInstruments />
      </Box>
    </Box>
  );
};

export default InstrumentPanel; 