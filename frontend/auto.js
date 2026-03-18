const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const state = {
    courses: [],
};

const autoScheduleState = {
    selectedCourses: new Set(),
    result: null,
};

const qs = (id) => document.getElementById(id);

/**
 * Obtiene o crea un id de sesión estable en localStorage.
 */
function getSessionId() {
    const key = "cs_session_id";
    let value = localStorage.getItem(key);
    if (!value) {
        value = crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem(key, value);
    }
    return value;
}

const sessionId = getSessionId();

/**
 * Ejecuta una petición JSON y lanza error si la respuesta no es OK.
 */
async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(`${res.status}: ${detail}`);
    }
    return res.json();
}

/**
 * Convierte errores técnicos en mensajes legibles para el usuario.
 */
function userMessage(error) {
    const msg = error?.message || "Error";
    if (msg.includes("404")) return "Recurso no encontrado.";
    if (msg.includes("500")) return "Error del servidor.";
    if (msg.includes("Failed to fetch")) return "No se pudo conectar al servidor.";
    return msg;
}

/**
 * Normaliza nombres de días a etiquetas estándar en español.
 */
function normalizeDay(dayText = "") {
    const fixed = String(dayText)
    .replace(/Ã¡/g, "\u00e1")
    .replace(/Ã©/g, "\u00e9")
    .replace(/Ã­/g, "\u00ed")
    .replace(/Ã³/g, "\u00f3")
    .replace(/Ãº/g, "\u00fa")
    .replace(/Ã±/g, "\u00f1")
    .replace(/Ã/g, "\u00c1")
    .replace(/Ã‰/g, "\u00c9")
    .replace(/Ã/g, "\u00cd")
    .replace(/Ã“/g, "\u00d3")
    .replace(/Ãš/g, "\u00da")
    .replace(/Ã‘/g, "\u00d1");

    const value = fixed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

    const normalized = value.replace(/[^a-z]/g, "");
    const map = {
        lunes: "Lunes",
        martes: "Martes",
        miercoles: "Mi\u00e9rcoles",
        jueves: "Jueves",
        viernes: "Viernes",
        sabado: "S\u00e1bado",
        domingo: "Domingo",
        l: "Lunes",
        m: "Martes",
        x: "Mi\u00e9rcoles",
        j: "Jueves",
        v: "Viernes",
        s: "S\u00e1bado",
        d: "Domingo",
    };
    if (map[normalized]) return map[normalized];
    if (normalized.startsWith("mi")) return "Mi\u00e9rcoles";
    if (normalized.startsWith("sa")) return "S\u00e1bado";
    if (normalized.startsWith("do")) return "Domingo";
    if (normalized.startsWith("lu")) return "Lunes";
    if (normalized.startsWith("ma")) return "Martes";
    if (normalized.startsWith("ju")) return "Jueves";
    if (normalized.startsWith("vi")) return "Viernes";
    return null;
}

/**
 * Convierte HH:MM a minutos totales.
 */
function parseTimeToMinutes(timeText) {
    if (!timeText) return NaN;
    const parts = String(timeText).split(":");
    const h = Number.parseInt(parts[0], 10);
    const m = Number.parseInt(parts[1] || "0", 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
    return h * 60 + m;
}

/**
 * Convierte minutos a formato HH:MM.
 */
function formatMinutes(minutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    return `${h}:${m}`;
}

/**
 * Genera una paleta de colores por bloque sin repetir.
 */
function buildBlockColors(courses) {
    const map = {};
    const keys = [];
    courses.forEach((course) => {
        const key = course.course_key || course.name;
        if (!map[key]) keys.push(key);
    });
    const total = Math.max(1, keys.length);
    keys.forEach((key, idx) => {
        const hue = Math.floor((idx * 360) / total);
        map[key] = `hsl(${hue} 70% 85%)`;
    });
    return map;
}

/**
 * Genera los intervalos de tiempo del calendario.
 */
function timeSlots(start = "07:00", end = "23:00", stepMinutes = 30) {
    const slots = [];
    for (let m = parseTimeToMinutes(start); m <= parseTimeToMinutes(end); m += stepMinutes) {
        slots.push(formatMinutes(m));
    }
    return slots;
}

/**
 * Construye eventos de calendario agrupados por día.
 */
function buildCalendarEvents(courses, slots, stepMinutes = 30, colors = {}) {
    const dayMin = parseTimeToMinutes(slots[0]);
    const dayMax = parseTimeToMinutes(slots[slots.length - 1]);

    const eventsByDay = {};
    days.forEach((d) => {
        eventsByDay[d] = [];
    });

    courses.forEach((course) => {
        const bg = colors[course.course_key || course.name] || `hsl(210 70% 85%)`;
        (course.horarios || []).forEach((h) => {
            const normalizedDay = normalizeDay(h.dia);
            if (!normalizedDay || !eventsByDay[normalizedDay]) return;

            const startMinutes = parseTimeToMinutes(h.inicio);
            const endMinutes = parseTimeToMinutes(h.fin);
            if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) return;

            const clampedStart = Math.max(startMinutes, dayMin);
            const clampedEnd = Math.min(endMinutes, dayMax);
            if (clampedEnd <= clampedStart) return;

            const startIndex = Math.floor((clampedStart - dayMin) / stepMinutes);
            const endIndex = Math.ceil((clampedEnd - dayMin) / stepMinutes);
            const span = Math.max(1, endIndex - startIndex);

            eventsByDay[normalizedDay].push({
                startIndex,
                span,
                name: course.name,
                nrc: course.nrc,
                inicio: formatMinutes(startMinutes),
                fin: formatMinutes(endMinutes),
                teacher: course.teacher || "",
                color: bg,
            });
        });
    });

    Object.keys(eventsByDay).forEach((day) => {
    eventsByDay[day].sort((a, b) => a.startIndex - b.startIndex);
    });

    return eventsByDay;
}

