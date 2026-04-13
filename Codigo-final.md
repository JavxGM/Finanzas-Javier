# Codigo Final v2 — Apps Script Finanzas Javier
## Instrucciones
1. Apps Script → Ctrl+A → borrar todo → pegar este codigo
2. Ctrl+S
3. Selecciona `testEmailDiario` → Run → prueba el diario
4. Selecciona `testEmail` → Run → prueba el semanal
5. Selecciona `crearTriggerDiario` → Run → activa 8 PM diario
6. Selecciona `crearTriggerSemanal` → Run → activa lunes 7 AM

```javascript
var SHEET_ID = "1SMKBw4m_gEtECrFsTxlNQyEXUB24dcGCDetMKAhM-C4";
var EMAIL_DESTINO = "garciamartinezjavier1004@gmail.com";

function setupFinanzas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setupResumen(ss);
  setupAbril(ss);
  setupAdemi(ss);
  setupScore(ss);
  setupMayo(ss);
  try { ss.deleteSheet(ss.getSheetByName("Sheet1")); } catch(e) {}
  ss.setActiveSheet(ss.getSheetByName("Resumen"));
  Logger.log("Sistema listo 5 hojas creadas");
}

function hdr(ws, r, c, n, bg) {
  ws.getRange(r, c, 1, n).setBackground(bg).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
}

function brd(ws, r, c, nr, nc) {
  ws.getRange(r, c, nr, nc).setBorder(true, true, true, true, false, false, "#CCCCCC", SpreadsheetApp.BorderStyle.SOLID);
}

function setupResumen(ss) {
  var ws = ss.getSheetByName("Resumen") || ss.insertSheet("Resumen");
  ws.clear();
  ws.setColumnWidth(1, 220); ws.setColumnWidth(2, 180); ws.setColumnWidth(3, 280);
  ws.getRange("A1:C1").merge().setValue("FINANZAS PERSONALES — JAVIER GARCIA")
    .setBackground("#1F4E79").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(14).setHorizontalAlignment("center");
  ws.getRange("A2:C2").merge().setValue("Control financiero Abril 2026")
    .setBackground("#2E75B6").setFontColor("#FFFFFF").setFontStyle("italic").setHorizontalAlignment("center");
  ws.getRange("A4").setValue("INDICADORES CLAVE").setFontWeight("bold").setFontColor("#1F4E79");
  hdr(ws, 5, 1, 2, "#1F4E79");
  ws.getRange("A5").setValue("Concepto"); ws.getRange("B5").setValue("Valor");
  var kpis = [["Ingreso mensual", 37200], ["Gastos comprometidos", 31050], ["Margen libre", "=B6-B7"], ["Score actual", 783], ["Meta score", 820]];
  kpis.forEach(function(k, i) {
    ws.getRange(6+i, 1).setValue(k[0]); ws.getRange(6+i, 2).setValue(k[1]);
    if (i < 3) ws.getRange(6+i, 2).setNumberFormat('"RD$"#,##0');
    if (i === 0) ws.getRange(6+i, 2).setFontColor("#0000FF").setFontWeight("bold");
    if (i === 2) ws.getRange(6+i, 2).setBackground("#E2EFDA");
    brd(ws, 6+i, 1, 1, 2);
  });
  ws.getRange("A12").setValue("SISTEMA DE CUENTAS").setFontWeight("bold").setFontColor("#1F4E79");
  hdr(ws, 13, 1, 3, "#2E75B6");
  ws.getRange("A13").setValue("Cuenta"); ws.getRange("B13").setValue("Rol"); ws.getRange("C13").setValue("Regla de oro");
  [["BHD", "Nomina pagos fijos gasolina", "No puede llegar a cero", "#E2EFDA"],
   ["Qik", "Solo ahorro intocable", "RD$2,500/quincena NO TOCAR", "#BDD7EE"],
   ["Banreservas", "Salidas comida", "Maximo RD$2,000/quincena", "#FFEB9C"]].forEach(function(c, i) {
    ws.getRange(14+i, 1).setValue(c[0]); ws.getRange(14+i, 2).setValue(c[1]); ws.getRange(14+i, 3).setValue(c[2]);
    ws.getRange(14+i, 1, 1, 3).setBackground(c[3]); brd(ws, 14+i, 1, 1, 3);
  });
}

function setupAbril(ss) {
  var ws = ss.getSheetByName("Presupuesto Abril") || ss.insertSheet("Presupuesto Abril");
  ws.clear();
  [220, 130, 100, 130, 200].forEach(function(w, i) { ws.setColumnWidth(i+1, w); });
  ws.getRange("A1:E1").merge().setValue("PRESUPUESTO ABRIL 2026")
    .setBackground("#375623").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(13).setHorizontalAlignment("center");
  ws.getRange("A2:E2").merge().setValue("Ingreso: RD$37,200 Dos quincenas de RD$18,600")
    .setBackground("#538135").setFontColor("#FFFFFF").setFontStyle("italic").setHorizontalAlignment("center");
  ws.getRange("A4").setValue("QUINCENA 1 — 1 al 20 de abril").setFontWeight("bold").setFontColor("#375623");
  hdr(ws, 5, 1, 5, "#375623");
  ["Concepto", "Monto", "Estado", "Cuenta", "Ultimo pago"].forEach(function(v, i) { ws.getRange(5, i+1).setValue(v); });
  var q1 = [
    ["Qik ahorro Q1", 2500, "Pendiente", "Qik", "", "#FFEB9C"],
    ["Banreservas Q1", 2000, "Hecho", "BHD", "", "#E2EFDA"],
    ["Gimnasio", 1500, "Hecho", "BHD", "", "#E2EFDA"],
    ["Internet", 900, "Hecho", "BHD", "", "#E2EFDA"],
    ["Crunchyroll", 250, "Hecho", "BHD", "", "#E2EFDA"],
    ["SAM parte 1", 2000, "Hecho", "BHD", "", "#E2EFDA"],
    ["Residencial adelanto", 1500, "Pendiente", "BHD", "", "#FFEB9C"],
    ["Gasolina Q1", 2200, "Hecho", "BHD", "", "#E2EFDA"],
    ["Pago carro completo", 5000, "Hecho", "BHD", "", "#E2EFDA"],
    ["Barberia parte 1", 500, "Pendiente", "BHD", "", "#FFEB9C"]
  ];
  q1.forEach(function(row, i) {
    var r = 6+i;
    ws.getRange(r, 1).setValue(row[0]);
    ws.getRange(r, 2).setValue(row[1]).setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
    ws.getRange(r, 3).setValue(row[2]); ws.getRange(r, 4).setValue(row[3]); ws.getRange(r, 5).setValue(row[4]);
    ws.getRange(r, 1, 1, 5).setBackground(row[5]); brd(ws, r, 1, 1, 5);
  });
  var tq1 = 16;
  ws.getRange(tq1, 1).setValue("TOTAL Q1");
  ws.getRange(tq1, 2).setFormula("=SUM(B6:B15)").setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
  ws.getRange(tq1, 3).setFormula('=COUNTIF(C6:C15,"Hecho")&" de "&COUNTA(C6:C15)&" hechos"');
  ws.getRange(tq1, 1, 1, 5).setBackground("#375623").setFontColor("#FFFFFF").setFontWeight("bold"); brd(ws, tq1, 1, 1, 5);
  ws.getRange("A18").setValue("QUINCENA 2 — 20 abril al 5 mayo").setFontWeight("bold").setFontColor("#375623");
  hdr(ws, 19, 1, 5, "#375623");
  ["Concepto", "Monto", "Estado", "Cuenta", "Ultimo pago"].forEach(function(v, i) { ws.getRange(19, i+1).setValue(v); });
  var q2 = [
    ["Qik ahorro Q2", 2500, "Pendiente", "Qik", ""],
    ["Banreservas Q2", 2000, "Pendiente", "BHD", ""],
    ["SAM parte 2", 2000, "Pendiente", "BHD", ""],
    ["Residencial restante", 1500, "Pendiente", "BHD", ""],
    ["Mantenimiento vehiculo", 2000, "Pendiente", "BHD", ""],
    ["Barberia parte 2", 500, "Pendiente", "BHD", ""],
    ["Gasolina Q2", 2200, "Pendiente", "BHD", ""]
  ];
  q2.forEach(function(row, i) {
    var r = 20+i;
    ws.getRange(r, 1).setValue(row[0]);
    ws.getRange(r, 2).setValue(row[1]).setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
    ws.getRange(r, 3).setValue(row[2]); ws.getRange(r, 4).setValue(row[3]); ws.getRange(r, 5).setValue(row[4]);
    ws.getRange(r, 1, 1, 5).setBackground(i%2===0?"#F2F2F2":"#FFFFFF"); brd(ws, r, 1, 1, 5);
  });
  var tq2 = 27;
  ws.getRange(tq2, 1).setValue("TOTAL Q2");
  ws.getRange(tq2, 2).setFormula("=SUM(B20:B26)").setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
  ws.getRange(tq2, 3).setFormula('=COUNTIF(C20:C26,"Hecho")&" de "&COUNTA(C20:C26)&" hechos"');
  ws.getRange(tq2, 1, 1, 5).setBackground("#375623").setFontColor("#FFFFFF").setFontWeight("bold"); brd(ws, tq2, 1, 1, 5);
  var tots = [
    ["TOTAL COMPROMETIDO ABRIL", "=B16+B27", "#1F4E79"],
    ["TOTAL PAGADO", '=SUMIF(C6:C26,"Hecho",B6:B26)', "#1F8B4C"],
    ["PENDIENTE", "=B29-B30", "#C55A11"],
    ["INGRESO MENSUAL", 37200, "#2E75B6"],
    ["MARGEN LIBRE", "=B32-B29", "#7030A0"]
  ];
  tots.forEach(function(t, i) {
    var r = 29+i;
    ws.getRange(r, 1).setValue(t[0]);
    ws.getRange(r, 2).setValue(t[1]).setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
    ws.getRange(r, 1, 1, 2).setBackground(t[2]).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11); brd(ws, r, 1, 1, 2);
  });
}

function setupAdemi(ss) {
  var ws = ss.getSheetByName("Prestamo Ademi") || ss.insertSheet("Prestamo Ademi");
  ws.clear();
  [240, 160, 140, 140, 160].forEach(function(w, i) { ws.setColumnWidth(i+1, w); });
  ws.getRange("A1:E1").merge().setValue("PRESTAMO ADEMI — PLAN DE PAGO")
    .setBackground("#7F6000").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(13).setHorizontalAlignment("center");
  ws.getRange("A3").setValue("SUPUESTOS — valores en azul son editables").setFontWeight("bold").setFontColor("#7F6000");
  hdr(ws, 4, 1, 2, "#7F6000");
  ws.getRange("A4").setValue("Parametro"); ws.getRange("B4").setValue("Valor");
  [["Monto prestamo RD$", 10000], ["Tasa anual %", 20], ["Plazo meses", 4], ["Monto que usas RD$", 5000], ["Capital aplica inmediato RD$", 5000]].forEach(function(s, i) {
    var r = 5+i;
    ws.getRange(r, 1).setValue(s[0]);
    ws.getRange(r, 2).setValue(s[1]).setFontColor("#0000FF").setFontWeight("bold").setHorizontalAlignment("center");
    if (i !== 1) ws.getRange(r, 2).setNumberFormat('"RD$"#,##0');
    ws.getRange(r, 1, 1, 2).setBackground("#FFEB9C"); brd(ws, r, 1, 1, 2);
  });
  ws.getRange("A11").setValue("RESULTADOS CALCULADOS").setFontWeight("bold").setFontColor("#7F6000");
  hdr(ws, 12, 1, 2, "#7F6000");
  ws.getRange("A12").setValue("Resultado"); ws.getRange("B12").setValue("Valor");
  [["Tasa mensual", "=B6/12/100"], ["Cuota mensual RD$", "=ROUND(B5*(B13/(1-(1+B13)^(-B7))),0)"], ["Total pagado RD$", "=B14*B7"], ["Intereses totales RD$", "=B15-B5"]].forEach(function(r2, i) {
    var r = 13+i;
    ws.getRange(r, 1).setValue(r2[0]);
    ws.getRange(r, 2).setFormula(r2[1]).setFontWeight("bold").setHorizontalAlignment("center");
    if (i > 0) ws.getRange(r, 2).setNumberFormat('"RD$"#,##0'); else ws.getRange(r, 2).setNumberFormat("0.00%");
    ws.getRange(r, 1, 1, 2).setBackground("#F2F2F2"); brd(ws, r, 1, 1, 2);
  });
  ws.getRange("A19").setValue("TABLA DE AMORTIZACION").setFontWeight("bold").setFontColor("#7F6000");
  hdr(ws, 20, 1, 5, "#7F6000");
  ["Mes", "Cuota", "Capital", "Interes", "Saldo"].forEach(function(v, i) { ws.getRange(20, i+1).setValue(v); });
  ["Mayo 2026", "Junio 2026", "Julio 2026", "Agosto 2026"].forEach(function(mes, i) {
    var r = 21+i;
    ws.getRange(r, 1).setValue(mes);
    ws.getRange(r, 2).setFormula("=$B$14").setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
    if (i === 0) {
      ws.getRange(r, 4).setFormula("=ROUND($B$5*$B$13,0)");
      ws.getRange(r, 3).setFormula("=B21-D21");
      ws.getRange(r, 5).setFormula("=$B$5-C21");
    } else {
      ws.getRange(r, 4).setFormula("=ROUND(E"+(r-1)+"*$B$13,0)");
      ws.getRange(r, 3).setFormula("=B"+r+"-D"+r);
      ws.getRange(r, 5).setFormula("=E"+(r-1)+"-C"+r);
    }
    for (var c = 2; c <= 5; c++) ws.getRange(r, c).setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
    ws.getRange(r, 1, 1, 5).setBackground(i%2===0?"#E2EFDA":"#FFFFFF"); brd(ws, r, 1, 1, 5);
  });
  ws.getRange(25, 1).setValue("TOTALES");
  ["=SUM(B21:B24)", "=SUM(C21:C24)", "=SUM(D21:D24)"].forEach(function(f, i) {
    ws.getRange(25, i+2).setFormula(f).setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
  });
  ws.getRange(25, 1, 1, 5).setBackground("#7F6000").setFontColor("#FFFFFF").setFontWeight("bold"); brd(ws, 25, 1, 1, 5);
}

function setupScore(ss) {
  var ws = ss.getSheetByName("Plan de Score") || ss.insertSheet("Plan de Score");
  ws.clear();
  [130, 200, 100, 100, 280].forEach(function(w, i) { ws.setColumnWidth(i+1, w); });
  ws.getRange("A1:E1").merge().setValue("PLAN DE MEJORA DE SCORE")
    .setBackground("#7030A0").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(13).setHorizontalAlignment("center");
  ws.getRange("A2:E2").merge().setValue("Score actual: 783 Meta banca multiple: 820+")
    .setBackground("#9966CC").setFontColor("#FFFFFF").setFontStyle("italic").setHorizontalAlignment("center");
  hdr(ws, 4, 1, 5, "#7030A0");
  ["Mes", "Hito", "Score", "Estado", "Acciones"].forEach(function(v, i) { ws.getRange(4, i+1).setValue(v); });
  [["Abril 2026", "Solicitar prestamo Ademi", 783, "En curso", "Aplicar RD$5k al capital pagar a tiempo", "#FFEB9C"],
   ["Mayo 2026", "1ra cuota SAM liquidado", 800, "Proximo", "Cuota Ademi mes 1 ultimo SAM RD$4k libres", "#F2F2F2"],
   ["Junio 2026", "SAM libre 2da cuota", 808, "Proximo", "Reforzar Qik cuota Ademi puntual", "#FFEB9C"],
   ["Julio 2026", "3ra cuota pagada", 815, "Proximo", "Mantener todos los pagos al dia", "#F2F2F2"],
   ["Agosto 2026", "Prestamo liquidado", 828, "Meta", "4 meses historial bancario solicitar tarjeta", "#E2EFDA"],
   ["Sep 2026+", "Tarjeta bancaria activa", 840, "Objetivo", "Usar max 30% limite pagar balance completo", "#BDD7EE"]].forEach(function(p, i) {
    var r = 5+i;
    [p[0], p[1], p[2], p[3], p[4]].forEach(function(v, j) { ws.getRange(r, j+1).setValue(v); });
    ws.getRange(r, 3).setHorizontalAlignment("center");
    ws.getRange(r, 1, 1, 5).setBackground(p[5]); brd(ws, r, 1, 1, 5); ws.setRowHeight(r, 26);
  });
  ws.getRange("A12:E12").merge().setValue("REGLAS DE ORO")
    .setBackground("#7030A0").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
  ["1. Pagar SIEMPRE a tiempo — historial de pago es el factor principal",
   "2. No solicitar mas de un credito nuevo por semestre",
   "3. Mantener BHD con saldo positivo en todo momento",
   "4. No cancelar cuenta Credicefi — la antiguedad suma puntos",
   "5. Cuando tengas tarjeta: usar max 30% del limite y pagar balance completo",
   "6. Qik intocable — ahorro sostenido demuestra capacidad de pago"].forEach(function(reg, i) {
    var r = 13+i;
    ws.getRange(r, 1, 1, 5).merge().setValue(reg).setBackground(i%2===0?"#F2F2F2":"#FFFFFF");
    brd(ws, r, 1, 1, 5); ws.setRowHeight(r, 20);
  });
}

function setupMayo(ss) {
  var ws = ss.getSheetByName("Presupuesto Mayo") || ss.insertSheet("Presupuesto Mayo");
  ws.clear();
  [220, 130, 110, 130, 200].forEach(function(w, i) { ws.setColumnWidth(i+1, w); });
  ws.getRange("A1:E1").merge().setValue("PRESUPUESTO MAYO 2026 — con Prestamo Ademi")
    .setBackground("#375623").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(13).setHorizontalAlignment("center");
  ws.getRange("A2:E2").merge().setValue("Mes mas cargado: SAM ultimo pago + 1ra cuota Ademi")
    .setBackground("#538135").setFontColor("#FFFFFF").setFontStyle("italic").setHorizontalAlignment("center");
  hdr(ws, 4, 1, 5, "#375623");
  ["Concepto", "Monto", "Tipo", "Cuenta", "Notas"].forEach(function(v, i) { ws.getRange(4, i+1).setValue(v); });
  [["Qik ahorro Q1", 2500, "Ahorro", "Qik", "Intocable", "#BDD7EE"],
   ["Qik ahorro Q2", 2500, "Ahorro", "Qik", "Intocable", "#BDD7EE"],
   ["Banreservas Q1", 2000, "Salidas", "BHD", "Gasto libre Q1", "#FFEB9C"],
   ["Banreservas Q2", 2000, "Salidas", "BHD", "Gasto libre Q2", "#FFEB9C"],
   ["Gimnasio", 1500, "Fijo", "BHD", "Dia 1", "#F2F2F2"],
   ["Internet", 900, "Fijo", "BHD", "Limite dia 4", "#F2F2F2"],
   ["Crunchyroll", 250, "Fijo", "BHD", "Dia 3", "#F2F2F2"],
   ["SAM ULTIMO PAGO", 4000, "Deuda", "BHD", "Queda libre en junio", "#FFC7CE"],
   ["1ra cuota Ademi", 2590, "Deuda", "BHD", "Nuevo tasa 20% anual", "#FFC7CE"],
   ["Residencial", 3000, "Fijo", "BHD", "Mes completo", "#F2F2F2"],
   ["Mantenimiento vehiculo", 2000, "Variable", "BHD", "Preventivo", "#FFEB9C"],
   ["Barberia", 1000, "Variable", "BHD", "Mes completo", "#FFEB9C"],
   ["Gasolina pasola", 2000, "Variable", "BHD", "Mes completo", "#FFEB9C"],
   ["Gasolina carro", 2400, "Variable", "BHD", "Mes completo", "#FFEB9C"]].forEach(function(row, i) {
    var r = 5+i;
    ws.getRange(r, 1).setValue(row[0]);
    ws.getRange(r, 2).setValue(row[1]).setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
    ws.getRange(r, 3).setValue(row[2]); ws.getRange(r, 4).setValue(row[3]); ws.getRange(r, 5).setValue(row[4]);
    ws.getRange(r, 1, 1, 5).setBackground(row[5]); brd(ws, r, 1, 1, 5);
  });
  var tot = 19;
  ws.getRange(tot, 1).setValue("TOTAL MAYO");
  ws.getRange(tot, 2).setFormula("=SUM(B5:B18)").setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
  ws.getRange(tot, 1, 1, 5).setBackground("#1F4E79").setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11); brd(ws, tot, 1, 1, 5);
  [[20, "INGRESO MENSUAL", 37200, "#2E75B6"], [21, "MARGEN LIBRE", "=B20-B19", "#1F8B4C"]].forEach(function(t) {
    ws.getRange(t[0], 1).setValue(t[1]);
    ws.getRange(t[0], 2).setValue(t[2]).setNumberFormat('"RD$"#,##0').setHorizontalAlignment("right");
    ws.getRange(t[0], 1, 1, 2).setBackground(t[3]).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(11); brd(ws, t[0], 1, 1, 2);
  });
}

// ================================================
// WEBHOOK — recibe pagos, gastos, entradas, saldos
// ================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var tipo = data.tipo || "pago";
    if (tipo === "gasto") { registrarGasto(data); }
    else if (tipo === "entrada") { registrarEntrada(data); }
    else if (tipo === "saldo") { registrarSaldo(data); }
    else { registrarPago(data); }
    return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var estado = {
    pagos: {},
    saldos: {bhd: 0, qik: 0, banreservas: 0},
    gastosHoy: [],
    entradasMes: [],
    lastUpdate: new Date().toLocaleString("es-DO", {timeZone: "America/Santo_Domingo"})
  };

  // Leer pagos del Sheet
  var wsAbril = ss.getSheetByName("Presupuesto Abril");
  if (wsAbril) {
    var filas = wsAbril.getDataRange().getValues();
    var idMap = {
      "Qik ahorro Q1": "py-qik1",
      "Banreservas Q1": "py-banreservas1",
      "Gimnasio": "py-gimnasio",
      "Internet": "py-internet",
      "Crunchyroll": "py-crunchyroll",
      "SAM parte 1": "py-sam1",
      "Residencial adelanto": "py-residencial1",
      "Gasolina Q1": "py-gasolina1",
      "Pago carro completo": "py-carro",
      "Barberia parte 1": "py-barberia1",
      "Qik ahorro Q2": "py-qik2",
      "Banreservas Q2": "py-banreservas2",
      "SAM parte 2": "py-sam2",
      "Residencial restante": "py-residencial2",
      "Mantenimiento vehiculo": "py-mant",
      "Barberia parte 2": "py-barberia2",
      "Gasolina Q2": "py-gasolina2"
    };
    for (var i = 0; i < filas.length; i++) {
      var nombre = (filas[i][0] || "").toString();
      var estadoPago = (filas[i][2] || "").toString();
      var ts = (filas[i][4] || "").toString();
      var monto = parseFloat(filas[i][1]) || 0;
      var id = idMap[nombre];
      if (id) {
        estado.pagos[id] = {
          done: estadoPago.indexOf("Hecho") !== -1,
          nombre: nombre,
          monto: monto,
          ts: ts
        };
      }
    }
  }

  // Leer saldos mas recientes
  var wsSaldos = ss.getSheetByName("Saldos");
  if (wsSaldos && wsSaldos.getLastRow() > 1) {
    var sfilas = wsSaldos.getDataRange().getValues();
    for (var j = 1; j < sfilas.length; j++) {
      var cuenta = (sfilas[j][1] || "").toString().toLowerCase();
      var mS = parseFloat(sfilas[j][2]) || 0;
      if (cuenta === "bhd") estado.saldos.bhd = mS;
      else if (cuenta === "qik") estado.saldos.qik = mS;
      else if (cuenta === "banreservas") estado.saldos.banreservas = mS;
    }
  }

  // Leer gastos de hoy
  var wsG = ss.getSheetByName("Gastos Diarios");
  if (wsG && wsG.getLastRow() > 1) {
    var hoy = new Date().toDateString();
    var gfilas = wsG.getDataRange().getValues();
    for (var k = 1; k < gfilas.length; k++) {
      var ts2 = gfilas[k][0] ? new Date(gfilas[k][0]) : null;
      if (ts2 && ts2.toDateString() === hoy) {
        estado.gastosHoy.push({
          desc: (gfilas[k][1] || "").toString(),
          categoria: (gfilas[k][2] || "General").toString(),
          monto: parseFloat(gfilas[k][3]) || 0,
          cuenta: (gfilas[k][4] || "").toString(),
          timestamp: ts2.getTime()
        });
      }
    }
  }

  // Leer entradas del mes
  var wsE = ss.getSheetByName("Entradas");
  if (wsE && wsE.getLastRow() > 1) {
    var mesActual = new Date().getMonth();
    var efilas = wsE.getDataRange().getValues();
    for (var m = 1; m < efilas.length; m++) {
      var tsE = efilas[m][0] ? new Date(efilas[m][0]) : null;
      if (tsE && tsE.getMonth() === mesActual) {
        estado.entradasMes.push({
          desc: (efilas[m][1] || "").toString(),
          tipo: (efilas[m][2] || "").toString(),
          monto: parseFloat(efilas[m][3]) || 0,
          cuenta: (efilas[m][4] || "").toString(),
          timestamp: tsE.getTime()
        });
      }
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify(estado))
    .setMimeType(ContentService.MimeType.JSON);
}

function registrarPago(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var hojaNombre = data.hoja || "Presupuesto Abril";
  var ws = ss.getSheetByName(hojaNombre);
  if (!ws) return;
  var concepto = (data.concepto || "").toLowerCase();
  var estado = data.estado;
  var timestamp = new Date().toLocaleString("es-DO", {timeZone: "America/Santo_Domingo"});
  var datos = ws.getDataRange().getValues();
  for (var i = 0; i < datos.length; i++) {
    if (datos[i][0] && datos[i][0].toString().toLowerCase().indexOf(concepto) !== -1) {
      ws.getRange(i+1, 3).setValue(estado);
      ws.getRange(i+1, 3).setBackground(estado === "Hecho" ? "#E2EFDA" : "#FFEB9C");
      ws.getRange(i+1, 5).setValue(timestamp);
      break;
    }
  }
}

function registrarGasto(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var ws = ss.getSheetByName("Gastos Diarios");
  if (!ws) {
    ws = ss.insertSheet("Gastos Diarios");
    var headers = ["Fecha y hora", "Descripcion", "Categoria", "Monto RD$", "Cuenta", "Notas"];
    ws.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#1F4E79").setFontColor("#FFFFFF").setFontWeight("bold");
    [160, 200, 130, 120, 120, 180].forEach(function(w, i) { ws.setColumnWidth(i+1, w); });
  }
  var timestamp = new Date().toLocaleString("es-DO", {timeZone: "America/Santo_Domingo"});
  ws.appendRow([timestamp, data.descripcion||"", data.categoria||"General", data.monto||0, data.cuenta||"Banreservas", data.notas||""]);
  var lastRow = ws.getLastRow();
  ws.getRange(lastRow, 4).setNumberFormat('"RD$"#,##0');
  ws.getRange(lastRow, 1, 1, 6).setBackground(lastRow%2===0?"#F2F2F2":"#FFFFFF");
}

function registrarEntrada(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var ws = ss.getSheetByName("Entradas");
  if (!ws) {
    ws = ss.insertSheet("Entradas");
    var headers = ["Fecha y hora", "Descripcion", "Tipo", "Monto RD$", "Cuenta"];
    ws.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#1F8B4C").setFontColor("#FFFFFF").setFontWeight("bold");
    [160, 200, 130, 120, 120].forEach(function(w, i) { ws.setColumnWidth(i+1, w); });
  }
  var timestamp = new Date().toLocaleString("es-DO", {timeZone: "America/Santo_Domingo"});
  ws.appendRow([timestamp, data.desc||"", data.tipo||"Ingreso", data.monto||0, data.cuenta||"BHD"]);
  ws.getRange(ws.getLastRow(), 4).setNumberFormat('"RD$"#,##0');
}

function registrarSaldo(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var ws = ss.getSheetByName("Saldos") || ss.insertSheet("Saldos");
  if (ws.getLastRow() === 0) {
    ws.getRange(1, 1, 1, 3).setValues([["Fecha y hora", "Cuenta", "Saldo RD$"]]).setBackground("#2E75B6").setFontColor("#FFFFFF").setFontWeight("bold");
  }
  var timestamp = new Date().toLocaleString("es-DO", {timeZone: "America/Santo_Domingo"});
  ws.appendRow([timestamp, data.cuenta||"", data.monto||0]);
  ws.getRange(ws.getLastRow(), 3).setNumberFormat('"RD$"#,##0');
}

// ================================================
// HELPERS EMAIL
// ================================================

function fmtRD(n) { return "RD$" + Math.round(n).toLocaleString("es-DO"); }
function pct(a, b) { return b > 0 ? Math.round(a/b*100) : 0; }

function obtenerDatos(ss) {
  var hoy = new Date();
  var datos = {
    fechaCorta: hoy.toLocaleDateString("es-DO", {day:"numeric", month:"long", timeZone:"America/Santo_Domingo"}),
    fechaLarga: hoy.toLocaleDateString("es-DO", {weekday:"long", day:"numeric", month:"long", year:"numeric", timeZone:"America/Santo_Domingo"}),
    semana: "semana del " + hoy.toLocaleDateString("es-DO", {day:"numeric", month:"long", timeZone:"America/Santo_Domingo"}),
    pagos: {hechos: 0, total: 0, pendientes: [], hechosList: []},
    gastos: {total: 0, count: 0, items: [], categorias: {}},
    gastosHoy: {total: 0, count: 0, items: []},
    score: 783
  };
  var wsAbril = ss.getSheetByName("Presupuesto Abril");
  if (wsAbril) {
    var filas = wsAbril.getDataRange().getValues();
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      if (f[1] && typeof f[1] === "number" && f[1] > 100) {
        datos.pagos.total++;
        if ((f[2]||"").toString().indexOf("Hecho") !== -1) {
          datos.pagos.hechos++;
          datos.pagos.hechosList.push({nombre: f[0].toString(), monto: f[1], ts: f[4]||""});
        } else if (f[0] && f[0].toString().length > 2) {
          datos.pagos.pendientes.push({nombre: f[0].toString(), monto: f[1]});
        }
      }
    }
  }
  var wsG = ss.getSheetByName("Gastos Diarios");
  if (wsG && wsG.getLastRow() > 1) {
    var gf = wsG.getDataRange().getValues();
    for (var j = 1; j < gf.length; j++) {
      var m = parseFloat(gf[j][3]) || 0;
      var cat = (gf[j][2] || "General").toString();
      var ts = gf[j][0] ? new Date(gf[j][0]) : null;
      datos.gastos.total += m; datos.gastos.count++;
      datos.gastos.categorias[cat] = (datos.gastos.categorias[cat] || 0) + m;
      datos.gastos.items.push({desc: gf[j][1], monto: m, cat: cat});
      if (ts && ts.toDateString() === hoy.toDateString()) {
        datos.gastosHoy.total += m; datos.gastosHoy.count++;
        datos.gastosHoy.items.push({desc: gf[j][1], monto: m, cat: cat, hora: ts.toLocaleTimeString("es-DO", {hour:"2-digit", minute:"2-digit", timeZone:"America/Santo_Domingo"})});
      }
    }
  }
  return datos;
}

// ================================================
// EMAIL DIARIO — 8 PM todos los dias
// ================================================

function enviarResumenDiario() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var d = obtenerDatos(ss);
  var catColors = {"Comida":"#ff4f6a","Transporte":"#4f9eff","Gasolina":"#ffb830","Salud":"#00e5a0","Entretenimiento":"#a78bfa","Ropa":"#f472b6","Hogar":"#fb923c","General":"#8888a0"};
  var itemsHTML = "";
  if (d.gastosHoy.items.length === 0) {
    itemsHTML = "<tr><td style='text-align:center;padding:14px;font-size:13px;color:#44445a'>Sin gastos registrados hoy</td></tr>";
  } else {
    d.gastosHoy.items.forEach(function(g) {
      var cc = catColors[g.cat] || "#8888a0";
      itemsHTML += "<tr><td style='background:#1e1e28;border-radius:8px;padding:10px 12px;margin-bottom:6px;display:block'>";
      itemsHTML += "<table width='100%' cellpadding='0' cellspacing='0'><tr>";
      itemsHTML += "<td><div style='display:inline-block;width:8px;height:8px;border-radius:50%;background:"+cc+";vertical-align:middle;margin-right:8px'></div>";
      itemsHTML += "<span style='font-size:13px;font-weight:600;color:#f0f0f5'>"+g.desc+"</span>";
      itemsHTML += "<div style='font-size:10px;color:#8888a0;margin-top:2px;margin-left:16px'>"+g.cat+" · "+g.hora+"</div></td>";
      itemsHTML += "<td align='right'><div style='font-size:14px;font-weight:700;color:#ff4f6a'>-"+fmtRD(g.monto)+"</div></td>";
      itemsHTML += "</tr></table></td></tr><tr><td style='height:5px'></td></tr>";
    });
  }
  var pendHTML = "";
  var maxP = Math.min(d.pagos.pendientes.length, 3);
  for (var k = 0; k < maxP; k++) {
    var p = d.pagos.pendientes[k];
    pendHTML += "<tr><td style='padding-bottom:6px'><table width='100%' cellpadding='0' cellspacing='0'><tr>";
    pendHTML += "<td style='background:#1e1e28;border:1px solid rgba(255,184,48,.2);border-radius:8px;padding:10px 12px'>";
    pendHTML += "<table width='100%' cellpadding='0' cellspacing='0'><tr>";
    pendHTML += "<td style='font-size:13px;color:#f0f0f5;font-weight:600'>"+p.nombre+"</td>";
    pendHTML += "<td align='right' style='font-size:13px;font-weight:700;color:#ffb830'>"+fmtRD(p.monto)+"</td>";
    pendHTML += "</tr></table></td></tr></table></td></tr>";
  }
  if (pendHTML === "") pendHTML = "<tr><td style='text-align:center;padding:12px;font-size:13px;color:#00e5a0;font-weight:700'>Todos los pagos al dia</td></tr>";
  var hechosHTML = "";
  d.pagos.hechosList.slice(0, 5).forEach(function(p) {
    hechosHTML += "<tr><td style='padding-bottom:5px'><table width='100%' cellpadding='0' cellspacing='0'><tr>";
    hechosHTML += "<td style='background:#0d1f18;border:1px solid rgba(0,229,160,.15);border-radius:8px;padding:8px 12px'>";
    hechosHTML += "<table width='100%' cellpadding='0' cellspacing='0'><tr>";
    hechosHTML += "<td style='font-size:12px;color:#9fe1cb'><span style='color:#00e5a0;margin-right:6px'>&#10003;</span>"+p.nombre+"</td>";
    hechosHTML += "<td align='right' style='font-size:12px;color:#00e5a0;font-weight:700'>"+fmtRD(p.monto)+"</td>";
    hechosHTML += "</tr></table></td></tr></table></td></tr>";
  });
  if (hechosHTML === "") hechosHTML = "<tr><td style='text-align:center;padding:10px;font-size:12px;color:#44445a'>Sin pagos marcados aun</td></tr>";
  var H = "<!DOCTYPE html><html><head><meta charset='UTF-8'/></head>";
  H += "<body style='margin:0;padding:0;background:#0f0f14;font-family:Helvetica Neue,Arial,sans-serif'>";
  H += "<table width='100%' cellpadding='0' cellspacing='0' style='background:#0f0f14;padding:20px 16px'><tr><td align='center'>";
  H += "<table width='520' cellpadding='0' cellspacing='0' style='max-width:520px;width:100%'>";
  H += "<tr><td style='background:#111119;border-radius:16px 16px 0 0;border:1px solid rgba(255,255,255,.08);border-bottom:none;padding:24px 28px 18px'>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr>";
  H += "<td><div style='display:inline-block;background:linear-gradient(135deg,#00e5a0,#00b8ff);border-radius:9px;width:32px;height:32px;line-height:32px;text-align:center;font-size:12px;font-weight:800;color:#0a0a0f;vertical-align:middle'>JG</div>";
  H += "<span style='font-size:16px;font-weight:700;color:#f0f0f5;vertical-align:middle;margin-left:10px'>Resumen del dia</span></td>";
  H += "<td align='right' style='font-size:11px;color:#8888a0'>"+d.fechaLarga+"</td></tr></table>";
  H += "<div style='margin-top:16px'>";
  H += "<div style='font-size:32px;font-weight:800;color:#ff4f6a;letter-spacing:-1px;line-height:1'>"+fmtRD(d.gastosHoy.total)+"</div>";
  H += "<div style='font-size:12px;color:#8888a0;margin-top:4px'>gastado hoy · "+d.gastosHoy.count+" transacciones</div></div></td></tr>";
  H += "<tr><td style='background:#16161f;border:1px solid rgba(255,255,255,.08);border-top:none;border-bottom:none;padding:18px 28px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px'>Gastos de hoy</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'>"+itemsHTML+"</table></td></tr>";
  H += "<tr><td style='background:#111119;border:1px solid rgba(255,255,255,.08);border-top:none;border-bottom:none;padding:18px 28px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px'>Pagos hechos este mes ("+d.pagos.hechos+" de "+d.pagos.total+")</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'>"+hechosHTML+"</table>";
  H += "<table width='100%' cellpadding='0' cellspacing='0' style='margin-top:10px;margin-bottom:5px'><tr><td style='background:#1e1e28;border-radius:4px;height:4px;overflow:hidden'>";
  H += "<div style='background:linear-gradient(to right,#00e5a0,#00b8ff);height:4px;width:"+pct(d.pagos.hechos,d.pagos.total)+"%'></div></td></tr></table>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr><td style='font-size:10px;color:#8888a0'>"+d.pagos.hechos+" de "+d.pagos.total+" completados</td>";
  H += "<td align='right' style='font-size:10px;color:#00e5a0;font-weight:700'>"+pct(d.pagos.hechos,d.pagos.total)+"%</td></tr></table></td></tr>";
  H += "<tr><td style='background:#16161f;border:1px solid rgba(255,255,255,.08);border-top:none;border-bottom:none;padding:18px 28px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px'>Pagos pendientes</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'>"+pendHTML+"</table></td></tr>";
  H += "<tr><td style='background:#0d0d12;border:1px solid rgba(255,255,255,.08);border-top:none;border-radius:0 0 16px 16px;padding:14px 28px'>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr>";
  H += "<td style='font-size:10px;color:#44445a;line-height:1.6'>Finanzas Javier Garcia · "+d.fechaCorta+"<br/>Manana a las 8 PM recibiras el siguiente resumen.</td>";
  H += "<td align='right'><div style='background:linear-gradient(135deg,#00e5a0,#00b8ff);border-radius:8px;width:28px;height:28px;line-height:28px;text-align:center;font-size:10px;font-weight:800;color:#0a0a0f'>JG</div></td>";
  H += "</tr></table></td></tr></table></td></tr></table></body></html>";
  GmailApp.sendEmail(EMAIL_DESTINO, "Resumen del dia - "+d.fechaCorta, "Abre en Gmail.", {htmlBody: H, name: "Finanzas Javier Garcia"});
  Logger.log("Email diario enviado: " + d.fechaCorta);
}

// ================================================
// EMAIL SEMANAL — Lunes 7 AM
// ================================================

function enviarResumenSemanal() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var d = obtenerDatos(ss);
  var catColors = {"Comida":"#ff4f6a","Transporte":"#4f9eff","Gasolina":"#ffb830","Salud":"#00e5a0","Entretenimiento":"#a78bfa","Ropa":"#f472b6","Hogar":"#fb923c","General":"#8888a0"};
  var pp = pct(d.pagos.hechos, d.pagos.total);
  var pendHTML = "";
  var maxP = Math.min(d.pagos.pendientes.length, 4);
  if (maxP === 0) {
    pendHTML = "<tr><td style='background:#0d1f18;border:1px solid #1d5c3a;border-radius:10px;padding:14px;text-align:center'><div style='font-size:16px;font-weight:700;color:#00e5a0'>Todos los pagos al dia</div></td></tr>";
  } else {
    for (var i = 0; i < maxP; i++) {
      var p = d.pagos.pendientes[i];
      var bd = i===0?"rgba(255,184,48,.25)":"rgba(255,255,255,.08)";
      var ac = i===0?"#ffb830":"#f0f0f5";
      var tag = i===0?"<div style='font-size:10px;color:#ffb830;background:rgba(255,184,48,.1);padding:2px 8px;border-radius:20px;margin-top:3px;display:inline-block'>PRIORITARIO</div>":"";
      pendHTML += "<tr><td style='padding-bottom:8px'><table width='100%' cellpadding='0' cellspacing='0'><tr><td style='background:#1e1e28;border:1px solid "+bd+";border-radius:10px;padding:12px 14px'>";
      pendHTML += "<table width='100%' cellpadding='0' cellspacing='0'><tr><td><div style='font-size:13px;font-weight:600;color:#f0f0f5'>"+p.nombre+"</div></td>";
      pendHTML += "<td align='right'><div style='font-size:14px;font-weight:700;color:"+ac+"'>"+fmtRD(p.monto)+"</div>"+tag+"</td></tr></table></td></tr></table></td></tr>";
    }
  }
  var hechosHTML = "";
  d.pagos.hechosList.forEach(function(p) {
    hechosHTML += "<tr><td style='padding-bottom:5px'><table width='100%' cellpadding='0' cellspacing='0'><tr>";
    hechosHTML += "<td style='background:#0d1f18;border:1px solid rgba(0,229,160,.15);border-radius:8px;padding:8px 12px'>";
    hechosHTML += "<table width='100%' cellpadding='0' cellspacing='0'><tr>";
    hechosHTML += "<td style='font-size:12px;color:#9fe1cb'><span style='color:#00e5a0;margin-right:6px'>&#10003;</span>"+p.nombre+"</td>";
    hechosHTML += "<td align='right' style='font-size:12px;color:#00e5a0;font-weight:700'>"+fmtRD(p.monto)+"</td>";
    hechosHTML += "</tr></table></td></tr></table></td></tr>";
  });
  if (hechosHTML === "") hechosHTML = "<tr><td style='text-align:center;padding:10px;font-size:12px;color:#44445a'>Sin pagos marcados aun</td></tr>";
  var catKeys = Object.keys(d.gastos.categorias).sort(function(a,b){return d.gastos.categorias[b]-d.gastos.categorias[a];});
  var catHTML = catKeys.length === 0 ? "<tr><td colspan='3' style='text-align:center;padding:12px;font-size:12px;color:#44445a'>Sin gastos registrados</td></tr>" : "";
  catKeys.slice(0,4).forEach(function(cat) {
    var cm = d.gastos.categorias[cat];
    var cw = d.gastos.total > 0 ? Math.round(cm/d.gastos.total*100) : 0;
    var cc = catColors[cat] || "#8888a0";
    catHTML += "<tr><td style='font-size:11px;color:#8888a0;padding:5px 0;white-space:nowrap'>"+cat+"</td>";
    catHTML += "<td style='padding:5px 8px'><table width='100%' cellpadding='0' cellspacing='0'><tr><td style='background:#1e1e28;border-radius:3px;height:4px'><div style='background:"+cc+";height:4px;width:"+cw+"%;border-radius:3px'></div></td></tr></table></td>";
    catHTML += "<td align='right' style='font-size:11px;color:#f0f0f5;padding:5px 0;white-space:nowrap'>"+fmtRD(cm)+"</td></tr>";
  });
  var topCat = catKeys.length > 0 ? catKeys[0] : "ninguna";
  var H = "<!DOCTYPE html><html><head><meta charset='UTF-8'/></head><body style='margin:0;padding:0;background:#0f0f14;font-family:Helvetica Neue,Arial,sans-serif'>";
  H += "<table width='100%' cellpadding='0' cellspacing='0' style='background:#0f0f14;padding:24px 16px'><tr><td align='center'>";
  H += "<table width='600' cellpadding='0' cellspacing='0' style='max-width:600px;width:100%'>";
  H += "<tr><td style='background:#111119;border-radius:16px 16px 0 0;border:1px solid rgba(255,255,255,.08);border-bottom:none;padding:28px 32px 22px'>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr>";
  H += "<td><div style='display:inline-block;background:linear-gradient(135deg,#00e5a0,#00b8ff);border-radius:9px;width:36px;height:36px;line-height:36px;text-align:center;font-size:13px;font-weight:800;color:#0a0a0f;vertical-align:middle'>JG</div>";
  H += "<span style='font-size:18px;font-weight:700;color:#f0f0f5;vertical-align:middle;margin-left:10px'>Finanzas Javier Garcia</span></td>";
  H += "<td align='right' style='font-size:11px;color:#8888a0'>"+d.fechaLarga+"</td></tr></table>";
  H += "<div style='height:1px;background:rgba(255,255,255,.07);margin-top:20px'></div>";
  H += "<div style='margin-top:16px'><div style='font-size:10px;color:#8888a0;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px'>"+d.semana+"</div>";
  H += "<div style='font-size:13px;color:#8888a0;line-height:1.6'>Panorama completo de la semana.</div></div></td></tr>";
  H += "<tr><td style='background:#16161f;border:1px solid rgba(255,255,255,.08);border-top:none;border-bottom:none;padding:20px 32px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px'>Pagos pendientes</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'>"+pendHTML+"</table></td></tr>";
  H += "<tr><td style='background:#0d1f18;border:1px solid rgba(0,229,160,.1);border-top:none;border-bottom:none;padding:20px 32px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px'>Pagos completados este mes ("+d.pagos.hechos+" de "+d.pagos.total+")</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'>"+hechosHTML+"</table></td></tr>";
  H += "<tr><td style='background:#111119;border:1px solid rgba(255,255,255,.08);border-top:none;border-bottom:none;padding:18px 32px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px'>Progreso de pagos - Abril 2026</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:5px'><tr><td style='background:#1e1e28;border-radius:4px;height:5px;overflow:hidden'>";
  H += "<div style='background:linear-gradient(to right,#00e5a0,#00b8ff);height:5px;width:"+pp+"%'></div></td></tr></table>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr><td style='font-size:11px;color:#8888a0'>"+d.pagos.hechos+" de "+d.pagos.total+" pagos completados</td>";
  H += "<td align='right' style='font-size:11px;color:#00e5a0;font-weight:700'>"+pp+"%</td></tr></table></td></tr>";
  H += "<tr><td style='background:#16161f;border:1px solid rgba(255,255,255,.08);border-top:none;border-bottom:none;padding:20px 32px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px'>Gastos acumulados del mes</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:14px'><tr>";
  H += "<td width='33%' style='text-align:center'><div style='font-size:22px;font-weight:800;color:#ff4f6a'>"+fmtRD(d.gastos.total)+"</div><div style='font-size:10px;color:#8888a0;margin-top:4px;text-transform:uppercase'>Total</div></td>";
  H += "<td width='33%' style='text-align:center;border-left:1px solid rgba(255,255,255,.07)'><div style='font-size:22px;font-weight:800;color:#f0f0f5'>"+d.gastos.count+"</div><div style='font-size:10px;color:#8888a0;margin-top:4px;text-transform:uppercase'>Transacciones</div></td>";
  H += "<td width='33%' style='text-align:center;border-left:1px solid rgba(255,255,255,.07)'><div style='font-size:18px;font-weight:800;color:#a78bfa'>"+topCat+"</div><div style='font-size:10px;color:#8888a0;margin-top:4px;text-transform:uppercase'>Cat #1</div></td></tr></table>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'>"+catHTML+"</table></td></tr>";
  H += "<tr><td style='background:#111119;border:1px solid rgba(255,255,255,.08);border-top:none;border-bottom:none;padding:20px 32px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px'>Deudas activas</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:10px'><tr><td style='background:#1e1e28;border:1px solid rgba(0,229,160,.12);border-radius:10px;padding:12px 14px'>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr><td><div style='font-size:12px;font-weight:700;color:#f0f0f5'>SAM - Ahorro interno</div>";
  H += "<div style='font-size:10px;color:#8888a0;margin-top:2px'>Proximo Q2 abril - Liquida mayo 2026</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0' style='margin-top:6px'><tr><td style='background:#111119;border-radius:3px;height:3px'><div style='background:#00e5a0;height:3px;width:40%;border-radius:3px'></div></td></tr></table></td>";
  H += "<td align='right' style='padding-left:12px'><div style='font-size:15px;font-weight:800;color:#00e5a0'>RD$6,000</div><div style='font-size:10px;color:#00e5a0;margin-top:2px'>pendiente</div></td></tr></table></td></tr></table>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr><td style='background:#1e1e28;border:1px solid rgba(255,184,48,.12);border-radius:10px;padding:12px 14px'>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr><td><div style='font-size:12px;font-weight:700;color:#f0f0f5'>Banco Ademi - Prestamo consumo</div>";
  H += "<div style='font-size:10px;color:#8888a0;margin-top:2px'>1ra cuota mayo 2026 - 4 meses - tasa 20%</div>";
  H += "<table width='100%' cellpadding='0' cellspacing='0' style='margin-top:6px'><tr><td style='background:#111119;border-radius:3px;height:3px'><div style='background:#ffb830;height:3px;width:5%;border-radius:3px'></div></td></tr></table></td>";
  H += "<td align='right' style='padding-left:12px'><div style='font-size:15px;font-weight:800;color:#ffb830'>RD$2,590/mes</div><div style='font-size:10px;color:#ffb830;margin-top:2px'>x 4 meses</div></td></tr></table></td></tr></table></td></tr>";
  H += "<tr><td style='background:#16161f;border:1px solid rgba(255,255,255,.08);border-top:none;border-bottom:none;padding:18px 32px'>";
  H += "<div style='font-size:10px;color:#44445a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px'>Score crediticio</div>";
  H += "<div style='font-size:36px;font-weight:800;color:#00e5a0;letter-spacing:-1px;line-height:1'>"+d.score+"</div>";
  H += "<div style='font-size:11px;color:#8888a0;margin-top:4px'>Meta tarjeta bancaria: 820+ - proyectado agosto 2026</div></td></tr>";
  H += "<tr><td style='background:#0d1f18;border:1px solid rgba(0,229,160,.15);border-top:none;border-bottom:none;padding:14px 32px'>";
  H += "<div style='font-size:10px;color:#00e5a0;font-weight:700;margin-bottom:4px'>TIP DE LA SEMANA</div>";
  H += "<div style='font-size:12px;color:#9fe1cb;line-height:1.6'>Al cobrar transfiere primero a Qik y Banreservas antes de tocar nada. Asi bloqueas el ahorro automaticamente.</div></td></tr>";
  H += "<tr><td style='background:#0d0d12;border:1px solid rgba(255,255,255,.08);border-top:none;border-radius:0 0 16px 16px;padding:18px 32px'>";
  H += "<table width='100%' cellpadding='0' cellspacing='0'><tr>";
  H += "<td style='font-size:10px;color:#44445a;line-height:1.6'>Finanzas Javier Garcia - generado automaticamente<br/>Apps Script + Google Sheets - Santo Domingo, RD</td>";
  H += "<td align='right'><div style='background:linear-gradient(135deg,#00e5a0,#00b8ff);border-radius:8px;width:30px;height:30px;line-height:30px;text-align:center;font-size:10px;font-weight:800;color:#0a0a0f'>JG</div></td>";
  H += "</tr></table></td></tr></table></td></tr></table></body></html>";
  GmailApp.sendEmail(EMAIL_DESTINO, "Finanzas - Resumen " + d.semana, "Abre en Gmail.", {htmlBody: H, name: "Finanzas Javier Garcia"});
  Logger.log("Email semanal enviado");
}

// ================================================
// TRIGGERS Y TEST
// ================================================

function crearTriggerDiario() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "enviarResumenDiario") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("enviarResumenDiario").timeBased().everyDays(1).atHour(20).create();
  Logger.log("Trigger diario creado: 8 PM todos los dias");
}

function crearTriggerSemanal() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "enviarResumenSemanal") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("enviarResumenSemanal").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  Logger.log("Trigger semanal creado: lunes 7 AM");
}

function testEmail() {
  enviarResumenSemanal();
  Logger.log("Email semanal de prueba enviado a " + EMAIL_DESTINO);
}

function testEmailDiario() {
  enviarResumenDiario();
  Logger.log("Email diario de prueba enviado a " + EMAIL_DESTINO);
}
```
