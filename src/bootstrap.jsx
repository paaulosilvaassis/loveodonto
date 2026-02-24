// #region agent log
fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ea6ead'},body:JSON.stringify({sessionId:'ea6ead',location:'bootstrap.jsx:1',message:'bootstrap.jsx executing',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
// #endregion
import './main.jsx';
