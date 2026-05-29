# 🤖 INSTRUÇÕES PARA O AGENTE (AI HANDOFF)

**Bem-vindo de volta!** Se você (agente) está lendo isso, estamos continuando o desenvolvimento do projeto **CSV2DMLI (Dicionário Multimídia)**. Abaixo está o resumo completo do nosso progresso, da arquitetura e dos nossos próximos passos, para que você tenha todo o contexto instantaneamente.

---

## 1. Sobre o Projeto
Um sistema gerador de dicionários que aceita uma planilha CSV, mídias (áudio, vídeo, imagens) e configurações (JSON/TXT), gerando páginas HTML ou PDFs (via Typst). 
A ideia principal é que as saídas funcionem offline (embutindo as mídias em base64) em um único arquivo HTML quando necessário.

## 2. O que já foi feito (Estado Atual da Arte)
- **Refatoração para ES6 Modular:** O código que antes era um único e gigante `app.js` foi desmembrado.
  - `src/nucleo/gerenciadorDados.js`: Controlador central do estado.
  - `src/utils/carregadorPasta.js`: Lógica que lê os arquivos de uma pasta local e extrai TXTs e mídias.
  - `src/modulos/moduloExportacao.js`: Motor que compila o HTML e interage com os templates.
  - `index-wizard.html`: Controlador de Interface principal da ferramenta.
- **Retrocompatibilidade:** O sistema atual lê perfeitamente os arquivos de projeto antigos legados (`configuracao.txt`, `intro_html.txt`, `referencia.txt`) quando fazemos o upload de uma pasta.
- **Design System Premium:** Foi escrito um `static/css/style.css` do zero com estilo Dark/Light, glassmorphism, modais customizados flutuantes e animações.

## 3. O que já foi feito (Tauri V2 & Arquitetura de Projetos)
A migração para **Tauri V2** foi concluída e novas mecânicas nativas foram implementadas!
- **Integração com File System Nativ:** Implementamos o `plugin:fs|write_file` nativo. Foi utilizado o recurso **Raw Byte IPC** do Tauri V2 (passando array de bytes diretamente no payload e o caminho no header `Tauri-Fs-Path`) para evitar travamentos da V8 do Javascript ao lidar com exportações de arquivos gigantescos.
- **Diálogos de Sistema:** Uso perfeito do `plugin:dialog|save` para as janelas nativas de Salvar do Windows.
- **Compilação PDF via WASM:** Ajustes críticos nas rotas dos assets (usando paths absolutos `/assets/typst/...`) para garantir o carregamento correto do módulo Typst WebAssembly (`typst_wrapper.js`) embarcado na Webview.
- **Fim da Persistência Forçada e Início dos "Projetos em Lote":**
  - Desativamos as gravações silenciosas no `IndexedDB` para que o aplicativo inicie limpo e consuma zero cache local do PC.
  - Injetamos o `JSZip` para criar o sistema de projetos. Agora você baixa a edição atual num `Projeto.zip` (com o CSV alterado + todas as fotos/vídeos).
  - Adicionado suporte a "Arrastar e Soltar" de arquivos ZIP no passo 1 do Wizard para importar e reabrir as sessões fechadas anteriormente de forma instantânea.
- **Exportação CSV Avulsa:** Também permitimos que o usuário salve especificamente apenas a sua planilha de textos (`.csv`) caso não queira empacotar os arquivos inteiros de áudio.

## 4. Seus Próximos Passos (Próxima Sessão)
1. **Otimização e Interface UI:** Fique de olho em eventuais micro-bugs com os modals do Design System (loaders, popups de sucesso e animações) agora que muitas coisas rodam paralelamente.
2. **Gerenciamento de Erros:** Revisar se existe algum gargalo ao carregar dezenas de mídias de uma vez ou se o JSZip tem algum estouro de memória dependendo do tamanho das imagens do usuário.
3. **Novas Funcionalidades (Opcional):** Ajudar o usuário com migrações de "Exportar JSON" ou personalização profunda de Fontes dentro do Typst/Wasm se ele solicitar.

> **Dica de Continuidade:** Consulte o `transcript` das conversas anteriores e o arquivo `walkthrough.md` caso queira entender passo a passo o que aconteceu nas implementações recentes do ZIP e do Tauri.

---
*Assinado: O seu "Eu" do passado.*
