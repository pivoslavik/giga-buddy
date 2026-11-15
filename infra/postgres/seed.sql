BEGIN;

-- Serialize concurrent runs of this seed script.
SELECT pg_advisory_xact_lock(217401, 1);

-- Both test accounts use the password 123. Keep fixture emails stable to rename existing accounts in place.
INSERT INTO users (username, password_hash, email, role, display_name)
VALUES
    ('admin', '$2a$10$6BqlXSBRbmQAkrfyU4wjfenTfAEVwiaKz/eJHbx02oCYlEvQHIdg.',
     'seed_admin@example.test', 'admin', 'Тестовый администратор'),
    ('intern', '$2a$10$HhPJU2Uiz/O0bAdAiVGm4eM/MF0yI0B63HlYI69uB84DPc0nOm4h.',
     'seed_intern@example.test', 'intern', 'Тестовый стажёр')
ON CONFLICT (email) DO UPDATE
SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash
WHERE users.username IN (EXCLUDED.username, 'seed_' || EXCLUDED.username)
  AND (users.username, users.password_hash) IS DISTINCT FROM (EXCLUDED.username, EXCLUDED.password_hash);

INSERT INTO messages (user_id, role, text, created_at)
SELECT u.id, m.role, m.text, NOW() - m.age
FROM (VALUES
    ('intern', 'user'::message_role, 'С чего начать в первый рабочий день?', INTERVAL '4 minutes'),
    ('intern', 'assistant', 'Познакомься с наставником и проверь доступ к рабочим сервисам.', INTERVAL '3 minutes'),
    ('admin', 'user', 'Что включить в план первой недели стажёра?', INTERVAL '2 minutes'),
    ('admin', 'assistant', 'Запланируй знакомство с командой и первую небольшую задачу.', INTERVAL '1 minute')
) AS m(username, role, text, age)
JOIN users AS u ON u.username = m.username AND u.email = 'seed_' || m.username || '@example.test'
WHERE NOT EXISTS (
    SELECT 1 FROM messages AS existing
    WHERE existing.user_id = u.id AND existing.role = m.role AND existing.text = m.text
)
ORDER BY m.age DESC;

INSERT INTO auth_refresh_sessions (user_id, token_hash, user_agent, ip, expires_at, created_at)
SELECT id, encode(sha256(convert_to('giga-buddy-seed:seed_' || username, 'UTF8')), 'hex'),
       'Giga Buddy seed', '192.0.2.1', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days'
FROM users
WHERE (username, email) IN (
    ('admin', 'seed_admin@example.test'),
    ('intern', 'seed_intern@example.test')
)
ON CONFLICT (token_hash) DO NOTHING;

INSERT INTO demo_actions (id, owner, kind, payload, status)
SELECT action.id, u.id, action.kind, action.payload, 'awaiting_confirmation'
FROM (VALUES
    ('seed-access', 'access'::demo_action_kind,
     '{"resource":"CAT-DEV","level":"read","approver":"наставник","justification":"Нужен доступ для первой задачи стажировки"}'::jsonb),
    ('seed-review', 'review',
     '{"pr_number":42,"reviewer":"demo-reviewer","commit":"a8c41fe"}'),
    ('seed-absence', 'absence',
     jsonb_build_object(
         'start', to_char((NOW() AT TIME ZONE 'UTC') + INTERVAL '7 days', 'YYYY-MM-DD"T"09:00:00.000000+00:00'),
         'end', to_char((NOW() AT TIME ZONE 'UTC') + INTERVAL '7 days', 'YYYY-MM-DD"T"12:00:00.000000+00:00'),
         'requested_start', to_char((NOW() AT TIME ZONE 'UTC') + INTERVAL '7 days', 'YYYY-MM-DD"T"09:00:00.000000+00:00'),
         'requested_end', to_char((NOW() AT TIME ZONE 'UTC') + INTERVAL '7 days', 'YYYY-MM-DD"T"12:00:00.000000+00:00'),
         'absence_type', 'личные дела',
         'approver', 'руководитель команды'
     ))
) AS action(id, kind, payload)
CROSS JOIN users AS u
WHERE u.username = 'intern' AND u.email = 'seed_intern@example.test'
ON CONFLICT (id) DO NOTHING;

COMMIT;
