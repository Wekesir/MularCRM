import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import ThemedToastContainer from './components/ThemedToastContainer.jsx';
import App from './App.jsx';
import './lib/chartSetup.js';
import './index.css';
import 'react-toastify/dist/ReactToastify.css';
import { bootstrapFromPersistedState } from './store/bootstrap';
import { persistor, store } from './store';

bootstrapFromPersistedState();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <App />
        <ThemedToastContainer />
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
