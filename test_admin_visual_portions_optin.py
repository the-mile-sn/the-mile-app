"""Visual portion opt-in defaults to OFF and is independent per athlete."""
import pathlib
import sqlite3
import unittest

import microcycles_v2


class AthleteVisualPortionsTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        microcycles_v2.initialize(self.c)

    def tearDown(self):
        self.c.close()

    def test_flag_defaults_off_for_historical_and_new_athletes(self):
        self.c.execute("INSERT INTO v2_athletes(id,name,created_at) VALUES('a','Jogador A',1)")
        self.c.execute("INSERT INTO v2_athletes(id,name,created_at) VALUES('b','Jogador B',1)")
        a=self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='a'").fetchone()
        b=self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='b'").fetchone()
        self.assertEqual(a[0],0)
        self.assertEqual(b[0],0)
        self.c.execute("UPDATE v2_athletes SET visual_portions_enabled=1 WHERE id='a'")
        self.assertEqual(self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='a'").fetchone()[0],1)
        self.assertEqual(self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='b'").fetchone()[0],0)
        microcycles_v2.initialize(self.c)
        self.assertEqual(self.c.execute("SELECT visual_portions_enabled FROM v2_athletes WHERE id='a'").fetchone()[0],1)

    def test_profile_contract_and_checkbox(self):
        source=pathlib.Path("app.py").read_text()
        dashboard=pathlib.Path("static/admin-dashboard.js").read_text()
        self.assertIn("visual_portions_enabled=body.get(",source)
        self.assertIn("if not isinstance(visual_portions_enabled,bool)",source)
        self.assertIn("'visual_portions_enabled':bool(details['visual_portions_enabled'])",source)
        self.assertIn("input.dataset.playerPermissionField=key",dashboard)
        self.assertIn("visual_portions_enabled:!!playerDetails?.visual_portions_enabled",dashboard)


    def test_profile_sections_keep_access_and_photo_endpoints(self):
        dashboard=pathlib.Path("static/admin-dashboard.js").read_text()
        html=pathlib.Path("static/admin-microcycles.html").read_text()
        styles=pathlib.Path("static/admin-microcycles.css").read_text()
        self.assertIn('id="tm-player-data-title">Dados pessoais',html)
        self.assertIn('id="tm-players-settings-slot"',html)
        self.assertIn('id="tm-players-access-management"',html)
        self.assertIn('id="tm-player-loading-photo-edit"',html)
        self.assertIn('id="tm-player-loading-photo-cancel"',html)
        self.assertIn('id="tm-players-profile-photo-upload"',html)
        self.assertIn('photoControl.closest(".tm-player-photo-control").hidden=!playerProfileEditing',dashboard)
        self.assertIn("settingsActions.hidden=true",dashboard)
        self.assertIn('settingsSave.addEventListener("click",async()=>{',dashboard)
        self.assertIn('settingsCancel.addEventListener("click",()=>{',dashboard)
        self.assertIn("meal_option_selection_enabled:!!playerDetails?.meal_option_selection_enabled",dashboard)
        self.assertIn("visual_portions_enabled:!!playerDetails?.visual_portions_enabled",dashboard)
        self.assertIn('"/loading-photo",{method:"PUT"',dashboard)
        self.assertIn('"/loading-photo",{method:"DELETE"',dashboard)
        self.assertIn('"/password-reset"',dashboard)
        self.assertIn('"/archive"',dashboard)
        self.assertIn("#tm-players-page #tm-players-settings-slot",styles)

    def test_visual_account_permissions_layout_and_themes(self):
        dashboard=pathlib.Path("static/admin-dashboard.js").read_text()
        styles=pathlib.Path("static/admin-microcycles.css").read_text()
        html=pathlib.Path("static/admin-microcycles.html").read_text()
        self.assertIn('const permissions=el("section","tm-player-permissions")',dashboard)
        self.assertIn('el("h4","tm-player-permissions-title","Permissões e definições da conta")',dashboard)
        self.assertIn("settingsSlot.prepend(permissions)",dashboard)
        self.assertIn('title:"Seleção de opções pelo nutricionista"',dashboard)
        self.assertIn('title:"Porções visuais"',dashboard)
        self.assertIn('description:"Referências fotográficas para Almoço e Jantar."',dashboard)
        self.assertNotIn("A publicação na app depende ainda da aprovação final",dashboard)
        self.assertIn("input.disabled=playerProfileEditing",dashboard)
        self.assertIn('badge.textContent=input.checked?activeText:inactiveText',dashboard)
        self.assertIn('row.classList.toggle("is-enabled",input.checked)',dashboard)
        self.assertIn("tm-player-permission-track",styles)
        self.assertIn("tm-player-permissions-list",styles)
        self.assertIn('html[data-admin-theme="light"] #tm-players-settings-slot',styles)
        self.assertIn("@media(max-width:640px)",styles)
        self.assertIn("admin-dashboard.js?v=63",html)
        self.assertIn("admin-microcycles.css?v=181",html)



if __name__=="__main__":
    unittest.main()
