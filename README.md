# Relatório de Instalação de Papeleiras · Belém Limpa

Site estático (sem build). Suba a pasta inteira no GitHub e importe no Vercel como projeto "Other" (sem comando de build, diretório raiz = esta pasta).

Estrutura: `index.html`, `js/` (app e bibliotecas), `tess/` (leitor de texto), `hp/` (leitor de alta precisão). As pastas `tess` e `hp` precisam ir juntas.

Saídas:
- PDF: capa, quadro resumo por bairro e por dia, fotos (1 foto = 1 papeleira, código S-001 / N-001 / 001) e tabela de georreferenciamento.
- CSV `QUADRO RESUMO DE INSTALAÇÃO DE PAPELEIRAS`: BAIRRO;BASE;QTD_PAPELEIRAS;PERCENTUAL;QTD_COM_COORDENADA;PRIMEIRA_DATA;ULTIMA_DATA.
- CSV `TABELA DE GEORREFERENCIAMENTO DAS PAPELEIRAS`: ID;DATA;HORA;LOCAL;ENDERECO;BAIRRO;BASE;LATITUDE;LONGITUDE;UTM_E;UTM_N;FUSO;FONTE_COORD;REGISTRO;ARQUIVO_FOTO.

QGIS: Camada → Adicionar camada → Texto delimitado · delimitador ";" · X = LONGITUDE, Y = LATITUDE · EPSG:4326 (ou UTM_E/UTM_N com EPSG:31982).

Coordenada de cada papeleira, nesta ordem: digitada no editor da foto → escrita no carimbo (lat/long ou UTM) → GPS gravado no arquivo da foto (EXIF; fotos do WhatsApp não têm).
