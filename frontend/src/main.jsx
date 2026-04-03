import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App.jsx';

// Reset CSS minimal
const style = document.createElement('style');
style.textContent = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F5F3EF; min-height: 100vh; }
input, select, textarea, button { font-family: inherit; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #D0CEC8; border-radius: 3px; }
.fade-in { animation: fadeIn .2s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      richColors
      expand={false}
      duration={4000}
      toastOptions={{ style: { fontFamily: 'inherit', fontSize: 13 } }}
    />
  </React.StrictMode>
);
