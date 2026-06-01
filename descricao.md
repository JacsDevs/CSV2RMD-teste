## ESTRUTURA DO SISTEMA MODULAR DE BANCO DE DADOS LEXICAL MULTIMÍDIA

### Visão Geral

O sistema é dividido em camadas bem definidas, onde cada arquivo tem uma **responsabilidade única e específica**, evitando duplicação de código e facilitando a manutenção. A comunicação entre os módulos acontece através do `GerenciadorDados`, que atua como orquestrador central.

```
modulo-dados/
├── config/
│   ├── config.json                 # Configurações centralizadas
│   └── templates/                  # Modelos visuais (HTML, Typst) customizáveis
├── src/
│   ├── nucleo/                     # Núcleo do sistema (obrigatório)
│   │   ├── sistemaArquivosVirtual.js
│   │   ├── carregadorCsv.js
│   │   ├── construtorBancoDados.js
│   │   └── gerenciadorDados.js
│   ├── utils/                      # Utilitários auxiliares
│   │   ├── configurador.js
│   │   └── carregadorPasta.js
│   ├── modulos/                    # Módulos adicionais (expansíveis)
│   │   ├── moduloExportacao.js
│   │   ├── exportadorBase.js
│   │   ├── exportadorHtmlCards.js
│   │   ├── exportadorHtmlLinear.js
│   │   ├── exportadorTypst.js
│   │   ├── exportadorZip.js
│   │   ├── compiladorPdf.js
│   │   ├── validadorDados.js
│   │   └── renderizador.js
│   └── principal.js                # Ponto de entrada
└── index-wizard.html               # Interface Principal (Wizard)
```

---

## 1. PASTA `config/` - CONFIGURAÇÕES CENTRALIZADAS

| Arquivo | Responsabilidade |
|---------|------------------|
| `config.json` | Único local para definir: nomes das colunas da planilha, extensões de mídia permitidas, tamanhos máximos, nomes de pastas (audio, foto, video), nomes de arquivos especiais (dicionario.csv, textos.json) |
| `templates/` | Pasta contendo os layouts de exportação separados em subpastas (`html-cards/`, `typst/`). Armazena os esqueletos de como o projeto será gerado (ex: `entrada.html`, `template.html`), isolando a interface gráfica da lógica do sistema. |

**Princípio:** Toda regra e layout que pode mudar entre projetos deve estar em `config/`, não no código JS.

---

## 2. PASTA `src/nucleo/` - NÚCLEO OBRIGATÓRIO

### 2.1 `sistemaArquivosVirtual.js`

**Responsabilidade:** Gerenciar todos os arquivos de mídia (áudio, imagem, vídeo) e textos estruturados em memória.

**O que faz:**
- Armazena arquivos em Maps (`audio`, `imagem`, `video`)
- Mantém metadados de cada arquivo (tamanho, data, tipo)
- Gerencia URLs temporárias (blob:) e thumbnails
- Controla templates (HTML, Typst)
- Fornece métodos para adicionar, remover, consultar mídias
- Converte arquivos para Base64 quando necessário
- Persiste metadados em localStorage (cache)

**Não faz:** 
- Não valida extensões (delega ao Configurador)
- Não carrega CSV
- Não constrói banco de dados

---

### 2.2 `carregadorCsv.js`

**Responsabilidade:** Ler e processar arquivos CSV usando a biblioteca Papa Parse.

**O que faz:**
- Inicializa o Papa Parse dinamicamente
- Processa arquivos CSV e retorna dados estruturados
- Processa strings CSV (útil para Electron)
- Extrai colunas e linhas do arquivo

**Não faz:**
- Não valida colunas obrigatórias (delega ao Configurador)
- Não normaliza os dados
- Não gerencia mídias

---

### 2.3 `construtorBancoDados.js`

**Responsabilidade:** Transformar os dados brutos do CSV em uma estrutura de banco de dados normalizada.

**O que faz:**
- Lê os dados do CSV
- Agrupa entradas por termo lexical
- Cria estruturas separadas: `entradas`, `variacoes`, `significados`, `exemplos`, `imagens`, `videos`
- Valida referências de mídia (verifica se existem no VFS)
- Gera URLs para mídias encontradas
- Mantém estatísticas de validação (mídias encontradas/faltantes)

