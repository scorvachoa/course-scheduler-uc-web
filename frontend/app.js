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

const autoWizardState = {
    currentStep: 1,
};

const wizardState = {
    currentStep: 1,
    coursesLoaded: false,
    selectionsMade: false,
    scheduleBuilt: false,
};

const qs = (id) => document.getElementById(id);

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

function loadStoredCookie() {
    const saved = localStorage.getItem("cs_cookie");
    if (saved) {
        const el = qs("cookieInputModal");
        if (el) el.value = saved;
    }
}

function saveCookieToStorage(cookie) {
    if (cookie) localStorage.setItem("cs_cookie", cookie);
}
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
 * Oculta los skeleton loaders.
 */
function hideSkeleton(parentId) {
    const parent = qs(parentId);
    if (parent) {
        const skels = parent.querySelectorAll(".skeleton-list");
        skels.forEach((el) => el.remove());
    }
}

/**
 * Navega el wizard a un paso específico.
 */
function showWizardStep(step) {
    wizardState.currentStep = step;
    document.querySelectorAll(".wizard-panel").forEach((el) => {
        el.classList.toggle("d-none", parseInt(el.dataset.wizard) !== step);
    });
    document.querySelectorAll(".stepper-step").forEach((el) => {
        const s = parseInt(el.dataset.wizard);
        el.classList.toggle("active", s === step);
        const badge = el.querySelector(".stepper-badge");
        if (badge) {
            badge.className = "stepper-badge";
            if (s < step) {
                badge.classList.add("bg-success");
                badge.innerHTML = "✓";
            } else if (s === step) {
                badge.classList.add("bg-primary");
                badge.innerHTML = badge.dataset.badge || s;
            } else {
                badge.classList.add("bg-secondary");
                badge.innerHTML = badge.dataset.badge || s;
            }
        }
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Muestra un toast en la pestaña automático.
 */
function showAutoToast(message, type) {
    const toastEl = qs("autoToast");
    const body = qs("autoToastBody");
    if (!toastEl || !body) return;
    body.textContent = message;
    toastEl.className = "toast align-items-center border-0";
    if (type === "danger") toastEl.classList.add("bg-danger", "text-white");
    else if (type === "warning") toastEl.classList.add("bg-warning", "text-dark");
    else if (type === "success") toastEl.classList.add("bg-success", "text-white");
    else toastEl.classList.add("bg-dark", "text-white");
    const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 4000 });
    toast.show();
}

/**
 * Muestra un toast en la pestaña Planificador.
 */
function showWizardToast(message, type) {
    const toastEl = qs("wizardToast");
    const body = qs("wizardToastBody");
    if (!toastEl || !body) return;
    body.textContent = message;
    toastEl.className = "toast align-items-center border-0";
    if (type === "danger") toastEl.classList.add("bg-danger", "text-white");
    else if (type === "warning") toastEl.classList.add("bg-warning", "text-dark");
    else if (type === "success") toastEl.classList.add("bg-success", "text-white");
    else toastEl.classList.add("bg-dark", "text-white");
    const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 4000 });
    toast.show();
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


function isDarkTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark";
}

function courseColor(courseKey) {
    let hash = 0;
    for (let i = 0; i < courseKey.length; i += 1) hash = courseKey.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
}

/**
* Normaliza nombres de días a etiquetas estándar en español.
*/
function fixEncoding(text) {
    try {
        return new TextDecoder("utf-8").decode(new TextEncoder().encode(text));
    } catch {
        return text;
    }
}

function normalizeDay(dayText = "") {
    const value = fixEncoding(String(dayText))
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
* Determina si dos rangos de tiempo se superponen, con tolerancia de 1 min.
*/
const OVERLAP_TOLERANCE = 1;
function hasOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart + OVERLAP_TOLERANCE < bEnd && bStart + OVERLAP_TOLERANCE < aEnd;
}

/**
* Encuentra TODOS los pares de horarios (día + hora) que se superponen
* entre dos secciones. Soporta cursos con varios días y diferentes horas.
* Devuelve array de {day, aStart, aEnd, bStart, bEnd, aMod, bMod}.
*/
function findOverlaps(sectionA, sectionB) {
    const horariosA = sectionA?.horarios || [];
    const horariosB = sectionB?.horarios || [];
    const overlaps = [];

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

            if (dayA === dayB && hasOverlap(aStart, aEnd, bStart, bEnd)) {
                overlaps.push({
                    day: dayA,
                    aStart,
                    aEnd,
                    bStart,
                    bEnd,
                    aMod: a.modalidad,
                    bMod: b.modalidad,
                });
            }
        }
    }
    return overlaps;
}

/**
* Indica si una sección entra en conflicto con otra (para bloquear NRC).
*/
function sectionsConflict(sectionA, sectionB) {
    return findOverlaps(sectionA, sectionB).length > 0;
}

/**
 * Devuelve los conflictos entre las secciones seleccionadas de un bloque,
 * incluyendo el/los día(s) y horario(s) exactos que chocan.
 */
function getBlockConflicts(selectionMap) {
    const items = Array.from(selectionMap.values());
    const conflicts = [];
    for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
            const a = items[i];
            const b = items[j];
            const overlaps = findOverlaps(a?.section, b?.section);
            if (overlaps.length) {
                conflicts.push({ a, b, overlaps });
            }
        }
    }
    return conflicts;
}

