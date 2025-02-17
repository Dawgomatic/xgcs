import React from 'react';
import '../styles/TemplatePage.css'; // Assuming you have a CSS file for styling

function TemplatePage({ title, children }) {
  return (
    <div className="template-page">
      <header className="template-header">
        <h1>{title}</h1>
      </header>
      <main className="template-content">
        {children}
      </main>
      <footer className="template-footer">
        <p>Footer content here</p>
      </footer>
    </div>
  );
}

export default TemplatePage;