**Não faz:**
- Não carrega CSV (delega ao CarregadorCsv)
- Não gerencia arquivos de mídia (delega ao VFS)
- Não contém regras de negócio sobre o que é uma entrada válida

---

### 2.4 `gerenciadorDados.js`

**Responsabilidade:** Orquestrar todos os componentes do sistema, fornecendo uma API unificada e simplificada.

**O que faz:**
- Inicializa e conecta todos os componentes
- Gerencia o estado global (dados brutos, banco construído)
- Fornece métodos de alto nível: `carregarPlanilha()`, `adicionarMidias()`, `buscarPorTermo()`
- Controla a construção automática do banco
- Gerencia callbacks de eventos (`aoCarregarCsv`, `aoConstruirBanco`, `aoErro`)
- Coordena a limpeza de recursos

**Não faz:**
- Não implementa lógica específica de cada componente
- Não processa CSV diretamente
- Não gerencia arquivos individualmente

---

## 3. PASTA `src/utils/` - UTILITÁRIOS AUXILIARES

### 3.1 `configurador.js`

**Responsabilidade:** Carregar e fornecer acesso às configurações do sistema.

**O que faz:**
- Lê o arquivo `config/config.json`
- Fornece métodos para acessar: colunas, extensões de mídia, pastas, tamanhos máximos
- Normaliza nomes de colunas baseado em mapeamento
- Permite mesclar configurações locais (sobrescrita)

**Não faz:**
- Não contém valores padrão (tudo vem do JSON)
- Não modifica as configurações (apenas lê)

---

### 3.2 `carregadorPasta.js`

**Responsabilidade:** Carregar uma estrutura completa de pasta (planilha + mídias + textos).

**O que faz:**
- Organiza arquivos por tipo (planilha, áudio, imagem, vídeo, textos)
- Detecta a pasta raiz selecionada
- Coordena o carregamento na ordem correta: primeiro planilha, depois mídias, depois textos
- Suporta configuração de nomes de pastas via config.json

**Não faz:**
- Não gerencia arquivos individualmente (delega ao VFS)
- Não processa CSV (delega ao Gerenciador)

---

## 4. PASTA `src/modulos/` - MÓDULOS EXPANSÍVEIS

### 4.1 `moduloExportacao.js`

**Responsabilidade:** Gerenciar todos os formatos de exportação.

**O que faz:**
- Importa e inicializa os exportadores específicos
- Fornece métodos unificados: `exportarHtmlCards()`, `exportarHtmlLinear()`, `exportarTypst()`
- Gerencia o download dos arquivos gerados

**Não faz:**
- Não implementa a lógica de cada formato (delega aos exportadores)

---

### 4.2 `exportadorBase.js`

**Responsabilidade:** Fornecer métodos e lógicas comuns herdados por todos os exportadores específicos.

**O que faz:**
- Resolve mídias referenciadas (linkadas ou convertidas em Base64 para embutir)
- Processa a extração padronizada de informações de uma entrada no dicionário (`extrairDadosEntrada()`)
- Gerencia o fatiamento de lotes de dados em scripts para injeção no HTML
- Aplica processamento inicial em templates

**Não faz:**
- Não escreve a marcação final de HTML ou Typst

---

### 4.3 `exportadorHtmlCards.js`

**Responsabilidade:** Gerar HTML no formato de cards, com carregamento em lotes.

**O que faz:**
- Carrega templates principal e de entrada
- Prepara os dados das entradas (simplificados para exibição)
- Resolve mídias (caminho ou Base64)
- Divide os dados em lotes de 30 entradas
- Gera script com os lotes embutidos no HTML

**Não faz:**
- Não gerencia outros formatos
- Não processa CSV (usa o banco já construído)

---

### 4.4 `exportadorHtmlLinear.js`

**Responsabilidade:** Gerar HTML no formato de lista linear.

**O que faz:**
- Similar ao exportador de cards, mas com layout de lista
- Carrega templates específicos para formato linear

---

### 4.5 `exportadorTypst.js`

**Responsabilidade:** Gerar arquivo Typst para compilação de PDF.