/**
 * Renderiza los conflictos en el contenedor indicado.
 * Soporta dos formas:
 *  - live (paso 2): {a,b,overlaps} con secciones que tienen horarios
 *  - backend (paso 3): {a,b,overlaps:[{day,start,end,modality, schedule_a, schedule_b}]}
 */
function renderConflicts(containerId, conflicts, withSchedule = false) {
    const container = qs(containerId);
    if (!container) return;
    if (!conflicts.length) {
        container.innerHTML = `<div class="alert alert-success align-items-center gap-2 py-2 px-3 mb-3 d-flex" role="alert">
            <span><i class="bi bi-check-circle-fill text-success"></i></span>
            <span class="flex-grow-1">Sin conflictos de horario.</span>
        </div>`;
        return;
    }
    const blockTag = (block) => `<span class="badge ${(block || "") === "A" ? "bg-primary" : "bg-warning text-dark"}">${block || "?"}</span>`;
    const fmtTime = (m) => formatMinutes(m);

    const rows = conflicts.map(({ a, b, overlaps }) => {
        const aName = a.section?.name || a.name || a.course_key;
        const bName = b.section?.name || b.name || b.course_key;
        const aBlock = a.section?.block || a.block;
        const bBlock = b.section?.block || b.block;

        const timeRows = (overlaps || []).map((o) => {
            if (o.schedule_a) {
                const sA = o.schedule_a;
                const sB = o.schedule_b;
                const day = sA?.day || sB?.day || "Día";
                const tA = `${sA?.start}–${sA?.end}${sA?.modality ? ` (${sA.modality})` : ""}`;
                const tB = `${sB?.start}–${sB?.end}${sB?.modality ? ` (${sB.modality})` : ""}`;
                return `<div class="small ms-4 mt-1"><span class="conf-day">${day}:</span> ${tA} · ${tB}</div>`;
            }
            const day = o.day || "Día";
            const tA = `${fmtTime(o.aStart)}–${fmtTime(o.aEnd)}${o.aMod ? ` (${o.aMod})` : ""}`;
            const tB = `${fmtTime(o.bStart)}–${fmtTime(o.bEnd)}${o.bMod ? ` (${o.bMod})` : ""}`;
            return `<div class="small ms-4 mt-1"><span class="conf-day">${day}:</span> ${tA} · ${tB}</div>`;
        }).join("");

        return `
        <li class="py-2 border-bottom">
            <div class="d-flex flex-wrap align-items-center gap-2">
                ${blockTag(aBlock)}
                <strong>${aName != null ? aName : ""}</strong>
                <span class="text-muted">NRC ${a.nrc ?? a.section?.nrc ?? ""}</span>
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
                ${blockTag(bBlock)}
                <strong>${bName != null ? bName : ""}</strong>
                <span class="text-muted">NRC ${b.nrc ?? b.section?.nrc ?? ""}</span>
            </div>
            ${timeRows}
        </li>
        `;
    }).join("");

    container.innerHTML = `
        <div class="alert alert-danger py-2 px-3 mb-3" role="alert">
            <div class="d-flex align-items-center gap-2 mb-1">
                <span>⛔</span>
                <strong class="flex-grow-1">Conflictos de horario (${conflicts.length})</strong>
            </div>
            <ul class="list-unstyled mb-0" style="font-size:0.85rem;">
                ${rows}
            </ul>
        </div>`;
}

/**
 * Detecta conflictos en tiempo real en el paso 2.
 */
