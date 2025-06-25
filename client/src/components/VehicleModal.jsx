import React, { useState, useEffect } from 'react';
import '../styles/VehicleModal.css';

function VehicleModal({ isOpen, onClose, onAdd, initialValue = null }) {
  const [formData, setFormData] = useState({
    name: '',
    connectionDetails: {
      vehicleType: 'drone',
      connectionType: 'tcp',
      ip: '127.0.0.1',
      port: '5760',
      serialPort: '',
      baudRate: '57600'
    },
    modelUrl: '',
    modelScale: 1.0
  });

  useEffect(() => {
    if (initialValue) {
      setFormData({
        ...initialValue,
        modelUrl: initialValue.modelUrl || '',
        modelScale: initialValue.modelScale || 1.0
      });
    }
  }, [initialValue]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData({
        ...formData,
        [parent]: {
          ...formData[parent],
          [child]: value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>{initialValue ? 'Edit Connection' : 'Add Connection'}</h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="name">Name:</label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            required
          />

          <label htmlFor="connectionDetails.vehicleType">Vehicle Type:</label>
          <select
            id="connectionDetails.vehicleType"
            name="connectionDetails.vehicleType"
            value={formData.connectionDetails.vehicleType}
            onChange={handleChange}
          >
            <option value="drone">Drone</option>
            <option value="rover">Rover</option>
            <option value="boat">Boat</option>
          </select>

          <label htmlFor="connectionDetails.connectionType">Connection Type:</label>
          <select
            id="connectionDetails.connectionType"
            name="connectionDetails.connectionType"
            value={formData.connectionDetails.connectionType}
            onChange={handleChange}
          >
            <option value="udp">UDP</option>
            <option value="tcp">TCP</option>
            <option value="serial">Serial</option>
          </select>

          {formData.connectionDetails.connectionType === 'serial' ? (
            <>
              <label htmlFor="connectionDetails.serialPort">Serial Port:</label>
              <input
                id="connectionDetails.serialPort"
                name="connectionDetails.serialPort"
                type="text"
                value={formData.connectionDetails.serialPort}
                onChange={handleChange}
                required={formData.connectionDetails.connectionType === 'serial'}
              />

              <label htmlFor="connectionDetails.baudRate">Baud Rate:</label>
              <input
                id="connectionDetails.baudRate"
                name="connectionDetails.baudRate"
                type="text"
                value={formData.connectionDetails.baudRate}
                onChange={handleChange}
                required={formData.connectionDetails.connectionType === 'serial'}
              />
            </>
          ) : (
            <>
              <label htmlFor="connectionDetails.ip">IP Address:</label>
              <input
                id="connectionDetails.ip"
                name="connectionDetails.ip"
                type="text"
                value={formData.connectionDetails.ip}
                onChange={handleChange}
                required={formData.connectionDetails.connectionType !== 'serial'}
              />

              <label htmlFor="connectionDetails.port">Port:</label>
              <input
                id="connectionDetails.port"
                name="connectionDetails.port"
                type="text"
                value={formData.connectionDetails.port}
                onChange={handleChange}
                required={formData.connectionDetails.connectionType !== 'serial'}
              />
            </>
          )}

          {/* 3D Model Fields */}
          <label htmlFor="modelUrl">3D Model URL (optional):</label>
          <input
            id="modelUrl"
            name="modelUrl"
            type="text"
            value={formData.modelUrl}
            onChange={handleChange}
            placeholder="https://example.com/model.glb"
          />

          <label htmlFor="modelScale">Model Scale:</label>
          <input
            id="modelScale"
            name="modelScale"
            type="number"
            value={formData.modelScale}
            onChange={(e) => setFormData({...formData, modelScale: parseFloat(e.target.value)})}
            min="0.1"
            max="10"
            step="0.1"
          />

          <div className="button-group">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit">{initialValue ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VehicleModal; 