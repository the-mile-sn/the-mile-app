"""Read-only nutritional comparison matching the player option averaging rules."""
import math

KEYS=("kcal","protein_g","carbs_g","fat_g")

def average(options):
    if not options:
        return None
    total={key:0.0 for key in KEYS}
    for option in options:
        values=option.get("totals")
        if not isinstance(values,dict):
            return None
        for key in KEYS:
            try:
                value=float(str(values.get(key,"")).replace(",","."))
            except (ValueError,TypeError):
                return None
            if not math.isfinite(value):
                return None
            total[key]+=value/len(options)
    return total

def totals(colors,plans,peri,day,meals):
    total={key:0.0 for key in KEYS}
    selected=0
    missing=[]
    for meal in meals:
        color=colors.get(meal)
        if not color or color=="none":
            continue
        avg=average(plans.get(color,{}).get(meal,[]))
        if avg is None:
            missing.append(meal)
            continue
        selected+=1
        for key in KEYS:
            total[key]+=avg[key]
    for item in peri:
        if item.get("event_date")!=day:
            continue
        avg=average(item.get("options") or [])
        if avg is None:
            missing.append("peri:"+str(item.get("event_id",""))+":"+str(item.get("phase","")))
            continue
        selected+=1
        for key in KEYS:
            total[key]+=avg[key]
    return {"totals":total if selected and not missing else None,
            "complete":not missing and selected>0,
            "missing":missing,
            "components":selected}
