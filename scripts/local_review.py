#!/usr/bin/env python3
"""Serve review.html locally and commit each decision using the user's existing Git login."""
import csv,hashlib,hmac,json,re,secrets,subprocess,sys,urllib.request
from datetime import date
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
FILES={"civic_policy_calls":ROOT/"data/inbox/civic_policy_calls.csv","candidate_sources":ROOT/"data/inbox/candidate_sources.csv"}
PUBLIC={"civic_policy_calls":ROOT/"data/input/civic_policy_calls.csv","candidate_sources":ROOT/"data/input/candidates.csv"}
OUTPUT={"civic_policy_calls":ROOT/"data/civic_policy_calls.json","candidate_sources":ROOT/"data/candidates.json"}
PORT=8765
TOKEN=secrets.token_urlsafe(32)
ALLOWED_ORIGINS={f"http://127.0.0.1:{PORT}",f"http://localhost:{PORT}"}
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
def read_csv(path):
 with path.open(encoding="utf-8-sig",newline="") as f:
  reader=csv.DictReader(f);return reader.fieldnames or [],list(reader)
def write_csv(path,fields,rows):
 with path.open("w",encoding="utf-8",newline="") as f:
  writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(rows)
def clean_fields(value,required,optional=()):
 if not isinstance(value,dict):raise ValueError("上架欄位格式不正確")
 result={key:str(value.get(key,"")).strip() for key in required|set(optional)|{"topics"}}
 missing=[key for key in required if not result[key]]
 if missing:raise ValueError("請補齊欄位："+"、".join(sorted(missing)))
 if any(len(item)>3000 for item in result.values()):raise ValueError("欄位內容過長")
 return result
def valid_url(value,label):
 parsed=urlparse(value)
 if parsed.scheme not in {"http","https"} or not parsed.netloc:raise ValueError(f"{label}不是有效網址")
 return value
def related_urls(value):
 urls=[]
 for item in str(value or "").replace("\r","\n").replace("|","\n").split("\n"):
  item=item.strip()
  if item and item not in urls:urls.append(valid_url(item,"輔助來源"))
 return urls
class ArticleParser(HTMLParser):
 def __init__(self):
  super().__init__();self.meta={};self.title="";self.text=[];self._title=False;self._ignore=0
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if tag in {"script","style","noscript"}:self._ignore+=1
  if tag=="title":self._title=True
  if tag=="meta":
   key=(attrs.get("property") or attrs.get("name") or "").lower();value=attrs.get("content","").strip()
   if key and value:self.meta.setdefault(key,value)
 def handle_endtag(self,tag):
  if tag in {"script","style","noscript"} and self._ignore:self._ignore-=1
  if tag=="title":self._title=False
 def handle_data(self,data):
  value=" ".join(data.split())
  if not value or self._ignore:return
  if self._title:self.title+=value
  elif len(value)>20:self.text.append(value)
def article_prefill(kind,url):
 if kind not in FILES:raise ValueError("資料類型不正確")
 _,inbox_rows=read_csv(FILES[kind]);matches=[row for row in inbox_rows if row.get("source_url")==url]
 if len(matches)!=1:raise ValueError("找不到唯一的待查核來源")
 source=matches[0]
 valid_url(url,"原始來源")
 request=urllib.request.Request(url,headers={"User-Agent":"culture-governance-observer-review/1.0"})
 with urllib.request.urlopen(request,timeout=20) as response:
  raw=response.read(1_500_000);charset=response.headers.get_content_charset() or "utf-8"
 parser=ArticleParser();parser.feed(raw.decode(charset,errors="replace"))
 title=parser.meta.get("og:title") or parser.meta.get("twitter:title") or parser.title or source.get("source_title","")
 description=parser.meta.get("og:description") or parser.meta.get("description","")
 body=" ".join(dict.fromkeys(parser.text));excerpt=(description or body or source.get("source_title","")).strip()
 topic_rules=[("文化資產","文資|古蹟|歷史建築|無形文化"),("藝文活動","藝文|藝術|展演|表演|音樂"),("文化場館","場館|博物館|美術館|圖書館"),("地方文史","地方文化|文史|記憶"),("文化預算","預算|經費"),("文化教育","文化教育|母語|客語|族語"),("文化觀光","文化觀光|觀光")]
 topics="|".join(label for label,pattern in topic_rules if re.search(pattern,f"{title} {excerpt}"))
 if kind=="candidate_sources":
  config=json.loads(CONFIG.read_text(encoding="utf-8"));candidates=config["collections"]["candidate_policy"].get("candidates_by_city",{}).get(source.get("city",""),[])
  candidate=next((name for name in candidates if name in f"{title} {excerpt} {body}"),"")
  return {"candidate":candidate,"topics":topics,"summary":excerpt[:500],"policy_argument":excerpt[:1200],"concrete_proposals":excerpt[:1200],"published_date":source.get("published_date",""),"source_title":title[:500],"source_url":url}
 return {"topics":topics,"summary":excerpt[:500],"requested_action":excerpt[:1200]}
