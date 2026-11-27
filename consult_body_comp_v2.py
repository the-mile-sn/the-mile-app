"""Composição corporal dos clientes de consulta (cálculos do servidor).

Equações iguais às da folha «Registo de avaliações» da The Mile; a massa
muscular usa a equação de Lee et al. (2000) tal como no estudo
(−0,048 × idade; etnia afrodescendente +1,1). Funções puras, sem base de dados.
"""
import math

SKINFOLDS = ("subscapular", "triceps", "biceps", "suprailiac", "supraspinal", "abdominal", "thigh", "calf")
GIRTHS = ("arm_relaxed", "arm_flexed", "chest", "waist", "abdominal_girth", "hip",
          "thigh_mid", "calf_girth", "arm_relaxed_left", "thigh_mid_left", "calf_girth_left")
BASICS = ("weight_kg", "height_cm")
LIMITS = {"weight_kg": (20, 300), "height_cm": (100, 230)}
SKINFOLD_RANGE = (1, 80)
GIRTH_RANGE = (10, 200)

EQUATIONS = {
    # chave: (rótulo, sexos)
    "peterson": ("Peterson", "MF"),
    "media4": ("Média de 4 (Reilly, Faulkner, Evans, Withers)", "M"),
    "durnin": ("Durnin-Womersley", "MF"),
    "jackson_pollock": ("Jackson e Pollock", "MF"),
    "brook": ("Brook", "MF"),
    "evans": ("Evans (3 pregas)", "MF"),
    "faulkner": ("Faulkner", "M"),
    "reilly": ("Reilly", "M"),
    "slaughter": ("Slaughter", "MF"),
    "withers": ("Withers", "M"),
}
DEFAULT_EQUATION = "peterson"

_DURNIN = {
    "M": [(17, 1.1533, 0.0643), (20, 1.162, 0.063), (30, 1.1631, 0.0632), (40, 1.1422, 0.0544),
          (50, 1.162, 0.07), (999, 1.1715, 0.0779)],
    "F": [(17, 1.1369, 0.0598), (20, 1.1549, 0.0678), (30, 1.1599, 0.0717), (40, 1.1423, 0.0632),
          (50, 1.1333, 0.0612), (999, 1.1339, 0.0645)],
}


def clean_measures(raw):
    """Valida e normaliza as medições (números positivos dentro de intervalos plausíveis)."""
    if not isinstance(raw, dict):
        raise ValueError("invalid_measures")
    out = {}
    for key, value in raw.items():
        if value in (None, ""):
            continue
        if key in BASICS:
            low, high = LIMITS[key]
        elif key in SKINFOLDS:
            low, high = SKINFOLD_RANGE
        elif key in GIRTHS:
            low, high = GIRTH_RANGE
        else:
            raise ValueError("invalid_measures")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) \
                or not low <= value <= high:
            raise ValueError("invalid_" + key)
        out[key] = round(float(value), 2)
    return out


def _siri_two(density):
    return ((4.57 / density - 4.142) + (4.95 / density - 4.5)) / 2


def _all_present(m, keys):
    return all(m.get(k) for k in keys)


def fat_equations(m, sex, age, height_m, bmi):
    """Todas as equações de % de massa gorda possíveis (fração, ex.: 0.18)."""
    s = {k: m.get(k) for k in SKINFOLDS}
    out = {}
    male = sex == "M"
    if _all_present(s, ("subscapular", "triceps", "biceps", "suprailiac")):
        log4 = math.log10(s["subscapular"] + s["triceps"] + s["biceps"] + s["suprailiac"])
        c, k = (1.169, 0.0788) if male else (1.2063, 0.0999)
        out["brook"] = _siri_two(c - k * log4)
        if age:
            for limit, c, k in _DURNIN[sex]:
                if age < limit:
                    out["durnin"] = _siri_two(c - k * log4)
                    break
    if _all_present(s, ("triceps", "thigh", "abdominal")):
        out["evans"] = (8.997 + 0.24658 * (s["triceps"] + s["thigh"] + s["abdominal"])
                        - 6.343 * (1 if male else 0) - 1.998 * m.get("_ethnic", 0)) / 100
    if male and _all_present(s, ("subscapular", "triceps", "suprailiac", "abdominal")):
        out["faulkner"] = (5.783 + 0.153 * (s["subscapular"] + s["triceps"] + s["suprailiac"] + s["abdominal"])) / 100
    if age:
        if male and _all_present(s, ("triceps", "suprailiac", "abdominal", "thigh")):
            t = s["triceps"] + s["suprailiac"] + s["abdominal"] + s["thigh"]
            out["jackson_pollock"] = (0.29288 * t - 0.0005 * t * t + 0.15845 * age - 5.76377) / 100
        if not male:
            jp = []
            if _all_present(s, ("triceps", "suprailiac", "abdominal")):
                t = s["triceps"] + s["suprailiac"] + s["abdominal"]
                jp.append((0.41563 * t - 0.00112 * t * t + 0.03661 * age + 4.03653) / 100)
            if _all_present(s, ("triceps", "abdominal", "suprailiac", "thigh")):
                t = s["triceps"] + s["abdominal"] + s["suprailiac"] + s["thigh"]
                jp.append((0.29669 * t - 0.00043 * t * t + 0.02963 * age + 1.4072) / 100)
            if len(jp) == 2:
                out["jackson_pollock"] = sum(jp) / 2
        if height_m and _all_present(s, ("subscapular", "triceps", "suprailiac", "thigh")):
            t = s["subscapular"] + s["triceps"] + s["suprailiac"] + s["thigh"]
            if male:
                out["peterson"] = (20.94878 + age * 0.1166 - height_m * 100 * 0.11666
                                   + t * 0.42696 - t * t * 0.00159) / 100
            elif bmi:
                out["peterson"] = (22.18945 + age * 0.06368 + bmi * 0.60404 - height_m * 100 * 0.1452
                                   + t * 0.30919 - t * t * 0.00099562) / 100
    if male and _all_present(s, ("triceps", "abdominal", "thigh", "calf")):
        out["reilly"] = (5.174 + s["thigh"] * 0.124 + 0.147 * s["abdominal"]
                         + 0.196 * s["triceps"] + 0.13 * s["calf"]) / 100
    if _all_present(s, ("triceps", "calf")):
        out["slaughter"] = ((0.735 * (s["triceps"] + s["calf"]) + 1) if male
                            else (0.61 * (s["triceps"] + s["calf"]) + 5.1)) / 100
    if male and _all_present(s, ("subscapular", "triceps", "biceps", "supraspinal", "abdominal", "thigh", "calf")):
        seven = sum(s[k] for k in SKINFOLDS if k != "suprailiac")
        out["withers"] = (495 / (1.0988 - 0.0004 * seven) - 450) / 100
    four = [out[k] for k in ("reilly", "faulkner", "evans", "withers") if k in out]
    if male and len(four) == 4:
        out["media4"] = sum(four) / 4
    return out


