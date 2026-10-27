"""Anthropometry measurements for The Mile V2.
Values remain in draft until explicitly published by an administrator.
"""
import base64
import io
import json
import re
import secrets
import time
from pypdf import PdfReader

SUMMARY = [
 ("sum_8","Soma de 8 pregas","mm"),
 ("weight","Peso corporal","kg"),
 ("body_fat","Gordura corporal","%"),
 ("bmi","IMC",""),
 ("muscle_index","Índice de massa muscular",""),
 ("arm_muscle","Músculo do braço","cm"),
 ("thigh_muscle","Músculo da coxa","cm"),
 ("calf_muscle","Músculo do gémeo","cm"),
 ("sum_perimeters","Soma de perímetros","cm"),
]
SKINFOLDS = [
 ("back","Costas","mm"),("triceps","Trícep","mm"),
 ("biceps","Bícep","mm"),("suprailiac","Suprailíaca","mm"),
 ("supraspinal","Supraespinal","mm"),("abdominal_skin","Abdominal","mm"),
 ("thigh_skin","Coxa","mm"),("calf_skin","Gémeo","mm"),
]
PERIMETERS = [
 ("arm_right_relaxed","Braço direito relaxado","cm"),("arm_right_flexed","Braço direito contraído","cm"),
 ("chest","Peitoral","cm"),("waist","Cintura","cm"),
 ("abdominal_perimeter","Abdominal","cm"),("glute","Glúteo","cm"),
 ("thigh_right","Coxa direita","cm"),("thigh_left","Coxa esquerda","cm"),
 ("calf_right","Gémeo direito","cm"),("calf_left","Gémeo esquerdo","cm"),
]
GENERAL=[("height","Altura","m")]
FIELDS = {"geral":GENERAL,"resumo":SUMMARY,"pregas":SKINFOLDS,"perimetros":PERIMETERS}
KEYS={key for group in FIELDS.values() for key,_,_ in group}
AVERAGES=[("avg_skinfolds","Média da soma de pregas","mm"),("avg_weight","Peso médio","kg"),("avg_body_fat","Gordura corporal média","%")]
AVERAGE_KEYS={k for k,_,_ in AVERAGES}

def initialize(c):
 c.execute("""CREATE TABLE IF NOT EXISTS v2_body_assessments (
  id TEXT PRIMARY KEY,
  athlete_id TEXT NOT NULL,
  assessed_on TEXT NOT NULL,
  measurements TEXT NOT NULL,
  averages TEXT NOT NULL DEFAULT '{}',
  formula_note TEXT NOT NULL DEFAULT '',
  pdf_data """ + ("BYTEA" if __import__("os").environ.get("DATABASE_URL") else "BLOB") + """,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at BIGINT NOT NULL,
  UNIQUE(athlete_id,assessed_on)
 )""")

def normalize(body):
 if not isinstance(body,dict):raise ValueError("invalid_measurements")
 result={}
 for k,v in body.items():
  if k not in KEYS:raise ValueError("unknown_measurement")
  if v is None or str(v).strip()=="":continue
  if isinstance(v,bool):raise ValueError("invalid_value")
  try: n=float(str(v).strip().replace(",","."))
  except (ValueError,TypeError):raise ValueError("invalid_value")
  if not (-10000<n<10000):raise ValueError("invalid_value")
  result[k]=round(n,3)
 if "sum_8" not in result and all(k in result for k in ("back","triceps","biceps","suprailiac","supraspinal","abdominal_skin","thigh_skin","calf_skin")):
  result["sum_8"]=round(sum(result[k] for k in ("back","triceps","biceps","suprailiac","supraspinal","abdominal_skin","thigh_skin","calf_skin")),3)
 if "sum_perimeters" not in result and all(k in result for k in ("arm_muscle","thigh_muscle","calf_muscle")):
  result["sum_perimeters"]=round(result["arm_muscle"]+result["thigh_muscle"]+result["calf_muscle"],3)
 if "bmi" not in result and result.get("height",0)>0 and "weight" in result:
  result["bmi"]=round(result["weight"]/(result["height"]**2),3)
 return result

def normalize_averages(body):
 if not isinstance(body,dict):raise ValueError("invalid_averages")
 out={}
 for k,v in body.items():
  if k not in AVERAGE_KEYS:raise ValueError("unknown_average")
  if v is None or str(v).strip()=="":continue
  try:n=float(str(v).strip().replace(",","."))
  except (ValueError,TypeError):raise ValueError("invalid_average")
  if not (0<=n<10000):raise ValueError("invalid_average")
  out[k]=round(n,3)
 return out

