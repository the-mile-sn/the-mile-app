"""Pure nutrition aggregation using already resolved effective meal colors.

Not wired to player APIs. Missing nutritional options produce partial output
rather than invented zero values. Peri-training entries are additive.
"""
from prescription_effective_v2 import MEALS
import math

KEYS=("kcal","protein_g","carbs_g","fat_g")

def average_options(options):
    if not options:
        return None
    values={key:0.0 for key in KEYS}
    for option in options:
        totals=option.get("totals")
        if not isinstance(totals,dict):
            return None
        for key in KEYS:
            number=totals.get(key)
            if isinstance(number,bool) or number is None:
                return None
            try:
                parsed=float(str(number).strip().replace(",","."))
            except (TypeError,ValueError):
                return None
            if not math.isfinite(parsed) or parsed<0:
                return None
            values[key]+=parsed
    return {key:value/len(options) for key,value in values.items()}

def calculate_day(effective_meals, options_by_color, peri=()):
    total={key:0.0 for key in KEYS}
    missing=[]
    count=0
    for meal in MEALS:
        color=effective_meals.get(meal,{}).get("color")
        if not color:
            continue
        average=average_options(options_by_color.get(color,{}).get(meal,()))
        if average is None:
            missing.append((meal,color))
            continue
        for key in KEYS:
            total[key]+=average[key]
        count+=1
    for item in peri:
        average=average_options(item.get("options",()))
        if average is None:
            missing.append((item.get("title","Peri"),None))
            continue
        for key in KEYS:
            total[key]+=average[key]
        count+=1
    return {"state":"partial" if missing else "complete",
            "total":total if count else None,"missing":missing,"count":count}
