"""Tiny local drop box for the hero photo.

    python tools/drop.py

Opens http://localhost:5180 — paste (Ctrl+V) or drag an image onto the page
and it lands in assets/portrait.jpg. Localhost only, no dependencies.
"""

import http.server
import os
import socketserver
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "assets", "portrait.jpg")
PORT = 5180

PAGE = """<!doctype html><meta charset=utf-8>
<title>Drop the hero photo</title>
<style>
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:#0B0D11;color:#E9E5DC;
       font:16px/1.6 system-ui,sans-serif}
  #z{width:min(90vw,640px);aspect-ratio:16/9;border:2px dashed #444B55;border-radius:8px;
     display:grid;place-items:center;text-align:center;padding:2rem;transition:.2s}
  #z.hot{border-color:#F0A02A;background:rgba(240,160,42,.07)}
  b{color:#F0A02A;font-weight:600}
  small{color:#6E7580;display:block;margin-top:.75rem}
  img{max-width:100%;max-height:100%;border-radius:4px}
</style>
<div id=z>
  <div id=m><b>Ctrl&#8288;+&#8288;V</b> to paste your image<small>or drag the file onto this box</small></div>
</div>
<script>
const z=document.getElementById('z'), m=document.getElementById('m');
function send(file){
  m.textContent='Uploading...';
  const r=new FileReader();
  r.onload=()=>{
    fetch('/save',{method:'POST',body:r.result}).then(x=>x.text()).then(t=>{
      z.innerHTML='<img src="'+URL.createObjectURL(file)+'">';
      document.title='Saved';
      const p=document.createElement('div');
      p.innerHTML='<b>Saved.</b><small>'+t+' &mdash; you can close this tab and tell Claude.</small>';
      z.appendChild(p);
    }).catch(e=>{m.textContent='Failed: '+e});
  };
  r.readAsArrayBuffer(file);
}
addEventListener('paste',e=>{
  for(const it of e.clipboardData.items){
    if(it.type.startsWith('image/')){ send(it.getAsFile()); return; }
  }
  m.textContent='No image found in the clipboard — try copying it again.';
});
z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('hot')});
z.addEventListener('dragleave',()=>z.classList.remove('hot'));
z.addEventListener('drop',e=>{
  e.preventDefault();z.classList.remove('hot');
  const f=e.dataTransfer.files[0];
  if(f&&f.type.startsWith('image/')) send(f); else m.textContent='That was not an image file.';
});
</script>""".encode("utf-8")


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(PAGE)))
        self.end_headers()
        self.wfile.write(PAGE)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(n)
        os.makedirs(os.path.dirname(DEST), exist_ok=True)
        # Written as-is; the page only ever posts image bytes. The extension
        # stays .jpg because that is what the stylesheet and build look for,
        # and browsers sniff the real type anyway.
        with open(DEST, "wb") as f:
            f.write(data)
        msg = ("%s (%.0f KB)" % (DEST, len(data) / 1024)).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(msg)))
        self.end_headers()
        self.wfile.write(msg)
        print("saved", DEST, len(data), "bytes")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as srv:
        url = "http://localhost:%d" % PORT
        print("Drop box ready at " + url + "  (Ctrl+C to stop)")
        print("Paste or drag your image; it saves to " + DEST)
        try:
            webbrowser.open(url)
        except Exception:
            pass
        srv.serve_forever()
