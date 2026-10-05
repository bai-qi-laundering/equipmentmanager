import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';

const keys=(process.env.API_ACCESS_KEYS||'').split(',').map(x=>x.trim())
  .filter(x=>/^[a-f0-9]{64}$/i.test(x))
  .map(x=>createHash('sha256').update(x.toLowerCase()).digest());
if(!keys.length)throw Error('API_ACCESS_KEYS is required');
const allowedOrigin='https://bai-qi-laundering.github.io';
const maxBody=2*1024*1024;

http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin===allowedOrigin){res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Methods','GET,PUT,POST,OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(origin&&origin!==allowedOrigin){res.writeHead(403);return res.end();}
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 const url=new URL(req.url,'http://gateway');
 if(!url.pathname.startsWith('/api/')||!['GET','PUT','POST'].includes(req.method)){
  res.writeHead(404);return res.end();
 }
 if(url.pathname!=='/api/health'){
  const match=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization||'');
  if(!match){res.writeHead(401);return res.end(JSON.stringify({error:'access_required'}));}
  const digest=createHash('sha256').update(match[1].toLowerCase()).digest();
  if(!keys.some(key=>timingSafeEqual(key,digest))){res.writeHead(401);return res.end(JSON.stringify({error:'access_required'}));}
 }
 if(Number(req.headers['content-length']||0)>maxBody){res.writeHead(413);return res.end();}
 try{
  const chunks=[];let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>maxBody){res.writeHead(413);return res.end();}chunks.push(chunk);}
  const upstream=http.request({hostname:process.env.API_HOST||'api',port:Number(process.env.API_PORT||3000),path:url.pathname+url.search,method:req.method,headers:{'Content-Type':req.headers['content-type']||'application/json'},timeout:30000},response=>{
   res.setHeader('Content-Type',response.headers['content-type']||'application/octet-stream');
   res.setHeader('Cache-Control',response.headers['cache-control']||'no-store');
   res.writeHead(response.statusCode||502);response.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy(Error('upstream_timeout')));
  upstream.on('error',()=>{if(!res.headersSent){res.writeHead(502);res.end(JSON.stringify({error:'api_unavailable'}));}else res.destroy();});
  upstream.end(Buffer.concat(chunks));
 }catch{if(!res.headersSent){res.writeHead(400);res.end();}}
}).listen(3001,'0.0.0.0');
