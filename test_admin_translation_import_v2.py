"""API-free Backoffice translation import checks against disposable SQLite.

Verifies source hashes, CSRF, authorisation, rollback, and no canonical writes.
No external API or production data is ever accessed.
"""
import json
import os
import unittest
from unittest.mock import patch

import test_app
import content_translations_v2 as translations

app=test_app.app
FLAG={"MILE_BACKOFFICE_TRANSLATIONS_ENABLED":"1","MILE_APP_TRANSLATIONS_ENABLED":"0"}
ROOT="/api/v2/admin/i18n/import"


class TranslationImportTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        with app.connect() as c:
            translations.initialize(c)
            c.execute("""INSERT INTO v2_food_library(
              id,source_key,base_name,display_name,category,notes,variant,
              edible_fraction,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at
            ) VALUES('food-import',NULL,'Arroz','Arroz branco','Cereais',
                     'Nota INTERNA','plain',1,130,2.7,28.2,0.3,1,1,1)""")
            c.execute("""INSERT INTO v2_food_library(
              id,source_key,base_name,display_name,category,notes,variant,
              edible_fraction,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at
            ) VALUES('food-oats',NULL,'Aveia','Aveia','Cereais',
                     'Uso interno','plain',1,110,4.0,20.0,2.0,1,1,1)""")
            c.execute("""INSERT INTO v2_dish_library(
              id,category,name_pt,name_en,image_filename,active
            ) VALUES('dish-existing','Carne','Frango com arroz',
                     'Chicken and rice','dish-placeholder',1)""")
            c.execute("""INSERT INTO v2_recipe_categories(id,name,created_at)
                         VALUES('cat-import','Refeições',1)""")
            c.execute("""INSERT INTO v2_recipe_library(
              id,category_id,name,recipe_type,status,servings,
              sections_json,steps_json,notes,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
              ('recipe-import','cat-import','Arroz cozido','standard','published',2,
               json.dumps([{'id':'a'*24,'title':'Ingredientes',
                             'ingredients':[{'id':'b'*24,'name':'Arroz',
                                             'quantity':'100','unit':'g'}]}]),
               json.dumps(['Cozer em água.']), 'Nota visível',1,1))
            c.execute("""INSERT INTO v2_supplement_library(
              id,name,dose,moment,rule,note,timing_text,prescriptions_json
            ) VALUES('supp-import','Creatina','5 g','lunch','daily',
                     'Com água','Após o almoço','[]')""")
            c.commit()

    def food(self,ident='food-import',name='Arroz branco'):
        return {'entity_kind':'food','entity_id':ident,'field_path':'display_name',
                'source_text':name,'translated_text':'White rice' if name=='Arroz branco' else 'Oats'}

    def send(self,kind,rows,csrf=True):
        return self.admin.request(ROOT+'/'+kind,'POST',{'rows':rows},csrf=csrf)

    def test_export_independent_routes_not_available_without_flag(self):
        with patch.dict(os.environ,{'MILE_BACKOFFICE_TRANSLATIONS_ENABLED':'0'}):
            self.assertEqual(self.send('preview',[self.food()])['status'],404)
            self.assertEqual(self.send('submit',[self.food()])['status'],404)

    def test_requires_admin_csrf_and_origins(self):
        with patch.dict(os.environ,FLAG):
            self.assertEqual(test_app.Client().request(ROOT+'/preview','POST',
                {'rows':[self.food()]})['status'],401)
            self.assertEqual(self.send('submit',[self.food()],csrf=False)['status'],403)
            self.assertEqual(self.admin.request(ROOT+'/submit','POST',
                {'rows':[self.food()]},origin='https://evil.invalid')['status'],403)
            self.assertEqual(self.admin.request(ROOT+'/submit')['status'],404)

    def test_preview_does_not_write_and_import_is_pending(self):
        with patch.dict(os.environ,FLAG):
            preview=self.send('preview',[self.food()])
            self.assertEqual(preview['status'],200,preview)
            self.assertEqual(preview['body']['eligible'],1)
            self.assertFalse(preview['body']['saved'])
            with app.connect() as c:
                self.assertEqual(c.execute('SELECT COUNT(*) FROM v2_content_translations').fetchone()[0],0)
            result=self.send('submit',[self.food()])
            self.assertEqual(result['status'],201,result)
            self.assertEqual(result['body'],{'imported':1,'status':'pending','approved':False})
            with app.connect() as c:
                t=c.execute("SELECT translated_text,status,approved_by FROM "
                    "v2_content_translations WHERE entity_id='food-import'").fetchone()
                self.assertEqual(tuple(t),('White rice','pending',None))
                h=c.execute("SELECT action FROM v2_content_translation_history "
                  "WHERE entity_id='food-import'").fetchone()
                self.assertEqual(h['action'],'submitted')
                original=c.execute("SELECT display_name,notes,kcal FROM v2_food_library "
                    "WHERE id='food-import'").fetchone()
                self.assertEqual(tuple(original),('Arroz branco','Nota INTERNA',130.0))
            self.assertEqual(self.send('submit',[self.food()])['status'],409)

    def test_batch_is_all_or_nothing_and_preserves_existing_english(self):
        with patch.dict(os.environ,FLAG):
            existing={'entity_kind':'dish','entity_id':'dish-existing',
              'field_path':'name_pt','source_text':'Frango com arroz',
              'translated_text':'Chicken and rice'}
            rows=[self.food(),existing]
            preview=self.send('preview',rows)
            self.assertEqual(preview['body']['eligible'],1)
            self.assertEqual(preview['body']['errors'][0]['code'],'existing_english')
            self.assertEqual(self.send('submit',rows)['status'],409)
            with app.connect() as c:
                self.assertEqual(c.execute('SELECT COUNT(*) FROM v2_content_translations').fetchone()[0],0)

    def test_stale_source_duplicates_and_internal_notes_cannot_be_imported(self):
        with patch.dict(os.environ,FLAG):
            stale={**self.food(),'source_text':'Outro arroz'}
            internal={**self.food(),'field_path':'notes',
                      'source_text':'Nota INTERNA'}
            duplicates=[self.food(),self.food()]
            for rows,code in [([stale],'source_changed'),
                              ([internal],'missing_field'),
                              (duplicates,'duplicate_row')]:
                with self.subTest(code=code):
                    preview=self.send('preview',rows)
                    self.assertEqual(preview['status'],200,preview)
                    self.assertIn(code,[e['code'] for e in preview['body']['errors']])
                    self.assertEqual(self.send('submit',rows)['status'],409)
            with app.connect() as c:
                self.assertEqual(c.execute('SELECT COUNT(*) FROM v2_content_translations').fetchone()[0],0)

    def test_recipe_category_and_supplement_import_with_visible_fields(self):
        with patch.dict(os.environ,FLAG):
            rows=[
             {'entity_kind':'recipe_category','entity_id':'cat-import',
              'field_path':'name','source_text':'Refeições','translated_text':'Meals'},
             {'entity_kind':'recipe','entity_id':'recipe-import',
              'field_path':'steps/0','source_text':'Cozer em água.','translated_text':'Boil in water.'},
             {'entity_kind':'supplement','entity_id':'supp-import',
              'field_path':'name','source_text':'Creatina','translated_text':'Creatine'},
            ]
            self.assertEqual(self.send('preview',rows)['body']['eligible'],3)
            self.assertEqual(self.send('submit',rows)['body']['imported'],3)
            with app.connect() as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations "
                                            "WHERE status='approved'").fetchone()[0],0)
                self.assertEqual(c.execute("SELECT COUNT(*) FROM v2_content_translations").fetchone()[0],3)

    def test_pending_or_approved_never_overwritten_and_limit_enforced(self):
        with patch.dict(os.environ,FLAG):
            self.assertEqual(self.send('submit',[self.food()])['status'],201)
            newer={**self.food(),'translated_text':'Rice'}
            self.assertEqual(self.send('preview',[newer])['body']['errors'][0]['code'],
                             'already_reviewed')
            self.assertEqual(self.send('submit',[newer])['status'],409)
            self.assertEqual(self.send('preview',[])['status'],400)
            self.assertEqual(self.send('submit',[self.food()]*101)['status'],400)
            with app.connect() as c:
                t=c.execute("SELECT translated_text FROM v2_content_translations "
                            "WHERE entity_id='food-import'").fetchone()
                self.assertEqual(t['translated_text'],'White rice')

if __name__=='__main__':
    unittest.main()
