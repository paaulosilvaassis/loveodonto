import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export const RequireAuth = ({ children }) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RequireAuth.jsx:render',message:'RequireAuth render',data:{},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
  // #endregion
  const { user } = useAuth();
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/auth/RequireAuth.jsx:8',message:'auth:gate',data:{hasUser:!!user,path:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H10'})}).catch(()=>{});
    // #endregion
  }, [user]);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};