def corrected_girth(girth, skinfold_mm):
    if not girth or not skinfold_mm:
        return None
    return girth - math.pi * skinfold_mm / 10


def lee_muscle_mass(height_m, sex, age, ethnic, arm, thigh, calf):
    """Lee et al., 2000: MM (kg) = Alt(m)·(0,00744·CAG² + 0,00088·CTG² + 0,00441·CCG²)
    + 2,4·sexo − 0,048·idade + etnia + 7,8 (sexo: homem 1, mulher 0; etnia: afrodescendente +1,1,
    asiática −2,0, caucasiana/outra 0)."""
    if not (height_m and age and arm and thigh and calf and sex in ("M", "F")):
        return None
    race = {"african": 1.1, "asian": -2.0}.get(ethnic, 0.0)
    value = (height_m * (0.00744 * arm * arm + 0.00088 * thigh * thigh + 0.00441 * calf * calf)
             + 2.4 * (1 if sex == "M" else 0) - 0.048 * age + race + 7.8)
    return value if value > 0 else None


def compute(measures, sex, age, ethnic="none", equation=None):
    """Resultados da avaliação a partir das medições e dos dados do perfil."""
    m = dict(measures or {})
    sex = sex if sex in ("M", "F") else ""
    weight = m.get("weight_kg")
    height_m = m.get("height_cm") / 100 if m.get("height_cm") else None
    bmi = weight / height_m / height_m if weight and height_m else None
    skin = [m.get(k) for k in SKINFOLDS]
    res = {"sum8": round(sum(skin), 1) if all(skin) else None,
           "bmi": round(bmi, 1) if bmi else None,
           "equation": None, "fat_pct": None, "fat_kg": None, "lean_kg": None,
           "muscle_kg": None, "muscle_pct": None, "smi": None, "ffmi": None,
           "equations": {}, "corrected": {}, "girth_sum": None, "missing": []}
    if not sex:
        res["missing"].append("sex")
    if not age:
        res["missing"].append("birth_date")
    if not height_m:
        res["missing"].append("height_cm")
    if sex:
        m["_ethnic"] = 1 if ethnic == "african" else 0
        eqs = fat_equations(m, sex, age, height_m, bmi)
        res["equations"] = {k: round(v * 100, 1) for k, v in eqs.items()}
        chosen = equation if equation in EQUATIONS and sex in EQUATIONS[equation][1] else DEFAULT_EQUATION
        res["equation"] = chosen
        if chosen in eqs and eqs[chosen] > 0.03:
            pct = eqs[chosen]
            res["fat_pct"] = round(pct * 100, 1)
            if weight:
                res["fat_kg"] = round(pct * weight, 1)
                res["lean_kg"] = round(weight - pct * weight, 1)
                if height_m:
                    res["ffmi"] = round((weight - pct * weight) / height_m / height_m, 1)
    arm = corrected_girth(m.get("arm_relaxed"), m.get("triceps"))
    thigh = corrected_girth(m.get("thigh_mid"), m.get("thigh"))
    calf = corrected_girth(m.get("calf_girth"), m.get("calf"))
    for key, value in (("arm", arm), ("thigh", thigh), ("calf", calf),
                       ("arm_left", corrected_girth(m.get("arm_relaxed_left"), m.get("triceps"))),
                       ("thigh_left", corrected_girth(m.get("thigh_mid_left"), m.get("thigh"))),
                       ("calf_left", corrected_girth(m.get("calf_girth_left"), m.get("calf")))):
        if value:
            res["corrected"][key] = round(value, 1)
    if arm and thigh and calf:
        res["girth_sum"] = round(arm + thigh + calf, 1)
    muscle = lee_muscle_mass(height_m, sex, age, ethnic, arm, thigh, calf)
    if muscle:
        res["muscle_kg"] = round(muscle, 1)
        if weight:
            res["muscle_pct"] = round(muscle * 100 / weight, 1)
        if height_m:
            res["smi"] = round(muscle / height_m / height_m, 1)
    return res


def age_on(birth_date, on_date):
    """Idade em anos completos numa data (AAAA-MM-DD)."""
    if not birth_date or not on_date:
        return None
    by, bm, bd = (int(x) for x in birth_date.split("-"))
    oy, om, od = (int(x) for x in on_date.split("-"))
    return oy - by - (1 if (om, od) < (bm, bd) else 0)
