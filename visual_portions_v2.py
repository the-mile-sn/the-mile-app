"""Admin-only library of approved, *orientative* visual portion photographs.

The storage is deliberately separate from food-plan nutrition and publication.
No player route is provided in this stage.
"""
import base64
import hashlib
import io
import json
import re
import time
import zipfile

from PIL import Image, UnidentifiedImageError

CATEGORIES = {"Arroz", "Arroz com leguminosas", "Massa", "Batata", "Arroz + Batata", "Carne branca"}
MAX_ARCHIVE = 5 * 1024 * 1024
MAX_EXPANDED = 20 * 1024 * 1024
MAX_PHOTO = 512 * 1024
REF_ID = re.compile(r"^[a-f0-9]{24}$")


def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_visual_portion_images (
        sha256 TEXT PRIMARY KEY, data_base64 TEXT NOT NULL
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS v2_visual_portions (
        id TEXT PRIMARY KEY,
        source_row INTEGER NOT NULL,
        category TEXT NOT NULL,
        total_g INTEGER NOT NULL,
        rice_g INTEGER,
        potato_g INTEGER,
        image_sha256 TEXT NOT NULL REFERENCES v2_visual_portion_images(sha256),
        active INTEGER NOT NULL DEFAULT 1,
        orientative INTEGER NOT NULL DEFAULT 1,
        notes TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_v2_visual_portions_lookup ON v2_visual_portions(category,total_g,active)")
    # Existing photographs remain unchanged. Reclassify only the reference group:
    # white-meat photos serve visually for both meat and fish meal options.
    c.execute("UPDATE v2_visual_portions SET category='Carne / Peixe' WHERE category='Carne branca'")


def list_references(c):
    rows = c.execute("""SELECT id, source_row, category, total_g, rice_g, potato_g,
                               active, orientative, notes, updated_at
                        FROM v2_visual_portions ORDER BY category,total_g,source_row""").fetchall()
    references = [dict(row) for row in rows]
    for ref in references:
        # Preserve the true photographed subject for future player UI/accessibility.
        ref["photo_subject"] = "Carne branca" if ref["category"] == "Carne / Peixe" else ref["category"]
    return references


def get_image(c, reference_id):
    if not REF_ID.fullmatch(str(reference_id or "")):
        return None
    row = c.execute("""SELECT im.data_base64 FROM v2_visual_portions vp
                       JOIN v2_visual_portion_images im ON im.sha256=vp.image_sha256
                       WHERE vp.id=?""", (reference_id,)).fetchone()
    return base64.b64decode(row["data_base64"]) if row else None


def set_active(c, reference_id, active):
    if not REF_ID.fullmatch(str(reference_id or "")) or type(active) is not bool:
        raise ValueError("invalid_reference")
    c.execute("UPDATE v2_visual_portions SET active=?,updated_at=? WHERE id=?",
              (int(active), int(time.time()), reference_id))
    result = c.execute("SELECT active FROM v2_visual_portions WHERE id=?", (reference_id,)).fetchone()
    if result is None:
        return None
    c.commit()
    return bool(result["active"])


def _verified_photo(raw):
    if not 16 <= len(raw) <= MAX_PHOTO or raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        raise ValueError("invalid_photo")
    try:
        with Image.open(io.BytesIO(raw)) as photo:
            if photo.format != "WEBP" or photo.width > 1800 or photo.height > 1800:
                raise ValueError("invalid_photo")
            photo.verify()
    except (UnidentifiedImageError, OSError):
        raise ValueError("invalid_photo")
    return hashlib.sha256(raw).hexdigest()


def _positive_int(value):
    if type(value) is not int or not 1 <= value <= 5000:
        raise ValueError("invalid_quantity")
    return value


def import_approved_archive(c, archive_bytes):
    if not isinstance(archive_bytes, bytes) or len(archive_bytes) > MAX_ARCHIVE:
        raise ValueError("invalid_archive")
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            files = {f.filename: f for f in archive.infolist()}
            if len(files) > 130 or sum(i.file_size for i in files.values()) > MAX_EXPANDED:
                raise ValueError("invalid_archive")
            if "manifest.json" not in files or files["manifest.json"].file_size > 150000:
                raise ValueError("invalid_archive")
            payload = json.loads(archive.read("manifest.json"))
            meta, refs = payload["metadata"], payload["references"]
            if meta.get("approved") is not True or not isinstance(refs, list) or not 1 <= len(refs) <= 100:
                raise ValueError("not_approved")
            ids, photos, prepared = set(), {}, []
            for ref in refs:
                if not isinstance(ref, dict) or ref.get("estado") != "Aprovado" or ref.get("orientativa") is not True:
                    raise ValueError("not_approved")
                category = ref.get("categoria")
                if category not in CATEGORIES or ref.get("categoria_original") == "Carne / Peixe" and category != "Carne branca":
                    raise ValueError("invalid_category")
                # The approved ZIP records Carne branca, not fish photos. The
                # category is a shared display/matching group, not the subject.
                if category == "Carne branca":
                    category = "Carne / Peixe"
                source = _positive_int(ref.get("linha_excel"))
                if source in ids:
                    raise ValueError("duplicate_reference")
                ids.add(source)
                total = _positive_int(ref.get("total_g"))
                rice, potato = ref.get("arroz_g"), ref.get("batata_g")
                if category == "Arroz + Batata":
                    rice, potato = _positive_int(rice), _positive_int(potato)
                    if rice + potato != total:
                        raise ValueError("invalid_mix")
                elif rice is not None or potato is not None:
                    raise ValueError("invalid_mix")
                filename = ref.get("ficheiro")
                if not isinstance(filename, str) or not re.fullmatch(r"imagens/image[0-9]+\.webp", filename):
                    raise ValueError("invalid_photo_path")
                info = files.get(filename)
                if info is None or info.file_size > MAX_PHOTO:
                    raise ValueError("missing_photo")
                if filename not in photos:
                    photo_bytes = archive.read(filename)
                    photos[filename] = (_verified_photo(photo_bytes), photo_bytes)
                photo_hash, _ = photos[filename]
                reference_id = hashlib.sha256(("the-mile:visual-portions:excel:" + str(source)).encode()).hexdigest()[:24]
                prepared.append((reference_id,source,category,total,rice,potato,photo_hash,
                                 str(ref.get("observacao") or "")[:400]))
            now = int(time.time())
            for digest, raw in photos.values():
                c.execute("INSERT INTO v2_visual_portion_images(sha256,data_base64) VALUES(?,?) ON CONFLICT(sha256) DO NOTHING",
                          (digest,base64.b64encode(raw).decode("ascii")))
            for reference_id,source,category,total,rice,potato,digest,notes in prepared:
                c.execute("""INSERT INTO v2_visual_portions
                  (id,source_row,category,total_g,rice_g,potato_g,image_sha256,active,orientative,notes,created_at,updated_at)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                  ON CONFLICT(id) DO UPDATE SET category=excluded.category,total_g=excluded.total_g,
                  rice_g=excluded.rice_g,potato_g=excluded.potato_g,image_sha256=excluded.image_sha256,
                  orientative=excluded.orientative,notes=excluded.notes,updated_at=excluded.updated_at""",
                  (reference_id,source,category,total,rice,potato,digest,1,1,notes,now,now))
            c.commit()
            return {"imported": len(prepared), "photos": len(photos), "status": "admin_only", "published_to_players": False}
    except (zipfile.BadZipFile, KeyError, TypeError, IndexError, UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("invalid_archive")
