import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { enforceSecureDeploymentGuard } from './utils/securityGuard';

enforceSecureDeploymentGuard();

createRoot(document.getElementById('root')!).render(<App />);
