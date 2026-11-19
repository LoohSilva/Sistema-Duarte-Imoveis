
const HOJE = new Date(2026, 10, 18);
let imoveis = [];
let mes = "2026-11";


function limpar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}


function cidade(texto) {
  const t = limpar(texto).replace(/[.,]/g, "");

  if (t === "sp" || t === "s paulo" || t === "sao paulo" || t === "S. Paulo") {
    return "São Paulo";
  }

  if (t === "campinas") return "Campinas";
  if (t === "ribeirao preto") return "Ribeirão Preto";

  return texto;
}


function numero(texto) {
  texto = String(texto || "").toLowerCase();

  let vezes = 1;

  if (texto.includes("milh")) vezes = 1000000;
  else if (texto.includes("mil")) vezes = 1000;

  let n = (texto.match(/[\d.,]+/) || ["0"])[0];

  if (n.includes(",")) {
    n = n.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(n)) {
    n = n.replace(/\./g, "");
  }

  return (Number(n) || 0) * vezes;
}


function data(texto) {
  const p = String(texto || "").match(
    /(\d+)[\/.-](\d+)[\/.-](\d+)/
  );

  if (!p) return null;

  if (p[1].length === 4) {
    return new Date(p[1], p[2] - 1, p[3]);
  }

  let ano = Number(p[3]);

  if (ano < 100) ano += 2000;

  return new Date(ano, p[2] - 1, p[1]);
}


function mesDe(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0");
}

// Formata dinheiro
function dinheiro(v) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

// ---------- IMPORTAR CSV ----------

document.getElementById("arquivoCSV").addEventListener("change", function (e) {
  const arquivo = e.target.files[0];

  if (!arquivo) return;

  document.getElementById("nomeArquivo").textContent = arquivo.name;

  const leitor = new FileReader();

  leitor.onload = () => {
    // Salva a planilha no navegador
    localStorage.setItem("duarte_csv", leitor.result);
    localStorage.setItem("duarte_nome_csv", arquivo.name);

    lerCSV(leitor.result);
  };

  leitor.readAsText(arquivo);
});

// ---------- LER E ORGANIZAR CSV ----------

function lerCSV(texto) {
  const linhas = texto
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(l => l.trim());

  const sep = linhas[0].includes(";") ? ";" : ",";

  
  const dividir = linha =>
    linha.split(
      new RegExp(sep + '(?=(?:[^"]*"[^"]*")*[^"]*$)')
    ).map(c => c.replace(/"/g, "").trim());

  const cab = dividir(linhas[0]).map(limpar);

  imoveis = linhas.slice(1).map(linha => {
    const c = dividir(linha);

    const pegar = nome => {
      const indice = cab.indexOf(nome);
      return indice >= 0 ? c[indice] || "" : "";
    };

    return {
      codigo: pegar("codigo"),
      tipo: pegar("tipo"),
      cidade: cidade(pegar("cidade")),
      negocio: pegar("negocio"),
      status: pegar("status"),
      anunciado: numero(pegar("preco_anunciado")),
      fechado: numero(pegar("preco_fechado")),
      fechamento: data(pegar("data_fechamento")),
      inicio: data(pegar("inicio_contrato")),
      obs: pegar("observacao")
    };
  });

  montarMeses();
  renderizar();
}



function montarMeses() {
  const datas = [HOJE];

  imoveis.forEach(i => {
    if (i.fechamento) datas.push(i.fechamento);
    if (i.inicio) datas.push(i.inicio);
  });

  const menor = new Date(Math.min(...datas));
  const maior = new Date(Math.max(...datas));

  const filtroMes = document.getElementById("filtroMes");

  let opcoes = "";

  for (
    let d = new Date(menor.getFullYear(), menor.getMonth(), 1);
    d <= maior;
    d.setMonth(d.getMonth() + 1)
  ) {
    const nome = d.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric"
    });

    opcoes += `<option value="${mesDe(d)}">${nome}</option>`;
  }

  filtroMes.innerHTML = opcoes;
  filtroMes.value = mes;

  if (!filtroMes.value) {
    filtroMes.selectedIndex = filtroMes.options.length - 1;
    mes = filtroMes.value;
  }
}