/**
 * Renderiza el calendario semanal para una lista de cursos.
 */
function renderCalendar(targetId, courses) {
    const target = qs(targetId);
    const slots = timeSlots();
    const stepMinutes = 30;
    const colors = buildBlockColors(courses);
    const eventsByDay = buildCalendarEvents(courses, slots, stepMinutes, colors);

    const activeSpan = {};
    days.forEach((d) => {
        activeSpan[d] = 0;
    });

    let html = '<table class="calendar-grid"><thead><tr><th>Hora</th>';
    html += days.map((d) => `<th>${d}</th>`).join("");
    html += "</tr></thead><tbody>";

    slots.forEach((slot, rowIndex) => {
        html += `<tr><td class="hour-col">${slot}</td>`;

        days.forEach((day) => {
            if (activeSpan[day] > 0) {
            activeSpan[day] -= 1;
                return;
            }

            const event = eventsByDay[day].find((item) => item.startIndex === rowIndex);
            if (event) {
                const teacherText = event.teacher ? `<div class="teacher">${event.teacher}</div>` : "";
                html += `
                <td class="calendar-cell event-cell" rowspan="${event.span}" style="--span:${event.span}">
                <div class="course-block" style="background:${event.color}">
                <strong>${event.name}</strong>
                <div>NRC: ${event.nrc}</div>
                <div>${event.inicio} - ${event.fin}</div>
                ${teacherText}
                </div>
                </td>
                `;
                activeSpan[day] = event.span - 1;
            } else {
                html += '<td class="calendar-cell"></td>';
            }
        });

        html += "</tr>";
    });

    html += "</tbody></table>";
    target.innerHTML = html;
}

/**
 * Dibuja los selectores de días del generador automático.
 */
function renderAutoDays() {
    const root = qs("autoDays");
    if (!root) return;
    root.innerHTML = "";
    days.forEach((day) => {
        const wrapper = document.createElement("div");
        wrapper.className = "form-check form-check-inline";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "form-check-input";
        input.id = `autoDay-${day}`;
        input.value = day;
        input.checked = true;
        const label = document.createElement("label");
        label.className = "form-check-label";
        label.setAttribute("for", input.id);
        label.textContent = day;
        wrapper.appendChild(input);
        wrapper.appendChild(label);
        root.appendChild(wrapper);
    });
}

/**
 * Dibuja la lista de cursos para el generador automático.
 */
function renderAutoCourses(filterText = "") {
    const root = qs("autoCourses");
    if (!root) return;
    const query = filterText.trim().toLowerCase();
    root.innerHTML = "";
    const items = state.courses || [];
    items.forEach((course) => {
        const name = `${course.name} (${course.course_key})`;
        if (query && !name.toLowerCase().includes(query)) return;

        const row = document.createElement("div");
        row.className = "auto-course-item";

        const left = document.createElement("div");
        const title = document.createElement("div");
        title.className = "auto-course-name";
        title.textContent = name;
        const meta = document.createElement("div");
        meta.className = "auto-course-meta";
        meta.textContent = `Créditos: ${course.credits || 0} | Bloques: ${(course.available_blocks || []).join("") || "-"}`;
        left.appendChild(title);
        left.appendChild(meta);

        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "form-check-input";
        check.checked = autoScheduleState.selectedCourses.has(course.course_key);
        check.addEventListener("change", () => {
            if (check.checked) {
                autoScheduleState.selectedCourses.add(course.course_key);
            } else {
                autoScheduleState.selectedCourses.delete(course.course_key);
            }
        });

        row.appendChild(left);
        row.appendChild(check);
        root.appendChild(row);
    });
}

/**
 * Obtiene los días seleccionados para el generador automático.
 */
function getAutoSelectedDays() {
    return days.filter((day) => {
        const input = document.getElementById(`autoDay-${day}`);
        return input ? input.checked : false;
    });
}

