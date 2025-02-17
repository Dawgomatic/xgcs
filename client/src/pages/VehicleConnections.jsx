import React from 'react';
import '../styles/VehicleConnections.css'; // Assuming you have a CSS file for styling

function VehicleConnections() {
  return (
    <div className="vehicle-connections">
      {/* Other content of the page */}

      <div className="button-container">
        <button>Add</button>
        <button>Remove</button>
        <button>Edit</button>
        <button>Connect</button>
        <button>Disconnect</button>
      </div>
    </div>
  );
}

export default VehicleConnections;
