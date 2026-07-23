import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from '../features/auth/AuthProvider';
import { useDocumentDirection } from '../hooks/useDocumentDirection';

export function App() {
  useDocumentDirection();
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
