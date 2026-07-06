const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyNZIIhvDse_JfaEu3NhOaTOvVoANkU3CMbm5ZgMDfMb_nV29VMpI3DO-mv_XhHK81b/exec";
let registrosGlobal = [];
let selectedId = null;
let filtroActivo = "todos";
let modoEdicionNotas = false;

// --- CONTROL DE SESIÓN AL INICIAR ---
$(document).ready(() => {
  const savedUser = localStorage.getItem("docente_user");
  const savedPass = localStorage.getItem("docente_pass");
  if (savedUser && savedPass) {
    autoIniciarSesion(savedUser, savedPass);
  } else {
    $("#login-container").removeClass("d-none").addClass("d-flex");
    $("#main-dashboard").addClass("d-none");
  }
  // Manejador de eventos para el cambio de filtros
  $(document).on("click", ".btn-filtro", function () {
    $(".btn-filtro").removeClass("active");
    $(this).addClass("active");
    filtroActivo = $(this).data("filtro");
    renderizarLista(registrosGlobal);
  });

  $(document).on("click", ".tag-conforme", function () {
    $(".tag-conforme").removeClass("active");
    $(this).addClass("active");
  });

  // Buscador en vivo
  $(document).on("input", "#buscador", function () {
    renderizarLista(registrosGlobal);
  });
});

// Listener para disparar el login con la tecla Enter
$(document).on("keypress", function (e) {
  if (e.which === 13 && $("#login-container").is(":visible")) {
    iniciarSesion();
  }
});

$(document).on("input", "#buscador-f5", function () {
  renderizarVistaFase5(registrosGlobal);
});

function calcularPromedioPonderado(val4, val5) {
  const str4 =
    val4 !== null && val4 !== undefined ? val4.toString().trim() : "";
  const str5 =
    val5 !== null && val5 !== undefined ? val5.toString().trim() : "";

  if (str4 === "" && str5 === "") return "";

  const n4 = parseFloat(str4);
  const n5 = parseFloat(str5);

  if (str4 !== "" && str5 === "") return isNaN(n4) ? "" : n4 * 0.6; // Muestra solo el peso de lo que hay
  if (str4 === "" && str5 !== "") return isNaN(n5) ? "" : n5 * 0.4;

  if (!isNaN(n4) && !isNaN(n5)) {
    return n4 * 0.6 + n5 * 0.4;
  }
  return "";
}

function toggleEdicionNotas() {
  const btnNotas = $("#btn-editar-notas-f5");
  const btnCancelar = $("#btn-cancelar-notas-f5");

  if (!modoEdicionNotas) {
    modoEdicionNotas = true;
    btnNotas
      .html('<i class="fas fa-save"></i> Guardar Notas')
      .removeClass("btn-warning")
      .addClass("btn-success");
    btnCancelar.removeClass("d-none");
    renderizarVistaFase5(registrosGlobal);
  } else {
    guardarNotasMasivoDocente();
  }
}

function cancelarEdicionNotas() {
  modoEdicionNotas = false;
  $("#btn-editar-notas-f5")
    .html('<i class="fas fa-edit"></i> Editar Notas')
    .removeClass("btn-success")
    .addClass("btn-warning");
  $("#btn-cancelar-notas-f5").addClass("d-none");
  renderizarVistaFase5(registrosGlobal);
}

function cambiarVista(vista) {
  if (vista === "f4") {
    $("#btn-vista-f4").removeClass("btn-outline-light").addClass("btn-light");
    $("#btn-vista-f5").removeClass("btn-light").addClass("btn-outline-light");
    $("#vista-fase-05").addClass("d-none");
    $("#vista-fase-04").removeClass("d-none");
    renderizarLista(registrosGlobal);
  } else {
    $("#btn-vista-f5").removeClass("btn-outline-light").addClass("btn-light");
    $("#btn-vista-f4").removeClass("btn-light").addClass("btn-outline-light");
    $("#vista-fase-04").addClass("d-none");
    $("#vista-fase-05").removeClass("d-none");
    renderizarVistaFase5(registrosGlobal);
  }
}

