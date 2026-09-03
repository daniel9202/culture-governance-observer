#!/usr/bin/env python3
"""Serve review.html locally and commit each decision using the user's existing Git login."""
import csv,json,subprocess
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FILES={"civic_policy_calls":ROOT/"data/inbox/civic_policy_calls.csv","candidate_sources":ROOT/"data/inbox/candidate_sources.csv"}
def git(*args):
 r=subprocess.run(["git",*args],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=45)
 if r.returncode: raise RuntimeError(r.stdout.strip() or "Git 指令失敗")
 return r.stdout.strip()
def update(p):
 kind,status,url,note=p.get("kind"),p.get("status"),p.get("source_url"),p.get("note","")
 if kind not in FILES or status not in {"accepted","rejected"} or not isinstance(url,str) or not url or not isinstance(note,str): raise ValueError("查核資料格式不正確")
 git("pull","--ff-only");path=FILES[kind]
 with path.open(encoding="utf-8-sig",newline="") as f:
  reader=csv.DictReader(f);fields=reader.fieldnames or [];rows=list(reader)
 for field in ("review_status","review_note"):
  if field not in fields: fields.append(field)
 matches=[row for row in rows if row.get("source_url")==url]
 if not matches: raise ValueError("找不到這筆來源；請重新整理後再試")
 for row in matches: row["review_status"],row["review_note"]=status,note
 with path.open("w",encoding="utf-8",newline="") as f:
  writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(rows)
 rel=str(path.relative_to(ROOT));git("add","--",rel)
 if subprocess.run(["git","diff","--cached","--quiet","--",rel],cwd=ROOT).returncode==0:return "沒有資料變動"
 git("commit","--only","-m",f"data: review {kind} source","--",rel);git("push");return git("rev-parse","--short","HEAD")
class H(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_POST(self):
  if self.path!="/api/review":self.send_error(404);return
  try:
   size=int(self.headers.get("Content-Length","0"))
   if not 0<size<=200000:raise ValueError("請求內容大小不正確")
   self.reply(200,{"commit":update(json.loads(self.rfile.read(size)))})
  except (ValueError,json.JSONDecodeError) as error:self.reply(400,{"error":str(error)})
  except Exception as error:self.reply(500,{"error":str(error)})
 def reply(self,status,data):
  body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Content-Length",str(len(body)));self.end_headers();self.wfile.write(body)
if __name__=="__main__":
 print("人工查核本機服務：http://127.0.0.1:8765/review.html");ThreadingHTTPServer(("127.0.0.1",8765),H).serve_forever()
