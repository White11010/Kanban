-- Этот скрипт выполняется один раз при первом запуске Postgres
-- Создаём отдельные базы для каждого сервиса и для тестов

CREATE DATABASE kanban_auth;
CREATE DATABASE kanban_tasks;
CREATE DATABASE kanban_notifications;

-- Тестовые базы для интеграционных тестов
CREATE DATABASE kanban_auth_test;
CREATE DATABASE kanban_tasks_test;
CREATE DATABASE kanban_notifications_test;

-- Выдаём права пользователю на все базы
GRANT ALL PRIVILEGES ON DATABASE kanban_auth TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON DATABASE kanban_tasks TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON DATABASE kanban_notifications TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON DATABASE kanban_auth_test TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON DATABASE kanban_tasks_test TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON DATABASE kanban_notifications_test TO ${POSTGRES_USER};