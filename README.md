# Relatório de Instalação de Papeleiras · Belém Limpa

Site estático (sem build). Suba a pasta inteira no GitHub e importe no Vercel como projeto "Other" (sem comando de build, diretório raiz = esta pasta).

Estrutura: `index.html`, `js/` (app e bibliotecas), `tess/` (leitor de texto), `hp/` (leitor de alta precisão). As pastas `tess` e `hp` precisam ir juntas.

Saídas (no padrão do Termo de Entrega):
- PDF: capa, relatório descritivo, QUADRO RESUMO DE INSTALAÇÃO DE PAPELEIRAS (histórico + locais novos, totais por ano), TABELA DE GEOREFERENCIAMENTO DAS PAPELEIRAS (numeração contínua), relatório fotográfico por local e página final.
- CSV do quadro resumo: SEQ;LOCAL;ANO;QUANTIDADE + totais.
- CSV da tabela: IDENTIFICACAO;LONGITUDE;LATITUDE;LOGRADOURO;BAIRRO;UTM_E;UTM_N;DATA;HORA;ENDERECO;FONTE_COORD;ARQUIVO_FOTO.
- Histórico fica no navegador; use "Exportar histórico" para levar a outro computador e "Somar este relatório ao histórico" ao fechar o mês.

QGIS: Camada → Adicionar camada → Texto delimitado · delimitador ";" · X = LONGITUDE, Y = LATITUDE · EPSG:4326 (ou UTM_E/UTM_N com EPSG:31982).

Coordenada de cada papeleira, nesta ordem: digitada no editor da foto → escrita no carimbo (lat/long ou UTM) → GPS gravado no arquivo da foto (EXIF; fotos do WhatsApp não têm).
