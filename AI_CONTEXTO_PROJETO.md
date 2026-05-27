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

## 3. Nosso Objetivo Atual: Migração para Tauri
Decidimos transformar esse sistema puramente Web em uma **Aplicação Desktop Nativa** usando o **Tauri** (com Rust no Back-end e a exata mesma UI ES6 no Front-end).

**Por que Tauri?**
Para ter acesso direto ao sistema de arquivos local do usuário (File System). O usuário não precisará mais "fazer upload" da pasta no navegador toda hora. O Tauri vai ler os arquivos silenciosamente do disco rígido local e permitirá rodar o compilador do `typst` direto pelo console do Windows via IPC.

## 4. Seus Próximos Passos Imediatos (Próxima Sessão)
1. **Validar a Instalação do Rust:** Confirmar com o usuário se o `rustup` e o C++ Build Tools foram instalados e testar `cargo --version`.
2. **Iniciar o Projeto Tauri:** Rodar os comandos para inicializar o scaffolding do Tauri (`src-tauri`) na raiz do diretório atual.
3. **Configurar Tauri.conf.json:** Apontar o `frontendDist` para a raiz e dar as permissões de acesso ao disco (fs).
4. **Implementar IPCs Iniciais:** Alterar a mecânica do `ModuloExportacao` para salvar arquivos diretamente no disco via comandos Tauri no Desktop, mantendo a função de download normal para quando rodar via web.

> **Dica de Continuidade:** Verifique os artefatos `implementation_plan.md` e `task.md` gerados anteriormente para seguir à risca o roteiro da migração para o Tauri.

---
*Assinado: O seu "Eu" do passado.*
