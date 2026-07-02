import { ToastContainer } from 'react-toastify';
import { useTheme } from '../context/ThemeContext';

function ThemedToastContainer() {
  const { colorMode } = useTheme();

  return (
    <ToastContainer
      position="top-right"
      theme={colorMode}
      autoClose={4000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      draggable
      pauseOnHover
    />
  );
}

export default ThemedToastContainer;
