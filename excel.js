/* Gera o .xlsx no navegador (mesmo layout de core/excel.py). Requer ExcelJS. */
(function (raiz) {
  "use strict";
  var AZUL = "FF1F3A5F", VERMELHO = "FFFBE3E3", AMARELO = "FFFFF6D6";
  var FMT_MOEDA = "[$-416]#,##0.00;[Red][$-416]-#,##0.00";
  var FMT_DATA = "DD/MM/YYYY";
  var fino = { style: "thin", color: { argb: "FFD0D0D0" } };
  var BORDA = { top: fino, bottom: fino, left: fino, right: fino };

  function n(c) { return (c === null || c === undefined) ? null : c / 100; }
  function dt(d) { return d ? new Date(d.t) : null; }
  function fill(argb) { return { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; }
  function cab(ws, titulos, larguras) {
    var r = ws.getRow(1);
    titulos.forEach(function (t, i) {
      var c = r.getCell(i + 1);
      c.value = t; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(AZUL);
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = BORDA;
      ws.getColumn(i + 1).width = larguras[i];
    });
  }

  async function gerarExcel(ExcelJS, res, nomeArquivo) {
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet("Extrato", { views: [{ state: "frozen", ySplit: 1 }] });
    cab(ws, ["Data", "Histórico", "Documento", "Crédito", "Débito", "Valor", "Saldo (extrato)", "Saldo calculado",
      "Conferência", "Origem do sinal", "Página"], [12, 60, 16, 14, 14, 14, 16, 16, 13, 26, 8]);
    var txs = res.transacoes;
    txs.forEach(function (t, k) {
      var i = k + 2, r = ws.getRow(i), v = t.valor;
      var vals = [dt(t.data), t.descricao, t.documento || null, v > 0 ? n(v) : null, v < 0 ? n(-v) : null, n(v),
        n(t.saldo), n(t.saldo_calculado), t.confere === null || t.confere === undefined ? "" : (t.confere ? "OK" : "DIVERGE"),
        t.fonte_sinal, t.pagina];
      var cor = t.confere === false ? VERMELHO : (t.fonte_sinal.indexOf("verificar") >= 0 ? AMARELO : null);
      vals.forEach(function (x, c) {
        var cel = r.getCell(c + 1);
        cel.value = x; cel.border = BORDA;
        if (c === 0) cel.numFmt = FMT_DATA;
        if (c >= 3 && c <= 7) cel.numFmt = FMT_MOEDA;
        if (cor) cel.fill = fill(cor);
      });
      r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    });
    var tot = txs.length + 2, rt = ws.getRow(tot);
    rt.getCell(2).value = "TOTAIS"; rt.getCell(2).font = { bold: true };
    [[4, res.creditos], [5, -res.debitos], [6, res.creditos + res.debitos]].forEach(function (p) {
      var c = rt.getCell(p[0]); c.value = n(p[1]); c.numFmt = FMT_MOEDA; c.font = { bold: true };
    });
    if (txs.length) ws.autoFilter = "A1:K" + (txs.length + 1);

    var r = wb.addWorksheet("Resumo");
    r.getColumn(1).width = 34; r.getColumn(2).width = 46;
    var meta = res.metadados || {}, per = meta.periodo;
    function br(d) { return String(d.d).padStart(2, "0") + "/" + String(d.m).padStart(2, "0") + "/" + d.y; }
    var linhas = [
      ["Arquivo", nomeArquivo],
      ["Banco", res.banco + (res.banco_detectado ? " (detectado automaticamente)" : " (selecionado)")],
      ["Agência", meta.agencia || ""], ["Conta", meta.conta || ""], ["CNPJ no extrato", meta.cnpj || ""],
      ["Período", per ? br(per[0]) + " a " + br(per[1]) : ""],
      ["Páginas", res.paginas], ["Movimentações extraídas", txs.length],
      ["Saldo inicial", n(res.saldo_inicial), 1], ["(+) Créditos", n(res.creditos), 1], ["(-) Débitos", n(res.debitos), 1],
      ["Saldo final calculado", n(res.saldo_final_calculado), 1], ["Saldo final no extrato", n(res.saldo_final_informado), 1],
      ["Diferença", n(res.diferenca), 1], ["Pontos de saldo conferidos", res.pontos_conferidos],
      ["Divergências de saldo", res.divergencias], ["Sinais deduzidos a verificar", res.sinais_a_verificar],
      ["RESULTADO", res.status]
    ];
    linhas.forEach(function (l, k) {
      var a = r.getCell(k + 1, 1), b = r.getCell(k + 1, 2);
      a.value = l[0]; a.font = { bold: true }; a.border = BORDA;
      b.value = l[1]; b.border = BORDA; if (l[2]) b.numFmt = FMT_MOEDA;
    });
    var st = r.getCell(18, 2);
    st.font = { bold: true, color: { argb: "FFFFFFFF" } };
    st.fill = fill({ CONFERIDO: "FF2E7D32", DIVERGENTE: "FFC62828" }[res.status] || "FFB26A00");
    r.getCell(20, 1).value = "Legenda"; r.getCell(20, 1).font = { bold: true };
    r.getCell(21, 1).value = "Linha vermelha"; r.getCell(21, 1).fill = fill(VERMELHO);
    r.getCell(21, 2).value = "Saldo calculado não bate com o saldo impresso no extrato";
    r.getCell(22, 1).value = "Linha amarela"; r.getCell(22, 1).fill = fill(AMARELO);
    r.getCell(22, 2).value = "Sinal (crédito/débito) deduzido - conferir";
    if (res.paginas_sem_texto.length) {
      r.getCell(24, 1).value = "Páginas sem texto (imagem)"; r.getCell(24, 1).font = { bold: true, color: { argb: "FFC62828" } };
      r.getCell(24, 2).value = res.paginas_sem_texto.join(", ") + " - PDF escaneado: essas páginas não foram lidas";
    }

    var a = wb.addWorksheet("Linhas não importadas");
    cab(a, ["Página", "Texto da linha", "Motivo"], [8, 100, 40]);
    res.ignoradas.forEach(function (ig, k) {
      var row = a.getRow(k + 2);
      row.getCell(1).value = ig.pagina; row.getCell(2).value = ig.texto; row.getCell(3).value = ig.motivo;
    });
    return await wb.xlsx.writeBuffer();
  }

  if (typeof module !== "undefined") module.exports = { gerarExcel: gerarExcel }; else raiz.GeradorExcel = { gerarExcel: gerarExcel };
})(this);
