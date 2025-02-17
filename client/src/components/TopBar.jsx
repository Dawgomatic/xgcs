import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/TopBar.css';

function TopBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <div className="topbar">
      <div className="burger-menu" onClick={toggleMenu}>
        <div className={`burger-bar ${isMenuOpen ? 'open' : ''}`}></div>
        <div className={`burger-bar ${isMenuOpen ? 'open' : ''}`}></div>
        <div className={`burger-bar ${isMenuOpen ? 'open' : ''}`}></div>
      </div>
      
      <div className={`menu-items ${isMenuOpen ? 'open' : ''}`}>
        <Link to="/" onClick={toggleMenu}>Home</Link>
        <Link to="/settings" onClick={toggleMenu}>Settings</Link>
      </div>
    </div>
  );
}

export default TopBar; 