function renderStep2Conflicts() {
    const conflicts = [...getBlockConflicts(state.selectionsA), ...getBlockConflicts(state.selectionsB)];
    renderConflicts("step2Conflicts", conflicts);
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
function isSelectInactive(select) {
    return select.classList.contains("select-inactive");
}

function setSelectInactive(select, inactive) {
    select.classList.toggle("select-inactive", inactive);
}

function refreshBlockAvailability(block) {
    const selectionMap = getSelectionMap(block);
    const selected = Array.from(selectionMap.values());

    state.courses.forEach((course) => {
        const controls = state.courseControls.get(course.course_key);
        const control = controls?.[block];
        if (!control) return;

        const { radio, select } = control;
        if (!radio.checked || isSelectInactive(select)) return;

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
 * Renderiza la vista previa del horario en vivo en el paso 2.
 * Usa las secciones seleccionadas sin llamar al backend.
 */
function renderLivePreview() {
    const toCourses = (selectionMap) => Array.from(selectionMap.values())
        .map((sel) => sel?.section)
        .filter(Boolean)
        .map((sec) => ({
            course_key: sec.course_key || sec.name,
            name: sec.name,
            nrc: sec.nrc,
            teacher: sec.teacher || "",
            horarios: sec.horarios || [],
        }));
    renderCalendar("calendarPreviewA", toCourses(state.selectionsA));
    renderCalendar("calendarPreviewB", toCourses(state.selectionsB));
    renderStep2Conflicts();
}

/**
 * Actualiza el resumen de créditos en el paso 2.
 */
function updateCreditSummary() {
    const elA = qs("creditSummaryA");
    const elB = qs("creditSummaryB");
    const elTotal = qs("creditSummaryTotal");
    if (!elA) return;
    const catalogMap = {};
    state.courses.forEach((c) => { catalogMap[c.course_key] = c.credits || 0; });
    let creditsA = 0, creditsB = 0;
    state.selectionsA.forEach((sel) => {
        creditsA += catalogMap[sel.course_key] || 0;
    });
    state.selectionsB.forEach((sel) => {
        creditsB += catalogMap[sel.course_key] || 0;
    });
    elA.textContent = creditsA;
    elB.textContent = creditsB;
    elTotal.textContent = creditsA + creditsB;

    const progressEl = qs("selectionProgress");
    if (progressEl) {
        let sel = 0;
        state.courseControls.forEach((controls, key) => {
            const hasSel = state.selectionsA.has(key) || state.selectionsB.has(key);
            if (hasSel) sel += 1;
            if (controls._row) controls._row.classList.toggle("course-row--selected", hasSel);
        });
        const total = state.courseControls.size;
        progressEl.textContent = `${sel} de ${total}`;
        progressEl.classList.toggle("text-success", sel >= total && total > 0);
        progressEl.classList.toggle("text-danger", sel > 0 && sel < total);
    }

    const buildBtn = qs("buildBtn");
    if (buildBtn) buildBtn.disabled = creditsA === 0 && creditsB === 0;
    renderLivePreview();
}

/**
 * Limpia selecciones y reinicia los controles de cursos.
 */
function resetSelections() {
    state.selectionsA.clear();
    state.selectionsB.clear();
    updateCreditSummary();
    state.courseControls.forEach((controls) => {
        ["A", "B"].forEach((block) => {
            const control = controls?.[block];
            if (!control) return;
            control.radio.checked = false;
            control.select.value = "";
            setSelectInactive(control.select, true);
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
            setSelectInactive(controls[other].select, true);
        }

        control.radio.checked = true;
        setSelectInactive(control.select, false);
        await populateSelect(control.select, sel.course_key, block);
        control.select.value = sel.nrc;

        const sections = state.sectionsCache.get(`${sel.course_key}|${block}`) || [];
        const chosen = sections.find((sec) => sec.nrc === sel.nrc);
        if (chosen) {
            selectionMap.set(sel.course_key, { ...sel, section: chosen });
        }
    }
    renderLivePreview();
}

/**
* Carga horarios guardados de la sesión actual.
*/
async function refreshSavedSchedules() {
    const data = await api(`/api/schedule/saved?session_id=${encodeURIComponent(sessionId)}`);
    const items = data.items || [];
    const section = qs("savedSchedulesSection");
    if (section) {
        section.classList.toggle("d-none", items.length === 0);
    }
    ["savedSchedules", "savedSchedulesStep1"].forEach((selectId) => {
        const select = qs(selectId);
        if (!select) return;
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
    });
    return items;
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
 * Carga un horario guardado desde el paso 1 y navega a selección.
 */
async function loadScheduleFromStep1() {
    const select = qs("savedSchedulesStep1");
    const id = select?.value;
    if (!id) {
        showWizardToast("Selecciona un horario guardado primero.", "warning");
        return;
    }
    const msgEl = qs("loadScheduleStep1Msg");
    if (msgEl) msgEl.textContent = "Cargando...";
    try {
        const data = await api(`/api/schedule/saved/${encodeURIComponent(id)}?session_id=${encodeURIComponent(sessionId)}`);
        const item = data.item;
        if (!item) throw new Error("Horario no encontrado");
        resetSelections();
        await applySelections(item.selections_a || [], "A");
        await applySelections(item.selections_b || [], "B");
        refreshAllAvailability();
        if (msgEl) msgEl.textContent = `Horario cargado: ${item.name}`;
        showWizardStep(2);
    } catch (e) {
        if (msgEl) msgEl.textContent = `Error: ${userMessage(e)}`;
    }
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
 * Exporta las selecciones actuales como archivo JSON.
 */
function exportJson() {
    const payload = {
        exported_at: new Date().toISOString(),
        session_id: sessionId,
        bloque_a: Array.from(state.selectionsA.values()).map(({ section, ...rest }) => rest),
        bloque_b: Array.from(state.selectionsB.values()).map(({ section, ...rest }) => rest),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "horario.json";
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
    setSelectInactive(select, true);
    select.innerHTML = `<option value="">Seleccionar NRC</option>`;

    controls[block] = { radio, select };

    async function activateBlock() {
        if (!radio.checked) {
            radio.checked = true;
            const other = block === "A" ? "B" : "A";
            getSelectionMap(other).delete(course.course_key);
            getSelectionMap(block).delete(course.course_key);

            if (controls[other]?.select) {
                controls[other].select.value = "";
                setSelectInactive(controls[other].select, true);
            }
        }

        const needPopulate = (isSelectInactive(select) || select.options.length <= 1) && !select.dataset.populating;
        setSelectInactive(select, false);
        if (needPopulate) {
            select.dataset.populating = "1";
            await populateSelect(select, course.course_key, block);
            delete select.dataset.populating;
        }
        refreshAllAvailability();
    }

    radio.addEventListener("change", async () => {
        if (!radio.checked) return;
        await activateBlock();
    });

    wrapper.addEventListener("click", async () => {
        if (isSelectInactive(select)) {
            await activateBlock();
        }
    });

    select.addEventListener("change", () => {
        const selectionMap = getSelectionMap(block);
        const value = select.value;

        if (!value) {
            selectionMap.delete(course.course_key);
            refreshBlockAvailability(block);
            updateCreditSummary();
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
        updateCreditSummary();
    });

    wrapper.appendChild(radio);
    wrapper.appendChild(select);
    return wrapper;
}

/**
* Renderiza la lista de cursos simple (solo info, sin selección) para el paso 1.
*/
function renderCourseListSimple() {
    const root = qs("coursesContainer");
    if (!root) return;
    root.innerHTML = "";
    root.className = "course-list";

    const header = document.createElement("div");
    header.className = "course-row course-header";
    header.style.gridTemplateColumns = "2fr 1fr 1fr";
    header.innerHTML = `<div>CURSO</div><div>CR</div><div>BLOQUES</div>`;
    root.appendChild(header);

    state.courses.forEach((course) => {
        const row = document.createElement("div");
        row.className = "course-row";
        row.style.gridTemplateColumns = "2fr 1fr 1fr";

        const name = document.createElement("div");
        name.className = "course-title";
        name.textContent = `${course.name} (${course.course_key})`;

        const credits = document.createElement("div");
        credits.className = "text-muted small";
        credits.textContent = `${course.credits || 0} cr`;

        const blocks = document.createElement("div");
        blocks.className = "text-muted small";
        blocks.textContent = (course.available_blocks || []).join(" / ") || "-";

        row.appendChild(name);
        row.appendChild(credits);
        row.appendChild(blocks);
        root.appendChild(row);
    });
}

/**
* Renderiza la lista de cursos con controles de selección A/B para el paso 2.
*/
function renderCourseListSelectable() {
    const root = qs("coursesContainer2");
    if (!root) return;
    root.innerHTML = "";
    root.className = "course-list";
    state.courseControls.clear();

    const header = document.createElement("div");
    header.className = "course-row course-header";
    header.innerHTML = `<div>CURSOS DISPONIBLES</div><div>BLOQUE A</div><div>BLOQUE B</div>`;
    root.appendChild(header);

    state.courses.forEach((course) => {
        const controls = {};
        state.courseControls.set(course.course_key, controls);
        const row = document.createElement("div");
        row.className = "course-row";
        controls._row = row;
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
* Versión legacy: renderiza en coursesContainer con controles (solo para compatibilidad).
*/
function renderCourses() {
    renderCourseListSimple();
    renderCourseListSelectable();
}

/**
 * Navega el wizard automático a un paso específico.
 */
function showAutoWizardStep(step) {
    autoWizardState.currentStep = step;
    document.querySelectorAll("#tab-auto .wizard-panel").forEach((el) => {
        el.classList.toggle("d-none", parseInt(el.dataset.autoWizard) !== step);
    });
    document.querySelectorAll("#tab-auto .stepper-step").forEach((el) => {
        const s = parseInt(el.dataset.autoWizard);
        el.classList.toggle("active", s === step);
        const badge = el.querySelector(".stepper-badge");
        if (badge) {
            badge.className = "stepper-badge";
            if (s < step) {
                badge.classList.add("bg-success");
                badge.innerHTML = "✓";
            } else if (s === step) {
                badge.classList.add("bg-primary");
                badge.innerHTML = badge.dataset.badge || s;
            } else {
                badge.classList.add("bg-secondary");
                badge.innerHTML = badge.dataset.badge || s;
            }
        }
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        const hue = colors[course.course_key || course.name] || courseColor(course.course_key || course.name || "curso");
        (course.horarios || []).forEach((h) => {
            const normalizedDay = normalizeDay(h.dia);
            if (!normalizedDay || !eventsByDay[normalizedDay]) return;

            const startMinutes = parseTimeToMinutes(h.inicio);
            const endMinutes = parseTimeToMinutes(h.fin);
            if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) return;

            const clampedStart = Math.max(startMinutes + OVERLAP_TOLERANCE, dayMin);
            const clampedEnd = Math.min(endMinutes - OVERLAP_TOLERANCE, dayMax);
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
                hue,
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
                <div class="course-block" style="--hue:${event.hue}">
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
    const cookie = qs("cookieInputModal")?.value.trim();
    if (cookie) saveCookieToStorage(cookie);
    try {
        const data = await api(`/api/courses?session_id=${encodeURIComponent(sessionId)}`);
        state.courses = data.items || [];
        state.sectionsCache.clear();
        state.selectionsA.clear();
        state.selectionsB.clear();
        wizardState.coursesLoaded = true;

            hideSkeleton("coursesContainer");
            renderCourseListSimple();
            renderCourseListSelectable();
            updateCreditSummary();
        const count = state.courses.length;
        qs("buildMsg").textContent = `Cursos cargados: ${count}`;
        syncWizardToStep2();
    } finally {
        setButtonsDisabled(["reloadBtn", "buildBtn"], false);
    }
}

function syncWizardToStep2() {
    const btn = qs("wizardToStep2");
    if (btn) btn.disabled = !state.courses.length;
}

/**
* Construye el horario con las selecciones actuales.
*/
async function runBuild() {
    const hasA = state.selectionsA.size > 0;
    const hasB = state.selectionsB.size > 0;

    if (hasA !== hasB) {
        const block = hasA ? "A" : "B";
        const modalEl = qs("modal-single-block");
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        qs("singleBlockText").textContent = `Solo seleccionaste cursos del bloque ${block}. Puedes continuar, pero tu horario solo incluirá un bloque.`;
        const proceed = await new Promise((resolve) => {
            qs("singleBlockAcceptBtn").onclick = () => { modal.hide(); resolve(true); };
            qs("singleBlockCancelBtn").onclick = () => { modal.hide(); resolve(false); };
            modal.show();
        });
        if (!proceed) return;
    }

    const payload = {
        selections_a: Array.from(state.selectionsA.values()).map(({ section, ...rest }) => rest),
        selections_b: Array.from(state.selectionsB.values()).map(({ section, ...rest }) => rest),
    };
    const data = await api(`/api/schedule/build?session_id=${encodeURIComponent(sessionId)}`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
    renderCalendar("calendarA", data.bloque_a?.courses || []);
    renderCalendar("calendarB", data.bloque_b?.courses || []);
    qs("buildMsg").textContent = "Horario generado";

    const coursesA = data.bloque_a?.courses?.length || 0;
    const coursesB = data.bloque_b?.courses?.length || 0;
    const crA = data.bloque_a?.courses?.reduce((s, c) => s + (c.credits || 0), 0) || 0;
    const crB = data.bloque_b?.courses?.reduce((s, c) => s + (c.credits || 0), 0) || 0;
    const totalCr = crA + crB;
    const totalCourses = coursesA + coursesB;

    const el = (id) => qs(id);
    if (el("summaryCoursesA")) el("summaryCoursesA").textContent = coursesA;
    if (el("summaryCreditsA")) el("summaryCreditsA").textContent = `${crA} créditos`;
    if (el("summaryCoursesB")) el("summaryCoursesB").textContent = coursesB;
    if (el("summaryCreditsB")) el("summaryCreditsB").textContent = `${crB} créditos`;
    if (el("summaryCoursesTotal")) el("summaryCoursesTotal").textContent = totalCourses;
    if (el("summaryCreditsTotal")) el("summaryCreditsTotal").textContent = `${totalCr} créditos`;

    if (el("exportCourses")) el("exportCourses").textContent = totalCourses;
    if (el("exportCredits")) el("exportCredits").textContent = totalCr;
    if (el("exportBlocks")) {
        const blocks = [];
        if (coursesA) blocks.push("A");
        if (coursesB) blocks.push("B");
        el("exportBlocks").textContent = blocks.join(" y ") || "-";
    }

    wizardState.scheduleBuilt = true;
    renderStep3Conflicts(data);
    showWizardStep(3);
}

/**
 * Renderiza los conflictos del backend en el paso 3.
 */
function renderStep3Conflicts(data) {
    const mapConflicts = (list, block) => (list || []).map((c) => ({
        a: {
            course_key: c.course_a?.name,
            nrc: c.course_a?.nrc,
            block: c.course_a?.block || block,
            name: c.course_a?.name,
        },
        b: {
            course_key: c.course_b?.name,
            nrc: c.course_b?.nrc,
            block: c.course_b?.block || block,
            name: c.course_b?.name,
        },
        overlaps: [{
            schedule_a: c.schedule_a,
            schedule_b: c.schedule_b,
        }],
    }));
    const conflicts = [
        ...mapConflicts(data.bloque_a?.conflicts, "A"),
        ...mapConflicts(data.bloque_b?.conflicts, "B"),
    ];
    renderConflicts("step3Conflicts", conflicts, true);
}

/**
 * Dispara el scraping desde el modal de cursos requeridos.
 */
async function scrapeFromModal() {
    await scrapeCourses({
        cookieId: "cookieInputModal",
        termId: "termInputModal",
        msgId: "scrapeModalMsg",
        progressId: "scrapeModalProgress",
    });
}

/**
 * Ejecuta el scraping y carga los cursos usando campos por id.
 */
async function scrapeCourses({ cookieId, termId, msgId, progressId }) {
    const cookie = qs(cookieId).value.trim();
    const term = qs(termId).value.trim() || "202610";
    const msgEl = qs(msgId);
    if (!cookie) {
        if (msgEl) msgEl.textContent = "Ingresa una cookie v\u00e1lida.";
        return;
    }
    const progress = qs(progressId);
    if (msgEl) msgEl.textContent = "Actualizando cursos...";
    if (progress) progress.classList.remove("d-none");
    try {
        const data = await api("/api/scrape/recommended", {
            method: "POST",
            body: JSON.stringify({ session_id: sessionId, cookie, term }),
        });
        if (msgEl) msgEl.textContent = `Cursos actualizados: ${data.saved_records} (API cursos: ${data.courses_found})`;
        await loadCourses();
        checkCoursesLoaded();
        const count = state.courses.length;
        showWizardToast(count ? `¡Listo! Se cargaron ${count} cursos.` : "¡Listo! Cursos cargados.", "success");
    } finally {
        if (progress) progress.classList.add("d-none");
    }
}

// ─── Existing event listeners ───
qs("reloadBtn")?.addEventListener("click", () => loadCourses().catch((e) => (qs("buildMsg").textContent = userMessage(e))));
qs("buildBtn")?.addEventListener("click", () => {
    const hasSelections = state.selectionsA.size > 0 || state.selectionsB.size > 0;
    if (!hasSelections) {
        showWizardToast("Selecciona al menos un NRC antes de construir el horario.", "warning");
        return;
    }
    runBuild().catch((e) => (qs("buildMsg").textContent = userMessage(e)));
});
qs("scrapeModalBtn")?.addEventListener("click", () => scrapeFromModal().catch((e) => (qs("scrapeModalMsg").textContent = userMessage(e))));
qs("tab-updatecookie-btn")?.addEventListener("click", () => openUpdateCookieModal());
qs("openCourseModalBtn")?.addEventListener("click", () => openCourseModal());
qs("goToPlanifierBtn")?.addEventListener("click", () => bootstrap.Tab.getOrCreateInstance(qs("tab-wizard-btn")).show());
qs("goToGuideBtn")?.addEventListener("click", () => bootstrap.Tab.getOrCreateInstance(qs("tab-guide-btn")).show());
qs("goToTeachersBtn")?.addEventListener("click", () => bootstrap.Tab.getOrCreateInstance(qs("tab-teachers-btn")).show());
qs("saveScheduleBtn")?.addEventListener("click", () => saveSchedule().catch((e) => (qs("saveMsg").textContent = userMessage(e))));
qs("loadScheduleBtn")?.addEventListener("click", () => loadSchedule().catch((e) => (qs("saveMsg").textContent = userMessage(e))));
qs("loadScheduleStep1Btn")?.addEventListener("click", () => loadScheduleFromStep1());
qs("exportPdfBtn")?.addEventListener("click", () => exportPdf().catch((e) => (qs("saveMsg").textContent = userMessage(e))));
qs("exportJsonBtn")?.addEventListener("click", () => exportJson());
qs("autoGenerateBtn")?.addEventListener("click", () => runAutoSchedule().catch((e) => (qs("autoStatus").textContent = userMessage(e))));
qs("autoSearch")?.addEventListener("input", (e) => renderAutoCourses(e.target.value));
qs("autoSaveBtn")?.addEventListener("click", () => saveAutoSchedule().catch((e) => (qs("autoSaveMsg").textContent = userMessage(e))));
qs("autoExportPdfBtn")?.addEventListener("click", () => exportAutoPdf().catch((e) => (qs("autoSaveMsg").textContent = userMessage(e))));
qs("autoExportJsonBtn")?.addEventListener("click", () => exportAutoJson());
qs("autoToStep3")?.addEventListener("click", () => autoRenderCalendars().catch((e) => (qs("autoStatus").textContent = userMessage(e))));
qs("autoToStep4")?.addEventListener("click", () => showAutoWizardStep(4));
document.querySelectorAll(".auto-wizard-back").forEach((btn) => {
    btn.addEventListener("click", () => {
        const target = parseInt(btn.dataset.autoTarget);
        if (target) showAutoWizardStep(target);
    });
});

// ─── Wizard event listeners ───
qs("wizardToStep2")?.addEventListener("click", () => {
    if (state.courses.length) showWizardStep(2);
    else showWizardToast("Primero carga los cursos desde el portal.", "warning");
});
qs("wizardToStep4")?.addEventListener("click", () => {
    if (wizardState.scheduleBuilt) showWizardStep(4);
    else showWizardToast("Primero construye el horario en el paso 3.", "warning");
});
document.querySelectorAll(".wizard-back").forEach((btn) => {
    btn.addEventListener("click", () => {
        const target = parseInt(btn.dataset.wizardTarget);
        if (target) showWizardStep(target);
    });
});
document.querySelectorAll(".stepper-step").forEach((el) => {
    el.addEventListener("click", () => {
        const step = parseInt(el.dataset.wizard);
        if (!step) return;
        if (step <= wizardState.currentStep) {
            showWizardStep(step);
        } else {
            const labels = { 1: "cargar cursos", 2: "seleccionar NRC", 3: "revisar el horario" };
            showWizardToast(`Completa primero el paso actual: ${labels[wizardState.currentStep] || "termina el paso actual"}.`, "warning");
        }
    });
});

// ─── Auto tab shown listener ───
qs("tab-auto-btn")?.addEventListener("shown.bs.tab", () => {
    showAutoWizardStep(autoWizardState.currentStep);
    renderAutoDays();
    renderAutoCourses();
});

// ─── Auto wizard stepper click listeners ───
document.querySelectorAll("#tab-auto .stepper-step").forEach((el) => {
    el.addEventListener("click", () => {
        const step = parseInt(el.dataset.autoWizard);
        if (!step) return;
        if (step <= autoWizardState.currentStep) {
            showAutoWizardStep(step);
        } else {
            const labels = { 1: "seleccionar cursos y generar", 2: "revisar el resultado", 3: "ver el calendario" };
            showAutoToast(`Completa primero el paso actual antes de continuar: ${labels[autoWizardState.currentStep] || "termina el paso actual"}.`, "warning");
        }
    });
});

// ─── Teacher event listeners ───
function normalizeForSearch(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

qs("teacherSearch")?.addEventListener("input", (e) => {
    const query = normalizeForSearch(e.target.value);
    if (!window._allTeachers) return;
    if (!query) {
        renderTeachers(window._allTeachers);
        qs("teacherCount").textContent = `${window._allTeachers.length} docente${window._allTeachers.length !== 1 ? "s" : ""}`;
        return;
    }
    const filtered = window._allTeachers.filter((t) => {
        const byTeacher = normalizeForSearch(t.name).includes(query);
        const byCourse = (t.courses || []).some((c) => normalizeForSearch(c.name).includes(query));
        return byTeacher || byCourse;
    });
    renderTeachers(filtered);
    qs("teacherCount").textContent = `${filtered.length} de ${window._allTeachers.length}`;
});

// ─── Modo oscuro ───
function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-bs-theme", theme);
    const btn = qs("themeToggleBtn");
    if (btn) btn.innerHTML = theme === "dark" ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
    try {
        localStorage.setItem("cs_theme", theme);
    } catch { /* noop */ }
}

(function initTheme() {
    let theme = "light";
    try {
        theme = localStorage.getItem("cs_theme") || "light";
    } catch { /* noop */ }
    applyTheme(theme);
})();

qs("themeToggleBtn")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
});

// ─── Initialization ───
loadStoredCookie();

function maybeShowDeviceAlert() {
    if (window.innerWidth >= 1024) return;
    if (sessionStorage.getItem("cs_device_alert")) return;
    sessionStorage.setItem("cs_device_alert", "1");
    const modalEl = qs("deviceAlertModal");
    if (modalEl && window.bootstrap) new bootstrap.Modal(modalEl).show();
}

(async function init() {
    try {
        const data = await api(`/api/courses?session_id=${encodeURIComponent(sessionId)}`);
        const count = data?.items?.length || 0;
        if (count > 0) {
            state.courses = data.items;
            state.sectionsCache.clear();
            state.selectionsA.clear();
            state.selectionsB.clear();

            hideSkeleton("coursesContainer");
            renderCourseListSimple();
            renderCourseListSelectable();

            qs("buildMsg").textContent = `Cursos cargados: ${count}`;

            showWizardStep(2);
        } else {
            showWizardStep(1);
        }
    } catch {
        showWizardStep(1);
    } finally {
        syncWizardToStep2();
    }

    refreshSavedSchedules();
    renderAutoDays();
    renderAutoCourses();
    loadTeachers();
    checkCoursesLoaded();
    fetch('/api/metrics/visit').catch(() => {});
    maybeShowDeviceAlert();
})();

/**
 * Si no hay cursos cargados, muestra un empty-state con botón para cargarlos.
 */
function checkCoursesLoaded() {
    const modalEl = qs("modal-required-courses");
    const emptyState = qs("coursesEmptyState");
    if (state.courses.length > 0) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
        if (emptyState) {
            emptyState.classList.add("d-none");
            emptyState.classList.remove("d-flex");
        }
    } else {
        if (emptyState) {
            emptyState.classList.remove("d-none");
            emptyState.classList.add("d-flex");
        }
        bootstrap.Modal.getInstance(modalEl)?.hide();
    }
}

/**
 * Abre el modal de carga de cookie (opcional, no bloquea).
 */
function openCourseModal() {
    const modalEl = qs("modal-required-courses");
    if (!modalEl) return;
    const closeBtn = qs("requiredCloseBtn");
    if (closeBtn) closeBtn.classList.remove("d-none");
    bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: true, keyboard: true }).show();
}

/**
 * Abre el modal de actualización de cookie desde el tab "Actualizar cookie".
 * Permite cerrarlo con el botón X.
 */
function openUpdateCookieModal() {
    const modalEl = qs("modal-required-courses");
    if (!modalEl) return;
    const closeBtn = qs("requiredCloseBtn");
    if (closeBtn) closeBtn.classList.remove("d-none");
    bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: true, keyboard: true }).show();
}

// Poblar dropdown de periodos
(function populateTermSelect() {
    const year = new Date().getFullYear();
    const defaultTerm = `${year}10`;
    ["termInputModal"].forEach((selectId) => {
        const select = qs(selectId);
        if (!select) return;
        select.innerHTML = "";
        [0, 10, 20].forEach((period) => {
            const value = `${year}${String(period).padStart(2, "0")}`;
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        select.value = defaultTerm;
    });
})();

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
        map[key] = hue;
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
    const query = normalizeForSearch(filterText);
    root.innerHTML = "";
    const items = state.courses || [];
    items.forEach((course) => {
        const name = `${course.name} (${course.course_key})`;
        if (query && !normalizeForSearch(name).includes(query)) return;

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

        row.appendChild(check);
        row.appendChild(left);
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
    if (!state.courses.length) {
        showAutoToast("Primero carga los cursos desde el Planificador.", "danger");
        return;
    }
    if (!selectedKeys.length) {
        showAutoToast("Selecciona al menos un curso de la lista.", "warning");
        if (statusEl) statusEl.textContent = "Selecciona al menos un curso";
        return;
    }
    const days = getAutoSelectedDays();
    if (!days.length) {
        showAutoToast("Selecciona al menos un día disponible.", "warning");
        if (statusEl) statusEl.textContent = "Selecciona al menos un día";
        return;
    }
    const payload = {
        course_keys: selectedKeys,
        allowed_days: days,
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
    const creditSummaryA = qs("autoCreditSummaryA");
    const creditSummaryB = qs("autoCreditSummaryB");
    const creditSummaryTotal = qs("autoCreditSummaryTotal");
    const coursesGenerated = qs("autoCoursesGenerated");
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

    if (creditSummaryA) creditSummaryA.textContent = creditAValue;
    if (creditSummaryB) creditSummaryB.textContent = creditBValue;
    if (creditSummaryTotal) creditSummaryTotal.textContent = creditAValue + creditBValue;
    if (coursesGenerated) coursesGenerated.textContent = bloqueA.length + bloqueB.length;

    const found = bloqueA.length || bloqueB.length;
    if (statusEl) {
        statusEl.textContent = found ? "Horario encontrado" : "No se encontró horario";
    }

    const summary = qs("autoResultSummary");
    const summaryText = qs("autoResultText");
    if (summary && summaryText) {
        if (found) {
            summary.classList.remove("d-none");
            summary.classList.add("d-flex");
            summaryText.textContent = `Bloque A: ${creditAValue} cr · Bloque B: ${creditBValue} cr · Total: ${creditAValue + creditBValue} cr`;
        } else {
            summary.classList.add("d-none");
            summary.classList.remove("d-flex");
        }
    }

    const toStep3 = qs("autoToStep3");
    if (toStep3) toStep3.disabled = !found;

    if (found) {
        showAutoWizardStep(2);
    } else {
        showAutoToast("No se encontró un horario con los cursos y días seleccionados. Intenta con más cursos o más días.", "danger");
    }
}

/**
 * Renderiza los calendarios del horario automático y pasa al paso 3.
 */
async function autoRenderCalendars() {
    const data = autoScheduleState.result;
    if (!data) return;

    renderCalendar("autoCalendarA", data.bloque_a?.courses || []);
    renderCalendar("autoCalendarB", data.bloque_b?.courses || []);

    const coursesA = data.bloque_a?.courses?.length || 0;
    const coursesB = data.bloque_b?.courses?.length || 0;
    const crA = data.bloque_a?.credits ?? 0;
    const crB = data.bloque_b?.credits ?? 0;
    const totalCr = crA + crB;

    const el = (id) => qs(id);
    if (el("autoSummaryCoursesA")) el("autoSummaryCoursesA").textContent = coursesA;
    if (el("autoSummaryCreditsA")) el("autoSummaryCreditsA").textContent = `${crA} créditos`;
    if (el("autoSummaryCoursesB")) el("autoSummaryCoursesB").textContent = coursesB;
    if (el("autoSummaryCreditsB")) el("autoSummaryCreditsB").textContent = `${crB} créditos`;
    if (el("autoSummaryCoursesTotal")) el("autoSummaryCoursesTotal").textContent = coursesA + coursesB;
    if (el("autoSummaryCreditsTotal")) el("autoSummaryCreditsTotal").textContent = `${totalCr} créditos`;

    if (el("autoExportCourses")) el("autoExportCourses").textContent = coursesA + coursesB;
    if (el("autoExportCredits")) el("autoExportCredits").textContent = totalCr;
    if (el("autoExportBlocks")) {
        const blocks = [];
        if (coursesA) blocks.push("A");
        if (coursesB) blocks.push("B");
        el("autoExportBlocks").textContent = blocks.join(" y ") || "-";
    }

    showAutoWizardStep(3);
}

// ─── Auto save / export ───

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

function exportAutoJson() {
    const data = autoScheduleState.result;
    if (!data) return;
    const payload = {
        exported_at: new Date().toISOString(),
        session_id: sessionId,
        bloque_a: (data.bloque_a?.selections || []).map((s) => ({ ...s })),
        bloque_b: (data.bloque_b?.selections || []).map((s) => ({ ...s })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "horario.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ─── Teachers ───

function teacherInitials(name) {
    return String(name || "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
}

function renderTeachers(teachers) {
    const root = qs("teachersContainer");
    if (!root) return;
    root.innerHTML = "";
    if (!teachers.length) {
        root.innerHTML = `<div class="alert alert-info d-flex align-items-center gap-2 mb-0" role="alert">
            <span><i class="bi bi-search text-secondary"></i></span>
            <span class="flex-grow-1">No se encontraron docentes. Ajusta tu búsqueda.</span>
        </div>`;
        return;
    }
    teachers.forEach((teacher) => {
        const card = document.createElement("div");
        card.className = "teacher-group";

        const header = document.createElement("div");
        header.className = "teacher-group-header";

        const avatar = document.createElement("div");
        avatar.className = "teacher-avatar";
        avatar.textContent = teacherInitials(teacher.name);

        const info = document.createElement("div");
        info.className = "flex-grow-1";
        info.innerHTML = `<h3 class="teacher-name">${teacher.name}</h3>
            <div class="teacher-meta"><i class="bi bi-journal-bookmark"></i> ${teacher.courses.length} ${teacher.courses.length !== 1 ? "cursos" : "curso"}</div>`;

        header.appendChild(avatar);
        header.appendChild(info);
        card.appendChild(header);

        const coursesGrid = document.createElement("div");
        coursesGrid.className = "teacher-courses-grid";

        teacher.courses.forEach((course) => {
            const group = document.createElement("div");
            group.className = "teacher-course";

            const head = document.createElement("div");
            head.className = "teacher-course-head";
            head.innerHTML = `
                <span class="badge ${course.block === "A" ? "bg-primary" : "bg-warning text-dark"}">Bloque ${course.block}</span>
                <span class="teacher-nrc"><i class="bi bi-hash"></i>${course.nrc}</span>`;

            const name = document.createElement("div");
            name.className = "teacher-course-name";
            name.textContent = course.name;

            group.appendChild(head);
            group.appendChild(name);

            if (course.horarios && course.horarios.length) {
                const times = document.createElement("div");
                times.className = "teacher-course-times";
                course.horarios.forEach((h) => {
                    const day = normalizeDay(h.dia);
                    if (!day) return;
                    const chip = document.createElement("span");
                    chip.className = "time-chip";
                    chip.textContent = `${day} ${h.inicio}-${h.fin}${h.modalidad ? ` (${h.modalidad})` : ""}`;
                    times.appendChild(chip);
                });
                if (times.children.length) group.appendChild(times);
            }

            coursesGrid.appendChild(group);
        });

        card.appendChild(coursesGrid);

        root.appendChild(card);
    });
}

async function loadTeachers() {
    const container = qs("teachersContainer");
    const count = qs("teacherCount");
    if (!container) return;
    try {
        const res = await fetch(`/api/teachers?session_id=${encodeURIComponent(sessionId)}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const items = data.items || [];
        window._allTeachers = items;
        hideSkeleton("teachersContainer");
        if (count) count.textContent = `${items.length} docente${items.length !== 1 ? "s" : ""}`;
        renderTeachers(items);
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger mb-0">Error al cargar docentes: ${e.message}</div>`;
    }
}