function calcular() {
  const lista = [];

  const [ano, m] = mes.split("-");

  const fimDoMes = new Date(
    ano, m, 0, 23, 59, 59
  );

  imoveis.forEach(i => {
    const negocio = limpar(i.negocio);

    // Venda: 6% no mês do fechamento
    if (
      negocio.includes("venda") &&
      i.fechamento &&
      mesDe(i.fechamento) === mes &&
      i.fechado > 0
    ) {
      lista.push({
        i: i,
        tipo: "Venda",
        base: i.fechado,
        valor: i.fechado * 0.06,
        situacao: i.fechamento > HOJE
          ? "Previsão"
          : "Calculada"
      });
    }

  
    if (
      (negocio.includes("alug") || negocio.includes("loca")) &&
      i.inicio &&
      i.inicio <= fimDoMes
    ) {
      const aluguel = i.anunciado || i.fechado;

      if (aluguel > 0) {
        const primeiro = mesDe(i.inicio) === mes;

        const salvo = localStorage.getItem(
          "pg_" + i.codigo + "_" + mes
        );

        
        const atrasou =
          mes === mesDe(HOJE) &&
          limpar(i.obs).includes("atras");

        lista.push({
          i: i,
          tipo: "Aluguel",
          base: aluguel,
          valor: primeiro ? aluguel : aluguel * 0.1,
          situacao: salvo || (atrasou ? "Atrasado" : "A confirmar")
        });
      }
    }
  });

  return lista;
}

// ---------- ALTERAR PAGAMENTO ----------

function pagar(codigo, situacao) {
  localStorage.setItem(
    "pg_" + codigo + "_" + mes,
    situacao
  );

  renderizar();
}



function renderizar() {
  const lista = calcular();

  const soma = filtro =>
    lista
      .filter(filtro)
      .reduce((t, c) => t + c.valor, 0);

  document.getElementById("totalCalculado").textContent =
    dinheiro(soma(c =>
      c.situacao !== "Previsão" &&
      c.situacao !== "Atrasado"
    ));

  document.getElementById("totalPrevisao").textContent =
    dinheiro(soma(c => c.situacao === "Previsão"));

  document.getElementById("totalAtrasado").textContent =
    dinheiro(soma(c => c.situacao === "Atrasado"));

  document.getElementById("totalImoveis").textContent =
    imoveis.length;

  
  document.getElementById("tabelaComissoes").innerHTML =
    lista.map(c => `
      <tr>
        <td>${c.i.codigo}</td>
        <td>${c.i.tipo}</td>
        <td>${c.i.cidade}</td>
        <td>${c.tipo}</td>
        <td>${dinheiro(c.base)}</td>
        <td>${dinheiro(c.valor)}</td>
        <td>${c.situacao}</td>
      </tr>
    `).join("");


  document.getElementById("tabelaCobrancas").innerHTML =
    lista
      .filter(c => c.tipo === "Aluguel")
      .map(c => `
        <tr>
          <td>${c.i.codigo}</td>
          <td>${c.i.cidade}</td>
          <td>${dinheiro(c.base)}</td>
          <td>${dinheiro(c.valor)}</td>
          <td>
            <select onchange="pagar('${c.i.codigo}', this.value)">
              <option ${c.situacao === "A confirmar" ? "selected" : ""}>
                A confirmar
              </option>
              <option ${c.situacao === "Pago" ? "selected" : ""}>
                Pago
              </option>
              <option ${c.situacao === "Atrasado" ? "selected" : ""}>
                Atrasado
              </option>
            </select>
          </td>
        </tr>
      `).join("");

  
  document.getElementById("tabelaImoveis").innerHTML =
    imoveis.map(i => `
      <tr>
        <td>${i.codigo}</td>
        <td>${i.tipo}</td>
        <td>${i.cidade}</td>
        <td>${i.negocio}</td>
        <td>${dinheiro(i.fechado || i.anunciado)}</td>
        <td>${i.status}</td>
      </tr>
    `).join("");
}



document.getElementById("filtroMes").addEventListener("change", function () {
  mes = this.value;
  renderizar();
});

// ---------- RECUPERAR CSV SALVO ----------

const csvSalvo = localStorage.getItem("duarte_csv");
const nomeSalvo = localStorage.getItem("duarte_nome_csv");

if (csvSalvo) {
  document.getElementById("nomeArquivo").textContent =
    nomeSalvo || "Planilha salva no navegador";

  lerCSV(csvSalvo);
}
