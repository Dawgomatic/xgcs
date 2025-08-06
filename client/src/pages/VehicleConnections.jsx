import React, { useState, useEffect } from 'react';
import '../styles/VehicleConnections.css';
import VehicleModal from '../components/VehicleModal';
import { useVehicles } from '../context/VehicleContext';
import axios from 'axios'; // Make sure axios is installed

function VehicleConnections() {
  const { connectionStates, connectVehicle, disconnectVehicle, getConnectionState } = useVehicles();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editItemIndex, setEditItemIndex] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusTimeout, setStatusTimeout] = useState(null);
  const [position, setPosition] = useState(null);
  const [formData, setFormData] = useState({});
  const [simulations, setSimulations] = useState([]);

  useEffect(() => {
    // Load items from localStorage when the component mounts
    const savedItems = localStorage.getItem('items');
    if (savedItems) {
      console.log('Loaded items from localStorage:', savedItems);
      setItems(JSON.parse(savedItems));
    }
    
    // Load running simulations
    loadSimulations();
    
    // Check for existing active connections
    checkActiveConnections();
  }, []);

  // @hallucinated - Debug connection states
  useEffect(() => {
    console.log('Connection states changed:', connectionStates);
  }, [connectionStates]);

  // @hallucinated - Check for existing active connections
  const checkActiveConnections = async () => {
    try {
      const response = await fetch('/api/vehicles');
      if (response.ok) {
        const data = await response.json();
        const activeVehicles = data.vehicles || [];
        
        // Update connection states based on backend response
        activeVehicles.forEach(vehicle => {
          if (vehicle.connected) {
            // This will be handled by the VehicleContext
            console.log(`Found active vehicle: ${vehicle.name}`);
          }
        });
      }
    } catch (error) {
      console.error('Error checking active connections:', error);
    }
  };

  useEffect(() => {
    // Save items to localStorage whenever they change, but only if items is not empty
    if (items.length > 0) {
      console.log('Saving items to localStorage:', items);
      localStorage.setItem('items', JSON.stringify(items));
    }
  }, [items]);

  // Clear the previous timeout when component unmounts
  useEffect(() => {
    return () => {
      if (statusTimeout) {
        clearTimeout(statusTimeout);
      }
    };
  }, [statusTimeout]);

  // Load running simulations
  const loadSimulations = async () => {
    try {
      const response = await fetch('/api/simulation/list');
      if (response.ok) {
        const data = await response.json();
        // Filter only running simulations
        const runningSimulations = (data.simulations || []).filter(sim => sim.status === 'running');
        setSimulations(runningSimulations);
      }
    } catch (error) {
      console.error('Error loading simulations:', error);
    }
  };

  // Helper function to set status with timeout
  const setTemporaryStatus = (message, isError = false) => {
    // Clear any existing timeout
    if (statusTimeout) {
      clearTimeout(statusTimeout);
    }

    setConnectionStatus(message);

    // Set timeout for all messages, not just errors
    const timeout = setTimeout(() => {
      setConnectionStatus('');
    }, 3000);
    setStatusTimeout(timeout);
  };

  const handleAddClick = () => {
    setIsModalOpen(true);
  };

  const handleEditClick = () => {
    if (selectedItem !== null) {
      setEditItemIndex(selectedItem);
      setIsEditModalOpen(true);
    }
  };

  const handleAddItem = (item) => {
    setItems([...items, item]);
    setIsModalOpen(false);
  };

  const handleEditItem = (newItem) => {
    const updatedItems = items.map((item, index) =>
      index === editItemIndex ? newItem : item
    );
    setItems(updatedItems);
    setIsEditModalOpen(false);
  };

  const handleSelectItem = (index) => {
    setSelectedItem(index);
  };

  const handleDeleteItem = () => {
    if (selectedItem !== null) {
      setItems(items.filter((_, index) => index !== selectedItem));
      setSelectedItem(null);
    }
  };

  // @hallucinated - Telemetry functions now handled by VehicleContext
  const startTelemetry = (vehicleId) => {
    // This is now handled by the VehicleContext
    console.log(`Telemetry started for ${vehicleId} via VehicleContext`);
  };
  
  const stopTelemetry = (vehicleId) => {
    // This is now handled by the VehicleContext
    console.log(`Telemetry stopped for ${vehicleId} via VehicleContext`);
  };

  const handleConnect = async () => {
    if (selectedItem === null) {
      setTemporaryStatus('Please select a connection first', true);
      return;
    }

    const selectedConnection = items[selectedItem];
    console.log('Attempting to connect to:', selectedConnection);
    setIsConnecting(true);
    setTemporaryStatus('Connecting to vehicle...');

    try {
      const success = await connectVehicle(selectedConnection);
      console.log('Connect result:', success);
      
      if (success) {
        setTemporaryStatus('Connected successfully!');
        console.log('Connection states after connect:', connectionStates);
      } else {
        setTemporaryStatus('Connection failed. Please check the backend.', true);
      }
    } catch (error) {
      console.error('Connect error:', error);
      setTemporaryStatus(`Connection error: ${error.message}`, true);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (selectedItem === null) {
      setTemporaryStatus('Please select a connection first', true);
      return;
    }

    const selectedConnection = items[selectedItem];
    const vehicleId = selectedConnection.name;
    console.log('Attempting to disconnect:', vehicleId);
    
    try {
      setIsConnecting(true);
      setTemporaryStatus('Disconnecting from vehicle...');
      
      const success = await disconnectVehicle(vehicleId);
      console.log('Disconnect result:', success);
      
      if (success) {
        setTemporaryStatus('Disconnected successfully!');
        console.log('Connection states after disconnect:', connectionStates);
      } else {
        setTemporaryStatus('Disconnection failed. Please check the backend.', true);
      }
    } catch (error) {
      console.error('Disconnect error:', error);
      setTemporaryStatus(`Disconnection error: ${error.message}`, true);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="vehicle-connections">
      <h1>Vehicle Connections</h1>
      
      {/* Show connection status */}
      {connectionStatus && (
        <div className={`status-message ${isConnecting ? 'connecting' : ''}`}>
          {connectionStatus}
        </div>
      )}
      
      <div className="settings-section">
        <h2>Connection Controls</h2>
        <div className="settings-group">
          <div className="button-group">
            <button onClick={handleAddClick}>Add</button>
            <button onClick={handleDeleteItem}>Remove</button>
            <button onClick={handleEditClick}>Edit</button>
            <button 
              onClick={handleConnect}
              disabled={isConnecting || selectedItem === null || connectionStates[items[selectedItem]?.name]}
              style={{
                backgroundColor: connectionStates[items[selectedItem]?.name] ? '#ccc' : '#4caf50',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: connectionStates[items[selectedItem]?.name] ? 'not-allowed' : 'pointer'
              }}
            >
              {isConnecting ? 'Connecting...' : connectionStates[items[selectedItem]?.name] ? 'Connected' : 'Connect'}
            </button>
            <button 
              onClick={handleDisconnect}
              disabled={isConnecting || selectedItem === null || !connectionStates[items[selectedItem]?.name]}
              style={{
                backgroundColor: connectionStates[items[selectedItem]?.name] ? '#ff4444' : '#ccc',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: connectionStates[items[selectedItem]?.name] ? 'pointer' : 'not-allowed'
              }}
            >
              {isConnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2>Running Simulations</h2>
        <div className="items-container">
          {simulations.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              No running simulations. Start a simulation from the Simulation tab.
            </div>
          ) : (
            simulations.map((sim) => (
              <div
                key={sim.id}
                className="item-card simulation-card"
                style={{ 
                  backgroundColor: '#e8f5e9',
                  border: '1px solid #4caf50',
                  marginBottom: '10px',
                  padding: '15px',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  // Auto-create a connection for this simulation
                  const newConnection = {
                    name: `SITL: ${sim.name || sim.id}`,
                    connectionDetails: {
                      vehicleType: sim.vehicleType === 'arducopter' ? 'drone' : sim.vehicleType,
                      connectionType: 'tcp',
                      ip: 'localhost',
                      port: sim.port.toString()
                    },
                    modelUrl: '',
                    modelScale: 1.0
                  };
                  const existingIndex = items.findIndex(item => 
                    item.connectionDetails.port === newConnection.connectionDetails.port
                  );
                  if (existingIndex === -1) {
                    setItems([...items, newConnection]);
                    setSelectedItem(items.length);
                  } else {
                    setSelectedItem(existingIndex);
                  }
                }}
              >
                <div>
                  <strong>{sim.name || `${sim.vehicleType} ${sim.id}`}</strong>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    <div><strong>ArduPilot SITL Serial Ports:</strong></div>
                    <div>• Serial0 (MAVLink): {sim.port}</div>
                    <div>• Serial1 (GPS): {sim.port + 1}</div>
                    <div>• Serial2 (Telemetry): {sim.port + 2}</div>
                    <div style={{ marginTop: '5px', fontSize: '11px' }}>
                      Type: {sim.vehicleType} • Status: {sim.status}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <button 
          onClick={loadSimulations}
          style={{ marginTop: '10px' }}
        >
          Refresh Simulations
        </button>
      </div>

      <div className="settings-section">
        <h2>Saved Connections</h2>
        <div className="items-container">
          {items.map((item, index) => {
            const isActive = connectionStates[item.name];
            return (
              <div
                key={index}
                className={`item-card ${selectedItem === index ? 'selected' : ''}`}
                onClick={() => handleSelectItem(index)}
                style={{
                  border: '1px solid #ddd',
                  backgroundColor: '#fff',
                  position: 'relative',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                {/* Status Light */}
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: isActive ? '#4caf50' : '#ff4444',
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 2px #ddd',
                  flexShrink: 0
                }} />
                
                {/* Connection Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {item.connectionDetails.ip}:{item.connectionDetails.port} • {item.connectionDetails.vehicleType}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <VehicleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddItem}
      />

      <VehicleModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onAdd={handleEditItem}
        initialValue={items[editItemIndex]}
      />
    </div>
  );
}

export default VehicleConnections;
