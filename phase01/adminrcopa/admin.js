// ==========================================
// 1. Configuración y Variables de Estado (Globals)
// ==========================================
const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyNZIIhvDse_JfaEu3NhOaTOvVoANkU3CMbm5ZgMDfMb_nV29VMpI3DO-mv_XhHK81b/exec";

let modoVistaActual = "general"; // Puede ser 'general' o 'defensa'
let modoEdicionNotas = false; // Controla si estamos en modo edición inline
let modoEdicionDocentes = false; // NUEVO: Controla la edición in-line de docentes
let tabla;
// Se añade la propiedad checksum al estado inicial
let estadoTabla = { totalFilas: 0, checksum: null, registros: [] };
let miGraficoFases = null;
let docentesDisponibles = [];

// ==========================================
// 2. Inicialización y Event Listeners (Setup)
// ==========================================

$(document).ready(function () {
  const savedUser = localStorage.getItem("admin_user");
  const savedPass = localStorage.getItem("admin_pass");
  if (savedUser && savedPass) {
    autoIniciarSesion(savedUser, savedPass);
  }
});

// Opcional: Permitir iniciar sesión presionando "Enter"
$(document).on("keypress", function (e) {
  if (e.which === 13 && $("#login-container").is(":visible")) {
    iniciarSesion();
  }
});

// ESCUCHAR CAMBIOS Y VALIDAR EN LOS INPUTS DE NOTAS (IN-LINE)
$(document).on("input", ".input-nota", function () {
  const idPedido = $(this).data("id");
  const val = $(this).val().trim();
  const numVal = parseFloat(val);

  // 1. Validación de Rango 0-20
  if (val !== "" && (isNaN(numVal) || numVal < 0 || numVal > 20)) {
    $(this).addClass("input-nota-error");
    $(`#calc-final-${idPedido}`).html(
      '<span class="text-danger" style="font-size:0.7rem">ERROR</span>',
    );
    return;
  } else {
    $(this).removeClass("input-nota-error");
  }

  const regOriginal = estadoTabla.registros.find(
    (r) => r.id_pedido === idPedido,
  );
  const notaFinalOrig = parseFloat(regOriginal.nota_final_fase6) || 0;

  // EXTRAER LAS NOTAS DE LOS INPUTS IN-LINE DE ESTA FILA
  const val4 = $(
    `input.input-nota[data-id="${idPedido}"][data-tipo="n4"]`,
  ).val();
  const val5 = $(
    `input.input-nota[data-id="${idPedido}"][data-tipo="n5"]`,
  ).val();

  // 2. Cálculo robusto (Promedio considerando 60% n4 - 40% n5)
  const calcFinal = calcularPromedio(val4, val5);

  let htmlTop = notaFinalOrig > 0 ? notaFinalOrig.toFixed(2) : "-";
  let htmlBottom = "-";

  if (calcFinal !== "") {
    const calcFinalFix = parseFloat(calcFinal).toFixed(2);
    htmlBottom = calcFinalFix;

    // 3. Cálculo de Varianza
    if (notaFinalOrig > 0) {
      const varianza = calcFinalFix - notaFinalOrig;
      if (varianza > 0) {
        htmlTop = `${notaFinalOrig.toFixed(2)} <span class="text-success fw-bold">(+${varianza.toFixed(2)})</span>`;
      } else if (varianza < 0) {
        htmlTop = `${notaFinalOrig.toFixed(2)} <span class="text-danger fw-bold">(${varianza.toFixed(2)})</span>`;
      } else {
        htmlTop = `${notaFinalOrig.toFixed(2)} <span class="text-muted">(=)</span>`;
      }
    }
  }

  // 4. Inyectar en los dos recuadros (El de la varianza arriba, y el cálculo final abajo)
  $(`#info-orig-${idPedido}`).html(htmlTop);
  $(`#calc-final-${idPedido}`).text(htmlBottom);
});

// Evento In-Live para promediar EN EL MODAL DE EDICIÓN
$(document).on("input", ".calc-nota", calcularNotaFinalInLive);

