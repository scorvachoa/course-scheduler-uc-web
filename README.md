# Course Scheduler UC - Web

Aplicación web (FastAPI + frontend estático) para planificar horarios académicos: trae tu
oferta del Portal del Estudiante con tu cookie, armas el horario por bloques A/B, valida
conflictos, consultas docentes y exportas tu calendario en PDF/JSON.

## Requisitos

- Python 3.10+
- Dependencias en `requirements.txt`

## Setup local

```bash
pip install -r requirements.txt
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

- UI: http://localhost:8000
- Docs: http://localhost:8000/docs

## Cómo se usa

1. Abre la app en la pestaña **Planificador**.
2. Si aún no hay cursos, usa **Actualizar cookie**: pega la cookie de tu sesión en el
   Portal del Estudiante (formato Netscape desde la extensión *Get cookies.txt LOCALLY* o
   el header `Cookie:` de DevTools) y elige el periodo.
3. Selecciona un NRC por curso en el **bloque A** o **B** (y revisa los conflictos en vivo).
4. **Construye** el horario, revisa el calendario semanal y **exporta** en PDF/JSON o guárdalo
   por sesión.

## Funcionalidades

- Carga de cursos por sesión usando la cookie del estudiante.
- Planificador por bloques A/B con detección de conflictos.
- Generador automático de horarios (días y objetivo de créditos).
- Calendario semanal en vivo y export PDF/JSON.
- Horarios guardados por sesión (se cargan al volver).
- Directorio de docentes con sus cursos, bloques y horarios.
- Tema claro/oscuro y diseño responsivo (recomendado en PC).

## Páginas

- `/` — app principal (pestañas: Acerca de, Planificador, Automático, Docentes, Guía cookie, Actualizar cookie).
- `/teachers` — directorio de docentes.
- `/cookie-guide` — guía para obtener la cookie.
- `/about` — página "Acerca de".

## Core (dependencia compartida)

Este repo depende de `course-scheduler-uc-core` en GitHub.

En `requirements.txt`:

```
course-scheduler-core @ git+https://github.com/scorvachoa/course-scheduler-uc-core@v0.1.3
```

Puedes reemplazar `v0.1.3` por el tag o commit que quieras fijar.

## Datos (runtime, no versionados)

- Cursos por sesión en `backend/data/sessions/`.
- Horarios guardados en `backend/data/schedules/`.
- Export PDF en `backend/data/exports/`.
- Visitas en `backend/data/metrics.json`.

## Endpoints principales

- `GET /health`
- `GET /api/courses?session_id=...`
- `GET /api/teachers?session_id=...`
- `GET /api/courses/{course_key}/sections?block=A|B&session_id=...`
- `POST /api/scrape/recommended` — carga/actualiza cursos desde la cookie.
- `POST /api/conflicts/validate`
- `POST /api/schedule/build`
- `POST /api/schedule/auto` — generador automático.
- `POST /api/schedule/save`
- `GET /api/schedule/saved?session_id=...`
- `GET /api/schedule/saved/{schedule_id}?session_id=...`
- `POST /api/schedule/export/pdf`
- `GET /api/metrics/visit` / `GET /api/metrics`
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
2. Runtime: Python 3.
3. Build command:

```
pip install -r requirements.txt
```

4. Start command:

```
uvicorn backend.app:app --host 0.0.0.0 --port $PORT
```

5. (Opcional) Configurar variables de entorno SMTP si usarás `/api/contact`.
