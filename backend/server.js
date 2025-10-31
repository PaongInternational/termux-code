
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const socketio = require('socket.io');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const { Low, JSONFile } = require('lowdb');
const simpleGit = require('simple-git');
const fetch = require('node-fetch');
const crypto = require('crypto');
require('dotenv').config();
const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: '*' } });
app.use(bodyParser.json({ limit: '10mb' }));
const HOME = process.env.HOME || __dirname;
const DB_DIR = path.join(HOME, '.termux-code');
if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive:true });
const adapter = new JSONFile(path.join(DB_DIR, 'db.json'));
const db = new Low(adapter);
(async ()=>{ await db.read(); db.data = db.data || { users:[], plugins:[], settings:{} }; await db.write(); })();
const PROJECTS_DIR = path.join(HOME, 'projects');
if(!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive:true });

// --- File save/read/upload/run endpoints ---
app.post('/api/files/save', (req,res)=>{ try{ const { project='default', path: pth, content } = req.body || {}; if(!pth) return res.status(400).json({ error:'path required' }); const projDir = path.join(PROJECTS_DIR, project); if(!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive:true }); const full = path.join(projDir, pth); fs.mkdirSync(path.dirname(full), { recursive:true }); fs.writeFileSync(full, content || '', 'utf8'); return res.json({ ok:true }); }catch(e){ return res.status(500).json({ error: e.message }); } });
app.post('/api/files/read', (req,res)=>{ try{ const { project='default', path: pth } = req.body || {}; if(!pth) return res.status(400).json({ error:'path required' }); const full = path.join(PROJECTS_DIR, project, pth); if(!fs.existsSync(full)) return res.status(404).json({ error:'not found' }); return res.json({ ok:true, content: fs.readFileSync(full,'utf8') }); }catch(e){ return res.status(500).json({ error: e.message }); } });
app.post('/api/upload', upload.single('file'), (req,res)=>{ try{ if(!req.file) return res.status(400).json({ error:'no file' }); const project = req.body.project || 'default'; const destDir = path.join(PROJECTS_DIR, project); fs.mkdirSync(destDir, { recursive:true }); const tmp = req.file.path; const name = req.file.originalname; const dest = path.join(destDir, name); fs.renameSync(tmp, dest); return res.json({ ok:true, name }); }catch(e){ return res.status(500).json({ error: e.message }); } });
app.post('/api/run', (req,res)=>{ try{ const { project='default', path: pth } = req.body || {}; if(!pth) return res.status(400).json({ error:'path required' }); const full = path.join(PROJECTS_DIR, project, pth); if(!fs.existsSync(full)) return res.status(404).json({ error:'not found' }); const ext = path.extname(full).toLowerCase(); let cmd,args; if(ext === '.js'){ cmd='node'; args=[full]; } else if(ext === '.py'){ cmd='python3'; args=[full]; } else { return res.status(400).json({ error:'unsupported file type' }); } const runId = Date.now().toString(); const child = spawn(cmd, args, { cwd: path.dirname(full) }); child.stdout.on('data', d=> io.emit('run:output', { id: runId, type:'stdout', text: d.toString() })); child.stderr.on('data', d=> io.emit('run:output', { id: runId, type:'stderr', text: d.toString() })); child.on('close', code=> io.emit('run:exit', { id: runId, code })); return res.json({ ok:true, id: runId }); }catch(e){ return res.status(500).json({ error: e.message }); } });

// --- Plugin endpoints ---
app.post('/api/plugins/add', async (req,res)=>{ try{ const { name, repo } = req.body || {}; if(!name || !repo) return res.status(400).json({ error:'name and repo required' }); await db.read(); db.data.plugins.push({ name, repo, installed:false }); await db.write(); return res.json({ ok:true }); }catch(e){ return res.status(500).json({ error: e.message }); } });
app.get('/api/plugins/list', async (req,res)=>{ try{ await db.read(); return res.json({ ok:true, items: db.data.plugins || [] }); }catch(e){ return res.status(500).json({ error: e.message }); } });
app.post('/api/plugins/install', async (req,res)=>{ try{ const { name, repo } = req.body || {}; if(!name || !repo) return res.status(400).json({ error:'name and repo required' }); const dest = path.join(DB_DIR, 'plugins', name); await simpleGit().clone(repo, dest); await db.read(); db.data.plugins = db.data.plugins || []; const p = db.data.plugins.find(x=>x.name===name); if(p) p.installed = true; else db.data.plugins.push({name,repo,installed:true}); await db.write(); return res.json({ ok:true }); }catch(e){ return res.status(500).json({ error: e.message }); } });