def publish(p):
 kind,url=p.get("kind"),p.get("source_url")
 if kind not in FILES or not isinstance(url,str) or not url:raise ValueError("上架資料格式不正確")
 git("pull","--ff-only")
 inbox_fields,inbox_rows=read_csv(FILES[kind]);matches=[row for row in inbox_rows if row.get("source_url")==url]
 if len(matches)!=1:raise ValueError("找不到唯一的待上架來源；請重新整理")
 source=matches[0]
 if source.get("review_status")!="accepted":raise ValueError("必須先按 Yes 接受這筆來源")
 if kind=="candidate_sources":
  required={"candidate","party","office","summary","policy_argument","concrete_proposals","published_date","source_title","source_url","source_type"}
  values=clean_fields(p.get("fields"),required,{"related_statements","related_sources","policy_argument_sources","concrete_proposal_sources","related_statement_sources"})
  try:date.fromisoformat(values["published_date"])
  except ValueError as error:raise ValueError("主要來源日期格式不正確") from error
  if values["source_type"] not in {"新聞報導","候選人原文","政黨官方資料","政府公開資料"}:raise ValueError("主要來源類型不正確")
  primary_url=valid_url(values["source_url"],"主要來源")
  auxiliary=related_urls(values["related_sources"])
  if primary_url!=url and url not in auxiliary:auxiliary.append(url)
  if primary_url in auxiliary:auxiliary.remove(primary_url)
  record={"id":"candidate-auto-"+hashlib.sha256(primary_url.encode()).hexdigest()[:12],"city":source["city"],"office":values["office"],"candidate":values["candidate"],"party":values["party"],"topics":values["topics"],"summary":values["summary"],"policy_argument":values["policy_argument"],"concrete_proposals":values["concrete_proposals"],"related_statements":values["related_statements"],"published_date":values["published_date"],"source_title":values["source_title"],"source_url":primary_url,"source_type":values["source_type"],"last_verified":date.today().isoformat(),"correction_log":"","related_sources":"|".join(auxiliary),"policy_argument_sources":values["policy_argument_sources"],"concrete_proposal_sources":values["concrete_proposal_sources"],"related_statement_sources":values["related_statement_sources"]}
 else:
  values=clean_fields(p.get("fields"),{"proposer","proposer_type","summary","requested_action"})
  record={"id":"civic-auto-"+hashlib.sha256(url.encode()).hexdigest()[:12],"city":source["city"],"proposer":values["proposer"],"proposer_type":values["proposer_type"],"topics":values["topics"],"summary":values["summary"],"requested_action":values["requested_action"],"published_date":source["published_date"],"source_title":source["source_title"],"source_url":url,"source_type":"新聞報導","last_verified":date.today().isoformat(),"correction_log":""}
 public_fields,public_rows=read_csv(PUBLIC[kind])
 record_urls={record["source_url"],*related_urls(record.get("related_sources",""))}
 if any(row.get("id")==record["id"] or record_urls.intersection({row.get("source_url",""),*related_urls(row.get("related_sources",""))}) for row in public_rows):raise ValueError("這筆來源已在正式資料中")
 unknown=set(record)-set(public_fields)
 if unknown:raise ValueError("正式資料缺少欄位："+"、".join(sorted(unknown)))
 public_rows.append(record);source["review_status"]="published"
 snapshots={path:path.read_bytes() for path in (FILES[kind],PUBLIC[kind],OUTPUT[kind])}
 try:
  write_csv(PUBLIC[kind],public_fields,public_rows);write_csv(FILES[kind],inbox_fields,inbox_rows)
  subprocess.run([sys.executable,"scripts/build_data.py"],cwd=ROOT,text=True,check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
 except Exception:
  for path,content in snapshots.items():path.write_bytes(content)
  raise
 paths=[str(path.relative_to(ROOT)) for path in (FILES[kind],PUBLIC[kind],OUTPUT[kind])]
 git("add","--",*paths);git("commit","--only","-m",f"data: publish reviewed {kind} source","--",*paths);git("push")
 return git("rev-parse","--short","HEAD")
class H(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_GET(self):
  if self.path=="/api/session":
   self.reply(200,{"token":TOKEN},extra_headers={"Cache-Control":"no-store"});return
  super().do_GET()
 def do_POST(self):
  if self.path not in {"/api/review","/api/publish","/api/prefill"}:self.send_error(404);return
  try:
   if self.headers.get("Origin") not in ALLOWED_ORIGINS:raise PermissionError("不允許的請求來源")
   if self.headers.get_content_type()!="application/json":raise ValueError("僅接受 JSON 請求")
   if not hmac.compare_digest(self.headers.get("X-Review-Token",""),TOKEN):raise PermissionError("查核工作階段已失效")
   size=int(self.headers.get("Content-Length","0"))
   if not 0<size<=200000:raise ValueError("請求內容大小不正確")
   payload=json.loads(self.rfile.read(size));result=publish(payload) if self.path=="/api/publish" else article_prefill(payload.get("kind"),payload.get("source_url")) if self.path=="/api/prefill" else update(payload)
   self.reply(200,{"commit":result})
  except PermissionError as error:self.reply(403,{"error":str(error)})
  except (ValueError,json.JSONDecodeError) as error:self.reply(400,{"error":str(error)})
  except Exception as error:self.reply(500,{"error":str(error)})
 def reply(self,status,data,extra_headers=None):
  body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Content-Length",str(len(body)))
  for name,value in (extra_headers or {}).items():self.send_header(name,value)
  self.end_headers();self.wfile.write(body)
if __name__=="__main__":
 print(f"人工查核本機服務：http://127.0.0.1:{PORT}/review.html");ThreadingHTTPServer(("127.0.0.1",PORT),H).serve_forever()
