"""Read-only translation diagnostic must never open a public route or leak data."""
import os
import unittest
from unittest.mock import patch

import app


class PrivateTranslationReadinessTests(unittest.TestCase):
    def test_off_by_default_does_not_query_translations(self):
        with patch.object(app, "SITE_ROLE", "player"), patch.dict(
            os.environ, {"MILE_APP_TRANSLATION_DIAGNOSTIC": "0"}
        ), patch.object(app.app_content_i18n_v2, "translation_readiness") as probe:
            app.report_internal_translation_readiness(object())
            probe.assert_not_called()

    def test_not_available_to_admin_or_both_service(self):
        for role in ("admin", "both"):
            with self.subTest(role=role), patch.object(app, "SITE_ROLE", role), patch.dict(
                os.environ, {"MILE_APP_TRANSLATION_DIAGNOSTIC": "1"}
            ), patch.object(app.app_content_i18n_v2, "translation_readiness") as probe:
                app.report_internal_translation_readiness(object())
                probe.assert_not_called()

    def test_enabled_player_only_logs_summary_counts(self):
        result = {"available": True, "approved_count": 12, "kinds": {"food": 9, "dish": 3}}
        with patch.object(app, "SITE_ROLE", "player"), patch.dict(
            os.environ, {"MILE_APP_TRANSLATION_DIAGNOSTIC": "1"}
        ), patch.object(app.app_content_i18n_v2, "translation_readiness", return_value=result) as probe, \
                patch.object(app.logging, "warning") as log:
            app.report_internal_translation_readiness(object())
            probe.assert_called_once()
            log.assert_called_once()
            args = log.call_args.args
            self.assertEqual(args[1:], (True, 12, {"food": 9, "dish": 3}))
            self.assertNotIn("translated_text", str(args))

    def test_failed_probe_does_not_stop_player_service(self):
        with patch.object(app, "SITE_ROLE", "player"), patch.dict(
            os.environ, {"MILE_APP_TRANSLATION_DIAGNOSTIC": "1"}
        ), patch.object(app.app_content_i18n_v2, "translation_readiness",
                        side_effect=RuntimeError("probe unavailable")), \
                patch.object(app.logging, "exception") as log:
            app.report_internal_translation_readiness(object())
            log.assert_called_once()

    def test_no_public_readiness_endpoint(self):
        from pathlib import Path
        app_source = Path(app.__file__).read_text(encoding="utf-8")
        self.assertNotIn("if path == '/api/v2/admin/translation-readiness'", app_source)


if __name__ == "__main__":
    unittest.main()