// --- OAuth GitHub ---
const CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

app.get('/auth/github', async (req,res)=>{
  // generate state and save
  const state = crypto.randomBytes(12).toString('hex');
  await db.read();
  db.data.settings = db.data.settings || {};
  db.data.settings.oauth_state = state;
  await db.write();
  const redirect = 'https://github.com/login/oauth/authorize?client_id=' + CLIENT_ID + '&scope=repo&state=' + state;
  res.redirect(redirect);
});

app.get('/auth/github/callback', async (req,res)=>{
  const code = req.query.code;
  const state = req.query.state;
  await db.read();
  if(!code || state !== (db.data.settings && db.data.settings.oauth_state)){
    return res.status(400).send('Invalid OAuth state');
  }
  try{
    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept':'application/json', 'Content-Type':'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: code, state: state })
    });
    const tokenJson = await tokenResp.json();
    const access_token = tokenJson.access_token;
    if(!access_token) return res.status(500).send('No token from GitHub');
    await db.read();
    const userId = 'user_' + Date.now();
    db.data.users = db.data.users || [];
    db.data.users.push({ id: userId, provider: 'github', token: access_token, created: Date.now() });
    await db.write();
    // notify opener and close popup
    return res.send('<script>window.opener.postMessage({ ok:true, provider:\'github\', userId:\'' + userId + '\' }, \"*\"); window.close();</script>');
  }catch(err){
    console.error(err);
    return res.status(500).send('OAuth exchange failed');
  }
});

// --- Git clone & push endpoints ---
app.post('/api/github/clone', async (req,res)=>{
  const { repo, project, userId } = req.body || {};
  if(!repo || !project) return res.status(400).json({ error:'repo & project required' });
  await db.read();
  const user = (db.data.users||[]).find(u=>u.id===userId);
  if(!user || !user.token) return res.status(403).json({ error:'not authorized' });
  const authRepo = repo.replace('https://', 'https://' + user.token + '@');
  const dest = path.join(PROJECTS_DIR, project);
  try{
    await simpleGit().clone(authRepo, dest);
    return res.json({ ok:true });
  }catch(err){
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/github/push', async (req,res)=>{
  const { project, message='update', userId } = req.body || {};
  if(!project) return res.status(400).json({ error:'project required' });
  await db.read();
  const user = (db.data.users||[]).find(u=>u.id===userId);
  if(!user || !user.token) return res.status(403).json({ error:'not authorized' });
  const repoDir = path.join(PROJECTS_DIR, project);
  if(!fs.existsSync(repoDir)) return res.status(404).json({ error:'repo missing' });
  try{
    const g = simpleGit(repoDir);
    await g.add('./*');
    await g.commit(message);
    const remotes = await g.getRemotes(true);
    const origin = (remotes.find(r=>r.name==='origin') || {}).refs || {};
    const originUrl = origin.fetch || origin.push || null;
    if(!originUrl) return res.status(500).json({ error:'origin remote not found' });
    const authOrigin = originUrl.replace('https://', 'https://' + user.token + '@');
    await g.push(['-u', authOrigin, 'HEAD']);
    return res.json({ ok:true });
  }catch(e){
    return res.status(500).json({ error: e.message });
  }
});

// serve project files under /p/:project
app.use('/p/:project', (req,res,next)=>{
  const proj = req.params.project;
  const base = path.join(PROJECTS_DIR, proj);
  express.static(base)(req,res,next);
});

// serve frontend
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
if(fs.existsSync(DIST)) app.use(express.static(DIST));
app.get('*', (req,res)=>{ const index = path.join(DIST,'index.html'); if(fs.existsSync(index)) return res.sendFile(index); res.send('<h3>termux-code (frontend missing)</h3>'); });

const port = process.env.PORT || 4000;
server.listen(port, ()=> console.log('termux-code listening on', port));
