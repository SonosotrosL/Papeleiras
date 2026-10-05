// ---------- leitura local (OCR) : interpretação do texto do carimbo ----------
const MES = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
const STREET_RE = /(?:^|[\s,;:])((?:Rua|R\.|Avenida|Av\.?|Travessa|Tv\.?|Trav\.?|Passagem|Psg\.?|Pass\.|Alameda|Al\.|Boulevard|Blvd\.?|Rodovia|Rod\.?|Loteamento|Lot\.|Praça|Pça\.?|Largo|Estrada|Conjunto|Conj\.|Beco|Viela|Vila)\s*[-–]?\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][^\n]*)/;
const GENERIC_BAIRROS = new Set(["vila","farol","paraiso","brasilia","cruzeiro","una","agulha","marco","combu","aura","souza","fatima","condor","curio utinga"]);
function ocrClean(t){
  return String(t||"").replace(/([A-Za-zÀ-ú])\.(\d)/g,"$1, $2").replace(/[|“”"`´]/g," ").replace(/[—–]/g,"-").replace(/[ \t]+/g," ").replace(/ *\n */g,"\n");
}
function parseOCR(text, bairrosList){
  const raw = ocrClean(text);
  const lines = raw.split("\n").map(s=>s.trim()).filter(s=>s.length>1);
  const o = {carimbo:false, app:null, data:null, hora:null, logradouro:null, numero:null, bairro:null, bairro_estimado:null, cep:null,
    lat:null, lon:null, utm:null, responsavel:null, referencia:null, servico_escrito:null, servico_sugerido:null, qualidade:"boa", descricao:null};
  const p2 = n => String(n).padStart(2,"0");
  // data
  let m = raw.match(/(?:^|[^\d])([0-3]?\d)\s?[\/.]\s?([01]?\d)\s?[\/.]\s?(20\d\d)(?!\d)/);
  if (m && +m[2]>=1 && +m[2]<=12 && +m[1]>=1 && +m[1]<=31 && +m[3]>=2024 && +m[3]<=2030) o.data = `${p2(+m[1])}/${p2(+m[2])}/${m[3]}`;
  else {
    m = raw.match(/(?:^|[^\d])([0-3]?\d)\s*(?:de\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*[-.]?\s*(?:de\s*)?(20\d\d)(?!\d)/i);
    if (m && +m[1]>=1 && +m[1]<=31 && +m[3]>=2024 && +m[3]<=2030) o.data = `${p2(+m[1])}/${p2(MES[m[2].toLowerCase()])}/${m[3]}`;
  }
  // hora (ignora fuso "GMT -03:00" e "-03:00")
  for (const t of raw.matchAll(/(GMT\s*)?([+-]\s?)?(?:^|[^\d.,])([01]?\d|2[0-3])\s?[:h.;]\s?([0-5]\d)(?!\d)(?:\s?:\s?[0-5]\d)?\s*(AM|PM)?/gim)){
    if (t[1] || t[2]) continue;
    let h = +t[3]; const ap = (t[5]||"").toUpperCase();
    if (ap==="PM" && h<12) h+=12; if (ap==="AM" && h===12) h=0;
    o.hora = `${p2(h)}:${t[4]}`; break;
  }
  if (!o.hora){ const hm = raw.match(/20\d\d\s+([01]\d|2[0-3])([0-5]\d)(?!\d)/); if (hm) o.hora = `${hm[1]}:${hm[2]}`; }
  // CEP
  m = raw.match(/(?:^|[^\d])(6[0-9]{4})\s?-?\s?(\d{3})(?!\d)/); if (m) o.cep = `${m[1]}-${m[2]}`;
  // coordenadas decimais
  m = raw.match(/(-?\s?[0-2][.,]\d{3,})\s*°?\s*([NS])?[^\d\-]{0,14}(-?\s?4[7-9][.,]\d{3,})\s*°?\s*([WO])?/i);
  if (m){ let la = parseFloat(m[1].replace(/\s/g,"").replace(",",".")), lo = parseFloat(m[3].replace(/\s/g,"").replace(",","."));
    if (m[2] && m[2].toUpperCase()==="S") la = -Math.abs(la); if (la>0) la = -la; if (lo>0) lo = -lo;
    if (Math.abs(la)>0.5 && Math.abs(la)<2) { o.lat = la; o.lon = lo; } }
  // UTM
  m = raw.match(/(2[12])\s?([LM])\s+(\d{6})[.,]?\d*\s+(\d{7})/i); if (m) o.utm = `${m[1]}${m[2].toUpperCase()} ${m[3]} ${m[4]}`;
  // endereço
  for (let k=0;k<lines.length;k++){
    let ln = lines[k];
    const sm = ln.match(STREET_RE); if (!sm) continue;
    let pre = ln.slice(0, sm.index + (sm[0].length - sm[1].length)).trim();
    let s = sm[1];
    if (/[,-]\s*$/.test(s) && lines[k+1]) s += " " + lines[k+1];
    // nome quebrado em duas linhas: "Avenida Doutor Lopo de" + "Castro, Cruzeiro, Belém…"
    else if (lines[k+1] && /\s(de|da|do|dos|das|e|d[ae]s?)\s*$/i.test(s) && /^[A-ZÀ-Úa-zà-ú]/.test(lines[k+1])) s += " " + lines[k+1];
    else if (lines[k+1] && !/[,\d]/.test(s) && /^[A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?\s*,/.test(lines[k+1]) && typeof LISTAS !== "undefined"){
      const nx = lines[k+1].split(",")[0].trim(), r1 = LISTAS.rua(s), r2 = LISTAS.rua(s + " " + nx);
      if (r2 && r2.nome && r2.status !== "fora" && (!r1 || r1.status === "fora")) s += " " + lines[k+1];
    }
    s = s.replace(/\s*,?\s*Bel[eé]m\b.*$/i,"").replace(/\s+-\s*$/,"");
    // "Rua X, 123 - Bairro"
    let mm = s.match(/^(.+?)\s*,\s*(\d+[A-Za-z]?(?:\s?-\s?\d+)?)\s*(?:(?:[-,]\s*|\s+)(.+))?$/) || s.match(/^(.+?[A-Za-zÀ-ú.])\s+(\d+[A-Za-z]?)\s*[,-]\s*(.+)$/);
    if (mm){ o.logradouro = mm[1].trim(); o.numero = mm[2].replace(/\s/g,""); if (mm[3]) o.bairro = mm[3].replace(/[,.;]+$/,"").trim(); }
    else {
      mm = s.match(/^(.+?)\s+-\s+(.+)$/) || s.match(/^(.+?)\s*,\s*([A-Za-zÀ-ú' ]{3,30})(?:,.*)?$/);
      if (mm){ o.logradouro = mm[1].trim(); o.bairro = mm[2].replace(/[,.;]+$/,"").trim(); } else o.logradouro = s.replace(/[,.;:]+$/,"").trim();
      // número antes da rua (formato em linhas: "81 Rua Caetano Rufino")
      const nm = pre.match(/(\d+[A-Za-z]?)$/); if (nm) o.numero = nm[1];
      // bairro na linha seguinte
      const nx = lines[k+1];
      if (!o.bairro && nx && !/bel[eé]m|par[aá]\b|brasil|altitude|velocidade|n[uú]mero|\d{3}/i.test(nx) && /^[A-Za-zÀ-ú' .-]{3,30}$/.test(nx)) o.bairro = nx.replace(/[.,;:]+$/,"").trim();
    }
    if (o.bairro) o.bairro = o.bairro.replace(/^[^A-Za-zÀ-ú]+/,"").replace(/^(?:[A-Za-z]\s*'?\s+)/,"").trim() || null;
    o.logradouro = o.logradouro.replace(/\s{2,}/g," ").replace(/[-:]+(?=[A-Za-zÀ-ú])/g," ").trim();
    break;
  }
  // bairro conhecido no texto
  if (bairrosList && bairrosList.length){
    const nt = "\n" + raw.split("\n").map(normTxt).join("\n") + "\n";
    const byLen = bairrosList.slice().sort((a,b)=>b.length-a.length);
    let found = null;
    if (o.bairro){ const nb = normTxt(o.bairro); found = byLen.find(b=>normTxt(b)===nb) || null; }
    if (!found) for (const b of byLen){ const nb = normTxt(b); if (GENERIC_BAIRROS.has(nb) || nb.length<6) { if (nt.includes("\n"+nb+"\n")) { found=b; break; } } else if ((" "+nt.replace(/\n/g," ")+" ").includes(" "+nb+" ")) { found=b; break; } }
    if (found){ if (!o.bairro || !byLen.some(b=>normTxt(b)===normTxt(o.bairro))) o.bairro = found; else if (normTxt(o.bairro)!==normTxt(found)) o.bairro_estimado = found; }
  }
  // responsável
  m = raw.match(/(?:Nome|Encarregad[oa]|Enc\.?|Colaborador(?:\(a\)|a)?|Colaborada|Supervisor|Fiscal|Respons[aá]vel)\s*[:.]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú.]+(?:[ ]+[A-Za-zÀ-ú.]+){0,3})/);
  if (m) o.responsavel = m[1].replace(/\s+(Supervisor|Encarregad[oa]|Empresa|Nota)\b.*$/i,"").trim();
  // referência (só quando rotulada)
  m = raw.match(/(?:Local|Nota|Obs|Refer[eê]ncia)\s*:\s*([^\n]{3,50})/i); if (m) o.referencia = m[1].trim();
  // campos personalizados recomendados no carimbo: "Serviço: Varrição" e "Base: Sul"
  m = raw.match(/Servi[cç]o\s*[:\-]\s*([^\n]{3,60})/i); if (m) o.servico_escrito = m[1].trim();
  m = raw.match(/\bBase\s*[:\-]?\s*(Norte|Sul)\b/i); if (m) o.base_escrita = m[1].toLowerCase()==="norte" ? "N" : "S";
  // app
  m = raw.match(/Timemark|GPS Map Camera|Timestamp|Open Camera/i); if (m) o.app = m[0];
  o.carimbo = !!(o.data || o.hora || o.logradouro || o.cep || o.utm || o.lat);
  return o;
}

// texto do leitor de alta precisão (PaddleOCR) vem sem espaços: "1deag0.de202620:12:43", "1936AvenidaMarquesdeHerval"
function unglue(t){
  return String(t||"").split("\n").map(l=>{
    let s = l;
    s = s.replace(/ag0/gi,"ago").replace(/\bse1\b/gi,"set");
    s = s.replace(/(\d)(de)(?=\s?[a-z]{3}\.?)/gi,"$1 $2 ").replace(/(\.)(de)(\d)/gi,"$1 $2 $3").replace(/(\.)\s?(de)\s?(20\d\d)/gi,"$1 $2 $3");
    s = s.replace(/(20\d\d)(?=[0-2]?\d[:.]\d\d)/g,"$1 ");          // ano grudado na hora ("202610.53:56")
    s = s.replace(/(\d{4}\/\d{2}\/)?(\d{2}\/\d{2}\/20\d\d)(\d)/g,"$2 $3");
    s = s.replace(/^(\d+[A-Za-z]?)(?=(Rua|R\.|Avenida|Av\.|Travessa|Tv\.|Passagem|Alameda|Rodovia|Praça|Praca|Vila|Viela|Estrada|Beco|Largo))/,"$1 ");
    s = s.replace(/([a-zà-ú])(\d)/g,"$1 $2").replace(/(\d)([A-ZÀ-Ú][a-zà-ú])/g,"$1 $2");
    s = s.replace(/([a-zà-ú.])([A-ZÀ-Ú])/g,"$1 $2");
    s = s.replace(/,(?=\S)/g,", ").replace(/(\S)-(?=[A-ZÀ-Ú][a-zà-ú])/g,"$1 - ");
    s = s.replace(/(Lat|Long)(-?\d)/g,"$1 $2").replace(/(\d)(PM|AM)\b/g,"$1 $2");
    return s;
  }).join("\n");
}
function normTxt(s){ return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }


// ---------- conferência com as listas oficiais de bairros e ruas de Belém ----------
// Bairros: lista da CODEM/Prefeitura de Belém. Ruas: OpenAlfa (OpenStreetMap) + curadoria + relatórios anteriores.
// Base: S = Sul (abaixo da Av. Júlio César), N = Norte. c = perto da divisa (conferir).
const BAIRROS_OFICIAIS = [
  ["Cidade Velha","S"],["Campina","S"],["Reduto","S"],["Umarizal","S"],["Telégrafo","S"],["Sacramenta","S"],["Pedreira","S"],
  ["Marco","S"],["Souza","S","c"],["Marambaia","N","c"],["Canudos","S"],["Fátima","S"],["São Brás","S"],["Nazaré","S"],
  ["Batista Campos","S"],["Jurunas","S"],["Condor","S"],["Guamá","S"],["Terra Firme","S"],["Cremação","S"],["Val-de-Cães","N","c"],
  ["Miramar","S","c"],["Pratinha","N"],["Tapanã","N"],["Benguí","N"],["Maracangalha","S","c"],["Barreiro","S"],["Universitário","S"],
  ["Curió-Utinga","S"],["Aurá","S","c"],["Castanheira","S","c"],["Águas Lindas","S","c"],["Guanabara","S","c"],["São Clemente","N"],
  ["Parque Guajará","N"],["Tenoné","N"],["Águas Negras","N"],["Maracacuera","N"],["Parque Verde","N"],["Cruzeiro","N"],["Ponta Grossa","N"],
  ["Mangueirão","N","c"],["Cabanagem","N"],["Campina de Icoaraci","N"],["Paracuri","N"],["Agulha","N"],["Una","N"],["Coqueiro","N"],
  ["São João do Outeiro","N"],["Itaiteua","N"],["Água Boa","N"],["Maracajá","N"],["Vila","N"],["Praia Grande","N"],["Farol","N"],
  ["Mangueiras","N"],["São Francisco","N"],["Carananduba","N"],["Marahu","N"],["Paraíso","N"],["Baía do Sol","N"],["Sucurijuquara","N"],
  ["Caruara","N"],["Bonfim","N"],["Ariramba","N"],["Porto Arthur","N"],["Murubira","N"],["Chapéu Virado","N"],["Aeroporto","N"],
];
// nomes populares ou grafias comuns → bairro oficial
const BAIRRO_ALIAS = {
  "montese":"Terra Firme", "comercio":"Campina", "val de cans":"Val-de-Cães", "curio utinga":"Curió-Utinga", "curio":"Curió-Utinga",
  "agua negra":"Águas Negras", "natal do murubira":"Murubira", "icoaraci":"Campina de Icoaraci", "sao braz":"São Brás",
  "telegrafo sem fio":"Telégrafo", "cidade nova":"Marambaia", "doca":"Umarizal", "outeiro":"São João do Outeiro",
};
const RUAS_BASE = ["Rodovia Augusto Montenegro", "Rodovia Arthur Bernardes", "Rodovia Mário Covas", "Rodovia do Tapanã", "Rodovia BR-316", "Avenida Almirante Barroso", "Avenida Pedro Álvares Cabral", "Avenida Senador Lemos", "Avenida Júlio César", "Avenida Centenário", "Avenida Independência", "Avenida Dalva", "Avenida Celso Malcher", "Avenida Perimetral", "Avenida Bernardo Sayão", "Avenida Roberto Camelier", "Avenida Governador Magalhães Barata", "Avenida Governador José Malcher", "Avenida Nazaré", "Avenida Comandante Brás de Aguiar", "Avenida Visconde de Souza Franco", "Avenida Marechal Hermes", "Avenida Presidente Vargas", "Avenida Serzedelo Corrêa", "Avenida Conselheiro Furtado", "Avenida Gentil Bittencourt", "Avenida Generalíssimo Deodoro", "Avenida Alcindo Cacela", "Avenida José Bonifácio", "Avenida Duque de Caxias", "Avenida Marquês de Herval", "Avenida Pedro Miranda", "Avenida Doutor Freitas", "Avenida Rômulo Maiorana", "Avenida João Paulo II", "Avenida Primeiro de Dezembro", "Avenida Tavares Bastos", "Avenida Almirante Wandenkolk", "Avenida Visconde de Inhaúma", "Avenida Antônio Baena", "Avenida Cipriano Santos", "Avenida Almirante Tamandaré", "Avenida Portugal", "Avenida 16 de Novembro", "Avenida Assis de Vasconcelos", "Avenida Nossa Senhora de Nazaré", "Boulevard Castilhos França", "Travessa Padre Eutíquio", "Travessa Quintino Bocaiúva", "Travessa Rui Barbosa", "Travessa Benjamin Constant", "Travessa Doutor Moraes", "Travessa 14 de Março", "Travessa 9 de Janeiro", "Travessa 3 de Maio", "Travessa Castelo Branco", "Travessa Alferes Costa", "Travessa Barão do Triunfo", "Travessa Mauriti", "Travessa Humaitá", "Travessa Angustura", "Travessa Timbó", "Travessa Estrela", "Travessa Enéas Pinheiro", "Travessa Vileta", "Travessa Lomas Valentinas", "Travessa Pirajá", "Travessa Curuzu", "Travessa Chaco", "Travessa Mariz e Barros", "Travessa Dom Romualdo de Seixas", "Travessa Dom Romualdo Coelho", "Travessa Djalma Dutra", "Travessa Apinagés", "Travessa Frei Gil de Vila Nova", "Travessa Campos Sales", "Travessa 1º de Março", "Travessa Piedade", "Travessa Dom Pedro I", "Travessa Marquês de Pombal", "Travessa Jutaí", "Travessa Honório José dos Santos", "Travessa Caldeira Castelo Branco", "Travessa 14 de Abril", "Travessa 25 de Setembro", "Travessa Perebebuí", "Travessa Barão de Mamoré", "Travessa Teófilo Conduru", "Travessa Guerra Passos", "Travessa Soares Carneiro", "Travessa Bom Jardim", "Travessa Rodolfo Chermont", "Travessa Almirante Wandenkolk", "Travessa Tiradentes", "Travessa Ferreira Pena", "Travessa Padre Prudêncio", "Travessa Segunda de Queluz", "Travessa Primeira de Queluz", "Travessa São Pedro", "Travessa São Francisco", "Travessa Gurupá", "Travessa José Pio", "Travessa Mucajás", "Travessa Lauro Sodré", "Travessa Vinte e Dois de Junho", "Travessa WE", "Travessa Nove de Janeiro", "Rua dos Mundurucus", "Rua dos Pariquis", "Rua dos Timbiras", "Rua dos Caripunas", "Rua dos Tamoios", "Rua dos Tupinambás", "Rua Jabatiti", "Rua Conceição", "Rua Engenheiro Fernando Guilhon", "Rua São Miguel", "Rua João Diogo", "Rua Senador Manoel Barata", "Rua Gaspar Viana", "Rua Santo Antônio", "Rua Riachuelo", "Rua Tomázia Perdigão", "Rua Doutor Assis", "Rua Siqueira Mendes", "Rua Oliveira Belo", "Rua Paes de Souza", "Rua Gama Abreu", "Rua Silva Rosado", "Rua Barão de Igarapé-Miri", "Rua Augusto Corrêa", "Rua dos Pariquis", "Rua Coronel Juvêncio Sarmento", "Rua Quinze de Agosto", "Rua Veiga Cabral", "Rua Municipalidade", "Rua Ferreira Cantão", "Rua Padre Champagnat", "Rua Joaquim Nabuco", "Rua Manoel Barata", "Rua São Boaventura", "Rua Tiradentes", "Viela São Silvestre", "Praça da República", "Praça Batista Campos", "Praça Brasil", "Praça Justo Chermont", "Praça do Relógio", "Praça Dom Pedro II", "Praça Frei Caetano Brandão", "Praça Waldemar Henrique", "Praça Amazonas", "Praça Kennedy", "Praça Onze de Junho", "Praça do Operário", "Praça Floriano Peixoto", "Praça Magalhães Barata", "Praça Visconde do Rio Branco", "Largo de São João", "Largo de Nazaré", "Ladeira do Castelo", "Vila Passarinho", "Passagem Senador Lemos", "Passagem João de Deus", "Passagem Monte Alegre", "Passagem Santa Terezinha", "Passagem Pirajá", "Passagem José Maria da Costa", "Passagem Mirtes", "Passagem 14 de Abril", "Alameda 131", "Alameda 151", "Alameda 241", "Alameda 251", "Alameda 49", "Alameda Amazonas", "Alameda Ana Laura", "Alameda Anésia Meira", "Alameda Canárias", "Alameda Cheden Bitar", "Alameda Cândido de Luz", "Alameda D Joanna", "Alameda da Dona Clara", "Alameda Dona Izabel", "Alameda Dona Maria Leopoldina", "Alameda dos Pilares", "Alameda Doutor Rocha", "Alameda Eneida de Moraes", "Alameda Ferreira", "Alameda Francisco Ribeiro", "Alameda Gonçalves", "Alameda Hipolito", "Alameda José Faciola", "Alameda Kawamura", "Alameda Leão de Aguiar", "Alameda Lúcio Amaral", "Alameda Macedônia", "Alameda Maranata", "Alameda Maria José Nobre", "Alameda Maria Luiza", "Alameda Maso", "Alameda Miranda da Sobrinho", "Alameda Moreira da Costa", "Alameda Nossa Senhora das Gracas", "Alameda Oasis", "Alameda Odete Martins", "Alameda Paulo Maranhão", "Alameda Pedro Carneiro", "Alameda Praça Amazonas", "Alameda Preciosa", "Alameda Rita Medrado", "Alameda Rodrigues Alves", "Alameda Rodrigues Pinajé", "Alameda Santa Madalena", "Alameda Santa Rosa", "Alameda Soares", "Alameda São Gabriel", "Alameda São João Batista", "Alameda Taubinha", "Alameda Tenente Lauro Martins Viana", "Avenida 16 de Novembro", "Avenida Acataliassu Nunes", "Avenida Alcindo Cacela", "Avenida Almirante Barroso", "Avenida Almirante Tamandaré", "Avenida Antônio Baena", "Avenida Antônio Barreto", "Avenida Assis de Vasconcelos", "Avenida Bernardo Sayão", "Avenida Boulevard Castilhos França", "Avenida Ceará", "Avenida Cipriano Santos", "Avenida Comandante Brás de Aguiar", "Avenida Conselheiro Furtado", "Avenida Doutor Freitas", "Avenida Duque de Caxias", "Avenida Engenheiro Fernando Guilhon", "Avenida General Magalhães", "Avenida Generalíssimo Deodoro", "Avenida Gentil Bittencourt", "Avenida Governador José Malcher", "Avenida Governador Magalhães Barata", "Avenida José Bonifácio", "Avenida José Leal", "Avenida João Paulo II", "Avenida Lomas Valentinas", "Avenida Marechal Hérmes", "Avenida Marquês de Herval", "Avenida Municipalidade", "Avenida Nazaré", "Avenida Nossa Senhora de Nazaré", "Avenida Pedro Miranda", "Avenida Pedro Álvares Cabral", "Avenida Perimetral da Ciência", "Avenida Portugal", "Avenida Presidente Vargas", "Avenida Rômulo Maiorana", "Avenida Senador Lemos", "Avenida Serzedelo Corrêa", "Avenida Tapajós", "Avenida Visconde de Inhaúma", "Avenida Visconde de Souza Franco", "Avenida Visconde Souza Franco", "Beco da Piedade", "Beco do Carmo", "Boulevard Castilhos França", "CJ Itororo", "Conjunto Antônia Jacob", "Conjunto Botafogo", "Conjunto Célso Malcher", "Conjunto Dom Fernando", "Conjunto Enéas Pinheiro", "Conjunto Flamengo", "Conjunto Manoel Everdosa", "Conjunto Maria de Fátima", "Conjunto Mauriti", "Jardim São Luz", "Jardim Tapajós", "Ladeira do Castelo", "Largo de São João", "Passagem 12 de Novembro", "Passagem 25 de Março", "Passagem 27 de Dezembro", "Passagem 29 de Novembre", "Passagem Acatauassu", "Passagem Acatauassu Nunes", "Passagem Alacid Nunes", "Passagem Alberto Engelhard", "Passagem Alegre", "Passagem Alvorada", "Passagem Amaral", "Passagem Angélica", "Passagem Antonia Nunes", "Passagem Atlantica", "Passagem Augusto Numa Pinto", "Passagem Barão de Mamoré", "Passagem Belém", "Passagem Boa Vista", "Passagem Bolonha", "Passagem Botafogo", "Passagem Bragança", "Passagem Brasil", "Passagem Brasília", "Passagem Carmem", "Passagem Carneiro da Rocha", "Passagem Castanheira", "Passagem Celia", "Passagem Celina", "Passagem Coronel Apolinário Moreira", "Passagem Cumaru", "Passagem da Hortinha", "Passagem da Luz", "Passagem Dina", "Passagem do Horto", "Passagem Dois Irmãos", "Passagem Dolores", "Passagem Dom João", "Passagem Douglas", "Passagem Doutor Pereira", "Passagem Duque de Caxias", "Passagem Eliete", "Passagem Emanoel", "Passagem Emílio Martins", "Passagem Felicidade", "Passagem Flora", "Passagem Fluminense", "Passagem Fátima", "Passagem Gama Malcher Ramo", "Passagem Getúlio Vargas", "Passagem Gouveia", "Passagem Grão Pará", "Passagem Guajara", "Passagem Guajará", "Passagem Gualo A", "Passagem Gualo B", "Passagem Guimarães", "Passagem Henrique", "Passagem Honorato Filgueira", "Passagem Hortinha", "Passagem Independencia", "Passagem Ismael de Castro", "Passagem Jarina", "Passagem Joca", "Passagem José Leal Martins", "Passagem João Balbi", "Passagem João de Almeida", "Passagem Kássia", "Passagem Lauro Malcher", "Passagem Lauro Martins", "Passagem Leitão", "Passagem Leonor", "Passagem Leonor Fernandes", "Passagem Liberal", "Passagem Lindolfo Collor", "Passagem Lopo de Castro", "Passagem Louzana", "Passagem Mac Dowell", "Passagem Manoel Pedro", "Passagem Maria Aguiar", "Passagem Maria dos Santos", "Passagem Mariana", "Passagem Marquês", "Passagem Márcio Cristina", "Passagem Máxima", "Passagem Monte Alegre", "Passagem Monte Cristo", "Passagem Moura Carvalho", "Passagem Natal", "Passagem Nélio Lobato", "Passagem Nossa Senhora das Graças", "Passagem Nossa Senhora de Nazaré", "Passagem Nova", "Passagem Olívia", "Passagem Olympia", "Passagem Padre Anchieta", "Passagem Pavuna", "Passagem Pio X", "Passagem Pombo", "Passagem Primária", "Passagem Primeira de Queluz", "Passagem Principal", "Passagem Professora Antónia Nunes", "Passagem Ramos", "Passagem Rio Branco", "Passagem Rosa Maria", "Passagem Rui Martins", "Passagem Sagrada Familia", "Passagem Salgado Filho", "Passagem Santa Clara", "Passagem Santa Maria de Bélem", "Passagem Santa Rita Bezerra", "Passagem Santa Terezinha", "Passagem Santo Antônio", "Passagem São Francisco", "Passagem São João", "Passagem São José", "Passagem São Março", "Passagem São Marcos", "Passagem São Pedro", "Passagem São Sebastião", "Passagem Secundária", "Passagem Simeão", "Passagem Sonha Maria", "Passagem Tapajós", "Passagem Tocantins", "Passagem Três Irmãos", "Passagem Trindade", "Passagem União", "Passagem Vila Rica", "Passagem Xingu", "Praça Barão do Guajará", "Praça Barão do Rio Branco", "Praça Brigadeiro Eduardo Gomes", "Praça Brunco de Menezes", "Praça da Bandeira", "Praça da Leitura", "Praça da Republica", "Praça do Carmo", "Praça do Escoteiro", "Praça Felipe Patroni", "Praça Veiga Cabral", "Primeira Travessa de Queluz", "Residencial Alberto Farias Coelho", "Residencial Procopio de Jesus Santos", "Rua 13 de Maio", "Rua 15 de Novembro", "Rua 28 de Setembro", "Rua Albatroz", "Rua Antônio Barreto", "Rua Arcipreste Manoel Teodoro", "Rua Aristides Lobo", "Rua Avertano Rocha", "Rua Ângelo Custódio", "Rua Ó de Almeida", "Rua Búfalo", "Rua Belém", "Rua Bernal do Couto", "Rua Boaventura da Silva", "Rua Caetano Rufino", "Rua Cametá", "Rua Carlos Gomes", "Rua Catalina", "Rua Cônego Jerônimo Pimentel", "Rua Cesário Alvim", "Rua Conselheiro João Alfredo", "Rua Coronel Fontoura", "Rua Curuçá", "Rua da Basílica", "Rua da Indústria", "Rua da Paz", "Rua de Óbidos", "Rua Deodoro de Mendonça", "Rua Diogo Móia", "Rua Dione", "Rua do Arsenal", "Rua do Relogio", "Rua Domingos Marreiros", "Vila Moreira", "Vila Nazaré", "Vila Nossa Senhora da Conceição", "Vila Nova", "Vila Paulina", "Vila Paulo", "Vila Porto do Sal", "Vila Ramos", "Vila Rezende", "Vila Rio", "Vila Rita Bezerra", "Vila Rodrigues", "Vila Rosa", "Vila Santa Ana", "Vila Santa Luzia", "Vila Santa Rita", "Vila Santo Andre", "Vila Santos", "Vila São João", "Vila São Luiz", "Vila São Miguel", "Vila São Raimundo", "Vila São Sebastião", "Vila São Vicente de Paula", "Vila Secundária", "Vila Serafim", "Vila Souza", "Vila Timbiras", "Vila Três Marias", "Vila Tupinambas", "Vila Vieira", "Vila Vitória", "Alameda Belém", "Alameda Brasil", "Av. Alm. Barroso", "Av. Bernardo Sayão", "Av. Gov. José Malcher", "Av. Governador José Malcher", "Av. José Bonifácio", "Av. Júlio César", "Av. Nª Sra. de Nazaré", "Av. Portugal", "Av. Pres. Vargas", "Av. Visconde Souza", "Avenida Alcindo Cacela", "Avenida Alm. Barroso", "Avenida Almirante Tamandaré", "Avenida Assis de Vasconcelos", "Avenida Bernal do Couto", "Avenida Bernardo Sayão", "Avenida Celso Malcher", "Avenida Comandante Brás de Aguiar", "Avenida Conselheiro Furtado", "Avenida Dalva", "Avenida Doutor Freitas", "Avenida Duque de Caxias", "Avenida Generalíssimo Deodoro", "Avenida Gentil Bittencourt", "Avenida Gov. Magalhães Barata", "Avenida Governador José Malcher", "Avenida José Bonifácio", "Avenida João Paulo II", "Avenida Marechal Hermes", "Avenida Marquês de Herval", "Avenida Nossa Senhora de Nazaré", "Avenida Nª Senhora de Nazaré", "Avenida Pedro Miranda", "Avenida Pedro Álvares Cabral", "Avenida Perimetral", "Avenida Portugal", "Avenida Presidente Vargas", "Avenida Roberto Camelier", "Avenida Senador Lemos", "Blvd. Castilhos França", "Boulevard Castilhos França", "Passagem 14 de Abril", "Passagem Eduardo Mendonça", "Passagem José Maria da Costa", "Passagem João Monteiro", "Passagem João de Deus", "Passagem Júlio César", "Passagem Monte Alegre", "Passagem Mucajás", "Passagem Pirajá", "Passagem Senador Lemos", "Passagem Sta Terezinha", "Passagem União", "Praça Centenário", "Praça Justo Chermont", "Praça Onze de Junho", "Praça Republica", "Praça do Relógio", "Quadra Vinte e Dezenove", "Rod. Arthur Bernardes", "Rod. Augusto Montenegro", "Rodovia Augusto Montenegro", "Rua 28 de Setembro", "Rua Aristides Lobo", "Rua Arsenal", "Rua Avertano Rocha", "Rua Barão de Igarapé Miri", "Rua Belém", "Rua Boaventura da Silva", "Rua Caetano Rufino", "Rua Curuçá", "Rua Engenheiro Fernando Guilhon", "Rua Gaspar Viana", "Rua Interna", "Rua João Balbi", "Rua João Diogo", "Rua Municipalidade", "Rua Oliveira Belo", "Rua Padre Prudêncio", "Rua Paes de Souza", "Rua Santo Antônio", "Rua Senador Manoel Barata", "Rua São Boaventura", "Rua São Diogo", "Rua Treze de Maio", "Rua dos Caripunas", "Rua dos Mundurucus", "Rua dos Pariquis", "Rua Óbitos", "Travessa 14 de Março", "Travessa Angustura", "Travessa Barão de Mamoré", "Travessa Barão do Triunfo", "Travessa Diogo Moia", "Travessa Frei Gil de Vila Nova", "Travessa Gurupá", "Travessa Marquês de Pombal", "Travessa Mauriti", "Travessa Padre Eutiquio", "Travessa Padre Eutíquio", "Travessa Pirajá", "Travessa Quintino Bocaiuva", "Travessa Quintino Bocaiúva", "Travessa Rui Barbosa", "Travessa Segunda de Queluz", "Travessa São Francisco", "Travessa São Pedro", "Travessa Teófilo Conduru", "Tv. 14 de Março", "Tv. 1ºde Março", "Tv. Angustura", "Tv. Carlos de Carvalho", "Tv. Humaitá", "Tv. José Pio", "Tv. Marquês da Pombal. Cidade Velha", "Tv. Marquês de Pombal", "Tv. Marquês de Pombal, Cidade Velha", "Tv. Mauriti", "Tv. Padre Eutíquio", "Tv. Perebebuí", "Tv. Timbó", "Tv. Um", "Viela São Silvestre", "Vila Passarinho", "Avenida Doutor Lopo de Castro"];

const TIPOS = {av:"avenida",avenida:"avenida",tv:"travessa",trav:"travessa",trv:"travessa",travessa:"travessa",r:"rua",rua:"rua",
  pass:"passagem",psg:"passagem",pas:"passagem",passagem:"passagem",al:"alameda",alameda:"alameda",rod:"rodovia",rodovia:"rodovia",
  pca:"praca",praca:"praca",pc:"praca",blvd:"boulevard",bl:"boulevard",boulevard:"boulevard",bulevar:"boulevard",est:"estrada",estr:"estrada",estrada:"estrada",
  cj:"conjunto",conj:"conjunto",conjunto:"conjunto",vl:"vila",vila:"vila",viela:"viela",lg:"largo",largo:"largo",beco:"beco",ladeira:"ladeira",
  residencial:"residencial",jardim:"jardim",quadra:"quadra",lot:"loteamento",loteamento:"loteamento"};
const TITULOS = {dr:"doutor",or:"doutor",gov:"governador",gen:"general",mal:"marechal",pres:"presidente",sen:"senador",eng:"engenheiro",cel:"coronel",
  cmte:"comandante",com:"comandante",alm:"almirante",prof:"professor",profa:"professora",sta:"santa",sto:"santo",sr:"senhor",sra:"senhora",
  nsa:"nossa",n:"nossa",na:"nossa",pe:"padre",frei:"frei",dom:"dom",d:"dom",vsc:"visconde",visc:"visconde",bar:"barao",cons:"conselheiro",
  "1o":"1","1a":"1","1º":"1",primeiro:"1",primeira:"1",segunda:"2",segundo:"2",terceira:"3",terceiro:"3"};
const STOP = new Set(["de","da","do","dos","das","e"]);
// palavras que nunca fazem parte de nome de rua (textos de equipe, empresa, carimbo)
const LIXO_RE = /\b(equipe|mutirao|alto padrao|encarregad[oa]|supervisor|empresa|concessionaria|motorista|morista|colaborador[a]?|codigo|foto|timemark|ciclus|belem limp\w*|limpa belem|servico|turno|registro|fiscal|fiscaliza\w*|fiscais|prefeitura|sezel|gestor[a]?|coordenador[a]?|supervisao|inspetor[a]?|limpeza|varricao|capina[cç]?ao|coleta|rocagem|raspagem|lavagem|altitude|velocidade|numero de indice|google|verified|real)\b/;

const NUM_WORDS = {um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30};
function streetTokens(s){
  const t0 = normTxt(String(s||"").replace(/n[ºª°]\s*/gi,"nossa ").replace(/(\d)\s*[ºª°o]\b/g,"$1")).split(" ").filter(Boolean).map(w => w.replace(/([a-z])0\b/g,"$1o").replace(/^0([a-z])/,"o$1"));
  // números por extenso viram algarismos ("quinze de agosto" = "15 de agosto", "vinte e cinco" = "25")
  const t = [];
  for (let i=0;i<t0.length;i++){
    const w = t0[i];
    if (NUM_WORDS[w] !== undefined){
      let v = NUM_WORDS[w];
      if ((v===20||v===30) && t0[i+1]==="e" && NUM_WORDS[t0[i+2]] !== undefined && NUM_WORDS[t0[i+2]] < 10){ v += NUM_WORDS[t0[i+2]]; i += 2; }
      t.push(String(v));
    } else t.push(w);
  }
  const out = [];
  t.forEach((w,i)=>{ if (i===0 && TIPOS[w]) out.push(TIPOS[w]); else if (TITULOS[w]) out.push(TITULOS[w]); else if (!STOP.has(w)) out.push(w); });
  if (out[0]==="nossa" && out[1]==="senhora") {} // ok
  return out;
}
function streetKey(s, keepNumber){
  let t = streetTokens(s);
  // número da porta no fim ("Av. Portugal 440") não faz parte do nome
  if (!keepNumber && t.length > 2 && /^\d+[a-z]?$/.test(t[t.length-1]) && !/^\d+$/.test(t[t.length-2]||"")) t = t.slice(0,-1);
  return t.join(" ");
}
function splitType(key){ const t = key.split(" "); return Object.values(TIPOS).includes(t[0]) ? {tipo:t[0], nome:t.slice(1).join(" ")} : {tipo:"", nome:key}; }
function lev(a, b){
  if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = new Array(n+1), cur = new Array(n+1); for (let j=0;j<=n;j++) prev[j]=j;
  for (let i=1;i<=m;i++){ cur[0]=i; const ca=a.charCodeAt(i-1); for (let j=1;j<=n;j++){ const c = ca===b.charCodeAt(j-1)?0:1; cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+c); } [prev,cur]=[cur,prev]; }
  return prev[n];
}
const sim = (a,b) => 1 - lev(a,b) / Math.max(a.length, b.length, 1);

const LISTAS = {
  idx:null, bIdx:null, memo:new Map(), extras:[], fixes:{},
  build(extras, fixes){
    this.extras = extras || []; if (fixes) this.fixes = fixes;
    const seen = new Map();
    for (const nm of [...RUAS_BASE, ...this.extras]){
      const k = streetKey(nm, true); if (!k || seen.has(k)) continue;
      const {tipo, nome} = splitType(k); seen.set(k, {nome:nm, key:k, tipo, nk:nome});
    }
    this.idx = [...seen.values()];
    this.bIdx = BAIRROS_OFICIAIS.map(b=>({nome:b[0], k:normTxt(b[0])}));
    this.memo.clear();
  },
  ruas(){ if (!this.idx) this.build(); return this.idx; },
  isLixo(s){ return !!s && LIXO_RE.test(normTxt(s)); },
  // devolve {nome, status: "ok" | "corrigida" | "fora" | "lixo"}
  rua(raw){
    if (!raw) return null;
    const mk = "r|" + raw; if (this.memo.has(mk)) return this.memo.get(mk);
    let res;
    const cleanRaw = String(raw).split(/,|\s[-–]\s/)[0].trim();
    const fx = this.fixes[streetKey(cleanRaw, true)];
    if (fx) res = {nome:fx, status:"corrigida"}; // correção que você já fez antes para esta mesma leitura
    else if (this.isLixo(raw)) res = {nome:null, status:"lixo"};
    else {
      const k = streetKey(cleanRaw, true), k2 = streetKey(raw), {tipo, nome} = splitType(k2), idx = this.ruas();
      const exact = idx.find(e => e.key === k || e.key === k2);
      if (exact) res = {nome: exact.nome, status: exact.nome === cleanRaw ? "ok" : "corrigida"};
      else {
        let best = null, bs = 0, second = 0;
        for (const e of idx){
          if (tipo && e.tipo && e.tipo !== tipo) continue;
          const s = Math.max(sim(nome, e.nk), sim(nome.replace(/ /g,""), e.nk.replace(/ /g,""))); if (s > bs){ second = bs; bs = s; best = e; } else if (s > second) second = s;
        }
        // nome cortado no fim ("Avenida Doutor Lopo de" → "Avenida Doutor Lopo de Castro"): completa quando só uma rua oficial começa assim
        const pref = nome.split(" ").length >= 2 && nome.length >= 8 ? idx.filter(e => (!tipo || !e.tipo || e.tipo === tipo) && e.nk.startsWith(nome + " ") && e.nk.split(" ").length - nome.split(" ").length <= 2) : [];
        if (pref.length === 1) res = {nome: pref[0].nome, status:"corrigida", score:.9};
        else if (best && nome.length >= 5 && bs >= (nome.length >= 10 ? .84 : .86) && bs - second >= .04) res = {nome: best.nome, status:"corrigida", score:bs};
        else if (!tipo){ // sem tipo: aceita só se for quase igual
          let b2 = null, s2 = 0; for (const e of idx){ const s = sim(nome, e.nk); if (s > s2){ s2 = s; b2 = e; } }
          res = b2 && s2 >= .93 ? {nome:b2.nome, status:"corrigida", score:s2} : {nome:cleanRaw, status:"fora"};
        } else res = {nome:cleanRaw, status:"fora"};
      }
    }
    // lixo grudado no fim ("Rod Augusto Montenegeo;ahO Tenenê"): tenta sem as últimas palavras
    if (res && res.status === "fora" && /[;:@#*_=<>~]|[a-z][A-Z]{2}|\d[a-zA-Z]{2,}/.test(String(raw))){
      const toks = String(raw).replace(/[;:@#*_=<>~].*$/, "").trim().split(/\s+/);
      for (let d = 0; d <= 3 && toks.length - d >= 3; d++){
        const r2 = this.rua(toks.slice(0, toks.length - d).join(" "));
        if (r2 && (r2.status === "ok" || r2.status === "corrigida")){ res = {nome:r2.nome, status:"corrigida", score:r2.score||.85}; break; }
      }
    }
    this.memo.set(mk, res); return res;
  },
  bairro(raw){
    if (!raw) return null;
    const mk = "b|" + raw; if (this.memo.has(mk)) return this.memo.get(mk);
    if (!this.bIdx) this.build();
    const n = normTxt(String(raw).split(",")[0]).replace(/^bairro\s+/,""); let res;
    const ex = this.bIdx.find(b => b.k === n);
    if (TIPOS[n]) res = {nome:null, status:"lixo"};
    else if (ex) res = {nome:ex.nome, status: ex.nome === raw ? "ok" : "corrigida"};
    else if (BAIRRO_ALIAS[n]) res = {nome:BAIRRO_ALIAS[n], status:"corrigida"};
    else {
      let best = null, bs = 0, second = 0;
      for (const b of this.bIdx){ const s = sim(n, b.k); if (s > bs){ second = bs; bs = s; best = b; } else if (s > second) second = s; }
      // "Montese (Terra Firme)", "Guamá, O E": procura um bairro oficial contido no texto
      const inside = this.bIdx.filter(b => b.k.length >= 4 && (" "+n+" ").includes(" "+b.k+" ")).sort((a,b)=>b.k.length-a.k.length)[0];
      if (best && n.length >= 4 && bs >= .8 && bs - second >= .05) res = {nome:best.nome, status:"corrigida", score:bs};
      else if (inside) res = {nome:inside.nome, status:"corrigida"};
      else if (this.isLixo(raw) || /^(bel[eé]m|par[aá]|brasil|pa)$/i.test(n)) res = {nome:null, status:"lixo"};
      else res = {nome:raw, status:"fora"};
    }
    this.memo.set(mk, res); return res;
  },
};


// ---------- leitor de alta precisão (PaddleOCR PP-OCRv4 via onnxruntime-web) ----------
// Mais lento que o Tesseract, mas lê muito melhor os números grandes do Timemark e textos sobre fundo claro.
const HP = {
  ready: null, det: null, rec: null, keys: null,
  base(){ return new URL((window.HP_BASE||"hp/"), location.href).href; },
  async init(onMsg){
    if (this.ready) return this.ready;
    this.ready = (async () => {
      if (!window.ort) throw new Error("o motor de alta precisão não carregou nesta página");
      if (location.protocol === "file:") throw new Error("a leitura de alta precisão só funciona com a página publicada (Vercel) ou num servidor local");
      const base = this.base();
      ort.env.wasm.wasmPaths = base; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
      const get = async (f, label) => {
        onMsg && onMsg(`Baixando ${label} (só na primeira vez)…`);
        const r = await fetch(base + f);
        if (!r.ok) throw new Error(`o arquivo hp/${f} não foi encontrado no site (${r.status}). Confira se a pasta "hp" foi enviada`);
        return new Uint8Array(await r.arrayBuffer());
      };
      const det = await get("det-model.wasm", "o detector de texto, 4,6 MB");
      const rec = await get("rec-model.wasm", "o reconhecedor de texto, 10 MB");
      const kr = await fetch(base + "keys.json"); if (!kr.ok) throw new Error("o arquivo hp/keys.json não foi encontrado no site");
      const keys = await kr.json();
      onMsg && onMsg("Iniciando o motor de alta precisão…");
      this.det = await ort.InferenceSession.create(det, {executionProviders: ["wasm"], graphOptimizationLevel: "all"});
      this.rec = await ort.InferenceSession.create(rec, {executionProviders: ["wasm"], graphOptimizationLevel: "all"});
      this.keys = ["", ...keys, " "];
      return this;
    })();
    try { return await this.ready; } catch(e){ this.ready = null; throw e; }
  },
  // devolve o texto lido, uma linha por linha visual (de cima para baixo)
  async read(blob, opts = {}){
    const maxSide = opts.maxSide || 1600;
    const im = await decode(blob);
    const W0 = im.width, H0 = im.height;
    // imagem de trabalho (lado maior até maxSide)
    const k0 = Math.min(1, maxSide / Math.max(W0, H0));
    const W1 = Math.round(W0 * k0), H1 = Math.round(H0 * k0);
    const src = document.createElement("canvas"); src.width = W1; src.height = H1;
    const sg = src.getContext("2d", {willReadFrequently: true}); sg.drawImage(im, 0, 0, W1, H1); if (im.close) im.close();
    // --- detecção
    let r = 1; const mn = Math.min(W1, H1); if (mn < 736) r = 736 / mn;
    const dw = Math.max(32, Math.round(W1 * r / 32) * 32), dh = Math.max(32, Math.round(H1 * r / 32) * 32);
    const dc = document.createElement("canvas"); dc.width = dw; dc.height = dh;
    const dg = dc.getContext("2d", {willReadFrequently: true}); dg.drawImage(src, 0, 0, dw, dh);
    const px = dg.getImageData(0, 0, dw, dh).data, plane = dw * dh, inp = new Float32Array(3 * plane);
    for (let i = 0, p = 0; p < plane; i += 4, p++){ inp[p] = (px[i+2]/255 - .5)/.5; inp[plane+p] = (px[i+1]/255 - .5)/.5; inp[2*plane+p] = (px[i]/255 - .5)/.5; }
    const dout = await this.det.run({[this.det.inputNames[0]]: new ort.Tensor("float32", inp, [1, 3, dh, dw])});
    const prob = dout[this.det.outputNames[0]].data;
    // mapa binário + dilatação 2x2
    const bin = new Uint8Array(plane);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++){
      const p = y*dw + x;
      if (prob[p] > .3 || (x>0 && prob[p-1] > .3) || (y>0 && prob[p-dw] > .3) || (x>0 && y>0 && prob[p-dw-1] > .3)) bin[p] = 1;
    }
    // componentes conectados → caixas
    const lab = new Int32Array(plane), stack = new Int32Array(plane), boxes = [];
    let L = 0;
    for (let s = 0; s < plane; s++){
      if (!bin[s] || lab[s]) continue;
      L++; let sp = 0; stack[sp++] = s; lab[s] = L;
      let x0 = dw, y0 = dh, x1 = 0, y1 = 0;
      while (sp){
        const p = stack[--sp], x = p % dw, y = (p / dw) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && bin[p-1] && !lab[p-1]){ lab[p-1] = L; stack[sp++] = p-1; }
        if (x < dw-1 && bin[p+1] && !lab[p+1]){ lab[p+1] = L; stack[sp++] = p+1; }
        if (y > 0 && bin[p-dw] && !lab[p-dw]){ lab[p-dw] = L; stack[sp++] = p-dw; }
        if (y < dh-1 && bin[p+dw] && !lab[p+dw]){ lab[p+dw] = L; stack[sp++] = p+dw; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (Math.min(bw, bh) < 3) continue;
      let sum = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sum += prob[y*dw + x];
      if (sum / (bw*bh) < .5) continue;
      const d = (bw*bh) * 1.6 / (2*(bw+bh));
      const ex0 = Math.max(0, x0 - d), ey0 = Math.max(0, y0 - d), ex1 = Math.min(dw, x1 + 1 + d), ey1 = Math.min(dh, y1 + 1 + d);
      if (Math.min(ex1-ex0, ey1-ey0) < 5) continue;
      boxes.push({x: ex0/dw*W1, y: ey0/dh*H1, w: (ex1-ex0)/dw*W1, h: (ey1-ey0)/dh*H1});
    }
    // --- reconhecimento
    const items = [];
    const rc = document.createElement("canvas"), rg = rc.getContext("2d", {willReadFrequently: true});
    for (const b of boxes){
      if (b.h > b.w * 1.5) continue; // texto vertical (ex.: "Timemark Verified")
      const rw = Math.max(16, Math.min(1600, Math.ceil(48 * b.w / b.h)));
      rc.width = rw; rc.height = 48; rg.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, rw, 48);
      const q = rg.getImageData(0, 0, rw, 48).data, pl = rw*48, t = new Float32Array(3*pl);
      for (let i = 0, p = 0; p < pl; i += 4, p++){ t[p] = (q[i+2]/255 - .5)/.5; t[pl+p] = (q[i+1]/255 - .5)/.5; t[2*pl+p] = (q[i]/255 - .5)/.5; }
      const o = await this.rec.run({[this.rec.inputNames[0]]: new ort.Tensor("float32", t, [1, 3, 48, rw])});
      const out = o[this.rec.outputNames[0]], [, T, C] = out.dims, data = out.data;
      let txt = "", last = 0, cs = 0, n = 0;
      for (let s = 0; s < T; s++){
        let bi = 0, bv = -1; const off = s*C;
        for (let c = 0; c < C; c++){ const v = data[off+c]; if (v > bv){ bv = v; bi = c; } }
        if (bi !== 0 && bi !== last){ txt += this.keys[bi] || ""; cs += bv; n++; }
        last = bi;
      }
      if (n && cs/n >= .5 && txt.trim()) items.push({...b, txt});
    }
    // ordena em linhas visuais
    items.sort((a,b)=> (a.y + a.h/2) - (b.y + b.h/2));
    const lines = [];
    for (const it of items){
      const cy = it.y + it.h/2, ln = lines.find(l => Math.abs(l.cy - cy) < Math.min(l.h, it.h) * .5);
      if (ln){ ln.items.push(it); } else lines.push({cy, h: it.h, items: [it]});
    }
    return lines.map(l => l.items.sort((a,b)=>a.x-b.x).map(i=>i.txt).join(" ")).join("\n");
  }
};

// ---------- Ensinar a IA os serviços (opcional) ----------
// Nada aqui roda sozinho: só quando o usuário abre o painel e clica. Sem ele, a ferramenta funciona igual.
// Motores: "local" (aprende no navegador com as fotos que já têm serviço: texto do carimbo, remetente,
// horário e cores da foto), "gemini" (chave grátis do Google AI Studio, só no site publicado) e
// "claude" (só dentro do claude.ai, quando a conta permite imagens).
const LEARN_DICAS = {
  "Capinação e Raspagem": "equipe agachada ou curvada tirando mato e terra do meio-fio e da sarjeta com enxada, raspadeira ou pá",
  "Roçagem": "roçadeira costal (a motor) cortando capim alto em canteiro, praça ou terreno; trabalhador com protetor facial",
  "Serviços de Mutirão - Colégios Eleitorais": "mutirão de limpeza em escola ou colégio usado como local de votação: pátio, calçada e entorno do prédio escolar, muitos trabalhadores juntos",
  "Mutirão": "muitos trabalhadores juntos num mesmo local fazendo vários serviços ao mesmo tempo (varrer, capinar, recolher)",
  "Coleta Domiciliar (dividir por horário)": "caminhão compactador recolhendo sacos de lixo de casas; coletores jogando sacos na traseira do caminhão",
  "Coleta Domiciliar Diurna": "caminhão compactador recolhendo sacos de lixo de casas, de dia",
  "Coleta Domiciliar Noturna": "caminhão compactador recolhendo sacos de lixo de casas, à noite",
  "Lavagem de Paradas de Ônibus": "abrigo ou parada de ônibus sendo lavado com água, mangueira ou escova",
  "Troca de Caixa Coletora": "caixa estacionária (contêiner metálico) sendo trocada ou içada por caminhão poliguindaste",
  "Varrição Mecanizada": "caminhão varredeira (máquina com escovas giratórias) varrendo a via",
  "Varrição": "gari com vassoura e carrinho (lutocar) varrendo calçada, sarjeta ou praça",
  "Coleta Mecanizada de Entulho": "pá carregadeira ou retroescavadeira colocando entulho no caminhão",
  "Coleta de Entulho": "entulho, restos de obra, móveis velhos ou galhos recolhidos à mão para caminhão caçamba",
  "Coleta de Feiras e Mercados": "feira livre ou mercado; restos de frutas e verduras, barracas, limpeza depois da feira",
  "Lavagem de Ruas e Logradouros": "caminhão-pipa ou mangueira lavando rua, praça ou calçada com água",
};
// outras IAs que enxergam fotos (formato compatível com OpenAI). Os nomes de modelo mudam com o tempo: dá para editar no painel.
const PROVS = {
  ollama: {nome:"Ollama no seu PC (Qwen3-VL, MiniCPM-V, Moondream · grátis, sem limite)", curto:"O Ollama", url:"http://localhost:11434/v1", chave:false,
    models:["qwen3-vl:4b","qwen3-vl:2b","qwen3-vl:8b","minicpm-v","moondream","gemma3:4b"], per:1, ex:0, wait:0},
  zhipu: {nome:"Zhipu GLM-4.6V-Flash (chinesa · chave grátis)", curto:"O GLM", url:"https://open.bigmodel.cn/api/paas/v4", chave:true, pegar:"open.bigmodel.cn → API Keys (ou z.ai → API Keys, e troque o endereço para https://api.z.ai/api/paas/v4)",
    models:["glm-4.6v-flash","glm-4.1v-thinking-flash","glm-4v-flash"], per:3, ex:2, wait:1500},
  groq: {nome:"Groq (chave grátis · rápido)", curto:"O Groq", url:"https://api.groq.com/openai/v1", chave:true, pegar:"console.groq.com/keys",
    models:["qwen/qwen3.8-27b","meta-llama/llama-4-scout-17b-16e-instruct"], per:3, ex:2, wait:2500},
  outro: {nome:"Outra IA compatível com OpenAI (LM Studio, SiliconFlow…)", curto:"A IA", url:"", chave:true, pegar:"o site do serviço escolhido",
    models:[""], per:3, ex:2, wait:1500},
};
const LRN_STOP = new Set("belem para brasil bairro rua avenida travessa passagem altitude velocidade rapidez norte sul leste oeste snm kmh ago set out nov dez jan fev mar abr mai jun jul de da do dos das".split(" "));
var LRN_GEM_WAIT = 4500; // pausa entre chamadas ao Gemini (limite grátis)
const LRN_DIM = 2048, LRN_MAX = 4000, LRN_PER_CLASS = 600;

const LRN = {
  model:null, dirty:true, chain:Promise.resolve(), running:false, stop:false, page:0,
  cfg(){ const c = S.cfg; c.learn = c.learn || {engine:"local", model:"gemini-flash-latest", dicas:null, ok:0, n:0, minConf:.55}; return c.learn; },
  key(){ try { return localStorage.getItem("blGeminiKey") || ""; } catch(e){ return ""; } },
  setKey(v){ try { v ? localStorage.setItem("blGeminiKey", v) : localStorage.removeItem("blGeminiKey"); } catch(e){} },
  pkey(p){ try { return localStorage.getItem("blKey_" + p) || ""; } catch(e){ return ""; } },
  setPkey(p, v){ try { v ? localStorage.setItem("blKey_" + p, v) : localStorage.removeItem("blKey_" + p); } catch(e){} },
  prov(p){ const L = this.cfg(); L.provs = L.provs || {}; const d = PROVS[p]; const c = L.provs[p] || {}; return {url: c.url || d.url, model: c.model || d.models[0]}; },
};

// nomes que a IA pode escolher (diurna/noturna viram "dividir por horário" quando esse item existe)
function lrnClasses(){
  const all = services().map(s=>s.name), div = all.find(n=>/dividir por hor/i.test(n));
  return all.filter(n => !(div && /^coleta domiciliar (diurna|noturna)$/i.test(n)));
}
function lrnCanon(svc){
  if (!svc) return "";
  const cls = lrnClasses(), div = cls.find(n=>/dividir por hor/i.test(n));
  if (div && /^coleta domiciliar/i.test(svc)) return div;
  return cls.includes(svc) ? svc : (cls.find(n=>norm(n)===norm(svc)) || "");
}
function lrnDicas(){
  const d = Object.assign({}, LEARN_DICAS, LRN.cfg().dicas || {});
  return lrnClasses().map(n=>[n, d[n] || ""]);
}

// ---------- características de uma foto ----------
function lrnTokens(p){
  const o = p.ocr || {}, lote = S.lotes.find(l=>l.id===p.loteId) || {};
  const txt = [p.ocrText || "", o.responsavel, o.referencia, o.app, p.wa && p.wa.sender, p.wa && p.wa.caption, lote.name].filter(Boolean).join(" ");
  const w = new Set();
  for (const t of normTxt(txt).split(" ")) if (t.length >= 3 && !/\d/.test(t) && !LRN_STOP.has(t)) w.add("w:" + t);
  if (p.wa && p.wa.sender) w.add("s:" + normTxt(p.wa.sender));
  if (lote.name) w.add("l:" + normTxt(lote.name.replace(/\.zip$/i,"")).slice(0,40));
  if (o.app) w.add("a:" + normTxt(o.app));
  const t = parseHM(p.edit && p.edit.hora) || parseHM(o.hora) || (p.wa && p.wa.date && p.wa.hasTime ? pad(p.wa.date.getHours())+":00" : "");
  if (t){ const h = +t.slice(0,2); w.add("h:" + (h>=18||h<5 ? "noite" : h<12 ? "manha" : "tarde")); }
  return [...w].slice(0,220);
}
function rgb2hsv(r,g,b){ const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn; let h=0; if (d){ if (mx===r) h=((g-b)/d)%6; else if (mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if (h<0) h+=360; } return [h, mx?d/mx:0, mx/255]; }
async function lrnColor(p){
  if (p.lcol) return p.lcol;
  let im = null;
  if (p.thumb) im = await new Promise(res=>{ const i = new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src = p.thumb; });
  if (!im){ const blob = await blobOf(p); try { im = await createImageBitmap(blob, {resizeWidth:48, resizeHeight:48, resizeQuality:"medium"}); } catch(e){ im = await decode(blob); } }
  if (!im) return null;
  const c = document.createElement("canvas"); c.width = 48; c.height = 48; const g = c.getContext("2d", {willReadFrequently:true}); g.drawImage(im,0,0,48,48); if (im.close) im.close();
  const d = g.getImageData(0,0,48,48).data, v = [];
  for (const [y0,y1] of [[0,24],[24,48],[0,48]]){
    const hs = new Array(48).fill(0), vh = new Array(8).fill(0); let n = 0;
    for (let y=y0;y<y1;y++) for (let x=0;x<48;x++){ const k=(y*48+x)*4, [h,s,vv] = rgb2hsv(d[k],d[k+1],d[k+2]); hs[Math.min(11,Math.floor(h/30))*4 + Math.min(3,Math.floor(s*4))]++; vh[Math.min(7,Math.floor(vv*8))]++; n++; }
    v.push(...hs.map(x=>x/n), ...vh.map(x=>x/n));
  }
  let gx=0, gy=0; for (let y=0;y<47;y++) for (let x=0;x<47;x++){ const k=(y*48+x)*4, l=d[k]+d[k+1]+d[k+2]; gx += Math.abs(l-(d[k+4]+d[k+5]+d[k+6])); gy += Math.abs(l-(d[k+192]+d[k+193]+d[k+194])); }
  v.push(gx/(47*47*3*50), gy/(47*47*3*50));
  return p.lcol = v.map(x=>Math.round(x*1000)/1000);
}
function lrnHash(s){ let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0) % LRN_DIM; }

// ---------- exemplos guardados ----------
function lrnExamples(){ const out = []; if (!IDB.mem) return out; for (const [k,v] of IDB.mem) if (typeof k==="string" && k.startsWith("learn|") && v && v.svc) out.push({k, ...v}); return out; }
function lrnAdd(p, svc, src){ return LRN.chain = LRN.chain.then(()=>lrnAdd1(p, svc, src)).catch(()=>{}); }
async function lrnAdd1(p, svc, src){
  svc = lrnCanon(svc); if (!p || !svc) return;
  let col = null; try { col = await lrnColor(p); } catch(e){}
  await IDB.set("learn|" + p.hash, {svc, tok: lrnTokens(p), col, src, t: Date.now()});
  LRN.dirty = true;
  // guarda até 2 fotos de exemplo por serviço (pequenas) para mostrar à IA externa
  if ((src==="manual" || src==="confirmada") && IDB.mem){
    const k0 = `learnimg|${svc}|0`, k1 = `learnimg|${svc}|1`, c0 = IDB.mem.get(k0), c1 = IDB.mem.get(k1);
    if (!(c0 && c0.hash===p.hash) && !(c1 && c1.hash===p.hash)){ try { const r = await scaled(await blobOf(p), 384, .6); await IDB.set(!c0 ? k0 : k1, {hash:p.hash, url:r.url}); } catch(e){} }
  }
}
// fotos desta sessão que já têm serviço confiável (lote, texto do carimbo ou você) viram exemplos
async function lrnCollect(onProg){
  const have = new Set(lrnExamples().map(e=>e.k));
  const byCls = new Map();
  for (const p of S.photos){
    if (!(p.status==="ok"||p.status==="manual") || p.include===false || p.dupOf) continue;
    const i = info(p); if (!["manual","lote","texto"].includes(i.svcSrc)) continue;
    const svc = lrnCanon(p.edit.servico || i.service); if (!svc) continue;
    if (have.has("learn|"+p.hash)) continue;
    if (!byCls.has(svc)) byCls.set(svc, []); byCls.get(svc).push([p, i.svcSrc]);
  }
  const jobs = []; for (const [, l] of byCls){ const step = Math.max(1, l.length/150); for (let k=0;k<l.length && jobs.length<3000;k+=step) jobs.push(l[Math.floor(k)]); }
  let n = 0; for (const [p, src] of jobs){ if (LRN.stop) break; await lrnAdd(p, p.edit.servico || info(p).service, src); if (++n % 20 === 0) onProg && onProg(n, jobs.length); }
  // limites: no máximo LRN_PER_CLASS por serviço e LRN_MAX no total (fica o mais recente)
  const ex = lrnExamples().sort((a,b)=>(b.t||0)-(a.t||0)), cnt = new Map(); let tot = 0;
  for (const e of ex){ const c = (cnt.get(e.svc)||0)+1; cnt.set(e.svc, c); if (c > LRN_PER_CLASS || ++tot > LRN_MAX) IDB.del(e.k); }
  return n;
}

// ---------- modelo local: regressão logística multiclasse ----------
function lrnVec(tok, col, st){
  const idx = new Map(); for (const t of tok||[]){ const h = lrnHash(t); idx.set(h, 1); }
  const dense = new Float32Array(st ? st.mu.length : 0);
  if (st && col) for (let j=0;j<dense.length;j++) dense[j] = ((col[j]||0) - st.mu[j]) / st.sd[j] * .3;
  return {idx:[...idx.keys()], dense};
}
function lrnTrain(){
  const ex = lrnExamples().filter(e=>lrnClasses().includes(lrnCanon(e.svc)));
  const cnt = new Map(); ex.forEach(e=>{ const s = lrnCanon(e.svc); cnt.set(s,(cnt.get(s)||0)+1); });
  const cls = [...cnt].filter(([,n])=>n>=3).map(([s])=>s);
  if (cls.length < 2) return LRN.model = {cls, ready:false, cnt};
  const use = ex.filter(e=>cls.includes(lrnCanon(e.svc)));
  const D = (use.find(e=>e.col)||{col:[]}).col.length, mu = new Array(D).fill(0), sd = new Array(D).fill(0); let nc = 0;
  for (const e of use) if (e.col && e.col.length===D){ nc++; for (let j=0;j<D;j++) mu[j] += e.col[j]; }
  for (let j=0;j<D;j++) mu[j] /= Math.max(1,nc);
  for (const e of use) if (e.col && e.col.length===D) for (let j=0;j<D;j++) sd[j] += (e.col[j]-mu[j])**2;
  for (let j=0;j<D;j++) sd[j] = Math.sqrt(sd[j]/Math.max(1,nc)) + 1e-3;
  const st = {mu, sd}, K = cls.length, X = use.map(e=>lrnVec(e.tok, e.col && e.col.length===D ? e.col : null, st)), Y = use.map(e=>cls.indexOf(lrnCanon(e.svc)));
  // peso por classe: serviços com poucos exemplos não ficam esquecidos
  const cw = cls.map(c => Math.min(4, use.length / (K * cnt.get(c))));
  const W = Array.from({length:K}, ()=>new Float32Array(LRN_DIM)), V = Array.from({length:K}, ()=>new Float32Array(D)), b = new Float32Array(K);
  const lam = 1e-4, order = X.map((_,i)=>i);
  for (let ep=0; ep<30; ep++){
    const lr = .5 / (1 + ep*.15);
    for (let i=order.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [order[i],order[j]] = [order[j],order[i]]; }
    for (const i of order){
      const x = X[i], pr = lrnScore(W,V,b,x);
      for (let k=0;k<K;k++){
        const g = (pr[k] - (Y[i]===k?1:0)) * cw[Y[i]] * lr;
        if (!g) continue;
        const Wk = W[k], Vk = V[k];
        for (const h of x.idx) Wk[h] -= g + lam*Wk[h];
        for (let j=0;j<D;j++) Vk[j] -= g*x.dense[j] + lam*Vk[j];
        b[k] -= g;
      }
    }
  }
  LRN.dirty = false;
  return LRN.model = {cls, W, V, b, st, D, ready:true, cnt, n:use.length};
}
function lrnScore(W,V,b,x){
  const K = b.length, z = new Float64Array(K);
  for (let k=0;k<K;k++){ let s = b[k]; const Wk = W[k], Vk = V[k]; for (const h of x.idx) s += Wk[h]; for (let j=0;j<x.dense.length;j++) s += Vk[j]*x.dense[j]; z[k] = s; }
  const m = Math.max(...z); let t = 0; for (let k=0;k<K;k++){ z[k] = Math.exp(z[k]-m); t += z[k]; }
  for (let k=0;k<K;k++) z[k] /= t; return z;
}
async function lrnPredictLocal(p){
  const M = LRN.model; if (!M || !M.ready) return null;
  let col = null; try { col = await lrnColor(p); } catch(e){}
  const pr = lrnScore(M.W, M.V, M.b, lrnVec(lrnTokens(p), col && col.length===M.D ? col : null, M.st));
  let k = 0; for (let j=1;j<pr.length;j++) if (pr[j] > pr[k]) k = j;
  return {svc: M.cls[k], conf: pr[k]};
}

// ---------- Gemini / Claude (opcionais) ----------
function lrnPrompt(n){
  const d = lrnDicas().map(([s,t])=>`- ${s}${t?": "+t:""}`).join("\n");
  return `Você classifica fotos de equipes de limpeza urbana da concessionária Belém Limpa, em Belém-PA.\nServiços possíveis (use EXATAMENTE um destes nomes):\n${d}\nSe a foto não mostrar claramente o serviço, responda null.`
    + `\nAs primeiras imagens (se houver) são exemplos já conferidos pela fiscalização. Depois vêm ${n} foto(s) para classificar.`
    + `\nResponda só com um array JSON, uma entrada por foto a classificar, na ordem: [{"i":1,"servico":"Varrição","confianca":0.8}]`;
}
function lrnExampleImgs(max){
  const out = []; if (!IDB.mem) return out;
  for (const s of lrnClasses()) for (const slot of [0,1]){ const v = IDB.mem.get(`learnimg|${s}|${slot}`); if (v && v.url) out.push({svc:s, url:v.url}); }
  // 1 por serviço primeiro; a segunda só se couber
  const first = out.filter((e,i)=>out.findIndex(x=>x.svc===e.svc)===i), rest = out.filter(e=>!first.includes(e));
  return first.concat(rest).slice(0, max);
}
// cota do Gemini por modelo: "por minuto" (espera e tenta de novo) e "por dia" (passa para o próximo modelo; renova ~4h de Belém)
LRN.gemOut = LRN.gemOut || {};
function gemDia(){ return new Date(Date.now() - 7*3600e3).toISOString().slice(0,10); } // dia do Pacífico (quando o Google zera a cota)
async function geminiCall(parts){
  const L = LRN.cfg(), key = LRN.key(); if (!key) throw new Error("cole a sua chave do Gemini no campo acima.");
  const models = [...new Set([L.model || "gemini-flash-latest", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"])];
  const tick = t => { LRN.status = t; LRN.tick && LRN.tick(); };
  let busy = null, fmt = null, dia = 0, tentados = 0;
  try {
  for (const m of models){
    if (LRN.gemOut[m] === gemDia()){ dia++; continue; }
    tentados++;
    for (let tent=0; tent<3; tent++){
      if (LRN.stop) throw new Error("parado por você");
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {method:"POST",
          headers:{"Content-Type":"application/json", "x-goog-api-key":key},
          body: JSON.stringify({contents:[{role:"user", parts}], generationConfig:{responseMimeType:"application/json", temperature:0}})});
      } catch(e){ throw new Error(ENV.hasClaude ? "o Gemini não pode ser usado dentro do claude.ai (a página bloqueia sites externos). Use o site publicado (Vercel)." : "sem conexão com o Gemini (" + (e.message||e) + ")."); }
      if (r.status===404){ tentados--; break; } // esse modelo não existe mais: tenta o próximo sem avisar
      if (r.status===429){
        const j = await r.json().catch(()=>({})), txt = JSON.stringify(j);
        if (/per ?day|PerDay|daily/i.test(txt)){ LRN.gemOut[m] = gemDia(); dia++; tentados--; tick(`cota grátis de hoje do ${m} acabou; tentando outro modelo…`); break; }
        const rd = txt.match(/"retryDelay"\s*:\s*"(\d+)/), w = Math.min(90, rd ? +rd[1] + 2 : 20*(tent+1));
        tick(`limite por minuto do Gemini; esperando ${w} s…`); await new Promise(res=>setTimeout(res, w*1000));
        busy = "o Gemini está no limite grátis por minuto e não liberou"; continue;
      }
      // 500/503 = Google sobrecarregado: espera um pouco; depois da 2ª vez tenta outro modelo Gemini
      if (r.status>=500){ busy = `o Gemini está sobrecarregado agora (${r.status})`; if (tent>=1) break; tick("Google sobrecarregado; esperando 8 s…"); await new Promise(res=>setTimeout(res, 8000)); continue; }
      const j = await r.json().catch(()=>({}));
      if (!r.ok){ const msg = (j.error && j.error.message) || r.statusText; if (r.status===400 && /api key/i.test(msg)) throw new Error("chave do Gemini inválida. Confira em aistudio.google.com/apikey."); if (r.status===403) throw new Error("a chave não tem permissão para o Gemini: " + msg); throw new Error(`Gemini respondeu ${r.status}: ${msg}`); }
      const t = ((j.candidates||[])[0]||{}).content; const txt = t && t.parts ? t.parts.map(x=>x.text||"").join("") : "";
      tick("");
      try { return JSON.parse(txt.replace(/^```(json)?|```$/g,"").trim()); } catch(e){ fmt = "o Gemini respondeu fora do formato"; }
    }
  }
  } finally { tick(""); }
  if (busy) throw new Error(busy + ". Tente mais tarde ou use outra IA.");
  if (dia && !tentados) throw new Error("acabou a cota grátis de hoje do Gemini (em todos os modelos). Ela renova por volta das 4h da manhã (horário de Belém). Até lá, use outra IA (Groq, GLM, Ollama) ou o aprendizado no navegador; o que já foi sugerido fica guardado.");
  throw new Error(fmt || "nenhum modelo do Gemini respondeu. Confira o nome do modelo no campo acima.");
}
function lrnParseJson(txt){
  txt = String(txt||"").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(json)?/g, "").trim();
  try { return JSON.parse(txt); } catch(e){}
  const m = txt.match(/\[[\s\S]*\]/) || txt.match(/\{[\s\S]*\}/); if (m){ try { return JSON.parse(m[0]); } catch(e){} }
  throw new Error("a IA respondeu fora do formato");
}
async function openaiCall(prov, content){
  const d = PROVS[prov], c = LRN.prov(prov), key = LRN.pkey(prov), nome = d.curto.replace(/^[OA] /,"");
  if (!c.url) throw new Error("preencha o endereço da IA no campo acima.");
  if (d.chave && !key && prov!=="outro") throw new Error(`cole a sua chave do ${nome} no campo acima.`);
  const url = c.url.replace(/\/+$/,"") + "/chat/completions";
  let last;
  for (let tent=0; tent<3; tent++){
    let r;
    try {
      r = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json", ...(key ? {"Authorization":"Bearer " + key} : {})},
        body: JSON.stringify({model:c.model, temperature:0, max_tokens:800, messages:[{role:"user", content}]})});
    } catch(e){
      if (ENV.hasClaude) throw new Error("dentro do claude.ai a página bloqueia outros sites. Use o site publicado (Vercel).");
      if (prov==="ollama") throw new Error("não encontrei o Ollama neste PC. Confira se ele está aberto e se este site foi liberado (veja o passo a passo acima).");
      throw new Error(`sem conexão com ${d.curto.toLowerCase()} (${e.message||e}). Pode ser bloqueio do serviço a sites no navegador: tente outra IA.`);
    }
    const j = await r.json().catch(()=>({}));
    const msg = (j.error && (j.error.message || j.error)) || r.statusText;
    if (r.status===429 || r.status>=500){ last = new Error(`${d.curto} está ocupado ou no limite grátis agora (${r.status}). Tente mais tarde.`); await new Promise(res=>setTimeout(res, [6000,15000,30000][tent])); continue; }
    if (r.status===401 || r.status===403) throw new Error(`chave do ${nome} inválida ou sem permissão (${r.status}).`);
    if (r.status===404 && prov==="ollama") throw new Error(`o modelo ${c.model} não está instalado no Ollama. No Prompt de Comando: ollama pull ${c.model}`);
    if (!r.ok) throw new Error(`${nome} respondeu ${r.status}: ${typeof msg==="string" ? msg.slice(0,160) : JSON.stringify(msg).slice(0,160)}`);
    const txt = (((j.choices||[])[0]||{}).message||{}).content;
    return lrnParseJson(Array.isArray(txt) ? txt.map(x=>x.text||"").join("") : txt);
  }
  throw last;
}
async function lrnTestProv(prov){
  const c = LRN.prov(prov), key = LRN.pkey(prov);
  try {
    const r = await fetch(c.url.replace(/\/+$/,"") + "/models", {headers: key ? {"Authorization":"Bearer " + key} : {}});
    if (r.status===401 || r.status===403) return `<div class="msg bad">Conectou, mas a chave foi recusada (${r.status}).</div>`;
    const j = await r.json().catch(()=>({})), ids = (j.data||[]).map(m=>m.id);
    if (prov==="ollama"){ const tem = ids.some(id=>id===c.model || id.startsWith(c.model)); return tem ? `<div class="msg ok">Ollama encontrado e o modelo <b>${esc(c.model)}</b> está instalado.</div>` : `<div class="msg warn">Ollama encontrado, mas o modelo <b>${esc(c.model)}</b> não está instalado. Instalados: ${esc(ids.join(", ")||"nenhum")}. No Prompt de Comando: <code>ollama pull ${esc(c.model)}</code></div>`; }
    return r.ok ? `<div class="msg ok">Conectou${ids.length ? `. ${ids.includes(c.model) ? "O modelo escolhido está disponível." : "Confira se o nome do modelo está na lista do serviço."}` : "."}</div>` : `<div class="msg warn">O serviço respondeu ${r.status}. A sugestão ainda pode funcionar; teste com poucas fotos.</div>`;
  } catch(e){
    return `<div class="msg bad">${ENV.hasClaude ? "Dentro do claude.ai a página bloqueia outros sites: use o site publicado." : prov==="ollama" ? "Não encontrei o Ollama. Ele está aberto? O site foi liberado com OLLAMA_ORIGINS (passo 3)? Se o Chrome perguntar sobre acesso à rede local, clique em Permitir." : "Não consegui conectar a partir do navegador (" + esc(e.message||e) + "). Esse serviço pode não aceitar pedidos direto do navegador; use outra IA."}</div>`;
  }
}
async function lrnPredictRemote(batch, engine){
  const exs = lrnExampleImgs(engine==="claude" ? Math.max(0, (ENV.imgMax||6) - batch.length) : PROVS[engine] ? PROVS[engine].ex : 14);
  const imgs = await Promise.all(batch.map(async p=>(await scaled(await blobOf(p), 640, .72)).url));
  const hint = p => { const o = p.ocr||{}; return [o.servico_escrito && "texto na foto: "+o.servico_escrito, p.wa && p.wa.caption && "legenda: "+p.wa.caption.slice(0,80), (S.lotes.find(l=>l.id===p.loteId)||{}).name].filter(Boolean).join(" · "); };
  let arr;
  if (engine==="gemini"){
    const parts = [{text: lrnPrompt(batch.length)}];
    exs.forEach(e=>{ parts.push({text:`Exemplo conferido — serviço: ${e.svc}`}, {inline_data:{mime_type:"image/jpeg", data:e.url.split(",")[1]}}); });
    batch.forEach((p,k)=>{ const h = hint(p); parts.push({text:`Foto ${k+1} para classificar${h?" ("+h+")":""}:`}, {inline_data:{mime_type:"image/jpeg", data:imgs[k].split(",")[1]}}); });
    arr = await geminiCall(parts);
  } else if (PROVS[engine]){
    const content = [{type:"text", text: lrnPrompt(batch.length)}];
    exs.forEach(e=>{ content.push({type:"text", text:`Exemplo conferido — serviço: ${e.svc}`}, {type:"image_url", image_url:{url:e.url}}); });
    batch.forEach((p,k)=>{ const h = hint(p); content.push({type:"text", text:`Foto ${k+1} para classificar${h?" ("+h+")":""}:`}, {type:"image_url", image_url:{url:imgs[k]}}); });
    arr = await openaiCall(engine, content);
  } else {
    const blobs = await Promise.all([...exs.map(e=>fetch(e.url).then(r=>r.blob())), ...batch.map(async p=>scaled(await blobOf(p), 640, .72, "blob"))]);
    const legend = exs.map((e,i)=>`Imagem ${i+1}: exemplo conferido de "${e.svc}".`).concat(batch.map((p,k)=>`Imagem ${exs.length+k+1}: foto ${k+1} para classificar${hint(p)?" ("+hint(p)+")":""}.`)).join("\n");
    arr = await S.sample.json(lrnPrompt(batch.length) + "\n" + legend, {images:blobs, modelTier:"quick"});
  }
  arr = Array.isArray(arr) ? arr : (arr && Array.isArray(arr.fotos) ? arr.fotos : []);
  return batch.map((p,k)=>{ const r = arr.find(x=>+x.i===k+1) || arr[k]; const svc = r && lrnCanon(matchService(r.servico) || r.servico); return svc ? {svc, conf: Math.max(0, Math.min(1, +r.confianca || .7))} : null; });
}

// ---------- sugerir, conferir, corrigir ----------
function lrnTargets(all){
  const weak = !!LRN.cfg().checkWeak;
  return S.photos.filter(p=>{
    if (!(p.status==="ok"||p.status==="manual") || p.include===false || p.dupOf || p.edit.servico) return false;
    const i = info(p); if (!i.service || i.service===UNK || (all && i.svcSrc==="ia")) return true;
    // conferir também o serviço que veio do grupo/arquivo ou do cartão do co.urban (acha foto de roçagem no meio da capinação etc.)
    return weak && !p.aiChecked && (i.svcSrc==="lote" || i.svcSrc==="relatorio");
  });
}
async function lrnSuggest(){
  if (LRN.running) return; const L = LRN.cfg(), eng = L.engine, msg = t => { LRN.lastMsg = t; const el = $("#lrnMsg"); if (el) el.innerHTML = t; };
  if (S.cfg.groupBy==="nenhum"){ msg(`<div class="msg warn">O relatório está "Sem separar por serviço" (passo 1). Mude para "Separado por serviço" para usar as sugestões.</div>`); return; }
  const list = lrnTargets(false), weakIds = new Set(list.filter(p=>{ const s = info(p).svcSrc; return s==="lote" || s==="relatorio"; }).map(p=>p.id));
  LRN.weakIds = weakIds;
  if (!list.length){ msg(`<div class="msg">Nenhuma foto lida está sem serviço. Nada para sugerir.</div>`); return; }
  LRN.running = true; LRN.stop = false; LRN.porIA = ""; lrnRender();
  let got = 0, low = 0, err = "";
  try {
    if (eng==="local" && !lrnEngines().length){
      msg(`<div class="msg">Aprendendo com as fotos que já têm serviço…</div>`);
      await lrnCollect((a,b)=>msg(`<div class="msg">Aprendendo com as fotos que já têm serviço… ${a} de ${b}</div>`));
      const M = lrnTrain();
      if (!M.ready){ msg(`<div class="msg warn">Ainda não dá para aprender: preciso de pelo menos 3 fotos conferidas em 2 serviços diferentes. Marque algumas fotos e escolha o serviço (barra de baixo), ou use "Conferir" abaixo, e tente de novo.</div>`); return; }
      let k = 0;
      for (const p of list){
        if (LRN.stop) break;
        const r = await lrnPredictLocal(p); if (weakIds.has(p.id)){ p.aiOver = true; p.aiChecked = true; }
        if (r && r.conf >= L.minConf){ p.aiService = r.svc; p.aiConf = r.conf; p.aiBy = "local"; p.aiVotes = {local: r.svc}; saveEdit(p); got++; }
        else if (r){ p.aiGuess = r; low++; }
        if (++k % 25 === 0){ msg(`<div class="msg">Sugerindo… ${k} de ${list.length}</div>`); await new Promise(res=>setTimeout(res,0)); }
      }
    } else {
      const engs = lrnEngines();
      if (engs.includes("claude") && !(S.sample && ENV.images===true)) throw new Error("o Claude não pode ver imagens nesta conta/visualização.");
      const r = await lrnRunMany(engs, list, msg);
      got = r.got; low = r.low; err = r.err;
    }
  } catch(e){ err = e && e.message || String(e); }
  finally { LRN.running = false; }
  refreshAll(true);
  msg(`<div class="msg ${got?"ok":"warn"}">${LRN.porIA||""}Sugeri o serviço de <b>${got}</b> de ${list.length} foto(s)${low?`; em ${low} fiquei em dúvida (aparecem em "Conferir" como incertas)`:""}.${err?" Erro: "+esc(err):""} As sugestões aparecem com o selo "serviço pela IA". Confira abaixo: o que você confirmar ou corrigir vira exemplo e a IA aprende.</div>`);
  LRN.page = 0; lrnRender();
}
// ---------- várias IAs ao mesmo tempo ----------
const LRN_NOME = e => e==="gemini" ? "Gemini" : e==="claude" ? "Claude" : e==="local" ? "Navegador" : PROVS[e] ? PROVS[e].curto.replace(/^(O|A)\s+/,"") : e;
function lrnEngines(){ const L = LRN.cfg(); return [...new Set([L.engine, ...(L.multi||[])])].filter(e=>e && e!=="local"); }
function lrnEngReady(e){ if (e==="gemini") return !!LRN.key(); if (e==="claude") return !!(S.sample && ENV.images===true); const d = PROVS[e]; return !!d && (!d.chave || !!LRN.pkey(e)) && !!LRN.prov(e).url; }
// "dividir": cada IA pega o próximo lote livre da fila (uma não espera a outra; cada uma respeita o próprio limite)
// "votar": todas olham as mesmas fotos; só aplica quando a maioria concorda
async function lrnRunMany(engs, list, msg){
  const L = LRN.cfg(), vote = engs.length > 1 && L.multiMode === "votar", q = list.slice(), votes = new Map(), st = {}, errs = {};
  let got = 0, low = 0;
  const apply = (p, r, by, extra) => { if (LRN.weakIds && LRN.weakIds.has(p.id)){ p.aiOver = true; p.aiChecked = true; if (!r) saveEdit(p); } if (r && r.conf >= L.minConf){ p.aiService = r.svc; p.aiConf = r.conf; p.aiBy = by; p.aiVotes = extra || {[by]: r.svc}; p.aiGuess = null; saveEdit(p); got++; } else if (r){ p.aiGuess = r; p.aiVotes = extra || {[by]: r.svc}; low++; } };
  const tried = {}, stopped = {}, rep = {};
  const show = () => msg(`<div class="msg">${engs.length>1 ? (vote ? "As IAs estão votando" : "As IAs estão dividindo as fotos") : LRN_NOME(engs[0]) + " está olhando as fotos"}: ${engs.map(e=>`${esc(LRN_NOME(e))} ${tried[e]||0}${stopped[e]?" (parou)":""}`).join(" · ")} de ${list.length}${vote?" cada":""}… <small>(${got} sugerida(s))</small>${LRN.status?`<br><small>${esc(LRN.status)}</small>`:""}${Object.keys(errs).length?`<br><small>Último aviso: ${esc(Object.entries(errs).map(([e,m])=>LRN_NOME(e)+": "+m).join(" · ").slice(0,220))}</small>`:""}</div>`);
  LRN.tick = show; LRN.status = "";
  const run = async (e) => {
    const P = PROVS[e], per = e==="claude" ? Math.max(1, Math.min(4, (ENV.imgMax||4) - 2)) : P ? P.per : 8, wait = e==="gemini" ? LRN_GEM_WAIT : P ? P.wait : 0;
    let i = 0;
    for (;;){
      if (LRN.stop) return;
      const b = vote ? list.slice(i, i += per) : q.splice(0, per);
      if (!b.length) return;
      tried[e] = (tried[e]||0) + b.length; show();
      try {
        const rs = await lrnPredictRemote(b, e);
        b.forEach((p,k)=>{ const r = rs[k]; if (vote){ if (!votes.has(p)) votes.set(p, {}); if (r) votes.get(p)[e] = r; } else apply(p, r, e); });
        st[e] = (st[e]||0) + b.length; rep[e] = 0; delete errs[e];
      } catch(x){
        let m = x && x.message || String(x); if (e==="claude") m = errText(x);
        errs[e] = m; tried[e] -= b.length; rep[e] = (rep[e]||0) + 1;
        // erro que não passa sozinho, ou 3 lotes seguidos com erro: essa IA para e devolve o lote para as outras
        const fatal = /parado por você|cota grátis de hoje|chave|claude\.ai|permiss|não pode|sem conexão|não encontrei|não está instalado|endereço|bloqueia|nenhum modelo/i.test(m) || rep[e] >= 3;
        if (!vote && (fatal || engs.length > 1)) q.unshift(...b);
        if (fatal){ stopped[e] = true; show(); return; }
        if (vote) i -= per; // tenta o mesmo lote de novo (no máximo 3 vezes seguidas)
      }
      if (!vote) refreshAll(true);
      if (wait) await new Promise(res=>setTimeout(res, wait));
    }
  };
  await Promise.all(engs.map(run)); LRN.tick = null; LRN.status = "";
  if (vote){
    for (const [p, v] of votes){
      const ks = Object.keys(v); if (!ks.length) continue;
      const tally = new Map(); for (const k of ks){ const s = lrnCanon(v[k].svc); const t = tally.get(s) || {n:0, c:0}; t.n++; t.c += v[k].conf; tally.set(s, t); }
      const [svc, t] = [...tally].sort((a,b)=>b[1].n-a[1].n || b[1].c-a[1].c)[0];
      const conf = (t.c / t.n) * (t.n / ks.length), sv = {}; for (const k of ks) sv[k] = v[k].svc;
      apply(p, {svc, conf: ks.length > 1 && t.n <= ks.length/2 ? Math.min(conf, .5) : conf}, ks.filter(k=>lrnCanon(v[k].svc)===svc).join("+"), sv);
    }
  }
  LRN.porIA = engs.length > 1 ? `${engs.map(e=>`${esc(LRN_NOME(e))}: ${st[e]||0} foto(s)${errs[e]?` (erro: ${esc(errs[e].slice(0,80))})`:""}`).join(" · ")}. ` : "";
  const err = engs.length === 1 ? (errs[engs[0]] || "") : (Object.keys(errs).length === engs.length ? Object.values(errs)[0] : "");
  return {got, low, err};
}
// quando você confirma/corrige um serviço, conta acerto da IA e guarda como exemplo
function lrnFeedback(p, svc){
  const L = LRN.cfg(), sug = p.aiService || (p.aiGuess && p.aiGuess.svc);
  if (sug && svc){ L.n++; if (lrnCanon(sug) === lrnCanon(svc)) L.ok++; saveCfg(); }
  if (p.aiVotes && svc){ L.byEng = L.byEng || {}; for (const [e, s] of Object.entries(p.aiVotes)){ const b = L.byEng[e] = L.byEng[e] || {n:0, ok:0}; b.n++; if (lrnCanon(s) === lrnCanon(svc)) b.ok++; } saveCfg(); }
  p.aiGuess = null; p.aiVotes = null;
  lrnAdd(p, svc, "confirmada");
}
function lrnReviewList(){
  return S.photos.filter(p=>(p.status==="ok"||p.status==="manual") && p.include!==false && !p.dupOf && !p.edit.servico && (p.aiService || p.aiGuess) && S.cfg.groupBy!=="nenhum");
}

// ---------- painel ----------
function lrnPill(){
  const el = $("#learnPill"); if (!el) return; const L = LRN.cfg(), n = lrnExamples().length, r = lrnReviewList().length;
  el.textContent = (n ? `${n} exemplo(s)` : "opcional") + (r ? ` · ${r} para conferir` : "") + (L.n ? ` · acertou ${Math.round(100*L.ok/L.n)}%` : "");
}
function lrnRender(){
  const box = $("#learnBox"); if (!box) return;
  lrnPill(); if (!box.open) return;
  const L = LRN.cfg(), ex = lrnExamples(), cnt = new Map(); ex.forEach(e=>{ const s = lrnCanon(e.svc)||e.svc; cnt.set(s,(cnt.get(s)||0)+1); });
  const rev = lrnReviewList(), per = 48, pg = Math.min(LRN.page, Math.max(0, Math.ceil(rev.length/per)-1)), show = rev.slice(pg*per, pg*per+per);
  const cls = lrnClasses(), canClaude = !!(S.sample && ENV.images===true);
  const opts = sel => `<option value="">— escolha —</option><option value="${esc(UNK)}">Serviços de limpeza urbana (nenhum destes)</option>` + cls.map(n=>`<option ${n===sel?"selected":""}>${esc(n)}</option>`).join("");
  $("#learnBody").innerHTML = `
    <div class="msg">Opcional. A IA olha as fotos que ficaram <b>sem serviço</b> e sugere qual é. Você confere: o que confirmar ou corrigir vira exemplo, e a próxima sugestão fica melhor. Se não usar, nada muda no relatório.</div>
    <div class="grid-form">
      <label class="f" for="lrnEngine">Quem sugere<select id="lrnEngine">
        <option value="local" ${L.engine==="local"?"selected":""}>Aprendizado no navegador (grátis, sem internet)</option>
        <option value="gemini" ${L.engine==="gemini"?"selected":""}>Gemini (chave grátis do Google)</option>
        ${Object.entries(PROVS).map(([k,v])=>`<option value="${k}" ${L.engine===k?"selected":""}>${esc(v.nome)}</option>`).join("")}
        ${canClaude || L.engine==="claude" ? `<option value="claude" ${L.engine==="claude"?"selected":""}>Claude (usa o seu plano)</option>` : ""}
      </select></label>
      <label class="f" for="lrnConf">Só aplicar quando tiver certeza de<select id="lrnConf">
        ${[[.4,"40% (mais sugestões)"],[.55,"55% (recomendado)"],[.7,"70%"],[.85,"85% (só as mais certas)"]].map(([v,t])=>`<option value="${v}" ${Math.abs(L.minConf-v)<.01?"selected":""}>${t}</option>`).join("")}
      </select></label>
    </div>
    <label class="chk" for="lrnWeak"><input type="checkbox" id="lrnWeak" ${L.checkWeak?"checked":""}> Conferir também as fotos cujo serviço veio do nome do grupo/arquivo ou do cartão do co.urban. A IA olha cada foto e, quando tem certeza (70% ou mais) de que é outro serviço, troca e marca "IA trocou (era …)". Serve para achar roçagem no meio da capinação, por exemplo.</label>
    ${lrnMultiHtml(L, canClaude)}
    <div id="lrnGem" ${L.engine==="gemini"?"":"hidden"}>
      <div class="grid-form">
        <label class="f" for="lrnKey">Chave do Gemini (fica só neste navegador)<input id="lrnKey" type="password" autocomplete="off" placeholder="AIza…" value="${esc(LRN.key())}"></label>
        <label class="f" for="lrnModel">Modelo<select id="lrnModel">${["gemini-flash-latest","gemini-2.5-flash","gemini-2.5-flash-lite"].map(m=>`<option ${m===L.model?"selected":""}>${m}</option>`).join("")}</select></label>
      </div>
      <p class="hint-s">Como pegar a chave grátis: entre em <b>aistudio.google.com/apikey</b> com sua conta Google → <b>Create API key</b> → copie e cole aqui. Não precisa de cartão. As fotos (reduzidas) são enviadas ao Google só quando você clica em "Sugerir"; no plano grátis o Google pode usar esses dados para melhorar os produtos dele. ${ENV.hasClaude ? "<b>Dentro do claude.ai o Gemini não funciona</b> (a página bloqueia sites externos): use o site publicado." : ""}</p>
    </div>
    ${PROVS[L.engine] ? lrnProvHtml(L.engine) : ""}
    ${L.engine==="claude" ? `<p class="hint-s">Usa o seu plano do Claude. Mostra ao Claude até 2 exemplos conferidos por vez.</p>` : ""}
    <details class="more"><summary>O que cada serviço mostra na foto (dicas que a IA lê · pode editar)</summary>
      <textarea id="lrnDicas" rows="9" style="margin-top:8px">${esc(lrnDicas().map(([s,t])=>s+": "+t).join("\n"))}</textarea>
      <div class="row" style="margin-top:6px"><button type="button" class="small" id="lrnDicasSave">Salvar dicas</button><button type="button" class="small" id="lrnDicasReset">Voltar às dicas originais</button></div>
    </details>
    <div class="row">
      <button type="button" class="primary" id="lrnGo" ${LRN.running?"disabled":""}>Sugerir serviço das fotos sem serviço</button>
      ${LRN.running?`<button type="button" id="lrnStop">Parar</button>`:""}
      <button type="button" class="small" id="lrnUndo" ${S.photos.some(p=>p.aiService)?"":"disabled"}>Apagar sugestões</button>
    </div>
    <div id="lrnMsg">${LRN.lastMsg||""}</div>
    <div class="msg">Aprendido até agora: <b>${ex.length}</b> exemplo(s)${L.n?` · <b>acertou ${L.ok} de ${L.n}</b> que você conferiu`:""}. <small>Aprende sozinho com as fotos que já têm serviço (pelo grupo/arquivo, pelo texto do carimbo ou escolhido por você).</small>
      ${cnt.size ? `<div class="row" style="margin-top:6px;gap:6px">${[...cnt].sort((a,b)=>b[1]-a[1]).map(([s,n])=>`<span class="pill">${esc(s)} ${n} <button type="button" class="small" data-lforget="${esc(s)}" title="Esquecer o que a IA aprendeu sobre este serviço" aria-label="Esquecer ${esc(s)}" style="padding:0 6px;margin-left:4px">✕</button></span>`).join("")}</div><small>Ensinou errado? Clique no ✕ do serviço: apaga os exemplos dele, as sugestões da IA com esse serviço e as confirmações feitas aqui no painel. As fotos voltam para o serviço de antes (ou "Serviços de limpeza urbana").</small>` : ""}</div>
    ${rev.length ? `<h3 style="margin:4px 0 0;font-size:.95rem">Conferir sugestões (${rev.length})</h3>
      <div class="row"><button type="button" class="small primary" id="lrnOkAll">Confirmar as ${show.length} desta página como estão</button>
      ${rev.length>per?`<button type="button" class="small" id="lrnPrev" ${pg?"":"disabled"}>‹ Anterior</button><span class="stat">página ${pg+1} de ${Math.ceil(rev.length/per)}</span><button type="button" class="small" id="lrnNext" ${pg+1<Math.ceil(rev.length/per)?"":"disabled"}>Próxima ›</button>`:""}</div>
      <div class="cards" id="lrnCards">${show.map(p=>{ const g = p.aiService ? {svc:p.aiService, conf:p.aiConf} : p.aiGuess; const c = g && g.conf ? Math.round(g.conf*100) : null;
        return `<div class="card lrn" data-lp="${p.id}"><div class="ph">${p.thumb?`<img src="${p.thumb}" alt="">`:`<span class="pill">carregando</span>`}</div>
          <div class="tx"><span>${esc(fmtD(info(p).date))} · ${esc(info(p).time||"--:--")}</span>
          <span class="flags">${p.aiService?`<span class="pill n">IA ${c!=null?c+"%":""}</span>`:`<span class="pill warn">incerta ${c!=null?c+"%":""}</span>`}</span>
          <select data-lsel="${p.id}" aria-label="Serviço">${opts(lrnCanon(g && g.svc))}</select>
          <div class="row" style="gap:4px"><button type="button" class="small primary" data-lok="${p.id}">✓ Confirmar</button><button type="button" class="small" data-lopen="${p.id}">Abrir</button></div></div></div>`; }).join("")}</div>` : ""}
    <details class="more"><summary>Guardar ou levar o aprendizado para outro computador</summary>
      <div class="row" style="margin-top:8px">
        <button type="button" class="small" id="lrnExport" ${ex.length?"":"disabled"}>Baixar aprendizado (.json)</button>
        <button type="button" class="small" id="lrnImportBtn">Carregar aprendizado</button><input type="file" id="lrnImport" accept=".json,application/json" hidden>
        <button type="button" class="small" id="lrnForget" ${ex.length?"":"disabled"}>Esquecer tudo</button>
      </div></details>`;
  // miniaturas da conferência
  (async()=>{ for (const p of show){ if (!p.thumb){ await ensureThumb(p); const el = document.querySelector(`.card.lrn[data-lp="${p.id}"] .ph`); if (el && p.thumb) el.innerHTML = `<img src="${p.thumb}" alt="">`; } } })();
}
function lrnMultiHtml(L, canClaude){
  const all = ["gemini", ...Object.keys(PROVS), ...(canClaude ? ["claude"] : [])], multi = L.multi || [], bE = L.byEng || {};
  const stat = e => bE[e] && bE[e].n ? ` · acertou ${Math.round(100*bE[e].ok/bE[e].n)}% de ${bE[e].n}` : "";
  return `<details class="more" ${multi.length?"open":""}><summary>Usar várias IAs ao mesmo tempo${multi.length?` (${lrnEngines().length})`:""}</summary>
    <div class="msg" style="margin-top:8px">Marque outras IAs para trabalharem junto com a escolhida em "Quem sugere". Cada uma usa a própria chave e o próprio limite, então uma não atrapalha a outra; se uma der erro, as outras continuam. Para configurar a chave de uma IA, escolha ela em "Quem sugere", cole a chave, e depois volte.</div>
    <div class="row" style="flex-wrap:wrap;gap:6px 14px">${all.map(e=>`<label class="chk" for="lrnM_${e}"><input type="checkbox" id="lrnM_${e}" data-lmulti="${e}" ${multi.includes(e)||L.engine===e?"checked":""} ${L.engine===e?"disabled":""}> ${esc(LRN_NOME(e))}${lrnEngReady(e)?"":" <small>(falta configurar)</small>"}${stat(e)}</label>`).join("")}</div>
    <label class="f" for="lrnMode" style="max-width:420px">Como trabalham juntas<select id="lrnMode">
      <option value="dividir" ${L.multiMode!=="votar"?"selected":""}>Dividir as fotos (mais rápido: cada IA pega uma parte)</option>
      <option value="votar" ${L.multiMode==="votar"?"selected":""}>Votar (todas olham a mesma foto; mais certeiro, gasta mais)</option></select></label>
  </details>`;
}
function lrnProvHtml(k){
  const d = PROVS[k], c = LRN.prov(k);
  const ajuda = k==="ollama" ? `<ol class="hint-s" style="margin:6px 0 0;padding-left:18px">
      <li>Instale o <b>Ollama</b> (ollama.com/download) no PC. É grátis e de código aberto.</li>
      <li>Baixe o modelo uma vez: abra o <b>Prompt de Comando</b> e digite <code>ollama pull ${esc(c.model||"qwen3-vl:4b")}</code> (qwen3-vl:4b ≈ 3,3 GB; em PC sem placa NVIDIA prefira <code>qwen3-vl:2b</code> ou <code>moondream</code>).</li>
      <li>Libere este site no Ollama: no Prompt de Comando digite <code>setx OLLAMA_ORIGINS "*"</code>, depois feche o Ollama (ícone perto do relógio → Quit) e abra de novo.</li>
      <li>Clique em <b>Testar conexão</b>. Se o Chrome perguntar sobre acesso à rede local, clique em <b>Permitir</b>.</li></ol>
      <p class="hint-s">As fotos não saem do seu computador. Velocidade aproximada por foto: RTX 4060 ~1–2 s · RTX 4050 ~2–3 s · GTX 1050 ~5–10 s · sem placa ~20–40 s.</p>`
    : `<p class="hint-s">Pegue a chave grátis em <b>${esc(d.pegar)}</b> e cole aqui. As fotos (reduzidas) vão para esse serviço quando você clica em "Sugerir"; planos grátis têm limite por minuto/dia e podem usar os dados. Se o nome do modelo mudar, é só trocar no campo.</p>`;
  return `<div class="grid-form">
      ${d.chave ? `<label class="f" for="lrnPKey">Chave da API (fica só neste navegador)<input id="lrnPKey" type="password" autocomplete="off" value="${esc(LRN.pkey(k))}"></label>` : ""}
      <label class="f" for="lrnPModel">Modelo<input id="lrnPModel" list="lrnPModels" value="${esc(c.model)}"></label>
      <label class="f" for="lrnPUrl">Endereço<input id="lrnPUrl" value="${esc(c.url)}" placeholder="https://…/v1"></label>
    </div><datalist id="lrnPModels">${d.models.filter(Boolean).map(m=>`<option value="${esc(m)}">`).join("")}</datalist>
    ${ajuda}
    <div class="row" style="margin-top:6px"><button type="button" class="small" id="lrnTest">Testar conexão</button></div><div id="lrnTestMsg"></div>`;
}
function lrnForgetSvc(svc){
  let ex = 0, sug = 0, conf = 0; const hs = new Set();
  for (const e of lrnExamples()) if (e.svc === svc){ IDB.del(e.k); ex++; if (e.src === "confirmada") hs.add(e.k.slice(6)); }
  if (IDB.mem) for (const k of [...IDB.mem.keys()]) if (typeof k==="string" && k.startsWith("learnimg|" + svc + "|")) IDB.del(k);
  for (const p of S.photos){
    let ch = false;
    if ((p.aiService && lrnCanon(p.aiService) === svc) || (p.aiGuess && lrnCanon(p.aiGuess.svc) === svc)){ p.aiService = null; p.aiConf = null; p.aiBy = null; p.aiGuess = null; p.aiVotes = null; sug++; ch = true; }
    if (p.edit.servico === svc && hs.has(p.hash)){ delete p.edit.servico; conf++; ch = true; }
    if (ch) saveEdit(p);
  }
  LRN.dirty = true; LRN.model = null;
  LRN.lastMsg = `<div class="msg ok">Esqueci <b>${ex}</b> exemplo(s) de ${esc(svc)}, apaguei <b>${sug}</b> sugestão(ões) da IA com esse serviço e desfiz <b>${conf}</b> confirmação(ões) feitas no painel.</div>`;
  refreshAll(true); lrnRender();
}
function lrnConfirm(ids){
  for (const id of ids){
    const p = S.photos.find(x=>x.id===id); if (!p) continue;
    const sel = document.querySelector(`select[data-lsel="${id}"]`), v = sel && sel.value; if (!v) continue;
    if (v === UNK){ setNoService(p); continue; }
    lrnFeedback(p, v); p.edit.servico = v; saveEdit(p);
  }
  refreshAll(true); lrnRender();
}
async function lrnExport(){
  const ex = lrnExamples().map(({k, ...v})=>({h:k.slice(6), ...v}));
  const imgs = IDB.mem ? [...IDB.mem].filter(([k])=>typeof k==="string" && k.startsWith("learnimg|")).map(([k,v])=>({k, ...v})) : [];
  const blob = new Blob([JSON.stringify({tipo:"belem-limpa-aprendizado", v:1, exemplos:ex, fotos:imgs, dicas:LRN.cfg().dicas||null})], {type:"application/json"});
  const r = await savePdf(blob, `aprendizado-servicos-${ymd(new Date())}.json`);
  $("#lrnMsg").innerHTML = r==="nodl" ? `<div class="msg warn">O download não foi liberado nesta visualização.</div>` : `<div class="msg ok">Arquivo de aprendizado baixado. Em outro computador, use "Carregar aprendizado".</div>`;
}
async function lrnImport(file){
  try {
    const j = JSON.parse(await file.text()); if (j.tipo!=="belem-limpa-aprendizado") throw new Error("este arquivo não é um aprendizado da ferramenta.");
    let n = 0; for (const e of j.exemplos||[]){ if (e.h && e.svc){ const {h, ...v} = e; await IDB.set("learn|"+h, v); n++; } }
    for (const f of j.fotos||[]){ if (f.k && f.url){ const {k, ...v} = f; await IDB.set(k, v); } }
    if (j.dicas){ LRN.cfg().dicas = Object.assign({}, LRN.cfg().dicas||{}, j.dicas); saveCfg(); }
    LRN.dirty = true; lrnRender(); $("#lrnMsg").innerHTML = `<div class="msg ok">${n} exemplo(s) carregado(s).</div>`;
  } catch(e){ $("#lrnMsg").innerHTML = `<div class="msg bad">Não consegui carregar: ${esc(e.message||e)}</div>`; }
}
function lrnBind(){
  const box = $("#learnBox"); if (!box) return;
  box.addEventListener("toggle", ()=>{ if (box.open) IDB.loadAll().then(()=>lrnRender()); });
  box.addEventListener("change", e=>{
    const t = e.target, L = LRN.cfg();
    if (t.id==="lrnEngine"){ L.engine = t.value; saveCfg(); lrnRender(); }
    else if (t.id==="lrnConf"){ L.minConf = +t.value; saveCfg(); }
    else if (t.dataset && t.dataset.lmulti){ const e = t.dataset.lmulti; L.multi = (L.multi||[]).filter(x=>x!==e); if (t.checked) L.multi.push(e); saveCfg(); lrnRender(); }
    else if (t.id==="lrnMode"){ L.multiMode = t.value; saveCfg(); }
    else if (t.id==="lrnWeak"){ L.checkWeak = t.checked; saveCfg(); }
    else if (t.id==="lrnKey"){ LRN.setKey(t.value.trim()); }
    else if (t.id==="lrnModel"){ L.model = t.value; saveCfg(); }
    else if (t.id==="lrnPKey"){ LRN.setPkey(L.engine, t.value.trim()); }
    else if (t.id==="lrnPModel" || t.id==="lrnPUrl"){ L.provs = L.provs || {}; const c = L.provs[L.engine] = L.provs[L.engine] || {}; c[t.id==="lrnPModel"?"model":"url"] = t.value.trim(); saveCfg(); }
    else if (t.id==="lrnImport" && t.files[0]){ lrnImport(t.files[0]); t.value = ""; }
  });
  box.addEventListener("click", e=>{
    const t = e.target, L = LRN.cfg(); if (!t.closest("button")) return;
    const b = t.closest("button");
    if (b.id==="lrnGo") lrnSuggest();
    else if (b.id==="lrnTest"){ const m = $("#lrnTestMsg"); m.innerHTML = `<div class="msg">Testando…</div>`; lrnTestProv(L.engine).then(h=>{ m.innerHTML = h; }); }
    else if (b.id==="lrnStop"){ LRN.stop = true; }
    else if (b.id==="lrnUndo"){ S.photos.forEach(p=>{ if (p.aiService || p.aiGuess || p.aiChecked){ p.aiService = null; p.aiConf = null; p.aiBy = null; p.aiGuess = null; p.aiOver = false; p.aiChecked = false; saveEdit(p); } }); refreshAll(true); lrnRender(); }
    else if (b.id==="lrnOkAll") lrnConfirm([...document.querySelectorAll("#lrnCards [data-lsel]")].map(s=>+s.dataset.lsel));
    else if (b.dataset.lok) lrnConfirm([+b.dataset.lok]);
    else if (b.dataset.lforget){ if (b.dataset.sure) lrnForgetSvc(b.dataset.lforget); else { b.dataset.sure = "1"; b.textContent = "certeza? clique de novo"; } }
    else if (b.dataset.lopen) openEditor(+b.dataset.lopen);
    else if (b.id==="lrnPrev"){ LRN.page = Math.max(0, LRN.page-1); lrnRender(); }
    else if (b.id==="lrnNext"){ LRN.page++; lrnRender(); }
    else if (b.id==="lrnDicasSave"){ const d = {}; for (const ln of $("#lrnDicas").value.split("\n")){ const m = ln.match(/^([^:]+):\s*(.*)$/); if (m){ const s = lrnCanon(m[1].trim()); if (s) d[s] = m[2].trim(); } } L.dicas = d; saveCfg(); $("#lrnMsg").innerHTML = `<div class="msg ok">Dicas salvas.</div>`; }
    else if (b.id==="lrnDicasReset"){ L.dicas = null; saveCfg(); lrnRender(); }
    else if (b.id==="lrnExport") lrnExport();
    else if (b.id==="lrnImportBtn") $("#lrnImport").click();
    else if (b.id==="lrnForget"){ if (b.dataset.sure){ for (const e of lrnExamples()) IDB.del(e.k); if (IDB.mem) for (const k of [...IDB.mem.keys()]) if (typeof k==="string" && k.startsWith("learnimg|")) IDB.del(k); L.ok = 0; L.n = 0; saveCfg(); LRN.model = null; lrnRender(); } else { b.dataset.sure = "1"; b.textContent = "Clique de novo para apagar tudo"; } }
  });
}

// ---------- importar fotos de um PDF (ex.: relatório fotográfico do co.urban) ----------
// Lê o PDF direto no navegador: tira cada foto (JPEG embutido, sem perder qualidade) e,
// quando é o relatório do co.urban, também os dados de cada cartão (serviço, local, data, endereço, bairro, coordenadas).
const PDFIMP = {
  dec: new TextDecoder("windows-1252"),
  async inflate(u8){
    const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate"));
    return new Uint8Array(await new Response(ds).arrayBuffer());
  },
  strBytes(tok){ // <hex> ou (literal) → bytes
    if (tok[0] === "<"){ const h = tok.slice(1,-1).replace(/\s+/g,""); const out = new Uint8Array(Math.floor(h.length/2)); for (let i=0;i<out.length;i++) out[i] = parseInt(h.substr(i*2,2),16); return out; }
    const s = tok.slice(1,-1), out = [];
    for (let i=0;i<s.length;i++){
      let c = s[i];
      if (c === "\\"){ const n = s[++i]; const map = {n:10,r:13,t:9,b:8,f:12,"(":40,")":41,"\\":92};
        if (n in map) out.push(map[n]); else if (/[0-7]/.test(n)){ let o = n; while (o.length<3 && /[0-7]/.test(s[i+1])) o += s[++i]; out.push(parseInt(o,8)); } else if (n === "\r" || n === "\n") {} else out.push(n.charCodeAt(0)); }
      else out.push(c.charCodeAt(0) & 255);
    }
    return new Uint8Array(out);
  },
};

async function parsePdfPhotos(file){
  const buf = new Uint8Array(await file.arrayBuffer());
  const txt = PDFIMP.dec.decode(buf); // 1 caractere por byte: posições batem com o buffer
  const objs = new Map();
  for (const m of txt.matchAll(/(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g)) objs.set(+m[1], m.index + m[0].length);
  const head = n => { const s = objs.get(n); if (s == null) return ""; const e1 = txt.indexOf("endobj", s), e2 = txt.indexOf("stream", s); return txt.slice(s, e2 >= 0 && e2 < e1 ? e2 : e1); };
  const num = (d, key) => { const m = d.match(new RegExp("/" + key + "\\s+(\\d+)(\\s+\\d+\\s+R)?")); if (!m) return null; return m[2] ? +(head(+m[1]).trim().match(/^\d+/)||[0])[0] : +m[1]; };
  const stream = n => {
    const s = objs.get(n), d = head(n); let i = txt.indexOf("stream", s) + 6;
    if (txt[i] === "\r") i++; if (txt[i] === "\n") i++;
    let len = num(d, "Length"); if (!len){ len = txt.indexOf("endstream", i) - i; }
    return buf.subarray(i, i + len);
  };
  const dictRefs = (d) => { const out = {}; for (const m of d.matchAll(/\/([\w.+\-#]+)\s+(\d+)\s+\d+\s+R/g)) out[m[1]] = +m[2]; return out; };
  const inner = (d, key) => { // conteúdo de << ... >> após /key (com aninhamento), ou de um objeto referenciado
    const i = d.indexOf("/" + key); if (i < 0) return "";
    let j = i + key.length + 1; while (/\s/.test(d[j])) j++;
    if (/\d/.test(d[j])){ const m = d.slice(j).match(/^(\d+)\s+\d+\s+R/); return m ? head(+m[1]) : ""; }
    if (d.slice(j, j+2) !== "<<") return "";
    let depth = 0, k = j; for (; k < d.length; k++){ if (d.slice(k,k+2) === "<<"){ depth++; k++; } else if (d.slice(k,k+2) === ">>"){ depth--; k++; if (!depth) break; } }
    return d.slice(j, k+1);
  };
  // páginas na ordem
  const pages = [];
  const rootPages = [...objs.keys()].find(n => /\/Type\s*\/Pages\b/.test(head(n)) && !/\/Parent\b/.test(head(n)));
  const walk = n => { const d = head(n); if (/\/Type\s*\/Pages\b/.test(d)){ const kids = (d.match(/\/Kids\s*\[([^\]]*)\]/)||["",""])[1]; for (const m of kids.matchAll(/(\d+)\s+\d+\s+R/g)) walk(+m[1]); } else if (/\/Type\s*\/Page\b/.test(d)) pages.push(n); };
  if (rootPages != null) walk(rootPages);
  const cards = [], header = [];
  let pg = 0;
  for (const pn of pages){
    pg++;
    const pd = head(pn), res = inner(pd, "Resources"), xo = dictRefs(inner(res, "XObject"));
    const cm = pd.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/); if (!cm) continue;
    let content = "";
    for (const m of cm[1].matchAll(/(\d+)\s+\d+\s+R/g)){
      const n = +m[1], d = head(n); let s = stream(n);
      if (/FlateDecode/.test(d)) { try { s = await PDFIMP.inflate(s); } catch(e){ continue; } }
      content += PDFIMP.dec.decode(s) + "\n";
    }
    let cur = null, k = 0;
    for (const m of content.matchAll(/\/([\w.+\-#]+)\s+Do\b|BT\b([\s\S]*?)\bET\b/g)){
      if (m[1]){
        const n = xo[m[1]]; if (n == null) continue; const d = head(n);
        if (!/\/Subtype\s*\/Image/.test(d) || !/DCTDecode/.test(d)) continue;
        const w = num(d, "Width"), h = num(d, "Height"); if (Math.min(w||0, h||0) < 200) continue;
        cur = {page: pg, idx: ++k, obj: n, w, h, lines: []}; cards.push(cur);
      } else {
        let line = "";
        for (const t of m[2].matchAll(/\[((?:\((?:[^()\\]|\\.)*\)|<[^>]*>|[^\]])*)\]\s*TJ|(\((?:[^()\\]|\\.)*\)|<[^>]*>)\s*(?:Tj|'|")/g)){
          if (t[2]) line += PDFIMP.dec.decode(PDFIMP.strBytes(t[2]));
          else for (const p of t[1].matchAll(/\((?:[^()\\]|\\.)*\)|<[^>]*>|-?\d+(?:\.\d+)?/g)){ const v = p[0]; if (v[0]==="(" || v[0]==="<") line += PDFIMP.dec.decode(PDFIMP.strBytes(v)); else if (+v < -250) line += " "; }
        }
        line = line.trim(); if (!line) continue;
        (cur ? cur.lines : header).push(line);
      }
    }
  }
  const nome = file.name.replace(/\.pdf$/i, "");
  return {header, cards: cards.map(c => ({...c, bytes: stream(c.obj), name: `${nome}-p${c.page}-${c.idx}.jpg`}))};
}

// "Roçada Manual" → "Roçagem" etc. Se não reconhecer, fica o nome do co.urban (vira uma seção própria).
function couService(s){
  const n = norm(s), names = services().map(x=>x.name), has = x => names.includes(x) ? x : "";
  const rules = [[/rocad|rocagem/, "Roçagem"], [/capin|raspag/, "Capinação e Raspagem"], [/varri\w* mecaniz|varredeira/, "Varrição Mecanizada"], [/varri/, "Varrição"],
    [/mecaniz\w* \w* ?entulho|entulho \w* ?mecaniz/, "Coleta Mecanizada de Entulho"], [/entulho/, "Coleta de Entulho"], [/feira|mercado/, "Coleta de Feiras e Mercados"],
    [/parada|abrigo/, "Lavagem de Paradas de Ônibus"], [/caixa/, "Troca de Caixa Coletora"], [/lavag/, "Lavagem de Ruas e Logradouros"],
    [/mutir\w*.*(eleitor|colegio)|(eleitor|colegio).*mutir/, "Serviços de Mutirão - Colégios Eleitorais"], [/mutir/, "Mutirão"],
    [/domiciliar noturn|coleta noturn/, "Coleta Domiciliar Noturna"], [/domiciliar diurn|coleta diurn/, "Coleta Domiciliar Diurna"], [/domiciliar|coleta regular|coleta de lixo/, "Coleta Domiciliar (dividir por horário)"]];
  for (const [re, svc] of rules) if (re.test(n) && has(svc)) return svc;
  return matchService(s) || String(s||"").trim();
}

function couCard(lines){
  const f = {};
  for (const ln of lines){ const m = ln.match(/^([^:]{3,30}):\s*(.*)$/); if (m) f[norm(m[1])] = m[2].trim(); }
  if (!Object.keys(f).length) return null;
  const o = {data:null, hora:null, logradouro:null, numero:null, bairro:null, bairro_estimado:null, cep:null, lat:null, lon:null, utm:null, responsavel:null,
    referencia:null, servico_escrito:null, servico_sugerido:null, qualidade:"boa", descricao:null, carimbo:true, app:"co.urban", _src:"courban"};
  const dm = (f["data"]||"").match(/(\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/); if (dm){ o.data = dm[1]; o.hora = dm[2] || null; }
  const end = f["endereco"]; if (end && end !== "-"){ const em = end.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)$/); if (em){ o.logradouro = em[1].trim(); o.numero = em[2]; } else o.logradouro = end; }
  if (f["bairro"] && f["bairro"] !== "-") o.bairro = f["bairro"];
  const loc = f["local da operacao"]; if (loc && loc !== "-" && norm(loc) !== norm(o.logradouro||"")) o.referencia = loc;
  const cc = (f["coordenadas"]||"").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); if (cc){ o.lat = +cc[1]; o.lon = +cc[2]; }
  if (f["servico"] && f["servico"] !== "-") o.servico_relatorio = couService(f["servico"]); // serviço da ordem de serviço, não da foto
  if (f["cidade"]) o.cidade = f["cidade"];
  o._text = lines.join("\n");
  o._card = {...o}; // cartão original (o carimbo da foto é lido depois e tem prioridade)
  return o;
}
function hashBytes(u8){ let h = 2166136261; const step = Math.max(1, Math.floor(u8.length / 4096)); for (let i=0;i<u8.length;i+=step){ h ^= u8[i]; h = Math.imul(h, 16777619); } return (h>>>0).toString(16); }

async function importPdf(f){
  const r = await parsePdfPhotos(f);
  const imgs = r.cards.map(c => {
    const blob = new Blob([c.bytes], {type:"image/jpeg"}), meta = couCard(c.lines);
    return {src:{file:blob}, name:c.name, size:c.bytes.length, key:"pdf"+c.bytes.length+"-"+hashBytes(c.bytes), ocr: meta};
  });
  const com = imgs.filter(i=>i.ocr).length;
  return {imgs, com, total: r.cards.length, header: r.header};
}

"use strict";
/* ============================================================
   Relatório Fotográfico · Belém Limpa
   Fluxo: importar (zip/jpg do WhatsApp) → ler carimbos (Claude) →
   classificar base/serviço → selecionar com diversidade → PDF.
   ============================================================ */

// ---------- listas padrão ----------
const PAP = "Instalação de Papeleiras";
const DEFAULT_SERVICES_OLD = [
  "Capinação e Raspagem | capina, raspagem",
  "Roçagem | roçagem, rocagem, roçada",
  "Serviços de Mutirão - Colégios Eleitorais | colégio eleitoral, colégios eleitorais, colegio eleitoral, colegios eleitorais, colégios, colegios, eleitoral, eleitorais, eleição, eleicao, eleições, eleicoes, local de votação, local de votacao, zona eleitoral, seção eleitoral, secao eleitoral",
  "Mutirão | mutirão, mutirao",
  "Coleta Domiciliar Diurna | domiciliar diurna, coleta diurna",
  "Coleta Domiciliar Noturna | domiciliar noturna, coleta noturna, noturna",
  "Coleta Domiciliar (dividir por horário) | coleta domiciliar, domiciliar",
  "Lavagem de Paradas de Ônibus | parada, paradas, abrigo",
  "Troca de Caixa Coletora | caixa coletora, troca de caixa, caixas",
  "Varrição Mecanizada | varrição mecanizada, varredeira, máquina",
  "Varrição | varrição, varricao, varredura",
  "Coleta Mecanizada de Entulho | mecanizada, pá carregadeira, retro",
  "Coleta de Entulho | entulho",
  "Coleta de Feiras e Mercados | feira, feiras, mercado",
  "Lavagem de Ruas e Logradouros | lavagem",
];
const DEFAULT_SERVICES = [PAP + " | papeleira, papeleiras, lixeira, lixeiras, instalação de papeleira, instalacao de papeleira"];
// base: S = Sul (abaixo da Av. Júlio César), N = Norte (acima). c = perto da divisa, conferir.
const DEFAULT_BAIRROS = BAIRROS_OFICIAIS;
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const BASE_NAME = {S:"Base Sul",N:"Base Norte","?":"A conferir",A:"Bases Norte e Sul"};
// "A" = relatório único com as duas bases juntas (inclui as fotos sem base definida)
const daBase = b => (b==="A" ? "das " : "da ") + BASE_NAME[b];
const pelaBase = b => (b==="A" ? "pelas " : "pela ") + BASE_NAME[b];
const saidaBase = b => b==="A" ? "Base Norte e Base Sul" : BASE_NAME[b];
const UNK = "Serviço não informado";
const GENERIC = "Serviços de Limpeza Urbana";
const svcTitle = s => s===UNK ? "Serviços de limpeza urbana" : s;
const QUALITY = {leve:{px:560,q:.55},padrao:{px:720,q:.62},alta:{px:960,q:.72}};

// ---------- estado ----------
const S = {
  cfg: null,
  lotes: [],     // {id,name,service,base,files}
  photos: [],    // ver makePhoto
  hashes: new Set(),
  tab: "S",
  reading: false,
  ctl: null,
  sample: null,
  downloads: null,
  sel: new Set(),   // fotos marcadas para ação em lote
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const pad = (n,l=2) => String(n).padStart(l,"0");
let uid = 0; const nid = () => ++uid;

// ---------- configuração persistida ----------
function defaultCfg(){
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1);
  return { month:`${d.getFullYear()}-${pad(d.getMonth()+1)}`, pages:10, pagesTotal:30, precision:"normal", period:"mes", day:"", from:"", to:"", ppp:4, groupBy:"servico", refine:false, v:2, quality:"padrao", tier:"quick", engine:"ocr",
    maxRead:0, verify:true, ruasExtras:[], ruasFix:{}, ruasIgn:[], author:"", desc:false, split:false, showReg:true, balance:false, totalPages:0,
    services: DEFAULT_SERVICES.slice(), bairros: DEFAULT_BAIRROS.map(b=>b.slice()) };
}
function loadCfg(){
  let c = defaultCfg();
  try { const raw = localStorage.getItem("blPapCfg"); if (raw) c = Object.assign(c, JSON.parse(raw)); } catch(e){}
  if (c.v !== 2 && c.v !== 3){ c.v = 2; c.engine = "ocr"; c.refine = false; c.maxRead = 0; }
  if (c.v !== 3){ // v3: tabela de bairros passa a ser a lista oficial da Prefeitura (mantém a base que o usuário escolheu)
    const old = new Map((c.bairros||[]).map(b=>[normTxt(b[0]), b[1]]));
    c.bairros = BAIRROS_OFICIAIS.map(b=>{ const x = b.slice(); if (old.has(normTxt(b[0]))) x[1] = old.get(normTxt(b[0])); return x; });
    c.v = 3; c.verify = c.verify !== false;
  }
  // v6: "Quantas fotos ler" passa a ler todas por padrão
  if (!c.v6){ if (+c.maxRead >= 999999) c.maxRead = 0; c.v6 = true; }
  // v4: "Limpeza de Bueiros e Valas" não é um serviço do contrato
  if (!c.v4){ c.services = (c.services||[]).filter(l=>!/^\s*limpeza de bueiros/i.test(l)); c.v4 = true; }
  // v5: novo serviço "Serviços de Mutirão - Colégios Eleitorais" (entra antes de "Mutirão" nas listas já salvas)
  if (!c.v5){
    const novo = DEFAULT_SERVICES.find(l=>/col[eé]gios eleitorais/i.test(l));
    if (!c.services.some(l=>/col[eé]gios eleitorais/i.test(l))){ const i = c.services.findIndex(l=>/^\s*mutir[aã]o\s*\|/i.test(l)); c.services.splice(i>=0?i:c.services.length, 0, novo); }
    c.v5 = true;
  }
  // Papeleiras: 1 foto = 1 papeleira. Um serviço só, todas as fotos válidas entram, sem limite de páginas nem equilíbrio.
  c.services = DEFAULT_SERVICES.slice(); c.groupBy = "servico"; c.pages = 0; c.pagesTotal = 0; c.totalPages = 0; c.balance = false; c.split = false; c.pins = {};
  if (!Array.isArray(c.ruasExtras)) c.ruasExtras = [];
  if (!c.ruasFix || typeof c.ruasFix !== "object") c.ruasFix = {};
  if (!Array.isArray(c.ruasIgn)) c.ruasIgn = [];
  S.cfg = c;
  LISTAS.build(c.ruasExtras, c.ruasFix);
}
function saveCfg(){ try { localStorage.setItem("blPapCfg", JSON.stringify(S.cfg)); } catch(e){} }
function services(){ // [{name, kw[]}]
  return S.cfg.services.map(l => { const [n,k] = l.split("|"); return {name:n.trim(), kw:(k||"").split(",").map(norm).filter(Boolean)}; }).filter(s=>s.name);
}
const bairroMap = () => { const m = new Map(); for (const [n,b,c] of S.cfg.bairros) m.set(norm(n), {name:n, base:b, check:!!c}); return m; };

// ---------- cache de leitura (IndexedDB) ----------
const IDB = {
  db:null,
  ready:null,
  open(){ return this.ready = this._open(); },
  async _open(){ try { this.db = await new Promise((res,rej)=>{ setTimeout(()=>rej(new Error("timeout")), 2500); const r = indexedDB.open("blPapeleiras",1);
      r.onupgradeneeded = () => r.result.createObjectStore("ocr");
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch(e){ this.db = null; } },
  mem:null,
  async loadAll(){ if (this.mem) return this.mem; if (this.ready) await this.ready; this.mem = new Map(); if (!this.db) return this.mem;
    try { await new Promise(res=>{ const rq = this.db.transaction("ocr").objectStore("ocr").openCursor(); rq.onsuccess = () => { const c = rq.result; if (c){ this.mem.set(c.key, c.value); c.continue(); } else res(); }; rq.onerror = () => res(); setTimeout(res, 8000); }); } catch(e){}
    return this.mem; },
  async get(k){ const m = await this.loadAll(); return m.get(k) || null; },
  async set(k,v){ if (this.mem) this.mem.set(k,v); if(!this.db) return; try { this.db.transaction("ocr","readwrite").objectStore("ocr").put(v,k); } catch(e){} },
  del(k){ if (this.mem) this.mem.delete(k); if(!this.db) return; try { this.db.transaction("ocr","readwrite").objectStore("ocr").delete(k); } catch(e){} },
};

// ---------- WhatsApp: nomes de arquivo e .txt ----------
function dateFromFilename(name){
  let m = name.match(/(20\d\d)-(\d\d)-(\d\d)[ _-]*(?:at[ _]*)?(\d\d)[.\-:](\d\d)[.\-:](\d\d)/i);
  if (m) return {d:new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]), hasTime:true};
  m = name.match(/(?:IMG|VID|PHOTO)[-_](20\d\d)(\d\d)(\d\d)/i);
  if (m) return {d:new Date(+m[1],+m[2]-1,+m[3],12,0,0), hasTime:false};
  m = name.match(/(20\d\d)(\d\d)(\d\d)[_-](\d\d)(\d\d)(\d\d)/);
  if (m) return {d:new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]), hasTime:true};
  return null;
}
function parseChat(text){
  const map = new Map();
  const lines = text.replace(/\r/g,"").split("\n");
  const reA = /^‎?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*-\s*([^:]{1,60}):\s?(.*)$/;
  const reI = /^‎?\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*([^:]{1,60}):\s?(.*)$/;
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const f = cur.text.match(/([\w\-. ()]+?\.(?:jpe?g|png|webp|heic))/i);
    if (f) { const caption = cur.text.replace(f[0],"").replace(/\(arquivo anexado\)|\(file attached\)|<anexado:|<attached:|>|‎/gi,"").trim();
      map.set(f[1].trim().toLowerCase(), {date:cur.date, sender:cur.sender.replace(/‎|~\s?/g,"").trim(), caption}); }
    else if (cur.prev && cur.text.trim()) { const p = map.get(cur.prev); if (p && !p.caption && cur.sender===p.sender) p.caption = cur.text.trim(); }
  };
  let lastFile = null;
  for (const ln of lines){
    const m = ln.match(reA) || ln.match(reI);
    if (m){
      flush();
      let y = +m[3]; if (y<100) y+=2000;
      cur = {date:new Date(y,+m[2]-1,+m[1],+m[4],+m[5],+(m[6]||0)), sender:m[7], text:m[8], prev:lastFile};
      const f = m[8].match(/([\w\-. ()]+?\.(?:jpe?g|png|webp|heic))/i); lastFile = f ? f[1].trim().toLowerCase() : lastFile;
    } else if (cur) cur.text += "\n" + ln;
  }
  flush();
  return map;
}

// ---------- serviço / base a partir do nome do lote ----------
function guessService(name){
  const n = norm(name);
  for (const s of services()) for (const k of s.kw) if (k && (" "+n+" ").includes(" "+k)) return s.name;
  for (const s of services()) if (n.includes(norm(s.name))) return s.name;
  return "";
}
function guessBase(name){ const n = " "+norm(name)+" ", N = / norte /.test(n), Su = / sul /.test(n); if (N && !Su) return "N"; if (Su && !N) return "S"; return "auto"; }

// ---------- importação (lê o .zip sob demanda: aguenta dezenas de milhares de fotos) ----------
function isImg(name){ return /\.(jpe?g|png|webp)$/i.test(name); }
function mimeOf(name){ return /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg"; }
async function blobOf(p){
  if (p.src.file) return p.src.file;
  return await p.src.entry.getData(new zip.BlobWriter(mimeOf(p.name)));
}
async function importFiles(fileList, fromFolder){
  const files = [...fileList]; if (!files.length) return;
  const msg = $("#importMsg"); msg.innerHTML = `<div class="msg">Abrindo ${files.length} arquivo(s)…</div>`;
  if (window.zip && zip.configure) zip.configure({useWebWorkers:false});
  await IDB.loadAll();
  const loose = new Map(), looseTxt = new Map(); // pasta/lote -> arquivos
  let skippedHeic = 0, dup = 0, added = 0, bad = [], pdfInfo = [];
  for (const f of files){
    const rel = (f.webkitRelativePath || "").split("/");
    const group = fromFolder && rel.length > 1 ? rel.slice(0,-1).join(" / ") : "";
    if (/\.zip$/i.test(f.name) || /zip/.test(f.type)){
      try {
        const reader = new zip.ZipReader(new zip.BlobReader(f));
        const entries = (await reader.getEntries()).filter(e=>!e.directory);
        const txt = entries.find(e=>/\.txt$/i.test(e.filename) && !/\/\._/.test("/"+e.filename));
        const chat = txt ? parseChat(await txt.getData(new zip.TextWriter())) : new Map();
        const imgs = [];
        for (const e of entries){
          const base = e.filename.split("/").pop();
          if (/\.heic$/i.test(base)) { skippedHeic++; continue; }
          if (!isImg(base) || base.startsWith("._")) continue;
          imgs.push({src:{entry:e}, name:base, size:e.uncompressedSize, key:"z"+e.uncompressedSize+"-"+((e.signature>>>0).toString(16)), chat:chat.get(base.toLowerCase())});
        }
        const r = await addLote(f.name.replace(/\.zip$/i,""), imgs); added += r.added; dup += r.dup;
        msg.innerHTML = `<div class="msg">Abrindo… ${added} foto(s) até agora</div>`;
      } catch(e){ bad.push(f.name); console.error(e); }
    } else if (/\.pdf$/i.test(f.name) || f.type==="application/pdf"){
      try {
        const r = await importPdf(f);
        if (!r.total){ bad.push(f.name + " (nenhuma foto encontrada no PDF)"); continue; }
        const a = await addLote(f.name.replace(/\.pdf$/i,""), r.imgs, {pdf:true}); added += a.added; dup += a.dup;
        pdfInfo.push(`${f.name}: ${r.total} foto(s). O carimbo de cada foto será lido (data, hora e rua da foto); os dados do cartão do relatório só completam o que faltar.`);
      } catch(e){ bad.push(f.name); console.error(e); }
    } else if (/\.txt$/i.test(f.name)) { if (!looseTxt.has(group)) looseTxt.set(group, []); looseTxt.get(group).push(f); }
    else if (/\.heic$/i.test(f.name)) skippedHeic++;
    else if (isImg(f.name) || (f.type||"").startsWith("image/")) { if (!loose.has(group)) loose.set(group, []); loose.get(group).push(f); }
  }
  for (const [group, list] of loose){
    const chat = new Map(); for (const t of (looseTxt.get(group)||[])) for (const [k,v] of parseChat(await t.text())) chat.set(k,v);
    const imgs = list.map(f=>({src:{file:f}, name:f.name, size:f.size, key:"f"+f.size+"-"+f.name.toLowerCase(), chat:chat.get(f.name.toLowerCase())}));
    const name = group || (list.length===1 ? list[0].name : `Fotos avulsas (${list.length})`);
    const r = await addLote(name, imgs); added += r.added; dup += r.dup;
  }
  const parts = [`${added} foto(s) adicionada(s)`];
  if (dup) parts.push(`${dup} repetida(s) ignorada(s)`);
  if (pdfInfo.length) parts.push(pdfInfo.join(" · "));
  if (skippedHeic) parts.push(`${skippedHeic} em HEIC ignorada(s): no iPhone, envie pelo WhatsApp que ele converte para JPG`);
  if (bad.length) parts.push(`não consegui abrir: ${bad.map(esc).join(", ")}`);
  const auto = autoMonth(); if (auto) parts.push(`mês do relatório ajustado para ${auto} (mês da maioria das fotos)`);
  msg.innerHTML = `<div class="msg ${added&&!bad.length?"ok":"warn"}">${parts.join(" · ")}.</div>`;
  renderLotes(); refreshAll();
}

async function addLote(name, imgs, opt){
  // relatório do co.urban: cada cartão tem o seu serviço, então o lote não força serviço pelo nome do arquivo
  const lote = {id:nid(), name, service: opt && opt.pdf ? "__auto" : guessService(name), base:guessBase(name), count:0, pdf: !!(opt && opt.pdf)};
  let added = 0, dup = 0;
  const mem = await IDB.loadAll();
  for (const it of imgs){
    const hash = it.key;
    if (S.hashes.has(hash)) { dup++; continue; }
    S.hashes.add(hash);
    const fn = dateFromFilename(it.name);
    const wa = { date: it.chat?.date || fn?.d || null, hasTime: it.chat ? true : !!fn?.hasTime, sender: it.chat?.sender || "", caption: it.chat?.caption || "" };
    const p = {id:nid(), loteId:lote.id, src:it.src, size:it.size, name:it.name, hash, wa, thumb:null, ocr:null, status:"pending", err:"", edit:{}, include:null};
    const cached = mem.get(hash + "|" + (S.cfg.desc?"d":"n")) || mem.get(hash + "|ocr");
    if (cached){ p.ocr = cached; if (cached._text) p.ocrText = cached._text; p.status = "ok"; }
    else if (it.ocr){ p.ocr = it.ocr; p.ocrText = it.ocr._text || ""; p.status = "ok"; }
    // co.urban: os dados do cartão são da ordem de serviço (mesmo endereço e hora para várias fotos), não de cada foto.
    // Guarda o cartão e põe a foto na fila para ler o carimbo dela; o cartão só completa o que o carimbo não tiver.
    if (it.ocr && it.ocr._src === "courban") p.cou = it.ocr._card || it.ocr;
    else if (cached && cached._src === "courban") p.cou = cached._card || cached;
    const gc = mem.get(hash + "|gps"); if (gc) p.exif = gc.c || null;
    const ed = mem.get(hash + "|edit");
    if (ed){ p.edit = ed.edit || {}; p.include = ed.include ?? null; p.aiService = ed.aiService || null; p.aiConf = ed.aiConf || null; p.aiBy = ed.aiBy || null; p.aiOver = !!ed.aiOver; p.aiChecked = !!ed.aiChecked; }
    S.photos.push(p); added++;
  }
  lote.count = added;
  if (added) S.lotes.push(lote);
  return {added, dup};
}

// ---------- imagens ----------
async function decode(blob){
  try { return await createImageBitmap(blob); }
  catch(e){ return await new Promise((res,rej)=>{ const im = new Image(); const u = URL.createObjectURL(blob); im.onload=()=>{res(im);}; im.onerror=rej; im.src=u; }); }
}
async function scaled(blob, maxPx, q, as="dataurl"){
  const im = await decode(blob);
  const w0 = im.width, h0 = im.height, k = Math.min(1, maxPx/Math.max(w0,h0));
  const w = Math.max(1,Math.round(w0*k)), h = Math.max(1,Math.round(h0*k));
  const c = document.createElement("canvas"); c.width=w; c.height=h;
  const g = c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,w,h); g.imageSmoothingQuality="high"; g.drawImage(im,0,0,w,h);
  if (im.close) im.close();
  if (as==="blob") return await new Promise(r=>c.toBlob(r,"image/jpeg",q));
  return {url:c.toDataURL("image/jpeg",q), w, h};
}
async function ensureThumb(p){ if (!p.thumb) { try { p.thumb = (await scaled(await blobOf(p), 260, .7)).url; } catch(e){ p.thumb = ""; } } return p.thumb; }

// ---------- UTM → lat/long (zona 22, hemisfério sul) ----------
function utmToLatLon(zone, hemi, E, N){
  const a=6378137, f=1/298.257223563, k0=0.9996, e2=f*(2-f), ep2=e2/(1-e2);
  const x=E-500000, y = hemi==="S" ? N-10000000 : N;
  const M=y/k0, mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2**3/256));
  const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const p1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu);
  const C1=ep2*Math.cos(p1)**2, T1=Math.tan(p1)**2, N1=a/Math.sqrt(1-e2*Math.sin(p1)**2), R1=a*(1-e2)/(1-e2*Math.sin(p1)**2)**1.5, D=x/(N1*k0);
  const lat=p1-(N1*Math.tan(p1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720);
  const lon=((zone-1)*6-180+3)*Math.PI/180+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/Math.cos(p1);
  return {lat:lat*180/Math.PI, lon:lon*180/Math.PI};
}
function coordsOf(o){
  if (!o) return null;
  if (typeof o.lat==="number" && typeof o.lon==="number" && Math.abs(o.lat)<5 && o.lon<-40 && o.lon>-55) return {lat:o.lat, lon:o.lon};
  const m = String(o.utm||"").match(/(\d{1,2})\s*([C-X])\s+(\d{6}(?:[.,]\d+)?)\s+(\d{7}(?:[.,]\d+)?)/i);
  if (m){ const band=m[2].toUpperCase(); const r = utmToLatLon(+m[1], band<"N"?"S":"N", parseFloat(m[3].replace(",",".")), parseFloat(m[4].replace(",","."))); if (r.lat<0 && r.lat>-3) return r; }
  return null;
}

// ---------- lat/long → UTM (SIRGAS 2000 / UTM 22S, EPSG:31982) ----------
function latLonToUtm(lat, lon, zone=22){
  const a=6378137, f=1/298.257222101, k0=0.9996, e2=f*(2-f), ep2=e2/(1-e2);
  const phi=lat*Math.PI/180, lam=lon*Math.PI/180, lam0=((zone-1)*6-180+3)*Math.PI/180;
  const N=a/Math.sqrt(1-e2*Math.sin(phi)**2), T=Math.tan(phi)**2, C=ep2*Math.cos(phi)**2, A=Math.cos(phi)*(lam-lam0);
  const M=a*((1-e2/4-3*e2*e2/64-5*e2**3/256)*phi-(3*e2/8+3*e2*e2/32+45*e2**3/1024)*Math.sin(2*phi)+(15*e2*e2/256+45*e2**3/1024)*Math.sin(4*phi)-(35*e2**3/3072)*Math.sin(6*phi));
  const E=k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120)+500000;
  let Nn=k0*(M+N*Math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720));
  if (lat<0) Nn+=10000000;
  return {E, N:Nn, zone:zone+(lat<0?"S":"N")};
}
// coordenada digitada: "-1.45063, -48.50172", "-1,45063 -48,50172", link do Google Maps (@-1.45,-48.50) ou UTM "22M 778793 9838977"
function parseCoordInput(t){
  t = String(t||"").trim(); if (!t) return null;
  let m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (!m) m = t.match(/(-?\d{1,2}[.,]\d+)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)\s*°?\s*([WOL])?/i);
  if (m){
    let la, lo;
    if (m.length >= 5){ la = parseFloat(m[1].replace(",",".")); lo = parseFloat(m[3].replace(",",".")); if (m[2] && /S/i.test(m[2])) la = -Math.abs(la); if (m[4] && /[WO]/i.test(m[4])) lo = -Math.abs(lo); }
    else { la = parseFloat(m[1]); lo = parseFloat(m[2]); }
    if (la > 0 && la < 5) la = -la; if (lo > 0) lo = -lo; // Belém: sul e oeste
    const c = coordsOf({lat:la, lon:lo}); if (c) return c;
  }
  return coordsOf({utm:t});
}
// GPS gravado no arquivo da foto (EXIF). Fotos do WhatsApp não têm; fotos tiradas direto pela câmera/app costumam ter.
async function exifGps(blob){
  try {
    const buf = new DataView(await blob.slice(0, 262144).arrayBuffer());
    if (buf.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off + 4 < buf.byteLength){
      const mk = buf.getUint16(off), len = buf.getUint16(off+2);
      if (mk === 0xFFE1 && buf.getUint32(off+4) === 0x45786966){ // "Exif"
        const t = off + 10, le = buf.getUint16(t) === 0x4949;
        const u16 = o => buf.getUint16(t+o, le), u32 = o => buf.getUint32(t+o, le);
        const ifd0 = u32(4); let gps = 0;
        for (let k=0, n=u16(ifd0); k<n; k++){ const e = ifd0 + 2 + k*12; if (u16(e) === 0x8825) gps = u32(e+8); }
        if (!gps) return null;
        const g = {};
        for (let k=0, n=u16(gps); k<n; k++){
          const e = gps + 2 + k*12, tag = u16(e), typ = u16(e+2);
          if ((tag===1 || tag===3) && typ===2) g[tag] = String.fromCharCode(buf.getUint8(t+e+8));
          if ((tag===2 || tag===4) && typ===5){ const vo = u32(e+8), r = j => u32(vo+j*8) / (u32(vo+j*8+4) || 1); g[tag] = r(0) + r(1)/60 + r(2)/3600; }
        }
        if (g[2]==null || g[4]==null || (!g[2] && !g[4])) return null;
        const lat = (g[1]==="S" ? -1 : 1) * g[2], lon = (g[3]==="W" ? -1 : 1) * g[4];
        return coordsOf({lat, lon});
      }
      if ((mk & 0xFF00) !== 0xFF00 || mk === 0xFFDA) break;
      off += 2 + len;
    }
  } catch(e){}
  return null;
}
async function ensureGps(list, onProg){
  let k = 0; const todo = list.filter(p=>p.exif===undefined);
  for (const p of todo){ try { p.exif = await exifGps(await blobOf(p)); } catch(e){ p.exif = null; } IDB.set(p.hash+"|gps", {c:p.exif}); if (onProg && ++k % 25 === 0) onProg(k, todo.length); }
}
const fmtCoord = v => typeof v === "number" ? v.toFixed(6) : "";

// ---------- campos derivados de cada foto ----------
function parseDMY(s){ const m = String(s||"").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; let y=+m[3]; if (y<100) y+=2000; const d=new Date(y,+m[2]-1,+m[1]); return isNaN(d)?null:d; }
function parseHM(s){ const m = String(s||"").match(/(\d{1,2})[:h.](\d{2})/); return m ? `${pad(+m[1])}:${m[2]}` : ""; }
function fmtD(d){ return d ? `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}` : ""; }

function info(p){
  const o = p.ocr || {}, e = p.edit, lote = S.lotes.find(l=>l.id===p.loteId) || {};
  const dOcr = parseDMY(o.data);
  const date = parseDMY(e.data) || dOcr || p.wa.date || null;
  const time = parseHM(e.hora) || parseHM(o.hora) || (p.wa.date && p.wa.hasTime ? `${pad(p.wa.date.getHours())}:${pad(p.wa.date.getMinutes())}` : "");
  const cardOnly = o._src==="courban" && (!o._lido || (o._deCard||[]).includes("hora"));
  const timeSrc = e.hora ? "manual" : parseHM(o.hora) ? (cardOnly ? "relatorio" : "carimbo") : time ? "whatsapp" : "";
  const ver = S.cfg.verify !== false;
  const vr = ver && o.logradouro ? LISTAS.rua(o.logradouro) : null;
  const vb = ver && (o.bairro || o.bairro_estimado) ? LISTAS.bairro(o.bairro || o.bairro_estimado) : null;
  const vref = ver && o.referencia && LISTAS.isLixo(o.referencia);
  const logr = vr ? vr.nome : (o.logradouro || null);
  let bairro = e.bairro || (vb ? (vb.nome || "") : (o.bairro || ""));
  const street = [logr, logr ? o.numero : null].filter(Boolean).join(", ");
  const ref = vref ? null : o.referencia;
  const titulo = e.titulo ?? (ref || logr || bairro || "");
  const endereco = e.endereco ?? (street ? street + (bairro ? " – " + bairro : "") : (bairro || ""));
  // chaves para contar locais: usam o que aparece no relatório (inclusive o que você digitou)
  const endStreet = e.endereco ? e.endereco.split(/,|\s[–-]\s/)[0] : "";
  const endBairro = e.endereco && /\s[–-]\s/.test(e.endereco) ? e.endereco.split(/\s[–-]\s/).pop().split(",")[0] : "";
  if (!bairro && endBairro) bairro = ver ? (LISTAS.bairro(endBairro)||{}).nome || endBairro : endBairro;
  const streetRaw = endStreet || logr || (e.titulo && /^(rua|r\.|av|avenida|tv|travessa|passagem|pass|alameda|rodovia|rod|pra[cç]a|largo|vila|viela|estrada|boulevard|blvd|beco|conjunto)\b/i.test(e.titulo) ? e.titulo : "") || ref || "";
  const streetCanon = streetRaw && ver ? ((LISTAS.rua(streetRaw)||{}).nome || "") : streetRaw;
  const chk = {rua: vr ? vr.status : "", bairro: vb ? vb.status : "", ruaDe: vr && vr.status==="corrigida" ? o.logradouro : "", bairroDe: vb && vb.status==="corrigida" ? (o.bairro||o.bairro_estimado) : ""};
  let registro = e.registro ?? (o.responsavel || p.wa.sender || "");
  if (/^n[aã]o identificad/i.test(registro)) registro = "";
  // serviço
  let service = e.servico || (lote.service && lote.service!=="__auto" ? lote.service : ""), svcSrc = e.servico ? "manual" : service ? "lote" : "";
  if (!service){
    const couOld = o._src==="courban" && !o._lido; // importado antes: servico_escrito era o do cartão
    const vis = matchService(o.servico_sugerido), txt = matchService(couOld ? null : o.servico_escrito) || matchService(p.wa.caption), ai = matchService(p.aiService);
    // o texto escrito na foto sempre vence a sugestão da IA
    const aiUse = txt ? "" : ai;
    service = aiUse || vis || txt || ""; svcSrc = service ? (aiUse||vis ? "ia" : "texto") : "";
    // serviço do cartão do co.urban: só quando nada melhor (a ordem de serviço junta fotos de vários serviços)
    if (!service){ const rel = o.servico_relatorio || (couOld ? o.servico_escrito : null); const m = rel && (matchService(rel) || rel); if (m){ service = m; svcSrc = "relatorio"; } }
  }
  // a IA conferindo serviço vindo do grupo/arquivo ou do relatório: troca quando tem certeza
  let svcWas = "";
  if ((svcSrc==="lote" || svcSrc==="relatorio") && p.aiOver && p.aiService && (p.aiConf||0) >= .7){ const m = matchService(p.aiService); if (m && m !== service){ svcWas = service; service = m; svcSrc = "ia"; } }
  // só vale serviço que está na lista atual (ex.: "Limpeza de Bueiros e Valas" foi tirado e não pode voltar por edição antiga, lote ou IA)
  if (service && !/dividir por hor/i.test(service) && !services().some(x=>x.name===service)){ const m = matchService(service); service = m && services().some(x=>x.name===m) ? m : ""; if (!service) svcSrc = ""; }
  service = PAP; svcSrc = "geral"; // relatório de papeleiras: todas as fotos são do mesmo serviço
  if (S.cfg.groupBy==="nenhum"){ service = GENERIC; svcSrc = "geral"; }
  if (/dividir por hor/i.test(service)){ const h = +(time||"12").slice(0,2); service = (h>=18||h<5) ? "Coleta Domiciliar Noturna" : "Coleta Domiciliar Diurna"; }
  // base
  let base = e.base || (lote.base && lote.base!=="auto" ? lote.base : ""), baseSrc = e.base ? "manual" : base ? "lote" : "";
  // coordenada: digitada > escrita no carimbo > GPS do arquivo
  const cMan = (e.lat!=null && e.lon!=null) ? coordsOf({lat:+e.lat, lon:+e.lon}) : null, cOcr = coordsOf(o), cExif = p.exif || null;
  const coord = cMan || cOcr || cExif, coordSrc = cMan ? "digitada" : cOcr ? "carimbo" : cExif ? "GPS da foto" : "";
  if (!base){ const r = classify(bairro && bairro !== o.bairro ? {...o, bairro} : o); base = r.base; baseSrc = r.src;
    if (base==="?" && coord){ if (coord.lat > -1.405){ base = "N"; baseSrc = "coordenada"; } else if (coord.lat < -1.425){ base = "S"; baseSrc = "coordenada"; } } }
  const inMonth = inPeriod(date);
  return {svcWas, suspicious: isSuspicious(p), date, time, timeSrc, titulo, endereco, registro, service, svcSrc, base, baseSrc, inMonth, street: streetCanon ? streetKey(streetCanon) : "", bairroN: bairro ? normTxt(bairro) : "", chk, bairroNome: bairro, quality:o.qualidade||"", carimbo:!!o.carimbo, descricao:e.descricao ?? (o.descricao||""), lat: coord ? coord.lat : null, lon: coord ? coord.lon : null, coordSrc};
}
function matchService(txt){
  if (!txt) return "";
  const n = " "+norm(txt)+" ";
  // vence o trecho mais longo encontrado (nome ou palavra-chave): "Mutirão Colégios Eleitorais" > "Mutirão"
  let best = "", bl = 0;
  for (const s of services()){
    const nn = norm(s.name); if (nn && n.includes(" "+nn+" ") && nn.length + .5 > bl){ best = s.name; bl = nn.length + .5; }
    for (const k of s.kw) if (k && n.includes(" "+k+" ") && k.length > bl){ best = s.name; bl = k.length; }
  }
  return best;
}
function classify(o){
  if (o.base_escrita) return {base:o.base_escrita, src:"carimbo"};
  const bm = bairroMap();
  for (const [b,src] of [[o.bairro,"bairro"],[o.bairro_estimado,"bairro estimado"]]){
    if (!b) continue; const n = norm(b);
    if (bm.has(n)){ const r = bm.get(n); return {base:r.base, src: r.check ? src+" (divisa)" : src}; }
    for (const [k,r] of bm) if (n.includes(k) || k.includes(n) && n.length>4) return {base:r.base, src:src};
  }
  const c = coordsOf(o);
  if (c){ if (c.lat > -1.405) return {base:"N", src:"coordenada"}; if (c.lat < -1.425) return {base:"S", src:"coordenada"}; }
  const cep = String(o.cep||"").replace(/\D/g,"");
  if (cep.length===8 && cep.startsWith("66")){ const k=+cep.slice(0,5); if (k===66115) return {base:"N",src:"CEP"}; if (k<66600) return {base:"S",src:"CEP"}; return {base:"N",src:"CEP"}; }
  return {base:"?", src:"sem endereço"};
}

// ---------- seleção com diversidade ----------
function ppp(){ return +S.cfg.ppp === 6 ? 6 : 4; }
function totalMode(){ return S.cfg.groupBy!=="nenhum" && +S.cfg.totalPages > 0; }
function capacity(){ if (totalMode()) return Infinity; const pg = S.cfg.groupBy==="nenhum" ? S.cfg.pagesTotal : S.cfg.pages; return pg > 0 ? pg * ppp() : Infinity; }
function groups(){
  const g = new Map(); // key base|service -> [{p,i}]
  for (const p of S.photos){
    if (p.status!=="ok" && p.status!=="manual") continue;
    const i = info(p);
    const key = i.base + "|" + (i.service || UNK);
    if (!g.has(key)) g.set(key, []);
    g.get(key).push({p,i});
  }
  return g;
}
function select(list, capOverride){
  const N = capOverride ?? capacity();
  const chosen = list.filter(x=>x.p.include===true).slice(0,N);
  let pool = list.filter(x=>x.p.include!==true && x.p.include!==false && x.i.inMonth && !x.p.dupOf && !foraOf(x.p));
  // muitas fotos: pré-amostra espalhada pelos dias para a escolha continuar rápida
  const LIM = Math.max(1500, N*6);
  if (pool.length > LIM){
    const byDay = new Map(); for (const x of pool){ const k = x.i.date ? x.i.date.toDateString() : "?"; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(x); }
    const out = [], lists = [...byDay.values()]; let r = 0;
    while (out.length < LIM && lists.some(a=>a.length)){ for (const a of lists){ if (a.length && out.length < LIM){ const step = Math.max(1, Math.floor(a.length/ (LIM/lists.length))); out.push(a.splice((r*step) % a.length, 1)[0]); } } r++; }
    pool = out;
  }
  if (!isFinite(N)) return [...chosen, ...pool].sort((a,b)=> (a.i.date-b.i.date) || (toMin(a.i.time)-toMin(b.i.time)));
  const near = new Map(); // rua|dia -> horários já escolhidos
  const cS=new Map(), cB=new Map(), cD=new Map(), picks=[...chosen];
  const reg = x => { const d = x.i.date ? x.i.date.getDate() : 0; cS.set(x.i.street,(cS.get(x.i.street)||0)+1); cB.set(x.i.bairroN,(cB.get(x.i.bairroN)||0)+1); cD.set(d,(cD.get(d)||0)+1);
    if (x.i.street){ const k = x.i.street+"|"+d; if (!near.has(k)) near.set(k, []); near.get(k).push(toMin(x.i.time)); } };
  picks.forEach(reg);
  const left = new Set(pool);
  while (picks.length < N && left.size){
    let best=null, bs=-1e9;
    for (const x of left){
      const d = x.i.date ? x.i.date.getDate() : 0, st = x.i.street, br = x.i.bairroN;
      let s = 0;
      s += st ? (cS.get(st) ? -35*cS.get(st) : 100) : -20;
      s += br ? (cB.get(br) ? -6*cB.get(br) : 40) : 0;
      s += cD.get(d) ? -4*cD.get(d) : 22;
      s += x.i.carimbo ? 15 : 0;
      s += x.i.quality==="ruim" ? -80 : 0;
      s += x.i.timeSrc==="whatsapp" || x.i.timeSrc==="relatorio" ? -45 : 0;   // data/hora do envio, não do carimbo: só entra se faltar foto
      s += x.i.suspicious ? -60 : 0;
      if (st && x.i.date){ const ts = near.get(st+"|"+d); if (ts){ const tm = toMin(x.i.time); if (ts.some(t=>Math.abs(t-tm)<20)) s -= 60; } }
      s -= (x.p.id % 97) / 1000; // desempate estável
      if (s > bs){ bs=s; best=x; }
    }
    left.delete(best); picks.push(best); reg(best);
  }
  const rankOrder = picks.slice(); // ordem de preferência (a mais variada primeiro), usada no equilíbrio entre bases
  const out = picks.sort((a,b)=> (a.i.date-b.i.date) || (toMin(a.i.time)-toMin(b.i.time)));
  out.rank = rankOrder; return out;
}
const toMin = t => t ? (+t.slice(0,2))*60 + (+t.slice(3,5)) : 0;
function serviceOrder(name){ const i = services().findIndex(s=>s.name===name); return i<0 ? 999 : i; }
// ---------- equilíbrio entre as bases: mesmo número de fotos na Norte e na Sul, espalhado pelos serviços ----------
const BAL_CACHE = new WeakMap();
function balanceBases(G){
  G = G || groups();
  if (BAL_CACHE.has(G)) return BAL_CACHE.get(G);
  const capSvc = capacity(), per = ppp(), res = {S:new Map(), N:new Map(), avail:{S:0,N:0}, target:0};
  const ranked = {S:[], N:[]};
  for (const [key, list] of G){
    const [b, svc] = key.split(/\|(.*)/s); if (b!=="S" && b!=="N") continue;
    const pool = list.filter(x=>x.p.include!==false && x.i.inMonth && !x.p.dupOf && !foraOf(x.p));
    const r = select(list, isFinite(capSvc) ? Math.min(capSvc, pool.length) : pool.length);
    const rank = (r.rank || r).slice(0, isFinite(capSvc) ? capSvc : Infinity);
    ranked[b].push({svc, rank}); res.avail[b] += rank.length;
  }
  const totalCap = S.cfg.groupBy==="nenhum" && S.cfg.pagesTotal > 0 ? S.cfg.pagesTotal * per : Infinity;
  const target = res.target = Math.min(res.avail.S, res.avail.N, totalCap);
  for (const b of ["S","N"]){
    const svcs = ranked[b].sort((x,y)=>serviceOrder(x.svc)-serviceOrder(y.svc)), take = new Map(svcs.map(x=>[x.svc,0]));
    let left = target;
    // primeiro 1 foto de cada serviço identificado (o máximo de serviços diferentes); depois por páginas inteiras, em rodízio.
    // "Serviço não informado" só recebe o que sobrar depois que os serviços identificados acabarem.
    for (const grp of [svcs.filter(x=>x.svc!==UNK), svcs.filter(x=>x.svc===UNK)]){
      let step = 1;
      while (left > 0){
        let moved = false;
        for (const x of grp){ if (left <= 0) break; const t = take.get(x.svc), n = Math.min(step, x.rank.length - t, left); if (n > 0){ take.set(x.svc, t+n); left -= n; moved = true; } }
        if (!moved) break;
        step = per;
      }
    }
    for (const x of svcs){ const sel = x.rank.slice(0, take.get(x.svc)).sort((a,c)=> (a.i.date-c.i.date) || (toMin(a.i.time)-toMin(c.i.time))); res[b].set(x.svc, sel); }
  }
  BAL_CACHE.set(G, res);
  return res;
}
// ---------- total de páginas do relatório: escolhe as fotos com a maior variedade de serviços ----------
// Páginas do PDF = 1 capa + (1 página de título + páginas de fotos) por serviço.
const byWhen = (a,c)=> (a.i.date-c.i.date) || (toMin(a.i.time)-toMin(c.i.time));
const RANK_CACHE = new WeakMap(), PLAN_CACHE = new WeakMap();
function rankOf(list, cap){ // as melhores fotos do serviço, da mais variada para a menos (ruas, bairros e dias diferentes)
  const pool = list.filter(x=>x.p.include!==false && x.i.inMonth && !x.p.dupOf && !foraOf(x.p)).length, n = Math.min(cap, pool);
  if (n <= 0) return [];
  const c = RANK_CACHE.get(list); if (c && c.length >= n) return c.slice(0, n);
  const r = select(list, n), rank = (r.rank || r).slice(0, n); RANK_CACHE.set(list, rank); return rank.slice();
}
function rankItems(lists, cap){ return [...lists].map(([svc,list])=>{ const rank = rankOf(list, cap); return {svc, rank, n:rank.length}; }).filter(x=>x.n>0); }
function pickServices(items, P){ // cada serviço precisa de 2 páginas (título + fotos); se não cabem todos, sai primeiro o "não informado", depois o de menos fotos
  const keep = items.filter(x=>x.n>0), maxK = Math.max(0, Math.floor((P-1)/2));
  while (keep.length > maxK){
    let k = keep.findIndex(x=>x.svc===UNK);
    if (k < 0){ k = 0; keep.forEach((x,j)=>{ const y = keep[k]; if (x.n < y.n || (x.n===y.n && serviceOrder(x.svc) > serviceOrder(y.svc))) k = j; }); }
    keep.splice(k, 1);
  }
  return keep;
}
function fromItems(items, budget){ // reparte as páginas de fotos: 1 para cada serviço, depois 1 a 1 em rodízio; "não informado" só fica com a sobra
  const per = ppp(), pg = new Map(items.map(x=>[x.svc,0])), need = x => Math.ceil(x.n/per);
  const ident = items.filter(x=>x.svc!==UNK).sort((a,b)=>serviceOrder(a.svc)-serviceOrder(b.svc)), unk = items.filter(x=>x.svc===UNK);
  let left = budget;
  for (const x of [...ident, ...unk]) if (left > 0){ pg.set(x.svc, 1); left--; }
  for (const grp of [ident, unk]){ let moved = true; while (left > 0 && moved){ moved = false; for (const x of grp){ if (left <= 0) break; if (pg.get(x.svc) < need(x)){ pg.set(x.svc, pg.get(x.svc)+1); left--; moved = true; } } } }
  const sel = new Map(); for (const x of items){ const k = pg.get(x.svc)||0; if (k) sel.set(x.svc, x.rank.slice(0, Math.min(k*per, x.n))); }
  return {sel, items};
}
function selTotal(m){ let t = 0; for (const a of m.values()) t += a.length; return t; }
function equalize(a, b){ // deixa as duas bases com o mesmo número de fotos, tirando da maior (primeiro do "não informado", depois do serviço com mais fotos)
  let extra = selTotal(a.sel) - selTotal(b.sel); const big = extra > 0 ? a : b; extra = Math.abs(extra);
  while (extra > 0){
    let best = null;
    for (const [svc, arr] of big.sel){ if (!arr.length) continue; const sc = (svc===UNK ? 1e6 : 0) + (arr.length > 1 ? 1e5 : 0) + arr.length; if (!best || sc > best.sc) best = {svc, arr, sc}; }
    if (!best) break;
    best.arr.pop(); extra--;
    if (!best.arr.length) big.sel.delete(best.svc);
  }
}
function listsOf(G, bases){ const m = new Map(); for (const [key,list] of G){ const [b, svc] = key.split(/\|(.*)/s); if (!bases.includes(b)) continue; m.set(svc, m.has(svc) ? m.get(svc).concat(list) : list); } return m; }
function planBase(lists, P){ const items = rankItems(lists, P*ppp()), keep = pickServices(items, P); return fromItems(keep, P - 1 - keep.length); }
function planTotal(base, G){
  let c = PLAN_CACHE.get(G); if (!c){ c = {}; PLAN_CACHE.set(G, c); }
  if (c[base]) return c[base];
  const P = Math.max(1, +S.cfg.totalPages|0), per = ppp();
  if (!S.cfg.balance){ c[base] = planBase(listsOf(G, base==="A" ? ["S","N","?"] : [base]), P); }
  else if (base!=="A"){ const a = planBase(listsOf(G, ["S"]), P), b = planBase(listsOf(G, ["N"]), P); equalize(a, b); c.S = a; c.N = b; }
  else { // juntas e equilibradas: o total de páginas vale para o arquivo único; metade das páginas de fotos para cada base
    const iS = rankItems(listsOf(G, ["S"]), P*per), iN = rankItems(listsOf(G, ["N"]), P*per), uni = new Map(), tag = new Map();
    // por serviço, intercala as melhores fotos da Sul e da Norte (S1, N1, S2, N2…) e reparte as páginas no arquivo único
    for (const svc of new Set([...iS, ...iN].map(x=>x.svc))){
      const rs = (iS.find(x=>x.svc===svc)||{rank:[]}).rank, rn = (iN.find(x=>x.svc===svc)||{rank:[]}).rank, mix = [];
      for (let k=0; k<Math.max(rs.length, rn.length); k++){ if (rs[k]){ mix.push(rs[k]); tag.set(rs[k], "S"); } if (rn[k]){ mix.push(rn[k]); tag.set(rn[k], "N"); } }
      uni.set(svc, {svc, rank:mix, n:mix.length});
    }
    const keep = pickServices([...uni.values()], P), all = fromItems(keep, P - 1 - keep.length);
    const a = {sel:new Map()}, b = {sel:new Map()};
    for (const [svc, arr] of all.sel){ a.sel.set(svc, arr.filter(x=>tag.get(x)==="S")); b.sel.set(svc, arr.filter(x=>tag.get(x)==="N")); }
    equalize(a, b);
    const sel = new Map(); for (const p of [a,b]) for (const [svc,arr] of p.sel) if (arr.length) sel.set(svc, (sel.get(svc)||[]).concat(arr));
    c.A = {sel, perBase: selTotal(a.sel)};
  }
  return c[base];
}
function sortRep(out){ return out.sort((a,b)=>(a.service===UNK?-1:0)-(b.service===UNK?-1:0) || serviceOrder(a.service)-serviceOrder(b.service) || a.service.localeCompare(b.service)); }
// ---------- máximo de dias: troca fotos repetidas do mesmo dia por fotos de dias que ficaram de fora ----------
// Mantém o número de fotos de cada serviço (e de cada base, no equilíbrio), então páginas e equilíbrio não mudam.
const dayKey = x => x.i.date ? x.i.date.getFullYear()*10000 + (x.i.date.getMonth()+1)*100 + x.i.date.getDate() : 0;
function coverDays(out, base){
  if (base === "?") return out;
  const sameBase = S.cfg.balance && base === "A";
  const cnt = new Map(), selIds = new Set();
  for (const r of out) for (const x of r.sel){ selIds.add(x.p.id); const d = dayKey(x); if (d) cnt.set(d, (cnt.get(d)||0) + 1); }
  if (!selIds.size) return out;
  const ok = x => !selIds.has(x.p.id) && x.p.include!==false && x.i.inMonth && !x.p.dupOf && !foraOf(x.p) && !x.i.suspicious && x.i.quality!=="ruim" && dayKey(x) && (!S.cfg.balance || x.i.base!=="?");
  const cand = new Map(); // dia → [{r, x}]
  for (const r of out){ if (!r.sel.length) continue; for (const x of r.all){ if (!ok(x)) continue; const d = dayKey(x); if (cnt.has(d)) continue; if (!cand.has(d)) cand.set(d, []); cand.get(d).push({r, x}); } }
  if (!cand.size) return out;
  const nota = x => (x.i.carimbo?4:0) + (x.i.timeSrc==="whatsapp"?0:3) + (x.i.street?2:0) + (x.i.bairroN?1:0);
  for (const d of [...cand.keys()].sort((a,b)=>a-b)){
    // prefere o serviço com mais fotos selecionadas (é onde sobra foto repetida do mesmo dia)
    const opts = cand.get(d).sort((a,b)=>b.r.sel.length - a.r.sel.length || nota(b.x) - nota(a.x));
    let done = false;
    for (const {r, x} of opts){
      // sai a foto do dia mais repetido (que continua tendo outra foto nesse dia), nunca uma marcada "incluir sempre"
      let out1 = -1, best = 1;
      r.sel.forEach((y, k) => { const c = cnt.get(dayKey(y)) || 0; if (y.p.include===true || c <= 1 || (sameBase && y.i.base !== x.i.base)) return; if (c > best){ best = c; out1 = k; } });
      if (out1 < 0) continue;
      const y = r.sel[out1]; cnt.set(dayKey(y), cnt.get(dayKey(y)) - 1); selIds.delete(y.p.id);
      r.sel[out1] = x; selIds.add(x.p.id); cnt.set(d, 1); done = true; break;
    }
    if (!done) continue;
  }
  for (const r of out) r.sel.sort((a,c)=> (a.i.date-c.i.date) || (toMin(a.i.time)-toMin(c.i.time)));
  return out;
}
function daysInfo(out){ // dias com foto disponível × dias que entraram
  const disp = new Set(), sel = new Set();
  for (const r of out){ for (const x of r.all) if (x.p.include!==false && x.i.inMonth && !x.p.dupOf && !foraOf(x.p) && dayKey(x)) disp.add(dayKey(x)); for (const x of r.sel) if (dayKey(x)) sel.add(dayKey(x)); }
  return {disp: disp.size, sel: [...sel].filter(d=>disp.has(d)).length};
}
function report(base, G){
  const P = null; // papeleiras: sem seleção fixada (todas as fotos válidas entram)
  if (P && base !== "?") return pinnedReport(base, G || groups(), P);
  return coverDays(report0(base, G), base);
}
// ---------- seleção fixada: nada muda sozinho; se você tira uma foto, entra só uma do mesmo serviço (marcada "nova") ----------
function pinBase(base){
  if (!S.cfg.pins) S.cfg.pins = {};
  const keep = S.cfg.pins[base]; delete S.cfg.pins[base];
  const rep = coverDays(report0(base), base); if (keep) S.cfg.pins[base] = keep;
  const cnt = {}, ids = []; for (const r of rep){ if (!r.sel.length) continue; cnt[r.service] = r.sel.length; for (const x of r.sel) ids.push(x.p.hash); }
  S.cfg.pins[base] = {at: Date.now(), ids, cnt, novas: []}; saveCfg();
}
function unpinBase(base){ if (S.cfg.pins) delete S.cfg.pins[base]; saveCfg(); }
function pinnedReport(base, G, P){
  const set = new Set(P.ids), out = [];
  for (const [key, list] of G){
    const [b, svc] = key.split(/\|(.*)/s);
    if (base==="A" ? (S.cfg.balance && b==="?") : b!==base) continue;
    const r = out.find(x=>x.service===svc); if (r) r.all = r.all.concat(list); else out.push({service:svc, all:list});
  }
  const ok = x => x.p.include!==false && !x.p.dupOf;
  let added = 0;
  for (const r of out){
    r.sel = r.all.filter(x => x.p.include===true || (set.has(x.p.hash) && ok(x)));
    const want = P.cnt[r.service] || 0;
    if (r.sel.length < want){ // faltou foto neste serviço (você tirou ou mudou o serviço): repõe só aqui, com a próxima melhor do mesmo serviço
      const used = new Set(r.sel.map(x=>x.p.id)), pool = r.all.filter(x=>!used.has(x.p.id) && !set.has(x.p.hash));
      for (const x of rankOf(pool, want - r.sel.length)){ r.sel.push(x); P.ids.push(x.p.hash); set.add(x.p.hash); (P.novas = P.novas || []).push(x.p.hash); added++; }
    }
    r.sel.sort(byWhen);
  }
  if (added) saveCfg();
  return sortRep(out);
}
function report0(base, G){
  const out = [];
  if (totalMode() && base!=="?"){
    G = G || groups(); const T = planTotal(base, G);
    for (const [key,list] of G){
      const [b, svc] = key.split(/\|(.*)/s);
      if (base==="A" ? (S.cfg.balance && b==="?") : b!==base) continue;
      const r = out.find(x=>x.service===svc); if (r) r.all = r.all.concat(list); else out.push({service:svc, all:list});
    }
    out.forEach(r=>{ r.sel = (T.sel.get(r.service)||[]).slice().sort(byWhen); });
    return sortRep(out);
  }
  if (S.cfg.balance && base!=="?"){
    G = G || groups(); const B = balanceBases(G);
    for (const [key,list] of G){
      const [b, svc] = key.split(/\|(.*)/s);
      if (b==="?" || (base!=="A" && b!==base)) continue;
      const r = out.find(x=>x.service===svc), sel = B[b].get(svc) || [];
      if (r){ r.all = r.all.concat(list); r.sel = r.sel.concat(sel).sort((a,c)=> (a.i.date-c.i.date) || (toMin(a.i.time)-toMin(c.i.time))); }
      else out.push({service:svc, all:list, sel:sel.slice()});
    }
    return out.sort((a,b)=>(a.service===UNK?-1:0)-(b.service===UNK?-1:0) || serviceOrder(a.service)-serviceOrder(b.service) || a.service.localeCompare(b.service));
  }
  for (const [key,list] of (G || groups())){
    const [b, svc] = key.split(/\|(.*)/s);
    if (base==="A"){ const r = out.find(x=>x.service===svc); if (r) r.all = r.all.concat(list); else out.push({service:svc, all:list}); continue; }
    if (b!==base) continue;
    out.push({service:svc, all:list, sel:select(list)});
  }
  if (base==="A") out.forEach(r=>{ r.sel = select(r.all); });
  return out.sort((a,b)=>(a.service===UNK?-1:0)-(b.service===UNK?-1:0) || serviceOrder(a.service)-serviceOrder(b.service) || a.service.localeCompare(b.service));
}

// ---------- leitura com Claude ----------
function buildPrompt(n){
  const svc = services().map(s=>s.name).filter(s=>!/dividir/i.test(s)).join("; ");
  return `Você é fiscal de campo da limpeza urbana de Belém-PA. Recebeu ${n} foto(s) de serviços executados. A maioria tem um CARIMBO (marca d'água de apps como Timemark, GPS Map Camera, Timestamp Camera etc.) com data, hora, endereço, coordenadas e às vezes nome do responsável.

Para CADA foto, na ordem recebida (i = 1..${n}), TRANSCREVA somente o que está ESCRITO no carimbo. Não invente nada. Se um campo não estiver escrito ou não for legível, use null.

Regras:
- data: formato DD/MM/AAAA. Converta meses por extenso ("7 de ago. de 2026", "14 ago. 2026", "Seg, 17 ago. 2026") para número. Datas como "01/08/2026" ficam como estão.
- hora: HH:MM (24h). "10:37 PM" vira "22:37".
- logradouro: tipo + nome da via como escrito (ex.: "Blvd. Castilhos França", "Rua Caetano Rufino", "Tv. Padre Eutíquio"). numero: só o número do imóvel.
- bairro: o bairro escrito (em carimbos de várias linhas, a linha após a rua costuma ser o bairro; em "Rua X, 12 - Campina, Belém - PA" o bairro é "Campina").
- bairro_estimado: SOMENTE se o bairro não estiver escrito, informe o bairro de Belém que você reconhece com segurança pela rua/CEP; senão null.
- cep: como escrito. lat/lon: números decimais se escritos (ex.: "Lat -1.450626° Long -48.501717°"). utm: texto como "22M 778793 9838977" se aparecer.
- responsavel: nome de pessoa escrito no carimbo (após "Nome:", "Encarregado", "Enc:", "Colaborador(a):", "Supervisor") — se houver mais de um, o primeiro. Não use nomes de empresa.
- referencia: nome de lugar escrito no carimbo que não seja o endereço (ex.: "Feira do Porto da Palha", "Praça da República"); senão null.
- servico_escrito: nome de serviço escrito no carimbo, se houver.
- servico_sugerido: qual destes serviços a imagem mostra, pelo que se vê: ${svc}. Use null se não der para saber.
- carimbo: true se a foto tem carimbo com data/hora ou endereço.
- app: nome do app do carimbo, se aparecer.
- qualidade: "ruim" se a foto estiver muito borrada, escura demais, for print de tela, selfie ou não mostrar serviço de limpeza; senão "boa".
${S.cfg.desc ? `- descricao: uma frase curta e objetiva (máx. 14 palavras) do que a foto mostra, sem opinião. Ex.: "Equipe realizando capina e raspagem do meio-fio."` : `- descricao: null.`}

Responda APENAS com um array JSON de ${n} objetos, nesta forma:
[{"i":1,"carimbo":true,"app":"Timemark","data":"27/09/2026","hora":"06:39","logradouro":"Blvd. Castilhos França","numero":"640","bairro":"Campina","bairro_estimado":null,"cep":"66010-020","lat":null,"lon":null,"utm":null,"responsavel":"Janailton","referencia":null,"servico_escrito":null,"servico_sugerido":"Coleta de Feiras e Mercados","qualidade":"boa","descricao":null}]`;
}

async function readAll(){
  if (S.reading) return;
  const sample = S.sample;
  let lim = null; if (sample) { try { lim = await sample.limits(); } catch(e){ lim = null; } }
  if (S.cfg.engine!=="vision" || !lim || !lim.images) return readAllOCR();
  const per = Math.max(1, Math.min(lim.images.maxCount || 4, 5));
  const queue = pickToRead();
  if (!queue.length){ setMsg("#readMsg","ok","Todas as fotos previstas já foram lidas."); refreshAll(); return; }
  S.reading = true; S.ctl = new AbortController(); $("#btnStop").hidden = false; $("#btnRead").disabled = true;
  const total = queue.length; let done = 0, fails = 0, stopped = "", lastErr = "";
  setMsg("#readMsg","", `Lendo ${total} foto(s) em lotes de ${per}. Na primeira vez o Claude pede para você permitir.`);
  const batches = []; for (let i=0;i<queue.length;i+=per) batches.push(queue.slice(i,i+per));
  const worker = async () => {
    while (batches.length && !stopped){
      const b = batches.shift();
      b.forEach(p=>p.status="reading");
      try {
        const imgs = await Promise.all(b.map(async p=>scaled(await blobOf(p), 1280, .85, "blob")));
        const res = await sample.json(buildPrompt(b.length), {images:imgs, modelTier:S.cfg.tier, signal:S.ctl.signal});
        const arr = Array.isArray(res) ? res : (res && Array.isArray(res.fotos) ? res.fotos : []);
        b.forEach((p,k)=>{
          const r = arr.find(x=>+x.i===k+1) || arr[k];
          if (r && typeof r==="object"){ p.ocr = clean(r); p.status="ok"; IDB.set(p.hash+"|"+(S.cfg.desc?"d":"n"), p.ocr); }
          else { p.status="err"; p.err="resposta sem esta foto"; fails++; }
        });
      } catch(e){
        b.forEach(p=>{ if (p.status==="reading") p.status="pending"; });
        const c = e && e.code;
        if (c==="cancelled") stopped = "Leitura parada. Clique em \"Ler fotos\" para continuar de onde parou.";
        else if (c==="rate_limited") stopped = "O Claude pediu uma pausa (limite de uso). Espere alguns minutos e clique em \"Ler fotos\" para continuar.";
        else if (c==="not_granted"||c==="sampling_disabled"||c==="images_unavailable"||c==="capability_disabled") stopped = "O Claude não foi autorizado para esta página. Recarregue e permita, ou use \"Seguir sem leitura\".";
        else if (c==="session_expired") stopped = "Sua sessão do Claude expirou. Entre de novo e continue.";
        else { b.forEach(p=>{p.status="err"; p.err=errText(e);}); fails += b.length; lastErr = errText(e); if (fails >= 10 && done < per*3) stopped = "A leitura está falhando: " + lastErr; }
      }
      done += b.length;
      $("#bar").style.width = Math.round(100*done/total)+"%";
      $("#readStat").textContent = `${Math.min(done,total)} de ${total}`;
      refreshAll(true);
    }
  };
  await Promise.all([worker(), worker()]);
  S.reading = false; $("#btnStop").hidden = true; $("#btnRead").disabled = false;
  if (stopped) setMsg("#readMsg","warn",stopped);
  else setMsg("#readMsg", fails?"warn":"ok", `Leitura concluída. ${total-fails} lida(s)${fails?`, ${fails} com erro (clique em "Ler fotos" para tentar de novo). Último erro: ${esc(lastErr)}`:""}.`);
  refreshAll();
}
// ---------- leitura pelo leitor do navegador (Tesseract) ----------
const OCR = {
  sched:null, n:0, loading:null,
  async init(onMsg){
    if (this.sched) return this.sched;
    if (this.loading) return this.loading;
    this.loading = (async()=>{
      if (!window.Tesseract) throw new Error("o leitor de texto não carregou nesta página");
      const base = new URL("tess/", location.href).href;
      onMsg("Preparando o leitor de texto…");
      if (location.protocol === "file:") throw new Error("a página foi aberta direto do computador (arquivo). O leitor de texto só funciona com a página publicada (Vercel) ou num servidor local. O resto da ferramenta funciona normalmente");
      for (const f of ["worker.min.js","por-traineddata.wasm","tesseract-core-simd-lstm.wasm.js"]){
        let okf = false; try { const r = await fetch(base + f, {method:"HEAD", cache:"no-store"}); okf = r.ok; } catch(e){ okf = false; }
        if (!okf) throw new Error(`o arquivo tess/${f} não foi encontrado no site. Confira se a pasta "tess" foi enviada junto com o index.html`);
      }
      const mk = (blobURL) => Tesseract.createWorker("por", 1, {
        workerPath: base + "worker.min.js", corePath: base, langPath: base.replace(/\/$/,""), workerBlobURL: blobURL, cacheMethod:"none", gzip:true,
        logger: m => { if (m && m.status && /loading|initializ/.test(m.status)) onMsg("Preparando o leitor: " + m.status + (m.progress?` ${Math.round(m.progress*100)}%`:"")); },
        errorHandler: e => { console.error("tesseract", e); OCR.lastErr = String(e); } });
      const withTO = (p, ms) => Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error("o leitor demorou demais para iniciar")), ms))]);
      let w, firstErr, blobMode = false;
      try { w = await withTO(mk(false), 90000); } catch(e){ firstErr = e; }
      if (!w) { blobMode = true; try { w = await withTO(mk(true), 90000); } catch(e){ throw new Error((e && e.message || e) + (firstErr ? " / " + (firstErr.message||firstErr) : "")); } }
      await w.setParameters({tessedit_pageseg_mode: "3"});
      const sched = Tesseract.createScheduler(); sched.addWorker(w); this.n = 1;
      if ((navigator.hardwareConcurrency||2) >= 4){ try { const w2 = await withTO(mk(blobMode), 60000); await w2.setParameters({tessedit_pageseg_mode:"3"}); sched.addWorker(w2); this.n = 2; } catch(e){} }
      this.sched = sched; return sched;
    })();
    try { return await this.loading; } catch(e){ this.loading = null; throw e; }
  }
};
async function ocrCanvas(blob, top=0, W=1600){
  const im = await decode(blob); const w0 = im.width, h0 = im.height;
  const sy = Math.floor(h0*top), sh = h0 - sy, H = Math.max(1, Math.round(sh*W/w0));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", {willReadFrequently:true}); g.drawImage(im, 0, sy, w0, sh, 0, 0, W, H); if (im.close) im.close();
  const d = g.getImageData(0,0,W,H), a = d.data;
  for (let i=0;i<a.length;i+=4){ const r=a[i], gg=a[i+1], b=a[i+2]; const mx = r>gg?(r>b?r:b):(gg>b?gg:b), mn = r<gg?(r<b?r:b):(gg<b?gg:b); const v = (mx>220 && mx-mn<35) ? 0 : 255; a[i]=a[i+1]=a[i+2]=v; a[i+3]=255; }
  g.putImageData(d,0,0); return c;
}
function bairroNames(){ return S.cfg.bairros.map(b=>b[0]); }

// ---------- alta precisão: lê com o PaddleOCR e junta com o que o leitor normal achou ----------
async function hpText(blob){ return unglue(await HP.read(blob, {maxSide:1100})); }
async function hpRead(p, blob, pre){
  const txt = pre != null ? pre : await hpText(blob || await blobOf(p));
  const h = parseOCR(txt, bairroNames()), o = p.ocr && p.ocr._src ? {...p.ocr} : {};
  const inList = b => b && bairroNames().some(n => normTxt(n) === normTxt(b));
  if (h.data) o.data = h.data;
  if (h.hora) o.hora = h.hora;
  // rua: fica a que bate com a lista de ruas de Belém (o leitor normal às vezes lê lixo onde o de alta precisão lê certo)
  const rOk = r => { const v = r && S.cfg.verify !== false ? LISTAS.rua(r) : null; return v ? (v.status==="ok" || v.status==="corrigida") : false; };
  if (h.logradouro && (!o.logradouro || (!rOk(o.logradouro) && rOk(h.logradouro)))){ o.logradouro = h.logradouro; o.numero = h.numero || o.numero || null; }
  if (h.bairro && inList(h.bairro) && !inList(o.bairro)) o.bairro = h.bairro;
  for (const f of ["numero","bairro","cep","utm","responsavel","referencia","servico_escrito","base_escrita","app"]) if (!o[f] && h[f]) o[f] = h[f];
  if (o.lat == null && h.lat != null){ o.lat = h.lat; o.lon = h.lon; }
  o.carimbo = !!(o.data || o.hora || o.logradouro || o.cep || o.utm || o.lat);
  o.qualidade = o.qualidade || "boa"; o._src = "alta";
  p.ocr = o; p.ocrText = (p.ocrText ? p.ocrText + "\n" : "") + "--- alta precisão ---\n" + txt; p.status = "ok";
}
// ---------- fotos fora do padrão: rabiscos/círculos, prints, avisos, tabelas, fotos pretas ----------
// Olha a imagem pequena (160 px) e o texto lido. Não precisa de internet nem de IA.
const FORA_TXT = /\b(aten[cç][aã]o|aviso|comunicado|informativo|promo[cç][aã]o|oferta|desconto|liquida[cç][aã]o|r\$|planilha|total geral|subtotal|whats ?app|instagram|facebook|youtube|tiktok|www\.|https?:|\.com\b|curtir|compartilh|pix\b|ligue|disque|vagas?\b|vende-?se|aluga-?se|boleto|clique|download|mensagens?|online|digitando|bateria|ultima vez)/i;
function strokeFeat(px, S){ // rabisco/círculo de caneta: traço de cor pura, comprido, fino e vazado
  const N = S*S, M = new Uint8Array(N);
  for (let i=0, k=0; k<N; i+=4, k++){
    const r = px[i], g = px[i+1], b = px[i+2], mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    if (mx <= 150 || (mx-mn)/mx <= .8) continue;
    const d = mx-mn; let h; if (mx===r) h = 60*(((g-b)/d)%6); else if (mx===g) h = 60*((b-r)/d+2); else h = 60*((r-g)/d+4); if (h<0) h += 360;
    if (h < 8 || h > 290 || (h > 210 && h < 245)) M[k] = 1; // vermelho, rosa/roxo, azul (canetas do WhatsApp)
  }
  let E = M;
  for (let it=0; it<4; it++){ const E2 = new Uint8Array(N);
    for (let y=1; y<S-1; y++) for (let x=1; x<S-1; x++){ const k = y*S+x; if (E[k] && E[k-1] && E[k+1] && E[k-S] && E[k+S] && E[k-S-1] && E[k-S+1] && E[k+S-1] && E[k+S+1]) E2[k] = 1; }
    E = E2; }
  const lab = new Int32Array(N), st = []; let best = 0, id = 0;
  for (let k0=0; k0<N; k0++){ if (!M[k0] || lab[k0]) continue; id++; lab[k0] = id; st.push(k0);
    let cnt = 0, er = 0, x0 = S, x1 = 0, y0 = S, y1 = 0;
    while (st.length){ const k = st.pop(), x = k % S, y = (k - x) / S; cnt++; if (E[k]) er++;
      if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y;
      for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++){ const xx = x+dx, yy = y+dy; if (xx<0||yy<0||xx>=S||yy>=S) continue; const kk = yy*S+xx; if (M[kk] && !lab[kk]){ lab[kk] = id; st.push(kk); } } }
    if (cnt < 60) continue;
    const bw = x1-x0+1, bh = y1-y0+1, ext = Math.max(bw, bh);
    if (ext >= .25*S && er/cnt <= .10 && cnt/(bw*bh) < .35 && ext > best) best = ext;
  }
  return best / S;
}
function patternFeat(px, W, H){ // 160x160: foto escura, áreas lisas (print, cartaz, tabela)
  let sumV = 0, bright = 0;
  for (let i=0; i<px.length; i+=4){ const mx = Math.max(px[i],px[i+1],px[i+2]); sumV += mx; if (mx > 60) bright++; }
  let flat = 0, nb = 0, white = 0;
  for (let by=0; by+8<=H; by+=8) for (let bx=0; bx+8<=W; bx+=8){ let s1=0, s2=0, wh=0;
    for (let y=by; y<by+8; y++) for (let x=bx; x<bx+8; x++){ const i=(y*W+x)*4, L = .3*px[i]+.59*px[i+1]+.11*px[i+2]; s1+=L; s2+=L*L; if (L>235) wh++; }
    const m = s1/64, sd = Math.sqrt(Math.max(0, s2/64 - m*m)); nb++; if (sd < 1.6 && m > 40) flat++; if (wh > 56) white++; }
  return {meanV: sumV/(W*H), brightFrac: bright/(W*H), flat: flat/nb, white: white/nb};
}
function foraMotivo(f, o, text){
  const t = String(text||""), lines = t.split("\n").filter(l=>/[A-Za-zÀ-ú]{3}/.test(l)).length, digits = (t.match(/\d/g)||[]).length;
  if (f.meanV < 22 && f.brightFrac < .03) return "foto preta ou escura demais";
  if (f.stroke) return "tem rabisco, círculo ou anotação";
  if (f.flat > .42 || f.white > .4 || (f.white > .3 && f.flat > .15)) return "parece print, cartaz ou documento";
  if (FORA_TXT.test(t) && !(o && o.data && o.logradouro)) return "parece aviso, propaganda ou print";
  if (lines >= 14 && digits > 80 && !(o && o.data)) return "parece tabela ou print de planilha";
  return null;
}
async function checkPattern(p){
  if (!p.ocr || p.ocr._src === "courban") { if (p.ocr) p.ocr._chk = 1; return; }
  const blob = await blobOf(p); let im;
  try { im = await createImageBitmap(blob, {resizeWidth:480, resizeHeight:480, resizeQuality:"medium"}); } catch(e){ im = await decode(blob); }
  const c = document.createElement("canvas"); c.width = 480; c.height = 480; const g = c.getContext("2d", {willReadFrequently:true});
  g.drawImage(im, 0, 0, 480, 480); if (im.close) im.close();
  const big = g.getImageData(0,0,480,480).data;
  const c2 = document.createElement("canvas"); c2.width = 160; c2.height = 160; const g2 = c2.getContext("2d", {willReadFrequently:true});
  g2.imageSmoothingQuality = "medium"; g2.drawImage(c, 0, 0, 160, 160);
  const f = patternFeat(g2.getImageData(0,0,160,160).data, 160, 160); f.stroke = strokeFeat(big, 480);
  p.ocr._fora = foraMotivo(f, p.ocr, p.ocrText || p.ocr._text); p.ocr._chk = 1;
}
function foraOf(p){ return p.include !== true && !!(p.ocr && p.ocr._fora); }
let PAT_RUN = false;
async function patternPass(){ // confere em segundo plano as fotos já lidas que ainda não foram conferidas
  if (PAT_RUN) return; PAT_RUN = true;
  try {
    let n = 0;
    for (;;){
      const todo = S.photos.filter(p=>p.status==="ok" && p.ocr && !p.ocr._chk).slice(0, 8);
      if (!todo.length) break;
      await Promise.all(todo.map(async p=>{ try { await checkPattern(p); IDB.set(p.hash+"|ocr", {...p.ocr, _text:p.ocrText}); } catch(e){ p.ocr._chk = 1; } }));
      if ((n += todo.length) % 200 < 8) refreshAll(true);
      await new Promise(r=>setTimeout(r, 0));
    }
    if (n) refreshAll(true);
  } finally { PAT_RUN = false; }
}
function isSuspicious(p){
  const o = p.ocr || {}, d = parseDMY(o.data), w = p.wa && p.wa.date;
  if (!d || !w) return false;
  const diff = (w - d) / 864e5; // dias entre a foto e o envio
  return diff < -1.5 || diff > 45;
}
function needsHP(p){
  if (!p.ocr || p.ocr._src === "alta") return false;
  if (p.status === "manual" || p.status === "err") return true;
  return p.status === "ok" && (!p.ocr.data || !p.ocr.hora || !p.ocr.logradouro || isSuspicious(p));
}
function hpCandidates(){
  const selected = new Set(); for (const b of ["S","N","?"]) for (const r of report(b)) for (const x of r.sel) selected.add(x.p.id);
  const all = S.photos.filter(p => (p.status==="ok" || p.status==="manual" || p.status==="err") && needsHP(p) && p.include !== false && !p.dupOf && !foraOf(p));
  return all.sort((a,b) => (selected.has(b.id)?1:0) - (selected.has(a.id)?1:0));
}
async function rereadHP(list){
  if (S.reading) return;
  list = list || hpCandidates();
  if (!list.length){ setMsg("#readMsg","ok","Nenhuma foto com problema de leitura para reler."); return; }
  S.reading = true; S.ctl = new AbortController(); $("#btnStop").hidden = false; $("#btnRead").disabled = true; $("#btnHP").disabled = true;
  try { await HP.init(t => setMsg("#readMsg","",esc(t))); }
  catch(e){ S.reading = false; $("#btnStop").hidden = true; $("#btnRead").disabled = false; $("#btnHP").disabled = false; setMsg("#readMsg","bad","O leitor de alta precisão não iniciou: " + esc(e && e.message || e)); return; }
  const total = list.length, t0 = Date.now(); let done = 0, fixed = 0, fails = 0;
  for (const p of list){
    if (S.ctl.signal.aborted) break;
    const before = JSON.stringify([p.ocr && p.ocr.data, p.ocr && p.ocr.hora, p.ocr && p.ocr.logradouro]);
    try { if (!p.ocr) p.ocr = {}; await hpRead(p); IDB.set(p.hash+"|ocr", {...p.ocr, _text:p.ocrText}); if (JSON.stringify([p.ocr.data, p.ocr.hora, p.ocr.logradouro]) !== before) fixed++; }
    catch(e){ fails++; console.error(e); }
    done++;
    const el = (Date.now()-t0)/1000, left = Math.round(el/done*(total-done));
    $("#bar").style.width = Math.round(100*done/total)+"%";
    $("#readStat").textContent = `Alta precisão: ${done} de ${total} · faltam ~${left>90?Math.round(left/60)+" min":left+" s"}`;
    setMsg("#readMsg","",`Relendo com alta precisão (mais lento, cerca de 2 a 4 s por foto). As fotos que já estão no relatório vêm primeiro.`);
    if (done % 3 === 0) refreshAll(true);
    await new Promise(r=>setTimeout(r,0));
  }
  S.reading = false; $("#btnStop").hidden = true; $("#btnRead").disabled = false; $("#btnHP").disabled = false;
  setMsg("#readMsg", fails?"warn":"ok", `${S.ctl.signal.aborted?"Parado. ":""}Alta precisão: ${done} foto(s) relida(s), ${fixed} com dados novos ou corrigidos${fails?`, ${fails} com erro`:""}.`);
  refreshAll();
}
// junta o carimbo lido da foto com o cartão do co.urban: o carimbo vale; o cartão só completa o que faltar
function mergeCou(o, card){
  o = {...(o||{})}; const de = [];
  const fill = (k, v) => { if ((o[k] == null || o[k] === "") && v != null && v !== ""){ o[k] = v; de.push(k); } };
  // ano lido errado no carimbo ("29/09/2020"): se dia e mês batem com o cartão, vale o ano do cartão
  if (o.data && card.data && o.data.slice(0,5) === card.data.slice(0,5) && o.data !== card.data){ o.data = card.data; }
  fill("data", card.data); fill("hora", card.hora);
  // endereço do cartão é o da ordem de serviço: só entra se o carimbo não tiver nenhum local (rua, bairro, CEP ou coordenada)
  const temLocal = !!(o.logradouro || o.bairro || o.cep || o.lat != null || o.utm);
  if (!temLocal){
    if (card.logradouro){ o.logradouro = card.logradouro; o.numero = card.numero || null; de.push("logradouro"); }
    fill("bairro", card.bairro); fill("cep", card.cep);
    if (card.lat != null){ o.lat = card.lat; o.lon = card.lon; de.push("coordenadas"); }
  }
  o.servico_relatorio = card.servico_relatorio || card.servico_escrito || null; // serviço do cartão: fraco (a IA pode corrigir)
  o._src = "courban"; o._lido = 1; o._card = card; o._deCard = de; o.carimbo = true;
  return o;
}
let HPQ = Promise.resolve();
function hpSerial(f){ const r = HPQ.then(f); HPQ = r.catch(()=>{}); return r; }
async function readAllOCR(){
  const queue = pickToRead();
  if (!queue.length){ setMsg("#readMsg","ok","Todas as fotos previstas já foram lidas."); refreshAll(); return; }
  S.reading = true; S.ctl = new AbortController(); $("#btnStop").hidden = false; $("#btnRead").disabled = true;
  // fotos do co.urban são pequenas: o leitor normal quase não lê o carimbo delas, então usam sempre o de alta precisão
  let hpOk = false;
  if (S.cfg.precision !== "alta" && S.cfg.precision !== "altarapida" && queue.some(p=>p.cou)){ try { await HP.init(t => setMsg("#readMsg","",esc(t))); hpOk = true; } catch(e){} }
  if (S.cfg.precision === "alta" || S.cfg.precision === "altarapida"){ hpOk = true; try { await HP.init(t => setMsg("#readMsg","",esc(t))); } catch(e){ S.reading=false; $("#btnStop").hidden = true; $("#btnRead").disabled = false; setMsg("#readMsg","bad","O leitor de alta precisão não iniciou: " + esc(e && e.message || e) + ". Troque para precisão Normal no passo 1."); return; } }
  let sched;
  try { sched = await OCR.init(t => setMsg("#readMsg","",esc(t))); }
  catch(e){ S.reading=false; $("#btnStop").hidden = true; $("#btnRead").disabled = false;
    setMsg("#readMsg","bad",`O leitor do navegador não conseguiu iniciar: ${esc(e && e.message || e)}. Use "Seguir sem leitura" e preencha os locais, ou me avise com esta mensagem.`); return; }
  const total = queue.length; let done = 0, fails = 0; const t0 = Date.now();
  const readOne = async (p) => {
    if (S.ctl.signal.aborted) return;
    p.status = "reading";
    try {
      const blob = await blobOf(p);
      if (p.exif === undefined){ p.exif = await exifGps(blob); IDB.set(p.hash+"|gps", {c:p.exif}); }
      const r = await sched.addJob("recognize", await ocrCanvas(blob, 0));
      let text = (r && r.data && r.data.text) || "";
      const prec = S.cfg.precision, alta = prec === "alta" || prec === "altarapida";
      // alta rápida: o PaddleOCR lê logo depois da 1ª leitura; as releituras do leitor normal só acontecem se ainda faltar algo
      let hpT = null, done1 = false;
      if (prec === "altarapida"){
        hpT = await hpSerial(() => hpText(blob));
        const t = {ocr:{...parseOCR(text, bairroNames()), _src:"ocr"}, ocrText:""}; await hpRead(t, blob, hpT);
        done1 = !!(t.ocr.data && t.ocr.hora && t.ocr.logradouro);
      }
      if (!done1){
        const first = parseOCR(text, bairroNames());
        if (!first.data || !first.hora || !first.logradouro){
          const r2 = await sched.addJob("recognize", await ocrCanvas(blob, 0.5));
          text += "\n" + ((r2 && r2.data && r2.data.text) || "");
        }
        if (!parseOCR(text, bairroNames()).hora){
          const r3 = await sched.addJob("recognize", await ocrCanvas(blob, 0.4, 800));
          text += "\n" + ((r3 && r3.data && r3.data.text) || "");
        }
      }
      p.ocrText = text; p.ocr = parseOCR(text, bairroNames()); p.ocr._src = "ocr"; p.status = "ok";
      if (alta || (p.cou && hpOk)) await (hpT != null ? hpRead(p, blob, hpT) : hpSerial(() => hpRead(p, blob)));
      if (p.cou) p.ocr = mergeCou(p.ocr, p.cou);
      try { await checkPattern(p); } catch(e){}
      IDB.set(p.hash+"|ocr", {...p.ocr, _text:p.ocrText});
    } catch(e){ if (p.cou){ p.ocr = p.ocr && p.ocr._src === "courban" ? p.ocr : {...p.cou}; p.status = "ok"; } else p.status = "err"; p.err = String(e && e.message || e); fails++; }
    done++;
    const el = (Date.now()-t0)/1000, left = Math.round(el/done*(total-done));
    $("#bar").style.width = Math.round(100*done/total)+"%";
    $("#readStat").textContent = `${done} de ${total} · faltam ~${left>90?Math.round(left/60)+" min":left+" s"}`;
    if (done % 4 === 0) refreshAll(true);
  };
  setMsg("#readMsg","",`Lendo ${total} foto(s) no seu navegador (${OCR.n} leitor${OCR.n>1?"es":""} em paralelo). Pode levar alguns minutos; não feche a página.`);
  const q = queue.slice();
  // uma fila a mais que o número de leitores: enquanto um leitor reconhece, a próxima foto já é preparada,
  // e na alta precisão o PaddleOCR (uma foto por vez) trabalha ao mesmo tempo que o leitor normal lê a seguinte. O resultado é o mesmo.
  const nWorkers = OCR.n + 1;
  await Promise.all(Array.from({length:nWorkers}, async () => { while (q.length && !S.ctl.signal.aborted) await readOne(q.shift()); }));
  queue.forEach(p=>{ if (p.status==="reading"){ if (p.cou){ p.status = "ok"; if (!p.ocr || p.ocr._src !== "courban") p.ocr = {...p.cou}; } else p.status = "pending"; } });
  let note = "";
  if (!S.ctl.signal.aborted && S.sample && S.cfg.refine){
    const got = queue.filter(p=>p.status==="ok" && p.ocrText && p.ocrText.trim().length>8);
    if (got.length){ note = await refineWithClaude(got); }
  }
  S.reading = false; $("#btnStop").hidden = true; $("#btnRead").disabled = false;
  if (!S.ctl.signal.aborted) await findDuplicates();
  if (S.ctl.signal.aborted) setMsg("#readMsg","warn",`Leitura parada em ${done} de ${total}. Clique em "Ler fotos" para continuar.`);
  else setMsg("#readMsg", fails?"warn":"ok", `Leitura concluída: ${total-fails} foto(s) lida(s) pelo navegador${fails?`, ${fails} com erro`:""}. ${note} Confira as fotos marcadas "sem data" ou "Local não escrito" e corrija clicando nelas.`);
  refreshAll();
}
// o Claude (só texto) organiza o texto bruto do leitor e corrige erros óbvios
async function refineWithClaude(list){
  const per = 8; let ok = 0, err = "";
  for (let i=0;i<list.length;i+=per){
    if (S.ctl.signal.aborted) break;
    const b = list.slice(i,i+per);
    setMsg("#readMsg","",`O Claude está organizando o texto lido: ${Math.min(i+per,list.length)} de ${list.length}…`);
    const items = b.map((p,k)=>`### ${k+1}\n${p.ocrText.trim().slice(0,900)}`).join("\n\n");
    const prompt = `Abaixo estão ${b.length} textos extraídos por um leitor automático (OCR, com erros) dos carimbos de fotos de serviços de limpeza urbana em Belém-PA. Os carimbos vêm de apps como Timemark e GPS Map Camera.

Para cada texto, extraia os campos. Corrija apenas erros evidentes de leitura em nomes de ruas e bairros de Belém (ex.: "Sao'Silvesire" → "São Silvestre", "Guatná" → "Guamá", "Avenida-Perimetral" → "Avenida Perimetral"). NÃO invente nada que não esteja no texto; se um campo não aparece ou está ilegível, use null. Ignore textos de mapas (nomes de lojas, "Google").
- data DD/MM/AAAA (meses por extenso viram número; ano entre 2024 e 2030, senão null); hora HH:MM 24h (ignore fuso como "-03:00").
- logradouro (tipo + nome), numero, bairro, cep, lat/lon (decimais, negativos em Belém), utm (ex.: "22M 778793 9838977"), responsavel (nome de pessoa após Nome/Encarregado/Colaborador/Supervisor), referencia (lugar citado após "Local:" ou "Nota:").

Responda APENAS com um array JSON de ${b.length} objetos, na ordem: [{"i":1,"data":null,"hora":null,"logradouro":null,"numero":null,"bairro":null,"cep":null,"lat":null,"lon":null,"utm":null,"responsavel":null,"referencia":null}]

${items}`;
    try {
      const res = await S.sample.json(prompt, {modelTier:"quick", signal:S.ctl.signal});
      const arr = Array.isArray(res) ? res : [];
      b.forEach((p,k)=>{
        const r = arr.find(x=>+x.i===k+1) || arr[k]; if (!r) return;
        const c = clean(r), o = p.ocr;
        for (const f of ["data","hora","logradouro","numero","bairro","cep","utm","responsavel","referencia"]) if (c[f]) o[f] = c[f];
        if (c.lat!=null && c.lon!=null){ o.lat = c.lat; o.lon = c.lon; }
        o.carimbo = !!(o.data||o.hora||o.logradouro||o.cep||o.utm||o.lat); o._src = "ocr+claude";
        IDB.set(p.hash+"|ocr", {...o, _text:p.ocrText}); ok++;
      });
    } catch(e){ err = errText(e); if (e && ["not_granted","sampling_disabled","rate_limited","cancelled","session_expired","capability_disabled"].includes(e.code)) break; }
    refreshAll(true);
  }
  if (err && !ok) return `O Claude não conseguiu organizar o texto (${esc(err)}); ficou a leitura direta do navegador.`;
  return ok ? `O Claude organizou ${ok} leitura(s).` : "";
}

function clean(r){
  const s = v => (v===null||v===undefined||v==="null"||v==="") ? null : String(v).trim();
  const n = v => { const x = typeof v==="number" ? v : parseFloat(String(v??"").replace(",",".")); return isFinite(x) ? x : null; };
  return {carimbo:!!r.carimbo, app:s(r.app), data:s(r.data), hora:s(r.hora), logradouro:s(r.logradouro), numero:s(r.numero), bairro:s(r.bairro),
    bairro_estimado:s(r.bairro_estimado), cep:s(r.cep), lat:n(r.lat), lon:n(r.lon), utm:s(r.utm), responsavel:s(r.responsavel), referencia:s(r.referencia),
    servico_escrito:s(r.servico_escrito), servico_sugerido:s(r.servico_sugerido), qualidade:s(r.qualidade)||"boa", descricao:s(r.descricao)};
}
// escolhe quais fotos ler: por lote, espalhadas pelos dias do mês, até o limite por serviço
function pickToRead(){
  const out = [];
  for (const l of S.lotes){
    const ps = S.photos.filter(p=>p.loteId===l.id);
    const already = ps.filter(p=>p.status==="ok" && !(p.cou && !(p.ocr && p.ocr._lido))).length;
    const retry = ps.filter(p=>p.status==="err");
    const auto = 999999; // padrão: lê todas as fotos enviadas; os limites por lote só valem se você escolher
    let budget = Math.max(0, (S.cfg.maxRead || auto) - already);
    out.push(...retry.slice(0,budget)); budget -= Math.min(budget, retry.length);
    const pend = ps.filter(p=>p.status==="pending" || p.status==="manual" || (p.cou && !(p.ocr && p.ocr._lido) && p.status!=="reading"));
    // prioriza fotos do mês escolhido (pela data do WhatsApp) e espalha pelos dias
    const inM = pend.filter(p=>!p.wa.date || inPeriod(p.wa.date) || periodKind()!=="mes");
    const byDay = new Map(); for (const p of inM){ const k = p.wa.date ? p.wa.date.toDateString() : "?"; if(!byDay.has(k)) byDay.set(k,[]); byDay.get(k).push(p); }
    const lists = [...byDay.values()].map(a=>a.sort((x,y)=>(x.wa.date||0)-(y.wa.date||0)));
    // intercala: pega de cada dia um item espaçado, rodada a rodada
    let round = 0;
    while (budget>0 && lists.some(a=>a.length)){
      for (const a of lists){ if (!a.length || budget<=0) continue; const idx = round%2 ? a.length-1 : Math.floor(a.length/2); out.push(a.splice(idx,1)[0]); budget--; }
      round++;
    }
  }
  return out;
}
function noAI(){
  let n=0; for (const p of S.photos) if (p.status==="pending"||p.status==="err"){ p.status="manual"; p.ocr=p.ocr||{}; n++; }
  setMsg("#readMsg","ok",`${n} foto(s) liberadas sem leitura. Data e hora vêm do WhatsApp. Você ainda pode clicar em "Ler fotos" a qualquer momento para ler os carimbos.`);
  refreshAll(); findDuplicates();
}

// ---------- código de cada papeleira: S-001 (Base Sul), N-001 (Base Norte), 001 (bases juntas) ----------
const papCod = (base, n) => (base==="S"||base==="N" ? base + "-" : "") + pad(n, 3);

// ---------- interface ----------
function setMsg(sel, cls, html){ $(sel).innerHTML = html ? `<div class="msg ${cls}">${html}</div>` : ""; }
// tira o serviço da foto: vai para "Serviços de limpeza urbana", apaga a sugestão da IA e o exemplo aprendido com ela
function setNoService(p){
  p.edit.servico = UNK; p.aiService = null; p.aiConf = null; p.aiBy = null; p.aiGuess = null; p.aiVotes = null;
  if (typeof IDB !== "undefined" && IDB.del) IDB.del("learn|" + p.hash);
  if (typeof LRN !== "undefined"){ LRN.dirty = true; LRN.model = null; }
  saveEdit(p);
}
function svcOptions(sel, withAuto){
  const opts = services().map(s=>`<option ${s.name===sel?"selected":""}>${esc(s.name)}</option>`).join("");
  return (withAuto ? `<option value="__auto" ${sel==="__auto"||!sel?"selected":""}>Vários serviços (definir depois)</option>` : `<option value="">(automático)</option><option value="${esc(UNK)}" ${sel===UNK?"selected":""}>Serviços de limpeza urbana (sem serviço definido)</option>`) + opts;
}
function renderLotes(){
  const el = $("#lotes");
  el.innerHTML = S.lotes.map(l=>{
    const ps = S.photos.filter(p=>p.loteId===l.id), ok = ps.filter(p=>p.status==="ok").length;
    const days = new Set(ps.map(p=>p.wa.date && p.wa.date.toDateString())).size;
    return `<div class="lote" data-id="${l.id}">
      <div class="nm">${esc(l.name)}<small>${ps.length} foto(s) · ${days} dia(s) · ${ok} lida(s)</small></div>
      <label class="f" for="lb${l.id}">Base<select id="lb${l.id}" data-k="base">
        <option value="auto" ${l.base==="auto"?"selected":""}>Pelo endereço</option>
        <option value="S" ${l.base==="S"?"selected":""}>Base Sul</option>
        <option value="N" ${l.base==="N"?"selected":""}>Base Norte</option></select></label>
      <button class="small" data-del="${l.id}">Remover</button></div>`;
  }).join("");
}
function refreshAll(light){
  const pend = S.photos.filter(p=>p.status==="pending"||p.status==="err").length;
  const ok = S.photos.filter(p=>p.status==="ok"||p.status==="manual").length;
  if (!S.reading) $("#readStat").textContent = S.photos.length ? `${ok} lida(s) · ${pend} aguardando` : "";
  if (!light) renderLotes();
  renderReview(); lrnPill(); patternPass();
  const nh = S.photos.filter(p=>needsHP(p) && (p.status==="ok") && p.include!==false && !p.dupOf && !foraOf(p)).length;
  const bh = $("#btnHP"); if (bh && !S.reading){ bh.textContent = nh ? `Reler com alta precisão as ${nh} foto(s) com problema` : "Reler com alta precisão"; bh.disabled = !nh; }
}
function flagsOf(i, p){
  const f = [];
  if (!i.inMonth) f.push(`<span class="pill bad">fora do período</span>`);
  if (!i.date) f.push(`<span class="pill warn">sem data</span>`);
  if (i.suspicious) f.push(`<span class="pill bad">data duvidosa</span>`);
  if (i.chk){
    if (i.chk.rua==="corrigida" || i.chk.bairro==="corrigida") f.push(`<span class="pill n" title="${esc([i.chk.ruaDe, i.chk.bairroDe].filter(Boolean).join(" · "))}">corrigido pela lista</span>`);
    if (i.chk.rua==="fora") f.push(`<span class="pill warn">rua fora da lista</span>`);
    if (i.chk.bairro==="fora") f.push(`<span class="pill warn">bairro fora da lista</span>`);
    if (i.chk.rua==="lixo") f.push(`<span class="pill bad">texto descartado</span>`);
  }
  if (p.ocr && p.ocr._src==="alta") f.push(`<span class="pill ok">alta precisão</span>`);
  if (p.ocr && p.ocr._src==="courban"){
    if (!p.ocr._lido) f.push(`<span class="pill warn" title="Ainda não li o carimbo desta foto: data, hora e rua são do cartão da ordem de serviço, que costuma ser o mesmo para várias fotos. Clique em Ler fotos.">co.urban · carimbo não lido</span>`);
    else if ((p.ocr._deCard||[]).length) f.push(`<span class="pill n" title="O carimbo não tinha: ${esc(p.ocr._deCard.join(", "))}. Esses dados vieram do cartão do co.urban.">co.urban · ${esc(p.ocr._deCard.join(", "))} do cartão</span>`);
    else f.push(`<span class="pill n" title="Data, hora e rua lidas do carimbo da foto.">co.urban · carimbo lido</span>`);
  }
  { const P = S.cfg.pins && S.cfg.pins[S.tab]; if (P && P.novas && P.novas.includes(p.hash)) f.push(`<span class="pill warn" title="Entrou no lugar de uma foto que você tirou ou mudou de serviço">nova · confira</span>`); }
  if (i.svcWas) f.push(`<span class="pill n" title="O serviço vinha do grupo/arquivo ou do relatório; a IA olhou a foto e trocou.">IA trocou (era ${esc(svcTitle(i.svcWas))})</span>`);
  if (i.base==="?") f.push(`<span class="pill warn">base?</span>`);
  else if (/divisa|estimado|coordenada|CEP/.test(i.baseSrc)) f.push(`<span class="pill warn">base por ${esc(i.baseSrc.replace(" (divisa)",""))}${/divisa/.test(i.baseSrc)?" ⚠":""}</span>`);
  if (i.lat==null) f.push(`<span class="pill warn" title="Sem coordenada: não entra no mapa. Clique na foto e cole a coordenada.">sem coordenada</span>`);
  else if (i.coordSrc!=="carimbo") f.push(`<span class="pill n">coord. ${esc(i.coordSrc)}</span>`);
  if (p.status==="ok" && !i.carimbo) f.push(`<span class="pill">sem carimbo</span>`);
  if (i.quality==="ruim") f.push(`<span class="pill bad">foto ruim</span>`);
  if (i.timeSrc==="whatsapp") f.push(`<span class="pill">hora do envio</span>`);
  if (p.include===true) f.push(`<span class="pill ok">fixada</span>`);
  if (p.include===false) f.push(`<span class="pill bad">removida</span>`);
  if (p.dupOf) f.push(`<span class="pill warn">repetida</span>`);
  if (foraOf(p)) f.push(`<span class="pill bad">fora do padrão: ${esc(p.ocr._fora)}</span>`);
  if (i.svcSrc==="geral") {}
  else if (i.svcSrc==="ia") f.push(`<span class="pill n" title="Sugestão${p.aiBy==="gemini"?" do Gemini":p.aiBy==="local"?" do aprendizado no navegador":""}. Confira e corrija clicando na foto.">serviço pela IA${p.aiConf?" "+Math.round(p.aiConf*100)+"%":""}</span>`);
  else if (i.svcSrc==="texto") f.push(`<span class="pill n">serviço pelo texto</span>`);
  return f.join("");
}
function card(x, num, out){
  const {p,i} = x;
  const act = p.include===false ? `<button type="button" class="act" data-restore="${p.id}" title="Voltar a considerar esta foto">↺ Restaurar</button>`
    : `<button type="button" class="act rm" data-rm="${p.id}" title="Tirar esta foto do relatório" aria-label="Tirar do relatório">✕</button>`;
  return `<div class="card ${out?"out":""} ${S.sel.has(p.id)?"picked":""}" data-pid="${p.id}" tabindex="0" role="button" aria-label="Editar foto">
    <label class="pick" title="Selecionar"><input type="checkbox" data-pick="${p.id}" ${S.sel.has(p.id)?"checked":""} aria-label="Selecionar foto"></label>${act}
    <div class="ph">${p.thumb?`<img src="${p.thumb}" alt="">`:`<span class="pill">carregando</span>`}</div>
    <div class="tx">${num?`<span class="m">PAPELEIRA ${papCod(S.tab, num)}</span>`:""}
      <span>${esc(fmtD(i.date))} · ${esc(i.time||"--:--")}</span>
      <b>${esc(i.titulo||"Local não escrito")}</b>
      <span>${esc(i.endereco)}</span>
      <span>${i.lat!=null ? esc(fmtCoord(i.lat)+", "+fmtCoord(i.lon)) : ""}</span>
      <div class="flags">${flagsOf(i,p)}</div></div></div>`;
}
let thumbJob = 0;
function renderReview(){
  const base = S.tab;
  ["S","N","A","?"].forEach(b=>{ const t = {S:"#tabS",N:"#tabN",A:"#tabA","?":"#tabQ"}[b]; $(t).setAttribute("aria-selected", b===base); });
  const G = groups();
  const rep = report(base, G);
  const cnt = b => b===base ? rep.reduce((a,r)=>a+r.sel.length,0) : report(b, G).reduce((a,r)=>a+r.sel.length,0);
  $("#tabS").textContent = `Base Sul (${cnt("S")})`; $("#tabN").textContent = `Base Norte (${cnt("N")})`; $("#tabA").textContent = `Norte e Sul juntas (${cnt("A")})`;
  const q = [...G].filter(([k])=>k.startsWith("?|")).reduce((a,[,l])=>a+l.length,0);
  $("#tabQ").textContent = `A conferir (${q})`;
  $("#genRow").hidden = base==="?";
  $("#btnPdf").textContent = `Gerar PDF ${daBase(base)}`;
  $("#btnCsvRes").textContent = `CSV · Quadro resumo ${daBase(base)}`; $("#btnCsvGeo").textContent = `CSV · Georreferenciamento ${daBase(base)}`;
  const open = new Set([...document.querySelectorAll("#review details[open]")].map(d=>d.dataset.svc));
  if (!rep.length){ renderBulk();
    $("#review").innerHTML = `<div class="msg">${S.photos.length ? (base==="?" ? "Nenhuma foto sem base. Tudo certo." : "Nenhuma foto lida para esta base ainda.") : "Adicione fotos no passo 2 e leia no passo 3. As fotos selecionadas aparecem aqui, separadas por serviço."}</div>`;
    $("#pdfStat").textContent = ""; return;
  }
  let num = 0, pages = 1, totalSel = 0;
  const byTime = (a,b)=>(a.i.date-b.i.date)||(toMin(a.i.time)-toMin(b.i.time));
  const html = rep.map(r=>{
    const selIds = new Set(r.sel.map(x=>x.p.id));
    const notSel = r.all.filter(x=>!selIds.has(x.p.id));
    const rest = notSel.filter(x=>x.p.include!==false && !x.p.dupOf && !foraOf(x.p)).sort(byTime);
    const foraL = notSel.filter(x=>x.p.include!==false && !x.p.dupOf && foraOf(x.p)).sort(byTime);
    const removed = notSel.filter(x=>x.p.include===false).sort(byTime);
    const dups = notSel.filter(x=>x.p.include!==false && x.p.dupOf).sort(byTime);
    const pg = Math.ceil(r.sel.length/ppp()); if (r.sel.length) pages += (S.cfg.groupBy==="nenhum"?0:1) + pg; totalSel += r.sel.length;
    const streets = new Set(r.sel.map(x=>x.i.street).filter(Boolean)).size, bairros = new Set(r.sel.map(x=>x.i.bairroN).filter(Boolean)).size;
    const unread = S.photos.filter(p=>(p.status==="pending") && (S.lotes.find(l=>l.id===p.loteId)||{}).service===r.service).length;
    const cards = r.sel.map(x=>card(x, base==="?"?0:++num, false)).join("");
    const nIA = r.all.filter(x=>x.i.svcSrc==="ia").length;
    const unkTools = r.service===UNK ? `<div class="msg">Estas fotos entram no PDF numa seção "Serviços de limpeza urbana". Se quiser separar por serviço, marque as fotos (quadradinho) e escolha o serviço na barra de baixo${ENV.images===true ? `, ou <button type="button" class="small" id="btnAiSvc">peça à IA para sugerir</button> <small>(opcional, usa seu plano do Claude)</small>` : ""}. Para não separar nada, escolha "Sem separar por serviço" no passo 1.</div>` : "";
    return `<details class="svc ${r.service===UNK?"unk":""}" data-svc="${esc(r.service)}" ${open.has(r.service)||rep.length<=2?"open":""}>
      <summary><span class="t">${esc(svcTitle(r.service))}</span>
        <span class="pill ok">${r.sel.length} papeleira(s) · ${pg} pág. de fotos</span>
        ${(()=>{ const sem = r.sel.filter(x=>x.i.lat==null).length; return sem ? `<span class="pill warn">${sem} sem coordenada</span>` : r.sel.length ? `<span class="pill ok">todas georreferenciadas</span>` : ""; })()}
        <span class="pill">${streets} locais · ${bairros} bairros</span>
        <span class="pill">${r.all.length} lida(s)</span>${unread?`<span class="pill warn">${unread} não lida(s)</span>`:""}</summary>
      <div class="body">
        ${isFinite(capacity()) && r.sel.length<capacity() && r.all.length<=r.sel.length ? `<div class="msg warn">Faltam fotos para completar ${S.cfg.groupBy==="nenhum"?S.cfg.pagesTotal:S.cfg.pages} páginas. ${unread?"Aumente \"Fotos lidas por serviço\" e leia de novo, ou ":""}adicione mais fotos deste serviço.</div>`:""}
        ${unkTools}
        <div class="row"><button type="button" class="small" data-selall="${esc(r.service)}">Marcar todas</button>${r.service!==UNK && nIA ? `<button type="button" class="small" data-undoia="${esc(r.service)}">Desfazer as ${nIA} sugestão(ões) da IA nesta seção</button>` : ""}</div>
        <div class="cards">${cards}</div>
        ${rest.length?`<details class="more" data-more="${esc(r.service)}"><summary>Outras ${rest.length} foto(s) lidas que não entram (fora do período)</summary><div class="cards" style="margin-top:10px">${rest.slice(0, S.showMore && S.showMore[r.service] ? 5000 : 120).map(x=>card(x,0,true)).join("")}</div>${rest.length>120 && !(S.showMore&&S.showMore[r.service]) ? `<button type="button" class="small" data-showmore="${esc(r.service)}" style="margin-top:8px">Mostrar todas as ${rest.length}</button>` : ""}</details>`:""}
        ${foraL.length?`<details class="more"><summary>Fora do padrão (${foraL.length}) · rabiscos, prints, avisos, fotos pretas · deixadas de fora</summary><div class="msg" style="margin-top:8px">Se alguma estiver boa, marque e clique em "Incluir sempre" na barra de baixo: ela volta a valer como foto normal.</div><div class="cards" style="margin-top:10px">${foraL.map(x=>card(x,0,true)).join("")}</div></details>`:""}
        ${dups.length?`<details class="more"><summary>Repetidas (${dups.length}) · deixadas de fora automaticamente</summary><div class="cards" style="margin-top:10px">${dups.map(x=>card(x,0,true)).join("")}</div></details>`:""}
        ${removed.length?`<details class="more"><summary>Removidas por você (${removed.length})</summary><div class="cards" style="margin-top:10px">${removed.map(x=>card(x,0,true)).join("")}</div></details>`:""}
      </div></details>`;
  }).join("");
  const mc = monthCounts(), cur = (mc.find(x=>x[0]===S.cfg.month)||[0,0])[1];
  const dc = dayCounts(), outP = S.photos.filter(p=>(p.status==="ok"||p.status==="manual") && !info(p).inMonth).length;
  const banner = periodKind()!=="mes" ? (outP ? `<div class="msg warn">${outP} foto(s) lidas são de fora do período <b>${periodLabel()}</b> e não entram no relatório.${dc.length && dc[0][0]!==S.cfg.day && periodKind()==="dia" ? ` A maioria das fotos é de <b>${isoToBR(dc[0][0])}</b>. <button class="small" id="btnFixDay" data-d="${dc[0][0]}">Usar ${isoToBR(dc[0][0])}</button>` : ""}</div>` : "") : mc.length && mc[0][0]!==S.cfg.month && mc[0][1]>cur ? `<div class="msg warn">O mês do relatório está em <b>${periodLabel()}</b>, mas a maioria das fotos é de <b>${MONTHS[+mc[0][0].slice(5)-1]}/${mc[0][0].slice(0,4)}</b>. Fotos fora do mês não entram na seleção. <button class="small" id="btnFixMonth" data-m="${mc[0][0]}">Usar ${MONTHS[+mc[0][0].slice(5)-1]}/${mc[0][0].slice(0,4)}</button></div>` : "";
  const nfo = S.photos.filter(p=>foraOf(p) && p.include!==false).length;
  const nd = S.photos.filter(p=>p.dupOf).length;
  const dupMsg = nd ? `<div class="msg">Encontrei <b>${nd}</b> foto(s) repetida(s) (mesma imagem enviada mais de uma vez). Elas ficam fora da seleção; veja em "Repetidas" dentro de cada serviço.</div>` : "";
  const foraMsg = nfo ? `<div class="msg">Deixei de fora <b>${nfo}</b> foto(s) fora do padrão (rabisco ou círculo na foto, print, aviso, propaganda, tabela, foto preta). Confira em "Fora do padrão" dentro de cada serviço.</div>` : "";
  const resumo = listasResumo(S.photos.filter(p=>(p.status==="ok"||p.status==="manual") && (base==="A" || info(p).base===base)));
  let balMsg = "";
  if (totalMode() && base!=="?"){
    const P = +S.cfg.totalPages, used = rep.filter(r=>r.sel.length), nf = used.reduce((a,r)=>a+r.sel.length,0);
    const pgs = used.length ? 1 + used.length + used.reduce((a,r)=>a+Math.ceil(r.sel.length/ppp()),0) : 0;
    const fora = rep.filter(r=>!r.sel.length && r.all.some(x=>x.p.include!==false && x.i.inMonth && !x.p.dupOf && !foraOf(x.p))).map(r=>svcTitle(r.service));
    let eq = "";
    if (S.cfg.balance){ const T = planTotal(base, G); const n = base==="A" ? T.perBase : nf; eq = `${fora.length?" ":""}Bases equilibradas: <b>${n}</b> foto(s) da Base Norte e <b>${n}</b> da Base Sul${base!=="A" ? " (cada base no seu arquivo, com até "+P+" páginas)" : ""}. Fotos sem base definida não entram.`; }
    balMsg = fora.length || eq ? `<div class="msg">${fora.length ? `Ficaram de fora por falta de páginas: ${esc(fora.join(", "))}. Aumente o total de páginas para incluir.` : ""}${eq}</div>` : "";
  }
  else if (S.cfg.balance && base!=="?"){ const B = balanceBases(G); const menor = B.avail.S < B.avail.N ? "Base Sul" : "Base Norte";
    balMsg = `<div class="msg ok">Bases equilibradas: <b>${B.target}</b> foto(s) em cada base${base==="A" ? ` (<b>${B.target*2}</b> no total)` : ""}, espalhadas pelo máximo de serviços. ${B.avail.S!==B.avail.N ? `O limite vem da ${menor}, que tem ${Math.min(B.avail.S,B.avail.N)} foto(s) disponíveis${isFinite(capacity())?" dentro do máximo de páginas por serviço":""}. Para mais fotos, adicione fotos dessa base.` : ""} Fotos sem base definida ("A conferir") não entram.</div>`; }
  const PIN = null;
  const pinMsg = true ? "" : PIN
    ? `<div class="msg ok"><b>Seleção fixada</b> em ${new Date(PIN.at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}. Mudar páginas, equilíbrio ou ler mais fotos não mexe nela. Se você tirar uma foto ou mudar o serviço dela, entra só uma foto do mesmo serviço, marcada "nova · confira"; o resto fica igual.
        <div class="row" style="margin-top:6px">${(PIN.novas||[]).length ? `<button type="button" class="small" id="btnPinSeen">Já conferi as ${(PIN.novas||[]).length} nova(s)</button>` : ""}<button type="button" class="small" id="btnUnpin">Destravar e recalcular</button></div></div>`
    : `<div class="msg"><b>Vai revisar e corrigir fotos?</b> Fixe a seleção antes: assim, quando você tirar uma foto ou trocar o serviço, só entra uma foto no lugar dela (do mesmo serviço) e nada mais muda no relatório. <button type="button" class="small primary" id="btnPin">Fixar a seleção desta aba</button></div>`;
  let diasMsg = "";
  if (base!=="?" && rep.some(r=>r.sel.length)){ const D = daysInfo(rep); if (D.disp > 1) diasMsg = `<div class="msg ${D.sel < D.disp ? "" : "ok"}">Dias no relatório: <b>${D.sel}</b> de ${D.disp} dia(s) com foto no período.${D.sel < D.disp ? " Para entrar mais dias, aumente as páginas: cada foto a mais de um dia que faltou é aproveitada." : ""}</div>`; }
  let geoMsg = "";
  if (base!=="?"){ const all = rep.flatMap(r=>r.sel), sem = all.filter(x=>x.i.lat==null).length;
    if (all.length) geoMsg = `<div class="msg ${sem?"warn":"ok"}"><b>${all.length}</b> papeleira(s) no relatório (1 foto = 1 papeleira) · <b>${all.length-sem}</b> georreferenciada(s)${sem?` · <b>${sem}</b> sem coordenada: não entram no mapa. Clique na foto (selo "sem coordenada") e cole a coordenada do Google Maps ou do carimbo.`:"."}</div>`; }
  $("#review").innerHTML = banner + geoMsg + dupMsg + foraMsg + ruasNovasHtml() + resumo + html;
  renderBulk();
  const kb = QUALITY[S.cfg.quality] ? {leve:40,padrao:60,alta:110}[S.cfg.quality] : 60;
  $("#pdfStat").textContent = base==="?" ? "" : `${totalSel} papeleiras · ≈${pages + Math.ceil(0)} páginas · ≈${Math.max(1,Math.round((totalSel*kb+200)/1024))} MB`;
  // miniaturas sob demanda
  const job = ++thumbJob;
  (async()=>{ for (const el of [...document.querySelectorAll("#review .card")]){ if (job!==thumbJob) return; const x = {p: S.photos.find(q=>q.id===+el.dataset.pid)}; if (x.p && !x.p.thumb){ await ensureThumb(x.p); const im = document.querySelector(`.card[data-pid="${x.p.id}"] .ph`); if (im && x.p.thumb) im.innerHTML = `<img src="${x.p.thumb}" alt="">`; } } })();
}

// ---------- listas de ruas e bairros: sugestões, importação e resumo ----------
// ---------- aprendizado de ruas ----------
const RUA_TIPO_RE = /^(rua|r\.|av\.?|avenida|tv\.?|travessa|passagem|pass\.?|alameda|al\.|rodovia|rod\.?|pra[cç]a|largo|vila|viela|estrada|boulevard|blvd\.?|beco|conjunto|ladeira|residencial)\s+\S/i;
// quando você corrige a rua de uma foto, guarda "o que o leitor leu → o nome certo" e aplica nas outras fotos com a mesma leitura
function learnRuaFix(p, nova){
  const lido = p.ocr && p.ocr.logradouro; if (!lido || !nova) return;
  nova = nova.trim(); const kl = streetKey(lido, true), kn = streetKey(nova, true);
  if (!kl || kl.length < 5 || kl === kn || !RUA_TIPO_RE.test(nova) || LISTAS.isLixo(nova)) return;
  // só aprende quando é a mesma rua lida errado/cortada, não quando a foto era de outra rua
  if (!(kn.startsWith(kl) || sim(kl, kn) >= .6)) return;
  const r = LISTAS.rua(nova), nome = r && r.status !== "fora" && r.nome ? r.nome : nova;
  S.cfg.ruasFix[kl] = nome;
  if (!LISTAS.ruas().some(x=>x.nome===nome)) S.cfg.ruasExtras.push(nome);
  saveCfg(); LISTAS.build(S.cfg.ruasExtras, S.cfg.ruasFix); fillDatalists();
}
// ruas lidas em várias fotos que não estão na lista: sugere para você confirmar
function ruasNovas(){
  const m = new Map();
  for (const p of S.photos){
    if ((p.status!=="ok" && p.status!=="manual") || !p.ocr || !p.ocr.logradouro || p.dupOf || p.include===false) continue;
    const raw = p.ocr.logradouro.trim(); if (!RUA_TIPO_RE.test(raw) || raw.length > 60) continue;
    const r = LISTAS.rua(raw); if (!r || r.status !== "fora") continue;
    const k = streetKey(raw, true); if (k.split(" ").length < 2 || S.cfg.ruasIgn.includes(k)) continue;
    if (!m.has(k)) m.set(k, {k, n:0, nomes:new Map()});
    const x = m.get(k); x.n++; x.nomes.set(raw, (x.nomes.get(raw)||0)+1);
  }
  return [...m.values()].filter(x=>x.n>=3).map(x=>({k:x.k, n:x.n, nome:[...x.nomes].sort((a,b)=>b[1]-a[1])[0][0]})).sort((a,b)=>b.n-a.n).slice(0,40);
}
function ruasNovasHtml(){
  const L = ruasNovas(); if (!L.length) return "";
  return `<details class="more" id="rnBox" ${S.rnOpen?"open":""}><summary>Ruas novas encontradas nas fotos (${L.length}) · confirme para a leitura passar a reconhecer</summary>
    <div class="msg" style="margin-top:8px">Estas ruas apareceram em 3 ou mais fotos mas não estão na lista de Belém. Corrija o nome se precisar e clique em Adicionar. Se for erro de leitura de uma rua que já existe, escreva o nome certo: as outras fotos com a mesma leitura são corrigidas também.</div>
    <div class="tbl-wrap"><table class="bt">${L.map(x=>`<tr><td><input data-rnname="${esc(x.k)}" value="${esc(x.nome)}" aria-label="Nome da rua" style="width:100%;min-width:220px"></td><td>${x.n} foto(s)</td><td><button type="button" class="small primary" data-rnadd="${esc(x.k)}">Adicionar</button> <button type="button" class="small" data-rnign="${esc(x.k)}">Ignorar</button></td></tr>`).join("")}</table></div>
    <div class="row"><button type="button" class="small" data-rnall="1">Adicionar todas como estão</button></div></details>`;
}
function rnAdd(k, nome){
  nome = String(nome||"").trim(); if (!nome) return;
  const r = LISTAS.rua(nome), certo = r && r.status !== "fora" && r.nome ? r.nome : nome;
  if (certo !== nome || streetKey(certo, true) !== k) S.cfg.ruasFix[k] = certo;
  if (!LISTAS.ruas().some(x=>x.nome===certo)) S.cfg.ruasExtras.push(certo);
}
function exportRuas(){
  const data = {tipo:"ruas-belem-limpa", versao:1, ruasExtras:S.cfg.ruasExtras, ruasFix:S.cfg.ruasFix, ruasIgn:S.cfg.ruasIgn};
  return savePdf(new Blob([JSON.stringify(data, null, 1)], {type:"application/json"}), "ruas-aprendidas-belem-limpa.json");
}
function fillDatalists(){
  const dr = $("#dlRuas"), db = $("#dlBairros"); if (!dr || !db) return;
  dr.innerHTML = LISTAS.ruas().map(r=>`<option value="${esc(r.nome)}"></option>`).join("");
  db.innerHTML = BAIRROS_OFICIAIS.map(b=>`<option value="${esc(b[0])}"></option>`).join("");
  const c = $("#listasInfo"); if (c) c.textContent = `${LISTAS.ruas().length} ruas e ${BAIRROS_OFICIAIS.length} bairros oficiais${S.cfg.ruasExtras.length?` (${S.cfg.ruasExtras.length} ruas adicionadas por você)`:""}${Object.keys(S.cfg.ruasFix).length?` · ${Object.keys(S.cfg.ruasFix).length} correção(ões) de leitura aprendida(s)`:""}.`;
}
async function importRuas(files){
  const out = [], typeRe = /^(rua|r\.|av\.?|avenida|tv\.?|travessa|passagem|pass\.?|alameda|al\.|rodovia|rod\.?|pra[cç]a|largo|vila|viela|estrada|boulevard|blvd\.?|beco|conjunto|ladeira|residencial|jardim)\s+\S/i;
  for (const f of files){
    let strs = [];
    if (/\.json$/i.test(f.name)){
      try { const j = JSON.parse(await f.text()); if (j && j.tipo === "ruas-belem-limpa"){ out.push(...(j.ruasExtras||[])); Object.assign(S.cfg.ruasFix, j.ruasFix||{}); S.cfg.ruasIgn = [...new Set([...S.cfg.ruasIgn, ...(j.ruasIgn||[])])]; } } catch(e){}
      continue;
    }
    if (/\.xlsx$/i.test(f.name)){
      const zr = new zip.ZipReader(new zip.BlobReader(f)); const es = await zr.getEntries();
      for (const e of es){ if (/sharedStrings\.xml$|worksheets\/sheet\d+\.xml$/.test(e.filename)){ const x = await e.getData(new zip.TextWriter()); for (const m of x.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) strs.push(m[1].replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'")); } }
    } else { strs = (await f.text()).split(/\r?\n/).map(l=>l.split(/[;\t]/)[0].replace(/^"|"$/g,"")); }
    for (const s0 of strs){ const s1 = s0.trim(); if (typeRe.test(s1) && s1.length < 90 && !LISTAS.isLixo(s1)) out.push(s1); }
  }
  const before = LISTAS.ruas().length;
  S.cfg.ruasExtras = [...new Set([...S.cfg.ruasExtras, ...out])]; saveCfg(); refreshAll(true); LISTAS.build(S.cfg.ruasExtras, S.cfg.ruasFix); fillDatalists();
  $("#listasMsg").innerHTML = `<div class="msg ok">${LISTAS.ruas().length - before} rua(s) nova(s) adicionada(s) à lista (${out.length} lida(s) do arquivo).</div>`;
  refreshAll(true);
}
function listasResumo(photos){
  if (S.cfg.verify === false) return "";
  let cor = 0, fora = 0, lixo = 0;
  for (const p of photos){ const c = info(p).chk; if (!c) continue; if (c.rua==="corrigida"||c.bairro==="corrigida") cor++; if (c.rua==="fora"||c.bairro==="fora") fora++; if (c.rua==="lixo") lixo++; }
  if (!cor && !fora && !lixo) return "";
  return `<div class="msg">Conferência com as listas de Belém: <b>${cor}</b> foto(s) com rua ou bairro corrigidos${fora?` · <b>${fora}</b> com rua ou bairro fora da lista (selo amarelo, confira)`:""}${lixo?` · <b>${lixo}</b> texto(s) que não eram rua descartados (ex.: "Equipe mutirão")`:""}.</div>`;
}

// ---------- ações em lote ----------
function saveEdit(p){ IDB.set(p.hash + "|edit", {edit:p.edit, include:p.include, aiService:p.aiService||null, aiConf:p.aiConf||null, aiBy:p.aiBy||null, aiOver:!!p.aiOver, aiChecked:!!p.aiChecked}); }
function setInclude(ids, val){ for (const id of ids){ const p = S.photos.find(x=>x.id===id); if (p){ p.include = val; saveEdit(p); } } refreshAll(true); }
function renderBulk(){
  const el = $("#bulk"); if (!el) return;
  const n = [...S.sel].filter(id=>S.photos.some(p=>p.id===id)).length;
  el.hidden = !n; if (!n) return;
  el.innerHTML = `<b>${n} foto(s) marcada(s)</b>
    <label class="f" for="bkBase">Base<select id="bkBase"><option value="">Escolha…</option><option value="S">Base Sul</option><option value="N">Base Norte</option></select></label>
    <button type="button" class="small" data-bk="base">Aplicar base</button>
    <button type="button" class="small" data-bk="out">Tirar do relatório</button>
    <button type="button" class="small" data-bk="in">Incluir sempre</button>
    <button type="button" class="small" data-bk="clear">Desmarcar</button>`;
}
function bulkClick(e){
  const k = e.target.dataset && e.target.dataset.bk; if (!k) return;
  const ps = S.photos.filter(p=>S.sel.has(p.id));
  if (k==="svc"){ const v = $("#bkSvc").value; if (!v){ $("#bkSvc").focus(); return; } ps.forEach(p=>{ if (v===UNK){ setNoService(p); return; } lrnFeedback(p, v); p.edit.servico = v; saveEdit(p); }); }
  if (k==="base"){ const v = $("#bkBase").value; if (!v){ $("#bkBase").focus(); return; } ps.forEach(p=>{ p.edit.base = v; saveEdit(p); }); }
  if (k==="out") ps.forEach(p=>{ p.include = false; saveEdit(p); });
  if (k==="in") ps.forEach(p=>{ if (p.ocr && p.ocr._fora){ p.ocr._fora = null; IDB.set(p.hash+"|ocr", {...p.ocr, _text:p.ocrText}); p.dupOf = null; return; } p.include = true; p.dupOf = null; saveEdit(p); });
  S.sel.clear(); refreshAll(true);
}

// ---------- fotos repetidas (imagem quase igual) ----------
async function dhash(blob){
  let bmp;
  try { bmp = await createImageBitmap(blob, {resizeWidth:9, resizeHeight:8, resizeQuality:"medium"}); }
  catch(e){ bmp = await decode(blob); }
  const c = document.createElement("canvas"); c.width = 9; c.height = 8; const g = c.getContext("2d", {willReadFrequently:true});
  g.drawImage(bmp, 0, 0, 9, 8); if (bmp.close) bmp.close();
  const d = g.getImageData(0,0,9,8).data, gray = [];
  for (let i=0;i<d.length;i+=4) gray.push(d[i]*.299 + d[i+1]*.587 + d[i+2]*.114);
  let a = 0, b = 0;
  for (let y=0;y<8;y++) for (let x=0;x<8;x++){ const bit = gray[y*9+x] > gray[y*9+x+1] ? 1 : 0, k = y*8+x; if (k<32) a = (a | (bit<<k))>>>0; else b = (b | (bit<<(k-32)))>>>0; }
  return [a, b];
}
const popc = v => { v = v - ((v>>>1) & 0x55555555); v = (v & 0x33333333) + ((v>>>2) & 0x33333333); return (((v + (v>>>4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
let dupRunning = false;
async function findDuplicates(){
  if (dupRunning) return; dupRunning = true;
  try {
    let cand = S.photos.filter(p=>p.status==="ok");
    const man = S.photos.filter(p=>p.status==="manual"); if (man.length <= 3000) cand = cand.concat(man);
    let k = 0;
    for (const p of cand){ if (!p.dh){ try { p.dh = await dhash(await blobOf(p)); } catch(e){ p.dh = null; } if (++k % 50 === 0) setMsg("#readMsg","",`Procurando fotos repetidas… ${k} de ${cand.length}`); } }
    const ps = cand.filter(p=>p.dh);
    ps.forEach(p=>p.dupOf = null);
    const parent = new Map(ps.map(p=>[p.id,p.id])), find = id => { while (parent.get(id)!==id) id = parent.get(id); return id; };
    for (let i=0;i<ps.length;i++) for (let j=i+1;j<ps.length;j++){
      const d = popc(ps[i].dh[0]^ps[j].dh[0]) + popc(ps[i].dh[1]^ps[j].dh[1]);
      if (d<=5) parent.set(find(ps[j].id), find(ps[i].id));
    }
    const grp = new Map(); for (const p of ps){ const r = find(p.id); if (!grp.has(r)) grp.set(r, []); grp.get(r).push(p); }
    const score = p => (p.include===true?1000:0) + (p.ocr && p.ocr.carimbo ? 100 : 0) + (p.ocr && p.ocr.logradouro ? 50 : 0) + (p.size||0)/1e6;
    for (const g of grp.values()){ if (g.length<2) continue; g.sort((a,b)=>score(b)-score(a)); for (const p of g.slice(1)) if (p.include!==true) p.dupOf = g[0].id; }
  } finally { dupRunning = false; }
  refreshAll(true);
}

// ---------- sugestão de serviço pela IA (opcional, só quando o usuário pede) ----------
async function suggestServicesAI(){
  if (!S.sample || ENV.images!==true) return;
  const rep = report(S.tab).find(r=>r.service===UNK); if (!rep) return;
  const list = rep.all.filter(x=>x.p.include!==false && !x.p.dupOf).map(x=>x.p);
  const btn = $("#btnAiSvc"); if (btn) btn.disabled = true;
  const opts = services().filter(s=>!/dividir/i.test(s.name)).map(s=>s.name);
  const per = Math.max(1, Math.min(ENV.imgMax || 4, 6));
  let done = 0, got = 0, err = "";
  const ctl = new AbortController();
  for (let i=0;i<list.length;i+=per){
    const b = list.slice(i,i+per);
    setMsg("#pdfMsg","",`A IA está olhando as fotos: ${done} de ${list.length}…`);
    try {
      const imgs = await Promise.all(b.map(async p=>scaled(await blobOf(p), 640, .75, "blob")));
      const res = await S.sample.json(`Estas ${b.length} fotos mostram equipes de limpeza urbana em Belém-PA. Para cada foto, na ordem, diga qual serviço está sendo executado, escolhendo EXATAMENTE um destes nomes: ${opts.join("; ")}. Se não der para saber pela imagem, use null. Responda só com um array JSON: [{"i":1,"servico":"Varrição"}]`, {images:imgs, modelTier:"quick", signal:ctl.signal});
      const arr = Array.isArray(res) ? res : [];
      b.forEach((p,k)=>{ const r = arr.find(x=>+x.i===k+1) || arr[k]; const sv = r && matchService(r.servico); if (sv){ p.aiService = sv; saveEdit(p); got++; } });
    } catch(e){ err = errText(e); if (e && ["not_granted","sampling_disabled","rate_limited","images_unavailable","session_expired"].includes(e.code)) break; }
    done += b.length; refreshAll(true);
  }
  setMsg("#pdfMsg", got?"ok":"warn", `A IA sugeriu o serviço de ${got} de ${list.length} foto(s).${err?" Último erro: "+esc(err):""} Confira o selo "serviço pela IA" nos cartões.`);
}

// ---------- edição de uma foto ----------
async function openEditor(pid){
  const p = S.photos.find(x=>x.id===pid); if (!p) return;
  const i = info(p), o = p.ocr || {};
  const dlg = $("#dlg");
  dlg.innerHTML = `<form method="dialog" class="dlg" id="edForm">
    <div><img id="edImg" alt="Foto" src="${p.thumb||""}">
      <div class="raw" style="margin-top:8px">Lido no carimbo: ${esc([o.app, o.data, o.hora, [o.logradouro,o.numero].filter(Boolean).join(", "), o.bairro, o.cep, o.responsavel, o.utm, (o.lat!=null?o.lat+", "+o.lon:"")].filter(Boolean).join(" · ") || "nada")}
WhatsApp: ${esc([p.wa.sender, p.wa.date?fmtD(p.wa.date)+" "+pad(p.wa.date.getHours())+":"+pad(p.wa.date.getMinutes()):"", p.wa.caption].filter(Boolean).join(" · ") || "sem dados")}
Arquivo: ${esc(p.name)} · base definida por: ${esc(i.baseSrc||"-")}</div></div>
    <div class="fields">
      <div class="row" style="justify-content:space-between"><b>Editar foto</b><button value="cancel" class="small" type="submit">Fechar</button></div>
      <div class="grid-form" style="grid-template-columns:1fr 1fr">
        <label class="f" for="edData">Data<input id="edData" value="${esc(fmtD(i.date))}" placeholder="DD/MM/AAAA"></label>
        <label class="f" for="edHora">Hora<input id="edHora" value="${esc(i.time)}" placeholder="HH:MM"></label></div>
      <label class="f" for="edTitulo">Local (linha em negrito)<input id="edTitulo" list="dlRuas" value="${esc(i.titulo)}"></label>
      <label class="f" for="edEnd">Endereço<input id="edEnd" value="${esc(i.endereco)}"></label>
      <label class="f" for="edBairro">Bairro (lista oficial de Belém)<input id="edBairro" list="dlBairros" value="${esc(i.bairroNome||"")}"></label>
      <label class="f" for="edReg">Registro (quem fez a foto · vazio = não aparece)<input id="edReg" value="${esc(i.registro)}"></label>
      ${S.cfg.desc?`<label class="f" for="edDesc">Descrição<input id="edDesc" value="${esc(i.descricao)}"></label>`:""}
      <div class="grid-form" style="grid-template-columns:1fr 1fr">
        <label class="f" for="edBase">Base<select id="edBase"><option value="">${esc("Automática ("+BASE_NAME[i.base]+")")}</option><option value="S" ${p.edit.base==="S"?"selected":""}>Base Sul</option><option value="N" ${p.edit.base==="N"?"selected":""}>Base Norte</option></select></label>
        <label class="f" for="edCoord">Coordenada (lat, long)<input id="edCoord" value="${esc(i.lat!=null ? fmtCoord(i.lat)+", "+fmtCoord(i.lon) : "")}" placeholder="-1.450626, -48.501717"><small>${i.lat!=null ? "Origem: "+esc(i.coordSrc) : "Cole do Google Maps, do carimbo ou UTM 22M"}</small></label></div>
      <label class="f" for="edInc">No relatório<select id="edInc">
        <option value="auto" ${p.include===null?"selected":""}>Automático (a ferramenta decide)</option>
        <option value="yes" ${p.include===true?"selected":""}>Sempre incluir</option>
        <option value="no" ${p.include===false?"selected":""}>Nunca incluir</option></select></label>
      <div class="row"><button class="primary" value="save" type="submit">Salvar</button><button class="small" type="button" id="edReset">Voltar ao que foi lido</button><button class="small" type="button" id="edHP">Reler com alta precisão</button></div><div id="edMsg"></div>
    </div></form>`;
  dlg.showModal();
  blobOf(p).then(b=>scaled(b, 1100, .82)).then(r=>{ const im = $("#edImg"); if (im) im.src = r.url; }).catch(()=>{});
  $("#edHP").onclick = async () => {
    const b = $("#edHP"); b.disabled = true; $("#edMsg").innerHTML = `<div class="msg">Relendo com alta precisão… (na primeira vez baixa uns 26 MB)</div>`;
    try { await HP.init(t=>{ const m = $("#edMsg"); if (m) m.innerHTML = `<div class="msg">${esc(t)}</div>`; }); if (!p.ocr) p.ocr = {}; await hpRead(p); IDB.set(p.hash+"|ocr", {...p.ocr, _text:p.ocrText}); dlg.close(); refreshAll(); openEditor(p.id); }
    catch(e){ b.disabled = false; $("#edMsg").innerHTML = `<div class="msg bad">Não consegui reler: ${esc(e && e.message || e)}</div>`; }
  };
  $("#edReset").onclick = () => { p.edit = {}; p.include = null; p.aiService = null; p.aiConf = null; p.aiBy = null; saveEdit(p); dlg.close(); refreshAll(); };
  dlg.onclose = () => {
    if (dlg.returnValue!=="save") return;
    const v = id => { const el = $(id); return el ? el.value.trim() : undefined; };
    const e = p.edit, cur = info(p);
    const setIf = (k, val, curVal) => { if (val!==undefined && val!==curVal) e[k] = val; };
    setIf("data", v("#edData"), fmtD(cur.date)); setIf("hora", v("#edHora"), cur.time);
    setIf("titulo", v("#edTitulo"), cur.titulo); setIf("endereco", v("#edEnd"), cur.endereco); setIf("registro", v("#edReg"), cur.registro);
    const nb = v("#edBairro"); if (nb !== undefined && nb !== (cur.bairroNome||"")) e.bairro = nb ? ((LISTAS.bairro(nb)||{}).nome || nb) : "";
    // ruas digitadas que não estão na lista passam a fazer parte dela (neste navegador)
    for (const cand of [e.titulo, e.endereco && e.endereco.split(/,|\s[–-]\s/)[0]]){
      if (cand && /^(rua|r\.|av|avenida|tv|travessa|passagem|alameda|rodovia|pra[cç]a|largo|vila|viela|estrada|boulevard|beco|conjunto)\b/i.test(cand) && !LISTAS.isLixo(cand) && LISTAS.rua(cand).status === "fora"){
        S.cfg.ruasExtras.push(cand.trim()); saveCfg(); LISTAS.build(S.cfg.ruasExtras, S.cfg.ruasFix); fillDatalists();
      }
    }
    learnRuaFix(p, (e.endereco && e.endereco.split(/,|\s[–-]\s/)[0]) || e.titulo);
    if (S.cfg.desc) setIf("descricao", v("#edDesc"), cur.descricao);
    e.base = v("#edBase") || undefined;
    const cIn = v("#edCoord"), curC = cur.lat!=null ? fmtCoord(cur.lat)+", "+fmtCoord(cur.lon) : "";
    if (cIn !== undefined && cIn !== curC){
      if (!cIn){ delete e.lat; delete e.lon; }
      else { const c = parseCoordInput(cIn); if (c){ e.lat = c.lat; e.lon = c.lon; } else setMsg("#pdfMsg","warn",`Coordenada não reconhecida em ${esc(p.name)}: "${esc(cIn)}". Use o formato -1.450626, -48.501717 (precisa ser em Belém).`); }
    }
    const inc = v("#edInc"); p.include = inc==="yes" ? true : inc==="no" ? false : null;
    saveEdit(p); refreshAll();
  };
}

// ---------- PDF ----------
const C = { leaf:[143,191,37], forest:[0,102,51], water:[11,117,186], ink:[43,43,43], gray:[107,107,107], soft:[241,245,238], rule:[201,211,194] };
const WEEKDAYS = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const isoToBR = s => s ? s.split("-").reverse().join("/") : "";
function periodKind(){ const c = S.cfg; if (c.period==="dia" && c.day) return "dia"; if (c.period==="intervalo" && c.from && c.to) return "intervalo"; return "mes"; }
function inPeriod(d){
  if (!d) return true;
  const k = periodKind(), c = S.cfg;
  if (k==="dia") return ymd(d) === c.day;
  if (k==="intervalo"){ const x = ymd(d); return x >= c.from && x <= c.to; }
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}` === c.month;
}
function periodLabel(){
  const k = periodKind(), c = S.cfg;
  if (k==="dia") return isoToBR(c.day);
  if (k==="intervalo") return `${isoToBR(c.from).slice(0,5)} a ${isoToBR(c.to)}`;
  const [y,m] = c.month.split("-").map(Number); return `${MONTHS[m-1]}/${y}`;
}
function periodLong(){
  if (periodKind()==="dia"){ const [y,m,d] = S.cfg.day.split("-").map(Number); return `${MONTHS[m-1]}/${y} · ${pad(d)}/${pad(m)}`; }
  return periodLabel();
}
// linha "Período" da capa e das seções: "Setembro/2026 · 29/09" quando as fotos são de um dia só
function periodRow(dates){
  if (periodKind()==="dia") return periodLong();
  if (!dates.length) return periodLabel();
  const a = fmtD(dates[0]).slice(0,5), b = fmtD(dates[dates.length-1]).slice(0,5);
  const mes = periodKind()==="mes" ? periodLabel() : `${MONTHS[dates[0].getMonth()]}/${dates[0].getFullYear()}`;
  return a === b ? `${mes} · ${a}` : `${mes} · ${a} a ${b}`;
}
function periodTag(){ const k = periodKind(), c = S.cfg; if (k==="dia") return isoToBR(c.day).replace(/\//g,"-"); if (k==="intervalo") return isoToBR(c.from).replace(/\//g,"-") + " a " + isoToBR(c.to).replace(/\//g,"-"); return c.month.split("-").reverse().join("-"); }
function newDoc(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:"pt", format:"a4", compress:true});
  doc.addFileToVFS("Poppins-Regular.ttf", ASSETS.fontR); doc.addFont("Poppins-Regular.ttf","Poppins","normal");
  doc.addFileToVFS("Poppins-Bold.ttf", ASSETS.fontB); doc.addFont("Poppins-Bold.ttf","Poppins","bold");
  doc.setFont("Poppins","normal");
  return doc;
}
function T(doc, txt, x, y, {size=10, bold=false, color=C.ink, cs=0, align="left"}={}){
  doc.setFont("Poppins", bold?"bold":"normal"); doc.setFontSize(size); doc.setTextColor(...color);
  doc.text(String(txt), x, y, {charSpace:cs, align, baseline:"alphabetic"});
  return doc.getTextWidth(String(txt)) + cs*String(txt).length;
}
function fit(doc, txt, w, size, bold){ doc.setFont("Poppins", bold?"bold":"normal"); doc.setFontSize(size); let s = String(txt||""); if (doc.getTextWidth(s)<=w) return s; while (s.length>1 && doc.getTextWidth(s+"…")>w) s = s.slice(0,-1); return s.trimEnd()+"…"; }
function tricolor(doc, x, y, w, h){ const s=w/3; doc.setFillColor(...C.leaf); doc.rect(x,y,s,h,"F"); doc.setFillColor(...C.forest); doc.rect(x+s,y,s,h,"F"); doc.setFillColor(...C.water); doc.rect(x+2*s,y,w-2*s,h,"F"); }
function infoTable(doc, top, rows){
  let y = top;
  for (const [label, value, boldVal] of rows){
    doc.setFont("Poppins", boldVal?"bold":"normal"); doc.setFontSize(10);
    const lines = doc.splitTextToSize(String(value), 230);
    const h = 26.7 + (lines.length-1)*15;
    doc.setFillColor(...C.soft); doc.rect(62.4, y, 354.4, h, "F");
    T(doc, label.toUpperCase(), 72.5, y+14.2, {size:7.5, bold:true, color:C.forest, cs:1});
    lines.forEach((ln,k)=>T(doc, ln, 178.2, y+17.05+k*15, {size:10, bold:boldVal}));
    doc.setDrawColor(255,255,255); doc.setLineWidth(.75); doc.line(62.4, y+h+.4, 416.8, y+h+.4);
    y += h;
  }
  return y;
}
function brandFooter(doc, top){
  doc.addImage(ASSETS.logoPref, "PNG", 62.4, top, 138.7, 48, "pref");
  doc.setDrawColor(...C.rule); doc.setLineWidth(1); doc.line(221.1, top, 221.1, top+48);
  T(doc, "Concessionária Belém Limpa", 237.2, top+20.9, {size:9.5, bold:true, color:C.forest});
  T(doc, "Uma empresa do grupo Sustentare", 237.2, top+35.3, {size:8, color:C.gray});
  tricolor(doc, 62.4, top+62, 493.5, 5.2);
}
function bgLeaf(doc){ doc.addImage(ASSETS.bg, "PNG", 402.8, 119.2, 269.2, 629.3, "bg"); }

function coverPage(doc, base, reps){
  bgLeaf(doc);
  doc.addImage(ASSETS.logoBL, "PNG", 62.4, 62.3, 204, 74.3, "bl");
  doc.setFillColor(...C.leaf); doc.rect(62.4, 217.2, 25.4, 2.3, "F");
  T(doc, "RELATÓRIO DE INSTALAÇÃO", 88, 219.5, {size:8, bold:true, color:C.forest, cs:1.5});
  T(doc, "Instalação de", 62.5, 274.8, {size:36, color:C.leaf});
  T(doc, "Papeleiras", 62.5, 328.8, {size:36, bold:true, color:C.forest});
  doc.setFillColor(...C.leaf); doc.rect(62.4, 353.3, 101.9, 3, "F");
  T(doc, `${BASE_NAME[base]} · ${periodLabel()}`, 62.5, 405.6, {size:15, bold:true, color:C.forest});
  T(doc, `Registro fotográfico e georreferenciado das papeleiras instaladas ${pelaBase(base)} em Belém.`, 62.5, 426.4, {size:10, color:C.gray});
  const all = reps.flatMap(r=>r.sel), dates = all.map(x=>x.i.date).filter(Boolean).sort((a,b)=>a-b);
  const bairros = new Set(all.map(x=>x.i.bairroN).filter(Boolean)).size, streets = new Set(all.map(x=>x.i.street).filter(Boolean)).size;
  const rows = [
    ["Período", periodRow(dates), true],
    ["Ponto de saída", saidaBase(base)],
    ["Serviço", PAP],
    ["Papeleiras", `${all.length} instalada(s)`, true],
    ...(streets||bairros ? [["Locais", `${streets} logradouros · ${bairros} bairros`]] : []),
    ["Georreferenciadas", `${all.filter(x=>x.i.lat!=null).length} de ${all.length} (lat/long WGS 84 · UTM SIRGAS 2000 22S)`],
  ];
  if (S.cfg.author) rows.push(["Elaborado por", S.cfg.author]);
  infoTable(doc, 453.8, rows);
  brandFooter(doc, 730.9);
}
function sectionPage(doc, n, r, base){
  bgLeaf(doc);
  doc.addImage(ASSETS.logoBL, "PNG", 62.4, 62.3, 147.7, 53.3, "bl");
  T(doc, pad(n), 62.5, 264, {size:55, bold:true, color:C.leaf});
  doc.setFillColor(...C.leaf); doc.rect(62.4, 290.1, 25.4, 2.2, "F");
  T(doc, `SEÇÃO ${pad(n)}`, 88, 292.4, {size:8, bold:true, color:C.forest, cs:1.5});
  doc.setFont("Poppins","bold"); doc.setFontSize(22);
  const lines = doc.splitTextToSize(svcTitle(r.service), 400).slice(0,3);
  lines.forEach((ln,k)=>T(doc, ln, 62.5, 333.45+k*33, {size:22, bold:true, color:C.forest}));
  const barY = 333.45 + (lines.length-1)*33 + 20.7;
  doc.setFillColor(...C.leaf); doc.rect(62.4, barY, 101.9, 3, "F");
  const dates = r.sel.map(x=>x.i.date).filter(Boolean).sort((a,b)=>a-b);
  const days = new Set(dates.map(d=>d.getDate())).size;
  const turnos = new Set(r.sel.map(x=>{ const h=+(x.i.time||"12").slice(0,2); return (h>=18||h<5)?"Noturno":"Diurno"; }));
  infoTable(doc, barY+39.1, [
    ["Período", periodRow(dates), true],
    ["Turno", [...turnos].sort().join(" e ")],
    ["Base", base==="A" ? (()=>{ const c = {S:0,N:0,"?":0}; r.sel.forEach(x=>c[x.i.base]=(c[x.i.base]||0)+1); return [c.N?`Norte (${c.N})`:"", c.S?`Sul (${c.S})`:"", c["?"]?`sem base (${c["?"]})`:""].filter(Boolean).join(" · ") || "Norte e Sul"; })() : BASE_NAME[base]],
    ...((()=>{ const a = new Set(r.sel.map(x=>x.i.street).filter(Boolean)).size, b = new Set(r.sel.map(x=>x.i.bairroN).filter(Boolean)).size; return a||b ? [["Locais", `${a} logradouros · ${b} bairros`]] : []; })()),
    ["Registros", `${r.sel.length} fotos · ${days} dia(s)`],
  ]);
  brandFooter(doc, 712.9);
}
const SLOTS = [[51.1,124.2],[304.8,124.2],[51.1,436.1],[304.8,436.1]];
// lê a foto para o PDF; se falhar, tenta de novo menor e, em último caso, usa a miniatura (e avisa no fim)
const PDF_FAIL = [];
async function photoForPdf(p, qa){
  let err;
  for (const [px, q, wait] of [[qa.px, qa.q, 0], [Math.round(qa.px*.75), qa.q, 400]]){
    try { if (wait) await new Promise(r=>setTimeout(r, wait)); return await scaled(await blobOf(p), px, q); }
    catch(e){ err = e; }
  }
  PDF_FAIL.push({p, err});
  if (p.thumb){ const im = await new Promise((res,rej)=>{ const i = new Image(); i.onload=()=>res(i); i.onerror=rej; i.src = p.thumb; }); return {url:p.thumb, w:im.width, h:im.height, low:true}; }
  throw err;
}
function pdfFailMsg(){
  if (!PDF_FAIL.length) return "";
  const e = PDF_FAIL[0].err, nm = e && (e.name||"") + " " + (e.message||"");
  const lost = /NotReadable|NotFound|could not be read|permission/i.test(nm);
  const lotes = [...new Set(PDF_FAIL.map(f=>(S.lotes.find(l=>l.id===f.p.loteId)||{}).name).filter(Boolean))];
  return `<br><b>${PDF_FAIL.length} foto(s) não puderam ser lidas</b>${PDF_FAIL.some(f=>f.p.thumb)?" e entraram em baixa resolução (miniatura)":""}. ${lost ? `O navegador perdeu o acesso ao arquivo de origem (${esc(lotes.join(", "))}): ele foi movido, renomeado ou apagado depois de importado. Remova esse lote no passo 2, adicione o arquivo de novo e gere outra vez.` : `Motivo: ${esc(nm.trim()||"desconhecido")}. Se for um relatório muito grande, feche outras abas e tente de novo, ou marque "Um PDF por serviço".`}`;
}
async function photoPage(doc, r, items, startNum, base){
  doc.addImage(ASSETS.logoBL, "PNG", 56.45, 31.2, 124.5, 45, "bl");
  doc.addImage(ASSETS.logoPref, "PNG", 428.65, 34.5, 110.25, 38.25, "pref");
  doc.setFillColor(...C.soft); doc.rect(52.6, 97.2, 493.15, 21, "F");
  doc.setDrawColor(...C.leaf); doc.setLineWidth(3); doc.line(52.6, 97.2, 52.6, 118.2);
  let x = 61.65; x += T(doc, "INSTALAÇÃO DE PAPELEIRAS", x, 110.9, {size:8, bold:true, color:C.forest, cs:1});
  T(doc, fit(doc, "  ·  Registro fotográfico", 200, 8, false), x, 110.9, {size:8});
  const right = "  ·  " + BASE_NAME[base];
  doc.setFont("Poppins","normal"); doc.setFontSize(8); const wR = doc.getTextWidth(right);
  T(doc, right, 537.2 - wR, 110.9, {size:8});
  T(doc, periodLabel(), 537.2 - wR, 110.9, {size:8, bold:true, align:"right"});
  const six = ppp() === 6;
  const descH = S.cfg.desc ? (six ? 12 : 16) : 0;
  const qa = QUALITY[S.cfg.quality] || QUALITY.padrao;
  for (let k=0;k<items.length;k++){
    const {p,i} = items[k];
    const [bx,by] = six ? [k%2 ? 304.8 : 51.1, 124.2 + Math.floor(k/2)*217] : SLOTS[k];
    const bw = 239.35, bh = (six ? 161 : 255.1) - descH;
    doc.setFillColor(...C.soft); doc.rect(bx, by, bw, bh, "F");
    try {
      const im = await photoForPdf(p, qa);
      const s = Math.min(bw/im.w, bh/im.h), w = im.w*s, h = im.h*s;
      doc.addImage(im.url, "JPEG", bx+(bw-w)/2, by+(bh-h)/2, w, h, "p"+p.id, "NONE");
    } catch(e){ T(doc, "Imagem indisponível", bx+bw/2, by+bh/2, {size:8, color:C.gray, align:"center"}); }
    doc.setDrawColor(...C.leaf); doc.setLineWidth(1.5); doc.line(bx, by+bh+.8, bx+bw+.1, by+bh+.8);
    let y = by + bh + 15.1;
    const label = `PAPELEIRA ${papCod(base, startNum+k)}`;
    const wl = T(doc, label, bx, y, {size:7.5, bold:true, color:C.forest, cs:1});
    const meta = [fmtD(i.date), i.time].filter(Boolean).join("  ·  ") + (base==="A" && (i.base==="S"||i.base==="N") ? "  ·  " + BASE_NAME[i.base] : "");
    T(doc, fit(doc, "  ·  " + meta, bw-wl, 7.5, false), bx+wl, y, {size:7.5, color:C.gray});
    y += 14;
    if (i.titulo){ T(doc, fit(doc, i.titulo, bw, 9, true), bx, y, {size:9, bold:true}); y += 12.8; }
    if (i.endereco && norm(i.endereco)!==norm(i.titulo)){ T(doc, fit(doc, i.endereco, bw, 7.5, false), bx, y, {size:7.5}); y += 11.6; }
    else if (i.endereco===i.titulo && !i.titulo) {}
    if (S.cfg.desc && i.descricao){ T(doc, fit(doc, i.descricao, bw, 7.5, false), bx, y, {size:7.5, color:C.forest}); y += 11.6; }
    const last = [i.lat!=null ? `Lat ${fmtCoord(i.lat)}  Long ${fmtCoord(i.lon)}` : "Sem coordenada", S.cfg.showReg!==false && i.registro ? "Registro: " + i.registro : ""].filter(Boolean).join("  ·  ");
    T(doc, fit(doc, last, bw, 7, false), bx, y, {size:7, color:C.gray});
  }
  tricolor(doc, 51, 782.4, 493.5, 3.7);
  T(doc, `Instalação de Papeleiras · ${BASE_NAME[base]} · ${periodLabel()} · Concessionária Belém Limpa`, 51.1, 812.9, {size:7, color:C.gray});
}
// ---------- papeleiras: lista numerada, quadro resumo e tabela de georreferenciamento ----------
function papList(base, reps){
  reps = reps || report(base).filter(r=>r.sel.length);
  const out = []; let n = 0;
  for (const r of reps) for (const x of r.sel) out.push({cod: papCod(base, ++n), n, ...x});
  return out;
}
function papResumo(list){
  const m = new Map();
  for (const x of list){
    const k = x.i.bairroNome || "Bairro não identificado";
    if (!m.has(k)) m.set(k, {bairro:k, n:0, geo:0, bases:{}, d0:null, d1:null});
    const g = m.get(k); g.n++; if (x.i.lat!=null) g.geo++; g.bases[x.i.base] = (g.bases[x.i.base]||0)+1;
    if (x.i.date){ if (!g.d0 || x.i.date < g.d0) g.d0 = x.i.date; if (!g.d1 || x.i.date > g.d1) g.d1 = x.i.date; }
  }
  const rows = [...m.values()].map(g=>({...g, base: Object.entries(g.bases).sort((a,b)=>b[1]-a[1])[0][0]}));
  return rows.sort((a,b)=> (a.bairro==="Bairro não identificado") - (b.bairro==="Bairro não identificado") || b.n - a.n || a.bairro.localeCompare(b.bairro));
}
function papPorDia(list){
  const m = new Map(); for (const x of list){ const k = x.i.date ? ymd(x.i.date) : ""; m.set(k, (m.get(k)||0)+1); }
  return [...m.entries()].sort((a,b)=> (a[0]===""?1:0)-(b[0]===""?1:0) || a[0].localeCompare(b[0]));
}
function tableHeader(doc, title, sub, base){
  doc.addImage(ASSETS.logoBL, "PNG", 56.45, 31.2, 124.5, 45, "bl");
  doc.addImage(ASSETS.logoPref, "PNG", 428.65, 34.5, 110.25, 38.25, "pref");
  doc.setFillColor(...C.soft); doc.rect(52.6, 97.2, 493.15, 21, "F");
  doc.setDrawColor(...C.leaf); doc.setLineWidth(3); doc.line(52.6, 97.2, 52.6, 118.2);
  T(doc, title, 61.65, 110.9, {size:8, bold:true, color:C.forest, cs:1});
  doc.setFont("Poppins","normal"); doc.setFontSize(8);
  const right = `${BASE_NAME[base]}  ·  ${periodLabel()}`; T(doc, right, 537.2, 110.9, {size:8, align:"right"});
  if (sub) T(doc, sub, 52.6, 136, {size:8, color:C.gray});
  tricolor(doc, 51, 782.4, 493.5, 3.7);
  T(doc, `Instalação de Papeleiras · ${BASE_NAME[base]} · ${periodLabel()} · Concessionária Belém Limpa`, 51.1, 812.9, {size:7, color:C.gray});
}
// tabela com quebra de página: cols = [{h, w, align}], rows = [[...]], bold = linhas em negrito (total)
function drawTable(doc, {title, sub, base, cols, rows, top, size=7.5, rowH=15, boldLast=false, newPage=true}){
  const x0 = 52.6, bottom = 770;
  if (newPage){ doc.addPage(); tableHeader(doc, title, sub, base); }
  let y = top || 148;
  const head = () => {
    doc.setFillColor(...C.forest); doc.rect(x0, y, cols.reduce((a,c)=>a+c.w,0), rowH+2, "F");
    let x = x0; for (const c of cols){ T(doc, c.h, c.align==="right" ? x+c.w-5 : x+5, y+rowH-3.5, {size:size-.5, bold:true, color:[255,255,255], align:c.align==="right"?"right":"left"}); x += c.w; }
    y += rowH+2;
  };
  head();
  rows.forEach((row, k) => {
    if (y + rowH > bottom){ doc.addPage(); tableHeader(doc, title + " (continuação)", "", base); y = 148; head(); }
    const bold = boldLast && k === rows.length-1;
    if (k % 2 || bold){ doc.setFillColor(...(bold ? C.rule : C.soft)); doc.rect(x0, y, cols.reduce((a,c)=>a+c.w,0), rowH, "F"); }
    let x = x0;
    cols.forEach((c, j) => { const v = fit(doc, row[j] ?? "", c.w-8, size, bold); T(doc, v, c.align==="right" ? x+c.w-5 : x+5, y+rowH-4.2, {size, bold, align:c.align==="right"?"right":"left"}); x += c.w; });
    y += rowH;
  });
  return y;
}
function resumoPages(doc, base, list){
  const R = papResumo(list), tot = list.length, geo = list.filter(x=>x.i.lat!=null).length;
  const rows = R.map(g=>[g.bairro, BASE_NAME[g.base]||"", String(g.n), (100*g.n/tot).toFixed(1).replace(".",",")+"%", String(g.geo), g.d0 ? (fmtD(g.d0).slice(0,5) + (g.d1 && +g.d1 !== +g.d0 ? " a " + fmtD(g.d1).slice(0,5) : "")) : "—"]);
  rows.push(["TOTAL", "", String(tot), "100%", String(geo), ""]);
  let y = drawTable(doc, {title:"QUADRO RESUMO DE INSTALAÇÃO DE PAPELEIRAS", sub:`${tot} papeleira(s) instalada(s) em ${R.filter(g=>g.bairro!=="Bairro não identificado").length} bairro(s) · ${geo} georreferenciada(s)`, base,
    cols:[{h:"BAIRRO",w:150},{h:"BASE",w:72},{h:"QTD.",w:50,align:"right"},{h:"%",w:50,align:"right"},{h:"COM COORD.",w:66,align:"right"},{h:"PERÍODO",w:105}], rows, boldLast:true});
  const D = papPorDia(list);
  if (D.length > 1){
    const dRows = D.map(([k,n])=>[k ? `${isoToBR(k)} · ${WEEKDAYS[new Date(k+"T12:00").getDay()]}` : "Sem data", String(n)]);
    if (y + 60 + Math.min(dRows.length, 6)*15 > 770){ y = drawTable(doc, {title:"QUADRO RESUMO · INSTALAÇÕES POR DIA", base, cols:[{h:"DATA",w:200},{h:"QTD.",w:60,align:"right"}], rows:dRows}); }
    else { T(doc, "INSTALAÇÕES POR DIA", 52.6, y+30, {size:8, bold:true, color:C.forest, cs:1}); drawTable(doc, {title:"QUADRO RESUMO · INSTALAÇÕES POR DIA", base, cols:[{h:"DATA",w:200},{h:"QTD.",w:60,align:"right"}], rows:dRows, top:y+38, newPage:false}); }
  }
}
function geoPages(doc, base, list){
  const rows = list.map(x=>[x.cod, fmtD(x.i.date), x.i.time||"", x.i.endereco || x.i.titulo || "", x.i.bairroNome||"", x.i.lat!=null ? fmtCoord(x.i.lat) : "—", x.i.lon!=null ? fmtCoord(x.i.lon) : "—"]);
  drawTable(doc, {title:"TABELA DE GEORREFERENCIAMENTO DAS PAPELEIRAS", sub:"Coordenadas geográficas em graus decimais (WGS 84 / SIRGAS 2000). O CSV traz também UTM 22S (EPSG:31982).", base,
    cols:[{h:"Nº",w:44},{h:"DATA",w:50},{h:"HORA",w:32},{h:"ENDEREÇO",w:170},{h:"BAIRRO",w:75},{h:"LATITUDE",w:61,align:"right"},{h:"LONGITUDE",w:61,align:"right"}], rows, size:6.8, rowH:13.5});
}
// ---------- CSV (separador ";", decimais com ponto, UTF-8): abre no QGIS como "Texto delimitado" (X = LONGITUDE, Y = LATITUDE, EPSG:4326) ----------
function csvBlob(header, rows){
  const q = v => { const t = v==null ? "" : String(v); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t; };
  return new Blob(["\uFEFF" + [header, ...rows].map(r=>r.map(q).join(";")).join("\r\n") + "\r\n"], {type:"text/csv;charset=utf-8"});
}
async function exportCsv(kind){
  const base = S.tab; if (base==="?") return;
  const list = papList(base);
  if (!list.length){ setMsg("#pdfMsg","warn","Não há papeleiras nesta aba."); return; }
  setMsg("#pdfMsg","","Conferindo o GPS gravado nas fotos…");
  await ensureGps(list.map(x=>x.p), (k,t)=>setMsg("#pdfMsg","",`Conferindo o GPS gravado nas fotos… ${k} de ${t}`));
  const L = papList(base), tag = periodTag();
  let blob, name;
  if (kind==="geo"){
    const rows = L.map(x=>{ const u = x.i.lat!=null ? latLonToUtm(x.i.lat, x.i.lon) : null;
      return [x.cod, fmtD(x.i.date), x.i.time||"", x.i.titulo||"", x.i.endereco||"", x.i.bairroNome||"", BASE_NAME[x.i.base]||"", x.i.lat!=null?fmtCoord(x.i.lat):"", x.i.lon!=null?fmtCoord(x.i.lon):"", u?u.E.toFixed(2):"", u?u.N.toFixed(2):"", u?u.zone:"", x.i.coordSrc||"", x.i.registro||"", x.p.name]; });
    blob = csvBlob(["ID","DATA","HORA","LOCAL","ENDERECO","BAIRRO","BASE","LATITUDE","LONGITUDE","UTM_E","UTM_N","FUSO","FONTE_COORD","REGISTRO","ARQUIVO_FOTO"], rows);
    name = `TABELA DE GEORREFERENCIAMENTO DAS PAPELEIRAS - ${BASE_NAME[base]} - ${tag}.csv`;
  } else {
    const R = papResumo(L), tot = L.length;
    const rows = R.map(g=>[g.bairro, BASE_NAME[g.base]||"", g.n, (100*g.n/tot).toFixed(1), g.geo, g.d0?fmtD(g.d0):"", g.d1?fmtD(g.d1):""]);
    rows.push(["TOTAL", "", tot, "100.0", L.filter(x=>x.i.lat!=null).length, "", ""]);
    blob = csvBlob(["BAIRRO","BASE","QTD_PAPELEIRAS","PERCENTUAL","QTD_COM_COORDENADA","PRIMEIRA_DATA","ULTIMA_DATA"], rows);
    name = `QUADRO RESUMO DE INSTALAÇÃO DE PAPELEIRAS - ${BASE_NAME[base]} - ${tag}.csv`;
  }
  name = name.replace(/[\/\\:*?"<>|]/g,"-");
  try {
    const st = await savePdf(blob, name);
    const sem = L.filter(x=>x.i.lat==null).length;
    if (st==="declined") setMsg("#pdfMsg","warn","Download cancelado.");
    else if (st==="nodl") setMsg("#pdfMsg","bad","O Claude não liberou o download nesta visualização. Recarregue a página e tente de novo.");
    else setMsg("#pdfMsg", sem && kind==="geo" ? "warn" : "ok", `Pronto: <b>${esc(name)}</b>${kind==="geo" ? ` · ${L.length-sem} de ${L.length} com coordenada${sem?` (as ${sem} sem coordenada ficam com LATITUDE/LONGITUDE vazias e o QGIS não as desenha)`:""}. No QGIS: Camada → Adicionar camada → Texto delimitado · delimitador ponto e vírgula · X = LONGITUDE, Y = LATITUDE · SRC EPSG:4326 (ou UTM_E/UTM_N com EPSG:31982).` : ". Para mapa por bairro, una ao shape de bairros pelo campo BAIRRO."}`);
  } catch(e){ setMsg("#pdfMsg","bad","Não consegui baixar: " + esc(e && e.message || e)); }
}
function pageNumbers(doc){
  const n = doc.getNumberOfPages();
  for (let k=2;k<=n;k++){
    doc.setPage(k);
    const num = String(k), tot = String(n);
    doc.setFont("Poppins","normal");
    doc.setFontSize(10); const wT = doc.getTextWidth(tot), wN = doc.getTextWidth(num);
    doc.setFontSize(7); const wDe = doc.getTextWidth(" de "), wP = doc.getTextWidth("Página ");
    let x = 544.4 - wT; T(doc, tot, x, 812.9, {size:10});
    x -= wDe; T(doc, " de ", x, 812.9, {size:7, color:C.gray});
    x -= wN; T(doc, num, x, 812.9, {size:10});
    x -= wP; T(doc, "Página ", x, 812.9, {size:7, color:C.gray});
  }
}
async function buildPdf(base, reps, onProg){
  const doc = newDoc();
  coverPage(doc, base, reps);
  const list = papList(base, reps);
  resumoPages(doc, base, list);
  let num = 0, done = 0; const total = reps.reduce((a,r)=>a+r.sel.length,0);
  for (let s=0;s<reps.length;s++){
    const r = reps[s];
    const per = ppp();
    for (let k=0;k<r.sel.length;k+=per){
      doc.addPage();
      const items = r.sel.slice(k,k+per);
      await photoPage(doc, r, items, num+1, base);
      num += items.length; done += items.length; onProg && onProg(done,total);
      await new Promise(res=>setTimeout(res,0));
    }
  }
  geoPages(doc, base, list);
  pageNumbers(doc);
  return doc.output("blob");
}
async function savePdf(blob, filename){
  if (S.downloads){
    try { await S.downloads.save({filename, data:blob}); return "saved"; }
    catch(e){ if (e && e.code==="declined") return "declined"; if (e && e.code==="rate_limited") throw new Error("já há um download aguardando confirmação. Confirme ou feche e tente de novo."); throw new Error("download recusado: " + errText(e)); }
  }
  if (ENV.hasClaude) return "nodl";
  // fora do Claude (arquivo aberto localmente): link de download comum
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  return "link";
}
async function generate(){
  const base = S.tab; if (base==="?") return;
  let reps = report(base).filter(r=>r.sel.length);
  if (!reps.length){ setMsg("#pdfMsg","warn","Não há papeleiras nesta aba."); return; }
  await ensureGps(reps.flatMap(r=>r.sel).map(x=>x.p), (k,t)=>setMsg("#pdfMsg","",`Conferindo o GPS gravado nas fotos… ${k} de ${t}`));
  reps = report(base).filter(r=>r.sel.length);
  const btn = $("#btnPdf"); btn.disabled = true;
  const tag = periodTag();
  PDF_FAIL.length = 0;
  // confere antes se os arquivos importados ainda podem ser lidos (uma foto de cada lote)
  const bad = [];
  for (const l of S.lotes){ const p = reps.flatMap(r=>r.sel).map(x=>x.p).find(p=>p.loteId===l.id); if (!p) continue; try { await blobOf(p); } catch(e){ bad.push(l.name); } }
  if (bad.length){ setMsg("#pdfMsg","bad",`Não consigo mais ler as fotos de: <b>${esc(bad.join(", "))}</b>. O arquivo foi movido, renomeado ou apagado depois de importado (ou o .zip foi trocado por outro com o mesmo nome). Remova esse lote no passo 2 (botão ✕), adicione o arquivo de novo e gere outra vez. As leituras e correções já feitas são reaproveitadas.`); btn.disabled = false; return; }
  try {
    const chunks = [reps];
    const built = [];
    for (const ch of chunks){
      const name = `Relatório de Instalação de Papeleiras - ${BASE_NAME[base]} - ${tag}.pdf`.replace(/[\/\\:*?"<>|]/g,"-");
      const blob = await buildPdf(base, ch, (d,t)=>setMsg("#pdfMsg","",`Montando ${esc(name)}${chunks.length>1?` (${built.length+1} de ${chunks.length})`:""}… ${d} de ${t} papeleiras`));
      built.push({name, blob});
    }
    let out = built[0];
    if (built.length > 1){
      setMsg("#pdfMsg","","Juntando os PDFs num arquivo .zip…");
      const zw = new zip.ZipWriter(new zip.BlobWriter("application/zip"));
      for (const f of built) await zw.add(f.name, new zip.BlobReader(f.blob), {level:0});
      out = {name:`Relatório Fotográfico - ${BASE_NAME[base]} - ${tag} (por serviço).zip`, blob: await zw.close()};
    }
    const st = await savePdf(out.blob, out.name);
    const mb = (out.blob.size/1048576).toFixed(1);
    if (st==="nodl") setMsg("#pdfMsg","bad",`O arquivo foi montado (${mb} MB), mas o Claude não liberou o download nesta visualização. Recarregue a página e tente de novo.`);
    else if (st==="declined") setMsg("#pdfMsg","warn","Download cancelado. Clique em Gerar PDF de novo e confirme o download.");
    else setMsg("#pdfMsg", PDF_FAIL.length?"warn":"ok",`Pronto: <b>${esc(out.name)}</b> · ${mb} MB${built.length>1?` · ${built.length} PDFs, um por serviço`:""}${pdfFailMsg()}`);
  } catch(e){ console.error(e); setMsg("#pdfMsg","bad","Não consegui montar o PDF: " + esc(e && e.message || e)); }
  btn.disabled = false;
}

function monthCounts(){
  const c = new Map();
  for (const p of S.photos){ const d = (p.ocr && parseDMY(p.ocr.data)) || p.wa.date; if (!d) continue; const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}`; c.set(k,(c.get(k)||0)+1); }
  return [...c.entries()].sort((a,b)=>b[1]-a[1]);
}
function dayCounts(){
  const c = new Map();
  for (const p of S.photos){ const d = (p.ocr && parseDMY(p.ocr.data)) || p.wa.date; if (!d) continue; const k = ymd(d); c.set(k,(c.get(k)||0)+1); }
  return [...c.entries()].sort((a,b)=>b[1]-a[1]);
}
function autoMonth(){
  if (periodKind()==="dia" && !S.cfg.day){ const dc = dayCounts(); if (dc.length){ S.cfg.day = dc[0][0]; saveCfg(); renderCfg(); } }
  if (S.monthTouched || S.cfg.period!=="mes") return "";
  const mc = monthCounts(); if (!mc.length) return "";
  const [top, n] = mc[0], cur = (mc.find(x=>x[0]===S.cfg.month)||[0,0])[1];
  if (top !== S.cfg.month && n > cur){ S.cfg.month = top; saveCfg(); $("#cfgMonth").value = top; return periodLabel(); }
  return "";
}

// ---------- configuração: UI ----------
function renderCfg(){
  const c = S.cfg;
  $("#cfgMonth").value = c.month;
  $("#cfgPeriod").value = c.period || "mes"; $("#cfgDay").value = c.day || ""; $("#cfgFrom").value = c.from || ""; $("#cfgTo").value = c.to || "";
  $("#wrapMonth").hidden = c.period==="dia" || c.period==="intervalo"; $("#wrapDay").hidden = c.period!=="dia"; $("#wrapFrom").hidden = $("#wrapTo").hidden = c.period!=="intervalo";
  $("#cfgPpp").value = String(c.ppp || 4);
  const pp = +c.ppp === 6 ? 6 : 4;
  $("#cfgPages").innerHTML = [2,3,4,5,6,8,10,12,15,20,30,50].map(n=>`<option value="${n}" ${n==c.pages?"selected":""}>${n} págs · ${n*pp} fotos</option>`).join("") + `<option value="0" ${+c.pages===0?"selected":""}>Todas as fotos</option>`;
  $("#cfgPagesTotal").innerHTML = [5,10,15,20,30,40,50,75,100,150,200].map(n=>`<option value="${n}" ${n==c.pagesTotal?"selected":""}>${n} págs · ${n*pp} fotos</option>`).join("") + `<option value="0" ${+c.pagesTotal===0?"selected":""}>Todas as fotos</option>`;
  $("#cfgPrecision").value = c.precision || "normal";
  $("#cfgGroupBy").value = c.groupBy || "servico"; $("#cfgRefine").checked = !!c.refine;
  $("#wrapPages").hidden = c.groupBy==="nenhum"; $("#wrapPagesTotal").hidden = c.groupBy!=="nenhum";
  $("#cfgQuality").value = c.quality; $("#cfgTier").value = c.tier; $("#cfgEngine").value = c.engine==="auto" ? "vision" : (c.engine || "ocr"); $("#cfgMaxRead").value = String(c.maxRead||0);
  $("#cfgAuthor").value = c.author; $("#cfgDesc").checked = c.desc; $("#cfgShowReg").checked = c.showReg!==false; $("#cfgBalance").checked = !!c.balance; $("#cfgTotalPages").value = +c.totalPages > 0 ? c.totalPages : ""; $("#wrapTotalPages").hidden = c.groupBy==="nenhum"; $("#cfgPages").disabled = +c.totalPages > 0; $("#cfgVerify").checked = c.verify!==false; fillDatalists(); $("#cfgSplit").checked = c.split;
  $("#cfgServices").value = c.services.join("\n");
  $("#bairroTbl").innerHTML = `<tr><th>Bairro</th><th>Base</th><th></th></tr>` + c.bairros.map((b,k)=>`<tr><td>${esc(b[0])}</td><td><select data-bk="${k}" aria-label="Base de ${esc(b[0])}"><option value="S" ${b[1]==="S"?"selected":""}>Sul</option><option value="N" ${b[1]==="N"?"selected":""}>Norte</option></select></td><td>${b[2]?"⚠ divisa":""}</td></tr>`).join("");
}
function bindCfg(){
  const upd = (k, v) => { if (["month","period","day","from","to"].includes(k) && S.cfg.pins) S.cfg.pins = {}; S.cfg[k] = v; saveCfg(); refreshAll(); };
  $("#cfgMonth").onchange = e => { S.monthTouched = true; upd("month", e.target.value); };
  $("#cfgPeriod").onchange = e => { S.cfg.pins = {}; S.cfg.period = e.target.value; if (e.target.value==="dia" && !S.cfg.day){ const dc = dayCounts(); S.cfg.day = dc.length ? dc[0][0] : ymd(new Date()); } saveCfg(); renderCfg(); refreshAll(); };
  $("#cfgDay").onchange = e => upd("day", e.target.value);
  $("#cfgFrom").onchange = e => upd("from", e.target.value);
  $("#cfgTo").onchange = e => upd("to", e.target.value);
  $("#cfgPpp").onchange = e => { upd("ppp", +e.target.value); renderCfg(); };
  $("#cfgPages").onchange = e => upd("pages", +e.target.value);
  $("#cfgPagesTotal").onchange = e => upd("pagesTotal", +e.target.value);
  $("#cfgTotalPages").onchange = e => { const v = Math.max(0, Math.round(+e.target.value || 0)); upd("totalPages", v ? Math.max(3, v) : 0); renderCfg(); };
  $("#cfgPrecision").onchange = e => upd("precision", e.target.value);
  $("#cfgGroupBy").onchange = e => { upd("groupBy", e.target.value); renderCfg(); };
  $("#cfgRefine").onchange = e => upd("refine", e.target.checked);
  $("#cfgQuality").onchange = e => upd("quality", e.target.value);
  $("#cfgTier").onchange = e => upd("tier", e.target.value);
  $("#cfgEngine").onchange = e => upd("engine", e.target.value);
  $("#cfgMaxRead").onchange = e => upd("maxRead", +e.target.value);
  $("#cfgAuthor").oninput = e => { S.cfg.author = e.target.value; saveCfg(); };
  $("#cfgDesc").onchange = e => upd("desc", e.target.checked);
  $("#cfgShowReg").onchange = e => upd("showReg", e.target.checked);
  $("#cfgBalance").onchange = e => upd("balance", e.target.checked);
  $("#cfgVerify").onchange = e => upd("verify", e.target.checked);
  $("#btnRuas").onclick = () => $("#ruasIn").click();
  $("#btnRuasExp").onclick = async () => { try { await exportRuas(); } catch(e){ $("#listasMsg").innerHTML = `<div class="msg bad">${esc(e.message||e)}</div>`; } };
  $("#ruasIn").onchange = e => { importRuas([...e.target.files]); e.target.value = ""; };
  $("#btnRuasReset").onclick = () => { S.cfg.ruasExtras = []; S.cfg.ruasFix = {}; S.cfg.ruasIgn = []; saveCfg(); LISTAS.build([], {}); fillDatalists(); $("#listasMsg").innerHTML = `<div class="msg">Ruas adicionadas por você foram removidas.</div>`; refreshAll(true); };
  $("#cfgSplit").onchange = e => { S.cfg.split = e.target.checked; saveCfg(); };
  $("#cfgServices").onchange = e => { S.cfg.services = e.target.value.split("\n").map(s=>s.trim()).filter(Boolean); saveCfg(); renderLotes(); refreshAll(); };
  $("#bairroTbl").onchange = e => { const k = e.target.dataset.bk; if (k!==undefined){ S.cfg.bairros[+k][1] = e.target.value; saveCfg(); refreshAll(); } };
  $("#btnResetCfg").onclick = () => { const d = defaultCfg(); S.cfg.services = d.services; S.cfg.bairros = d.bairros; saveCfg(); renderCfg(); refreshAll(); };
}

// ---------- eventos ----------
function bind(){
  const drop = $("#drop"), fin = $("#fileIn");
  drop.onclick = () => fin.click();
  drop.onkeydown = e => { if (e.key==="Enter"||e.key===" "){ e.preventDefault(); fin.click(); } };
  fin.onchange = () => { importFiles(fin.files); fin.value = ""; };
  const din = $("#dirIn"); $("#btnDir").onclick = (e) => { e.stopPropagation(); din.click(); };
  din.onchange = () => { importFiles(din.files, true); din.value = ""; };
  ["dragenter","dragover"].forEach(t=>drop.addEventListener(t, e=>{ e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave","drop"].forEach(t=>drop.addEventListener(t, e=>{ e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => importFiles(e.dataTransfer.files));
  $("#lotes").onchange = e => { const row = e.target.closest(".lote"); if (!row) return; const l = S.lotes.find(x=>x.id==row.dataset.id); l[e.target.dataset.k] = e.target.value; refreshAll(); };
  $("#lotes").onclick = e => { const id = e.target.dataset.del; if (!id) return; S.lotes = S.lotes.filter(l=>l.id!=id); S.photos = S.photos.filter(p=>{ if (p.loteId==id){ S.hashes.delete(p.hash); return false; } return true; }); refreshAll(); };
  $("#btnRead").onclick = readAll;
  $("#btnStop").onclick = () => S.ctl && S.ctl.abort();
  $("#btnNoAI").onclick = noAI;
  $("#tabs").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.tab = b.dataset.base; renderReview(); };
  $("#review").addEventListener("keydown", e => { if ((e.key==="Enter"||e.key===" ") && e.target.classList && e.target.classList.contains("card")){ e.preventDefault(); openEditor(+e.target.dataset.pid); } });
  $("#bulk").onclick = bulkClick;
  $("#review").onclick = e => {
    const t = e.target;
    if (t.dataset && t.dataset.pick){ const id = +t.dataset.pick; t.checked ? S.sel.add(id) : S.sel.delete(id); t.closest(".card").classList.toggle("picked", t.checked); renderBulk(); return; }
    if (t.closest && t.closest(".pick")) return;
    if (t.dataset && t.dataset.rm){ setInclude([+t.dataset.rm], false); return; }
    if (t.dataset && t.dataset.restore){ setInclude([+t.dataset.restore], null); return; }
    if (t.dataset && t.dataset.selall!==undefined){ const svc = t.dataset.selall; const r = report(S.tab).find(x=>x.service===svc); if (r){ const list = r.sel; list.forEach(x=>S.sel.add(x.p.id)); } renderReview(); return; }
    if (t.id==="btnAiSvc"){ suggestServicesAI(); return; }
    if (t.id==="btnPin"){ pinBase(S.tab); refreshAll(true); return; }
    if (t.id==="btnUnpin"){ unpinBase(S.tab); refreshAll(true); return; }
    if (t.id==="btnPinSeen"){ const P = S.cfg.pins && S.cfg.pins[S.tab]; if (P){ P.novas = []; saveCfg(); } refreshAll(true); return; }
    if (t.dataset && t.dataset.undoia){ const r = report(S.tab).find(x=>x.service===t.dataset.undoia); if (r) r.all.filter(x=>x.i.svcSrc==="ia").forEach(x=>{ const p = x.p; p.aiService = null; p.aiConf = null; p.aiBy = null; p.aiGuess = null; p.aiVotes = null; saveEdit(p); }); refreshAll(true); return; }
    if (t.dataset && (t.dataset.rnadd || t.dataset.rnign || t.dataset.rnall)){
      S.rnOpen = true;
      if (t.dataset.rnign) S.cfg.ruasIgn.push(t.dataset.rnign);
      else for (const inp of document.querySelectorAll("[data-rnname]")) if (t.dataset.rnall || inp.dataset.rnname === t.dataset.rnadd) rnAdd(inp.dataset.rnname, inp.value);
      saveCfg(); LISTAS.build(S.cfg.ruasExtras, S.cfg.ruasFix); fillDatalists(); refreshAll(true); return;
    }
    if (t.dataset && t.dataset.showmore){ S.showMore = S.showMore || {}; S.showMore[t.dataset.showmore] = true; renderReview(); return; }
    if (e.target.id==="btnFixDay"){ S.cfg.day = e.target.dataset.d; saveCfg(); renderCfg(); refreshAll(); return; }
    if (e.target.id==="btnFixMonth"){ S.cfg.month = e.target.dataset.m; S.monthTouched = true; saveCfg(); $("#cfgMonth").value = S.cfg.month; refreshAll(); return; }
    const c = e.target.closest(".card"); if (c) openEditor(+c.dataset.pid); };
  $("#btnPdf").onclick = generate;
  $("#btnCsvRes").onclick = () => exportCsv("resumo");
  $("#btnCsvGeo").onclick = () => exportCsv("geo");
  $("#btnTest").onclick = selfTest;
  $("#btnHP").onclick = () => rereadHP();
  lrnBind();
}

// ---------- diagnóstico / status ----------
const ENV = { framed: (()=>{ try { return window.top !== window; } catch(e){ return true; } })(), hasClaude: !!(window.claude && window.claude.use), capsDone:false, images:null, imgMax:0 };
function renderStatus(){
  const el = $("#status"); if (!el) return;
  const pill = (ok, txt) => `<span class="pill ${ok===true?"ok":ok===false?"bad":""}">${txt}</span>`;
  const libs = !!window.ort && !!(window.zip && window.zip.ZipReader) && !!(window.jspdf && window.jspdf.jsPDF) && !!window.Tesseract;
  let claude, dl;
  if (!ENV.capsDone) { claude = pill(null,"Claude: conectando…"); dl = pill(null,"Download: conectando…"); }
  else {
    claude = !ENV.hasClaude ? pill(true,"Leitura: no seu navegador (grátis)") : S.sample ? (ENV.images===false ? pill(null,"Leitura: no navegador · Claude só texto") : pill(true,"Leitura: no navegador · Claude opcional")) : pill(null,"Leitura: no seu navegador");
    dl = !ENV.hasClaude ? pill(true,"Download do PDF: direto") : S.downloads ? pill(true,"Download do PDF: pronto") : pill(false,"Download do PDF: indisponível");
  }
  el.innerHTML = pill(libs, libs ? "Leitor de .zip e gerador de PDF: carregados" : "Bibliotecas não carregaram") + claude + dl;
  const warn = $("#envMsg");
  if (!ENV.capsDone) { warn.innerHTML = ""; return; }
  document.querySelectorAll(".needsClaude").forEach(el=>el.hidden = !S.sample);
  document.querySelectorAll(".needsVision").forEach(el=>el.hidden = !(S.sample && ENV.images===true));
  if (!ENV.hasClaude) warn.innerHTML = "";
  else if (!ENV.framed && !S.sample) warn.innerHTML = `<div class="msg warn">A página foi aberta sozinha numa aba própria, e nesse modo o Claude não libera leitura nem download. Abra pelo link <b>claude.ai/artifact/…</b> (a página aparece dentro da tela do Claude).</div>`;
  else if (!S.downloads) warn.innerHTML = `<div class="msg warn">O Claude não liberou o download do PDF nesta visualização. Recarregue a página; se continuar, abra pelo navegador em claude.ai.</div>`;
  else warn.innerHTML = "";
}

// teste rápido: gera uma foto sintética com carimbo e pede ao Claude para ler
async function selfTest(){
  const out = "#testMsg";
  const c = document.createElement("canvas"); c.width = 900; c.height = 1200; const g = c.getContext("2d");
  const gr = g.createLinearGradient(0,0,0,1200); gr.addColorStop(0,"#7fb3d5"); gr.addColorStop(1,"#6b7b5a"); g.fillStyle = gr; g.fillRect(0,0,900,1200);
  g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0,900,900,300);
  g.fillStyle = "#fff"; g.font = "bold 110px sans-serif"; g.fillText("06:39", 40, 1010);
  g.font = "38px sans-serif"; g.fillText("27/09/2026", 360, 975); g.fillText("Dom", 360, 1020);
  g.font = "34px sans-serif"; g.fillText("Blvd. Castilhos França, 640 - Campina,", 40, 1090); g.fillText("Belém - PA, 66010-020", 40, 1135);
  const blob = await new Promise(r=>c.toBlob(r,"image/jpeg",.9));
  if (S.cfg.engine!=="vision" || ENV.images!==true){
    setMsg(out,"","Testando o leitor do navegador…");
    try { const sched = await OCR.init(t=>setMsg(out,"",esc(t))); const r = await sched.addJob("recognize", await ocrCanvas(blob, 0)); const o = parseOCR(r.data.text, bairroNames());
      const ok = o.data==="27/09/2026" && /castilhos/i.test(o.logradouro||"");
      setMsg(out, ok?"ok":"warn", (ok?"Leitor do navegador funcionando. ":"O leitor respondeu, mas leu diferente do esperado. ") + `Lido: ${esc([o.data,o.hora,o.logradouro,o.numero,o.bairro].filter(Boolean).join(" · ")||r.data.text.slice(0,80))}`);
    } catch(e){ setMsg(out,"bad","O leitor do navegador falhou: " + esc(e && e.message || e)); }
    return;
  }
  setMsg(out,"","Testando… (se o Claude pedir permissão, clique em Permitir)");
  try {
    if (!S.sample) throw {message:"Claude indisponível"};
    const r = await S.sample.json(buildPrompt(1), {images:[blob], modelTier:S.cfg.tier, cache:false});
    const o = Array.isArray(r) ? r[0] : r;
    const ok = o && o.hora==="06:39" && /27\/09\/2026/.test(o.data||"") && /castilhos/i.test(o.logradouro||"");
    setMsg(out, ok?"ok":"warn", (ok?"Leitura funcionando. ":"O Claude respondeu, mas leu diferente do esperado. ") + `Lido: ${esc([o&&o.data,o&&o.hora,o&&o.logradouro,o&&o.numero,o&&o.bairro].filter(Boolean).join(" · "))}`);
  } catch(e){ setMsg(out,"bad",`Falhou: ${esc(errText(e))}`); }
}
function errText(e){
  const map = {not_granted:"você (ou sua organização) não permitiu que esta página use o Claude. Recarregue e clique em Permitir.",
    sampling_disabled:"o uso do Claude por páginas está desativado nesta conta/organização.",
    images_unavailable:"este app não permite enviar imagens ao Claude. Use o navegador em claude.ai.",
    rate_limited:"limite de uso atingido. Espere alguns minutos.", session_expired:"sessão expirada. Entre de novo no claude.ai.",
    image_rejected:"a imagem foi recusada (tipo ou tamanho).", invalid_json:"o Claude respondeu fora do formato esperado.",
    upstream_error:"falha temporária de conexão. Tente de novo.", refused:"o Claude recusou esta imagem.", cancelled:"cancelado."};
  const code = e && e.code;
  return (code ? `[${code}] ` : "") + (map[code] || (e && e.message) || String(e));
}

// ---------- início ----------
(async function start(){
  window.__appStarted = true; const bm = document.getElementById("bootMsg"); if (bm) bm.remove();
  loadCfg(); renderCfg(); bindCfg(); bind(); refreshAll(); renderStatus();
  IDB.open(); // não bloqueia: se o armazenamento do navegador falhar, a página segue sem cache
  if (ENV.hasClaude){
    const [sm, dl] = await Promise.all([
      window.claude.use("sample").catch(()=>null),
      window.claude.use("downloads").catch(()=>null)]);
    S.sample = sm; S.downloads = dl;
    if (sm && sm.limits){ try { const l = await sm.limits(); ENV.images = !!(l && l.images); ENV.imgMax = l && l.images ? l.images.maxCount : 0; } catch(e){ ENV.images = null; } }
  }
  ENV.capsDone = true; renderStatus();
})();
