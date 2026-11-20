/* Motor de extracao de extratos (porte fiel de core/extrator.py).
   Valores em centavos (inteiros) para nao ter erro de arredondamento. */
(function (raiz) {
  "use strict";
  var BANCOS_ = (typeof BANCOS !== "undefined") ? BANCOS : require("./bancos.js");

  var MESES = { JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12,
    JANEIRO:1,FEVEREIRO:2,MARCO:3,ABRIL:4,MAIO:5,JUNHO:6,JULHO:7,AGOSTO:8,SETEMBRO:9,OUTUBRO:10,NOVEMBRO:11,DEZEMBRO:12,
    FEB:2,APR:4,MAY:5,AUG:8,SEP:9,OCT:10,DEC:12 };

  function norm(s) {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  }
  function stripChars(s, chars) {
    var a = 0, b = s.length;
    while (a < b && chars.indexOf(s[a]) >= 0) a++;
    while (b > a && chars.indexOf(s[b - 1]) >= 0) b--;
    return s.slice(a, b);
  }

  var NUM_RE = /^(\(|[-+−]|-?R\$-?|R\$[-−]?)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(-|\+|\)|\*|D|C|\(-\)|\(\+\))?$/i;
  var PREFIXOS = { "-":1, "+":1, "−":1, "R$":1, "-R$":1, "R$-":1, "(-)":1, "(+)":1 };
  var SUFIXOS = { D:1, C:1, "-":1, "+":1, "(-)":1, "(+)":1, "*":1, DB:1, CR:1 };
  var DATA_NUM_RE = /^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/;
  var DATA_MES_RE = /^(\d{1,2})[\/\-]([A-Z]{3,9})(?:[\/\-](\d{2}|\d{4}))?$/;

  var ROTULOS = {
    "DATA":"data","DIA":"data","DT":"data","DT.":"data",
    "HISTORICO":"desc","DESCRICAO":"desc","LANCAMENTO":"desc","LANCAMENTOS":"desc","TITULO":"desc","DETALHE":"desc",
    "DETALHES":"desc","MOVIMENTACAO":"desc","IDENTIFICACAO":"desc","TRANSACAO":"desc","ESTABELECIMENTO":"desc",
    "DOCUMENTO":"doc","DOCTO":"doc","DOCTO.":"doc","DOC":"doc","DOC.":"doc","LOTE":"doc","ID":"doc","NR.DOC.":"doc",
    "N.DOC":"doc","AUTENTICACAO":"doc",
    "VALOR":"valor","VALORES":"valor","MOVIMENTO":"valor","MOVIMENTOS":"valor","QUANTIA":"valor","MONTANTE":"valor",
    "CREDITO":"cred","CREDITOS":"cred","ENTRADA":"cred","ENTRADAS":"cred",
    "DEBITO":"deb","DEBITOS":"deb","SAIDA":"deb","SAIDAS":"deb",
    "SALDO":"saldo","SALDOS":"saldo"
  };
  var PAPEIS_VALOR = ["valor", "cred", "deb", "saldo"];
  var APOS_DATA = { LANCAMENTO:1, MOV:1, "MOV.":1, MOVIMENTO:1, CONTABIL:1, OPERACAO:1, TRANSACAO:1, BALANCETE:1 };

  var SALDO_RE = /^(SALDO\b|S A L D O\b|SDO\b)|\bSALDO (DO DIA|ANTERIOR|FINAL|INICIAL|EM C\/?C|TOTAL|EM CONTA|DISPONIVEL)\b/;
  var SALDO_NAO_CONTA = /BLOQUEAD|LIMITE|PROVISIONAD|A LIBERAR|INVESTIDO|APLICADO|CHEQUE ESPECIAL|PARA SAQUE/;
  var TOTAL_RE = /^(SUB ?TOTAL|TOTAL)( DE| DO| DOS| DAS| GERAL| ENTRADAS| SAIDAS| CREDITOS| DEBITOS|:|$)/;
  var SECAO_MAIS = /^(TOTAL DE )?(ENTRADAS|CREDITOS|RECEBIMENTOS)\b/;
  var SECAO_MENOS = /^(TOTAL DE )?(SAIDAS|DEBITOS|PAGAMENTOS)\b/;
  var DT_ = "(\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{1,2} (DE )?[A-Z]{3,9}\\.?( DE)? \\d{4})";
  var PERIODO_RE = new RegExp("^(PERIODO\\b.*)?" + DT_ + "\\s*(A|ATE|-|\\u2013)\\s*" + DT_ + "$|^PERIODO\\b");
  var RUIDO_RE = new RegExp("(PAGINA \\d|PAG\\.? ?\\d+ ?(DE|/) ?\\d+|^\\d+ ?(DE|/) ?\\d+$|\\bSAC\\b|OUVIDORIA|WWW\\.|HTTPS?:|" +
    "CENTRAL DE ATENDIMENTO|DEFICIENTE AUDITIVO|DEFICIENCIA AUDITIVA|CAPITAIS E REGIOES|" +
    "DEMAIS LOCALIDADES|EMITIDO EM|DATA DE EMISSAO|GERADO EM|IMPRESSO EM|DATA/HORA|" +
    "^EXTRATO( DE| CONTA| CONSOLIDADO|$)|CONSULTA REALIZADA|OS DADOS ACIMA|AS INFORMACOES ACIMA)");
  var PALAVRAS_DEBITO = new RegExp("\\b(PAGTO|PAGAMENTO|PAG|PGTO|TARIFA|TAR|ENVIAD[OA]|ENV|SAQUE|DEBITO|DEB|COMPRA|IOF|" +
    "APLICACAO|APLIC|BOLETO PAGO|CHEQUE COMPENSADO|CH COMPENSADO|TRANSF ENVIADA|" +
    "TRANSFERENCIA ENVIADA|ENCARGOS|ANUIDADE|CESTA|MENSALIDADE|DARF|GPS|DAS|FGTS|" +
    "CONVENIO|EMPRESTIMO PARC|PARCELA|SISPAG|PIX ENVIADO|TED ENVIADA|DOC ENVIADO)\\b");
  var PALAVRAS_CREDITO = new RegExp("\\b(RECEBID[OA]|REC|RECEB|DEPOSITO|DEP|CREDITO|CRED|RESGATE|RESG|ESTORNO|DEVOLUCAO|" +
    "DEVOL|RENDIMENTO|RENDIMENTOS|SALARIO|LIQUIDACAO COBRANCA|COBRANCA LIQUIDADA|" +
    "TRANSF RECEBIDA|TRANSFERENCIA RECEBIDA|PIX RECEBIDO|TED RECEBIDA|ENTRADA)\\b");

  function centavos(txt) { return parseInt(txt.replace(/\./g, "").replace(",", ""), 10); }
  function fmtBRL(c) {
    if (c === null || c === undefined) return "";
    var neg = c < 0; c = Math.abs(c);
    var int = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + int + "," + String(c % 100).padStart(2, "0");
  }

  // ------------------------------------------------------------ datas
  function D(y, m, d) {
    var t = Date.UTC(y, m - 1, d), x = new Date(t);
    if (x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d) return null;
    return { y: y, m: m, d: d, t: t };
  }
  function iguais(a, b) { return a && b && a.t === b.t; }
  var DIA = 86400000;

  // ------------------------------------------------------------ bancos
  function perfil(id) {
    for (var i = 0; i < BANCOS_.length; i++) if (BANCOS_[i].id === id) return BANCOS_[i];
    return perfil("generico");
  }
  function detectarBanco(texto) {
    var melhor = null, mp = 0, topo = texto.slice(0, 4000);
    BANCOS_.forEach(function (b) {
      var p = 0;
      (b.chaves || []).forEach(function (ch) {
        if (ch.length <= 3) {
          if (new RegExp("\\b" + ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(topo)) p += 2;
          return;
        }
        if (topo.indexOf(ch) >= 0) p += 3; else if (texto.indexOf(ch) >= 0) p += 1;
      });
      if (p > mp) { melhor = b; mp = p; }
    });
    return melhor || perfil("generico");
  }

  // ------------------------------------------------------------ leitura (pdf.js)
  /* Converte o PDF em palavras com posicao, como o pdfplumber. */
  async function lerPdf(pdfjsLib, dados, senha) {
    var tarefa = pdfjsLib.getDocument({ data: dados, password: senha || "", isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    var doc;
    try { doc = await tarefa.promise; }
    catch (e) {
      if (e && (e.name === "PasswordException" || /password/i.test(e.message || ""))) {
        var err = new Error("O PDF esta protegido por senha."); err.senha = true; err.incorreta = !!senha; throw err;
      }
      throw e;
    }
    var paginas = [];
    for (var n = 1; n <= doc.numPages; n++) {
      var pg = await doc.getPage(n);
      var vp = pg.getViewport({ scale: 1 });
      var tc = await pg.getTextContent();
      var brutas = [];
      tc.items.forEach(function (it) {
        if (!it.str || !it.str.trim()) return;
        var t = it.transform;
        if (Math.abs(t[1]) > 0.01 * Math.abs(t[0]) + 0.001 || Math.abs(t[2]) > 0.01 * Math.abs(t[3]) + 0.001) return; // texto girado
        var h = Math.hypot(t[2], t[3]) || it.height || 8;
        var p = vp.convertToViewportPoint(t[4], t[5]);
        var x = p[0], base = p[1];
        var cw = (it.width || h * 0.5 * it.str.length) / it.str.length;
        var re = /\S+/g, m;
        while ((m = re.exec(it.str))) {
          var x0 = x + m.index * cw;
          brutas.push({ text: m[0], x0: x0, x1: x0 + m[0].length * cw, top: base - h * 0.8, bottom: base + h * 0.2, h: h });
        }
      });
      // junta pedacos da mesma palavra (pdfs que escrevem letra por letra)
      brutas.sort(function (a, b) { return (Math.round(a.top) - Math.round(b.top)) || (a.x0 - b.x0); });
      var palavras = [];
      brutas.forEach(function (w) {
        var u = palavras[palavras.length - 1];
        if (u && Math.abs(u.top - w.top) < 1 && w.x0 - u.x1 < Math.min(1.5, 0.12 * w.h) && w.x0 >= u.x0) {
          u.text += w.text; u.x1 = Math.max(u.x1, w.x1); u.bottom = Math.max(u.bottom, w.bottom);
        } else palavras.push(w);
      });
      paginas.push({ numero: n, largura: vp.width, altura: vp.height, palavras: palavras });
    }
    return paginas;
  }

  function montarLinhas(paginas) {
    var linhas = [];
    paginas.forEach(function (pg) {
      var ws = pg.palavras.slice().sort(function (a, b) {
        return (Math.round(a.top * 10) - Math.round(b.top * 10)) || (a.x0 - b.x0);
      });
      var grupos = [];
      ws.forEach(function (w) {
        var meio = (w.top + w.bottom) / 2, alvo = null;
        var ult = grupos.slice(-3);
        for (var i = 0; i < ult.length; i++) {
          if (Math.abs(ult[i].meio - meio) <= Math.max(2.5, 0.35 * (w.bottom - w.top))) { alvo = ult[i]; break; }
        }
        if (!alvo) { alvo = { meio: meio, palavras: [] }; grupos.push(alvo); }
        alvo.palavras.push(w);
      });
      grupos.forEach(function (g) {
        var p = g.palavras.slice().sort(function (a, b) { return a.x0 - b.x0; });
        var texto = p.map(function (w) { return w.text; }).join(" ");
        linhas.push({
          pagina: pg.numero, top: Math.min.apply(null, p.map(function (w) { return w.top; })),
          bottom: Math.max.apply(null, p.map(function (w) { return w.bottom; })), x0: p[0].x0,
          palavras: p, texto: texto, ntexto: norm(texto), largura_pagina: pg.largura
        });
      });
    });
    linhas.sort(function (a, b) { return (a.pagina - b.pagina) || (a.top - b.top); });
    return linhas;
  }

  // ------------------------------------------------------------ tokens
  function acharValores(ws) {
    var valores = [], usados = {}, i = 0;
    while (i < ws.length) {
      var t = ws[i].text.trim(), m = NUM_RE.exec(t);
      if (!m) { i++; continue; }
      var pre = m[1] || "", suf = m[3] || "", idx = [i], x0 = ws[i].x0, j = i - 1;
      while (j >= 0 && idx.length < 3 && !usados[j]) {
        var tj = ws[j].text.trim();
        if (PREFIXOS[tj.toUpperCase()] && ws[i].x0 - ws[j].x1 < 8) { pre = tj + pre; idx.unshift(j); x0 = ws[j].x0; j--; }
        else break;
      }
      if (!suf && i + 1 < ws.length) {
        var tn = ws[i + 1].text.trim().toUpperCase();
        if (SUFIXOS[tn] && ws[i + 1].x0 - ws[i].x1 < 10) { suf = tn; idx.push(i + 1); }
      }
      var p = pre.toUpperCase(), s = suf.toUpperCase(), sinal = 0;
      if (p.indexOf("-") >= 0 || p.indexOf("−") >= 0 || s === "-" || s === "D" || s === "(-)" || s === "DB" || (p === "(" && s === ")")) sinal = -1;
      else if (p.indexOf("+") >= 0 || s === "+" || s === "C" || s === "(+)" || s === "CR") sinal = 1;
      valores.push({ valor: centavos(m[2]), sinal: sinal, x0: x0, x1: ws[i].x1, centro: (x0 + ws[i].x1) / 2, idx: idx });
      idx.forEach(function (k) { usados[k] = true; });
      i = Math.max.apply(null, idx) + 1;
    }
    return { valores: valores, usados: usados };
  }

  function acharData(ws, largura, limiteX) {
    if (!ws.length) return { data: null, n: 0 };
    var lim = (limiteX !== null && limiteX !== undefined) ? limiteX : largura * 0.30;
    if (ws[0].x0 > lim) return { data: null, n: 0 };
    var toks = ws.slice(0, 6).map(function (w) { return norm(w.text); });
    function num(i) {
      var m = i < toks.length ? DATA_NUM_RE.exec(toks[i]) : null;
      if (m) {
        var d = +m[1], mt = +m[2];
        if (d >= 1 && d <= 31 && mt >= 1 && mt <= 12) {
          var ano = m[3] ? (+m[3] + (m[3].length === 2 ? 2000 : 0)) : null;
          return { data: [d, mt, ano], n: 1 };
        }
      }
      m = i < toks.length ? DATA_MES_RE.exec(toks[i]) : null;
      if (m && MESES[m[2]]) {
        var d2 = +m[1], a = m[3];
        if (d2 >= 1 && d2 <= 31) return { data: [d2, MESES[m[2]], a ? (+a + (a.length === 2 ? 2000 : 0)) : null], n: 1 };
      }
      if (i < toks.length && /^\d+$/.test(toks[i]) && +toks[i] >= 1 && +toks[i] <= 31) {
        var k = i + 1;
        if (k < toks.length && toks[k] === "DE") k++;
        var mes = k < toks.length ? toks[k].replace(/\.+$/, "") : "";
        if (MESES[mes]) {
          var anoN = null, us = k + 1 - i, k2 = k + 1;
          if (k2 < toks.length && toks[k2] === "DE") k2++;
          if (k2 < toks.length && /^\d{4}$/.test(toks[k2])) { anoN = +toks[k2]; us = k2 + 1 - i; }
          return { data: [+toks[i], MESES[mes], anoN], n: us };
        }
      }
      return { data: null, n: 0 };
    }
    var r = num(0);
    if (!r.data) return r;
    var r2 = num(r.n);
    if (r2.data) r.n += r2.n;
    return r;
  }

  function ehCabecalho(ln, extras) {
    var toks = ln.palavras.map(function (w) { return stripChars(norm(w.text), "():"); });
    if (toks.length > 18) return null;
    var papeis = {};
    toks.forEach(function (t, i) {
      var w = ln.palavras[i];
      var papel = extras[t] || ROTULOS[t];
      if (papel === "desc" && i > 0 && ["DATA", "DT", "DT."].indexOf(toks[i - 1]) >= 0 && APOS_DATA[t]) papel = "data";
      if (APOS_DATA[t] && i > 0 && (toks[i - 1] === "DATA" || toks[i - 1] === "DT")) papel = "data";
      if (!papel) return;
      var span = papeis[papel];
      if (span && w.x0 - span[1] < 25) papeis[papel] = [span[0], w.x1];
      else if (!span) papeis[papel] = [w.x0, w.x1];
    });
    var temValor = PAPEIS_VALOR.some(function (p) { return papeis[p]; });
    var temTexto = papeis.data || papeis.desc;
    return (Object.keys(papeis).length >= 3 && temValor && temTexto) ? papeis : null;
  }

  function classificarValores(valores, cab) {
    if (!valores.length) return [];
    if (cab) {
      var colunas = PAPEIS_VALOR.filter(function (p) { return cab[p]; }).map(function (p) { return [p, cab[p]]; });
      if (colunas.length) {
        var papeis = valores.map(function (v) {
          var melhor = null, dist = 1e9;
          colunas.forEach(function (c) {
            var a = c[1][0], b = c[1][1], d;
            if (a - 4 <= v.centro && v.centro <= b + 4) d = 0;
            else d = Math.min(Math.abs(v.centro - (a + b) / 2), Math.abs(v.x1 - b), Math.abs(v.x0 - a));
            if (d < dist) { melhor = c[0]; dist = d; }
          });
          return melhor;
        });
        var ult = papeis[papeis.length - 1];
        if (valores.length >= 2 && papeis.filter(function (p) { return p === ult; }).length > 1 && papeis.indexOf("saldo") < 0) papeis[papeis.length - 1] = "saldo";
        if (!cab.saldo && valores.length === 1 && papeis[0] === "saldo") papeis[0] = "valor";
        return papeis;
      }
    }
    if (valores.length === 1) return ["valor"];
    return valores.map(function (_, i) { return i === valores.length - 1 ? "saldo" : "valor"; });
  }

  function resolverData(data, periodo, seq) {
    var d = data[0], m = data[1], a = data[2];
    if (a === null) {
      if (periodo) {
        var anos = [periodo[0].y, periodo[1].y].filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();
        for (var i = 0; i < anos.length; i++) {
          var x = D(anos[i], m, d);
          if (!x) continue;
          if (periodo[0].t - 5 * DIA <= x.t && x.t <= periodo[1].t + 5 * DIA) { a = anos[i]; break; }
        }
      }
      if (a === null) {
        a = seq.ano || (periodo ? periodo[0].y : new Date().getFullYear());
        if (seq.mes && m < seq.mes - 6) a += 1;
        else if (seq.mes && m > seq.mes + 6) a -= 1;
      }
    }
    seq.ano = a; seq.mes = m;
    return D(a, m, d);
  }

  function dataBR(s) { var p = s.split("/"); return D(+p[2], +p[1], +p[0]); }
  function extrairMetadados(t) {
    var meta = {}, m;
    if ((m = /AG(?:ENCIA|\.)?\s*[:\-]?\s*(\d{3,5}(?:-\d)?)/.exec(t))) meta.agencia = m[1];
    if ((m = /CONTA(?: CORRENTE| PAGAMENTO| CC| C\/C)?\s*[:\-]?\s*(\d[\d.]{2,14}-?[\dX])\b/.exec(t))) meta.conta = m[1];
    if ((m = /\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/.exec(t))) meta.cnpj = m[1];
    var per = null;
    m = /(\d{2}\/\d{2}\/\d{4})\s*(?:A|ATE|-|–)\s*(\d{2}\/\d{2}\/\d{4})/.exec(t);
    if (m) per = [dataBR(m[1]), dataBR(m[2])];
    else {
      m = /(\d{1,2}) DE ([A-Z]+) DE (\d{4})\s*(?:A|ATE|-)\s*(\d{1,2}) DE ([A-Z]+) DE (\d{4})/.exec(t);
      if (m && MESES[m[2]] && MESES[m[5]]) per = [D(+m[3], MESES[m[2]], +m[1]), D(+m[6], MESES[m[5]], +m[4])];
      else {
        m = /(\d{1,2}) ([A-Z]{3}) (\d{4})\s*(?:A|ATE|-)\s*(\d{1,2}) ([A-Z]{3}) (\d{4})/.exec(t);
        if (m && MESES[m[2]] && MESES[m[5]]) per = [D(+m[3], MESES[m[2]], +m[1]), D(+m[6], MESES[m[5]], +m[4])];
      }
    }
    if (per && per[0] && per[1] && per[0].t <= per[1].t) meta.periodo = per;
    else {
      m = /\b(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\s*(?:DE|\/)\s*(\d{4})/.exec(t);
      if (m) {
        var ano = +m[2], mes = MESES[m[1]];
        var fim = new Date(Date.UTC(ano, mes, 0));
        meta.periodo = [D(ano, mes, 1), D(ano, mes, fim.getUTCDate())];
      }
    }
    return meta;
  }

  function xDaPalavra(linha, pos) {
    var acum = 0;
    for (var i = 0; i < linha.palavras.length; i++) {
      var n = norm(linha.palavras[i].text).length + 1;
      if (acum + n > pos) return linha.palavras[i].x0;
      acum += n;
    }
    return 0;
  }
  function comSinal(v) { return v.valor * (v.sinal < 0 ? -1 : 1); }

  // ------------------------------------------------------------ motor
  function extrair(paginas, bancoId) {
    var linhas = montarLinhas(paginas);
    var textoTotal = linhas.map(function (l) { return l.ntexto; }).join("\n");
    var banco, detectado;
    if (!bancoId || bancoId === "auto") { banco = detectarBanco(textoTotal); detectado = true; }
    else { banco = perfil(bancoId); detectado = false; }
    var opcoes = banco.opcoes || {}, extras = opcoes.rotulos_extras || {};
    var ignorarRe = (opcoes.ignorar || []).map(function (p) { return new RegExp(p); });
    var meta = extrairMetadados(textoTotal), periodo = meta.periodo || null;

    var nPag = paginas.length, repetidas = {};
    var altPag = {}; paginas.forEach(function (p) { altPag[p.numero] = p.altura; });
    if (nPag >= 2) {
      var cont = {};
      linhas.forEach(function (l) {
        var h = altPag[l.pagina];
        if (l.top < h * 0.14 || l.bottom > h * 0.90) { (cont[l.ntexto] = cont[l.ntexto] || {})[l.pagina] = 1; }
      });
      Object.keys(cont).forEach(function (t) { if (Object.keys(cont[t]).length >= Math.max(2, Math.floor(nPag / 2))) repetidas[t] = 1; });
    }

    var cabPagina = {}, topoCab = {};
    linhas.forEach(function (l) {
      var c = ehCabecalho(l, extras);
      if (c && !cabPagina[l.pagina]) { cabPagina[l.pagina] = c; topoCab[l.pagina] = l.top; l._cab = true; }
      else if (c) l._cab = true;
    });
    var ultimoCab = null;
    var alturas = linhas.filter(function (l) { return l.bottom > l.top; }).map(function (l) { return l.bottom - l.top; }).sort(function (a, b) { return a - b; });
    var altLinha = alturas.length ? alturas[Math.floor(alturas.length / 2)] : 10;

    var eventos = [], ignoradas = [], dataAtual = null, secao = 0, pendente = null, ultimaTx = null, ultimaLinhaTx = null;
    var seq = { ano: null, mes: null };
    function ignora(l, motivo) { ignoradas.push({ pagina: l.pagina, texto: l.texto, motivo: motivo }); }

    linhas.forEach(function (l) {
      var pag = l.pagina;
      var cab = cabPagina[pag] || ultimoCab;
      if (cabPagina[pag]) ultimoCab = cabPagina[pag];
      if (l._cab) return;
      var nt = l.ntexto;
      if (!nt) return;
      if (topoCab[pag] !== undefined && l.top < topoCab[pag]) {
        var vs = acharValores(l.palavras).valores;
        var mIni = /SALDO (ANTERIOR|INICIAL)/.exec(nt), mFim = /SALDO FINAL|SALDO ATUAL/.exec(nt);
        if (vs.length && (mIni || mFim) && !SALDO_NAO_CONTA.test(nt)) {
          [[mIni, "inicial"], [mFim, "final"]].forEach(function (par) {
            if (!par[0]) return;
            var pos = xDaPalavra(l, par[0].index);
            var cand = vs.filter(function (v) { return v.x0 > pos; });
            if (!cand.length) cand = vs;
            eventos.push(["saldo", { tipo: par[1], valor: comSinal(cand[0]), pagina: pag, texto: l.texto, data: null }]);
          });
          ignora(l, "resumo acima da tabela (saldo usado na conferencia)");
          return;
        }
        ignora(l, "cabecalho da pagina");
        return;
      }
      if (repetidas[nt] || ignorarRe.some(function (r) { return r.test(nt); })) { ignora(l, "cabecalho/rodape repetido"); return; }
      if (PERIODO_RE.test(nt)) { ignora(l, "periodo do extrato"); return; }

      var ws = l.palavras;
      var av = acharValores(ws), valores = av.valores, usados = av.usados;
      var limX = (cab && cab.data) ? cab.data[1] + 15 : null;
      var ad = acharData(ws, l.largura_pagina, limX), data = ad.data, nData = ad.n;
      var papeisVal = classificarValores(valores, cab);

      var docTokens = [], descTokens = [], docSpan = cab ? cab.doc : null;
      ws.forEach(function (w, k) {
        if (k < nData || usados[k]) return;
        var c = (w.x0 + w.x1) / 2;
        if (docSpan && docSpan[0] - 12 <= c && c <= docSpan[1] + 12 && /\d/.test(w.text)) docTokens.push(w.text);
        else descTokens.push(w);
      });
      var desc = stripChars(descTokens.map(function (w) { return w.text; }).join(" "), " -|");
      var ndesc = norm(desc);

      if (data) {
        var dobj = resolverData(data, periodo, seq);
        if (dobj && !iguais(dobj, dataAtual)) secao = 0;
        dataAtual = dobj || dataAtual;
      }

      if (valores.length && (SECAO_MAIS.test(ndesc) || SECAO_MENOS.test(ndesc))) {
        secao = SECAO_MAIS.test(ndesc) ? 1 : -1; ignora(l, "total da secao"); return;
      }
      if (SALDO_RE.test(ndesc) && !SALDO_NAO_CONTA.test(ndesc)) {
        if (valores.length) {
          var v = null;
          valores.forEach(function (vv, i) { if (papeisVal[i] === "saldo") v = vv; });
          if (!v) {
            var pos = l.ntexto.indexOf("SALDO") >= 0 ? xDaPalavra(l, l.ntexto.indexOf("SALDO")) : 0;
            var cand = valores.filter(function (vv) { return vv.x0 > pos; });
            v = cand.length ? cand[0] : valores[valores.length - 1];
          }
          var tipo = /ANTERIOR|INICIAL/.test(ndesc) ? "inicial" : (/FINAL|ATUAL/.test(ndesc) ? "final" : "dia");
          eventos.push(["saldo", { tipo: tipo, valor: comSinal(v), pagina: pag, texto: l.texto, data: dataAtual, cab_dia: !!data }]);
        } else ignora(l, "linha de saldo sem valor");
        pendente = null; return;
      }
      if (SALDO_NAO_CONTA.test(ndesc) && ndesc.indexOf("SALDO") >= 0) { ignora(l, "saldo bloqueado/limite (nao entra na conferencia)"); return; }
      if (valores.length && TOTAL_RE.test(ndesc)) { ignora(l, "linha de total"); return; }

      if (!valores.length) {
        if (data && !desc) return;
        if (data && desc && !RUIDO_RE.test(ndesc)) { pendente = { desc: desc, doc: docTokens, linha: l }; return; }
        if (RUIDO_RE.test(ndesc)) { ignora(l, "texto institucional"); return; }
        var alvo = pendente ? pendente.linha : ultimaLinhaTx;
        if (alvo && alvo.pagina === pag && l.top - alvo.bottom < 1.9 * altLinha) {
          if (pendente) { pendente.desc += " " + desc; pendente.doc = pendente.doc.concat(docTokens); pendente.linha = l; }
          else if (ultimaTx) {
            ultimaTx.descricao = (ultimaTx.descricao + " " + desc).trim();
            if (docTokens.length && !ultimaTx.documento) ultimaTx.documento = docTokens.join(" ");
            ultimaLinhaTx = l;
          }
          return;
        }
        ignora(l, "texto fora da tabela"); return;
      }

      if (dataAtual === null) { ignora(l, "valor antes da primeira data (resumo)"); return; }

      var valorMov = null, saldoLin = null, papelMov = null;
      valores.forEach(function (vv, i) {
        if (papeisVal[i] === "saldo") saldoLin = vv;
        else if (!valorMov) { valorMov = vv; papelMov = papeisVal[i]; }
      });
      if (!valorMov) {
        if (ultimaTx && ultimaTx.saldo === null && !desc) ultimaTx.saldo = comSinal(saldoLin);
        else ignora(l, "saldo sem movimentacao");
        return;
      }
      if (pendente && pendente.linha.pagina === pag && l.top - pendente.linha.bottom < 1.9 * altLinha) {
        desc = (pendente.desc + " " + desc).trim(); docTokens = pendente.doc.concat(docTokens);
      } else if (pendente) ignora(pendente.linha, "historico sem valor");
      pendente = null;

      var sinal = 0, fonte = "";
      if (papelMov === "cred") { sinal = 1; fonte = "coluna credito"; }
      else if (papelMov === "deb") { sinal = -1; fonte = "coluna debito"; }
      else if (valorMov.sinal) { sinal = valorMov.sinal; fonte = "sinal impresso"; }
      var tx = { data: dataAtual, descricao: desc || "(sem historico)", documento: docTokens.join(" "),
        valor_abs: valorMov.valor, sinal: sinal, fonte_sinal: fonte, secao: secao,
        saldo: saldoLin ? comSinal(saldoLin) : null, pagina: pag, texto_original: l.texto };
      eventos.push(["tx", tx]);
      ultimaTx = tx; ultimaLinhaTx = l;
    });
    if (pendente) ignora(pendente.linha, "historico sem valor");

    var transacoes = eventos.filter(function (e) { return e[0] === "tx"; }).map(function (e) { return e[1]; });
    var decrescente = transacoes.length >= 2 && transacoes[0].data.t > transacoes[transacoes.length - 1].data.t;

    if (!decrescente) {
      var i = 0;
      while (i < eventos.length) {
        var e = eventos[i];
        if (e[0] === "saldo" && e[1].cab_dia && e[1].tipo === "dia") {
          var j = i + 1;
          while (j < eventos.length && eventos[j][0] === "tx" && iguais(eventos[j][1].data, e[1].data)) j++;
          if (j > i + 1) { eventos.splice(j - 1, 0, eventos.splice(i, 1)[0]); i = j; continue; }
        }
        i++;
      }
      eventos.forEach(function (e, k) {
        if (e[0] === "saldo" && (e[1].tipo === "dia" || e[1].tipo === "final") && k > 0 && eventos[k - 1][0] === "tx") {
          var t = eventos[k - 1][1];
          if (t.saldo === null) t.saldo = e[1].valor;
        }
      });
    }

    var impressos = transacoes.filter(function (t) { return t.fonte_sinal === "sinal impresso"; });
    var soNeg = impressos.length > 0 && impressos.every(function (t) { return t.sinal < 0; }) &&
      !transacoes.some(function (t) { return t.fonte_sinal.indexOf("coluna") === 0; });
    var res = resolverSinaisEConferir(eventos, decrescente, soNeg);
    res.banco = banco.nome; res.banco_id = banco.id; res.banco_detectado = detectado;
    res.metadados = meta; res.paginas = paginas.length;
    res.paginas_sem_texto = paginas.filter(function (p) { return p.palavras.length < 5; }).map(function (p) { return p.numero; });
    res.ignoradas = ignoradas; res.ordem_decrescente = decrescente;
    return res;
  }

  function sinalFraco(tx) {
    if (tx.secao) return [tx.secao, "secao entradas/saidas"];
    var nd = norm(tx.descricao), d = PALAVRAS_DEBITO.test(nd), c = PALAVRAS_CREDITO.test(nd);
    if (d && !c) return [-1, "historico (verificar)"];
    if (c && !d) return [1, "historico (verificar)"];
    return [0, ""];
  }

  function resolverSinaisEConferir(eventos, decrescente, soNegativos) {
    var ev = decrescente ? eventos.slice().reverse() : eventos.slice();
    var iniciais = ev.filter(function (e) { return e[0] === "saldo" && e[1].tipo === "inicial"; });
    var finais = ev.filter(function (e) { return e[0] === "saldo" && e[1].tipo === "final"; });
    var meio = ev.filter(function (e) { return !(e[0] === "saldo" && (e[1].tipo === "inicial" || e[1].tipo === "final")); });
    while (meio.length && meio[0][0] === "saldo" && !iniciais.length) iniciais.push(meio.shift());
    while (meio.length && meio[0][0] === "saldo") meio.shift();
    var ordem = iniciais.slice(0, 1).concat(meio, finais.slice(-1));

    var saldoAnt = iniciais.length ? iniciais[0][1].valor : null, segmento = [];
    function fecha(saldoFim) {
      if (saldoAnt === null || saldoFim === null || !segmento.length) { segmento = []; return; }
      var conhecidos = 0;
      segmento.forEach(function (t) { if (t.sinal) conhecidos += t.valor_abs * t.sinal; });
      var abertos = segmento.filter(function (t) { return !t.sinal; });
      var alvo = saldoFim - saldoAnt - conhecidos;
      if (abertos.length && abertos.length <= 16) {
        var sols = [], n = abertos.length;
        for (var mask = 0; mask < (1 << n); mask++) {
          var soma = 0;
          for (var b = 0; b < n; b++) soma += abertos[b].valor_abs * ((mask >> b) & 1 ? -1 : 1);
          if (soma === alvo) { sols.push(mask); if (sols.length > 64) break; }
        }
        if (sols.length) {
          var nota = function (mask) { var s = 0; for (var b = 0; b < n; b++) if (sinalFraco(abertos[b])[0] === ((mask >> b) & 1 ? -1 : 1)) s++; return s; };
          var melhor = sols[0];
          sols.forEach(function (s) { if (nota(s) > nota(melhor)) melhor = s; });
          var unico = sols.length === 1;
          abertos.forEach(function (a, b) { a.sinal = (melhor >> b) & 1 ? -1 : 1; a.fonte_sinal = unico ? "saldo" : "saldo + historico (verificar)"; });
        }
      }
      segmento = [];
    }
    ordem.forEach(function (e) {
      if (e[0] === "tx") { segmento.push(e[1]); if (e[1].saldo !== null) { fecha(e[1].saldo); saldoAnt = e[1].saldo; } }
      else { fecha(e[1].valor); saldoAnt = e[1].valor; }
    });
    ordem.forEach(function (e) {
      if (e[0] === "tx" && !e[1].sinal) {
        if (soNegativos) { e[1].sinal = 1; e[1].fonte_sinal = "sem sinal = credito (padrao do extrato)"; return; }
        var sf = sinalFraco(e[1]);
        if (sf[0]) { e[1].sinal = sf[0]; e[1].fonte_sinal = sf[1]; } else { e[1].sinal = 1; e[1].fonte_sinal = "indefinido (verificar)"; }
      }
    });
    ordem.forEach(function (e) { if (e[0] === "tx") e[1].valor = e[1].valor_abs * e[1].sinal; });

    var txs = ordem.filter(function (e) { return e[0] === "tx"; }).map(function (e) { return e[1]; });
    var saldoInicial = iniciais.length ? iniciais[0][1].valor : null;
    if (saldoInicial === null) {
      var ac = 0;
      for (var i = 0; i < txs.length; i++) { ac += txs[i].valor; if (txs[i].saldo !== null) { saldoInicial = txs[i].saldo - ac; break; } }
    }
    var corrente = saldoInicial, div = 0, conf = 0;
    ordem.forEach(function (e) {
      if (e[0] === "tx") {
        var t = e[1];
        if (corrente !== null) corrente += t.valor;
        t.saldo_calculado = corrente;
        if (t.saldo !== null && corrente !== null) {
          conf++; t.confere = t.saldo === corrente;
          if (!t.confere) { div++; corrente = t.saldo; }
        } else t.confere = null;
      } else if (corrente !== null) {
        conf++; if (e[1].valor !== corrente) div++; corrente = e[1].valor;
      }
    });
    var cred = 0, deb = 0;
    txs.forEach(function (t) { if (t.valor > 0) cred += t.valor; else deb += t.valor; });
    var sfi = finais.length ? finais[finais.length - 1][1].valor : null;
    if (sfi === null) {
      for (var k = ordem.length - 1; k >= 0; k--) {
        if (ordem[k][0] === "saldo") { sfi = ordem[k][1].valor; break; }
        if (ordem[k][1].saldo !== null && ordem[k][1].saldo !== undefined) { sfi = ordem[k][1].saldo; break; }
      }
    }
    var sfc = saldoInicial !== null ? saldoInicial + cred + deb : null;
    var dif = (sfi !== null && sfc !== null) ? sfi - sfc : null;
    var verificar = txs.filter(function (t) { return t.fonte_sinal.indexOf("verificar") >= 0; }).length;
    var status = (saldoInicial === null || sfi === null) ? "SEM SALDO PARA CONFERIR" :
      (div === 0 && dif === 0 ? "CONFERIDO" : "DIVERGENTE");
    return {
      transacoes: eventos.filter(function (e) { return e[0] === "tx"; }).map(function (e) { return e[1]; }),
      saldo_inicial: saldoInicial, saldo_final_informado: sfi, saldo_final_calculado: sfc, diferenca: dif,
      creditos: cred, debitos: deb, pontos_conferidos: conf, divergencias: div, sinais_a_verificar: verificar, status: status
    };
  }

  var API = { lerPdf: lerPdf, extrair: extrair, fmtBRL: fmtBRL, BANCOS: BANCOS_, norm: norm };
  if (typeof module !== "undefined") module.exports = API; else raiz.Motor = API;
})(this);
