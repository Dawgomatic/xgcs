import React, { useState, useEffect } from 'react';
import '../styles/VehicleConnections.css';
import VehicleModal from '../components/VehicleModal';
import axios from 'axios'; // Make sure axios is installed

function VehicleConnections() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editItemIndex, setEditItemIndex] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusTimeout, setStatusTimeout] = useState(null);
  const [activeConnections, setActiveConnections] = useState({});
  const [position, setPosition] = useState(null);

  useEffect(() => {
    // Load items from localStorage when the component mounts
    const savedItems = localStorage.getItem('items');
    if (savedItems) {
      console.log('Loaded items from localStorage:', savedItems);
      setItems(JSON.parse(savedItems));
    }
  }, []);

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

  const startTelemetry = (vehicleId) => {
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3001/telemetry?vehicleId=${vehicleId}`);
        const data = await response.json();
        
        if (data.position) {
          setPosition(data.position);
        }
      } catch (error) {
        // console.error('Telemetry error:', error);
      }
    }, 100);
    
    setActiveConnections(prev => ({
      ...prev,
      [vehicleId]: intervalId
    }));
  };

  const handleConnect = async () => {
    if (selectedItem === null) {
      setTemporaryStatus('Please select a connection first', true);
      return;
    }

    const selectedConnection = items[selectedItem];
    setIsConnecting(true);
    setTemporaryStatus('Connecting to vehicle...');

    try {
      const response = await fetch('http://localhost:3001/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          ip: selectedConnection.connectionDetails.ip,
          port: parseInt(selectedConnection.connectionDetails.port, 10),
          name: selectedConnection.name,
          type: selectedConnection.connectionDetails.vehicleType || 'unknown'
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setTemporaryStatus('Connected successfully!');
        startTelemetry(selectedConnection.name);
      } else {
        setTemporaryStatus(`Connection failed: ${data.message}`, true);
      }
    } catch (error) {
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
    
    try {
      setIsConnecting(true);
      setTemporaryStatus('Disconnecting from vehicle...');
      
      const response = await fetch('http://localhost:3001/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: vehicleId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setTemporaryStatus('Disconnected successfully!');
        
        if (activeConnections[vehicleId]) {
          clearInterval(activeConnections[vehicleId]);
          setActiveConnections(prev => {
            const newConnections = {...prev};
            delete newConnections[vehicleId];
            return newConnections;
          });
        }
        
        if (Object.keys(activeConnections).length === 0) {
          setPosition(null);
        }
      } else {
        setTemporaryStatus(`Disconnection failed: ${data.message}`, true);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      setTemporaryStatus(`Disconnection error: ${errorMessage}`, true);
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
              disabled={isConnecting || selectedItem === null}
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
            <button 
              onClick={handleDisconnect}
              disabled={isConnecting || selectedItem === null || !activeConnections[items[selectedItem]?.name]}
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2>Available Connections</h2>
        <div className="items-container">
          {items.map((item, index) => (
            <div
              key={index}
              className={`item-card ${selectedItem === index ? 'selected' : ''}`}
              onClick={() => handleSelectItem(index)}
            >
              {item.name}
            </div>
          ))}
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
