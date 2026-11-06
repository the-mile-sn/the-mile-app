"""Read-only resolution of current editor meal-plan drafts for microcycles."""
import json

COLOR_TYPES = {'orange': 'Plano laranja', 'yellow': 'Plano amarelo', 'blue': 'Plano azul', 'green': 'Plano verde', 'vp': 'Plano verde preparação'}


def available_drafts(c, athlete_id):
    link = c.execute('SELECT user_id FROM v2_player_links WHERE athlete_id=?', (athlete_id,)).fetchone()
    if not link:
        return {}
    results = {}
    for row in c.execute('SELECT id, content, updated_at FROM v2_food_plan_drafts').fetchall():
        try:
            draft = json.loads(row['content'])
        except (ValueError, TypeError):
            continue
        if str(draft.get('player_id') or '') != str(link['user_id']):
            continue
        results.setdefault(draft.get('plan_type'), []).append({'id': row['id'], 'draft': draft, 'updated_at': row['updated_at']})
    return results
