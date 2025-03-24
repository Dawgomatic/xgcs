import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';

Modal.setAppElement('#root'); // Set the app element for accessibility

function VehicleModal({ isOpen, onClose, onAdd, initialValue = null }) {
  const [inputValue, setInputValue] = useState('');
  const [connectionType, setConnectionType] = useState('serial');
  const [connectionDetails, setConnectionDetails] = useState({});
  const [advancedSettings, setAdvancedSettings] = useState(false);
  const [vehicleType, setVehicleType] = useState('');

  useEffect(() => {
    if (initialValue) {
      setInputValue(initialValue.name || '');
      setConnectionType(initialValue.connectionType || 'serial');
      setConnectionDetails(initialValue.connectionDetails || {});
      setVehicleType(initialValue.connectionDetails?.vehicleType || '');
    } else {
      setInputValue('');
      setConnectionType('serial');
      setConnectionDetails({});
      setVehicleType('');
    }
  }, [initialValue]);

  const handleAdd = () => {
    if (inputValue) {
      onAdd({ name: inputValue, connectionType, connectionDetails, vehicleType });
      setInputValue('');
      setConnectionDetails({});
      setVehicleType('');
      onClose();
    }
  };

  const handleConnectionDetailChange = (key, value) => {
    setConnectionDetails((prevDetails) => ({
      ...prevDetails,
      [key]: value,
    }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Add/Edit Vehicle"
      className="modal-content"
      overlayClassName="modal"
    >
      <h2>{initialValue ? 'Edit Vehicle' : 'Add New Link'}</h2>
      <div>
        <label>Name</label>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter name"
        />
      </div>
      <div>
        <label>Type</label>
        <select
          value={connectionType}
          onChange={(e) => setConnectionType(e.target.value)}
        >
          <option value="serial">Serial</option>
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
        </select>
      </div>
      {connectionType === 'serial' && (
        <>
          <div>
            <label>Serial Port</label>
            <input
              type="text"
              value={connectionDetails.port || ''}
              onChange={(e) => handleConnectionDetailChange('port', e.target.value)}
              placeholder="ttyS0"
            />
          </div>
          <div>
            <label>Baud Rate</label>
            <input
              type="text"
              value={connectionDetails.baudRate || ''}
              onChange={(e) => handleConnectionDetailChange('baudRate', e.target.value)}
              placeholder="57600"
            />
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={advancedSettings}
                onChange={() => setAdvancedSettings(!advancedSettings)}
              />
              Advanced Settings
            </label>
          </div>
          {advancedSettings && (
            <>
              <div>
                <label>Parity</label>
                <select
                  value={connectionDetails.parity || 'None'}
                  onChange={(e) => handleConnectionDetailChange('parity', e.target.value)}
                >
                  <option value="None">None</option>
                  <option value="Even">Even</option>
                  <option value="Odd">Odd</option>
                </select>
              </div>
              <div>
                <label>Data Bits</label>
                <input
                  type="text"
                  value={connectionDetails.dataBits || '8'}
                  onChange={(e) => handleConnectionDetailChange('dataBits', e.target.value)}
                />
              </div>
              <div>
                <label>Stop Bits</label>
                <input
                  type="text"
                  value={connectionDetails.stopBits || '1'}
                  onChange={(e) => handleConnectionDetailChange('stopBits', e.target.value)}
                />
              </div>
            </>
          )}
        </>
      )}
      {(connectionType === 'tcp' || connectionType === 'udp') && (
        <>
          <div>
            <label>IP Address</label>
            <input
              type="text"
              value={connectionDetails.ip || ''}
              onChange={(e) => handleConnectionDetailChange('ip', e.target.value)}
              placeholder="Enter IP address"
            />
          </div>
          <div>
            <label>Port</label>
            <input
              type="text"
              value={connectionDetails.port || ''}
              onChange={(e) => handleConnectionDetailChange('port', e.target.value)}
              placeholder="Enter port"
            />
          </div>
        </>
      )}
      <div className="form-group">
        <label>Vehicle Type:</label>
        <select 
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
        >
          <option value="">Select Type</option>
          <option value="quadcopter">Quadcopter</option>
          <option value="hexacopter">Hexacopter</option>
          <option value="rover">Rover</option>
          <option value="plane">Plane</option>
          <option value="vtol">VTOL</option>
        </select>
      </div>
      <div className="button-group">
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleAdd}>Save</button>
      </div>
    </Modal>
  );
}

export default VehicleModal; 