// Evento InLive para promediar
$(document).on("input", ".input-nota", function () {
  const idPedido = $(this).data("id");
  const val = $(this).val().trim();
  const numVal = parseFloat(val);

  if (val !== "" && (isNaN(numVal) || numVal < 0 || numVal > 20)) {
    $(this).addClass("input-nota-error");
    $(`#calc-final-${idPedido}`).html(
      '<span class="text-danger" style="font-size:0.7rem">ERROR</span>',
    );
    return;
  } else {
    $(this).removeClass("input-nota-error");
  }

  const regOriginal = registrosGlobal.find((r) => r.id_pedido === idPedido);
  const notaFinalOrig = parseFloat(regOriginal.nota_final_fase6) || 0;

  const val4 = $(`input[data-id="${idPedido}"][data-tipo="n4"]`).val();
  const val5 = $(`input[data-id="${idPedido}"][data-tipo="n5"]`).val();

  const calcFinal = calcularPromedioPonderado(val4, val5);

  let htmlTop = notaFinalOrig > 0 ? notaFinalOrig.toFixed(2) : "-";
  let htmlBottom = "-";

  if (calcFinal !== "") {
    const calcFinalFix = parseFloat(calcFinal.toFixed(2));
    htmlBottom = calcFinalFix.toFixed(2);

    if (notaFinalOrig > 0) {
      const varianza = calcFinalFix - notaFinalOrig;
      if (varianza > 0)
        htmlTop = `${notaFinalOrig.toFixed(2)} <span class="text-success fw-bold">(+${varianza.toFixed(2)})</span>`;
      else if (varianza < 0)
        htmlTop = `${notaFinalOrig.toFixed(2)} <span class="text-danger fw-bold">(${varianza.toFixed(2)})</span>`;
      else
        htmlTop = `${notaFinalOrig.toFixed(2)} <span class="text-muted">(=)</span>`;
    }
  }

  $(`#info-orig-${idPedido}`).html(htmlTop);
  $(`#calc-final-${idPedido}`).text(htmlBottom);
});

function renderizarVistaFase5(registros) {
  const thClass = modoEdicionNotas ? "editing-col-header" : "";
  let html = `
    <thead class="table-light">
      <tr>
        <th>ID</th>
        <th>Estudiante</th>
        <th>Grupo / Sección</th>
        <th>Tema</th>
        <th>Conformidad F4</th>
        <th class="text-center ${thClass}">Nota F4 (60%)</th>
        <th class="text-center ${thClass}">Nota F5 (40%)</th>
        <th class="text-center ${thClass}">Nota Final</th>
        ${!modoEdicionNotas ? '<th class="text-center">Acciones</th>' : ""}
      </tr>
    </thead>
    <tbody>
  `;

  const q = $("#buscador-f5").val().toLowerCase().trim();
  let filtrados = registros.filter((r) => r.estado_fase4 !== "");

  // Búsqueda profunda igualada a Fase 04
  if (q !== "") {
    filtrados = filtrados.filter((r) => {
      return (
        (r.integrante_1 || "").toLowerCase().includes(q) ||
        (r.grupo || "").toLowerCase().includes(q) ||
        (r.correo || "").toLowerCase().includes(q) ||
        String(r.dni || "")
          .toLowerCase()
          .includes(q) ||
        (r.seccion || "").toLowerCase().includes(q) ||
        (r.programa || "").toLowerCase().includes(q) ||
        (r.tema || "").toLowerCase().includes(q)
      );
    });
  }

  filtrados.sort((a, b) => {
    const gA = (a.grupo || "").toLowerCase();
    const gB = (b.grupo || "").toLowerCase();
    if (gA < gB) return -1;
    if (gA > gB) return 1;
    return parseFecha(b.f_registro) - parseFecha(a.f_registro);
  });

  filtrados.forEach((r) => {
    const conformeTag =
      r.conforme_fase4 === "CONFORME"
        ? '<span class="badge bg-success">Conforme</span>'
        : r.conforme_fase4 === "NO_CONFORME"
          ? '<span class="badge bg-danger">No Conforme</span>'
          : "-";

    const nombreGrupo =
      r.grupo && r.grupo !== "Individual" ? r.grupo : "Individual";

    const tdClass = modoEdicionNotas ? "editing-col-cell" : "";
    let celdasNotas = "";

    if (modoEdicionNotas) {
      const notaFinalOrig =
        r.nota_final_fase6 !== undefined && r.nota_final_fase6 !== ""
          ? r.nota_final_fase6
          : "-";
      celdasNotas = `
        <td class="text-center ${tdClass}"><input type="number" step="0.01" min="0" max="20" class="form-control form-control-sm text-center input-nota" data-id="${r.id_pedido}" data-tipo="n4" value="${r.nota_fase4 !== undefined ? r.nota_fase4 : ""}"></td>
        <td class="text-center ${tdClass}"><input type="number" step="0.01" min="0" max="20" class="form-control form-control-sm text-center input-nota" data-id="${r.id_pedido}" data-tipo="n5" value="${r.nota_fase5 !== undefined ? r.nota_fase5 : ""}"></td>
        <td class="text-center bg-light ${tdClass}">
          <div class="nota-final-container">
            <div class="nota-final-box-top" id="info-orig-${r.id_pedido}">${notaFinalOrig}</div>
            <div class="nota-final-box-bottom" id="calc-final-${r.id_pedido}">-</div>
          </div>
        </td>
      `;
    } else {
      celdasNotas = `
        <td class="text-center fw-bold">${r.nota_fase4 || "-"}</td>
        <td class="text-center fw-bold text-primary">${r.nota_fase5 || "-"}</td>
        <td class="text-center fw-bold text-success">${r.nota_final_fase6 || "-"}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-dark" onclick='abrirEdicionFase5(${JSON.stringify(r)})'>
            <i class="fas fa-edit"></i> Evaluar
          </button>
        </td>
      `;
    }

    html += `
      <tr>
        <td class="small text-muted">${r.id_pedido}</td>
        <td class="fw-bold">${r.integrante_1}</td>
        <td>
          <div><i class="fas fa-users text-primary small"></i> ${nombreGrupo}</div>
          <div class="small text-muted">${r.programa} | ${r.seccion}</div>
        </td>
        <td class="small text-truncate" style="max-width: 200px;" title="${r.tema}">${r.tema}</td>
        <td>${conformeTag}</td>
        ${celdasNotas}
      </tr>
    `;
  });

  if (filtrados.length === 0)
    html += `<tr><td colspan="9" class="text-center p-4 text-muted">No hay registros para mostrar.</td></tr>`;

  html += `</tbody>`;
  $("#tabla-fase05").html(html);
}

