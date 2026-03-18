const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const state = {
    courses: [],
    sectionsCache: new Map(),
    courseControls: new Map(),
    selectionsA: new Map(),
    selectionsB: new Map(),
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
* Habilita o deshabilita botones por id.
*/
function setButtonsDisabled(ids, disabled) {
    ids.forEach((id) => {
        const el = qs(id);
        if (el) el.disabled = disabled;
    });
}

/**
* Genera un color por curso.
*/


function courseColor(courseKey) {
    let hash = 0;
    for (let i = 0; i < courseKey.length; i += 1) hash = courseKey.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 78% 88%)`;
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
* Determina si dos rangos de tiempo se superponen.
*/
function hasOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

/**
* Valida conflictos de horario entre dos secciones.
*/
function sectionsConflict(sectionA, sectionB) {
    const horariosA = sectionA?.horarios || [];
    const horariosB = sectionB?.horarios || [];

    for (const a of horariosA) {
        const dayA = normalizeDay(a.dia);
        const aStart = parseTimeToMinutes(a.inicio);
        const aEnd = parseTimeToMinutes(a.fin);
        if (!dayA || Number.isNaN(aStart) || Number.isNaN(aEnd) || aEnd <= aStart) continue;

        for (const b of horariosB) {
            const dayB = normalizeDay(b.dia);
            const bStart = parseTimeToMinutes(b.inicio);
            const bEnd = parseTimeToMinutes(b.fin);
            if (!dayB || Number.isNaN(bStart) || Number.isNaN(bEnd) || bEnd <= bStart) continue;

            if (dayA === dayB && hasOverlap(aStart, aEnd, bStart, bEnd)) return true;
        }
    }
    return false;
}

/**
* Devuelve el mapa de selección para un bloque.
*/
function getSelectionMap(block) {
    return block === "A" ? state.selectionsA : state.selectionsB;
}

/**
* Bloquea opciones NRC que chocan con la selección actual.
*/
function refreshBlockAvailability(block) {
    const selectionMap = getSelectionMap(block);
    const selected = Array.from(selectionMap.values());

    state.courses.forEach((course) => {
        const controls = state.courseControls.get(course.course_key);
        const control = controls?.[block];
        if (!control) return;

        const { radio, select } = control;
        if (!radio.checked || select.disabled) return;

        const cacheKey = `${course.course_key}|${block}`;
        const sections = state.sectionsCache.get(cacheKey) || [];
        const currentSelected = selectionMap.get(course.course_key);
        const otherSelections = selected.filter((item) => item.course_key !== course.course_key);

        Array.from(select.options).forEach((option) => {
            if (!option.value) {
                option.disabled = false;
                return;
            }

            if (currentSelected && option.value === currentSelected.nrc) {
                option.disabled = false;
                return;
            }

            const candidate = sections.find((sec) => sec.nrc === option.value);
            if (!candidate) {
                option.disabled = false;
                return;
            }

            const conflict = otherSelections.some((other) => sectionsConflict(candidate, other.section));
            option.disabled = conflict;
        });

        if (select.value) {
            const activeOption = select.options[select.selectedIndex];
            if (activeOption && activeOption.disabled) {
                select.value = "";
                selectionMap.delete(course.course_key);
            }
        }
    });
}

/**
* Recalcula disponibilidad para ambos bloques.
*/
function refreshAllAvailability() {
    refreshBlockAvailability("A");
    refreshBlockAvailability("B");
}


/**
* Limpia selecciones y reinicia los controles de cursos.
*/
function resetSelections() {
    state.selectionsA.clear();
    state.selectionsB.clear();
    state.courseControls.forEach((controls) => {
        ["A", "B"].forEach((block) => {
            const control = controls?.[block];
            if (!control) return;
            control.radio.checked = false;
            control.select.value = "";
            control.select.disabled = true;
        });
    });
}

/**
* Aplica selecciones guardadas al UI y precarga secciones.
*/
async function applySelections(items, block) {
    const selectionMap = getSelectionMap(block);
    for (const sel of items) {
        const controls = state.courseControls.get(sel.course_key);
        const control = controls?.[block];
        if (!control) continue;

        const other = block === "A" ? "B" : "A";
        if (controls[other]) {
            controls[other].radio.checked = false;
            controls[other].select.value = "";
            controls[other].select.disabled = true;
        }

        control.radio.checked = true;
        control.select.disabled = false;
        await populateSelect(control.select, sel.course_key, block);
        control.select.value = sel.nrc;

        const sections = state.sectionsCache.get(`${sel.course_key}|${block}`) || [];
        const chosen = sections.find((sec) => sec.nrc === sel.nrc);
        if (chosen) {
            selectionMap.set(sel.course_key, { ...sel, section: chosen });
        }
    }
}

/**
* Carga horarios guardados de la sesión actual.
*/
async function refreshSavedSchedules() {
    const select = qs("savedSchedules");
    if (!select) return;
    const data = await api(`/api/schedule/saved?session_id=${encodeURIComponent(sessionId)}`);
    const items = data.items || [];
    select.innerHTML = "";
    if (!items.length) {
        const op = document.createElement("option");
        op.value = "";
        op.textContent = "Sin horarios guardados";
        select.appendChild(op);
        return;
    }
    items.forEach((item) => {
        const op = document.createElement("option");
        op.value = item.id;
        op.textContent = `${item.name} (${item.created_at})`;
        select.appendChild(op);
    });
}

/**
* Guarda las selecciones actuales en el backend.
*/
async function saveSchedule() {
    const payload = {
        session_id: sessionId,
        name: qs("scheduleName").value.trim() || undefined,
        selections_a: Array.from(state.selectionsA.values()).map(({ section, ...rest }) => rest),
        selections_b: Array.from(state.selectionsB.values()).map(({ section, ...rest }) => rest),
    };
    if (!payload.selections_a.length && !payload.selections_b.length) {
        qs("saveMsg").textContent = "Selecciona al menos un curso antes de guardar.";
        return;
    }
    const data = await api("/api/schedule/save", {
        method: "POST",
        body: JSON.stringify(payload),
    });
    qs("saveMsg").textContent = `Horario guardado: ${data.item?.name || "ok"}`;
    await refreshSavedSchedules();
}

/**
* Carga un horario guardado en el UI.
*/
async function loadSchedule() {
    const select = qs("savedSchedules");
    const id = select?.value;
    if (!id) return;
    const data = await api(`/api/schedule/saved/${encodeURIComponent(id)}?session_id=${encodeURIComponent(sessionId)}`);
    const item = data.item;
    if (!item) return;
    resetSelections();
    await applySelections(item.selections_a || [], "A");
    await applySelections(item.selections_b || [], "B");
    refreshAllAvailability();
    await runBuild();
    qs("saveMsg").textContent = `Horario cargado: ${item.name}`;
}

/**
* Solicita al backend la exportación del horario en PDF.
*/
async function exportPdf() {
    const payload = {
        selections_a: Array.from(state.selectionsA.values()).map(({ section, ...rest }) => rest),
        selections_b: Array.from(state.selectionsB.values()).map(({ section, ...rest }) => rest),
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
/**
* Obtiene secciones de un curso y las cachea por bloque.
*/
async function getSections(courseKey, block) {
    const cacheKey = `${courseKey}|${block}`;
    if (state.sectionsCache.has(cacheKey)) return state.sectionsCache.get(cacheKey);

    const data = await api(`/api/courses/${encodeURIComponent(courseKey)}/sections?block=${block}&session_id=${encodeURIComponent(sessionId)}`);
    state.sectionsCache.set(cacheKey, data.items || []);
    return data.items || [];
}

/**
* Llena el selector de NRC para curso y bloque.
*/
async function populateSelect(select, courseKey, block) {
    const sections = await getSections(courseKey, block);
    select.innerHTML = `<option value="">Seleccionar NRC</option>`;
    sections.forEach((sec) => {
        const op = document.createElement("option");
        op.value = sec.nrc;
        op.textContent = `${sec.nrc} - ${sec.teacher || "Sin docente"}`;
        select.appendChild(op);
    });
}

/**
* Construye los controles de selección A/B por curso.
*/
function buildSelectionCell(course, block, controls) {
    const wrapper = document.createElement("div");
    wrapper.className = "selection-cell";

    const blocks = course.available_blocks || [];
    if (!blocks.includes(block)) {
        wrapper.textContent = "-";
        return wrapper;
    }

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `course-mode-${course.course_key}`;
    radio.value = block;

    const select = document.createElement("select");
    select.disabled = true;
    select.innerHTML = `<option value="">Seleccionar NRC</option>`;

    controls[block] = { radio, select };

    radio.addEventListener("change", async () => {
        if (!radio.checked) return;

        const other = block === "A" ? "B" : "A";
        const otherSelectionMap = getSelectionMap(other);
        const thisSelectionMap = getSelectionMap(block);

        otherSelectionMap.delete(course.course_key);
        thisSelectionMap.delete(course.course_key);

        if (controls[other]?.select) {
            controls[other].select.value = "";
            controls[other].select.disabled = true;
        }

        controls[block].select.disabled = false;
        await populateSelect(select, course.course_key, block);
        refreshAllAvailability();
    });

    select.addEventListener("change", () => {
        const selectionMap = getSelectionMap(block);
        const value = select.value;

        if (!value) {
            selectionMap.delete(course.course_key);
            refreshBlockAvailability(block);
            return;
        }

        const sections = state.sectionsCache.get(`${course.course_key}|${block}`) || [];
        const chosen = sections.find((sec) => sec.nrc === value);
        if (!chosen) {
            selectionMap.delete(course.course_key);
            refreshBlockAvailability(block);
            return;
        }

        const payload = { course_key: course.course_key, nrc: value, block, section: chosen };
        selectionMap.set(course.course_key, payload);
        refreshBlockAvailability(block);
    });

    wrapper.appendChild(radio);
    wrapper.appendChild(select);
    return wrapper;
}

/**
* Renderiza la lista de cursos con controles de selección.
*/
function renderCourses() {
    const root = qs("coursesContainer");
    root.innerHTML = "";
    state.courseControls.clear();

    const header = document.createElement("div");
    header.className = "course-row course-header";
    header.innerHTML = `
    <div>CURSOS DISPONIBLES</div>
    <div>BLOQUE A</div>
    <div>BLOQUE B</div>
    `;
    root.appendChild(header);

    state.courses.forEach((course) => {
        const controls = {};
        state.courseControls.set(course.course_key, controls);

        const row = document.createElement("div");
        row.className = "course-row";

        const title = document.createElement("div");
        title.className = "course-title";
        title.textContent = `${course.name} (${course.course_key})`;

        row.appendChild(title);
        row.appendChild(buildSelectionCell(course, "A", controls));
        row.appendChild(buildSelectionCell(course, "B", controls));

        root.appendChild(row);
    });
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
        const bg = colors[course.course_key || course.name] || courseColor(course.course_key || course.name || "curso");
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
* Carga el catálogo de cursos e inicializa el estado del UI.
*/
async function loadCourses() {
    setButtonsDisabled(["reloadBtn", "buildBtn"], true);
    qs("buildMsg").textContent = "Cargando cursos...";
    try {
        const data = await api(`/api/courses?session_id=${encodeURIComponent(sessionId)}`);
        state.courses = data.items || [];
        state.sectionsCache.clear();
        state.selectionsA.clear();
        state.selectionsB.clear();
        renderCourses();
        qs("buildMsg").textContent = `Cursos cargados: ${state.courses.length}`;
    } finally {
        setButtonsDisabled(["reloadBtn", "buildBtn"], false);
    }
}

/**
* Construye el horario con las selecciones actuales.
*/
async function runBuild() {
    const payload = {
        selections_a: Array.from(state.selectionsA.values()).map(({ section, ...rest }) => rest),
        selections_b: Array.from(state.selectionsB.values()).map(({ section, ...rest }) => rest),
    };
    const data = await api(`/api/schedule/build?session_id=${encodeURIComponent(sessionId)}`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
    renderCalendar("calendarA", data.bloque_a.courses || []);
    renderCalendar("calendarB", data.bloque_b.courses || []);

    const conflicts = [
        ...(data.bloque_a.conflicts || []).map((c) => `A: ${c.course_a.name} vs ${c.course_b.name} (${c.kind})`),
        ...(data.bloque_b.conflicts || []).map((c) => `B: ${c.course_a.name} vs ${c.course_b.name} (${c.kind})`),
    ];
    qs("conflictsOut").textContent = conflicts.length ? conflicts.join("\n") : "Sin conflictos";
    qs("buildMsg").textContent = "Horario generado";
}

/**
* Dispara el scraping para actualizar cursos usando cookie.
*/
async function runScrape() {
    const cookie = qs("cookieInput").value.trim();
    const term = qs("termInput").value.trim() || "202610";
    if (!cookie) {
        qs("scrapeMsg").textContent = "Ingresa una cookie vÃ¡lida.";
        return;
    }
    qs("scrapeMsg").textContent = "Actualizando cursos...";
    const data = await api("/api/scrape/recommended", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, cookie, term }),
    });
    qs("scrapeMsg").textContent = `Cursos actualizados: ${data.saved_records} (API cursos: ${data.courses_found})`;
    await loadCourses();
}

qs("reloadBtn").addEventListener("click", () => loadCourses().catch((e) => (qs("buildMsg").textContent = userMessage(e))));
qs("buildBtn").addEventListener("click", () => runBuild().catch((e) => (qs("buildMsg").textContent = userMessage(e))));
qs("scrapeBtn").addEventListener("click", () => runScrape().catch((e) => (qs("scrapeMsg").textContent = userMessage(e))));
qs("saveScheduleBtn")?.addEventListener("click", () => saveSchedule().catch((e) => (qs("saveMsg").textContent = userMessage(e))));
qs("loadScheduleBtn")?.addEventListener("click", () => loadSchedule().catch((e) => (qs("saveMsg").textContent = userMessage(e))));
qs("exportPdfBtn")?.addEventListener("click", () => exportPdf().catch((e) => (qs("saveMsg").textContent = userMessage(e))));
qs("autoGenerateBtn")?.addEventListener("click", () => runAutoSchedule().catch((e) => (qs("autoStatus").textContent = userMessage(e))));
qs("autoApplyBtn")?.addEventListener("click", () => applyAutoSchedule().catch((e) => (qs("autoStatus").textContent = userMessage(e))));
qs("autoSearch")?.addEventListener("input", (e) => renderAutoCourses(e.target.value));

loadCourses().then(() => { refreshSavedSchedules(); renderAutoDays(); renderAutoCourses(); }).catch((e) => (qs("buildMsg").textContent = userMessage(e)));

fetch('/api/metrics/visit').catch(() => {});

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
* Aplica un horario automático al UI manual.
*/
async function applyAutoSchedule() {
    const data = autoScheduleState.result;
    if (!data) return;
    resetSelections();
    await applySelections(data.bloque_a?.selections || [], "A");
    await applySelections(data.bloque_b?.selections || [], "B");
    refreshAllAvailability();
    await runBuild();
}