$("#formEditar").submit(async (e) => {
  e.preventDefault();
  const id = $("#edit_id").val();
  const valores = {
    nombre1: $("#edit_n1").val(),
    correo: $("#edit_correo").val(),
    programa: $("#edit_prog").val(),
    tema: $("#edit_tema").val(),
    estado: $("#edit_estado").val(),
    estado_fase2: $("#edit_estado_fase2").val(),
    estado_fase3: $("#edit_estado_fase3").val(),
    estado_fase4: $("#edit_estado_fase4").val(),
    conforme_fase4: $("#edit_conforme_fase4").val(),
    estado_fase5: $("#edit_estado_fase5").val(),
    estado_fase6: $("#edit_estado_fase6").val(),
  };

  Swal.fire({
    title: "Guardando cambios...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const res = await request("editar", { id, valores });
    if (res.status === "success") {
      bootstrap.Modal.getInstance(
        document.getElementById("modalEditar"),
      ).hide();

      // ACTUALIZACIÓN IN-LIVE DEL ESTADO LOCAL
      const reg = estadoTabla.registros.find((r) => r.id_pedido === id);
      if (reg) {
        Object.assign(reg, {
          integrante_1: valores.nombre1,
          correo: valores.correo,
          programa: valores.programa,
          tema: valores.tema,
          docente: valores.docente, // NUEVO: Actualizar docente en memoria local
          estado: valores.estado,
          estado_fase2: valores.estado_fase2,
          estado_fase3: valores.estado_fase3,
          estado_fase4: valores.estado_fase4,
          conforme_fase4: valores.conforme_fase4,
          estado_fase5: valores.estado_fase5,
          estado_fase6: valores.estado_fase6,
        });
        window[`regData_${id}`] = reg;
      }

      // Repinte sin llamar a internet
      const paginaActual = tabla ? tabla.page() : 0;
      procesarYRenderizarTabla(estadoTabla);
      if (tabla) tabla.page(paginaActual).draw("page");

      Swal.fire("¡Listo!", "Registro actualizado correctamente.", "success");
    } else {
      Swal.fire("Error", res.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "No se pudo conectar", "error");
  }
});

// Enviar formulario Defensa/Notas (JVN)
$("#formEditarDefensa").submit(async (e) => {
  e.preventDefault();
  const id = $("#def_id").val();
  const valores = {
    correo: $("#def_correo").val(),
    docente: $("#def_docente").val(),
    rubrica: $("#def_rubrica").val(),
    rubrica_fase6: $("#def_rubrica").val(),
    nota4:
      $("#def_nota4").val() !== "" ? parseFloat($("#def_nota4").val()) : "", // Actualizado
    nota5:
      $("#def_nota5").val() !== "" ? parseFloat($("#def_nota5").val()) : "",
    nota_final:
      $("#def_nota_final").val() !== ""
        ? parseFloat($("#def_nota_final").val())
        : "",
  };

  Swal.fire({
    title: "Guardando datos de notas...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const res = await request("editar", { id, valores });
    if (res.status === "success") {
      bootstrap.Modal.getInstance(
        document.getElementById("modalEditarDefensa"),
      ).hide();

      // ACTUALIZACIÓN IN-LIVE DEL ESTADO LOCAL (JVN)
      const reg = estadoTabla.registros.find((r) => r.id_pedido === id);
      if (reg) {
        reg.correo = valores.correo;
        reg.docente = valores.docente;
        reg.rubrica_fase6 = valores.rubrica;
        reg.nota_fase4 = valores.nota4 !== "" ? parseFloat(valores.nota4) : "";
        reg.nota_fase5 = valores.nota5 !== "" ? parseFloat(valores.nota5) : "";
        reg.nota_final_fase6 =
          valores.nota_final !== "" ? parseFloat(valores.nota_final) : "";
        window[`regData_${id}`] = reg;
      }

      const paginaActual = tabla ? tabla.page() : 0;
      procesarYRenderizarTabla(estadoTabla);
      if (tabla) {
        tabla.page(paginaActual).draw("page");
      }

      Swal.fire("¡Listo!", "Notas actualizadas.", "success");
    } else {
      Swal.fire("Error", res.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "No se pudo conectar al servidor", "error");
  }
});

// ==========================================
// 3. Núcleo de Comunicación (API Layer)
// ==========================================
async function request(action, data = {}) {
  // Añadimos un timestamp dinámico para evitar que la conexión muera por inactividad prolongada
  const urlAntiCache = `${WEB_APP_URL}?t=${Date.now()}`;
  const response = await fetch(urlAntiCache, {
    method: "POST",
    body: JSON.stringify({ action, data }),
    cache: "no-store", // Fuerza al navegador a no usar caché vieja
  });
  return await response.json();
}

// ==========================================
// 4. Gestión de Sesión y Acceso (Auth)
// ==========================================
async function iniciarSesion() {
  const user = $("#login_user").val().trim();
  const pass = $("#login_pass").val().trim();
  const btn = $("#btn-login");
  const btnText = btn.find(".btn-text");
  const spinner = btn.find(".spinner-border");

  if (!user || !pass) {
    return Swal.fire(
      "Atención",
      "Debes ingresar usuario y contraseña.",
      "warning",
    );
  }

  // Estado de carga en el botón
  btn.prop("disabled", true);
  btnText.addClass("d-none");
  spinner.removeClass("d-none");

  try {
    // AÑADIDO: Se envía explícitamente el rol "admin"
    const res = await request("login", { user, pass, role: "admin" });

    if (res.status === "success") {
      // Guardar credenciales para persistencia al refrescar la página
      localStorage.setItem("admin_user", user);
      localStorage.setItem("admin_pass", pass);

      $("#login-container").animate({ opacity: 0 }, 300, function () {
        $(this).removeClass("d-flex").addClass("d-none");

        // Lanzamos el Splash Screen
        $("#splash-screen").fadeIn(300);

        let bar = document.getElementById("splash-progress");
        if (bar) bar.style.width = "40%";
        let text = document.getElementById("splash-text");

        text.innerText = "Credenciales válidas. Ensamblando registros...";

        // Usamos los datos que ya vinieron empaquetados en la respuesta de login
        if (res.datos) {
          procesarYRenderizarTabla(res.datos);
        }

        bar.style.width = "100%";
        text.innerText = "¡Motores Listos!";

        setTimeout(() => {
          $("#splash-screen").fadeOut(400, () => {
            $("#main-dashboard").fadeIn(400);
          });
        }, 600);
      });
    } else {
      btn.prop("disabled", false);
      btnText.removeClass("d-none");
      spinner.addClass("d-none");
      Swal.fire("Acceso Denegado", res.message, "error");
    }
  } catch (error) {
    btn.prop("disabled", false);
    btnText.removeClass("d-none");
    spinner.addClass("d-none");
    Swal.fire("Error", "No se pudo conectar con el servidor.", "error");
  }
}

async function autoIniciarSesion(user, pass) {
  // Transición directa al splash screen
  $("#login-container").addClass("d-none");
  $("#splash-screen").show();

  let bar = document.getElementById("splash-progress");
  let text = document.getElementById("splash-text");

  bar.style.width = "30%";
  text.innerText = "Restaurando sesión. Conectando con JVN...";

  try {
    const res = await request("login", { user, pass, role: "admin" });

    if (res.status === "success") {
      bar.style.width = "70%";
      text.innerText = "Sesión validada. Descargando registros...";

      if (res.datos) {
        procesarYRenderizarTabla(res.datos);
      }

      bar.style.width = "100%";
      text.innerText = "¡Dashboard Listo!";

      setTimeout(() => {
        $("#splash-screen").fadeOut(400, () => {
          $("#main-dashboard").fadeIn(400);
        });
      }, 500);
    } else {
      // Credenciales antiguas inválidas, limpiamos y mandamos al login
      localStorage.removeItem("admin_user");
      localStorage.removeItem("admin_pass");
      $("#splash-screen").hide();
      $("#login-container").removeClass("d-none").css("opacity", 1);
      Swal.fire(
        "Sesión Expirada",
        "Tus credenciales guardadas ya no son válidas.",
        "warning",
      );
    }
  } catch (error) {
    // Error de red, regresamos al login
    $("#splash-screen").hide();
    $("#login-container").removeClass("d-none").css("opacity", 1);
    Swal.fire(
      "Error de Conexión",
      "No se pudo conectar al servidor para restaurar la sesión.",
      "error",
    );
  }
}

// Función para desloguear al usuario
function cerrarSesion() {
  localStorage.removeItem("admin_user");
  localStorage.removeItem("admin_pass");
  window.location.reload();
}

// ==========================================
// 5. Orquestación de Datos y Renderizado
// ==========================================

async function obtenerDatos(silencioso = true, forzar = false) {
  if (!silencioso) {
    Swal.fire({
      title: "Actualizando Panel...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
  }

  try {
    // Corrección: Apunta siempre a "leer", ya que Apps Script unifica la extracción de ambas hojas
    const data = await request("leer");

    // Si no se fuerza el refresco, validamos si el número de filas y el contenido (checksum) siguen idénticos
    if (
      !forzar &&
      data.totalFilas === estadoTabla.totalFilas &&
      data.checksum === estadoTabla.checksum
    ) {
      if (!silencioso) Swal.close();
      return;
    }

    procesarYRenderizarTabla(data);
    if (!silencioso) Swal.close();
  } catch (e) {
    console.error(e);
    if (!silencioso)
      Swal.fire(
        "Error de Conexión",
        "Revisa tu internet o intenta nuevamente.",
        "error",
      );
  }
}

function procesarYRenderizarTabla(data) {
  if (!data || !data.registros) return;

  if (data.reporteId) {
    const urlReporte = `https://docs.google.com/spreadsheets/d/${data.reporteId}/edit`;
    $("#link-reporte-fase6").attr("href", urlReporte);
  }

  // Guardamos los metadatos de control actualizados
  estadoTabla.totalFilas = data.totalFilas;
  estadoTabla.checksum = data.checksum;
  estadoTabla.registros = data.registros;

  // --- SOLUCIÓN: Sincronización global inmediata en window de todos los registros actualizados ---
  data.registros.forEach((reg) => {
    if (!reg.id_pedido) {
      reg.id_pedido = "ID_GENERICO_" + Math.random().toString(36).substr(2, 5);
    }
    window[`regData_${reg.id_pedido}`] = reg;
  });

  // --- NUEVO: CARGAR E INYECTAR DOCENTES DISPONIBLES EN EL SELECT ---
  if (data.docentes) {
    docentesDisponibles = data.docentes;
    const $selectDocente = $("#def_docente");
    if ($selectDocente.length) {
      $selectDocente.empty();
      $selectDocente.append(
        '<option value="">Seleccione un docente...</option>',
      );
      docentesDisponibles.forEach((docente) => {
        $selectDocente.append(`<option value="${docente}">${docente}</option>`);
      });
    }
  }

  let registrosFiltrados = data.registros;

  // Renderizar las métricas KPI dinámicamente
  calcularYRenderizarMetricas(data.registros);

  let htmlHead = "";
  let htmlBody = "";

  if (modoVistaActual === "general") {
    // Cabecera única actualizada
    htmlHead = `
      <tr>
        <th>Fecha Reg.</th>
        <th>Estudiante</th>
        <th>Programa / Tema</th>
        <th class="th-f1">F1: Estado</th>
        <th class="th-f2">F2: Estado</th>
        <th class="th-f3">F3: Doc</th>
        <th class="th-f3">F3: Estado</th>
        <th class="th-f4">F4: Doc</th>
        <th class="th-f4">F4: Nota</th>
        <th class="th-f4">F4: Conformidad</th>
        <th class="th-f4">F4: Estado</th>
        <th class="th-f5">F5: Nota</th>
        <th class="th-f5">F5: Estado</th>
        <th class="th-f6">F6: Nota Final</th>
        <th class="th-f6">F6: Estado</th>
        <th class="text-center">Acciones</th>
      </tr>`;

    registrosFiltrados.forEach((reg) => {
      // Data invisible para mejorar el buscador de DataTables
      const hiddenSearchData = `<span style="display:none;">${reg.id_pedido || ""} ${reg.integrante_1 || ""} ${reg.grupo || ""} ${reg.correo || ""} ${reg.dni || ""} ${reg.seccion || ""} ${reg.programa || ""} ${reg.tema || ""}</span>`;
      // FASE 1
      const badgeF1 = obtenerClaseEstado(reg.estado);
      const dotF1 = badgeF1 === "badge-pendiente" ? "badge-dot" : "";
      const estadoF1 = reg.estado || "---";

      // FASE 2
      const badgeF2 = obtenerClaseEstado(reg.estado_fase2);
      const dotF2 = badgeF2 === "badge-pendiente" ? "badge-dot" : "";
      const estadoF2Limpio = reg.estado_fase2
        ? reg.estado_fase2.replace("_FASE2", "")
        : "---";

      // FASE 3
      const badgeF3 = obtenerClaseEstado(reg.estado_fase3);
      const dotF3 = badgeF3 === "badge-pendiente" ? "badge-dot" : "";
      const estadoF3Limpio = reg.estado_fase3
        ? reg.estado_fase3.replace("_FASE3", "")
        : "---";
      const docsF3 = reg.url_pdf_fase3
        ? `<a href="${reg.url_pdf_fase3}" target="_blank" class="btn-doc-f3" data-bs-toggle="tooltip" title="Ver PDF de Trabajo"><i class="fas fa-file-pdf"></i></a>`
        : "-";

      // FASE 4
      const btnDocF4 = reg.url_doc_fase4
        ? `<a href="${reg.url_doc_fase4}" target="_blank" class="btn-doc-f4" data-bs-toggle="tooltip" title="Abrir Informe Generado"><i class="fas fa-file-alt"></i></a>`
        : "-";
      const notaF4 =
        reg.nota_fase4 !== undefined && reg.nota_fase4 !== ""
          ? `<span class="fw-bold text-dark">${reg.nota_fase4}</span>`
          : "---";

      let badgeConforme = "bg-vacio";
      let labelConforme = "---";
      if (reg.conforme_fase4 === "CONFORME") {
        badgeConforme = "badge-conforme";
        labelConforme = "CONFORME";
      } else if (reg.conforme_fase4 === "NO_CONFORME") {
        badgeConforme = "badge-no-conforme";
        labelConforme = "NO CONFORME";
      }
      const conformeF4 = reg.conforme_fase4
        ? `<span class="${badgeConforme}">${labelConforme}</span>`
        : "---";

      const badgeF4 = obtenerClaseEstado(reg.estado_fase4);
      const dotF4 = badgeF4 === "badge-pendiente" ? "badge-dot" : "";
      const estadoF4Limpio = reg.estado_fase4
        ? reg.estado_fase4.replace("_FASE4", "")
        : "---";

      // FASE 5
      const notaF5 =
        reg.nota_fase5 !== undefined && reg.nota_fase5 !== ""
          ? `<span class="fw-bold text-dark">${reg.nota_fase5}</span>`
          : "---";
      const badgeF5 = obtenerClaseEstado(reg.estado_fase5);
      const estadoF5Limpio = reg.estado_fase5
        ? reg.estado_fase5.replace(/_/g, " ")
        : "---";

      // FASE 6
      const badgeF6 = obtenerClaseEstado(reg.estado_fase6);
      const estadoF6Limpio = reg.estado_fase6
        ? reg.estado_fase6.replace("_FASE6", "")
        : "---";
      const notaF6 =
        reg.nota_final_fase6 !== undefined && reg.nota_final_fase6 !== ""
          ? `<span class="fw-bold">${reg.nota_final_fase6}</span>`
          : "---";

      let valorOrden = reg.f_registro;
      if (reg.f_registro) {
        const partes = reg.f_registro.split(/[\s/:]/);
        if (partes.length >= 6) {
          valorOrden = `${partes[2]}${partes[1].padStart(2, "0")}${partes[0].padStart(2, "0")}${partes[3].padStart(2, "0")}${partes[4].padStart(2, "0")}${partes[5].padStart(2, "0")}`;
        }
      }

      // 1. Identificar Grupo y crear SortKey compuesto (Grupo + Fecha)
      const nombreGrupo =
        reg.grupo && reg.grupo !== "Individual" ? reg.grupo : "Individual";
      const sortKey = `${nombreGrupo}_${valorOrden}`;

      const btnEdit = `<button class="btn btn-sm btn-info text-white" onclick='prepararEdicion("${reg.id_pedido}")' data-bs-toggle="tooltip" title="Editar"><i class="fas fa-edit"></i></button>`;

      const initials = obtenerIniciales(reg.integrante_1);
      const studentCellHtml = `
        <div class="d-flex align-items-center">
          <div class="avatar-circle">${initials}</div>
          <div class="student-info-cell text-start">
            <div class="student-name">${reg.integrante_1 || "Sin Nombre"}</div>
            <div class="student-email">${reg.correo || ""}</div>
          </div>
        </div>`;

      // Botón F2 (Estructura Modalidad 05)
      let btnHtmlF2 = "";
      if (
        reg.estado_fase2 &&
        reg.estado_fase2.toUpperCase().includes("COMPLETADO")
      ) {
        btnHtmlF2 = `<button class="btn-magic-border f2-magic" onclick="reenviarEmailFase2('${reg.id_pedido}')" data-bs-toggle="tooltip" title="Enviar Estructura F2 - ¡LISTO!"><div class="btn-magic-content"><i class="fas fa-paper-plane"></i></div></button>`;
      } else {
        btnHtmlF2 = `<button class="btn btn-sm btn-f2" onclick="reenviarEmailFase2('${reg.id_pedido}')" data-bs-toggle="tooltip" title="Enviar Estructura Modalidad 05 (F2)"><i class="fas fa-paper-plane"></i></button>`;
      }

      // Botón F4 (Informe de Evaluación)
      let btnHtmlF4 = "";
      if (
        reg.estado_fase4 &&
        reg.estado_fase4.toUpperCase().includes("COMPLETADO")
      ) {
        btnHtmlF4 = `<button class="btn-magic-border f4-magic" onclick="reenviarEmailFase4('${reg.id_pedido}')" data-bs-toggle="tooltip" title="Enviar Informe F4 - ¡LISTO!"><div class="btn-magic-content"><i class="fas fa-paper-plane"></i></div></button>`;
      } else {
        btnHtmlF4 = `<button class="btn btn-sm btn-f4" onclick="reenviarEmailFase4('${reg.id_pedido}')" data-bs-toggle="tooltip" title="Enviar Informe de Evaluación (F4)"><i class="fas fa-paper-plane"></i></button>`;
      }

      // Botón F6 (Dictamen Final)
      let btnHtmlF6 = "";
      if (
        reg.estado_fase6 &&
        reg.estado_fase6.toUpperCase().includes("COMPLETADO")
      ) {
        btnHtmlF6 = `<button class="btn-magic-border f6-magic" onclick="reenviarEmailFase6('${reg.id_pedido}')" data-bs-toggle="tooltip" title="Enviar Dictamen F6 - ¡LISTO!"><div class="btn-magic-content"><i class="fas fa-paper-plane"></i></div></button>`;
      } else {
        btnHtmlF6 = `<button class="btn btn-sm btn-f6" onclick="reenviarEmailFase6('${reg.id_pedido}')" data-bs-toggle="tooltip" title="Enviar Dictamen Final (F6)"><i class="fas fa-paper-plane"></i></button>`;
      }

      const filaCorreosHtml = `
          <div class="btn-group shadow-sm action-group mb-1">
            ${btnHtmlF2}
            ${btnHtmlF4}
            ${btnHtmlF6}
          </div>
        `;

      const accionesHtml = `
        <div class="d-flex flex-column align-items-center gap-1">
          ${filaCorreosHtml}
          <div class="btn-group shadow-sm action-group">
            ${btnEdit}
            <button class="btn btn-sm btn-danger" onclick="eliminar('${reg.id_pedido}')" data-bs-toggle="tooltip" title="Eliminar"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;

      htmlBody += `<tr data-grupo="${nombreGrupo}">
        <td data-sort="${sortKey}">${hiddenSearchData}<small>${reg.f_registro ? reg.f_registro.split(" ")[0] : "---"}</small></td>
        <td>${studentCellHtml}</td>
        <td class="border-end-phase">
          <small class="text-muted d-block mb-1" style="line-height:1.2;">${acortarTexto(reg.programa, 45)}</small>
          <span class="d-block fw-bold text-dark" style="max-width: 250px;" title="${reg.tema}">${acortarTexto(reg.tema, 45)}</span>
        </td>
        <td class="text-center td-f1 border-end-phase"><span class="${badgeF1} ${dotF1}">${estadoF1}</span></td>
        <td class="text-center td-f2 border-end-phase"><span class="${badgeF2} ${dotF2}">${estadoF2Limpio}</span></td>
        <td class="text-center td-f3">${docsF3}</td>
        <td class="text-center td-f3 border-end-phase"><span class="${badgeF3} ${dotF3}">${estadoF3Limpio}</span></td>
        <td class="text-center td-f4">${btnDocF4}</td>
        <td class="text-center td-f4">${notaF4}</td>
        <td class="text-center td-f4">${conformeF4}</td>
        <td class="text-center td-f4 border-end-phase"><span class="${badgeF4} ${dotF4}">${estadoF4Limpio}</span></td>
        <td class="text-center td-f5">${notaF5}</td>
        <td class="text-center td-f5 border-end-phase"><span class="${badgeF5}">${estadoF5Limpio}</span></td>
        <td class="text-center td-f6 text-success">${notaF6}</td>
        <td class="text-center td-f6 border-end-phase"><span class="${badgeF6}">${estadoF6Limpio}</span></td>
        <td class="text-center">${accionesHtml}</td>
      </tr>`;
    });
  } else {
    // === VISTA DE NOTAS ===
    const thClass =
      modoEdicionNotas || modoEdicionDocentes ? "editing-col-header" : "";

    let dictamenDefensaHeaders = "";
    let docenteHeader = "";

    if (modoEdicionNotas) {
      dictamenDefensaHeaders = `
      <th class="text-center ${thClass} th-f4">Nota Trabajo</th>
      <th class="text-center ${thClass} th-f5">Nota Exposición</th>
    `;
    }

    if (modoEdicionDocentes) {
      docenteHeader = `<th class="text-center ${thClass} th-f5">Docente Asignado</th>`;
    }

    htmlHead = `
    <tr>
      <th>M. Temporal</th>
      <th>Estudiante</th>
      <th>Correo</th>
      <th>Programa</th>
      <th class="text-center">Informes</th>
      <th class="text-center">Rúbrica</th>
      ${docenteHeader}
      ${dictamenDefensaHeaders}
      <th class="text-center ${thClass} th-f6">Nota Final</th>
      <th class="text-center">Acciones</th>
    </tr>`;

    registrosFiltrados.forEach((reg) => {
      // Data invisible para mejorar el buscador de DataTables
      const hiddenSearchData = `<span style="display:none;">${reg.id_pedido || ""} ${reg.integrante_1 || ""} ${reg.grupo || ""} ${reg.correo || ""} ${reg.dni || ""} ${reg.seccion || ""} ${reg.programa || ""} ${reg.tema || ""}</span>`;

      let valorOrden = reg.f_registro;
      if (reg.f_registro) {
        const partes = reg.f_registro.split(/[\s/:]/);
        if (partes.length >= 6) {
          valorOrden = `${partes[2]}${partes[1].padStart(2, "0")}${partes[0].padStart(2, "0")}${partes[3].padStart(2, "0")}${partes[4].padStart(2, "0")}${partes[5].padStart(2, "0")}`;
        }
      }

      // 1. Identificar Grupo y crear SortKey compuesto (Grupo + Fecha)
      const nombreGrupo =
        reg.grupo && reg.grupo !== "Individual" ? reg.grupo : "Individual";
      const sortKey = `${nombreGrupo}_${valorOrden}`;

      // Reemplaza "Preguntas" por "Informes" utilizando URL FASE 4
      const informeEnlace = reg.url_doc_fase4
        ? `<a href="${reg.url_doc_fase4}" target="_blank" class="btn btn-sm btn-outline-info" style="border-radius:6px; font-size:0.85rem; padding: 5px 14px; min-width: 50px;" data-bs-toggle="tooltip" title="Ver Informe"><i class="fas fa-file-alt"></i></a>`
        : `<span class="badge bg-secondary" style="font-size: 0.65rem; padding: 5px 10px; min-width: 50px;">N/A</span>`;

      const rubricaEnlace = reg.rubrica_fase6
        ? `<a href="${reg.rubrica_fase6}" target="_blank" class="btn btn-sm btn-outline-success" style="border-radius:6px; font-size:0.85rem; padding: 5px 14px; min-width: 50px;" data-bs-toggle="tooltip" title="Ver Rúbrica"><i class="fas fa-clipboard-check"></i></a>`
        : `<span class="badge bg-secondary" style="font-size: 0.65rem; padding: 5px 10px; min-width: 50px;">N/A</span>`;

      const int1 = reg.integrante_1 || "-";
      const cor1 = reg.correo || "-";
      const programa = reg.programa || "-";

      const btnEditDef = `<button class="btn btn-sm btn-primary" onclick='prepararEdicionDefensa("${reg.id_pedido}")' data-bs-toggle="tooltip" title="Editar Registro"><i class="fas fa-cogs"></i></button>`;

      let dictamenDefensaCells = "";
      let docenteCell = "";
      const tdClass =
        modoEdicionNotas || modoEdicionDocentes ? "editing-col-cell" : "";

      // Modificado para usar data-tipo="n4" asociado a la Nota Trabajo
      if (modoEdicionNotas) {
        dictamenDefensaCells = `
        <td class="text-center ${tdClass}"><input type="number" step="0.01" min="0" max="20" class="form-control form-control-sm text-center input-nota ${tdClass}" data-id="${reg.id_pedido}" data-tipo="n4" value="${reg.nota_fase4 !== undefined ? reg.nota_fase4 : ""}" style="font-size:0.75rem; padding:2px;"></td>
        <td class="text-center ${tdClass}"><input type="number" step="0.01" min="0" max="20" class="form-control form-control-sm text-center input-nota ${tdClass}" data-id="${reg.id_pedido}" data-tipo="n5" value="${reg.nota_fase5 !== undefined ? reg.nota_fase5 : ""}" style="font-size:0.75rem; padding:2px;"></td>
      `;
      }

      if (modoEdicionDocentes) {
        let options = `<option value="">Sin asignar</option>`;
        docentesDisponibles.forEach((doc) => {
          const selected = reg.docente === doc ? "selected" : "";
          options += `<option value="${doc}" ${selected}>${doc}</option>`;
        });
        docenteCell = `<td class="text-center ${tdClass}"><select class="form-select form-select-sm input-docente border border-info shadow-sm" data-id="${reg.id_pedido}" style="font-size:0.8rem; padding:4px;">${options}</select></td>`;
      }

      let celdaFinal;
      if (modoEdicionNotas) {
        const notaOriginal =
          reg.nota_final_fase6 !== undefined && reg.nota_final_fase6 !== ""
            ? reg.nota_final_fase6
            : "-";

        celdaFinal = `
        <div class="nota-final-container" id="final-box-${reg.id_pedido}" style="font-size:0.8rem;">
          <div class="nota-final-box-top" id="info-orig-${reg.id_pedido}">
             ${notaOriginal}
          </div>
          <div class="nota-final-box-bottom" id="calc-final-${reg.id_pedido}">
             -
          </div>
        </div>`;
      } else {
        celdaFinal = `<span class="fw-bold text-success" style="font-size: 0.9rem;">${reg.nota_final_fase6 !== undefined && reg.nota_final_fase6 !== "" ? reg.nota_final_fase6 : "-"}</span>`;
      }

      htmlBody += `<tr data-grupo="${nombreGrupo}">
        <td data-sort="${sortKey}">${hiddenSearchData}<small style="font-size:0.7rem;">${reg.f_registro ? reg.f_registro.split(" ")[0] : "---"}</small></td>
        <td><div style="font-size:0.7rem; line-height:1.1;">${acortarTexto(int1, 25)}</div></td>
        <td><div style="font-size:0.65rem; word-break:break-all;">${acortarTexto(cor1, 30)}</div></td>
        <td><div style="font-size:0.7rem; line-height:1.1;" title="${programa}">${acortarTexto(programa, 25)}</div></td>
        <td class="text-center">${informeEnlace}</td>
        <td class="text-center">${rubricaEnlace}</td>
        ${docenteCell}
        ${dictamenDefensaCells}
        <td class="text-center bg-light ${tdClass}">${celdaFinal}</td>
        <td class="text-center">${btnEditDef}</td>
      </tr>`;
    });
  }

  // Destruir DataTable previo si existe
  if (tabla) {
    tabla.clear();
    tabla.destroy();
  }

  // Inyectar HTML
  $("#tabla-head").html(htmlHead);
  $("#contenido").html(htmlBody);

  // Configuraciones dinámicas de DataTables actualizadas
  let columnDefsConfig = [];
  if (modoVistaActual === "general") {
    // 16 columnas en total (Índices del 0 al 15)
    columnDefsConfig = [
      { targets: 0, width: "65px" },
      { targets: 1, width: "180px" },
      { targets: 2, width: "220px" },
      {
        targets: [3, 4, 6, 10, 12, 14], // Estados: F1(3), F2(4), F3(6), F4(10), F5(12), F6(14)
        width: "95px",
        className: "text-center",
      },
      { targets: [5, 7], width: "50px", className: "text-center" }, // Docs F3(5), F4(7)
      { targets: [8, 11], width: "50px", className: "text-center" }, // Notas F4(8), F5(11)
      { targets: 9, width: "90px", className: "text-center" }, // Conformidad F4
      { targets: 13, width: "60px", className: "text-center" }, // Nota F6
      {
        targets: 15,
        width: "180px",
        className: "text-center",
        orderable: false,
      }, // Acciones
    ];
  } else {
    // Columnas base
    columnDefsConfig = [
      { targets: 0, width: "60px" },
      { targets: 1, width: "130px" }, // Estudiante
      { targets: 2, width: "130px" }, // Correo
      { targets: 3, width: "120px" }, // Programa
      {
        targets: [4, 5],
        width: "40px",
        className: "text-center",
        orderable: false,
      }, // Informes, Rubrica
    ];

    let colIndex = 6;

    if (modoEdicionDocentes) {
      columnDefsConfig.push({
        targets: colIndex,
        width: "130px",
        className: "text-center",
      });
      colIndex++;
    }

    if (modoEdicionNotas) {
      columnDefsConfig.push({
        targets: [colIndex, colIndex + 1],
        width: "60px",
        className: "text-center",
      });
      colIndex += 2;
    }

    // Columna Puntaje Final
    columnDefsConfig.push({
      targets: colIndex,
      width: "70px",
      className: "text-center",
    });
    colIndex++;

    // Columna Acciones
    columnDefsConfig.push({
      targets: colIndex,
      width: "50px",
      className: "text-center",
      orderable: false,
    });
  }

  tabla = $("#tabla").DataTable({
    order: [[0, "asc"]], // Cambiado a "asc" para que agrupe alfabéticamente los grupos por defecto
    language: {
      url: "https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json",
      search: "",
      searchPlaceholder: "Buscar registro...",
    },
    pageLength: 25,
    stateSave: false,
    columnDefs: columnDefsConfig,
    drawCallback: function (settings) {
      var api = this.api();
      var rows = api.rows({ page: "current" }).nodes();
      var last = null;

      // Iterar sobre las filas renderizadas en la página actual
      api
        .rows({ page: "current" })
        .every(function (rowIdx, tableLoop, rowLoop) {
          var node = this.node();
          var group = $(node).attr("data-grupo");

          if (last !== group) {
            // Insertar la fila de encabezado de grupo
            $(node).before(
              `<tr class="group-header-row">
              <td colspan="100%">
                <div class="group-header-div">
                  <i class="fas fa-users me-2"></i> ${group}
                </div>
              </td>
            </tr>`,
            );
            last = group;
          }
        });
    },
  });

  $(".dataTables_filter input").addClass("form-control shadow-sm");

  const tooltipTriggerList = document.querySelectorAll(
    '[data-bs-toggle="tooltip"]',
  );

  [...tooltipTriggerList].map(
    (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl),
  );
}

// Calcular y renderizar dinámicamente las métricas del nuevo dashboard con gráficos (Fases Activas)
function calcularYRenderizarMetricas(registros) {
  if (!registros || registros.length === 0) return;

  // --- CÁLCULO DE DISTRIBUCIÓN POR FASE ACTIVA (Ajustado a los estados reales) ---
  const dist = {
    f1: { total: 0, reg: 0 },
    f2: { total: 0, comp: 0, env: 0 },
    f3: { total: 0, comp: 0 },
    f4: { total: 0, pend: 0, comp: 0, env: 0 },
    f5: { total: 0, por: 0, cal: 0 },
    f6: { total: 0, comp: 0, env: 0 },
  };

  registros.forEach((reg) => {
    // Determinar de forma retrospectiva la fase activa más alta alcanzada
    let faseActiva = 1;
    if (reg.estado_fase6 && String(reg.estado_fase6).trim() !== "") {
      faseActiva = 6;
    } else if (reg.estado_fase5 && String(reg.estado_fase5).trim() !== "") {
      faseActiva = 5;
    } else if (reg.estado_fase4 && String(reg.estado_fase4).trim() !== "") {
      faseActiva = 4;
    } else if (reg.estado_fase3 && String(reg.estado_fase3).trim() !== "") {
      faseActiva = 3;
    } else if (reg.estado_fase2 && String(reg.estado_fase2).trim() !== "") {
      faseActiva = 2;
    } else {
      faseActiva = 1;
    }

    // Clasificación de estados exactos
    if (faseActiva === 1) {
      dist.f1.total++;
      const est = String(reg.estado || "").toUpperCase();
      if (est.includes("REGISTRADO")) dist.f1.reg++;
      else dist.f1.reg++; // Por defecto asume registrado si está en fase 1
    } else if (faseActiva === 2) {
      dist.f2.total++;
      const est = String(reg.estado_fase2 || "").toUpperCase();
      if (est.includes("ENVIADO")) dist.f2.env++;
      else dist.f2.comp++; // Si no está enviado, es completado
    } else if (faseActiva === 3) {
      dist.f3.total++;
      const est = String(reg.estado_fase3 || "").toUpperCase();
      dist.f3.comp++; // En Fase 3 solo hay completados (recepción)
    } else if (faseActiva === 4) {
      dist.f4.total++;
      const est = String(reg.estado_fase4 || "").toUpperCase();
      if (est.includes("ENVIADO")) dist.f4.env++;
      else if (est.includes("COMPLETADO")) dist.f4.comp++;
      else dist.f4.pend++; // PENDIENTE_FASE4
    } else if (faseActiva === 5) {
      dist.f5.total++;
      const est = String(reg.estado_fase5 || "").toUpperCase();
      if (est.includes("CALIFICADO")) dist.f5.cal++;
      else dist.f5.por++; // POR_CALIFICAR
    } else if (faseActiva === 6) {
      dist.f6.total++;
      const est = String(reg.estado_fase6 || "").toUpperCase();
      if (est.includes("ENVIADO")) dist.f6.env++;
      else dist.f6.comp++; // COMPLETADO_FASE6
    }
  });

  // Renderizar valores de texto numéricos en HTML
  $("#dist-f1-total").text(dist.f1.total);
  $("#dist-f1-reg").text(dist.f1.reg);

  $("#dist-f2-total").text(dist.f2.total);
  $("#dist-f2-comp").text(dist.f2.comp);
  $("#dist-f2-env").text(dist.f2.env);

  $("#dist-f3-total").text(dist.f3.total);
  $("#dist-f3-comp").text(dist.f3.comp);

  $("#dist-f4-total").text(dist.f4.total);
  $("#dist-f4-pend").text(dist.f4.pend);
  $("#dist-f4-comp").text(dist.f4.comp);
  $("#dist-f4-env").text(dist.f4.env);

  $("#dist-f5-total").text(dist.f5.total);
  $("#dist-f5-por").text(dist.f5.por);
  $("#dist-f5-cal").text(dist.f5.cal);

  $("#dist-f6-total").text(dist.f6.total);
  $("#dist-f6-comp").text(dist.f6.comp);
  $("#dist-f6-env").text(dist.f6.env);

  // Helper local para setear de manera segura los anchos porcentuales de las mini-barras
  const setBarWidths = (total, barIds, counts) => {
    barIds.forEach((id, idx) => {
      const count = counts[idx] || 0;
      const pct = total > 0 ? (count / total) * 100 : 0;
      $(`#${id}`).css("width", `${pct}%`);
    });
  };

  setBarWidths(dist.f1.total, ["dist-f1-bar-reg"], [dist.f1.reg]);
  setBarWidths(
    dist.f2.total,
    ["dist-f2-bar-comp", "dist-f2-bar-env"],
    [dist.f2.comp, dist.f2.env],
  );
  setBarWidths(dist.f3.total, ["dist-f3-bar-comp"], [dist.f3.comp]);
  setBarWidths(
    dist.f4.total,
    ["dist-f4-bar-pend", "dist-f4-bar-comp", "dist-f4-bar-env"],
    [dist.f4.pend, dist.f4.comp, dist.f4.env],
  );
  setBarWidths(
    dist.f5.total,
    ["dist-f5-bar-por", "dist-f5-bar-cal"],
    [dist.f5.por, dist.f5.cal],
  );
  setBarWidths(
    dist.f6.total,
    ["dist-f6-bar-comp", "dist-f6-bar-env"],
    [dist.f6.comp, dist.f6.env],
  );

  // --- INTEGRACIÓN Y ACTUALIZACIÓN DINÁMICA DE CHART.JS ---
  const dataChart = [
    dist.f1.total,
    dist.f2.total,
    dist.f3.total,
    dist.f4.total,
    dist.f5.total,
    dist.f6.total,
  ];

  if (miGraficoFases) {
    miGraficoFases.data.datasets[0].data = dataChart;
    miGraficoFases.update();
  } else {
    const canvasElement = document.getElementById("chartFasesActivas");
    if (canvasElement) {
      const ctx = canvasElement.getContext("2d");
      miGraficoFases = new Chart(ctx, {
        type: "bar",
        data: {
          labels: [
            "F1: Registro",
            "F2: Estructura",
            "F3: Recepción",
            "F4: Informe",
            "F5: Nota",
            "F6: Dictamen",
          ],
          datasets: [
            {
              label: "Registros Activos",
              data: dataChart,
              backgroundColor: [
                "#9E8BA9", // F1
                "#9D50BB", // F2
                "#6A0DAD", // F3
                "#4B0082", // F4
                "#3A0066", // F5
                "#2E004F", // F6
              ],
              borderColor: [
                "#847190",
                "#823CA0",
                "#520A8A",
                "#370066",
                "#27004C",
                "#1E0036",
              ],
              borderWidth: 1,
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#071342",
              titleFont: { family: "Outfit", weight: "bold" },
              bodyFont: { family: "Plus Jakarta Sans" },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
                font: { family: "Plus Jakarta Sans", size: 11 },
              },
              grid: { color: "#f1f5f9" },
            },
            x: {
              ticks: { font: { family: "Outfit", size: 11, weight: "600" } },
              grid: { display: false },
            },
          },
        },
      });
    }
  }
}

// ==========================================
// 6. Helpers de Formato y UI (Utilidades)
// ==========================================
// Helper para extraer iniciales de un nombre
function obtenerIniciales(nombre) {
  if (!nombre) return "ST";
  const partes = nombre.trim().split(/\s+/);
  if (partes.length >= 2) {
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }
  return partes[0][0].toUpperCase();
}

// Lógica de asignación de color al Badge basado en el avance de estados con los colores de JVN
function obtenerClaseEstado(estado) {
  if (!estado || estado.trim() === "" || estado === "---") return "bg-vacio";

  const est = estado.toUpperCase();

  if (
    est.includes("PENDIENTE") ||
    est.includes("ESPERANDO") ||
    est.includes("EVALUANDO")
  ) {
    return "badge-pendiente";
  }
  if (est.includes("PROCESANDO") || est.includes("POR_CALIFICAR")) {
    return "badge-procesando";
  }
  if (
    est.includes("COMPLETADO") ||
    est === "CALIFICADO" ||
    (est.includes("APTO") && !est.includes("NO_APTO"))
  ) {
    return "badge-completado";
  }
  if (est.includes("NO_APTO")) {
    return "badge-no-apto";
  }
  if (est.includes("ENVIADO")) {
    return "badge-enviado";
  }
  if (est === "REGISTRADO") return "badge-registrado";
  if (est === "CALIFICADO") return "badge-calificado";

  return "bg-vacio";
}

// Mantener fallback para la función getBadgeClass si se requiere en otros procesos
function getBadgeClass(estado) {
  return obtenerClaseEstado(estado);
}

function getBadgeClassF2(estado) {
  return getBadgeClass(estado);
}

function getBadgeClassF3(estado) {
  return getBadgeClass(estado);
}

function getBadgeClassF4(estado) {
  return getBadgeClass(estado);
}

// Colorización dinámica del texto de los desplegables de "Control de Fases" según el estado (JVN Palette)
function colorizarSelect(selectId) {
  const $select = $(`#${selectId}`);
  const val = $select.val() || "";
  const est = val.toUpperCase();

  // Definición de colores según la identidad visual del sistema
  let color = "#4A4A5A"; // Color neutro por defecto
  let fontWeight = "700"; // Negrita para estados activos

  if (
    est.includes("PENDIENTE") ||
    est.includes("ESPERANDO") ||
    est.includes("EVALUANDO")
  ) {
    color = "#6a0dad"; // Violeta Real (Igual a badge-pendiente)
  } else if (est.includes("PROCESANDO") || est.includes("POR_CALIFICAR")) {
    color = "#9d50bb"; // Lavanda Intenso (Igual a badge-procesando)
  } else if (
    est.includes("COMPLETADO") ||
    est === "CALIFICADO" ||
    (est.includes("APTO") && !est.includes("NO_APTO"))
  ) {
    color = "#4b0082"; // Morado JVN (Igual a badge-completado)
  } else if (est.includes("NO_APTO")) {
    color = "#b91c1c"; // Rojo (Igual a badge-no-apto)
  } else if (est.includes("ENVIADO")) {
    color = "#2e004f"; // Púrpura Medianoche (Igual a badge-enviado)
  } else if (est === "REGISTRADO") {
    color = "#0ea5e9";
  } else if (est === "CONFORME") {
    color = "#16a34a";
  } else if (est === "NO_CONFORME") {
    color = "#dc2626";
  } else if (est === "CALIFICADO") {
    color = "#14b8a6";
  } else {
    fontWeight = "normal"; // Para estados vacíos o "SIN INICIAR"
    color = "#8B7D93";
  }

  $select.css({
    color: color,
    "font-weight": fontWeight,
  });
}

function acortarTexto(texto, maxLength = 60) {
  if (!texto) return "---";
  if (texto.length <= maxLength) return texto;
  return texto.substring(0, maxLength) + "...";
}

// ==========================================
// 7. Control de Vistas y Modos de Edición
// ==========================================
function toggleVistaDefensa() {
  const btn = $("#btn-toggle-vista");
  const panelOps = $("#panel-operaciones");
  const panelOpsDefensa = $("#panel-operaciones-defensa");

  if (modoVistaActual === "general") {
    modoVistaActual = "defensa";
    modoEdicionNotas = false;
    modoEdicionDocentes = false;
    btn.html('<i class="fas fa-table"></i> Vista General');
    btn.removeClass("btn-outline-info").addClass("btn-outline-primary");
    panelOps.hide();
    panelOpsDefensa.show();
  } else {
    modoVistaActual = "general";
    modoEdicionNotas = false;
    modoEdicionDocentes = false;
    btn.html('<i class="fas fa-video"></i> Vista de Notas');
    btn.removeClass("btn-outline-primary").addClass("btn-outline-info");
    panelOps.show();
    panelOpsDefensa.hide();
  }

  // Asegurar el reset de botones de edición notas
  $("#btn-editar-notas")
    .html('<i class="fas fa-edit"></i> Editar Notas')
    .removeClass("btn-success")
    .addClass("btn-warning");
  $("#btn-cancelar-notas").addClass("d-none");

  // Asegurar el reset de botones de edición docentes
  $("#btn-editar-docentes")
    .html('<i class="fas fa-chalkboard-teacher me-1"></i> Asignar Docentes')
    .removeClass("btn-success")
    .addClass("btn-info");
  $("#btn-cancelar-docentes").addClass("d-none");

  procesarYRenderizarTabla(estadoTabla);
}

// NUEVA FUNCIÓN PARA ALTERNAR MODO EDICIÓN
function toggleEdicionNotas() {
  const btnNotas = $("#btn-editar-notas");
  const btnCancelar = $("#btn-cancelar-notas");

  if (!modoEdicionNotas) {
    modoEdicionNotas = true;
    btnNotas
      .html('<i class="fas fa-save"></i> Guardar Notas')
      .removeClass("btn-warning")
      .addClass("btn-success");
    btnCancelar.removeClass("d-none");
    procesarYRenderizarTabla(estadoTabla); // Re-renderizar con los inputs
  } else {
    guardarNotasEnVivo(); // Si ya estaba activo, funciona como Guardar
  }
}

function cancelarEdicionNotas() {
  modoEdicionNotas = false;
  $("#btn-editar-notas")
    .html('<i class="fas fa-edit"></i> Editar Notas')
    .removeClass("btn-success")
    .addClass("btn-warning");
  $("#btn-cancelar-notas").addClass("d-none");
  procesarYRenderizarTabla(estadoTabla); // Volver al modo lectura sin guardar cambios
}

function toggleEdicionDocentes() {
  const btnDocentes = $("#btn-editar-docentes");
  const btnCancelar = $("#btn-cancelar-docentes");

  if (!modoEdicionDocentes) {
    modoEdicionDocentes = true;
    if (modoEdicionNotas) cancelarEdicionNotas(); // Evitar superposición de modos

    btnDocentes
      .html('<i class="fas fa-save me-1"></i> Guardar Docentes')
      .removeClass("btn-info")
      .addClass("btn-success");
    btnCancelar.removeClass("d-none");
    procesarYRenderizarTabla(estadoTabla);
  } else {
    guardarDocentesEnVivo();
  }
}

function cancelarEdicionDocentes() {
  modoEdicionDocentes = false;
  $("#btn-editar-docentes")
    .html('<i class="fas fa-chalkboard-teacher me-1"></i> Asignar Docentes')
    .removeClass("btn-success")
    .addClass("btn-info");
  $("#btn-cancelar-docentes").addClass("d-none");
  procesarYRenderizarTabla(estadoTabla);
}

async function guardarDocentesEnVivo() {
  const listaCambios = [];

  $(".input-docente").each(function () {
    const id = $(this).data("id");
    const docenteVal = $(this).val();

    // Solo registrar si hubo cambios respecto al original
    const regOriginal = estadoTabla.registros.find((r) => r.id_pedido === id);
    const docenteOriginal = regOriginal.docente || "";

    if (docenteVal !== docenteOriginal) {
      listaCambios.push({ id: id, docente: docenteVal });
    }
  });

  if (listaCambios.length === 0) {
    cancelarEdicionDocentes();
    return;
  }

  Swal.fire({
    title: "Guardando asignaciones...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const res = await request("editarDocentesMasivo", listaCambios);
    if (res.status === "success") {
      modoEdicionDocentes = false;
      $("#btn-editar-docentes")
        .html('<i class="fas fa-chalkboard-teacher me-1"></i> Asignar Docentes')
        .removeClass("btn-success")
        .addClass("btn-info");
      $("#btn-cancelar-docentes").addClass("d-none");
      await obtenerDatos(true, true);
      Swal.fire(
        "¡Éxito!",
        "Se han asignado los docentes correctamente.",
        "success",
      );
    } else {
      Swal.fire("Error", res.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "No se pudo conectar al servidor", "error");
  }
}

// ==========================================
// 8. Acciones de Fila (CRUD Individual)
// ==========================================
function prepararEdicion(idPedido) {
  const reg = window[`regData_${idPedido}`];
  if (!reg) return;

  $("#edit_id").val(reg.id_pedido);
  $("#edit_n1").val(reg.integrante_1);
  $("#edit_correo").val(reg.correo);
  $("#edit_prog").val(reg.programa);

  // Cargamos el tema directamente sin esperar a ninguna lista
  $("#edit_tema").val(reg.tema || "");

  $("#edit_estado").val(reg.estado || "");
  $("#edit_estado_fase2").val(reg.estado_fase2 || "");
  $("#edit_estado_fase3").val(reg.estado_fase3 || "");
  $("#edit_estado_fase4").val(reg.estado_fase4 || "");
  $("#edit_conforme_fase4").val(reg.conforme_fase4 || "");
  $("#edit_estado_fase5").val(reg.estado_fase5 || "");
  $("#edit_estado_fase6").val(reg.estado_fase6 || "");

  // Colorizar selects
  colorizarSelect("edit_estado");
  colorizarSelect("edit_estado_fase2");
  colorizarSelect("edit_estado_fase3");
  colorizarSelect("edit_estado_fase4");
  colorizarSelect("edit_conforme_fase4");
  colorizarSelect("edit_estado_fase5");
  colorizarSelect("edit_estado_fase6");

  new bootstrap.Modal("#modalEditar").show();
}

function prepararEdicionDefensa(idPedido) {
  const reg = window[`regData_${idPedido}`];
  if (!reg) return;

  $("#def_id").val(reg.id_pedido);
  $("#def_correo").val(reg.correo);
  $("#def_docente").val(reg.docente || "");
  $("#def_rubrica").val(reg.rubrica_fase6 || "");
  $("#def_nota4").val(reg.nota_fase4 || ""); // Modificado a nota 4
  $("#def_nota5").val(reg.nota_fase5 || "");

  calcularNotaFinalInLive();

  new bootstrap.Modal("#modalEditarDefensa").show();
}

async function eliminar(id) {
  const confirm = await Swal.fire({
    title: "¿Eliminar registro?",
    text: "Esta acción borrará permanentemente el registro del sistema",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Eliminando...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await request("eliminar", { id });
      if (res.status === "success") {
        // Actualización local para remover fila
        estadoTabla.registros = estadoTabla.registros.filter(
          (r) => r.id_pedido !== id,
        );
        estadoTabla.totalFilas--;
        const paginaActual = tabla ? tabla.page() : 0;
        procesarYRenderizarTabla(estadoTabla);
        if (tabla) tabla.page(paginaActual).draw("page");

        Swal.fire("Eliminado", res.message, "success");
      } else {
        Swal.fire("Error", res.message || "Error al eliminar", "error");
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo conectar con el servidor", "error");
    }
  }
}

// ==========================================
// 9. Lógica de Calificaciones (Cálculos In-Live)
// ==========================================
function calcularNotaFinalInLive() {
  const val4 = $("#def_nota4").val();
  const val5 = $("#def_nota5").val();

  const final = calcularPromedio(val4, val5);

  // Si la función devuelve un número, formateamos a 2 decimales
  $("#def_nota_final").val(final !== "" ? parseFloat(final).toFixed(2) : "");
}

function calcularPromedio(val4, val5) {
  const str4 =
    val4 !== null && val4 !== undefined ? val4.toString().trim() : "";
  const str5 =
    val5 !== null && val5 !== undefined ? val5.toString().trim() : "";

  if (str4 === "" && str5 === "") return "";

  const n4 = parseFloat(str4);
  const n5 = parseFloat(str5);

  // Comportamiento de promediado:
  // Si falta una nota, se muestra la que está completa pero sin aplicarle el porcentaje
  // (Para evitar que alguien que solo tiene 20 en el trabajo salga con 12 de final)
  if (str4 !== "" && str5 === "") return isNaN(n4) ? "" : n4;
  if (str4 === "" && str5 !== "") return isNaN(n5) ? "" : n5;

  // Si ambos campos están llenos, se pondera (60% Trabajo, 40% Exposición)
  if (!isNaN(n4) && !isNaN(n5)) {
    return n4 * 0.6 + n5 * 0.4;
  }
  return "";
}

async function guardarNotasEnVivo() {
  const listaCambios = [];
  let hayErrorDeRango = false;

  $(".input-nota[data-tipo='n4']").each(function () {
    const id = $(this).data("id");
    const val4 = $(this).val().trim();
    const val5 = $(`input[data-id="${id}"][data-tipo="n5"]`).val().trim();

    const n4 = parseFloat(val4);
    const n5 = parseFloat(val5);

    if (val4 !== "" && (isNaN(n4) || n4 < 0 || n4 > 20)) hayErrorDeRango = true;
    if (val5 !== "" && (isNaN(n5) || n5 < 0 || n5 > 20)) hayErrorDeRango = true;

    const calcFinal = calcularPromedio(val4, val5);

    if (val4 !== "" || val5 !== "") {
      listaCambios.push({
        id: id,
        nota4: val4 !== "" ? parseFloat(n4.toFixed(2)) : "",
        nota5: val5 !== "" ? parseFloat(n5.toFixed(2)) : "",
        nota_final: calcFinal !== "" ? parseFloat(calcFinal.toFixed(2)) : "",
      });
    }
  });

  if (hayErrorDeRango) {
    Swal.fire(
      "Error de Validación",
      "Por favor corrige las notas. El rango permitido es de 0 a 20.",
      "error",
    );
    return;
  }

  if (listaCambios.length === 0) {
    cancelarEdicionNotas();
    return;
  }

  Swal.fire({
    title: "Guardando notas...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const res = await request("editarNotasMasivo", listaCambios);
    if (res.status === "success") {
      modoEdicionNotas = false;
      $("#btn-editar-notas")
        .html('<i class="fas fa-edit"></i> Editar Notas')
        .removeClass("btn-success")
        .addClass("btn-warning");
      $("#btn-cancelar-notas").addClass("d-none");
      await obtenerDatos(true, true);
      Swal.fire(
        "¡Éxito!",
        "Todas las notas se han guardado y promediado correctamente.",
        "success",
      );
    } else {
      Swal.fire("Error", res.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "No se pudo conectar al servidor", "error");
  }
}

// ==========================================
// 10. Acciones de Fase y Comunicaciones (F2 - F6)
// ==========================================
// FASE 02: Estructura
async function reenviarEmailFase2(id) {
  const reg = window[`regData_${id}`];
  const confirm = await Swal.fire({
    title: "¿Enviar Estructura de Modalidad 05?",
    text: `Se enviará el enlace de la plantilla oficial (Fase 02) a ${reg.integrante_1}.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#6A0DAD",
    confirmButtonText: "Sí, enviar estructura",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Enviando email...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await request("enviarEmailFase2", { id });
      if (res.status === "success") {
        actualizarEstadoLocal([id], 2, "ENVIADO_FASE2");
        Swal.fire("¡Enviado!", res.message, "success");
      } else {
        Swal.fire("Atención", res.message, "warning");
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo conectar con el servidor", "error");
    }
  }
}

// FASE 02: Estructura (Masivo)
async function enviarTodosFase2() {
  if (!estadoTabla.registros) return;

  // CORRECCIÓN: Se eliminó la validación de url_doc_fase2 ya que se usa la constante global en el backend
  const candidatos = estadoTabla.registros.filter(
    (reg) =>
      reg.estado_fase2 && reg.estado_fase2.toUpperCase().includes("COMPLETADO"),
  );

  if (candidatos.length === 0) {
    return Swal.fire(
      "Atención",
      "No hay registros pendientes de envío de Estructura (Fase 2).",
      "info",
    );
  }

  const listaEstudiantes = candidatos
    .map((c) => `<li>${c.integrante_1} (${c.correo})</li>`)
    .slice(0, 10)
    .join("");
  const total = candidatos.length;
  const htmlLista = `
    <div class="text-start">
      <p>Se enviará la <b>Plantilla de Estructura</b> a <b>${total}</b> estudiantes:</p>
      <ul style="font-size: 0.8rem; color: #666;">
        ${listaEstudiantes}
        ${total > 10 ? `<li>... y ${total - 10} más.</li>` : ""}
      </ul>
    </div>`;

  const confirm = await Swal.fire({
    title: "¿Enviar estructuras en masa?",
    html: htmlLista,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#4B0082", // Morado JVN
    confirmButtonText: "Sí, enviar a todos",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Procesando envíos...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await request("enviarMasivoFase2");
      if (res.status === "success") {
        const idsActualizados = candidatos.map((c) => c.id_pedido);
        actualizarEstadoLocal(idsActualizados, 2, "ENVIADO_FASE2");
        Swal.fire("Proceso terminado", res.message, "success");
      } else {
        Swal.fire("Error", res.message, "error");
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo completar la operación", "error");
    }
  }
}

// FASE 04: Informe
async function reenviarEmailFase4(id) {
  const reg = window[`regData_${id}`];
  const confirm = await Swal.fire({
    title: "¿Enviar Informe de Evaluación?",
    text: `Se enviará el informe técnico de la Fase 04 a ${reg.integrante_1}.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#9D50BB",
    confirmButtonText: "Sí, enviar informe",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({ title: "Enviando...", didOpen: () => Swal.showLoading() });
    try {
      const res = await request("enviarEmailFase4", { id });
      if (res.status === "success") {
        actualizarEstadoLocal([id], 4, "ENVIADO_FASE4");
        Swal.fire("¡Enviado!", res.message, "success");
      } else {
        Swal.fire("Error", res.message, "warning");
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo conectar con el servidor", "error");
    }
  }
}

// FASE 04: Informe IA (Masivo)
async function enviarTodosFase4() {
  if (!estadoTabla.registros) return;

  // Aquí sí validamos url_doc_fase4 porque el informe debe existir para ser enviado
  const candidatos = estadoTabla.registros.filter(
    (reg) =>
      reg.estado_fase4 &&
      reg.estado_fase4.toUpperCase().includes("COMPLETADO") &&
      reg.url_doc_fase4,
  );

  if (candidatos.length === 0) {
    return Swal.fire(
      "Atención",
      "No hay Informes de Evaluación listos para enviar en Fase 4.",
      "info",
    );
  }

  const listaEstudiantes = candidatos
    .map((c) => `<li>${c.integrante_1}</li>`)
    .slice(0, 10)
    .join("");
  const total = candidatos.length;
  const htmlLista = `
    <div class="text-start">
      <p>Se enviarán los <b>Informes de Evaluación</b> a <b>${total}</b> estudiantes:</p>
      <ul style="font-size: 0.8rem; color: #666;">
        ${listaEstudiantes}
        ${total > 10 ? `<li>... y ${total - 10} más.</li>` : ""}
      </ul>
    </div>`;

  const confirm = await Swal.fire({
    title: "¿Enviar informes en masa?",
    html: htmlLista,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#9D50BB", // Lavanda Intenso
    confirmButtonText: "Sí, enviar a todos",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Procesando envíos...",
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await request("enviarMasivoFase4");
      if (res.status === "success") {
        const idsActualizados = candidatos.map((c) => c.id_pedido);
        actualizarEstadoLocal(idsActualizados, 4, "ENVIADO_FASE4");
        Swal.fire("Completado", res.message, "success");
      } else {
        Swal.fire("Error", res.message, "error");
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo completar la operación", "error");
    }
  }
}

// FASE 06: Dictamen
async function reenviarEmailFase6(id) {
  const reg = window[`regData_${id}`];
  const confirm = await Swal.fire({
    title: "¿Enviar Dictamen Final?",
    text: `Se enviará el dictamen con la nota final a ${reg.integrante_1}.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#4B0082",
    confirmButtonText: "Sí, enviar dictamen",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({ title: "Enviando...", didOpen: () => Swal.showLoading() });
    try {
      const res = await request("enviarEmailFase6", { id });
      if (res.status === "success") {
        actualizarEstadoLocal([id], 6, "ENVIADO_FASE6"); // Actualizar UI
        Swal.fire("¡Enviado!", res.message, "success");
      } else {
        Swal.fire("Error", res.message, "warning");
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo conectar con el servidor", "error");
    }
  }
}

// FASE 06: Dictamen Final (Masivo)
async function enviarTodosFase6() {
  if (!estadoTabla.registros) return;

  const candidatos = estadoTabla.registros.filter(
    (reg) =>
      reg.estado_fase6 &&
      reg.estado_fase6.toUpperCase().includes("COMPLETADO") &&
      reg.nota_final_fase6 !== "" &&
      reg.nota_final_fase6 !== undefined,
  );

  if (candidatos.length === 0) {
    return Swal.fire(
      "Atención",
      "No hay Dictámenes Finales con nota listos para enviar.",
      "info",
    );
  }

  const listaEstudiantes = candidatos
    .map((c) => `<li>${c.integrante_1} (Nota: ${c.nota_final_fase6})</li>`)
    .slice(0, 10)
    .join("");
  const total = candidatos.length;
  const htmlLista = `
    <div class="text-start">
      <p>Se enviará el <b>Dictamen Final</b> a <b>${total}</b> estudiantes:</p>
      <ul style="font-size: 0.8rem; color: #666;">
        ${listaEstudiantes}
        ${total > 10 ? `<li>... y ${total - 10} más.</li>` : ""}
      </ul>
    </div>`;

  const confirm = await Swal.fire({
    title: "¿Enviar Dictámenes en Masa?",
    html: htmlLista,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#2E004F", // Púrpura Medianoche
    confirmButtonText: "Sí, enviar a todos",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Procesando envíos...",
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await request("enviarMasivoFase6");
      if (res.status === "success") {
        const idsActualizados = candidatos.map((c) => c.id_pedido);
        actualizarEstadoLocal(idsActualizados, 6, "ENVIADO_FASE6");
        Swal.fire("Completado", res.message, "success");
      } else {
        Swal.fire("Error", res.message, "error");
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo completar la operación", "error");
    }
  }
}

/* --- MODIFICACIÓN EN admin.js --- */
function actualizarEstadoLocal(ids, fase, nuevoEstado) {
  if (!estadoTabla.registros) return;

  // Guardamos la página actual para que el usuario no pierda su posición
  const paginaActual = tabla ? tabla.page() : 0;

  ids.forEach((id) => {
    // Buscamos en el array global de registros
    const reg = estadoTabla.registros.find((r) => r.id_pedido === id);
    if (reg) {
      // Actualizamos el estado según la fase
      if (fase === 1) reg.estado = nuevoEstado;
      else if (fase === 2) reg.estado_fase2 = nuevoEstado;
      else if (fase === 3) reg.estado_fase3 = nuevoEstado;
      else if (fase === 4) reg.estado_fase4 = nuevoEstado;
      else if (fase === 5) reg.estado_fase5 = nuevoEstado;
      else if (fase === 6) reg.estado_fase6 = nuevoEstado;

      // Sincronizamos con el objeto de acceso rápido por ID
      window[`regData_${id}`] = reg;
    }
  });

  // Forzamos el redibujado completo de la tabla con los nuevos datos del objeto
  procesarYRenderizarTabla(estadoTabla);

  // Restauramos la página donde estaba el usuario
  if (tabla) {
    tabla.page(paginaActual).draw("page");
  }
}

// ==========================================
// 11. Operaciones Especiales y Motores
// ==========================================

async function forzarRedaccionAsync() {
  const confirm = await Swal.fire({
    title: "¿Iniciar motor de IA?",
    text: "Esto ordenará a JVN buscar registros PENDIENTES y redactarlos en segundo plano.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#dc3545",
    confirmButtonText: "Sí, iniciar",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Conectando...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const res = await request("forzarEjecucionAsync");
      if (res.status === "success") {
        await obtenerDatos(true, true);
        Swal.fire({
          title: "¡Motor Iniciado!",
          text: "Se ejecutará en la nube.",
          icon: "success",
          confirmButtonText: "Entendido",
        });
      } else {
        Swal.fire("Error del Motor", res.message, "error");
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo conectar con el servidor.", "error");
    }
  }
}

async function exportarAReporteFase6() {
  const confirm = await Swal.fire({
    title: "¿Enviar datos al Reporte?",
    text: "Todos los registros actuales se añadirán al final de la hoja 'Reporte'. Recuerda haber limpiado o resguardado los datos de destino para evitar duplicados.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#4B0082", // Morado JVN
    confirmButtonText: "Sí, enviar",
    cancelButtonText: "Cancelar",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Exportando registros...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await request("exportarFase6");
      if (res.status === "success") {
        Swal.fire("¡Listo!", res.message, "success");
      } else {
        Swal.fire("Error", res.message, "error");
      }
    } catch (e) {
      Swal.fire(
        "Error",
        "No se pudo conectar al servidor para realizar la exportación.",
        "error",
      );
    }
  }
}
