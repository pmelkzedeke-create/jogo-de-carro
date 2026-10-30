import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource-variable/inter';
import './styles/global.css';
import { App } from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
