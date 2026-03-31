import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/useTenant.js';

export default function RequireFeatureFlag({ flagKey, children }) {
  const { hasFeature, loading } = useTenant();
  if (!flagKey) return children;
  if (loading) return null;
  if (!hasFeature(flagKey)) {
    return <Navigate to="/gestao/dashboard" replace />;
  }
  return children;
}