async function guardarNotasMasivoDocente() {
  const listaCambios = [];
  let hayError = false;

  $(".input-nota[data-tipo='n4']").each(function () {
    const id = $(this).data("id");
    const val4 = $(this).val().trim();
    const val5 = $(`input[data-id="${id}"][data-tipo="n5"]`).val().trim();

    const n4 = parseFloat(val4);
    const n5 = parseFloat(val5);

    if (val4 !== "" && (isNaN(n4) || n4 < 0 || n4 > 20)) hayError = true;
    if (val5 !== "" && (isNaN(n5) || n5 < 0 || n5 > 20)) hayError = true;

    const calcFinal = calcularPromedioPonderado(val4, val5);

    if (val4 !== "" || val5 !== "") {
      listaCambios.push({
        id: id,
        nota4: val4 !== "" ? parseFloat(n4.toFixed(2)) : "",
        nota5: val5 !== "" ? parseFloat(n5.toFixed(2)) : "",
        nota_final: calcFinal !== "" ? parseFloat(calcFinal.toFixed(2)) : "",
      });
    }
  });

  if (hayError)
    return Swal.fire("Error", "Rango permitido es 0 a 20.", "error");
  if (listaCambios.length === 0) return cancelarEdicionNotas();

  Swal.fire({
    title: "Guardando...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const res = await request("editarNotasMasivo", listaCambios); // Usaremos el endpoint existente modificado
    if (res.status === "success") {
      modoEdicionNotas = false;
      $("#btn-editar-notas-f5")
        .html('<i class="fas fa-edit"></i> Editar Notas')
        .removeClass("btn-success")
        .addClass("btn-warning");
      $("#btn-cancelar-notas-f5").addClass("d-none");
      await cargarDatos();
      Swal.fire("¡Éxito!", "Notas guardadas correctamente.", "success");
    } else {
      Swal.fire("Error", res.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "No se pudo conectar al servidor", "error");
  }
}

function abrirEdicionFase5(reg) {
  $("#edit-f5-id").val(reg.id_pedido);
  $("#edit-f5-obs4").val(reg.obs_fase4 || "");
  $("#edit-f5-n4").val(reg.nota_fase4 || "");
  $("#edit-f5-n5").val(reg.nota_fase5 || "");
  $("#edit-f5-nf").val(reg.nota_final_fase6 || "");

  var modal = new bootstrap.Modal(document.getElementById("modalEdicionF5"));
  modal.show();
}

async function guardarEdicionFase5() {
  const idPedido = $("#edit-f5-id").val();
  const obs_fase4 = $("#edit-f5-obs4").val();
  const nota_fase4 = $("#edit-f5-n4").val();
  const nota_fase5 = $("#edit-f5-n5").val();
  const nota_final = $("#edit-f5-nf").val();

  Swal.fire({
    title: "Guardando...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const res = await request("calificarDefensaPresencial", {
      idPedido,
      obs_fase4,
      nota_fase4,
      nota_fase5,
      nota_final_fase6: nota_final,
    });

    if (res.status === "success") {
      // Actualizamos localmente
      const reg = registrosGlobal.find((r) => r.id_pedido === idPedido);
      if (reg) {
        reg.obs_fase4 = obs_fase4;
        reg.nota_fase4 = nota_fase4;
        reg.nota_fase5 = nota_fase5;
        reg.nota_final_fase6 = nota_final;
        // --- CORRECCIÓN: Actualizar estado local ---
        reg.estado_fase5 = "CALIFICADO";
      }

      bootstrap.Modal.getInstance(
        document.getElementById("modalEdicionF5"),
      ).hide();
      renderizarVistaFase5(registrosGlobal);
      Swal.fire("¡Éxito!", "Calificaciones actualizadas.", "success");
    } else {
      Swal.fire("Error", res.message, "error");
    }
  } catch (error) {
    Swal.fire("Error", "No se pudo comunicar con el servidor.", "error");
  }
}

// --- FUNCIÓN PETICIÓN CENTRALIZADA ANTI-CACHÉ ---
async function request(action, data = {}) {
  const urlAntiCache = `${WEB_APP_URL}?t=${Date.now()}`;
  const response = await fetch(urlAntiCache, {
    method: "POST",
    body: JSON.stringify({ action, data }),
    cache: "no-store",
  });
  return await response.json();
}

// --- FLUJO DE INICIO DE SESIÓN ---
async function iniciarSesion() {
  const user = $("#login_user").val().trim();
  const pass = $("#login_pass").val().trim();
  const btn = $("#btn-login");
  const btnText = btn.find(".btn-text");
  const spinner = btn.find(".spinner-border");

  if (!user || !pass) {
    return Swal.fire("Atención", "Ingresa tus credenciales.", "warning");
  }

  btn.prop("disabled", true);
  btnText.addClass("d-none");
  spinner.removeClass("d-none");

  try {
    // Enviamos el rol "docente" para validar el acceso
    const res = await request("login", { user, pass, role: "docente" });

    if (res.status === "success") {
      localStorage.setItem("docente_user", user);
      localStorage.setItem("docente_pass", pass);

      // Asignamos el nombre del usuario logueado en la barra de navegación
      $("#logged-user").text(user);

      // Iniciamos animación de salida del login
      $("#login-container").animate({ opacity: 0 }, 300, function () {
        $(this).removeClass("d-flex").addClass("d-none");
        $("#splash-screen").fadeIn(300);

        let bar = document.getElementById("splash-progress");
        let text = document.getElementById("splash-text");

        if (bar) bar.style.width = "40%";
        text.innerText = "Autenticación exitosa. Cargando expedientes...";

        // --- CAMBIO CLAVE: Procesamiento de datos recibidos ---
        if (res.datos && res.datos.registros) {
          registrosGlobal = res.datos.registros;
          renderizarLista(registrosGlobal); // Dibujamos la lista en el DOM oculto
        }

        if (bar) bar.style.width = "100%";
        text.innerText = "¡Bienvenido, Docente!";

        // Finalizamos splash y mostramos el dashboard
        setTimeout(() => {
          $("#splash-screen").fadeOut(400, () => {
            $("#main-dashboard").hide().removeClass("d-none").fadeIn(400);
            // Forzamos un pequeño ajuste de scroll por si el DOM no calculó bien las alturas
            $("#listaEstudiantes").scrollTop(0);
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

// --- MODIFICACIÓN EN docente.js: Función autoIniciarSesion ---
async function autoIniciarSesion(user, pass) {
  $("#login-container").addClass("d-none");
  $("#splash-screen").show();

  let bar = document.getElementById("splash-progress");
  let text = document.getElementById("splash-text");

  if (bar) bar.style.width = "30%";
  text.innerText = "Restaurando sesión docente...";

  try {
    const res = await request("login", { user, pass, role: "docente" });

    if (res.status === "success") {
      if (bar) bar.style.width = "70%";
      text.innerText = "Sincronizando registros de evaluación...";

      // Asignamos el nombre del usuario restaurado en la barra de navegación
      $("#logged-user").text(user);

      if (res.datos && res.datos.registros) {
        registrosGlobal = res.datos.registros;
        renderizarLista(registrosGlobal);
      }

      if (bar) bar.style.width = "100%";
      text.innerText = "Acceso concedido.";

      setTimeout(() => {
        $("#splash-screen").fadeOut(400, () => {
          $("#main-dashboard").hide().removeClass("d-none").fadeIn(400);
        });
      }, 500);
    } else {
      localStorage.removeItem("docente_user");
      localStorage.removeItem("docente_pass");
      $("#splash-screen").hide();
      $("#login-container")
        .removeClass("d-none")
        .addClass("d-flex")
        .css("opacity", 1);
      Swal.fire(
        "Sesión Expirada",
        "Por favor, inicia sesión nuevamente.",
        "warning",
      );
    }
  } catch (error) {
    $("#splash-screen").hide();
    $("#login-container")
      .removeClass("d-none")
      .addClass("d-flex")
      .css("opacity", 1);
    Swal.fire(
      "Error de Red",
      "No se pudo validar la sesión automática.",
      "error",
    );
  }
}

function cerrarSesion() {
  localStorage.removeItem("docente_user");
  localStorage.removeItem("docente_pass");
  window.location.reload();
}

// --- ACTUALIZACIÓN MANUAL DE DATOS ---
async function cargarDatos() {
  Swal.fire({
    title: "Actualizando registros...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    // Obtenemos el usuario de la sesión activa
    const savedUser = localStorage.getItem("docente_user");

    // Enviamos el usuario para que el servidor filtre correctamente
    const data = await request("leerDocente", { user: savedUser });
    registrosGlobal = data.registros;

    // Detectamos qué vista está activa y renderizamos la correcta
    if (!$("#vista-fase-05").hasClass("d-none")) {
      renderizarVistaFase5(registrosGlobal);
    } else {
      renderizarLista(registrosGlobal);
    }

    // Si había un estudiante seleccionado, actualizar sus datos sin recargar el video
    if (selectedId) {
      const reg = registrosGlobal.find((r) => r.id_pedido === selectedId);
      if (reg) {
        $("#inputNotaF5").val(reg.nota_fase5 || "");
      }
    }

    Swal.close();
  } catch (e) {
    Swal.fire("Error", "No se pudo conectar al servidor.", "error");
  }
}

// Función para parsear de forma robusta las fechas en formato "d/M/yyyy H:m:s" o similar
function parseFecha(fechaStr) {
  if (!fechaStr) return new Date(0);
  if (fechaStr instanceof Date) return fechaStr;

  // En caso de que se reciba una cadena de texto en formato ISO
  if (typeof fechaStr === "string" && fechaStr.includes("T")) {
    const parsed = new Date(fechaStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Descomponer el formato manual "d/MM/yyyy HH:mm:ss"
  const partes = fechaStr.toString().trim().split(" ");
  if (partes.length >= 1) {
    const fechaPartes = partes[0].split("/");
    if (fechaPartes.length === 3) {
      const dia = parseInt(fechaPartes[0], 10);
      const mes = parseInt(fechaPartes[1], 10) - 1; // En JavaScript los meses inician en 0
      const anio = parseInt(fechaPartes[2], 10);

      let hora = 0,
        min = 0,
        seg = 0;
      if (partes.length >= 2) {
        const horaPartes = partes[1].split(":");
        if (horaPartes.length >= 3) {
          hora = parseInt(horaPartes[0], 10);
          min = parseInt(horaPartes[1], 10);
          seg = parseInt(horaPartes[2], 10);
        }
      }
      const d = new Date(anio, mes, dia, hora, min, seg);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const fallback = new Date(fechaStr);
  return isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

function renderizarLista(registros) {
  let html = "";
  if (registros.length === 0) {
    html = `<div class="p-4 text-center text-muted small">No hay trabajos para evaluar.</div>`;
  } else {
    // 1. Filtro por Estado (Basado en la existencia de nota_fase4)
    let registrosFiltrados = [...registros];
    if (filtroActivo === "pendiente") {
      registrosFiltrados = registrosFiltrados.filter(
        (reg) => !reg.nota_fase4 || reg.nota_fase4 === "",
      );
    } else if (filtroActivo === "calificado") {
      registrosFiltrados = registrosFiltrados.filter(
        (reg) => reg.nota_fase4 && reg.nota_fase4 !== "",
      );
    }

    // 2. Filtro por Buscador
    const q = $("#buscador").val().toLowerCase().trim();
    if (q !== "") {
      registrosFiltrados = registrosFiltrados.filter((r) => {
        return (
          (r.integrante_1 || "").toLowerCase().includes(q) ||
          (r.grupo || "").toLowerCase().includes(q) ||
          (r.correo || "").toLowerCase().includes(q) ||
          String(r.dni || "")
            .toLowerCase()
            .includes(q) ||
          (r.seccion || "").toLowerCase().includes(q) ||
          (r.programa || "").toLowerCase().includes(q) ||
          (r.tema || "").toLowerCase().includes(q)
        );
      });
    }

    if (registrosFiltrados.length === 0) {
      html = `<div class="p-4 text-center text-muted small">No se encontraron registros.</div>`;
    } else {
      // 3. Ordenar: Primero por Grupo, luego por Fecha Descendente
      const registrosOrdenados = registrosFiltrados.sort((a, b) => {
        const gA = (a.grupo || "").toLowerCase();
        const gB = (b.grupo || "").toLowerCase();
        if (gA < gB) return -1;
        if (gA > gB) return 1;

        const dateA = parseFecha(a.f_revision_fase3);
        const dateB = parseFecha(b.f_revision_fase3);
        return dateB - dateA;
      });

      // 4. Renderizado Agrupado
      let grupoActual = null;

      registrosOrdenados.forEach((reg) => {
        let isCalificado = reg.nota_fase4 && reg.nota_fase4 !== "";
        let badgeClass = isCalificado ? "bg-success" : "bg-warning text-dark";
        let textoEstado = isCalificado
          ? '<i class="fas fa-check-circle me-1"></i> Calificado'
          : '<i class="fas fa-clock me-1"></i> Pendiente';

        const activeClass = selectedId === reg.id_pedido ? "active" : "";
        const fechaFormat = reg.f_revision_fase3
          ? reg.f_revision_fase3
          : "Sin fecha";

        // Tonalidades de Conformidad
        let bgConformidadClass = "";
        if (reg.conforme_fase4 === "CONFORME")
          bgConformidadClass = "bg-conforme";
        if (reg.conforme_fase4 === "NO_CONFORME")
          bgConformidadClass = "bg-noconforme";

        const nombreGrupo =
          reg.grupo && reg.grupo !== "Individual" ? reg.grupo : "Individual";

        // Cambio de Grupo (Cerramos el contenedor anterior y abrimos uno nuevo)
        if (nombreGrupo !== grupoActual) {
          if (grupoActual !== null) {
            html += `</div>`; // Cierra group-container anterior
          }
          grupoActual = nombreGrupo;
          html += `
            <div class="group-container">
              <div class="group-header">
                <i class="fas fa-users me-2"></i> ${grupoActual}
              </div>
          `;
        }

        html += `
              <div class="student-item ${activeClass} ${bgConformidadClass}" id="item-${reg.id_pedido}" onclick="seleccionarEstudiante('${reg.id_pedido}')">
                  <div class="fw-bold mb-1" style="font-size: 0.95rem; color: #0d47a1;">${reg.integrante_1}</div>
                  <div class="d-flex justify-content-between text-muted mb-1" style="font-size: 0.75rem;">
                      <span><i class="fas fa-calendar-alt"></i> ${fechaFormat}</span>
                  </div>
                  <div class="small text-muted text-truncate mb-2" style="font-size: 0.8rem;" title="${reg.tema}">${reg.tema}</div>
                  <div class="d-flex justify-content-between align-items-center">
                      <span class="badge ${badgeClass} shadow-sm" style="font-size: 0.7rem; font-weight: 600;">${textoEstado}</span>
                      <span class="fw-bold text-primary" style="font-size: 0.85rem;">${isCalificado ? "Nota: " + reg.nota_fase4 : "--"}</span>
                  </div>
              </div>
            `;
      });
      // Cierra el último contenedor
      if (grupoActual !== null) {
        html += `</div>`;
      }
    }
  }
  $("#listaEstudiantes").html(html);
}

function seleccionarEstudiante(id) {
  selectedId = id;
  $(".student-item").removeClass("active");
  $(`#item-${id}`).addClass("active");

  const reg = registrosGlobal.find((r) => r.id_pedido === id);
  if (!reg) return;

  $("#panelVacio").addClass("d-none");
  $("#panelEvaluacion").removeClass("d-none");

  // Llenar datos informativos
  $("#infoEstudiante").text(reg.integrante_1 || "N/A");
  $("#infoDni").text((reg.dni || "").replace(/'/g, "") || "N/A");
  $("#infoPrograma").text(reg.programa || "N/A");
  $("#infoSeccion").text(reg.seccion || "N/A");
  $("#infoGrupo").text(reg.grupo || "N/A");
  $("#infoTema").text(reg.tema || "N/A");

  // Configurar Botones PDF e Informe IA y su flecha intermedia
  let hasPDF = reg.url_pdf_fase3 ? true : false;
  let hasInforme = reg.url_doc_fase4 ? true : false;

  if (hasPDF) {
    $("#btnVerPDF").attr("href", reg.url_pdf_fase3).removeClass("d-none");
  } else {
    $("#btnVerPDF").addClass("d-none");
  }

  if (hasInforme) {
    $("#btnVerInforme").attr("href", reg.url_doc_fase4).removeClass("d-none");
  } else {
    $("#btnVerInforme").addClass("d-none");
  }

  // Solo mostrar la flecha si ambos existen
  if (hasPDF && hasInforme) {
    $("#iconoFlecha").removeClass("d-none");
  } else {
    $("#iconoFlecha").addClass("d-none");
  }

  // Llenar campos de edición
  $("#inputNotaF4").val(reg.nota_fase4 || "");
  $("#inputObsF4").val(reg.obs_fase4 || "");

  // Configurar Tags de Conformidad
  $(".tag-conforme").removeClass("active");
  if (reg.conforme_fase4 === "CONFORME") {
    $(".tag-conforme[data-val='CONFORME']").addClass("active");
  } else if (reg.conforme_fase4 === "NO_CONFORME") {
    $(".tag-conforme[data-val='NO_CONFORME']").addClass("active");
  }
}

async function enviarCalificacion() {
  const nota = $("#inputNotaF4").val();
  const obs = $("#inputObsF4").val();
  const conforme = $(".tag-conforme.active").data("val") || "";

  if (!nota || nota < 0 || nota > 20) {
    return Swal.fire("Error", "Ingresa una nota válida entre 0 y 20", "error");
  }
  if (!conforme) {
    return Swal.fire(
      "Error",
      "Debes seleccionar la conformidad del proyecto.",
      "error",
    );
  }

  Swal.fire({
    title: "Guardando...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const data = await request("calificarFase4", {
      idPedido: selectedId,
      nota: nota,
      obs: obs,
      conforme: conforme,
    });

    if (data.status === "success") {
      const regPrincipal = registrosGlobal.find(
        (r) => r.id_pedido === selectedId,
      );

      if (regPrincipal) {
        const grupoTarget = regPrincipal.grupo;

        // Sincronización InLive para todos los miembros del mismo grupo
        registrosGlobal.forEach((r) => {
          if (
            (grupoTarget &&
              grupoTarget !== "Individual" &&
              r.grupo === grupoTarget) ||
            r.id_pedido === selectedId
          ) {
            r.nota_fase4 = nota;
            r.obs_fase4 = obs;
            r.conforme_fase4 = conforme;
            r.estado_fase4 = "COMPLETADO_FASE4";
          }
        });
      }

      renderizarLista(registrosGlobal);
      Swal.fire(
        "¡Éxito!",
        "Evaluación registrada correctamente para el equipo.",
        "success",
      );
    } else {
      Swal.fire("Error", data.message, "error");
    }
  } catch (e) {
    Swal.fire("Error", "Error de conexión con el servidor.", "error");
  }
}

function extraerYoutubeId(url) {
  if (!url) return null;
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length == 11 ? match[2] : null;
}
