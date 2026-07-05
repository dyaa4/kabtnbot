import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <h1 className="p-8 text-2xl font-bold">GameBot</h1>
  </React.StrictMode>,
);
