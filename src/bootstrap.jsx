// #region agent log
fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'bootstrap.jsx:1',message:'bootstrap start',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
// #endregion
import './main.jsx';
