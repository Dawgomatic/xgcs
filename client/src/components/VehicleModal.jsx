import React from 'react';

function VehicleModal({ isOpen, onClose, onAdd }) {
  if (!isOpen) return null;

  const handleAdd = () => {
    const newItem = prompt("Enter item name:");
    if (newItem) {
      onAdd(newItem);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <button onClick={handleAdd}>Add Item</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default VehicleModal; 