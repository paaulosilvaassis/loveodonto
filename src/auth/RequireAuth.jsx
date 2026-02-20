import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export const RequireAuth = ({ children }) => {
  const { user } = useAuth();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'RequireAuth.jsx:render',message:'RequireAuth',data:{hasUser:!!user,path:typeof window!=='undefined'?window.location.pathname:''},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/auth/RequireAuth.jsx:8',message:'auth:gate',data:{hasUser:!!user,path:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H10'})}).catch(()=>{});
    // #endregion
  }, [user]);
  if (!user) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'RequireAuth.jsx:redirect',message:'RequireAuth redirecting to login',data:{path:typeof window!=='undefined'?window.location.pathname:''},timestamp:Date.now(),hypothesisId:'H3',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    return <Navigate to="/login" replace />;
  }
  return children;
};
