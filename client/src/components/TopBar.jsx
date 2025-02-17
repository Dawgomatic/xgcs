import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/TopBar.css';

function TopBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLive, setIsLive] = useState(true); // State for Live/Replay toggle

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleMode = () => {
    setIsLive(!isLive);
  };

  return (
    <div className="topbar">
      <div className="burger-menu" onClick={toggleMenu}>
        <div className={`burger-bar ${isMenuOpen ? 'open' : ''}`}></div>
        <div className={`burger-bar ${isMenuOpen ? 'open' : ''}`}></div>
        <div className={`burger-bar ${isMenuOpen ? 'open' : ''}`}></div>
      </div>
      
      <div className={`menu-items ${isMenuOpen ? 'open' : ''}`}>
        <button onClick={toggleMode} className="toggle-button">
          {isLive ? 'Live' : 'Replay'}
        </button>
        <Link to="/" onClick={toggleMenu}>Home</Link>
        <Link to="/vehicle-connections" onClick={toggleMenu}>Vehicle Connections</Link>
        <Link to="/mission-planning" onClick={toggleMenu}>Mission Planning</Link>
        <Link to="/settings" onClick={toggleMenu}>Settings</Link>
        <Link to="/template" onClick={toggleMenu}>Template Page</Link>
      </div>
    </div>
  );
}

export default TopBar; 