def parse_pdf(encoded):
 if not isinstance(encoded,str) or len(encoded)>30000000:raise ValueError("pdf_too_large")
 try:data=base64.b64decode(encoded,validate=True)
 except Exception:raise ValueError("invalid_pdf")
 if len(data)>21000000 or not data.startswith(b"%PDF"):raise ValueError("invalid_pdf")
 try:
  reader=PdfReader(io.BytesIO(data))
  if len(reader.pages)>50:raise ValueError("pdf_too_long")
  pages=[(page.extract_text() or "") for page in reader.pages]
 except Exception:raise ValueError("invalid_pdf")
 if not pages:raise ValueError("invalid_pdf")
 # Only unambiguous single-value patterns are candidates. Remaining fields
 # are intentionally blank for clinician review rather than guessed.
 text="\n".join(pages[:3])
 summary=pages[1] if len(pages)>1 else text
 aliases={
  "sum_8":("Soma de 8 pregas","Sum of 8 skinfolds"),
  "weight":("Peso corporal (kg)","Body weight (kg)"),
  "body_fat":("Gordura corporal","Bodyfat"),
  "bmi":("IMC","BMI"),
  "muscle_index":("Índice de massa muscular","Muscle mass index"),
  "arm_muscle":("Músculo do braço","Arm muscle mass"),
  "thigh_muscle":("Músculo da coxa","Thigh muscle mass"),
  "calf_muscle":("Músculo do gémeo","Calf muscle mass"),
  "sum_perimeters":("Soma de perímetros","Sum of perimeters"),
 }
 decimal=r"([0-9]{1,3}\s*[,.]\s*[0-9]{1,2})"
 def number(fragment):
  try:return float(re.sub(r"\s+","",fragment).replace(",","."))
  except (TypeError,ValueError):return None
 candidates={}
 for key,(pt,en) in aliases.items():
  pattern=re.escape(pt)+r"\*?\s*"+re.escape(en)+r"\*?\s*"+decimal
  match=re.search(pattern,summary,re.I)
  if match:
   val=number(match.group(1))
   if val is not None:candidates[key]=val
 # The PDF's latest-measurement overview puts some numbers next to the
 # translated names and others on the facing column. Match only the
 # characteristic annotated layout; leave unmatched fields for review.
 lines={
  "biceps":r"Bicep\s+Biceps\s*"+decimal,
  "back":decimal+r"\s*Costas\s+Back",
  "suprailiac":r"Suprailíaca\s+Suprailiac\s*"+decimal,
  "triceps":decimal+r"\s*Trícep\s+Triceps",
  "supraspinal":r"Supraespinal\s+Supraspinal\s*"+decimal,
  "arm_right_relaxed":decimal+r"\s*Braço dir\s+Right arm",
  "abdominal_skin":r"Abdominal\s+Abdominal\s*"+decimal,
  "thigh_right":decimal+r"\s*Coxa dir\s+Right thigh",
  "thigh_skin":r"Coxa\s+Thigh\s*"+decimal,
  "calf_right":decimal+r"\s*Gémeo dir\s+Right calf",
  "calf_skin":r"Gémeo\s+Calf\s*"+decimal,
 }
 for key,pattern in lines.items():
  match=re.search(pattern,summary,re.I)
  if match:
   val=number(match.group(1))
   if val is not None:candidates[key]=val
 date_match=re.search(r"\b(\d{2})/(\d{2})/(20\d{2})\b",summary)
 assessed_on=f"{date_match.group(3)}-{date_match.group(2)}-{date_match.group(1)}" if date_match else ""
 return {"measurements":candidates,"averages":{},"assessed_on":assessed_on,"formula_note":"* Média de 4" if "Média de 4" in text else "",
         "review_required":True,"pdf_bytes":data,
         "note":"Confirma todos os campos; gráficos históricos no PDF podem não ter valores numéricos extraíveis."}

def rows(c,athlete_id,public=False):
 sql="SELECT id,assessed_on,measurements,averages,formula_note,status,created_at FROM v2_body_assessments WHERE athlete_id=?"
 if public:sql+=" AND status='published'"
 sql+=" ORDER BY assessed_on ASC"
 data=c.execute(sql,(athlete_id,)).fetchall()
 return [{**dict(r),"measurements":json.loads(r["measurements"]),"averages":json.loads(r["averages"])} for r in data]

def save(c,athlete_id,payload,user_id):
 from datetime import date
 assessed_on=str(payload.get("assessed_on",""))
 try:date.fromisoformat(assessed_on)
 except ValueError:raise ValueError("invalid_date")
 values=normalize(payload.get("measurements",{}))
 averages=normalize_averages(payload.get("averages",{}))
 formula=str(payload.get("formula_note","")).strip()[:250]
 publication=payload.get("publish",False)
 if not isinstance(publication,bool):raise ValueError("invalid_publish")
 # No auto publication on upload. The explicit save action may publish.
 pdf_data=None
 encoded=payload.get("pdf_base64")
 if encoded:
  pdf_data=parse_pdf(encoded)["pdf_bytes"]
 existing=c.execute("SELECT id FROM v2_body_assessments WHERE athlete_id=? AND assessed_on=?",(athlete_id,assessed_on)).fetchone()
 record_id=existing["id"] if existing else secrets.token_hex(16)
 if existing:
  # Historical imports may contribute only a subset of fields for a date.
  # Merge those readings without deleting measurements already confirmed.
  previous=c.execute("SELECT measurements,averages,formula_note,status FROM v2_body_assessments WHERE id=?",(record_id,)).fetchone()
  combined=json.loads(previous["measurements"]);combined.update(values)
  combined_averages=json.loads(previous["averages"]);combined_averages.update(averages)
  keep_status="published" if publication or previous["status"]=="published" else "draft"
  c.execute("""UPDATE v2_body_assessments SET measurements=?,averages=?,formula_note=?,status=? WHERE id=? AND athlete_id=?""",
           (json.dumps(combined),json.dumps(combined_averages),formula or previous["formula_note"],keep_status,record_id,athlete_id))
 else:
  c.execute("""INSERT INTO v2_body_assessments(id,athlete_id,assessed_on,measurements,averages,formula_note,pdf_data,status,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)""",(record_id,athlete_id,assessed_on,json.dumps(values),json.dumps(averages),formula,pdf_data,"published" if publication else "draft",int(time.time())))
 c.commit()
 return record_id
