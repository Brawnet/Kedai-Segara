import { render } from 'preact';
import './styles.css';
import { AppProvider } from './lib/app';
import { App } from './App';

render(
  <AppProvider>
    <App />
  </AppProvider>,
  document.getElementById('app')!,
);
