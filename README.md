# Course Scheduler UC - Web

Backend FastAPI + frontend estático para construcción de horarios.

## Requisitos

- Python 3.10+
- Dependencias en `requirements.txt`

## Setup local

```bash
pip install -r requirements.txt
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

- UI: http://localhost:8000`n- Auto: http://localhost:8000/auto
- Docs: http://localhost:8000/docs

## Core (dependencia compartida)

Este repo depende de `course-scheduler-uc-core` en GitHub.

En `requirements.txt`:

```
course-scheduler-core @ git+https://github.com/scorvachoa/course-scheduler-uc-core@v0.1.3
```

Puedes reemplazar `v0.1.0` por el tag o commit que quieras fijar.

## Datos

- Cursos en `backend/data/cursos.json`.
- Scraping actualiza ese archivo vía `/api/scrape/recommended`.

## Endpoints principales

- `GET /api/courses`
- `GET /api/courses/{course_key}/sections?block=A|B`
- `POST /api/conflicts/validate`
- `POST /api/schedule/build`
- `POST /api/schedule/save`
- `GET /api/schedule/saved?session_id=...`
- `GET /api/schedule/saved/{schedule_id}?session_id=...`
- `POST /api/schedule/export/pdf`
- `POST /api/scrape/recommended`
- `POST /api/contact`

## Variables de entorno (opcional para contacto)

Crear `.env` local (no subir a GitHub):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=correo@gmail.com
SMTP_PASSWORD=app_password
SMTP_TO=correo@gmail.com
```

## Deploy en Render

1. Crear un Web Service desde este repo.
2. Runtime: Python 3
3. Build command:

```
pip install -r requirements.txt
```

4. Start command:

```
uvicorn backend.app:app --host 0.0.0.0 --port $PORT
```

5. (Opcional) Configurar variables de entorno SMTP si usarás `/api/contact`.



## Horario automático

- Página dedicada: /auto
- Genera horario automático con días/cursos
- Botones: aplicar a calendario, guardar y exportar PDF