/**
 * Carga el catálogo de cursos para el modo automático.
 */
async function loadCourses() {
    const data = await api(`/api/courses?session_id=${encodeURIComponent(sessionId)}`);
    state.courses = data.items || [];
    renderAutoCourses();
}

/**
 * Solicita un horario automático al backend.
 */
async function runAutoSchedule() {
    const selectedKeys = Array.from(autoScheduleState.selectedCourses.values());
    const statusEl = qs("autoStatus");
    if (!selectedKeys.length) {
        if (statusEl) statusEl.textContent = "Selecciona al menos un curso";
        return;
    }
    const payload = {
        course_keys: selectedKeys,
        allowed_days: getAutoSelectedDays(),
        target_credits: 12,
        allow_less: qs("autoAllowLess")?.checked ?? true,
    };
    if (statusEl) statusEl.textContent = "Generando...";
    const data = await api(`/api/schedule/auto?session_id=${encodeURIComponent(sessionId)}`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
    autoScheduleState.result = data;

    const listA = qs("autoListA");
    const listB = qs("autoListB");
    const creditsA = qs("autoCreditsA");
    const creditsB = qs("autoCreditsB");
    if (listA) listA.innerHTML = "";
    if (listB) listB.innerHTML = "";

    const bloqueA = data.bloque_a?.courses || [];
    const bloqueB = data.bloque_b?.courses || [];
    const creditAValue = data.bloque_a?.credits ?? 0;
    const creditBValue = data.bloque_b?.credits ?? 0;

    bloqueA.forEach((course) => {
        const li = document.createElement("li");
        li.textContent = `${course.name} (NRC ${course.nrc})`;
        listA?.appendChild(li);
    });
    bloqueB.forEach((course) => {
        const li = document.createElement("li");
        li.textContent = `${course.name} (NRC ${course.nrc})`;
        listB?.appendChild(li);
    });

    if (creditsA) creditsA.textContent = `${creditAValue} créditos`;
    if (creditsB) creditsB.textContent = `${creditBValue} créditos`;

    const applyBtn = qs("autoApplyBtn");
    if (applyBtn) applyBtn.disabled = !bloqueA.length && !bloqueB.length;
    if (statusEl) {
        statusEl.textContent = bloqueA.length || bloqueB.length ? "Horario encontrado" : "No se encontró horario";
    }
}

/**
 * Aplica el horario generado a los calendarios.
 */
function applyAutoSchedule() {
    const data = autoScheduleState.result;
    if (!data) return;
    renderCalendar("calendarA", data.bloque_a?.courses || []);
    renderCalendar("calendarB", data.bloque_b?.courses || []);

    const saveBtn = qs("autoSaveBtn");
    const exportBtn = qs("autoExportBtn");
    if (saveBtn) saveBtn.disabled = false;
    if (exportBtn) exportBtn.disabled = false;
}

/**
 * Guarda el horario generado en la sesión actual.
 */
async function saveAutoSchedule() {
    const data = autoScheduleState.result;
    if (!data) return;
    const payload = {
        session_id: sessionId,
        name: qs("autoScheduleName")?.value.trim() || undefined,
        selections_a: data.bloque_a?.selections || [],
        selections_b: data.bloque_b?.selections || [],
    };
    if (!payload.selections_a.length && !payload.selections_b.length) {
        qs("autoSaveMsg").textContent = "Genera un horario antes de guardar.";
        return;
    }
    const saved = await api("/api/schedule/save", {
        method: "POST",
        body: JSON.stringify(payload),
    });
    qs("autoSaveMsg").textContent = `Horario guardado: ${saved.item?.name || "ok"}`;
}

/**
 * Solicita al backend la exportación del horario automático en PDF.
 */
async function exportAutoPdf() {
    const data = autoScheduleState.result;
    if (!data) return;
    const payload = {
        selections_a: data.bloque_a?.selections || [],
        selections_b: data.bloque_b?.selections || [],
    };
    const res = await fetch(`/api/schedule/export/pdf?session_id=${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(`${res.status}: ${detail}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "horario.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

qs("autoGenerateBtn")?.addEventListener("click", () => runAutoSchedule().catch((e) => (qs("autoStatus").textContent = userMessage(e))));
qs("autoApplyBtn")?.addEventListener("click", () => applyAutoSchedule());
qs("autoSearch")?.addEventListener("input", (e) => renderAutoCourses(e.target.value));
qs("autoSaveBtn")?.addEventListener("click", () => saveAutoSchedule().catch((e) => (qs("autoSaveMsg").textContent = userMessage(e))));
qs("autoExportBtn")?.addEventListener("click", () => exportAutoPdf().catch((e) => (qs("autoSaveMsg").textContent = userMessage(e))));

renderAutoDays();
loadCourses().catch((e) => (qs("autoStatus").textContent = userMessage(e)));
