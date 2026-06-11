import { useAuth } from '../../auth/useAuth.js';

export function useConvenioTenant() {
  const { user } = useAuth();
  return user?.tenantId || user?.tenant_id || '';
}

export function useConvenioToast() {
  return (setToast) => (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };
}