**O que faz:**
- Carrega templates Typst
- Gera código Typst com os dados do banco
- Salva arquivo `.typ` para compilação posterior

---

### 4.6 `exportadorZip.js`

**Responsabilidade:** Empacotar todo o projeto atual em um único arquivo de distribuição.

**O que faz:**
- Utiliza o JSZip para agrupar dados e mídias
- Gera um arquivo compactado contendo: o dicionário original (`.csv`), o projeto (se houver) e preserva as árvores de diretórios das mídias (`audio/`, `foto/`, `video/`)

### 4.7 `compiladorPdf.js`

**Responsabilidade:** Compilar código Typst em PDF utilizando WebAssembly no navegador.

**O que faz:**
- Injeta fontes e dependências dentro da memória do compilador
- Resolve o roteamento virtual mapeando os arquivos do VFS para a estrutura da compilação (`/foto/...`)
- Executa a compilação offline do arquivo Typst, devolvendo o binário (Blob) final em PDF

---

### 4.8 `validadorDados.js`

**Responsabilidade:** Diagnosticar a saúde e consistência dos dados do banco carregado.

**O que faz:**
- Relata erros estruturais de preenchimento (ex: campos obrigatórios vazios ou falta de barras pipe equivalentes)
- Analisa a presença física das referências de mídias (cruza a planilha com o VFS e detecta mídias declaradas porém ausentes)
- Informa se há mídias "órfãs" (carregadas no sistema mas não referenciadas na planilha)
- Gera relatórios HTML com as estatísticas do diagnóstico

---

### 4.9 `renderizador.js`

**Responsabilidade:** Processador isolado de injeção de propriedades em templates estilo Mustache.

**O que faz:**
- Procura por condicionais, iteradores e variáveis (`{{#BLOCO}}` ou `{{CHAVE}}`)
- Substitui recursivamente as chaves pelo objeto de contexto passado 
- Limpa artefatos residuais e blocos vazios dos layouts de exportação

---

## 5. `src/principal.js` - PONTO DE ENTRADA

**Responsabilidade:** Inicializar o sistema e expor funcionalidades para uso.

**O que faz:**
- Cria instância do GerenciadorDados
- Expõe funções globalmente (para console e interface)
- Inicializa módulos adicionais (exportação)
- Conecta botões da interface às funções do sistema

## 6. `index-wizard.html` - INTERFACE PRINCIPAL

**Responsabilidade:** Controlar a jornada do usuário através do assistente (Wizard) de exportação passo a passo.

**O que faz:**
- Interface gráfica Premium interativa, com layout expansível
- Modais e popups customizados para pré-visualização HTML, Typst e PDF
- Pré-visualização inteligente (substituição de paths em RAM por Blob URLs para funcionar offline)
- Aciona métodos do VFS, Exportação e Compilação

**Não faz:**
- Não contém regras de conversão ou validação das mídias
- Não gerencia a estrutura dos dados
- Delega a lógica complexa de processamento para os módulos do sistema

---

## FLUXO DE DADOS ENTRE OS MÓDULOS

```
1. Usuário seleciona pasta
   ↓
2. CarregadorPasta organiza os arquivos
   ↓
3. GerenciadorDados.carregarPlanilha()
   ↓
4. CarregadorCsv.processarCSV() → dados brutos
   ↓
5. ConstrutorBancoDados.normalizarDados() → banco estruturado
   ↓
6. Usuário adiciona mídias via VFS
   ↓
7. Banco é reconstruído (agora com validação de mídias)
   ↓
8. Usuário exporta via ModuloExportacao
   ↓
9. Exportador gera HTML com lotes de dados
```

## PRINCÍPIOS DO SISTEMA

1. **Separação de responsabilidades** - Cada arquivo faz uma coisa e faz bem
2. **Injeção de dependência** - Componentes recebem o que precisam via construtor
3. **Configuração externa** - Regras ficam no config.json, não no código
4. **API unificada** - GerenciadorDados é a única interface que o usuário precisa conhecer
5. **Expansível** - Novos módulos podem ser adicionados sem modificar o núcleo
6. **Carregamento progressivo** - Dados são carregados em lotes para não travar o navegador
