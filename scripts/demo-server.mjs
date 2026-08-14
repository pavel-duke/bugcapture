import { createServer } from 'node:http';

const port = 4177;
const testSecret = 'BUGCAPTURE_TEST_SECRET_123456789';

const page = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BugCapture Demo</title>
  <style>
    body{font:16px system-ui;margin:40px;max-width:760px;color:#232644;background:#f7f8fc}
    h1{font-size:30px}button{margin:6px;padding:12px 18px;border:0;border-radius:10px;background:#363b72;color:white;cursor:pointer}
    pre{background:white;padding:16px;border-radius:12px;min-height:120px;white-space:pre-wrap}
  </style>
</head>
<body>
  <h1>BugCapture Demo</h1>
  <p>Тестовая страница для ручной проверки Network, Console и sanitizer.</p>
  <button data-action="ok">GET 200</button>
  <button data-action="missing">GET 404</button>
  <button data-action="failure">POST 500 + token</button>
  <button data-action="console">console.error</button>
  <pre id="output">Готово к проверке.</pre>
  <script>
    const output=document.querySelector('#output');
    async function run(path, options){
      try{const response=await fetch(path,options); const method=(options?.method||'GET').padEnd(4); output.textContent += '\\n'+method+' '+path+' → '+response.status;}
      catch(error){output.textContent+='\\nОшибка: '+error.message;}
    }
    document.addEventListener('click',(event)=>{
      const action=event.target.dataset.action;
      if(action==='ok') void run('/api/ok');
      if(action==='missing') void run('/api/missing');
      if(action==='failure') void run('/api/failure?token=${testSecret}',{method:'POST',headers:{Authorization:'Bearer ${testSecret}','Content-Type':'application/json'},body:JSON.stringify({demo:true})});
      if(action==='console') console.error('Demo failure with Bearer ${testSecret}');
    });
  </script>
</body>
</html>`;

const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Set-Cookie', 'bugcapture_demo=very-secret-cookie; HttpOnly; SameSite=Lax');
    response.end(page);
    return;
  }
  if (request.url === '/api/ok') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.url?.startsWith('/api/failure')) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Demo-Token', testSecret);
    response.end(JSON.stringify({ error: 'planned demo failure' }));
    return;
  }
  response.statusCode = 404;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`BugCapture demo: http://127.0.0.1:${port}`);
});
