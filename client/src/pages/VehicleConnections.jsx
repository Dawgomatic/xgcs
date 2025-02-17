import React, { useState, useEffect } from 'react';
import '../styles/VehicleConnections.css';
import VehicleModal from '../components/VehicleModal';

function VehicleConnections() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);

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

  const handleAddClick = () => {
    setIsModalOpen(true);
  };

  const handleAddItem = (item) => {
    setItems([...items, item]);
    setIsModalOpen(false);
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

  return (
    <div className="vehicle-connections">
      <div className="button-container">
        <button onClick={handleAddClick}>Add</button>
        <button onClick={handleDeleteItem}>Remove</button>
        <button>Edit</button>
        <button>Connect</button>
        <button>Disconnect</button>
      </div>

      <div className="items-container">
        {items.map((item, index) => (
          <div
            key={index}
            className={`item-card ${selectedItem === index ? 'selected' : ''}`}
            onClick={() => handleSelectItem(index)}
          >
            {item}
          </div>
        ))}
      </div>

      <VehicleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAdd={handleAddItem} />
    </div>
  );
}

export default VehicleConnections;
